# ilp-node
Testnet connector, see https://github.com/interledger/interledger/wiki/Interledger-over-CLP

In one screen:
```sh
$ npm install
$ npm start

> ilp-node@3.0.0 start /Users/michiel/gh/michielbdejong/ilp-node
> node src/server.js

Listening on ws://localhost:8000/
```

In another:
```js
$ node scripts/flood.js
100000 transfers took 40486ms, that is 2469.9896260435708 req/s.
```
