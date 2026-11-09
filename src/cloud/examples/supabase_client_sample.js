/**
 * ==============================================================================
 * MOTION TENNIS — CLIENTE SUPABASE DE EXEMPLO
 * ==============================================================================
 * Demonstra a integração segura entre o ecossistema Motion Tennis e a nuvem:
 * 1. Visitante: Consulta o catálogo gratuito da Academy.
 * 2. Notebook da Quadra: Emite desafio de pareamento temporário via issue_equipment_pairing_challenge_v1.
 * 3. Atleta Autenticado: Pareia com o notebook via claim_equipment_pairing_v1 conferindo o hash do código.
 * 4. Notebook da Quadra: Envia telemetria (Heartbeat) e sincroniza partidas atômicas
 *    via RPC com sua credencial individual revogável (NÃO utiliza service_role!).
 *
 * NUNCA insira chaves reais neste arquivo. Defina as variáveis no seu .env.local.
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js');

// 1. Configurações Públicas e do Equipamento (da quadra)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sua-chave-publica-anon';

// Credenciais individuais do notebook (geradas pelo administrador e revogáveis individualmente)
const EQUIPMENT_ID = process.env.EQUIPMENT_ID || '00000000-0000-0000-0000-000000000000';
const EQUIPMENT_HARDWARE_CODE = process.env.EQUIPMENT_HARDWARE_CODE || 'COURT_NOTEBOOK_01';
const EQUIPMENT_API_KEY = process.env.EQUIPMENT_API_KEY || 'mt_eq_live_exemplo_chave_individual';

// 2. Cliente Padrão (utilizado pelo Notebook e pelo App Mobile)
const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

/**
 * Exemplo 1: Consulta pública do catálogo da Academy
 * Apenas aulas com is_published = true e status = 'published' são retornadas.
 */
async function fetchPublishedAcademyLessons() {
  console.log('\n--- 1. CONSULTA PÚBLICA DA ACADEMY (ANON / RLS) ---');
  const { data, error } = await publicClient
    .from('academy_lessons')
    .select('id, module_key, category, title, duration, embed_url')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Erro ao consultar Academy:', error.message);
    return;
  }
  console.log(`Catálogo carregado: ${data.length} aulas públicas disponíveis.`);
}

/**
 * Exemplo 2: Notebook emite desafio de pareamento com TTL de 300 segundos
 */
async function issueCourtChallenge(challengeCode = 'MT7788') {
  console.log('\n--- 2. NOTEBOOK EMITE DESAFIO DE PAREAMENTO (RPC) ---');
  const { data, error } = await publicClient.rpc('issue_equipment_pairing_challenge_v1', {
    p_hardware_code: EQUIPMENT_HARDWARE_CODE,
    p_api_key: EQUIPMENT_API_KEY,
    p_challenge_code: challengeCode,
    p_ttl_seconds: 300
  });

  if (error) {
    console.error('Erro ao emitir desafio:', error.message);
    return null;
  }
  console.log('Desafio emitido com sucesso:', data);
  return data;
}

/**
 * Exemplo 3: Atleta autenticado pareia com o notebook via QR Code (RPC Segura com validação de hash)
 */
async function claimCourtPairing(athleteJwtToken, hardwareCode, pairingCode) {
  console.log('\n--- 3. PAREAMENTO SEGURO ATLETA-QUADRA (RPC) ---');
  const athleteClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${athleteJwtToken}`
      }
    }
  });

  const { data, error } = await athleteClient.rpc('claim_equipment_pairing_v1', {
    p_hardware_code: hardwareCode,
    p_pairing_code: pairingCode
  });

  if (error) {
    console.error('Erro no pareamento:', error.message);
    return;
  }
  console.log('Pareamento realizado com sucesso:', data);
}

/**
 * Exemplo 4: Notebook envia telemetria (Heartbeat de 60s) sem service_role
 */
async function sendEquipmentHeartbeat(metrics = {}) {
  console.log('\n--- 4. ENVIO DE TELEMETRIA POR RPC DO EQUIPAMENTO ---');
  const { data, error } = await publicClient.rpc('record_equipment_heartbeat_v1', {
    p_equipment_id: EQUIPMENT_ID,
    p_api_key: EQUIPMENT_API_KEY,
    p_heartbeat: {
      client_ip: metrics.client_ip || '127.0.0.1',
      ping_ms: metrics.ping_ms || 42,
      pending_outbox_count: metrics.pending_outbox_count || 0,
      db_integrity_ok: true,
      app_version: '2.4.0'
    }
  });

  if (error) {
    console.error('Falha no heartbeat:', error.message);
    return;
  }
  console.log('Resposta do Heartbeat:', data);
}

/**
 * Exemplo 5: Notebook sincroniza partida finalizada chamando RPC segura (Idempotente)
 */
async function syncSessionViaEquipmentRpc(outboxEvent) {
  console.log('\n--- 5. SINCRONIZAÇÃO ATÔMICA DA PARTIDA VIA RPC SEGURA ---');
  const { data, error } = await publicClient.rpc('sync_equipment_session_v1', {
    p_equipment_id: EQUIPMENT_ID,
    p_api_key: EQUIPMENT_API_KEY,
    p_event: outboxEvent
  });

  if (error) {
    console.error('Erro na sincronização da partida:', error.message);
    return;
  }

  if (data.idempotent) {
    console.log(`Partida já havia sido processada anteriormente (${data.status}). Nenhuma duplicação ocorrida.`);
  } else {
    console.log(`Sucesso: Partida sincronizada com ID: ${data.session_id}`);
  }
}

module.exports = {
  publicClient,
  fetchPublishedAcademyLessons,
  issueCourtChallenge,
  claimCourtPairing,
  sendEquipmentHeartbeat,
  syncSessionViaEquipmentRpc
};
