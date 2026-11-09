import { Capacitor } from '@capacitor/core';

const SERVER_URL_KEY = 'smart_tennis_server_url';
const DEFAULT_PORT = 3000;

export function isNativeMobile() {
  return Capacitor.isNativePlatform();
}

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  if (isNativeMobile()) return true;

  const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
  const isMobileUa = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  if (isMobileUa) return true;

  if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) {
      return true;
    }
  }

  return false;
}

export function validateServerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'O endereço não pode estar vazio.' };
  }

  let cleaned = rawUrl.trim().replace(/\/+$/, '');
  if (!cleaned) {
    return { valid: false, error: 'O endereço não pode estar vazio.' };
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned)) {
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      return { valid: false, error: 'Protocolo inválido. Utilize http:// ou https://.' };
    }
  } else {
    cleaned = `http://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Protocolo inválido. Utilize http:// ou https://.' };
    }

    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false, error: 'Nome de host ou endereço IP ausente.' };
    }

    if (isNativeMobile() && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return {
        valid: false,
        error: "No celular, 'localhost' ou '127.0.0.1' aponta para o próprio telefone. Use o IP local do notebook (ex: http://192.168.0.27:3000)."
      };
    }

    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
      return { valid: false, error: 'Endereço inválido. Informe um IP local válido (ex: http://192.168.0.27:3000).' };
    }

    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        return { valid: false, error: 'Porta inválida (deve estar entre 1 e 65535).' };
      }
    } else if (!cleaned.includes(':') || (cleaned.split(':').length === 2 && cleaned.startsWith('http'))) {
      if (!parsed.hostname.includes('.com') && !parsed.hostname.includes('.org') && !parsed.hostname.includes('.net')) {
        parsed.port = DEFAULT_PORT.toString();
        cleaned = parsed.origin;
      }
    }

    return { valid: true, normalizedUrl: cleaned };
  } catch (err) {
    return { valid: false, error: 'Formato de endereço inválido. Exemplo: http://192.168.0.27:3000' };
  }
}

export function isValidQrCodeContent(qrText) {
  if (!qrText || typeof qrText !== 'string') {
    return { valid: false, error: 'QR Code vazio ou não reconhecido.' };
  }
  let trimmed = qrText.trim();

  if (trimmed.includes('Bearer ') || trimmed.includes('"token"') || trimmed.includes('password=')) {
    return { valid: false, error: 'QR Code contém dados não permitidos. Escaneie apenas o QR Code de conexão do servidor.' };
  }

  if (trimmed.startsWith('motiontennis://')) {
    try {
      const parsedUrl = new URL(trimmed);
      const serverParam = parsedUrl.searchParams.get('server') || parsedUrl.searchParams.get('url');
      if (serverParam) {
        trimmed = decodeURIComponent(serverParam);
      }
    } catch (e) {
    }
  }

  return validateServerUrl(trimmed);
}

export function getSavedServerUrl() {
  const saved = localStorage.getItem(SERVER_URL_KEY);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }

  if (!isNativeMobile()) {
    return '';
  }

  return '';
}

export function saveServerUrl(url) {
  const validation = validateServerUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const cleaned = validation.normalizedUrl;
  localStorage.setItem(SERVER_URL_KEY, cleaned);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smart_tennis_server_changed', { detail: cleaned }));
  }

  return cleaned;
}

export function clearSavedServerUrl() {
  localStorage.removeItem(SERVER_URL_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smart_tennis_server_changed', { detail: '' }));
  }
}

export function getApiBaseUrl() {
  const server = getSavedServerUrl();
  if (server) {
    return `${server}/api`;
  }
  if (isNativeMobile()) {
    return '';
  }
  return '/api';
}

export function getWebSocketBaseUrl() {
  const server = getSavedServerUrl();
  if (server) {
    const wsProto = server.startsWith('https') ? 'wss:' : 'ws:';
    const host = server.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}/ws`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://localhost:3000/ws';
}

export async function testServerConnection(customUrl) {
  const targetServer = customUrl !== undefined ? (customUrl || '').trim().replace(/\/+$/, '') : getSavedServerUrl();
  
  if (!targetServer && isNativeMobile()) {
    return {
      success: false,
      error: 'Nenhum endereço de servidor configurado no aplicativo mobile.',
      serverUrl: ''
    };
  }

  const testUrl = targetServer ? `${targetServer}/api/status` : '/api/status';

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      const text = await response.text().catch(() => '');
      if (text.includes('<!doctype') || text.includes('<html') || text.trim().startsWith('<')) {
        return {
          success: false,
          error: 'O endereço respondeu com uma página web (HTML), não com a API do Motion Tennis. Verifique o IP e a porta (ex: http://192.168.0.27:3000).',
          serverUrl: targetServer
        };
      }
      return {
        success: false,
        error: `O servidor não respondeu em formato JSON (Content-Type: ${contentType || 'desconhecido'}).`,
        serverUrl: targetServer
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Servidor respondeu com código HTTP ${response.status}`,
        serverUrl: targetServer
      };
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (data.product !== 'MOTION TENNIS' && !data.server) {
      return {
        success: false,
        error: 'O endereço respondeu, mas não é um servidor Motion Tennis oficial.',
        serverUrl: targetServer
      };
    }

    return {
      success: true,
      latency,
      serverName: data.server?.name || data.product || 'Motion Tennis Server',
      serverUrl: targetServer || 'Servidor Local (Notebook)',
      data
    };
  } catch (err) {
    clearTimeout(timeoutId);
    let userFriendlyMessage = 'Não foi possível conectar ao notebook.';
    if (err.name === 'AbortError') {
      userFriendlyMessage = 'Tempo limite esgotado (timeout de 4s). Verifique se o notebook está na mesma rede Wi-Fi.';
    } else if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('network'))) {
      userFriendlyMessage = 'Falha de rede. Certifique-se de que o celular está no mesmo Wi-Fi do notebook e que a porta 3000 está liberada no firewall.';
    } else if (err.message) {
      userFriendlyMessage = err.message;
    }

    return {
      success: false,
      error: userFriendlyMessage,
      serverUrl: targetServer
    };
  }
}
