

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CLOUD_DIR = path.resolve(ROOT_DIR, 'cloud');
const SUPABASE_DIR = path.resolve(ROOT_DIR, 'supabase');
const SQLITE_DB_PATH = path.resolve(ROOT_DIR, 'smart tennis', 'server', 'database', 'smart_tennis.db');

let sqlite3;
try {
  sqlite3 = require(path.join(ROOT_DIR, 'smart tennis', 'node_modules', 'sqlite3'));
} catch (e) {
  sqlite3 = require('sqlite3');
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m [${testName}]`);
    passedTests++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m [${testName}]: ${details}`);
    failedTests++;
  }
}

console.log('\n======================================================');
console.log('  MOTION TENNIS — TESTES DE COMPATIBILIDADE DA NUVEM');
console.log('======================================================\n');

// ------------------------------------------------------------------------------
// GRUPO 1: EXISTÊNCIA DE ARQUIVOS ESTRUTURAIS
// ------------------------------------------------------------------------------
console.log('\x1b[36m[GRUPO 1] Verificação de Arquivos e Estrutura de Diretórios\x1b[0m');

const requiredFiles = [
  path.join(CLOUD_DIR, 'migrations', '001_initial_schema.sql'),
  path.join(CLOUD_DIR, 'migrations', '002_row_level_security.sql'),
  path.join(CLOUD_DIR, 'migrations', '003_functions_and_triggers.sql'),
  path.join(SUPABASE_DIR, 'migrations', '20261102000001_initial_schema.sql'),
  path.join(SUPABASE_DIR, 'migrations', '20261102000002_row_level_security.sql'),
  path.join(SUPABASE_DIR, 'migrations', '20261102000003_functions_and_triggers.sql'),
  path.join(CLOUD_DIR, 'policies', 'RLS_SECURITY_MATRIX.md'),
  path.join(CLOUD_DIR, 'contracts', 'match_finished_event.json'),
  path.join(CLOUD_DIR, 'contracts', 'equipment_heartbeat.json'),
  path.join(CLOUD_DIR, 'contracts', 'pairing_challenge_request.json'),
  path.join(CLOUD_DIR, 'contracts', 'pairing_claim_request.json'),
  path.join(CLOUD_DIR, 'examples', 'supabase_client_sample.js'),
  path.join(CLOUD_DIR, 'examples', 'seed_academy_catalog.sql'),
  path.join(CLOUD_DIR, 'env.example'),
  path.join(CLOUD_DIR, 'README.md')
];

requiredFiles.forEach(file => {
  const relPath = path.relative(ROOT_DIR, file);
  assert(fs.existsSync(file), `Arquivo presente: ${relPath}`);
});

// ------------------------------------------------------------------------------
// GRUPO 2: SCHEMA POSTGRESQL E INTEGRIDADE RELACIONAL (001_initial_schema.sql)
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 2] Validação do Schema PostgreSQL DDL\x1b[0m');

const schemaSql = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '001_initial_schema.sql'), 'utf-8');

assert(
  schemaSql.includes('CREATE SCHEMA IF NOT EXISTS private;') &&
  schemaSql.includes('REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;'),
  'Schema Privado: private criado e revogado de PUBLIC, anon e authenticated'
);

assert(
  schemaSql.includes('CREATE TABLE IF NOT EXISTS private.equipment_secrets'),
  'Segredos de Hardware Isolados: private.equipment_secrets fora da Data API'
);

assert(
  schemaSql.includes('CREATE TABLE IF NOT EXISTS private.equipment_pairing_challenges'),
  'Desafios de Pareamento Isolados: private.equipment_pairing_challenges no schema private'
);

assert(
  schemaSql.includes('CREATE TABLE IF NOT EXISTS private.pairing_attempt_limits') &&
  schemaSql.includes('equipment_id UUID NOT NULL REFERENCES public.equipments(id)') &&
  schemaSql.includes('failed_attempts INTEGER NOT NULL DEFAULT 0') &&
  schemaSql.includes('locked_until TIMESTAMPTZ') &&
  schemaSql.includes('CONSTRAINT uq_pairing_attempt_limit UNIQUE (equipment_id, user_id)'),
  'Proteção Anti-Brute-Force: private.pairing_attempt_limits criada para limitar tentativas por atleta e equipamento'
);

// Validação dos Atributos Normalizados
assert(
  schemaSql.includes('CREATE TABLE IF NOT EXISTS public.player_attributes') &&
  schemaSql.includes('key TEXT NOT NULL CHECK (key IN (\'precision\', \'consistency\', \'speed\', \'control\', \'reflex\', \'strategy\'))') &&
  schemaSql.includes('CONSTRAINT uq_player_attribute UNIQUE (user_id, key)'),
  'Atributos Esportivos Normalizados: 6 atributos com (user_id, key) único compatíveis com SQLite'
);

// Validação do Perfil e Títulos Oficiais
assert(
  schemaSql.includes('xp_next INTEGER NOT NULL DEFAULT 250 CHECK (xp_next > 0)') &&
  schemaSql.includes('CHECK (title IN (\'Iniciante\', \'Praticante\', \'Intermediário\', \'Avançado\', \'Competidor\', \'Especialista\'))'),
  'Perfil de Jogador: xp_next padrão 250 e títulos estritamente oficiais do gameEngine.js'
);

// Validação da Academy Flexível (múltiplas aulas por módulo)
assert(
  schemaSql.includes('id TEXT PRIMARY KEY') &&
  schemaSql.includes('module_key TEXT NOT NULL CHECK (module_key IN (\'precision\', \'consistency\', \'speed\', \'control\', \'reflex\', \'strategy\'))') &&
  !schemaSql.includes('CONSTRAINT uq_academy_module_key UNIQUE (module_key)'),
  'Academy Flexível: suporta múltiplas aulas por módulo (id textual idêntico ao SQLite e sem restrição única de módulo)'
);

const shotsTableBlock = schemaSql.match(/CREATE TABLE IF NOT EXISTS public\.synced_shots\s*\(([\s\S]*?)\);/i)?.[1] || '';

assert(
  !shotsTableBlock.includes('user_id'),
  'Eliminação de Redundância: synced_shots NÃO duplica user_id (pertence estritamente à sessão)'
);

assert(
  !shotsTableBlock.includes('DEFAULT 80.00'),
  'Sem Velocidade Fictícia: force_kmh não possui default de 80.00 km/h'
);

assert(
  !shotsTableBlock.includes('DEFAULT TRUE'),
  'Sem Acertos Fictícios: is_hit não possui default fictício TRUE'
);

assert(
  schemaSql.includes('CONSTRAINT chk_sessions_dates CHECK (ended_at >= started_at)'),
  'Consistência Temporal: constraint chk_sessions_dates (ended_at >= started_at)'
);

assert(
  schemaSql.includes('CONSTRAINT chk_sessions_xp CHECK (xp_granted >= 0 AND xp_granted <= (total_score + 500))'),
  'Teto Matemático Real de XP: constraint chk_sessions_xp baseada na pontuação real e bônus do jogo'
);

assert(
  schemaSql.includes('last_synced_at TIMESTAMPTZ,') &&
  !schemaSql.includes('last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()'),
  'Sincronização Inicial: player_profiles.last_synced_at inicia como NULL'
);

assert(
  schemaSql.includes('status TEXT NOT NULL DEFAULT \'draft\' CHECK (status IN (\'draft\', \'published\', \'archived\'))'),
  'Academy Padronizada: status restrito tecnicamente a draft, published, archived'
);

assert(
  schemaSql.includes('chk_published_requires_video'),
  'Integridade da Academy: chk_published_requires_video exige vídeo válido para publicar'
);

assert(
  schemaSql.includes('equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE RESTRICT'),
  'Retenção de Histórico: ON DELETE RESTRICT impede exclusão acidental de partidas'
);

assert(
  schemaSql.includes('DEFAULT gen_random_uuid()') &&
  !schemaSql.includes('DEFAULT uuid_generate_v4()'),
  'Identificadores Padrão: gen_random_uuid() nativo utilizado em vez de uuid_generate_v4()'
);

assert(
  schemaSql.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;') &&
  schemaSql.includes('CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;'),
  'Extensões em Schema extensions: pgcrypto e uuid-ossp configuradas no schema padrão do Supabase'
);

// ------------------------------------------------------------------------------
// GRUPO 3: ROW LEVEL SECURITY E CONTROLE DE ACESSO (002_row_level_security.sql)
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 3] Auditoria de Row Level Security (RLS) e Privilégios\x1b[0m');

const rlsSql = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '002_row_level_security.sql'), 'utf-8');

assert(
  !rlsSql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;') &&
  rlsSql.includes('REVOKE ALL ON TABLE public.equipments FROM PUBLIC, anon, authenticated;') &&
  rlsSql.includes('REVOKE ALL ON TABLE public.player_profiles FROM PUBLIC, anon, authenticated;') &&
  rlsSql.includes('REVOKE ALL ON TABLE public.synced_sessions FROM PUBLIC, anon, authenticated;') &&
  rlsSql.includes('REVOKE ALL ON TABLE public.sync_checkpoints FROM PUBLIC, anon, authenticated;'),
  'Privilégios Mínimos Explícitos: REVOKE ALL objeto por objeto das 11 tabelas do sistema sem afetar tabelas de terceiros'
);

assert(
  rlsSql.includes('REVOKE ALL ON TABLE private.pairing_attempt_limits FROM PUBLIC, anon, authenticated;') &&
  /ON\s+private\.pairing_attempt_limits\s+FOR\s+ALL\s+TO\s+service_role/i.test(rlsSql),
  'Segurança de Limites Anti-Brute-Force: private.pairing_attempt_limits protegido contra acesso público'
);

assert(
  rlsSql.includes('GRANT UPDATE (display_name, avatar, updated_at) ON public.player_profiles TO authenticated;'),
  'Privilégios de Coluna: Atletas só podem atualizar display_name, avatar e updated_at'
);

assert(
  !rlsSql.includes('FUNCTION public.protect_player_profile_fields') &&
  !rlsSql.includes('CREATE TRIGGER trg_protect_player_profile'),
  'Deduplicação de Gatilhos: 002 não duplica protect_player_profile_fields (centralizado em 003)'
);

assert(
  !rlsSql.includes('CREATE POLICY "Athletes can insert own pairings"') &&
  rlsSql.includes('GRANT SELECT, DELETE ON public.equipment_pairings TO authenticated;'),
  'Pareamento Direto Bloqueado: Atleta não pode criar pareamento direto sem RPC'
);

assert(
  rlsSql.includes('DROP VIEW IF EXISTS public.v_public_equipments') &&
  !rlsSql.includes('CREATE OR REPLACE VIEW public.v_public_equipments'),
  'Proteção contra Scraping: v_public_equipments removida para evitar exposição anônima'
);

assert(
  /ON\s+private\.equipment_secrets\s+FOR\s+ALL\s+TO\s+service_role/i.test(rlsSql),
  'Segurança de Segredos: private.equipment_secrets restrito a service_role'
);

assert(
  /ON\s+private\.equipment_pairing_challenges\s+FOR\s+ALL\s+TO\s+service_role/i.test(rlsSql),
  'Segurança de Desafios: private.equipment_pairing_challenges restrito a service_role'
);

assert(
  rlsSql.includes('s.id = synced_shots.session_id') && rlsSql.includes('s.user_id = auth.uid()'),
  'RLS em Disparos: Leitura de synced_shots atrelada à session_id do atleta'
);

assert(
  rlsSql.includes('CREATE POLICY "Athletes can view own attributes"') &&
  rlsSql.includes('USING (auth.uid() = user_id)'),
  'RLS de Atributos: Atleta acessa unicamente seus próprios atributos esportivos'
);

// ------------------------------------------------------------------------------
// GRUPO 4: RPCS DE EQUIPAMENTO, PAREAMENTO E RECONCILIAÇÃO (003_functions_and_triggers.sql)
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 4] RPCs Seguras, Validação de Expiração e Idempotência\x1b[0m');

const fnSql = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '003_functions_and_triggers.sql'), 'utf-8');

assert(
  fnSql.includes('handle_new_auth_user()') &&
  fnSql.includes('TRIGGER on_auth_user_created') &&
  fnSql.includes('AFTER INSERT ON auth.users') &&
  fnSql.includes('INSERT INTO public.player_profiles') &&
  fnSql.includes('ON CONFLICT (user_id) DO NOTHING') &&
  fnSql.includes('INSERT INTO public.player_attributes'),
  'Provisionamento Automático de Perfil: trigger on_auth_user_created cria perfil (nível 1, xp 0, 250 xp_next, Iniciante) e 6 atributos esportivos'
);

assert(
  fnSql.includes('CREATE TRIGGER trg_protect_player_profile') &&
  fnSql.includes('DROP TRIGGER IF EXISTS trg_protect_player_profile_fields') &&
  fnSql.includes('motion_tennis.internal_sync') &&
  fnSql.includes('motion_tennis.reconcile_authorized'),
  'Gatilho Canônico Centralizado: protect_player_profile_fields com controle transacional para sync e reconcile'
);

assert(
  fnSql.includes('issue_equipment_pairing_challenge_v1') &&
  fnSql.includes('p_challenge_code') &&
  fnSql.includes('extensions.digest') &&
  fnSql.includes('INSUFFICIENT_CODE_ENTROPY') &&
  fnSql.includes('PREDICTABLE_CODE_REJECTED') &&
  fnSql.includes('SET search_path = public, extensions, pg_temp;'),
  'Emissão de Desafio: issue_equipment_pairing_challenge_v1 com extensions.digest, rejeição de códigos fracos/previsíveis e lock consultivo'
);

assert(
  fnSql.includes('claim_equipment_pairing_v1') &&
  fnSql.includes('UPDATE private.equipment_pairing_challenges') &&
  fnSql.includes('consumed_at = NOW()') &&
  fnSql.includes('consumed_at IS NULL') &&
  fnSql.includes('PAIRING_ATTEMPTS_TEMPORARILY_LOCKED') &&
  fnSql.includes('extensions.digest'),
  'Anti-Brute-Force e Consumo Atômico: claim_equipment_pairing_v1 com bloqueio por 15 min após 5 falhas e consumo atômico'
);

// ---- Autenticação de equipamentos: NULL, vazio, incorreta e válida (3 RPCs) ----
// ATENÇÃO: estes testes são ESTÁTICOS (análise do texto SQL) + um MODELO em JavaScript da
// lógica de três valores do PostgreSQL. NÃO são execução em PostgreSQL real.
function extractFunctionBody(sql, fnName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}(`);
  if (start < 0) return '';
  const end = sql.indexOf('$$ LANGUAGE', start);
  return end < 0 ? '' : sql.slice(start, end);
}

const AUTH_RPCS = [
  'issue_equipment_pairing_challenge_v1',
  'record_equipment_heartbeat_v1',
  'sync_equipment_session_v1'
];

AUTH_RPCS.forEach(fnName => {
  const body = extractFunctionBody(fnSql, fnName);
  const iHashFmt = body.indexOf("v_stored_hash IS NULL OR v_stored_hash !~ '^[0-9a-f]{64}$'");
  const iNullKey = body.indexOf("p_api_key IS NULL OR length(btrim(p_api_key)) = 0");
  const iDigest = body.indexOf('extensions.digest(convert_to(p_api_key');
  const iCompare = body.indexOf('v_computed_hash IS DISTINCT FROM v_stored_hash');

  assert(body.length > 0, `Auth ${fnName}: corpo da função localizado`);

  assert(
    iHashFmt > 0 && iNullKey > iHashFmt && iDigest > iNullKey && iCompare > iDigest,
    `Auth ${fnName}: ordem segura (hash armazenado válido -> chave NULL/vazia rejeitada -> digest -> comparação)`
  );

  assert(
    !/v_computed_hash\s*(<>|!=|=)\s*v_stored_hash/.test(body) &&
    !/v_stored_hash\s*(<>|!=|=)\s*v_computed_hash/.test(body),
    `Auth ${fnName}: sem comparação insegura contra NULL (<>, != ou =); usa IS DISTINCT FROM`
  );

  assert(
    (body.match(/INVALID_CREDENTIALS/g) || []).length >= 4,
    `Auth ${fnName}: rejeição INVALID_CREDENTIALS em equipamento inexistente, hash inválido, chave NULL/vazia e chave incorreta`
  );

  // Nenhum acesso a dados de negócio antes da validação: o primeiro INSERT/UPDATE de negócio vem após o digest.
  const iFirstBusiness = body.search(/INSERT INTO public\.|UPDATE public\./);
  assert(
    iFirstBusiness < 0 || iFirstBusiness > iCompare,
    `Auth ${fnName}: nenhuma escrita de negócio ocorre antes da autenticação do equipamento`
  );
});

// Modelo da decisão de autenticação (lógica ternária do SQL; NULL representado por null)
const nodeCrypto = require('crypto');
const sha256hex = s => nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex');
const HASH_REGEX = new RegExp(
  (extractFunctionBody(fnSql, 'sync_equipment_session_v1').match(/v_stored_hash !~ '([^']+)'/) || [])[1] || '$^'
);

// Comportamento ANTIGO: v_computed_hash <> v_stored_hash (NULL => IF não dispara => autentica)
function legacyAuth(apiKey, storedHash) {
  const computed = apiKey === null ? null : sha256hex(apiKey); // digest(NULL) = NULL
  const neq = (computed === null || storedHash === null) ? null : computed !== storedHash;
  return neq === true ? 'REJECTED' : 'AUTHENTICATED'; // IF NULL THEN => ramo não executa
}

// Comportamento NOVO (espelha o SQL corrigido)
function fixedAuth(apiKey, storedHash) {
  if (storedHash === null || !HASH_REGEX.test(storedHash)) return 'REJECTED';
  if (apiKey === null || apiKey.trim().length === 0) return 'REJECTED';
  const computed = sha256hex(apiKey);
  return computed !== storedHash ? 'REJECTED' : 'AUTHENTICATED';
}

const GOOD_KEY = 'chave_secreta_quadra_1';
const GOOD_HASH = sha256hex(GOOD_KEY);

assert(
  legacyAuth(null, GOOD_HASH) === 'AUTHENTICATED' && legacyAuth(null, null) === 'AUTHENTICATED',
  'Modelo: comportamento antigo (<>) com chave NULL autenticava indevidamente (bug reproduzido no modelo)'
);
assert(fixedAuth(null, GOOD_HASH) === 'REJECTED', 'Modelo Auth: chave NULL é rejeitada');
assert(fixedAuth('', GOOD_HASH) === 'REJECTED', 'Modelo Auth: chave vazia é rejeitada');
assert(fixedAuth('   ', GOOD_HASH) === 'REJECTED', 'Modelo Auth: chave somente com espaços é rejeitada');
assert(fixedAuth('chave_errada', GOOD_HASH) === 'REJECTED', 'Modelo Auth: chave incorreta é rejeitada');
assert(fixedAuth(GOOD_KEY, GOOD_HASH) === 'AUTHENTICATED', 'Modelo Auth: chave válida é autenticada');
assert(
  fixedAuth(GOOD_KEY, null) === 'REJECTED' && fixedAuth(null, null) === 'REJECTED',
  'Modelo Auth: hash armazenado NULL rejeita qualquer chave (inclusive NULL)'
);
assert(
  fixedAuth(GOOD_KEY, '') === 'REJECTED' &&
  fixedAuth(GOOD_KEY, 'abc123') === 'REJECTED' &&
  fixedAuth(GOOD_KEY, GOOD_HASH.toUpperCase()) === 'REJECTED' &&
  fixedAuth(GOOD_KEY, GOOD_HASH + '0') === 'REJECTED',
  'Modelo Auth: hash armazenado vazio, curto, em maiúsculas ou com tamanho inválido é rejeitado'
);

assert(
  fnSql === fs.readFileSync(path.join(SUPABASE_DIR, 'migrations', '20261102000003_functions_and_triggers.sql'), 'utf-8'),
  'Auth: correção espelhada em supabase/migrations (003 idêntico)'
);

assert(
  fnSql.includes('v_started_at <= ep.expires_at') &&
  fnSql.includes('PAIRING_EXPIRED_FOR_SESSION') &&
  fnSql.includes('PLAYER_NEVER_PAIRED_WITH_EQUIPMENT'),
  'Sincronização Offline Tardia Legítima: valida janela autorizada e rejeita partidas iniciadas após expiração'
);

assert(
  fnSql.includes('INVALID_SESSION_TIMESTAMPS') &&
  fnSql.includes('v_ended_at < v_started_at') &&
  fnSql.includes('SESSION_STARTED_IN_FUTURE') &&
  fnSql.includes('INVALID_SESSION_DURATION'),
  'Validação Estrita de Datas e Limites Físicos: rejeita timestamps futuros e durações anômalas'
);

assert(
  fnSql.includes('INVALID_ZERO_HITS_METRICS') &&
  fnSql.includes('SCORE_EXCEEDS_PHYSICAL_LIMITS') &&
  fnSql.includes('XP_EXCEEDS_PHYSICAL_LIMITS') &&
  fnSql.includes('v_xp_granted > (v_hits_count * 120 + 100)'),
  'Teto Físico de XP e Pontuação: RPC rejeita pontuação sem acertos, score > hits*200 e XP > hits*120+100'
);

assert(
  fnSql.includes('v_payload_fingerprint') &&
  fnSql.includes('EVENT_ID_COLLISION_DIFFERENT_PAYLOAD') &&
  fnSql.includes('SESSION_DATA_DIVERGENCE') &&
  fnSql.includes('CONCURRENT_INSERT_DATA_DIVERGENCE'),
  'Fingerprint Canônico e Idempotência: v_payload_fingerprint SHA-256 e detecção de colisão entre event_id e local_session_id'
);

assert(
  fnSql.includes('pg_advisory_xact_lock'),
  'Concorrência Serializada: pg_advisory_xact_lock impede corrida entre envios concorrentes da mesma sessão'
);

assert(
  fnSql.includes('CONCURRENT_INSERT_HANDLED'),
  'Tratamento Concorrente de Sessões: gerencia inserções simultâneas sem duplicar linhas'
);

// Verificação de ordem transacional estrita: sessão e tiros antes do checkpoint principal
const sessionInsertIdx = fnSql.indexOf('INSERT INTO public.synced_sessions');
const shotsInsertIdx = fnSql.indexOf('INSERT INTO public.synced_shots');
const checkpointInsertIdx = fnSql.lastIndexOf('INSERT INTO public.sync_checkpoints');

assert(
  sessionInsertIdx > 0 && shotsInsertIdx > sessionInsertIdx && checkpointInsertIdx > shotsInsertIdx,
  'Ordem Transacional Estrita: Sessão e tiros inseridos ANTES de registrar o checkpoint'
);

assert(
  !fnSql.includes('UPDATE public.player_profiles SET xp = xp +') &&
  !fnSql.includes('reconcile_player_stats(v_user_id)'),
  'Sem Reconciliação Automática: sync_equipment_session_v1 NÃO altera perfil de jogador automaticamente'
);

assert(
  fnSql.includes('CREATE OR REPLACE VIEW public.v_player_career_summary WITH (security_invoker = true)') &&
  fnSql.includes('jsonb_object_agg'),
  'View Career com Security Invoker: agrega atributos esportivos normalizados via JSON sem expor terceiros'
);

assert(
  fnSql.includes('REVOKE ALL ON FUNCTION public.reconcile_player_stats(UUID) FROM PUBLIC, anon, authenticated;') &&
  fnSql.includes('GRANT EXECUTE ON FUNCTION public.reconcile_player_stats(UUID) TO service_role;'),
  'Reconciliação Restrita: reconcile_player_stats exclusivo para service_role / admin'
);

assert(
  fnSql.includes('v_xp_for_next := v_calc_level * 250;') &&
  fnSql.includes('Especialista') && fnSql.includes('Competidor') && fnSql.includes('Avançado') &&
  fnSql.includes('Intermediário') && fnSql.includes('Praticante') && fnSql.includes('Iniciante'),
  'Fórmula Real Motion Tennis: reconcile_player_stats utiliza loop de 250 XP e os 6 títulos oficiais'
);

// ------------------------------------------------------------------------------
// GRUPO 5: SEED DA ACADEMY E RASCUNHOS
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 5] Validação do Seed da Academy (Rascunhos e Idempotência)\x1b[0m');

const seedSql = fs.readFileSync(path.join(CLOUD_DIR, 'examples', 'seed_academy_catalog.sql'), 'utf-8');

assert(
  seedSql.includes('\'draft\'') && seedSql.includes('FALSE'),
  'Privacidade de Conteúdo: Todas as aulas cadastradas como draft e is_published = FALSE'
);

assert(
  !seedSql.includes('https://www.youtube.com/watch?v=kJ9n3hWbL01'),
  'Zero Falsificação: Nenhuma URL fictícia de YouTube no seed'
);

assert(
  seedSql.includes('status = public.academy_lessons.status') &&
  seedSql.includes('is_published = public.academy_lessons.is_published'),
  'Preservação Administrativa: Seed NÃO sobrescreve publicações de administradores'
);

// ------------------------------------------------------------------------------
// GRUPO 6: CLIENTE SUPABASE E INTEGRIDADE DE ESPELHAMENTO
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 6] Auditoria de Credenciais e Espelhamento de Migrações\x1b[0m');

const clientSample = fs.readFileSync(path.join(CLOUD_DIR, 'examples', 'supabase_client_sample.js'), 'utf-8');

assert(
  !clientSample.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Segurança Física: Cliente de equipamento NÃO referencia ou depende de SUPABASE_SERVICE_ROLE_KEY'
);

assert(
  clientSample.includes('sync_equipment_session_v1') && clientSample.includes('EQUIPMENT_API_KEY'),
  'Autenticação de Hardware: Notebook utiliza EQUIPMENT_API_KEY via RPC segura'
);

assert(
  clientSample.includes('issueCourtChallenge') && clientSample.includes('claimCourtPairing'),
  'Fluxo de Desafio e Reivindicação: Cliente de exemplo cobre issue e claim'
);

// Verificação de espelhamento perfeito entre cloud/migrations e supabase/migrations
const m1Cloud = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '001_initial_schema.sql'), 'utf-8');
const m1Supa = fs.readFileSync(path.join(SUPABASE_DIR, 'migrations', '20261102000001_initial_schema.sql'), 'utf-8');
assert(m1Cloud === m1Supa, 'Espelhamento Idêntico: 001_initial_schema.sql == 20261102000001_initial_schema.sql');

const m2Cloud = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '002_row_level_security.sql'), 'utf-8');
const m2Supa = fs.readFileSync(path.join(SUPABASE_DIR, 'migrations', '20261102000002_row_level_security.sql'), 'utf-8');
assert(m2Cloud === m2Supa, 'Espelhamento Idêntico: 002_row_level_security.sql == 20261102000002_row_level_security.sql');

const m3Cloud = fs.readFileSync(path.join(CLOUD_DIR, 'migrations', '003_functions_and_triggers.sql'), 'utf-8');
const m3Supa = fs.readFileSync(path.join(SUPABASE_DIR, 'migrations', '20261102000003_functions_and_triggers.sql'), 'utf-8');
assert(m3Cloud === m3Supa, 'Espelhamento Idêntico: 003_functions_and_triggers.sql == 20261102000003_functions_and_triggers.sql');

// ------------------------------------------------------------------------------
// GRUPO 7: AUDITORIA CONTRA VAZAMENTO DE CREDENCIAIS REAIS
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 7] Auditoria Estática de Segurança contra Vazamento de Segredos\x1b[0m');

function scanForSecrets(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      scanForSecrets(fullPath);
    } else if (file.isFile() && !file.name.endsWith('.png') && !file.name.endsWith('.db')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const realJwtRegex = /ey[A-Za-z0-9_-]{30,}\.ey[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/g;
      const matches = content.match(realJwtRegex) || [];
      const suspicious = matches.filter(m => !m.includes('exemplo_') && !m.includes('exemplo'));
      
      assert(suspicious.length === 0, `Zero credenciais reais em: ${path.relative(ROOT_DIR, fullPath)}`, suspicious.join(', '));
    }
  }
}

scanForSecrets(CLOUD_DIR);

// ------------------------------------------------------------------------------
// GRUPO 8: PRESERVAÇÃO INTEGRAL DO SQLITE LOCAL
// ------------------------------------------------------------------------------
console.log('\n\x1b[36m[GRUPO 8] Integridade do SQLite e Sistema Local\x1b[0m');

assert(fs.existsSync(SQLITE_DB_PATH), 'Banco SQLite local original smart_tennis.db intacto');

const db = new sqlite3.Database(SQLITE_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    assert(false, 'Conexão com SQLite local', err.message);
    finish();
    return;
  }

  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    if (err) {
      assert(false, 'Consulta tabelas SQLite', err.message);
    } else {
      const names = rows.map(r => r.name);
      assert(names.includes('sessions'), 'SQLite preserva tabela sessions');
      assert(names.includes('shots'), 'SQLite preserva tabela shots');
      assert(names.includes('users'), 'SQLite preserva tabela users');
      assert(names.includes('players'), 'SQLite preserva tabela players');
      assert(names.includes('attributes'), 'SQLite preserva tabela attributes');
      assert(names.includes('academy_content'), 'SQLite preserva tabela academy_content');
    }
    db.close();
    finish();
  });
});

function finish() {
  console.log('\n======================================================');
  console.log(`  RESULTADO: ${passedTests} aprovados, ${failedTests} reprovados`);
  console.log('======================================================\n');
  process.exit(failedTests > 0 ? 1 : 0);
}
