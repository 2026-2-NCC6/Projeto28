/**
 * appEnvironment.js
 * 
 * Gerencia a distinção arquitetural obrigatória entre:
 * 1. MODO DEMONSTRAÇÃO WEB (Vercel / Produção Pública)
 * 2. MODO ANDROID CLOUD (Capacitor APK / Dispositivo Móvel)
 * 3. MODO EQUIPAMENTO (Notebook físico da quadra / Local com SQLite)
 * 
 * DIRETRIZES DE SEGURANÇA:
 * - Em MODO DEMONSTRAÇÃO WEB e ANDROID CLOUD, qualquer persistência local em SQLite,
 *   Outbox de equipamento e chamadas a localhost:3000 são estritamente desabilitadas.
 * - O app Android nativo NUNCA cai automaticamente em modo 'equipment'.
 * - Configuração de build explícita (VITE_APP_MODE) com fallback seguro em runtime.
 */

export const APP_MODES = {
  WEB_DEMO: 'web_demo',
  EQUIPMENT: 'equipment',
  ANDROID_CLOUD: 'android_cloud'
};

export function getAppMode() {
  const envMode = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_MODE)
    || (typeof process !== 'undefined' && process.env?.VITE_APP_MODE)
    || '';
  if (envMode === APP_MODES.WEB_DEMO) return APP_MODES.WEB_DEMO;
  if (envMode === APP_MODES.ANDROID_CLOUD) return APP_MODES.ANDROID_CLOUD;
  if (envMode === APP_MODES.EQUIPMENT) return APP_MODES.EQUIPMENT;

  if (typeof window !== 'undefined') {
    if (window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android') {
      return APP_MODES.ANDROID_CLOUD;
    }
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '';
    if (host.endsWith('.vercel.app')) {
      return APP_MODES.WEB_DEMO;
    }
  }

  return APP_MODES.EQUIPMENT;
}

export function isWebDemoMode() {
  return getAppMode() === APP_MODES.WEB_DEMO;
}

export function isAndroidCloudMode() {
  return getAppMode() === APP_MODES.ANDROID_CLOUD;
}

export function isEquipmentMode() {
  return getAppMode() === APP_MODES.EQUIPMENT;
}

export function isCloudOnlyMode() {
  const mode = getAppMode();
  return mode === APP_MODES.WEB_DEMO || mode === APP_MODES.ANDROID_CLOUD;
}
