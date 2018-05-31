const Promise = require('bluebird');
const DBus = require('dbus');
const Bus = require('dbus/lib/bus');
const Interface = require('dbus/lib/interface');

const CONNECT_TIMEOUT = 20;

const NM_SERVICE = 'org.freedesktop.NetworkManager';

const NM_SERVICE_PATH = '/org/freedesktop/NetworkManager';
const NM_SETTINGS_PATH = '/org/freedesktop/NetworkManager/Settings';

const NM_SERVICE_INTERFACE = 'org.freedesktop.NetworkManager';
const NM_SETTINGS_INTERFACE = 'org.freedesktop.NetworkManager.Settings';
const NM_CONNECTION_INTERFACE = 'org.freedesktop.NetworkManager.Settings.Connection';
const NM_ACTIVE_INTERFACE = 'org.freedesktop.NetworkManager.Connection.Active';
const NM_DEVICE_INTERFACE = 'org.freedesktop.NetworkManager.Device';
const NM_WIRELESS_INTERFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const NM_ACCESS_POINT_INTERFACE = 'org.freedesktop.NetworkManager.AccessPoint';

const NM_DEVICE_TYPE_WIFI = 2;

const NM_ACTIVE_CONNECTION_STATE_ACTIVATED = 2;
const NM_ACTIVE_CONNECTION_STATE_DEACTIVATED = 4;

Promise.promisifyAll(Bus.prototype);

const oldInit = Interface.prototype.init;

Interface.prototype.init = function init(...args) {
  oldInit.apply(this, args);

  Promise.promisifyAll(this);
};

let BUS;
let DEVICE_PATH;

function NotActivated() {
  this.name = 'NotActivated';
  this.message = 'Connection not activated';
}
NotActivated.prototype = Error.prototype;

function NoWiFiDevice() {
  this.name = 'NoWiFiDevice';
  this.message = 'Could not find WiFi device';
}
NoWiFiDevice.prototype = Error.prototype;

function NoAccessPoint() {
  this.name = 'NoAccessPoint';
  this.message = 'Access point not found';
}
NoAccessPoint.prototype = Error.prototype;


function getServiceI() {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      NM_SERVICE_PATH,
      NM_SERVICE_INTERFACE,
    );
}

function getSettingsI() {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      NM_SETTINGS_PATH,
      NM_SETTINGS_INTERFACE,
    );
}

function getDeviceI(devicePath) {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      devicePath,
      NM_DEVICE_INTERFACE,
    );
}

function getAccessPointI(apPath) {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      apPath,
      NM_ACCESS_POINT_INTERFACE,
    );
}

function getWiFiDeviceI() {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      DEVICE_PATH,
      NM_WIRELESS_INTERFACE,
    );
}

function getActiveI(settingsPath) {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      settingsPath,
      NM_ACTIVE_INTERFACE,
    );
}

function getConnectionI(settingsPath) {
  return BUS
    .getInterfaceAsync(
      NM_SERVICE,
      settingsPath,
      NM_CONNECTION_INTERFACE,
    );
}

function listConnections() {
  return getSettingsI()
    .call('ListConnectionsAsync');
}

function getConnectionByUuid(uuid) {
  return getSettingsI()
    .call('GetConnectionByUuidAsync', uuid);
}

function getConnectionSettings(settingsPath) {
  return getConnectionI(settingsPath)
    .call('GetSettingsAsync');
}

function updateConnectionSettings(settingsPath, settings) {
  return getConnectionI(settingsPath)
    .call('UpdateAsync', settings);
}

function getDevicePaths() {
  return getServiceI()
    .call('GetDevicesAsync');
}

function isWiFiDevice(devicePath) {
  return getDeviceI(devicePath)
    .call('getPropertyAsync', 'DeviceType')
    .then(deviceType => deviceType === NM_DEVICE_TYPE_WIFI);
}

function getFirstWifiDevice(devicePaths) {
  if (devicePaths.length === 0) {
    return Promise.reject(new NoWiFiDevice());
  }
  return Promise.resolve(devicePaths[0]);
}

function init() {
  BUS = DBus.getBus('system');

  return getDevicePaths()
    .filter(isWiFiDevice)
    .then(getFirstWifiDevice)
    .then((devicePath) => { DEVICE_PATH = devicePath; });
}

function fini() {
  DEVICE_PATH = undefined;

  BUS.disconnect();
  BUS = undefined;
}

function getAccessPointPaths() {
  return getWiFiDeviceI()
    .call('getPropertyAsync', 'AccessPoints');
}

function ssidAsString(ssid) {
  return Buffer.from(ssid).toString();
}

function getAccessPointSsid(apPath) {
  return getAccessPointI(apPath)
    .call('getPropertyAsync', 'Ssid')
    .then(ssidAsString);
}

function listAccessPoints() {
  return getAccessPointPaths()
    .map(getAccessPointSsid);
}

function ssidFromString(ssid) {
  return [...Buffer.from(ssid)];
}

function ipToInt(ip) {
  return ip.split('.')
    .map((octet, index) => parseInt(octet, 10) * (256 ** index))
    .reduce((prev, curr) => prev + curr);
}

function buildConnectionSettings(ssid, passphrase, dns) {
  const settings = {
    '802-11-wireless': {
      ssid: ssidFromString(ssid),
    },
    connection: {
      id: ssid,
      type: '802-11-wireless',
    },
    '802-11-wireless-security': {
      'auth-alg': 'open',
      'key-mgmt': 'wpa-psk',
      psk: passphrase,
    },
  };

  if (dns !== undefined) {
    settings.ipv4 = {
      dns: dns.map(ipToInt),
      'ignore-auto-dns': true,
      method: 'auto',
    };
  }

  return settings;
}

function findAccessPointPathBySsid(ssid) {
  return getAccessPointPaths()
    .bind({})
    .then((apPaths) => {
      this.apPaths = apPaths;
      return Promise.map(apPaths, getAccessPointSsid);
    })
    .then((ssids) => {
      for (let i = 0; i < ssids.length; i += 1) {
        if (ssids[i] === ssid) {
          return Promise.resolve(this.apPaths[i]);
        }
      }
      return Promise.reject(new NoAccessPoint());
    })
    .bind();
}

function getActiveConnectionState(activePath) {
  return getActiveI(activePath)
    .call('getPropertyAsync', 'State');
}

function getActiveConnectionPath(activePath) {
  return getActiveI(activePath)
    .call('getPropertyAsync', 'Connection');
}

function getActiveConnections() {
  return getServiceI()
    .call('getPropertyAsync', 'ActiveConnections');
}

function getConnectionActivePath(settingsPath) {
  return getActiveConnections()
    .filter(activePath => getActiveConnectionPath(activePath)
      .then(path => path === settingsPath))
    .get(0)
    .then((activePath) => {
      if (activePath === undefined) {
        return Promise.reject(new NotActivated());
      }
      return Promise.resolve(activePath);
    });
}

function waitAgain(settingsPath, retries) {
  return Promise.delay(1000)
    .then(() => waitActivateConnection(settingsPath, retries + 1));
}

function waitActivateConnection(settingsPath, retriesPassed) {
  let retries = retriesPassed;

  if (retries === undefined) {
    retries = 0;
  } else if (retries === CONNECT_TIMEOUT) {
    return Promise.reject(new NotActivated());
  }

  return getConnectionActivePath(settingsPath)
    .then(getActiveConnectionState)
    .then((state) => {
      if (state === NM_ACTIVE_CONNECTION_STATE_ACTIVATED) {
        return Promise.resolve('Connection activated');
      }
      if (state === NM_ACTIVE_CONNECTION_STATE_DEACTIVATED) {
        return Promise.reject(new NotActivated());
      }
      return waitAgain(settingsPath, retries + 1);
    })
    .catch((err) => {
      if (err instanceof NotActivated) {
        return Promise.reject(err);
      }
      return waitAgain(settingsPath, retries + 1);
  });
}

function deleteConnection(settingsPath) {
  return getConnectionI(settingsPath)
    .call('DeleteAsync');
}

function handleActivationError(err, settingsPath) {
  if (err instanceof NotActivated) {
    return deleteConnection(settingsPath)
      .finally(() => Promise.reject(err));
  }
  return Promise.reject(err);
}

function connectToAccessPoint(ssid, passphrase, dns) {
  const settings = buildConnectionSettings(ssid, passphrase, dns);

  return findAccessPointPathBySsid(ssid)
    .bind({})
    .then((apPath) => { this.apPath = apPath; })
    .then(getServiceI)
    .then(iface => iface.AddAndActivateConnectionAsync(settings, DEVICE_PATH, this.apPath))
    .get(0)
    .tap((settingsPath) => { this.settingsPath = settingsPath; })
    .then(waitActivateConnection)
    .catch(err => handleActivationError(err, this.settingsPath))
    .bind();
}

function listEthernetConnections() {
  return listConnections()
    .map(connectionObjectFromPath)
    .map(addConnectionSettings)
    .filter(isEthernetConnection)
    .then(addConnectionsState);
}

function connectionObjectFromPath(settingsPath) {
  return {'settingsPath': settingsPath};
}

function addConnectionSettings(connection) {
  return getConnectionSettings(connection.settingsPath)
    .then((settings) => { connection.settings = settings; return connection; });
}

function isEthernetConnection(connection) {
  return connection.settings.connection.type === '802-3-ethernet';
}

function addConnectionsState(connections) {
  return getActiveConnections()
    .map(getActiveConnectionPath)
    .then((paths) => {
      for (let i = 0; i < connections.length; i += 1) {
        connections[i].active = paths.includes(connections[i].settingsPath);
      }
      return connections;
    });
}

function updateConnection(uuid, settings) {
  console.log(settings);
  return getConnectionByUuid(uuid)
    .then((settingsPath) => updateConnectionSettings(settingsPath, settings));
}

exports.init = init;

exports.fini = fini;

exports.listAccessPoints = listAccessPoints;

exports.connectToAccessPoint = connectToAccessPoint;

exports.listEthernetConnections = listEthernetConnections;

exports.updateConnection = updateConnection;
