/**
 * MOTION TENNIS — equipment-gateway (lógica pura e testável)
 * ==============================================================================
 * Canal seguro entre o notebook da quadra e o Supabase. NÃO é um proxy genérico:
 *   - allowlist fixa de 3 operações, cada uma mapeada para UMA RPC específica;
 *   - valida formato/tamanho de cada operação antes de chamar o banco;
 *   - a chave do equipamento é verificada DENTRO da RPC (hash SHA-256 + lockout);
 *   - o vínculo atleta<->equipamento é verificado DENTRO da RPC (user_id do payload
 *     nunca é confiado sem pareamento autorizado);
 *   - service_role existe somente como secret desta função, dentro do Supabase.
 *
 * O módulo não depende de Deno nem de Node: `deps.rpc(fn, args)` é injetado
 * (em produção: supabase-js com service_role; em testes: PostgreSQL local).
 */

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB (partida de 5000 impactos cabe com folga)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Za-z0-9]{6,32}$/;

export const OPERATIONS = Object.freeze({
  heartbeat: { rpc: 'record_equipment_heartbeat_v1' },
  issue_pairing_challenge: { rpc: 'issue_equipment_pairing_challenge_v1' },
  sync_session: { rpc: 'sync_equipment_session_v2' }
});

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function reply(status, body) {
  return { status, body };
}

function invalid(detail) {
  return reply(400, { ok: false, error: 'INVALID_REQUEST', detail });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function buildHeartbeat(data) {
  const hb = {};
  if (data.reported_at !== undefined) {
    const t = Date.parse(data.reported_at);
    if (Number.isNaN(t)) return null;
    hb.reported_at = new Date(t).toISOString();
  }
  if (data.client_ip !== undefined) {
    if (typeof data.client_ip !== 'string' || data.client_ip.length > 45) return null;
    hb.client_ip = data.client_ip;
  }
  if (data.app_version !== undefined) {
    if (typeof data.app_version !== 'string' || data.app_version.length > 40) return null;
    hb.app_version = data.app_version;
  }
  for (const k of ['ping_ms', 'pending_outbox_count']) {
    if (data[k] !== undefined) {
      if (!Number.isInteger(data[k]) || data[k] < 0 || data[k] > 1e9) return null;
      hb[k] = data[k];
    }
  }
  if (data.db_integrity_ok !== undefined) {
    if (typeof data.db_integrity_ok !== 'boolean') return null;
    hb.db_integrity_ok = data.db_integrity_ok;
  }
  return hb;
}

function buildArgs(op, equipmentId, apiKey, data) {
  if (op === 'heartbeat') {
    const hb = buildHeartbeat(data || {});
    if (!hb) return { error: 'heartbeat inválido' };
    return { args: { p_equipment_id: equipmentId, p_api_key: apiKey, p_heartbeat: hb } };
  }

  if (op === 'issue_pairing_challenge') {
    if (!data || typeof data.challenge_code !== 'string' || !CODE_RE.test(data.challenge_code)) {
      return { error: 'challenge_code deve ter 6-32 caracteres alfanuméricos' };
    }
    const ttl = data.ttl_seconds === undefined ? 300 : data.ttl_seconds;
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 600) return { error: 'ttl_seconds deve estar entre 60 e 600' };
    return {
      args: {
        p_equipment_id: equipmentId,
        p_api_key: apiKey,
        p_challenge_code: data.challenge_code,
        p_ttl_seconds: ttl
      }
    };
  }

  if (op === 'sync_session') {
    const ev = data && data.event;
    if (!isPlainObject(ev)) return { error: 'event ausente' };
    if (typeof ev.event_id !== 'string' || ev.event_id.length === 0 || ev.event_id.length > 64) {
      return { error: 'event.event_id inválido' };
    }
    if (ev.event_type !== 'MATCH_FINISHED') return { error: 'event.event_type deve ser MATCH_FINISHED' };
    if (!isPlainObject(ev.payload)) return { error: 'event.payload ausente' };
    // Somente chaves conhecidas do envelope são repassadas.
    const clean = {
      event_id: ev.event_id,
      event_type: ev.event_type,
      schema_version: typeof ev.schema_version === 'string' ? ev.schema_version.slice(0, 10) : undefined,
      timestamp: typeof ev.timestamp === 'string' ? ev.timestamp.slice(0, 40) : undefined,
      batch_id: typeof ev.batch_id === 'string' ? ev.batch_id.slice(0, 64) : undefined,
      payload: ev.payload
    };
    return { args: { p_equipment_id: equipmentId, p_api_key: apiKey, p_event: clean } };
  }

  return { error: 'operação desconhecida' };
}

/**
 * @param {{method:string, headers:any, bodyText:string}} request
 * @param {{rpc:(fn:string,args:object)=>Promise<{data:any,error:any}>}} deps
 */
export async function handleGatewayRequest(request, deps) {
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  const bodyText = request.bodyText || '';
  if (bodyText.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });

  const equipmentId = (getHeader(request.headers, 'x-equipment-id') || '').trim();
  const apiKey = getHeader(request.headers, 'x-equipment-key') || '';
  if (!UUID_RE.test(equipmentId)) return invalid('x-equipment-id inválido');
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || apiKey.length > 200) {
    // Não chama o banco com credencial ausente/vazia.
    return reply(401, { ok: false, error: 'INVALID_CREDENTIALS' });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    return invalid('JSON inválido');
  }
  if (!isPlainObject(body)) return invalid('corpo deve ser um objeto');

  const op = body.op;
  if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(OPERATIONS, op)) {
    return reply(400, { ok: false, error: 'OPERATION_NOT_ALLOWED' });
  }

  const built = buildArgs(op, equipmentId, apiKey, body.data);
  if (built.error) return invalid(built.error);

  let rpcResult;
  try {
    rpcResult = await deps.rpc(OPERATIONS[op].rpc, built.args);
  } catch (_) {
    return reply(502, { ok: false, error: 'UPSTREAM_ERROR' });
  }

  if (!rpcResult || rpcResult.error) {
    // Detalhes do banco nunca são repassados ao cliente.
    return reply(502, { ok: false, error: 'UPSTREAM_ERROR' });
  }

  return reply(200, { ok: true, op, result: rpcResult.data });
}
