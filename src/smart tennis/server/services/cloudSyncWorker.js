

const { run, get, all } = require('../database/db');
const { getSupabaseConfig, getEquipmentConfig } = require('../config/supabaseConfig');

let workerTimer = null;
let isSyncing = false;

// Lista de códigos de erro do PostgreSQL / Edge Function que denotam falha definitiva
const PERMANENT_RPC_ERRORS = new Set([
  'INVALID_EVENT_STRUCTURE',
  'MISSING_LOCAL_SESSION_ID',
  'USER_ID_REQUIRED',
  'INVALID_PAYLOAD_IS_SIMULATION_REQUIRED',
  'UNSUPPORTED_ENGINE_RULES_VERSION',
  'INVALID_GAME_MODE',
  'INVALID_SCORE_METRICS',
  'SHOTS_COUNT_MISMATCH',
  'INVALID_SHOT_FORMAT',
  'INVALID_SHOT_RANGE',
  'INVALID_SHOT_HIT_WITHOUT_SECTOR',
  'XP_EXCEEDS_PHYSICAL_LIMITS',
  'SCORE_EXCEEDS_PHYSICAL_LIMITS',
  'SCORE_MISMATCH_WITH_SHOTS',
  'HITS_MISMATCH_WITH_SHOTS',
  'XP_MISMATCH_WITH_SHOTS',
  'INVALID_REACTIVATIONS',
  'SESSION_STARTED_IN_FUTURE',
  'SESSION_PREDATES_EQUIPMENT',
  'INVALID_REQUEST',
  'OPERATION_NOT_ALLOWED'
]);

/**
 * Sanitiza mensagens de erro removendo qualquer evidência de chaves de API, senhas ou tokens.
 */
function sanitizeErrorMessage(rawMsg) {
  if (!rawMsg || typeof rawMsg !== 'string') return 'Erro não especificado.';
  return rawMsg
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey[:=]\s*[A-Za-z0-9._-]+/gi, 'apikey=[REDACTED]')
    .replace(/x-equipment-key[:=]\s*[A-Za-z0-9._-]+/gi, 'x-equipment-key=[REDACTED]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m, offset, str) => {
      // Preserva UUIDs comuns se fizer sentido, ou mascara chaves
      return m;
    })
    .slice(0, 500);
}

/**
 * Identifica se um erro retornado pelo gateway ou RPC é permanente ou temporário.
 */
function isPermanentError(errorCode, httpStatus) {
  if (PERMANENT_RPC_ERRORS.has(errorCode)) return true;
  if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
    return true; // 4xx em geral (exceto 429 Too Many Requests) é erro de cliente/formato
  }
  return false;
}

/**
 * Calcula o atraso para a próxima retentativa com backoff exponencial.
 * Base: 5s -> 10s -> 20s -> 40s -> 80s -> 160s... até no máx 15 min (900s).
 */
function calculateNextRetryDate(retryCount) {
  const baseSec = 5;
  const exponent = Math.min(retryCount, 8);
  const delaySec = Math.min(900, Math.round(baseSec * Math.pow(2, exponent)));
  return new Date(Date.now() + delaySec * 1000).toISOString();
}

/**
 * Recupera eventos que ficaram presos em status 'processing' devido a reinício ou queda do backend.
 */
async function recoverStaleProcessingEvents(timeoutMs = 300000) {
  try {
    const thresholdDate = new Date(Date.now() - timeoutMs).toISOString();
    const result = await run(
      `UPDATE cloud_outbox
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing' AND updated_at <= ?`,
      [thresholdDate]
    );
    if (result && result.changes > 0) {
      console.log(`[SYNC WORKER] Recuperados ${result.changes} evento(s) órfão(s) em processamento.`);
    }
    return result ? result.changes : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Marca o evento como concluído com sucesso (incluindo confirmação idempotente).
 */
async function markEventCompleted(id, resultInfo = {}) {
  await run(
    `UPDATE cloud_outbox
     SET status = 'completed',
         confirmed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         last_error = NULL
     WHERE id = ?`,
    [id]
  );
}

/**
 * Marca o evento para nova tentativa com backoff exponencial.
 */
async function markEventRetry(id, retryCount, rawError) {
  const cleanError = sanitizeErrorMessage(rawError);
  const nextRetryAt = calculateNextRetryDate(retryCount);
  await run(
    `UPDATE cloud_outbox
     SET status = 'pending',
         retry_count = retry_count + 1,
         next_retry_at = ?,
         last_error = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextRetryAt, cleanError, id]
  );
}

/**
 * Marca o evento como falha definitiva (não será mais retentado).
 */
async function markEventFailed(id, rawError) {
  const cleanError = sanitizeErrorMessage(rawError);
  await run(
    `UPDATE cloud_outbox
     SET status = 'failed',
         last_error = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [cleanError, id]
  );
}

/**
 * Executa um ciclo completo de envio de eventos pendentes da outbox.
 */
async function syncPendingEvents(options = {}) {
  if (isSyncing) return { processed: 0, skipped: true, reason: 'ALREADY_SYNCING' };
  isSyncing = true;

  const fetchFn = options.fetchFn || globalThis.fetch;
  const overrideGatewayUrl = options.gatewayUrl || null;
  let processedCount = 0;

  try {
    // 1. Recupera eventos presos se timeout atingido
    await recoverStaleProcessingEvents(options.staleTimeoutMs || 300000);

    // 2. Busca lote de eventos pendentes que já podem ser retentados
    const pendingEvents = await all(
      `SELECT * FROM cloud_outbox
       WHERE status = 'pending'
         AND (next_retry_at IS NULL OR datetime(next_retry_at) <= datetime('now'))
       ORDER BY id ASC
       LIMIT 10`
    );

    if (!pendingEvents || pendingEvents.length === 0) {
      return { processed: 0, pending: 0 };
    }

    // 3. Obtém credenciais locais de equipamento e configuração Supabase
    const eqConfig = getEquipmentConfig();
    const spConfig = getSupabaseConfig();

    for (const ev of pendingEvents) {
      // Bloqueio atômico de concorrência: tenta colocar em 'processing'
      const claimRes = await run(
        `UPDATE cloud_outbox
         SET status = 'processing', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [ev.id]
      );

      if (!claimRes || claimRes.changes === 0) {
        // Outro processo concorrente já capturou este evento; continua
        continue;
      }

      // Validação prévia de identidade cloud: se não possuir UUID do atleta, não pode enviar
      if (!ev.cloud_user_id) {
        await run(
          `UPDATE cloud_outbox
           SET status = 'pending_link', updated_at = CURRENT_TIMESTAMP, last_error = 'Aguardando atleta vincular conta Supabase Auth.'
           WHERE id = ?`,
          [ev.id]
        );
        continue;
      }

      // Validação prévia de credenciais de equipamento
      if (!eqConfig.equipmentId || !eqConfig.apiKey) {
        await markEventRetry(ev.id, ev.retry_count, 'Credenciais do equipamento (EQUIPMENT_ID ou EQUIPMENT_API_KEY) ausentes ou inválidas.');
        continue;
      }

      // Validação prévia de configuração Supabase
      if (!spConfig.configured || !spConfig.url || !spConfig.anonKey) {
        await markEventRetry(ev.id, ev.retry_count, 'Nuvem Supabase não configurada no notebook.');
        continue;
      }

      let parsedEnvelope;
      try {
        parsedEnvelope = JSON.parse(ev.payload_json);
      } catch (jsonErr) {
        await markEventFailed(ev.id, 'Estrutura JSON do payload corrompida na outbox.');
        continue;
      }

      // Garante que o cloud_user_id do payload reflita o do registro
      if (parsedEnvelope.payload) {
        parsedEnvelope.payload.user_id = ev.cloud_user_id;
      }

      const gatewayUrl = overrideGatewayUrl || `${spConfig.url}/functions/v1/equipment-gateway`;

      try {
        const response = await fetchFn(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${spConfig.anonKey}`,
            'x-equipment-id': eqConfig.equipmentId,
            'x-equipment-key': eqConfig.apiKey
          },
          body: JSON.stringify({
            op: 'sync_session',
            data: {
              event: parsedEnvelope
            }
          })
        });

        let resData = null;
        try {
          resData = await response.json();
        } catch (_) {}

        if (response.ok && resData && resData.ok === true) {
          const rpcRes = resData.result;
          if (rpcRes && rpcRes.success === true) {
            // Sucesso padrão (SUCCESS) ou confirmação idempotente de evento já sincronizado (DUPLICATE_EVENT_IGNORED)
            await markEventCompleted(ev.id, rpcRes);
            processedCount++;
          } else {
            // A RPC do PostgreSQL rejeitou o evento
            const rpcErr = (rpcRes && rpcRes.error) || 'REJECTED_BY_RPC';
            if (isPermanentError(rpcErr, response.status)) {
              await markEventFailed(ev.id, rpcErr);
            } else {
              await markEventRetry(ev.id, ev.retry_count, rpcErr);
            }
          }
        } else {
          // Erro de gateway HTTP (4xx / 5xx)
          const errDetail = (resData && (resData.error || resData.detail)) || `HTTP_STATUS_${response.status}`;
          if (isPermanentError(errDetail, response.status)) {
            await markEventFailed(ev.id, errDetail);
          } else {
            await markEventRetry(ev.id, ev.retry_count, errDetail);
          }
        }
      } catch (netErr) {
        // Falha de rede / internet indisponível (offline): reagenda com backoff sem perder o evento
        await markEventRetry(ev.id, ev.retry_count, `Rede indisponível: ${netErr.message}`);
      }
    }

    return { processed: processedCount, pending: pendingEvents.length - processedCount };
  } finally {
    isSyncing = false;
  }
}

/**
 * Dispara um ciclo assíncrono imediato de sincronização (fire-and-forget).
 */
async function triggerSync(options = {}) {
  return syncPendingEvents(options);
}

/**
 * Inicia o worker em segundo plano periódico.
 */
function startWorker(options = {}) {
  if (workerTimer) return;
  const intervalMs = options.intervalMs || 15000;

  // Recupera eventos órfãos imediatamente na inicialização
  recoverStaleProcessingEvents(0).catch(() => {});

  workerTimer = setInterval(() => {
    syncPendingEvents(options).catch((err) => {
      console.warn('[SYNC WORKER] Erro no ciclo periódico:', sanitizeErrorMessage(err.message));
    });
  }, intervalMs);

  if (workerTimer.unref) {
    workerTimer.unref(); // Permite encerramento gracioso do Node se não houver outras tarefas
  }

  return {
    stop: stopWorker,
    trigger: triggerSync
  };
}

/**
 * Interrompe o worker de segundo plano.
 */
function stopWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = {
  syncPendingEvents,
  triggerSync,
  startWorker,
  stopWorker,
  recoverStaleProcessingEvents,
  sanitizeErrorMessage,
  isPermanentError,
  calculateNextRetryDate
};
