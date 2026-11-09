
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REAL_DB = path.join(ROOT, 'server', 'database', 'smart_tennis.db');
const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}/api`;
const ROUND = 3;
const INTERVAL = 2;

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'st-central-'));
const TEST_DB = path.join(TMP_DIR, 'smart_tennis_test.db');
fs.copyFileSync(REAL_DB, TEST_DB);

const initialRealSha = sha(REAL_DB);

let child = null;
function startServer() {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SMART_TENNIS_DB_PATH: TEST_DB,
      SMART_TENNIS_TEST_MODE: '1',
      SMART_TENNIS_ROUND_SECONDS: String(ROUND)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return waitReady();
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/status`);
      if (r.ok) return;
    } catch (e) {
    }
    await sleep(250);
  }
  throw new Error('Servidor de teste não respondeu.');
}

function stopServer() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    child = null;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, endpoint, token, body) {
  const res = await fetch(BASE + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
  }
  return { status: res.status, body: json };
}

let passed = 0;
let failed = 0;
function assert(desc, cond) {
  if (cond) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('TESTES DE CENTRALIZAÇÃO DO PROCESSAMENTO DE IMPACTOS');
  console.log('========================================================');

  await startServer();

  const adminLogin = await api('POST', '/auth/login', null, { username: 'admin', password: 'admin123' });
  const adminToken = adminLogin.body.token;

  const playerLogin = await api('POST', '/auth/login', null, { username: 'nicolas', password: 'nicolas123' });
  const playerToken = playerLogin.body.token;

  console.log('\n--- 1. CONFIGURAÇÃO PARA MODO SHOPPING ---');
  const setShop = await api('PUT', '/installation', adminToken, {
    mode: 'shopping',
    shoppingIntervalSeconds: INTERVAL
  });
  assert('Instalação alterada para Shopping com sucesso', setShop.status === 200 && setShop.body.mode === 'shopping');

  console.log('\n--- 2. BLOQUEIO DE IMPACTOS SEM EXPERIÊNCIA ATIVA ---');
  const hHitNoExp = await api('POST', '/hardware/hit', null, { sector_id: 2 });
  assert('hardware/hit rejeita com 409 quando sem experiência', hHitNoExp.status === 409);

  const hSimNoExp = await api('POST', '/hardware/simulate', null, { target_id: 2 });
  assert('hardware/simulate rejeita com 409 quando sem experiência', hSimNoExp.status === 409);

  const sSimNoExp = await api('POST', '/shots/simulate', null, { targetZone: 2 });
  assert('shots/simulate rejeita com 409 quando sem experiência', sSimNoExp.status === 409);

  const sManNoExp = await api('POST', '/shots/manual', null, { x: 50, y: 20 });
  assert('shots/manual rejeita com 409 quando sem experiência', sManNoExp.status === 409);

  console.log('\n--- 3. EXPERIÊNCIA ATIVA: PROCESSAMENTO CENTRALIZADO NA RODADA 1 (TREINO LIVRE) ---');
  const startExp = await api('POST', '/experience/start', playerToken, {});
  assert('Experiência Shopping iniciada', startExp.status === 201 && startExp.body.experience && startExp.body.experience.state === 'ACTIVE');
  const expId = startExp.body.experience.id;

  const hSim = await api('POST', '/hardware/simulate', null, { target_id: 2 });
  assert('hardware/simulate aceito na experiência ativa', hSim.status === 200 || hSim.status === 201);
  assert('hardware/simulate sinaliza shopping: true', hSim.body.shopping === true);

  const sSim = await api('POST', '/shots/simulate', null, { targetZone: 2 });
  assert('shots/simulate aceito na experiência ativa', sSim.status === 200 || sSim.status === 201);
  assert('shots/simulate sinaliza shopping: true', sSim.body.shopping === true);

  const sManHit = await api('POST', '/shots/manual', null, { x: 50, y: 20 });
  assert('shots/manual no alvo aceito e pontua', sManHit.status === 201 && sManHit.body.data.points === 85);

  const sManOut = await api('POST', '/shots/manual', null, { x: 120, y: 120 });
  assert('shots/manual fora da parede rejeitado', sManOut.status === 200 && sManOut.body.data.accepted === false && sManOut.body.data.reason === 'OUT_OF_BOUNDS');

  const sManNeutral = await api('POST', '/shots/manual', null, { x: 34.5, y: 20 });
  assert('shots/manual em área neutra classificado como NEUTRAL_AREA (0 pts)', 
    sManNeutral.status === 201 && sManNeutral.body.data.accepted === true && sManNeutral.body.data.hit === false && sManNeutral.body.data.points === 0);

  const evtId = 'dup_evt_test_123';
  const hit1 = await api('POST', '/hardware/hit', null, { x: 50, y: 20, client_event_id: evtId });
  assert('Primeiro envio com client_event_id aceito', hit1.status === 201 && hit1.body.data.accepted === true);

  const hit2 = await api('POST', '/hardware/hit', null, { x: 50, y: 20, client_event_id: evtId });
  assert('Segundo envio com mesmo client_event_id detectado como duplicata', hit2.status === 201 && hit2.body.data.duplicate === true);

  console.log('\n--- 4. TRANSIÇÃO PARA INTERVALO E BLOQUEIO DE TODAS AS ROTAS ---');
  console.log('  Aguardando término da rodada 1...');
  await sleep(3500);

  const stateInt = await api('GET', '/experience/current', playerToken);
  assert('Experiência entrou em estágio de intervalo', stateInt.body.experience && stateInt.body.experience.stage.type === 'interval');

  const hHitInt = await api('POST', '/hardware/hit', null, { x: 50, y: 20 });
  assert('hardware/hit BLOQUEADO durante intervalo (INTERVAL_BLOCKED)', hHitInt.status === 200 && hHitInt.body.data.accepted === false && hHitInt.body.data.reason === 'INTERVAL_BLOCKED');

  const hSimInt = await api('POST', '/hardware/simulate', null, { target_id: 2 });
  assert('hardware/simulate BLOQUEADO durante intervalo (INTERVAL_BLOCKED)', hSimInt.status === 200 && hSimInt.body.data.accepted === false && hSimInt.body.data.reason === 'INTERVAL_BLOCKED');

  const sSimInt = await api('POST', '/shots/simulate', null, { targetZone: 2 });
  assert('shots/simulate BLOQUEADO durante intervalo (INTERVAL_BLOCKED)', sSimInt.status === 200 && sSimInt.body.data.accepted === false && sSimInt.body.data.reason === 'INTERVAL_BLOCKED');

  const sManInt = await api('POST', '/shots/manual', null, { x: 50, y: 20 });
  assert('shots/manual BLOQUEADO durante intervalo (INTERVAL_BLOCKED)', sManInt.status === 200 && sManInt.body.data.accepted === false && sManInt.body.data.reason === 'INTERVAL_BLOCKED');

  console.log('\n--- 5. INTERRUPÇÃO DA EXPERIÊNCIA E BLOQUEIO FINAL ---');
  const abort = await api('POST', `/experience/${expId}/abort`, playerToken, {});
  assert('Experiência interrompida pelo usuário', abort.status === 200 && abort.body.experience && abort.body.experience.state === 'INTERRUPTED');

  const hSimAfter = await api('POST', '/hardware/simulate', null, { target_id: 2 });
  assert('hardware/simulate rejeita 409 após abortada', hSimAfter.status === 409);

  const sSimAfter = await api('POST', '/shots/simulate', null, { targetZone: 2 });
  assert('shots/simulate rejeita 409 após abortada', sSimAfter.status === 409);

  const sManAfter = await api('POST', '/shots/manual', null, { x: 50, y: 20 });
  assert('shots/manual rejeita 409 após abortada', sManAfter.status === 409);

  console.log('\n--- 6. TRANSIÇÃO PARA MODO PESSOAL E TREINOS LIVRES SEM TIMER COMERCIAL ---');
  const setPersonal = await api('PUT', '/installation', adminToken, { mode: 'personal' });
  assert('Instalação alterada para Modo Pessoal', setPersonal.status === 200 && setPersonal.body.mode === 'personal');

  const hHitPers = await api('POST', '/hardware/hit', playerToken, { sector_id: 2, user_id: 2 });
  assert('hardware/hit em Modo Pessoal aceita impacto e pontua', hHitPers.status === 201 && hHitPers.body.success === true && !hHitPers.body.shopping);

  const hSimPers = await api('POST', '/hardware/simulate', playerToken, { target_id: 2, user_id: 2 });
  assert('hardware/simulate em Modo Pessoal gera impacto e registra', hSimPers.status === 200 && hSimPers.body.hit && !hSimPers.body.shopping);

  const sSimPers = await api('POST', '/shots/simulate', playerToken, { targetZone: 2 });
  assert('shots/simulate em Modo Pessoal gera coordenadas e registra', sSimPers.status === 200 && sSimPers.body.hit && !sSimPers.body.shopping);

  const sManPers = await api('POST', '/shots/manual', playerToken, { x: 50, y: 20 });
  assert('shots/manual em Modo Pessoal registra clique livremente', sManPers.status === 200 && sManPers.body.hit && !sManPers.body.shopping);

  console.log('\n--- 7. VERIFICAÇÃO DE INTEGRIDADE DO BANCO REAL ---');
  await stopServer();

  const finalRealSha = sha(REAL_DB);
  assert('Banco SQLite real permaneceu 100% INTOCADO (SHA-256 idêntico)', initialRealSha === finalRealSha);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('========================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
  console.log('========================================================');

  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(async (err) => {
  console.error('Erro nos testes:', err);
  await stopServer();
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(1);
});