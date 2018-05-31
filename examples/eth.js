#!/usr/bin/env node
/* eslint-disable no-console */

const wifi = require('../index');

function main() {
  wifi.init()
    .then(wifi.listEthernetConnections)
    .get(0)
    .then((connection) => {
        let settings = {
            'ipv4': {
                'dns': [ipToInt('8.8.4.4')],
                'ignore-auto-dns': true
            },
        };
        connection.settings = {...connection.settings, settings};
        return wifi.updateConnection(connection.settings.connection.uuid, connection.settings);
    })
    .then(console.log)
    .catch(console.error)
    .then(wifi.fini);
}

function ipToInt(ip) {
  return ip.split('.')
    .map((octet, index) => parseInt(octet, 10) * (256 ** index))
    .reduce((prev, curr) => prev + curr);
}

if (require.main === module) {
  main();
}
