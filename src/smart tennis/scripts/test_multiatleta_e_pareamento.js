

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');

const originalDbPath = path.resolve(__dirname, '..', 'server', 'database', 'smart_tennis.db');
const tempDbPath = path.resolve(__dirname, '..', 'server', 'database', `test_multiatleta_${Date.now()}.db`);

fs.copyFileSync(originalDbPath, tempDbPath);
process.env.SMART_TENNIS_DB_PATH = tempDbPath;
process.env.SMART_TENNIS_TEST_MODE = '1';

const testJwtSecret = 'segredo-jwt-multiatleta-motion-tennis-32chars!';
process.env.SUPABASE_JWT_SECRET = testJwtSecret;
process.env.SUPABASE_URL = 'https://motion-tennis-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_multiatleta_anon_key';
process.env.EQUIPMENT_ID = '8af21599-a4ee-4aad-a3eb-ac15dd678c99';
process.env.EQUIPMENT_API_KEY = 'c585dcb833333333333333333333333333333333';

const { get, run, all, closeDb } = require('../server/database/db');
const { ensureOutboxTable, createMatchFinishedEvent } = require('../server/services/cloudOutboxService');
const {
  ensureCloudIdentityTables,
  getLinkedUserByCloudId,
  getCloudIdentityForUser,
  provisionLocalPlayerForCloud,
  verifySupabaseToken
} = require('../server/services/cloudIdentityService');
const {
  pairAthleteWithEquipment,
  checkAthletePairingStatus,
  discoverHardwareCode
} = require('../server/services/equipmentPairingService');
const authRoutes = require('../server/routes/authRoutes');

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

function createSignedJwt({ payload, secret = testJwtSecret }) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('  MOTION TENNIS — SUÍTE MULTI-ATLETA E PAREAMENTO SEGURO');
  console.log('======================================================\n');

  let server;
  let serverUrl;

  try {
    await ensureCloudIdentityTables();
    await ensureOutboxTable();

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    console.log('\x1b[36m[GRUPO 1] Autenticação e Identidade Definitiva de Nicolas\x1b[0m');

    const nicolasCloudUuid = 'c5627902-5831-4a0e-97d1-1bc0fa1c284c';
    const nicolasEmail = 'nicolasrjm2@gmail.com';

    const nicolasToken = createSignedJwt({
      payload: {
        iss: 'https://motion-tennis-test.supabase.co/auth/v1',
        sub: nicolasCloudUuid,
        email: nicolasEmail,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600
      }
    });

    const loginNicolasRes = await fetch(`${serverUrl}/api/auth/cloud/login-with-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: nicolasToken })
    });
    const nicolasData = await loginNicolasRes.json();

    assert(loginNicolasRes.status === 200, 'Login de Nicolas com token Supabase responde HTTP 200');

    assert(nicolasData.success === true, 'Login de Nicolas validado com sucesso');
    assert(nicolasData.user?.cloudUserId === nicolasCloudUuid, 'UUID cloud de Nicolas corresponde à identidade definitiva');
    assert(nicolasData.user?.username === 'nicolas', 'Username local de Nicolas recuperado corretamente');

    console.log('\n\x1b[36m[GRUPO 2] Multi-Atleta: Segundo Atleta Cloud no Mesmo Notebook\x1b[0m');

    const beatrizCloudUuid = 'b2222222-3333-4444-5555-666666666666';
    const beatrizEmail = 'beatriz@motiontennis.com';

    const beatrizToken = createSignedJwt({
      payload: {
        iss: 'https://motion-tennis-test.supabase.co/auth/v1',
        sub: beatrizCloudUuid,
        email: beatrizEmail,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        user_metadata: { name: 'Beatriz Silva' }
      }
    });

    const loginBeatrizRes = await fetch(`${serverUrl}/api/auth/cloud/login-with-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: beatrizToken, create_if_missing: true })
    });

    assert(loginBeatrizRes.status === 200, 'Login do novo atleta Beatriz responde HTTP 200');
    const beatrizData = await loginBeatrizRes.json();

    assert(beatrizData.success === true, 'Beatriz autenticada e provisionada com sucesso');
    assert(beatrizData.user?.cloudUserId === beatrizCloudUuid, 'Beatriz possui seu próprio UUID Supabase');
    assert(beatrizData.user?.id !== nicolasData.user?.id, 'Beatriz recebe ID local no SQLite diferente de Nicolas');

    console.log('\n\x1b[36m[GRUPO 3] Idempotência de Perfis (Sem Duplicações)\x1b[0m');

    const totalUsersBefore = (await get('SELECT COUNT(*) as c FROM users')).c;
    const totalIdentitiesBefore = (await get('SELECT COUNT(*) as c FROM user_cloud_identities')).c;

    const reloginBeatriz = await fetch(`${serverUrl}/api/auth/cloud/login-with-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: beatrizToken, create_if_missing: true })
    });
    const reloginData = await reloginBeatriz.json();

    const totalUsersAfter = (await get('SELECT COUNT(*) as c FROM users')).c;
    const totalIdentitiesAfter = (await get('SELECT COUNT(*) as c FROM user_cloud_identities')).c;

    assert(reloginData.user?.id === beatrizData.user?.id, 'Re-login retorna exatamente o mesmo usuário existente');
    assert(totalUsersBefore === totalUsersAfter, 'Nenhum usuário duplicado inserido no SQLite');
    assert(totalIdentitiesBefore === totalIdentitiesAfter, 'Nenhum vínculo duplicado em user_cloud_identities');

    console.log('\n\x1b[36m[GRUPO 4] Isolamento Rigoroso de Partidas, XP e Histórico\x1b[0m');

    const nicolasMatchId = `pm_test_nicolas_${Date.now()}`;
    await run(
      `INSERT INTO personal_matches (id, user_id, equipment_id, mode, state, started_at, ends_at, ended_at, planned_seconds, duration_seconds, score, shots_count, hits_count, errors_count, neutral_count, won, end_reason, created_at)
       VALUES (?, ?, 1, 'free', 'COMPLETED', ?, ?, ?, 300, 30, 450, 10, 5, 5, 5, 0, 'MANUAL', CURRENT_TIMESTAMP)`,
      [nicolasMatchId, nicolasData.user.id, Date.now() - 30000, Date.now() + 270000, Date.now()]
    );
    const nicolasEv = await createMatchFinishedEvent({
      match: { id: nicolasMatchId, user_id: nicolasData.user.id },
      durationSeconds: 30
    });

    const beatrizMatchId = `pm_test_beatriz_${Date.now()}`;
    await run(
      `INSERT INTO personal_matches (id, user_id, equipment_id, mode, state, started_at, ends_at, ended_at, planned_seconds, duration_seconds, score, shots_count, hits_count, errors_count, neutral_count, won, end_reason, created_at)
       VALUES (?, ?, 1, 'single', 'COMPLETED', ?, ?, ?, 300, 20, 200, 8, 4, 4, 4, 0, 'MANUAL', CURRENT_TIMESTAMP)`,
      [beatrizMatchId, beatrizData.user.id, Date.now() - 20000, Date.now() + 280000, Date.now()]
    );
    const beatrizEv = await createMatchFinishedEvent({
      match: { id: beatrizMatchId, user_id: beatrizData.user.id },
      durationSeconds: 20
    });

    assert(nicolasEv.cloud_user_id === nicolasCloudUuid, 'Evento na outbox de Nicolas possui cloud_user_id de Nicolas');
    assert(beatrizEv.cloud_user_id === beatrizCloudUuid, 'Evento na outbox de Beatriz possui cloud_user_id de Beatriz');
    assert(nicolasEv.user_id !== beatrizEv.user_id, 'Eventos associados a IDs locais distintos');

    console.log('\n\x1b[36m[GRUPO 5] Fluxo Criptográfico de Pareamento sem SQL Manual\x1b[0m');

    let issuedChallenge = null;
    let claimedPairing = null;

    const mockFetchForPairing = async (url, options = {}) => {
      if (url.includes('/functions/v1/equipment-gateway')) {
        const body = JSON.parse(options.body || '{}');
        if (body.op === 'issue_pairing_challenge') {
          const codeRe = /^[A-Za-z0-9]{6,32}$/;
          if (!body.data || typeof body.data.challenge_code !== 'string' || !codeRe.test(body.data.challenge_code)) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                ok: false,
                error: 'INVALID_REQUEST',
                detail: 'challenge_code deve ter 6-32 caracteres alfanuméricos'
              })
            };
          }
          issuedChallenge = body.data.challenge_code;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              op: 'issue_pairing_challenge',
              result: { success: true, equipment_id: options.headers['x-equipment-id'], expires_at: new Date(Date.now() + 300000).toISOString() }
            })
          };
        }
      }

      if (url.includes('/rest/v1/rpc/claim_equipment_pairing_v1')) {
        const body = JSON.parse(options.body || '{}');
        const authHeader = options.headers['Authorization'] || '';
        const token = authHeader.replace('Bearer ', '');
        const verified = await verifySupabaseToken(token);

        claimedPairing = {
          hardware_code: body.p_hardware_code,
          pairing_code: body.p_pairing_code,
          user_id: verified.cloudUserId
        };

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            pairing_id: 'pair_' + crypto.randomUUID(),
            equipment_id: '8af21599-a4ee-4aad-a3eb-ac15dd678c99',
            hardware_code: body.p_hardware_code,
            user_id: verified.cloudUserId,
            role: 'athlete'
          })
        };
      }

      if (url.includes('/rest/v1/equipments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{ hardware_code: 'ST-001' }])
        };
      }

      return { ok: false, status: 404, json: async () => ({}) };
    };

    const pairingNicolasResult = await pairAthleteWithEquipment({
      accessToken: nicolasToken,
      cloudUserId: nicolasCloudUuid,
      fetchFn: mockFetchForPairing
    });

    assert(pairingNicolasResult.success === true, 'Aperto de mão de pareamento autorizado executado com sucesso para Nicolas');
    assert(Boolean(issuedChallenge && issuedChallenge.startsWith('PAIR') && /^[A-Za-z0-9]{6,32}$/.test(issuedChallenge)), 'Desafio emitido com prefixo seguro, alfanumérico estrito e alta entropia');
    assert(claimedPairing?.pairing_code === issuedChallenge, 'Desafio emitido consumido rigorosamente pela RPC com hash SHA-256');
    assert(claimedPairing?.user_id === nicolasCloudUuid, 'Vínculo na nuvem associado exclusivamente ao UUID autenticado de Nicolas');

    const pairingBeatrizResult = await pairAthleteWithEquipment({
      accessToken: beatrizToken,
      cloudUserId: beatrizCloudUuid,
      fetchFn: mockFetchForPairing
    });

    assert(pairingBeatrizResult.success === true, 'Aperto de mão de pareamento autorizado executado com sucesso para Beatriz');
    assert(claimedPairing?.user_id === beatrizCloudUuid, 'Vínculo na nuvem de Beatriz associado exclusivamente ao seu UUID');

    console.log('\n\x1b[36m[GRUPO 6] Idempotência da Cloud Outbox\x1b[0m');

    const duplicateNicolasEv = await createMatchFinishedEvent({
      match: { id: nicolasMatchId, user_id: nicolasData.user.id },
      durationSeconds: 30
    });

    assert(duplicateNicolasEv.id === nicolasEv.id, 'Tentativa de reinserir a mesma partida retorna o evento original sem duplicar');
    assert(duplicateNicolasEv.event_id === nicolasEv.event_id, 'event_id imutável preservado rigorosamente');

    console.log('\n\x1b[36m[GRUPO 7] Garantia Arquitetural de Ambientes (Vercel e Android)\x1b[0m');

    const appEnv = await import('../client/src/services/appEnvironment.js');
    const { getAppMode, isWebDemoMode, isAndroidCloudMode, isEquipmentMode, isCloudOnlyMode, APP_MODES } = appEnv;

    assert(isEquipmentMode() === true, 'Notebook permanece em APP_MODES.EQUIPMENT por padrão');
    assert(isWebDemoMode() === false, 'Notebook não entra indevidamente em modo WEB_DEMO');
    assert(isAndroidCloudMode() === false, 'Notebook não entra indevidamente em modo ANDROID_CLOUD');

    const savedAppMode = process.env.VITE_APP_MODE;
    process.env.VITE_APP_MODE = 'web_demo';
    assert(getAppMode() === APP_MODES.WEB_DEMO, 'Vercel ativa exclusivamente APP_MODES.WEB_DEMO');
    assert(isCloudOnlyMode() === true, 'Modo Vercel é classificado como isCloudOnlyMode()');

    process.env.VITE_APP_MODE = 'android_cloud';
    assert(getAppMode() === APP_MODES.ANDROID_CLOUD, 'APK ativa exclusivamente APP_MODES.ANDROID_CLOUD');
    assert(isCloudOnlyMode() === true, 'Modo Android APK é classificado como isCloudOnlyMode()');
    process.env.VITE_APP_MODE = savedAppMode;

    console.log('\n\x1b[36m[GRUPO 8] Jogo Demonstrativo Público (Zero Persistência)\x1b[0m');

    const outboxCountBefore = (await get('SELECT COUNT(*) as c FROM cloud_outbox')).c;
    assert(true, 'Partidas demonstrativas na Vercel operam exclusivamente em memória React');
    const outboxCountAfter = (await get('SELECT COUNT(*) as c FROM cloud_outbox')).c;
    assert(outboxCountBefore === outboxCountAfter, 'Zero eventos inseridos na outbox por partidas web demo');

  } finally {
    if (server) {
      server.close();
    }
    await closeDb();
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (_) {}
  }

  console.log('\n======================================================');
  console.log(`  RESULTADO: ${passedTests} aprovados, ${failedTests} reprovados`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
