const express = require('express');
const router = express.Router();
const { get, DB_PATH } = require('../database/db');
const fs = require('fs');
const os = require('os');

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }

  addresses.sort((a, b) => {
    const isWiFiA = /wi-?fi|wlan|sem fio/i.test(a.interface);
    const isWiFiB = /wi-?fi|wlan|sem fio/i.test(b.interface);
    if (isWiFiA && !isWiFiB) return -1;
    if (!isWiFiA && isWiFiB) return 1;

    const isEthA = /ethernet|eth/i.test(a.interface);
    const isEthB = /ethernet|eth/i.test(b.interface);
    if (isEthA && !isEthB) return -1;
    if (!isEthA && isEthB) return 1;

    const isPrivate192A = a.address.startsWith('192.168.');
    const isPrivate192B = b.address.startsWith('192.168.');
    if (isPrivate192A && !isPrivate192B) return -1;
    if (!isPrivate192A && isPrivate192B) return 1;

    return 0;
  });

  return addresses;
}

router.get('/', async (req, res) => {
  let dbStatus = 'error';
  try {
    const test = await get('SELECT 1 as ok');
    if (test && test.ok === 1) dbStatus = 'online';
  } catch (err) {
    dbStatus = 'offline';
  }

  const dbExists = fs.existsSync(DB_PATH);
  const port = process.env.PORT || 3000;
  const localIps = getLocalIpAddresses();
  const primaryIp = localIps.length > 0 ? localIps[0].address : '127.0.0.1';
  const lanUrl = `http://${primaryIp}:${port}`;
  const lanAddresses = localIps.map(ip => `http://${ip.address}:${port}`);

  res.json({
    status: 'online',
    product: 'MOTION TENNIS',
    version: '1.0.0',
    server: {
      status: 'online',
      name: 'Motion Tennis Server (Notebook)',
      host: '127.0.0.1',
      port: Number(port),
      uptimeSeconds: Math.round(process.uptime()),
      primaryIp,
      lanUrl,
      lanAddresses
    },
    database: {
      type: 'SQLite3',
      status: dbStatus,
      file: DB_PATH,
      exists: dbExists
    },
    sensors: {
      status: 'simulation',
      label: 'Modo simulação ativo',
      hardwareReady: true
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
