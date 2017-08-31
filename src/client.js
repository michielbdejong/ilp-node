const WebSocket = require('ws')
const crypto = require('crypto')

const Forwarder = require('./forwarder')
const Peer = require('./peer')
const VirtualPeer = require('./virtual-peer')
const Quoter = require('./quoter')

function Client () {
  this.name = crypto.randomBytes(16).toString('hex')
  this.token = crypto.randomBytes(16).toString('hex')
  this.fulfillments = {}
}

Client.prototype = {
  open (url) {
    return new Promise(resolve => {
      this.ws = new WebSocket(url + this.name + '/' + this.token, {
        perMessageDeflate: false
      })
      this.ws.on('open', () => {
        // console.log('ws open')
        this.quoter = new Quoter()
        this.peers = {}
        this.forwarder = new Forwarder(this.quoter, this.peers)
        // console.log('creating client peer')
        this.peer = new Peer('client-peer.', this.name, 1000000000, this.ws, this.quoter, this.forwarder, (condition) => {
          // console.log('client is fulfilling over CLP!', condition, this.fulfillments)
          return this.fulfillments[condition.toString('hex')]
        })
        resolve()
      })
    })
  },

  // See https://github.com/michielbdejong/ilp-node/issues/9
  receiveOnLedger(plugin) {
    function onIncomingPrepare (transfer, packet) {
      // console.log('client is fulfilling on-ledger!', transfer, transfer.executionCondition.toString('hex'), this.fulfillments)
      return Promise.resolve(this.fulfillments[transfer.executionCondition.toString('hex')])
    }

    function vouchChecker (fromWallet) {
      return true
    }

    this.virtualPeer = new VirtualPeer(plugin, onIncomingPrepare.bind(this), vouchChecker)
  },
  knowFulfillment(condition, fulfillment) {
    this.fulfillments[condition.toString('hex')] = fulfillment
  },
  close () {
    return new Promise(resolve => {
      this.ws.on('close', () => {
        // console.log('close emitted!')
        resolve()
      })
      // console.log('closing client!')
      this.ws.close()
      // console.log('started closing client!')
    })
  }
}

module.exports = Client
