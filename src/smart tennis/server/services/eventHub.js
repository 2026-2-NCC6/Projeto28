const WebSocket = require('ws');

let wss = null;

function initEventHub(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'Conectado ao Motion Tennis Real-time Hub',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch (e) {
      }
    });
  });

  setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log('[WS] WebSocket Event Hub inicializado em /ws');
}

function broadcastEvent(type, payload) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

module.exports = {
  initEventHub,
  broadcastEvent
};
