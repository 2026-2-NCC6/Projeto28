import { isWebDemoMode } from './appEnvironment';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (isWebDemoMode()) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('STATUS', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type) {
            this.emit(data.type, data.payload || data);
          }
        } catch (e) {
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('STATUS', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach((cb) => cb({ event, data }));
    }
  }
}

export const wsClient = new WebSocketClient();
