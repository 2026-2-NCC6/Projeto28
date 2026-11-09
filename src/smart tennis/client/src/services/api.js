import { getApiBaseUrl, getSavedServerUrl, isNativeMobile } from './serverConfig.js';
import { getPlayerOfflineData } from './db.js';
import { isWebDemoMode, isCloudOnlyMode } from './appEnvironment.js';
import { cloudDataService } from './cloudDataService.js';

function getActiveCloudToken() {
  try {
    const raw = localStorage.getItem('mt_cloud_session');
    if (raw) {
      const session = JSON.parse(raw);
      if (session?.accessToken) return session.accessToken;
    }
  } catch (e) {}

  try {
    const token = localStorage.getItem('smart_tennis_token');
    if (token && token.startsWith('eyJ') && token.split('.').length === 3) {
      return token;
    }
  } catch (e) {}

  return null;
}

export function getAuthToken() {
  return localStorage.getItem('smart_tennis_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('smart_tennis_token', token);
  } else {
    localStorage.removeItem('smart_tennis_token');
  }
}

export function getGuestToken() {
  return localStorage.getItem('smart_tennis_guest_token');
}

export function setGuestToken(token) {
  if (token) {
    localStorage.setItem('smart_tennis_guest_token', token);
  } else {
    localStorage.removeItem('smart_tennis_guest_token');
  }
}

export function getCurrentStoredUserId() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payloadBase64 = token.split('.')[0];
    const decoded = JSON.parse(atob(payloadBase64));
    if (decoded?.type === 'guest') return null;
    return decoded?.id || null;
  } catch (e) {
    return null;
  }
}

export async function fetchJson(endpoint, options = {}) {
  const serverUrl = getSavedServerUrl();
  const baseUrl = getApiBaseUrl();

  if ((isNativeMobile() || isCloudOnlyMode()) && !serverUrl) {
    const err = new Error('Modo Cloud / Web: servidor Express local da quadra não conectado.');
    err.code = 'NO_LOCAL_SERVER';
    err.status = 0;
    throw err;
  }

  const url = `${baseUrl}${endpoint}`;
  const userToken = getAuthToken();
  const guestToken = getGuestToken();
  const activeToken = userToken || guestToken;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    const isNetworkError = err.name === 'TypeError' || (err.message && (err.message.includes('fetch') || err.message.includes('NetworkError')));
    const isGet = !options.method || options.method === 'GET';

    if (isNetworkError && isGet && userToken && !guestToken) {
      const userId = getCurrentStoredUserId();
      if (userId) {
        const offlineData = await getPlayerOfflineData(userId).catch(() => null);
        if (offlineData) {
          if (endpoint === '/player' && offlineData.profile) {
            return offlineData.profile;
          }
          if (endpoint.startsWith('/sessions') && offlineData.sessions) {
            return offlineData.sessions;
          }
          if (endpoint === '/skills/attributes' && offlineData.attributes) {
            return offlineData.attributes;
          }
          if (endpoint === '/achievements' && offlineData.achievements) {
            return offlineData.achievements;
          }
          if (endpoint === '/shots/hitmap' && offlineData.hitmap) {
            return offlineData.hitmap;
          }
        }
      }
    }

    const connErr = new Error(
      'Não foi possível comunicar com o servidor Motion Tennis. ' +
      'Verifique se o notebook está ligado na mesma rede Wi-Fi e se o IP configurado está correto.'
    );
    connErr.code = 'NETWORK_ERROR';
    connErr.status = 0;
    connErr.originalError = err;
    throw connErr;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const rawText = await response.text().catch(() => '');
    const isHtml = rawText.trim().startsWith('<') || rawText.includes('<!doctype') || rawText.includes('<html');

    if (isHtml) {
      const err = new Error(
        'O aplicativo recebeu uma página web (HTML) em vez de dados da API (JSON). ' +
        'Isso ocorre quando o endereço aponta para o dispositivo local ou a rota não existe no servidor. ' +
        'Verifique o IP e a porta nas opções de conexão.'
      );
      err.code = 'UNEXPECTED_HTML_RESPONSE';
      err.status = response.status;
      err.rawResponse = rawText.slice(0, 250);
      throw err;
    }

    const err = new Error(`Resposta inválida do servidor: formato esperado JSON, recebido ${contentType || 'desconhecido'}.`);
    err.code = 'INVALID_CONTENT_TYPE';
    err.status = response.status;
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    const err = new Error('Falha ao processar a resposta JSON do servidor.');
    err.code = 'JSON_PARSE_ERROR';
    err.status = response.status;
    throw err;
  }

  if (!response.ok) {
    const errMsg = data?.error || data?.message || `Erro HTTP ${response.status}`;
    const err = new Error(errMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  login: (credentials) => fetchJson('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => fetchJson('/auth/me'),
  logout: () => fetchJson('/auth/logout', { method: 'POST' }),
  startGuestSession: () => fetchJson('/auth/guest', { method: 'POST', body: JSON.stringify({}) }),
  getGuestMe: () => fetchJson('/auth/guest/me'),
  logoutGuest: () => fetchJson('/auth/guest/logout', { method: 'POST' }),

  getCloudConfig: () => fetchJson('/auth/cloud/config'),
  getCloudStatus: () => fetchJson('/auth/cloud/status'),
  linkCloudAccount: (data) => fetchJson('/auth/cloud/link', { method: 'POST', body: JSON.stringify(data) }),
  unlinkCloudAccount: (data) => fetchJson('/auth/cloud/unlink', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  authorizeEquipmentPairing: (accessToken) => fetchJson('/auth/cloud/authorize-pairing', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) }),
  checkEquipmentPairingStatus: (accessToken) => fetchJson('/auth/cloud/pairing-status', { method: 'POST', body: JSON.stringify({ access_token: accessToken }) }),
  loginWithSupabaseToken: (accessToken, options = {}) => fetchJson('/auth/cloud/login-with-token', {
    method: 'POST',
    body: JSON.stringify({
      access_token: accessToken,
      create_if_missing: options.create_if_missing !== undefined ? options.create_if_missing : true,
      name: options.name || undefined
    })
  }),

  getPlayer: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const overview = await cloudDataService.getCloudAthleteOverview({ accessToken: token });
          if (overview?.profile) {
            let displayName = overview.profile.display_name;
            let avatar = overview.profile.avatar;
            try {
              const raw = localStorage.getItem('mt_cloud_session');
              if (raw) {
                const session = JSON.parse(raw);
                if ((!displayName || displayName === 'Atleta') && (session?.user?.user_metadata?.name || session?.user?.name)) {
                  displayName = session.user.user_metadata?.name || session.user.name;
                }
                if (!avatar && session?.user?.avatar) {
                  avatar = session.user.avatar;
                }
              }
            } catch (_) {}

            return {
              id: overview.profile.user_id || null,
              name: displayName || 'Atleta',
              avatar: avatar || '🎾',
              level: overview.profile.level || 1,
              xp: overview.profile.xp || 0,
              xp_next: overview.profile.xp_next || 250,
              title: overview.profile.title || 'Iniciante',
              precision: Number(overview.profile.overall_accuracy) || 0,
              total_matches: overview.totalSessionsCount || 0,
              total_shots: overview.profile.total_shots || 0,
              total_hits: overview.profile.total_hits || 0,
              best_score: overview.bestScore || 0,
              isCloudOnly: true
            };
          }
        } catch (e) {
          console.warn('[API] Falha ao carregar perfil cloud:', e);
        }
      }
      let fallbackName = 'Atleta';
      let fallbackAvatar = '🎾';
      try {
        const raw = localStorage.getItem('mt_cloud_session');
        if (raw) {
          const session = JSON.parse(raw);
          if (session?.user?.user_metadata?.name || session?.user?.name) {
            fallbackName = session.user.user_metadata?.name || session.user.name;
          }
          if (session?.user?.avatar) {
            fallbackAvatar = session.user.avatar;
          }
        }
      } catch (_) {}

      return {
        id: null,
        name: fallbackName,
        avatar: fallbackAvatar,
        level: 1,
        xp: 0,
        xp_next: 250,
        title: 'Iniciante',
        precision: 0,
        total_matches: 0,
        total_shots: 0,
        total_hits: 0,
        best_score: 0,
        isCloudOnly: true
      };
    }
    return fetchJson('/player');
  },
  updatePlayer: async (data) => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const updated = await cloudDataService.updateCloudProfile({
            accessToken: token,
            name: data?.name,
            avatar: data?.avatar
          });
          try {
            const raw = localStorage.getItem('mt_cloud_session');
            if (raw) {
              const session = JSON.parse(raw);
              if (session.user) {
                if (!session.user.user_metadata) session.user.user_metadata = {};
                if (data.name) session.user.user_metadata.name = data.name;
                session.user.avatar = data.avatar;
                localStorage.setItem('mt_cloud_session', JSON.stringify(session));
              }
            }
          } catch (_) {}
          return {
            name: data?.name || updated?.display_name || 'Atleta',
            avatar: data?.avatar || updated?.avatar || '🎾'
          };
        } catch (cloudErr) {
          console.warn('[API] Erro ao atualizar perfil na nuvem:', cloudErr);
          throw new Error('Falha ao salvar perfil na nuvem Supabase: ' + (cloudErr.message || 'Erro de comunicação.'));
        }
      }
      return { name: data?.name || 'Atleta', avatar: data?.avatar || '🎾' };
    }
    return fetchJson('/player', { method: 'PUT', body: JSON.stringify(data) });
  },
  resetDemoData: () => fetchJson('/player/reset', { method: 'POST' }),
  clearData: () => fetchJson('/player/clear', { method: 'POST' }),

  getSensors: () => fetchJson('/sensors'),
  sendHardwareHit: (data) => {
    if (isWebDemoMode()) {
      return Promise.resolve({
        received_by_backend: false,
        is_simulation: true,
        message: 'Impacto em memória (Web Demo)'
      });
    }
    return fetchJson('/hardware/hit', { method: 'POST', body: JSON.stringify(data) });
  },
  simulateSensorHit: (data) => fetchJson('/hardware/simulate', { method: 'POST', body: JSON.stringify(data) }),
  getHardwareStatus: () => fetchJson('/hardware/status'),
  setHardwareMode: (mode) => fetchJson('/hardware/mode', { method: 'POST', body: JSON.stringify({ mode }) }),

  getRecentShots: async (limit = 20) => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const shots = await cloudDataService.getCloudRecentShots({ accessToken: token, limit });
          return shots || [];
        } catch (_) {}
      }
      return [];
    }
    return fetchJson(`/shots/recent?limit=${limit}`);
  },
  getHitMapData: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      return { shots: [], zoneDistribution: {}, totalCount: 0, totalHits: 0, accuracy: 0, bullseyes: 0 };
    }
    return fetchJson('/shots/hitmap');
  },
  getHitmap: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      return { shots: [], zoneDistribution: {}, totalCount: 0, totalHits: 0, accuracy: 0, bullseyes: 0 };
    }
    return fetchJson('/shots/hitmap');
  },

  getAttributes: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const attrs = await cloudDataService.getCloudAttributes({ accessToken: token });
          if (Array.isArray(attrs) && attrs.length > 0) return attrs;
        } catch (_) {}
      }
      return [
        { key: 'precision', name: 'Precisão', level: 1, xp: 0, xp_next: 100, max_level: 20 },
        { key: 'consistency', name: 'Consistência', level: 1, xp: 0, xp_next: 100, max_level: 20 },
        { key: 'speed', name: 'Velocidade', level: 1, xp: 0, xp_next: 100, max_level: 20 },
        { key: 'control', name: 'Controle', level: 1, xp: 0, xp_next: 100, max_level: 20 },
        { key: 'reflex', name: 'Reflexo', level: 1, xp: 0, xp_next: 100, max_level: 20 },
        { key: 'strategy', name: 'Estratégia', level: 1, xp: 0, xp_next: 100, max_level: 20 }
      ];
    }
    return fetchJson('/skills/attributes');
  },
  getAttributeDetail: (key) => fetchJson(`/skills/attribute/${key}`),
  getSkillTree: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      return [
        { id: 'tree_1', name: 'Fundamentos de Quadra', category: 'Fundamentos', status: 'completed', description: 'Empunhadura e postura básica.' },
        { id: 'tree_2', name: 'Controle de Ritmo', category: 'Consistência', status: 'available', description: 'Cadência e precisão em 50 golpes seguidos.' },
        { id: 'tree_3', name: 'Domínio de Alvos Angulados', category: 'Precisão', status: 'locked', description: 'Alvos 1, 3, 4 e 6 com precisão superior a 80%.' },
        { id: 'tree_4', name: 'Maestria Competitiva', category: 'Estratégia', status: 'locked', description: 'Desempenho de alta intensidade em todos os setores.' }
      ];
    }
    return fetchJson('/skills/tree');
  },
  unlockSkillNode: async (id) => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      return { success: true, message: 'Habilidade desbloqueada' };
    }
    return fetchJson(`/skills/tree/${id}/unlock`, { method: 'POST' });
  },

  getAcademyOverview: async () => {
    if (isWebDemoMode() || !getSavedServerUrl()) {
      try {
        return await fetchJson('/academy');
      } catch (e) {
        return {
          skills: [
            { key: 'precision', name: 'Precisão & Direção', description: 'Domínio do ponto de impacto na parede.' },
            { key: 'consistency', name: 'Consistência & Ritmo', description: 'Sustentação de trocas de bola.' },
            { key: 'speed', name: 'Velocidade & Potência', description: 'Aceleração de cabeça de raquete.' },
            { key: 'control', name: 'Controle & Sensibilidade', description: 'Toque curto e amortecimento.' },
            { key: 'reflex', name: 'Reflexo & Agilidade', description: 'Tempo de reação e recuperação.' },
            { key: 'strategy', name: 'Estratégia & Tática', description: 'Construção de pontos e zonas de segurança.' }
          ],
          isOfflineFallback: true
        };
      }
    }
    return fetchJson('/academy');
  },
  getAcademySkillContent: (skill) => fetchJson(`/academy/${skill}`),
  getAcademyCatalog: async (params = {}) => {
    if (isWebDemoMode() || !getSavedServerUrl()) {
      try {
        const cleanParams = Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        );
        const q = new URLSearchParams(cleanParams).toString();
        return await fetchJson(`/academy/catalog${q ? '?' + q : ''}`);
      } catch (e) {
        return {
          lessons: [],
          initialModulesPreview: [
            { slot_number: 1, id: 'prec_1', category: 'Precisão & Direção', level: 'Iniciante', duration: '6 min', status: 'EM BREVE', published: false, title: 'Fundamentos de Precisão', description: 'Como trabalhar direção e controle da bola com posicionamento correto do corpo.' },
            { slot_number: 2, id: 'prec_2', category: 'Precisão & Direção', level: 'Iniciante', duration: '8 min', status: 'EM BREVE', published: false, title: 'Controle de Direção', description: 'Exercícios para aumentar a capacidade de direcionamento em cruzadas e paralelas.' },
            { slot_number: 3, id: 'cons_1', category: 'Consistência & Ritmo', level: 'Iniciante', duration: '5 min', status: 'EM BREVE', published: false, title: 'Regularidade', description: 'Desenvolvimento de ritmo respiratório e padrão motor repetitivo em trocas longas.' },
            { slot_number: 4, id: 'cons_2', category: 'Consistência & Ritmo', level: 'Iniciante', duration: '7 min', status: 'EM BREVE', published: false, title: 'Repetição Técnica', description: 'Séries focadas na mesma preparação de braço e terminação de golpe.' },
            { slot_number: 5, id: 'speed_1', category: 'Velocidade & Potência', level: 'Iniciante', duration: '6 min', status: 'EM BREVE', published: false, title: 'Potência', description: 'Uso da cadeia cinética e rotação de tronco para gerar força com menor esforço de braço.' },
            { slot_number: 6, id: 'speed_2', category: 'Velocidade & Potência', level: 'Iniciante', duration: '8 min', status: 'EM BREVE', published: false, title: 'Aceleração', description: 'Soltura de punho na terminação do movimento para ganho de topspin acelerado.' },
            { slot_number: 7, id: 'ctrl_1', category: 'Controle & Sensibilidade', level: 'Iniciante', duration: '5 min', status: 'EM BREVE', published: false, title: 'Controle da Bola', description: 'Absorção de impacto e sensação tátil no ponto de contato das cordas.' },
            { slot_number: 8, id: 'ctrl_2', category: 'Controle & Sensibilidade', level: 'Iniciante', duration: '7 min', status: 'EM BREVE', published: false, title: 'Direcionamento', description: 'Ajuste do ângulo da face da raquete no momento exato do impacto com o alvo.' },
            { slot_number: 9, id: 'refl_1', category: 'Reflexo & Agilidade', level: 'Iniciante', duration: '6 min', status: 'EM BREVE', published: false, title: 'Tempo de Reação', description: 'Redução do tempo de leitura visual da bola e sincronização do split-step.' },
            { slot_number: 10, id: 'refl_2', category: 'Reflexo & Agilidade', level: 'Iniciante', duration: '8 min', status: 'EM BREVE', published: false, title: 'Resposta Rápida', description: 'Bloqueio de bolas rápidas com menor amplitude de backswing.' },
            { slot_number: 11, id: 'strat_1', category: 'Estratégia & Tática', level: 'Iniciante', duration: '6 min', status: 'EM BREVE', published: false, title: 'Escolha de Alvo', description: 'Critérios táticos para escolher entre o centro seguro ou arriscar os cantos.' },
            { slot_number: 12, id: 'strat_2', category: 'Estratégia & Tática', level: 'Iniciante', duration: '8 min', status: 'EM BREVE', published: false, title: 'Sequências', description: 'Combinações de jogadas planejadas para desestabilizar o posicionamento adversário.' }
          ],
          totalCount: 12,
          publishedCount: 0,
          isWebDemo: true,
          notice: 'O catálogo de videoaulas está disponível no equipamento conectado à quadra.'
        };
      }
    }
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const q = new URLSearchParams(cleanParams).toString();
    return fetchJson(`/academy/catalog${q ? '?' + q : ''}`);
  },
  getAcademyLessons: (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const q = new URLSearchParams(cleanParams).toString();
    return fetchJson(`/academy/lessons${q ? '?' + q : ''}`);
  },
  getAcademyCategories: () => fetchJson('/academy/categories'),
  getAcademyLessonDetail: (id) => fetchJson(`/academy/lessons/${encodeURIComponent(id)}`),
  getAcademyProgress: () => fetchJson('/academy/progress'),
  setAcademyLessonProgress: (id, completed = true) =>
    fetchJson(`/academy/lessons/${encodeURIComponent(id)}/progress`, {
      method: 'POST',
      body: JSON.stringify({ completed })
    }),

  getAchievements: async () => {
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const achs = await cloudDataService.getCloudAchievements({ accessToken: token });
          return achs || [];
        } catch (_) {}
      }
      return [];
    }
    return fetchJson('/achievements');
  },

  getSessions: async (limit = 30) => {
    const resolvedLimit = typeof limit === 'object' && limit !== null ? (limit.limit || 30) : limit;
    const token = getActiveCloudToken();
    if (isCloudOnlyMode() || isWebDemoMode() || (token && !getSavedServerUrl())) {
      if (token) {
        try {
          const res = await cloudDataService.getCloudSessions({ accessToken: token, limit: resolvedLimit });
          return (res.sessions || []).map((s) => ({
            id: s.id,
            date: s.started_at,
            started_at: s.started_at,
            ended_at: s.ended_at,
            mode: s.mode,
            score: s.total_score,
            total_score: s.total_score,
            accuracy: Number(s.accuracy) || 0,
            shots_count: s.shots_count || 0,
            hits_count: s.hits_count || 0,
            duration: s.duration_seconds || 0,
            xp_granted: s.xp_granted || 0
          }));
        } catch (_) {}
      }
      return [];
    }
    return fetchJson(`/sessions?limit=${resolvedLimit}`);
  },
  createSession: (data) => fetchJson('/sessions', { method: 'POST', body: JSON.stringify(data) }),

  getStatus: () => fetchJson('/status'),
  getWallConfig: () => fetchJson('/sensors/wall-config'),
  updateWallConfig: (data) => fetchJson('/sensors/wall-config', { method: 'PUT', body: JSON.stringify(data) }),
  updateMyWallConfig: (data) => fetchJson('/sensors/wall-config', { method: 'PUT', body: JSON.stringify(data) }),

  getIotDiagnostics: () => fetchJson('/hardware/iot-diagnostics'),
  updateIotCalibration: (data) => fetchJson('/hardware/iot-calibration', { method: 'PUT', body: JSON.stringify(data) }),
  testSyntheticTdoa: (data) => fetchJson('/hardware/iot-diagnostics/test-tdoa', { method: 'POST', body: JSON.stringify(data) }),
  sendArduinoEvents: (data) => fetchJson('/hardware/arduino/events', { method: 'POST', body: JSON.stringify(data) }),

  getInstallation: () => fetchJson('/installation'),
  experience: {
    getCurrent: () => fetchJson('/experience/current'),
    start: () => fetchJson('/experience/start', { method: 'POST' }),
    sendImpact: (id, data) => fetchJson(`/experience/${id}/impact`, { method: 'POST', body: JSON.stringify(data) }),
    abort: (id) => fetchJson(`/experience/${id}/abort`, { method: 'POST' })
  },

  personalMatch: {
    getCurrent: (mode = null) => {
      if (isWebDemoMode()) return Promise.resolve(null);
      return fetchJson(`/personal-match/current${mode ? `?mode=${encodeURIComponent(mode)}` : ''}`);
    },
    start: (data) => {
      if (isWebDemoMode()) {
        return Promise.reject(new Error('Partidas oficiais com sensores físicos não podem ser iniciadas no modo demonstração web.'));
      }
      return fetchJson('/personal-match/start', { method: 'POST', body: JSON.stringify(data) });
    },
    finish: (data = {}) => {
      if (isWebDemoMode()) {
        return Promise.resolve({ success: true, message: 'Encerrado em memória (Web Demo)' });
      }
      return fetchJson('/personal-match/finish', { method: 'POST', body: JSON.stringify(data) });
    },
    sendImpact: (data) => {
      if (isWebDemoMode()) {
        return Promise.reject(new Error('Impactos de hardware não são gravados no modo demonstração web.'));
      }
      return fetchJson('/personal-match/impact', { method: 'POST', body: JSON.stringify(data) });
    }
  },

  admin: {
    setInstallation: (data) => fetchJson('/installation', { method: 'PUT', body: JSON.stringify(data) }),
    getUsers: () => fetchJson('/admin/users'),
    createUser: (data) => fetchJson('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => fetchJson(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => fetchJson(`/admin/users/${id}`, { method: 'DELETE' }),
    resetUserPassword: (id, newPassword) => fetchJson(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),

    getEquipments: () => fetchJson('/admin/equipments'),
    createEquipment: (data) => fetchJson('/admin/equipments', { method: 'POST', body: JSON.stringify(data) }),
    updateEquipment: (id, data) => fetchJson(`/admin/equipments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEquipment: (id) => fetchJson(`/admin/equipments/${id}`, { method: 'DELETE' }),

    getEquipmentUsers: (equipmentId) => fetchJson(`/admin/equipments/${equipmentId}/users`),
    addEquipmentUser: (equipmentId, userId) => fetchJson(`/admin/equipments/${equipmentId}/users`, { method: 'POST', body: JSON.stringify({ userId }) }),
    removeEquipmentUser: (equipmentId, userId) => fetchJson(`/admin/equipments/${equipmentId}/users/${userId}`, { method: 'DELETE' }),

    getWallConfig: () => fetchJson('/admin/wall-config'),
    setWallConfig: (preset) => fetchJson('/admin/wall-config', { method: 'POST', body: JSON.stringify({ preset }) }),

    getAcademyLessons: () => fetchJson('/admin/academy/lessons'),
    createAcademyLesson: (data) => fetchJson('/admin/academy/lessons', { method: 'POST', body: JSON.stringify(data) }),
    updateAcademyLesson: (id, data) =>
      fetchJson(`/admin/academy/lessons/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    setAcademyLessonPublished: (id, published) =>
      fetchJson(`/admin/academy/lessons/${encodeURIComponent(id)}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ published })
      }),
    deleteAcademyLesson: (id) =>
      fetchJson(`/admin/academy/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    updateAcademySettings: (data) =>
      fetchJson('/admin/academy/settings', { method: 'PUT', body: JSON.stringify(data) }),
    validateYoutubeUrl: (url) =>
      fetchJson('/admin/academy/validate-youtube', { method: 'POST', body: JSON.stringify({ url }) }),

    getSensors: () => fetchJson('/admin/sensors'),
    getSessions: () => fetchJson('/admin/sessions'),
    getReports: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return fetchJson(`/admin/reports${q ? '?' + q : ''}`);
    }
  },
  adminGetStats: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/admin/reports${q ? '?' + q : ''}`);
  }
};
