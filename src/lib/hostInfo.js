const fetch = require('node-fetch')

function rollingAvg(existing, measured) {
  if (typeof existing === 'undefined') {
    return measured
  }
  return (existing * 99 + measured) / 100
}

module.exports = async function getHostInfo(hostname, /* by ref */ obj) {
  try {
    const webFingerUri = `https://${hostname}/.well-known/webfinger?resource=https://${hostname}`
    // request
    const startTime = new Date().getTime()
    const response = await fetch(webFingerUri)
    const delay = new Date().getTime() - startTime

    // parsing
    const data = await response.json()
    console.log('data: ', data)
    // { subject: 'https://red.ilpdemo.org',
    //   properties:
    //    { 'https://interledger.org/rel/publicKey': '0ZwLzlPLd2UWJPwYSz6RhOh3S-N-cdAhVqG62iqb6xI',
    //      'https://interledger.org/rel/protocolVersion': 'Compatible: ilp-kit v2.0.0-alpha' },
    //   links:
    //    [ { rel: 'https://interledger.org/rel/ledgerUri',
    //        href: 'https://red.ilpdemo.org/ledger' },
    //      { rel: 'https://interledger.org/rel/peersRpcUri',
    //        href: 'https://red.ilpdemo.org/api/peers/rpc' },
    //      { rel: 'https://interledger.org/rel/settlementMethods',
    //        href: 'https://red.ilpdemo.org/api/settlement_methods' } ] }
    obj.hostname = hostname
    obj.version = data.properties['https://interledger.org/rel/protocolVersion']
    obj.health = rollingAvg(obj.health, 1)
    obj.latency = rollingAvg(obj.latency, delay)

    for (let link of data.links) {
      switch (link.rel) {
      case 'https://interledger.org/rel/ledgerUri':
        obj.ledgerUri = link.href
        break
      case 'https://interledger.org/rel/peersRpcUri':
        obj.peersRpcUri = link.href
        break
      case 'https://interledger.org/rel/settlementMethods':
        obj.settlementMethodsUri = link.href
        break
      }
    }
  } catch (error) {
    console.log('error: ', error)
    obj.health = rollingAvg(obj.health, 0)
    obj.lastDownTime = new Date().getTime()
  }
  return obj
}
//updateHostInfo('red.ilpdemo.org', {
//      "hostname": "red.ilpdemo.org",
//      "owner": "",
//      "prefix": "us.usd.red.",
//      "version": "<span style=\"color:green\">Compatible: ilp-kit v1.1.0</span>",
//      "health": 1,
//      "settlements": "<span style=\"color:green\"></span>",
//      "ping": 0,
//      "protocolVersion": "Compatible: ilp-kit v2.0.0-alpha",
//      "publicKey": "0ZwLzlPLd2UWJPwYSz6RhOh3S-N-cdAhVqG62iqb6xI",
//      "ledgerUri": "https://red.ilpdemo.org/ledger",
//      "peersRpcUri": "https://red.ilpdemo.org/api/peers/rpc",
//      "settlementMethods": "https://red.ilpdemo.org/api/settlement_methods"
//    })
