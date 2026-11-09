const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('       🎾 SMART TENNIS — SUÍTE DE TESTES E2E        ');
  console.log('====================================================\n');

  try {
    console.log('[TESTE 1] Testando status do sistema e banco...');
    const statusRes = await makeRequest('/api/status');
    if (statusRes.status !== 200 || statusRes.data.status !== 'online') {
      throw new Error(`Falha no status: ${JSON.stringify(statusRes)}`);
    }
    console.log('✓ Status OK: Servidor Online, Banco SQLite Conectado');

    console.log('\n[TESTE 2] Testando login de Jogador (Nicolas)...');
    const playerLogin = await makeRequest('/api/auth/login', 'POST', {
      username: 'nicolas',
      password: 'nicolas123'
    });
    if (playerLogin.status !== 200 || !playerLogin.data.token) {
      throw new Error(`Falha no login do jogador: ${JSON.stringify(playerLogin)}`);
    }
    const playerToken = playerLogin.data.token;
    console.log(`✓ Jogador autenticado com sucesso: ${playerLogin.data.user.name} (Role: ${playerLogin.data.user.role})`);

    console.log('\n[TESTE 3] Testando login de Administrador (Admin)...');
    const adminLogin = await makeRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'admin123'
    });
    if (adminLogin.status !== 200 || !adminLogin.data.token) {
      throw new Error(`Falha no login do admin: ${JSON.stringify(adminLogin)}`);
    }
    const adminToken = adminLogin.data.token;
    console.log(`✓ Administrador autenticado com sucesso: ${adminLogin.data.user.name} (Role: ${adminLogin.data.user.role})`);

    console.log('\n[TESTE 4] Testando proteção de rotas administrativas...');
    const unauthRes = await makeRequest('/api/admin/users');
    if (unauthRes.status !== 401) {
      throw new Error(`Falha: rota admin permitiu acesso não autenticado (Status ${unauthRes.status})`);
    }
    const playerBlockedRes = await makeRequest('/api/admin/users', 'GET', null, playerToken);
    if (playerBlockedRes.status !== 403) {
      throw new Error(`Falha: rota admin permitiu acesso de jogador (Status ${playerBlockedRes.status})`);
    }
    const adminAllowedRes = await makeRequest('/api/admin/users', 'GET', null, adminToken);
    if (adminAllowedRes.status !== 200 || !Array.isArray(adminAllowedRes.data)) {
      throw new Error(`Falha: admin não conseguiu acessar usuários (Status ${adminAllowedRes.status})`);
    }
    console.log(`✓ Proteção de rotas validada: Sem token = 401, Jogador = 403, Admin = 200 OK (${adminAllowedRes.data.length} usuários)`);

    console.log('\n[TESTE 5] Testando API de alvos físicos (TARGET COUNT = 6)...');
    const sensorsRes = await makeRequest('/api/sensors');
    if (sensorsRes.status !== 200 || !Array.isArray(sensorsRes.data) || sensorsRes.data.length !== 6) {
      throw new Error(`Falha nos alvos: esperava exatamente 6 alvos, obteve ${sensorsRes.data?.length}`);
    }
    console.log(`✓ TARGET COUNT = ${sensorsRes.data.length} (Exatamente 6 alvos circulares fixos)`);
    sensorsRes.data.forEach(t => {
      console.log(`  - ${t.name}: Centro em (${t.x}%, ${t.y}%), Raio Detecção: ${t.detection_radius}%`);
    });

    console.log('\n[TESTE 6] Testando detecção por aproximação euclidiana...');
    
    const hitNearRes = await makeRequest('/api/hardware/hit', 'POST', {
      x: 37.0,
      y: 27.0,
      speed: 102.0,
      game_mode: 'free'
    });
    if (hitNearRes.status !== 201 || !hitNearRes.data.data?.hit) {
      throw new Error(`Falha no impacto de aproximação: ${JSON.stringify(hitNearRes)}`);
    }
    const hitNear = hitNearRes.data.data.hit;
    if (hitNear.is_hit !== 1 || hitNear.sensor_id !== 1) {
      throw new Error(`Falha: Esperava acerto no Alvo 1 por aproximação, obteve: ${JSON.stringify(hitNear)}`);
    }
    console.log(`✓ Coordenada (37, 27) associada com sucesso ao Alvo 1 (Distância: ${hitNear.distance}%) — Pontos: ${hitNear.score}, XP: +${hitNear.xp}`);

    const missRes = await makeRequest('/api/hardware/hit', 'POST', {
      x: 50.0,
      y: 50.0,
      speed: 80.0,
      game_mode: 'free'
    });
    const missData = missRes.data.data.hit;
    if (missData.is_hit !== 0 || missData.sensor_id !== null) {
      throw new Error(`Falha: Esperava erro para coordenada (50, 50), obteve: ${JSON.stringify(missData)}`);
    }
    console.log(`✓ Coordenada (50, 50) detectada como FORA DO ALVO (Distância: ${missData.distance}% > 12.0%) — is_hit=0, sensor_id=null`);

    console.log('\n[TESTE 7] Testando Smart Tennis Academy (/api/academy)...');
    const academyRes = await makeRequest('/api/academy');
    if (academyRes.status !== 200 || !academyRes.data.skills || Object.keys(academyRes.data.skills).length < 6) {
      throw new Error(`Falha no catálogo da Academy: ${JSON.stringify(academyRes)}`);
    }
    const precisionSkill = await makeRequest('/api/academy/precision');
    if (precisionSkill.status !== 200 || !precisionSkill.data.skillName || !Array.isArray(precisionSkill.data.cards)) {
      throw new Error(`Falha no conteúdo da habilidade precision: ${JSON.stringify(precisionSkill)}`);
    }
    const skillCount = Object.keys(academyRes.data.skills).length;
    console.log(`✓ Academy carregada com ${skillCount} habilidades. Habilidade "${precisionSkill.data.skillName}" possui ${precisionSkill.data.cards.length} aulas preparadas`);

    console.log('\n[TESTE 8] Testando gestão administrativa de equipamentos...');
    const eqRes = await makeRequest('/api/admin/equipments', 'GET', null, adminToken);
    if (eqRes.status !== 200 || !Array.isArray(eqRes.data)) {
      throw new Error(`Falha ao listar equipamentos: ${JSON.stringify(eqRes)}`);
    }
    console.log(`✓ ${eqRes.data.length} Equipamentos gerenciados pelo Admin (Ex: ${eqRes.data[0]?.name} - Status: ${eqRes.data[0]?.status})`);

    console.log('\n[TESTE 9] Testando entrega estática do frontend e rotas SPA...');
    const frontRes = await makeRequest('/');
    if (frontRes.status !== 200 || typeof frontRes.text !== 'string' || !frontRes.text.includes('<html')) {
      throw new Error(`Falha no frontend estático: HTTP ${frontRes.status}`);
    }
    const spaRes = await makeRequest('/app/dashboard');
    if (spaRes.status !== 200 || typeof spaRes.text !== 'string' || !spaRes.text.includes('<html')) {
      throw new Error(`Falha no fallback SPA /app/dashboard: HTTP ${spaRes.status}`);
    }
    const spaAdminRes = await makeRequest('/admin/overview');
    if (spaAdminRes.status !== 200 || typeof spaAdminRes.text !== 'string' || !spaAdminRes.text.includes('<html')) {
      throw new Error(`Falha no fallback SPA /admin/overview: HTTP ${spaAdminRes.status}`);
    }
    console.log('✓ Frontend React servido com sucesso em / e rotas SPA com fallback index.html');

    console.log('\n====================================================');
    console.log('    🎾 TODOS OS TESTES PASSARAM COM SUCESSO! 9/9     ');
    console.log('====================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERRO DURANTE OS TESTES:', err.message);
    process.exit(1);
  }
}

runTests();
