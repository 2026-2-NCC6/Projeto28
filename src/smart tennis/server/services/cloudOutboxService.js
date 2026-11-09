/**
 * ==============================================================================
 * MOTION TENNIS — SERVIÇO DE OUTBOX CLOUD LOCAL (OFFLINE-FIRST)
 * ==============================================================================
 * Gerencia a fila transacional local de eventos na tabela SQLite `cloud_outbox`.
 *
 * PRINCÍPIOS FUNDAMENTAIS:
 * 1. RESILIÊNCIA OFFLINE-FIRST: Partidas finalizadas são gravadas primeiro localmente
 *    no SQLite. O jogo e o atleta nunca dependem da conexão com a nuvem para jogar.
 * 2. IDEMPOTÊNCIA ESTATUTÁRIA: Cada evento possui um `event_id` (UUID v4) persistente
 *    e imutável, preservado rigorosamente em todas as retentativas.
 * 3. IDENTIDADE VERIFICADA: O `cloud_user_id` do atleta é derivado exclusivamente
 *    de vínculo autenticado no SQLite (`user_cloud_identities`). Se o atleta ainda
 *    não tiver vinculado sua conta cloud, o evento aguarda em status `pending_link`.
 * 4. NÃO BLOQUEANTE: O registro na outbox e o processamento de sincronização nunca
 *    bloqueiam a conclusão da partida nem a experiência do atleta na quadra.
 * ==============================================================================
 */

const crypto = require('crypto');
const { run, get, all, exec } = require('../database/db');
const { getEquipmentConfig } = require('../config/supabaseConfig');
const { getCloudIdentityForUser } = require('./cloudIdentityService');

/**
 * Garante a criação da tabela `cloud_outbox` e seus índices no SQLite.
 */
async function ensureOutboxTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS cloud_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      session_id TEXT,
      match_id TEXT,
      user_id INTEGER,
      cloud_user_id TEXT,
      equipment_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'MATCH_FINISHED',
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'pending_link', 'processing', 'completed', 'failed'
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 10,
      next_retry_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_outbox_event_id ON cloud_outbox(event_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_status_retry ON cloud_outbox(status, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_session ON cloud_outbox(session_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_user ON cloud_outbox(user_id);
  `);
}

/**
 * Constrói o evento canônico MATCH_FINISHED e enfileira na cloud_outbox.
 * Chamado automaticamente na conclusão de partidas do Modo Pessoal.
 */
async function createMatchFinishedEvent({ match, durationSeconds, sessionId, endedAt = Date.now() }) {
  if (!match || !match.id) {
    throw new Error('Dados da partida inválidos para registro na outbox.');
  }

  await ensureOutboxTable();

  // Verifica se já existe evento gerado para este match_id para garantir idempotência
  const existing = await get('SELECT * FROM cloud_outbox WHERE match_id = ? LIMIT 1', [match.id]);
  if (existing) {
    return existing;
  }

  // 1. Identidade Cloud do Atleta
  let cloudUserId = null;
  if (match.user_id) {
    const cloudIdentity = await getCloudIdentityForUser(match.user_id);
    if (cloudIdentity && cloudIdentity.cloud_user_id) {
      cloudUserId = cloudIdentity.cloud_user_id;
    }
  }

  // 2. Configuração do Equipamento
  const eqConfig = getEquipmentConfig();
  const equipmentId = eqConfig.equipmentId || '00000000-0000-0000-0000-000000000001';

  // 3. Carrega os impactos reais persistidos no SQLite para a partida
  const rawImpacts = await all(
    `SELECT * FROM personal_match_impacts WHERE match_id = ? ORDER BY id ASC`,
    [match.id]
  );

  const resolvedSessionId = sessionId || match.session_id || `pers_${match.id}`;
  const matchDuration = Math.max(1, durationSeconds || match.duration_seconds || 1);
  const startTime = match.started_at ? Number(match.started_at) : (endedAt - matchDuration * 1000);

  // 4. Mapeia impactos para o contrato canônico do Supabase (migração 004 / sync_equipment_session_v2)
  let sumPoints = 0;
  let sumXp = 0;
  let hitsCount = 0;
  let zeroPointHits = 0;
  let hasSimulation = Boolean(match.is_simulation);

  const shots = (rawImpacts || []).map((imp, idx) => {
    const isHit = Boolean(imp.classification === 'TARGET_HIT' && imp.sector_id);
    const matchPoints = Number(imp.points || 0);
    const shotScore = Number(imp.shot_score || (isHit ? 85 : 0));
    const shotXp = Number(imp.shot_xp || (isHit ? Math.round(shotScore / 2) : 0));
    const forceKmh = Number(imp.force_kmh !== undefined && imp.force_kmh !== null ? imp.force_kmh : 80.0);
    const isBullseye = Boolean(imp.is_bullseye);

    if (imp.reason && imp.reason.includes('simul')) {
      hasSimulation = true;
    }

    // Regras de integridade estatutária: tiros que não acertaram têm pontuação zerada
    const finalScore = isHit ? shotScore : 0;
    const finalXp = isHit ? shotXp : 0;
    const finalPoints = isHit ? matchPoints : 0;
    const finalBullseye = isHit ? isBullseye : false;

    sumPoints += finalPoints;
    sumXp += finalXp;
    if (finalPoints > 0) hitsCount += 1;
    if (isHit && finalPoints === 0) zeroPointHits += 1;

    const offsetMs = Math.max(0, Math.min(matchDuration * 1000 + 10000, Number(imp.created_at || startTime) - startTime));

    return {
      x: Math.max(0, Math.min(100, Math.round(Number(imp.x || 50) * 10) / 10)),
      y: Math.max(0, Math.min(100, Math.round(Number(imp.y || 50) * 10) / 10)),
      is_hit: isHit,
      score: finalScore,
      xp: finalXp,
      match_points: finalPoints,
      sector_id: isHit && imp.sector_id ? Number(imp.sector_id) : null,
      force_kmh: Math.max(0, Math.min(400, Math.round(forceKmh * 10) / 10)),
      is_bullseye: finalBullseye,
      shot_time_offset_ms: offsetMs
    };
  });

  // Reativações existem exclusivamente no modo clear_all para acertos em setores já apagados (points = 0)
  const reactivations = match.mode === 'clear_all' ? zeroPointHits : 0;

  // 5. Gera event_id UUID v4 único e imutável
  const eventId = crypto.randomUUID();

  // 6. Envelope canônico do evento
  const envelope = {
    event_id: eventId,
    event_type: 'MATCH_FINISHED',
    schema_version: '1.0',
    timestamp: new Date(endedAt).toISOString(),
    payload: {
      local_session_id: String(resolvedSessionId),
      user_id: cloudUserId, // Preenchido se vinculado, ou atualizado ao vincular
      is_simulation: hasSimulation,
      engine_rules_version: 1,
      mode: match.mode,
      wall_preset: match.wall_preset || '3x2',
      started_at: new Date(startTime).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      duration_seconds: matchDuration,
      shots_count: shots.length,
      hits_count: hitsCount,
      total_score: sumPoints,
      xp_granted: sumXp,
      reactivations: reactivations,
      shots: shots
    }
  };

  const initialStatus = cloudUserId ? 'pending' : 'pending_link';
  const payloadJson = JSON.stringify(envelope);

  // 7. Persistência atômica na tabela cloud_outbox
  const insertResult = await run(
    `INSERT INTO cloud_outbox (
       event_id, session_id, match_id, user_id, cloud_user_id, equipment_id,
       event_type, payload_json, status, retry_count, max_retries, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'MATCH_FINISHED', ?, ?, 0, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      eventId,
      resolvedSessionId,
      match.id,
      match.user_id || null,
      cloudUserId,
      equipmentId,
      payloadJson,
      initialStatus
    ]
  );

  const createdRow = await get('SELECT * FROM cloud_outbox WHERE id = ?', [insertResult.lastID]);

  // Se o evento estiver pronto para envio, aciona o worker em segundo plano sem bloquear (em produção)
  if (initialStatus === 'pending' && process.env.SMART_TENNIS_TEST_MODE !== '1') {
    try {
      const { triggerSync } = require('./cloudSyncWorker');
      if (typeof triggerSync === 'function') {
        setImmediate(() => {
          triggerSync().catch(() => {});
        });
      }
    } catch (_) {}
  }

  return createdRow;
}

/**
 * Retorna estatísticas da outbox local para telemetria e diagnóstico.
 */
async function getOutboxStats() {
  await ensureOutboxTable();
  const rows = await all(`
    SELECT status, COUNT(*) as count FROM cloud_outbox GROUP BY status
  `);
  const stats = { pending: 0, pending_link: 0, processing: 0, completed: 0, failed: 0, total: 0 };
  for (const r of rows) {
    if (stats[r.status] !== undefined) {
      stats[r.status] = r.count;
    }
    stats.total += r.count;
  }
  return stats;
}

module.exports = {
  ensureOutboxTable,
  createMatchFinishedEvent,
  getOutboxStats
};
