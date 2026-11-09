

const crypto = require('crypto');
const { getSupabaseConfig, getEquipmentConfig } = require('../config/supabaseConfig');

/**
 * Descobre o hardware_code registrado no Supabase para este equipamento.
 * Utiliza o token do atleta para consultar public.equipments via RLS.
 * Fallback para variável de ambiente ou código padrão 'ST-001'.
 */
async function discoverHardwareCode({ accessToken, equipmentId, fetchFn = globalThis.fetch }) {
  const spConfig = getSupabaseConfig();
  const eqConfig = getEquipmentConfig();
  const targetId = equipmentId || eqConfig.equipmentId;

  if (accessToken && spConfig.configured && spConfig.url && spConfig.anonKey && targetId) {
    try {
      const endpoint = `${spConfig.url.replace(/\/+$/, '')}/rest/v1/equipments?id=eq.${targetId}&select=hardware_code`;
      const res = await fetchFn(endpoint, {
        method: 'GET',
        headers: {
          'apikey': spConfig.anonKey,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].hardware_code) {
          return rows[0].hardware_code;
        }
      }
    } catch (_) {
      // Silencia fallback em caso de falha de rede
    }
  }

  return process.env.EQUIPMENT_HARDWARE_CODE || 'ST-001';
}

/**
 * Executa o aperto de mão completo de pareamento autorizado:
 * 1. Emite desafio temporário no equipamento via Edge Function equipment-gateway;
 * 2. Consome o desafio como atleta autenticado via RPC claim_equipment_pairing_v1;
 * 3. Dispara sincronização imediata de quaisquer partidas pendentes na outbox.
 *
 * @param {{ accessToken: string, cloudUserId: string, hardwareCode?: string, fetchFn?: Function }} params
 * @returns {Promise<{ success: boolean, pairing?: object, error?: string, code?: string }>}
 */
async function pairAthleteWithEquipment({ accessToken, cloudUserId, hardwareCode, fetchFn = globalThis.fetch }) {
  if (!accessToken || typeof accessToken !== 'string') {
    return { success: false, error: 'Token de acesso do atleta não fornecido.', code: 'MISSING_ACCESS_TOKEN' };
  }
  if (!cloudUserId) {
    return { success: false, error: 'Identificador cloud do atleta não fornecido.', code: 'MISSING_CLOUD_USER_ID' };
  }

  const spConfig = getSupabaseConfig();
  const eqConfig = getEquipmentConfig();

  if (!spConfig.configured || !spConfig.url || !spConfig.anonKey) {
    return { success: false, error: 'Configuração da nuvem Supabase incompleta no servidor.', code: 'CLOUD_NOT_CONFIGURED' };
  }
  if (!eqConfig.equipmentId || !eqConfig.apiKey) {
    return { success: false, error: 'Credenciais de hardware do equipamento ausentes no notebook.', code: 'EQUIPMENT_NOT_CONFIGURED' };
  }

  // 1. Descobre o hardware_code oficial
  const resolvedHardwareCode = hardwareCode || await discoverHardwareCode({ accessToken, equipmentId: eqConfig.equipmentId, fetchFn });

  // 2. Gera código de desafio com alta entropia (mínimo 6-32 caracteres alfanuméricos estritos)
  // Prefixo 'PAIR' sem símbolos garante conformidade com o regex do Edge Function equipment-gateway (/^[A-Za-z0-9]{6,32}$/)
  // e evita padrões previsíveis bloqueados na RPC PostgreSQL
  const randomSuffix = crypto.randomBytes(8).toString('hex').toUpperCase();
  const challengeCode = `PAIR${randomSuffix}`;

  // 3. Emite desafio temporário via gateway (com credenciais do equipamento)
  const gatewayUrl = `${spConfig.url.replace(/\/+$/, '')}/functions/v1/equipment-gateway`;
  let challengeRes;
  try {
    challengeRes = await fetchFn(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${spConfig.anonKey}`,
        'x-equipment-id': eqConfig.equipmentId,
        'x-equipment-key': eqConfig.apiKey
      },
      body: JSON.stringify({
        op: 'issue_pairing_challenge',
        data: {
          challenge_code: challengeCode,
          ttl_seconds: 300 // 5 minutos de validade para consumo imediato
        }
      })
    });
  } catch (netErr) {
    return { success: false, error: `Falha de conexão com gateway do equipamento: ${netErr.message}`, code: 'GATEWAY_NETWORK_ERROR' };
  }

  let challengeData = null;
  try {
    challengeData = await challengeRes.json();
  } catch (_) {}

  if (!challengeRes.ok || !challengeData || challengeData.ok !== true || !challengeData.result?.success) {
    const detailMsg = challengeData?.detail ? `${challengeData.error || 'ERRO'}: ${challengeData.detail}` : (challengeData?.error || `HTTP_${challengeRes.status}`);
    return {
      success: false,
      error: `Emissão de desafio de pareamento rejeitada pelo gateway: ${detailMsg}`,
      code: 'CHALLENGE_ISSUANCE_REJECTED'
    };
  }

  // 4. Consome o desafio como atleta autenticado (RPC com Bearer Token do atleta)
  const rpcUrl = `${spConfig.url.replace(/\/+$/, '')}/rest/v1/rpc/claim_equipment_pairing_v1`;
  let claimRes;
  try {
    claimRes = await fetchFn(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': spConfig.anonKey,
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        p_hardware_code: resolvedHardwareCode,
        p_pairing_code: challengeCode
      })
    });
  } catch (claimNetErr) {
    return { success: false, error: `Falha ao registrar pareamento na nuvem: ${claimNetErr.message}`, code: 'CLAIM_NETWORK_ERROR' };
  }

  let claimData = null;
  try {
    claimData = await claimRes.json();
  } catch (_) {}

  if (!claimRes.ok || !claimData || claimData.success !== true) {
    const errCode = (claimData && claimData.error) || `HTTP_${claimRes.status}`;
    return {
      success: false,
      error: `Pareamento não aceito pela RPC de autorização: ${errCode}`,
      code: errCode
    };
  }

  // 5. Aciona o Cloud Sync Worker para esvaziar imediatamente partidas pendentes deste atleta
  try {
    const { triggerSync } = require('./cloudSyncWorker');
    if (typeof triggerSync === 'function') {
      setImmediate(() => {
        triggerSync({ staleTimeoutMs: 0 }).catch(() => {});
      });
    }
  } catch (_) {}

  return {
    success: true,
    equipmentId: eqConfig.equipmentId,
    hardwareCode: resolvedHardwareCode,
    cloudUserId,
    pairing: claimData
  };
}

/**
 * Consulta o estado atual de pareamento do atleta autenticado com este equipamento.
 */
async function checkAthletePairingStatus({ accessToken, cloudUserId, fetchFn = globalThis.fetch }) {
  if (!accessToken || !cloudUserId) {
    return { paired: false, reason: 'MISSING_PARAMS' };
  }

  const spConfig = getSupabaseConfig();
  const eqConfig = getEquipmentConfig();

  if (!spConfig.configured || !eqConfig.equipmentId) {
    return { paired: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    const endpoint = `${spConfig.url.replace(/\/+$/, '')}/rest/v1/equipment_pairings?equipment_id=eq.${eqConfig.equipmentId}&user_id=eq.${cloudUserId}&select=*`;
    const res = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        'apikey': spConfig.anonKey,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const pairing = rows[0];
        const isExpired = pairing.expires_at ? new Date(pairing.expires_at).getTime() < Date.now() : false;
        return {
          paired: pairing.is_active === true && !isExpired,
          isExpired,
          pairing
        };
      }
    }
  } catch (_) {}

  return { paired: false, reason: 'NO_ACTIVE_PAIRING' };
}

module.exports = {
  discoverHardwareCode,
  pairAthleteWithEquipment,
  checkAthletePairingStatus
};
