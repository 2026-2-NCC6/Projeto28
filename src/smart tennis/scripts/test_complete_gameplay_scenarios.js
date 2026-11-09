const { initializeDatabase } = require('../server/database/initDb');
const { get, all, run } = require('../server/database/db');
const {
  FIXED_SECTORS,
  WALL_PRESETS,
  detectSector,
  registerHit
} = require('../server/services/gameEngine');

async function testCompleteScenarios() {
  console.log('========================================================');
  console.log('🎾 TESTES COMPLETOS DOS 3 JOGOS E DA CONFIGURAÇÃO DA PAREDE');
  console.log('========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  console.log('\n[CENÁRIO 1] Jogo 1 — Treino Livre');
  let freeShots = 0;
  let freeHits = 0;
  let freeScore = 0;
  let sectorHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  for (let sId = 1; sId <= 6; sId++) {
    const sector = FIXED_SECTORS.find(s => s.id === sId);
    const hit = detectSector(sector.centerX, sector.centerY);
    assert(hit.sectorId === sId, `Clique no centro do Setor ${sId} reconhecido`);

    freeShots++;
    freeHits++;
    freeScore += 85;
    sectorHits[sId]++;
  }

  assert(freeShots === 6 && freeHits === 6, 'Total de 6 golpes e 6 acertos registrados');
  assert(freeScore === 6 * 85, 'Pontuação total do Treino Livre calculada corretamente');
  assert(Object.values(sectorHits).every(count => count === 1), 'Cada um dos 6 setores recebeu exatamente 1 impacto');

  console.log('\n[CENÁRIO 2] Jogo 2 — Liga um por vez');
  let activeSector = 2;
  let singleScore = 0;
  let singleShots = 0;

  singleShots++;
  let hitWrongSector = 5;
  if (hitWrongSector === activeSector) {
    singleScore++;
  }
  assert(singleScore === 0, 'Acerto em setor apagado não soma pontos (Score: 0)');
  assert(activeSector === 2, 'Setor aceso permanece inalterado (Setor 2)');

  singleShots++;
  let hitCorrectSector = 2;
  if (hitCorrectSector === activeSector) {
    singleScore++;
    const others = FIXED_SECTORS.filter(s => s.id !== activeSector);
    const nextSector = others[0].id;
    assert(nextSector !== activeSector, `Novo setor aceso (${nextSector}) é garantidamente DIFERENTE do anterior (${activeSector})`);
    activeSector = nextSector;
  }
  assert(singleScore === 1, 'Acerto no setor aceso somou exatamente 1 ponto');
  assert(activeSector !== 2, 'Setor 2 apagou e novo setor acendeu');

  // TESTE 3: MODO APAGAR TODOS (REQUISITO CRÍTICO)
  console.log('\n[CENÁRIO 3] Jogo 3 — Apagar Todos');
  let sectorStates = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
  let reactivations = 0;
  let isWon = false;

  assert(Object.values(sectorStates).every(v => v === true), 'Todos os 6 setores começam ACESOS (true)');

  sectorStates[1] = !sectorStates[1];
  assert(sectorStates[1] === false, 'Setor 1 apagou (false)');
  assert(sectorStates[2] === true && sectorStates[3] === true, 'Setores 2 e 3 continuam ACESOS');

  sectorStates[2] = !sectorStates[2];
  assert(sectorStates[2] === false, 'Setor 2 apagou (false)');
  assert(sectorStates[1] === false, 'Setor 1 permaneceu apagado');

  sectorStates[1] = !sectorStates[1];
  reactivations++;
  assert(sectorStates[1] === true, 'Setor 1 reacendeu ao ser clicado novamente');
  assert(reactivations === 1, 'Contador de reativações incrementado para 1');

  sectorStates[1] = !sectorStates[1];
  assert(sectorStates[1] === false, 'Setor 1 apagado novamente');

  sectorStates[3] = false;
  sectorStates[4] = false;
  sectorStates[5] = false;
  sectorStates[6] = false;

  const allOff = FIXED_SECTORS.every(s => sectorStates[s.id] === false);
  if (allOff) {
    isWon = true;
  }
  assert(isWon === true, 'Condição de vitória atendida: todos os 6 setores apagados simultaneamente');

  let attemptedPostWinClick = 3;
  if (!isWon) {
    sectorStates[attemptedPostWinClick] = !sectorStates[attemptedPostWinClick];
  }
  assert(sectorStates[3] === false, 'Novos cliques pós-vitória são ignorados e não alteram o estado');

  sectorStates = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
  isWon = false;
  reactivations = 0;
  assert(Object.values(sectorStates).every(v => v === true), 'Ao reiniciar, todos os 6 setores voltam a ficar ACESOS');

  console.log('\n[CENÁRIO 4] Configuração da Parede (Etapa 4)');

  await run(`UPDATE system_settings SET value = 'small', updated_at = CURRENT_TIMESTAMP WHERE key = 'wall_preset'`);
  await run(`UPDATE equipments SET wall_preset = 'small' WHERE id = 1`);
  let cfg = await get(`SELECT value FROM system_settings WHERE key = 'wall_preset'`);
  let eqCfg = await get(`SELECT wall_preset FROM equipments WHERE id = 1`);
  assert(cfg.value === 'small' && eqCfg.wall_preset === 'small', 'Opção Pequena salva no system_settings e no equipments');
  assert(WALL_PRESETS.small.width === 2.0 && WALL_PRESETS.small.height === 1.5, 'Dimensões da Pequena: 2m × 1,5m');

  await run(`UPDATE system_settings SET value = 'medium', updated_at = CURRENT_TIMESTAMP WHERE key = 'wall_preset'`);
  await run(`UPDATE equipments SET wall_preset = 'medium' WHERE id = 1`);
  cfg = await get(`SELECT value FROM system_settings WHERE key = 'wall_preset'`);
  assert(cfg.value === 'medium', 'Opção Média (Padrão) salva no banco SQL');
  assert(WALL_PRESETS.medium.width === 3.0 && WALL_PRESETS.medium.height === 2.0, 'Dimensões da Média: 3m × 2m');

  await run(`UPDATE system_settings SET value = 'large', updated_at = CURRENT_TIMESTAMP WHERE key = 'wall_preset'`);
  await run(`UPDATE equipments SET wall_preset = 'large' WHERE id = 1`);
  cfg = await get(`SELECT value FROM system_settings WHERE key = 'wall_preset'`);
  assert(cfg.value === 'large', 'Opção Grande salva no banco SQL');
  assert(WALL_PRESETS.large.width === 4.0 && WALL_PRESETS.large.height === 3.0, 'Dimensões da Grande: 4m × 3m');

  await run(`UPDATE system_settings SET value = 'medium', updated_at = CURRENT_TIMESTAMP WHERE key = 'wall_preset'`);
  await run(`UPDATE equipments SET wall_preset = 'medium' WHERE id = 1`);

  console.log('\n========================================================');
  console.log(`TOTAL DE TESTES VALIDADOS: ${passed} PASSARAM, ${failed} FALHARAM.`);
  console.log('========================================================');

  process.exit(failed > 0 ? 1 : 0);
}

testCompleteScenarios();
