#!/usr/bin/env node
/* eslint-disable no-console */

const wifi = require('../index');

function main() {
  wifi.init()
    .then(wifi.listAccessPoints)
    .then(console.log)
    .catch(console.error)
    .then(wifi.fini);
}

if (require.main === module) {
  main();
}
