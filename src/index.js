const WebSocket = require('ws')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow'),
  eth: require('ilp-plugin-ethereum'),
  dummy: require('../test/helpers/dummyPlugin')
}
const VirtualPeer = require('./virtual-peer')

function IlpNode (config) {
  this.upstreams = []
  this.plugins = []
  this.vouchableAddresses = []
  this.vouchablePeers = []
  this.fulfillments = {}
  this.quoter = new Quoter()
  this.peers = {}
  this.defaultPeers = {}
  this.config = config
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (let name in this.config) {
    if (name === 'clp') {
      continue
    }
    console.log('plugin', config, name)
    const plugin = new Plugin[name](this.config[name])
    this.plugins.push(plugin)
                           // function VirtualPeer (plugin, forwardCb, connectorAddress) {
    this.peers['ledger_' + name] = new VirtualPeer(plugin, this.handleTransfer.bind(this), config.connector)
    // auto-vouch ledger VirtualPeer -> all existing CLP peers
    this.addVouchableAddress(plugin.getAccount())
    // and add the plugin ledger as a destination in to the routing table:
    this.quoter.setCurve(plugin.getInfo().prefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]), 'ledger_' + name)
  }
}

IlpNode.prototype = {
  addVouchablePeer(peerName) {
    this.vouchablePeers.push(peerName)
    return Promise.all(this.vouchableAddresses.map(address => {
      console.log('new vouchable peer', peerName, address)
      return this.peers[peerName].vouchBothWays(address)
    }))
  },
  addVouchableAddress(address) {
    this.vouchableAddresses.push(address)
    return Promise.all(this.vouchablePeers.map(peerName => {
      console.log('new vouchable address', peerName, address)
      return this.peers[peerName].vouchBothWays(address)
    }))
  },
  addClpPeer(peerType, peerId, ws) {
    const peerName = peerType + '_' + peerId

    // FIXME: this is a hacky way to make `node scripts/flood.js 1 clp clp` work  
    this.defaultClpPeer = peerName

    const ledgerPrefix = 'peer.testing.' + this.config.clp.name + '.' + peerName + '.'
    console.log({ peerType, peerId })
                   // function Peer (ledgerPrefix, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
    this.peers[peerName] = new Peer(ledgerPrefix, peerName, this.config.clp.initialBalancePerPeer, ws, this.quoter, this.handleTransfer.bind(this), this.forwarder.forwardRoute.bind(this.forwarder), (address) => {
      this.vouchingMap[address] = peerName
      // console.log('vouched!', this.vouchingMap)
      return Promise.resolve()
    })
    // auto-vouch all existing ledger VirtualPeers -> CLP peer
    this.addVouchablePeer(peerName)
    // and add the CLP trustline as a destination in to the routing table:
    this.quoter.setCurve(ledgerPrefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]), peerName)
    return Promise.resolve()
  },

  connectPlugins() {
    let promises = []
    for (let i=0; i < this.plugins.length; i++) {
      promises.push(this.plugins[i].connect())
    }
    return Promise.all(promises)
  },

  maybeListen () {
    if (typeof this.config.clp.listen !== 'number') {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      this.wss = new WebSocket.Server({ port: this.config.clp.listen }, resolve)
    }).then(() => {
      this.wss.on('connection', (ws, httpReq) => {
        const parts = httpReq.url.split('/')
        const peerId = parts[1]
        // const peerToken = parts[2] // TODO: use this to authorize reconnections
        // console.log('assigned peerId!', peerId)
        this.addClpPeer('downstream', peerId, ws)
      })
    })
  },

  connectToUpstreams () {
    return Promise.all(this.config.clp.upstreams.map(upstreamConfig => {
      const peerName = upstreamConfig.url.replace(/(?!\w)./g, '')
      console.log({ url: upstreamConfig.url, peerName })
      return new Promise((resolve, reject) => {
        console.log('connecting to upstream WebSocket', upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, this.config.clp, upstreamConfig)
        const ws = new WebSocket(upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, {
          perMessageDeflate: false
        })
        ws.on('open', () => {
          // console.log('creating client peer')
              // functionp Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
          this.upstreams.push(ws)
          this.addClpPeer('upstream', peerName, ws).then(resolve, reject)
        })
      })
    }))
  },

  start() {
    return Promise.all([
      this.maybeListen().then(() => { console.log('maybeListen done', this.config) }),
      this.connectToUpstreams().then(() => { console.log('connectToUpstreams done', this.config) }),
      this.connectPlugins().then(() => { console.log('connectPlugins done', this.config) })
    ])
  },

  stop () {
    let promises = this.upstreams.map(ws => {
      return new Promise(resolve => {
        ws.on('close', () => {
          // console.log('close emitted!')
          resolve()
        })
        // console.log('closing client!')
        ws.close()
        // console.log('started closing client!')
      })
    })
    if (this.wss) {
      promises.push(new Promise(resolve => {
        return this.wss.close(resolve)
      }))
    }
    return Promise.all(promises)
  },

  knowFulfillment(condition, fulfillment) {
    this.fulfillments[condition.toString('hex')] = fulfillment
  },

  checkVouch(fromAddress, amount) {
    console.log('checkVouch', fromAddress, amount, this.vouchingMap)
    if (!this.vouchingMap[fromAddress]) {
      return false
    }
    console.log('vouching peer is', this.vouchingMap[fromAddress], Object.keys(this.peers))
    const balance = this.peers[this.vouchingMap[fromAddress]].clp.balance
    console.log('checking balance', balance, amount)
    return balance > amount
  },

  // actual receiver and connector functionality for incoming transfers:
  handleTransfer(transfer, paymentPacket) {
    // Technically, this is checking the vouch for the wrong
    // amount, but if the vouch checks out for the source amount,
    // then it's also good enough to cover onwardAmount
    if (transfer.from && !this.checkVouchCb(transfer.from, parseInt(transfer.amount))) {
      return Promise.reject(IlpPacket.serializeIlpError({
        code: 'L53',
        name: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        message: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        triggered_by: this.plugin.getAccount(),
        forwarded_by: [],
        triggered_at: new Date().getTime(),
        additional_info: {}
      }))
    }
    return Promise.resolve(this.fulfillments[transfer.executionCondition.toString('hex')] || this.forwarder.forward(transfer, paymentPacket))
  },

  getIlpAddress (ledger) {
    if (this.config[ledger].prefix + this.config[ledger].address) {
      // used in xrp and eth configs
      return Promise.resolve(this.config[ledger].prefix + this.config[ledger].address)
    } else {
      // used in clp config
      return this.peers[this.defaultClpPeer].getMyIlpAddress()
    }
  },

  getPeersList () {
    return Object.keys(this.peers)
  },

  getPeer (ledger) {
    console.log(this.defaultClpPeer, Object.keys(this.peers))
    if (ledger === 'clp') {
      // FIXME: this is a hacky way to make `node scripts/flood.js 1 clp clp` work  
      return this.peers[this.defaultClpPeer]
    }
    return this.peers['ledger_' + ledger]
  }
}

// methods accessed from outside:
// const ilpNode = new IlpNode(config)
// ilpNode.start()
// ilpNode.stop()

// ilpNode.knowFulfillment(condition, fulfillment)
// ilpNode.getIlpAddress(ledger)
// ilpNode.pay(peerName, destination, amount, condition
// ilpNode.getQuote(peerName, quoteRequest)
// ilpNode.broadcastRoutes(routes)

module.exports = IlpNode
