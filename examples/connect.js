#!/usr/bin/env node
/* eslint-disable no-console */

const wifi = require('../index');

function main() {
  wifi.init()
    .then(() => wifi.connectToAccessPoint(
      'blue2.4ghz',
      '0000000000',
      ['8.8.8.8', '8.8.4.4'], // DNS is an optional argument
    ))
    .then(console.log)
    .catch(console.error)
    .then(wifi.fini);
}

if (require.main === module) {
  main();
}
