module.exports = {
  clp: {
    name: 'd081ae242ef0a3905ef328d5e214c142647b145933d0b1d36665f7b6cf721c4a',
    initialBalancePerSlave: 10000,
    upstreams: [ {
      url: 'ws://localhost:8000',
      peerName: 'ab833ece33938b2327b0d7ab78a28a39c498c9915e8ab05026d5400f0fa2da34',
      token: '978622465b1ffe911c76487c9ce11b3d3428bfcdcc5f083e006071547be91dec'
    } ]
  },
  eth: {
    secret: 'xidaequeequuu4xah8Ohnoo1Aesumiech6tiay1h',
    address: '0x8b3fbd781096b51e68448c6e5b53b240f663199f',
    prefix: 'test.crypto.eth.rinkeby.'
  },
  xrp: {
    secret: 'snWRByL1KRSSprArJJvxDaiJfujLC',
    address: 'rB1vPd6fnPZQUHmnxexfzXsUPdKKjfTQxQ',
    connector: 'rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs',
    server: 'wss://s.altnet.rippletest.net:51233',
    prefix: 'test.crypto.xrp.'
  }
}