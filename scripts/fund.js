const crypto = require('crypto')

const sha256 = require('../src/sha256')
const IlpPacket = require('ilp-packet')
const IlpNode = require('../src/index')

const client = new IlpNode(require('../config/client1'))
const fulfillment = crypto.randomBytes(32)
const condition = sha256(fulfillment)
console.log(fulfillment, condition, fulfillment.length, condition.length)
client.start().then(() => {
  client.knowFulfillment(condition, fulfillment)
  return client.getIlpAddress('btp')
}).then(ilpBaseAddress => {
  const ipr = Buffer.concat([
    Buffer.from([ 2 ]), // version
    IlpPacket.serializeIlpPayment({
      amount: '10000',
      account: ilpBaseAddress + '.fund-me'
    }), // packet
    condition // condition
  ])
  console.log('Please open https://interfaucet.herokuapp.com/fund/' + ipr.toString('hex'))
})
