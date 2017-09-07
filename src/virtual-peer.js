const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')

function VirtualPeer (plugin, forwardCb, connectorAddress) {
  this.plugin = plugin
  this.forwardCb = forwardCb
  this.connectorAddress = connectorAddress
  this.transfersSent = {}
  this.plugin.on('incoming_prepare', this.handleTransfer.bind(this))
  this.plugin.on('outgoing_fulfill', this.handleFulfill.bind(this))
  this.plugin.on('outgoing_reject', this.handleReject.bind(this))
}

VirtualPeer.prototype = {

  handleTransfer (transfer) {
    // console.log('handleTransfer!', Buffer.from(transfer.executionCondition, 'base64'))
    const promise = Promise.resolve(this.forwardCb({
      from: transfer.from,
      expiresAt: new Date(transfer.expiresAt),
      amount: parseInt(transfer.amount),
      executionCondition: Buffer.from(transfer.executionCondition, 'base64')
    }, Buffer.from(transfer.ilp, 'base64')))
    // console.log('forwarded, promise', promise)
    promise.then((fulfillment) => {
      // console.log('submitting fulfillment to ledger!', transfer.executionCondition, fulfillment)
      const fulfilled = this.plugin.fulfillCondition(transfer.id, fulfillment.toString('base64'))
      // console.log('fulfilled, promise', fulfilled)
      fulfilled.then(() => {
        // console.log('submitted that fulfillment to ledger!', transfer.executionCondition, fulfillment)
      }, err => {
        console.log('failed to submit that fulfillment to ledger!', transfer.executionCondition, fulfillment, err)
      })
    }, (err) => {
      console.log('could not forward, rejecting')
      if (err.message === 'vouch') {
        this.plugin.rejectIncomingTransfer(transfer.id, {
          code: 'L53',
          name: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
          message: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
          triggered_by: this.plugin.getAccount(),
          forwarded_by: [],
          triggered_at: new Date().getTime(),
          additional_info: {}
        })
      } else {
        this.plugin.rejectIncomingTransfer(transfer.id, IlpPacket.deserializeIlpError(err))
      }
    })
  },

  interledgerPayment (transfer, payment) {
    // console.log('sending ILP payment on on-ledger transfer')
    const paymentObj = IlpPacket.deserializeIlpPayment(payment)
    const transferId = uuid()
    const promise = new Promise((resolve, reject) => {
      this.transfersSent[transferId] = {
        resolve (result) {
          // console.log('transfer result in VirtualPeer', result)
          resolve(result)
        },
        reject (err) {
          // console.log('transfer err  in VirtualPeer', err, typeof err, Buffer.isBuffer(err))
          // console.log('calling reject', reject)
          reject(err)
        }
      }
    })

    let to = this.connectorAddress // default
    const ledger = this.plugin.getInfo().prefix
    if (paymentObj.account.startsWith(ledger)) { // skip the connector
      const parts = paymentObj.substring(ledger.length).split('.')
      to = ledger + parts[0]
    }
    const lpiTransfer = {
      id: transferId,
      from: this.plugin.getAccount(),
      to,
      ledger,
      amount: paymentObj.amount,
      ilp: payment.toString('base64'),
      noteToSelf: {},
      executionCondition: transfer.executionCondition.toString('base64'),
      expiresAt: transfer.expiresAt.toISOString(),
      custom: {}
    }
    if (paymentObj.account.startsWith(lpiTransfer.ledger)) {
      // console.log('last hop, to receiver instead of to connector')
      lpiTransfer.to = paymentObj.account
    }
    // console.log('VirtualPeer calls sendTransfer!', lpiTransfer)

    this.plugin.sendTransfer(lpiTransfer).catch(err => {
      console.log('sendTransfer failed', err)
      this.transfersSent[transferId].reject({
        code: 'L62',
        name: err.message
      })
      delete this.transfersSent[transfer.id]
    })
    return promise
  },

  handleFulfill (transfer, fulfillmentBase64) {
    // console.log('handling fulfill!', Buffer.from(transfer.executionCondition, 'base64'), Buffer.from(fulfillmentBase64, 'base64'))
    this.transfersSent[transfer.id].resolve(Buffer.from(fulfillmentBase64, 'base64'))
    delete this.transfersSent[transfer.id]
  },

  handleReject (transfer, rejectionReasonBase64) {
    console.log('handling reject!', Buffer.from(transfer.executionCondition, 'base64'), Buffer.from(rejectionReasonBase64, 'base64'))
    this.transfersSent[transfer.id].reject(Buffer.from(rejectionReasonBase64, 'base64'))
    delete this.transfersSent[transfer.id]
  }
}

module.exports = VirtualPeer
