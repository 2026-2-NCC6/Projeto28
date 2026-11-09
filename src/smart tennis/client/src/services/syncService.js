import { savePlayerSnapshot, getPlayerOfflineData, getSyncMetadata } from './db';
import { testServerConnection } from './serverConfig';

export const SyncState = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  SYNCING: 'SYNCING',
  ERROR: 'ERROR'
};

class SyncService {
  constructor() {
    this.currentState = SyncState.ONLINE;
    this.lastSyncAt = null;
    this.listeners = new Set();
    this.currentUserId = null;
    this.lastErrorMessage = null;
    this.isSyncing = false;
  }

  setCurrentUser(user) {
    const newId = user?.id ? Number(user.id) : null;
    if (this.currentUserId !== newId) {
      this.currentUserId = newId;
      this.lastSyncAt = null;
      this.lastErrorMessage = null;
      if (newId) {
        this.loadLocalSyncMeta(newId);
      }
    }
  }

  async loadLocalSyncMeta(userId) {
    try {
      const meta = await getSyncMetadata(userId);
      if (meta && meta.lastSyncAt) {
        this.lastSyncAt = meta.lastSyncAt;
        this.notify();
      }
    } catch (e) {
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({
      state: this.currentState,
      lastSyncAt: this.lastSyncAt,
      errorMessage: this.lastErrorMessage,
      userId: this.currentUserId
    });
    return () => this.listeners.delete(listener);
  }

  notify() {
    const payload = {
      state: this.currentState,
      lastSyncAt: this.lastSyncAt,
      errorMessage: this.lastErrorMessage,
      userId: this.currentUserId
    };
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[SYNC] Erro no listener:', err);
      }
    }
  }

  setState(state, errorMessage = null) {
    this.currentState = state;
    this.lastErrorMessage = errorMessage;
    this.notify();
  }

  /**
   * Executa a sincronização completa do jogador atual com o notebook.
   * Se offline, faz fallback seguro para a cópia íntegra do IndexedDB.
   */
  async syncNow(api) {
    if (this.isSyncing) return;
    if (!this.currentUserId) {
      this.setState(SyncState.ERROR, 'Nenhum atleta logado para sincronização.');
      return { success: false, error: 'Usuário não autenticado' };
    }

    this.isSyncing = true;
    this.setState(SyncState.SYNCING);

    try {
      const connTest = await testServerConnection();
      if (!connTest.success) {
        throw new Error(connTest.error);
      }

      const [profile, sessions, attributes, achievements, hitmap] = await Promise.all([
        api.getPlayer().catch(() => null),
        api.getSessions({ limit: 100 }).catch(() => []),
        api.getAttributes().catch(() => []),
        api.getAchievements().catch(() => []),
        api.getHitmap().catch(() => ({ shots: [], totalCount: 0, totalHits: 0, bullseyes: 0, zoneDistribution: {} }))
      ]);

      if (!profile) {
        throw new Error('Falha ao obter perfil do atleta do servidor.');
      }

      const snapshot = {
        profile,
        sessions: Array.isArray(sessions) ? sessions : [],
        attributes: Array.isArray(attributes) ? attributes : [],
        achievements: Array.isArray(achievements) ? achievements : [],
        hitmap: hitmap && typeof hitmap === 'object' ? hitmap : { shots: [] }
      };

      const saveResult = await savePlayerSnapshot(this.currentUserId, snapshot);

      this.lastSyncAt = saveResult.lastSyncAt;
      this.setState(SyncState.ONLINE, null);
      this.isSyncing = false;

      return {
        success: true,
        source: 'server',
        lastSyncAt: this.lastSyncAt,
        data: snapshot
      };

    } catch (err) {
      this.isSyncing = false;
      const errorMsg = err.message || 'Erro de conexão com o servidor';

      // 5. Fallback seguro: carregar dados do IndexedDB se existirem
      const offlineData = await getPlayerOfflineData(this.currentUserId).catch(() => null);

      if (offlineData && (offlineData.profile || (offlineData.sessions && offlineData.sessions.length > 0))) {
        this.lastSyncAt = offlineData.meta?.lastSyncAt || this.lastSyncAt;
        this.setState(SyncState.OFFLINE, errorMsg);
        return {
          success: true,
          source: 'cache',
          lastSyncAt: this.lastSyncAt,
          data: offlineData,
          message: 'Modo offline — exibindo últimos dados sincronizados.'
        };
      } else {
        this.setState(SyncState.ERROR, errorMsg);
        return {
          success: false,
          source: 'none',
          error: errorMsg,
          message: 'Não foi possível conectar ao servidor e não há dados salvos offline para este atleta.'
        };
      }
    }
  }

  
  async getPlayerData(userId, api) {
    if (!userId) return null;
    try {
      const conn = await testServerConnection();
      if (conn.success && api) {
        const syncRes = await this.syncNow(api);
        if (syncRes.success) return syncRes.data;
      }
    } catch (e) {
    }

    return await getPlayerOfflineData(userId);
  }
}

export const syncService = new SyncService();
