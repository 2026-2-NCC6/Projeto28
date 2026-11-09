const { calculateWallGeometry, classifyImpact, PHYSICAL_CONSTANTS, WALL_PRESETS } = require('../server/services/wallGeometry');
const { detectSector, resolveSensor } = require('../server/services/gameEngine');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('================================================================');
console.log('🎾 TESTES OBRIGATÓRIOS DA FASE 1: GEOMETRIA E CLASSIFICAÇÃO');
console.log('================================================================\n');

console.log('TESTE 1: Quantidade de alvos e organização espacial');
for (const preset of ['small', 'medium', 'large']) {
  const geo = calculateWallGeometry(preset);
  assert(geo.sectors.length === 6, `Preset ${preset}: exatamente 6 alvos gerados`);
  const cols = new Set(geo.sectors.map(s => s.col));
  const rows = new Set(geo.sectors.map(s => s.row));
  assert(cols.size === 3, `Preset ${preset}: exatamente 3 colunas (0, 1, 2)`);
  assert(rows.size === 2, `Preset ${preset}: exatamente 2 linhas (0, 1)`);
}

console.log('\nTESTE 2: Espaçamento físico de 30 cm e margens de 10 cm');
for (const [key, expected] of Object.entries({
  small: { targetW: 0.40, targetH: 0.50, W: 2.0, H: 1.5 },
  medium: { targetW: 0.7333, targetH: 0.75, W: 3.0, H: 2.0 },
  large: { targetW: 1.0667, targetH: 1.25, W: 4.0, H: 3.0 }
})) {
  const geo = calculateWallGeometry(key);
  assert(Math.abs(geo.targetWidthM - expected.targetW) < 0.001, `Preset ${key}: Largura física do alvo calculada = ${geo.targetWidthM}m (${expected.targetW}m esperado)`);
  assert(Math.abs(geo.targetHeightM - expected.targetH) < 0.001, `Preset ${key}: Altura física do alvo calculada = ${geo.targetHeightM}m (${expected.targetH}m esperado)`);
  
  const sumW = 2 * PHYSICAL_CONSTANTS.MARGIN_X_M + 3 * geo.targetWidthM + 2 * PHYSICAL_CONSTANTS.GAP_X_M;
  assert(Math.abs(sumW - expected.W) < 0.001, `Preset ${key}: Soma horizontal (2x10cm + 3x${geo.targetWidthM}m + 2x30cm) = ${sumW.toFixed(2)}m (${expected.W}m parede)`);

  const sumH = 2 * PHYSICAL_CONSTANTS.MARGIN_Y_M + 2 * geo.targetHeightM + 1 * PHYSICAL_CONSTANTS.GAP_Y_M;
  assert(Math.abs(sumH - expected.H) < 0.001, `Preset ${key}: Soma vertical (2x10cm + 2x${geo.targetHeightM}m + 1x30cm) = ${sumH.toFixed(2)}m (${expected.H}m parede)`);
}

console.log('\nTESTE 3: Identificação de cliques no centro de cada um dos 6 alvos');
const geoMed = calculateWallGeometry('medium');
geoMed.sectors.forEach(s => {
  const hit = classifyImpact(s.centerX, s.centerY, 'medium');
  assert(hit.classification === 'TARGET_HIT' && hit.sectorId === s.id, `Centro do Alvo ${s.id} (${s.centerX}%, ${s.centerY}%) -> TARGET_HIT com sectorId=${hit.sectorId}`);
});

console.log('\nTESTE 4: Identificação de cliques nos corredores entre alvos');
const gapH1 = classifyImpact(32.0, 23.75, 'medium');
assert(gapH1.classification === 'NEUTRAL_AREA' && gapH1.hit === false, 'Corredor horizontal entre Alvo 1 e 2 (X=32%, Y=23.75%) -> NEUTRAL_AREA (hit=false)');

const gapH2 = classifyImpact(67.0, 23.75, 'medium');
assert(gapH2.classification === 'NEUTRAL_AREA' && gapH2.hit === false, 'Corredor horizontal entre Alvo 2 e 3 (X=67%, Y=23.75%) -> NEUTRAL_AREA (hit=false)');

const gapV = classifyImpact(50.0, 50.0, 'medium');
assert(gapV.classification === 'NEUTRAL_AREA' && gapV.hit === false, 'Corredor vertical central (X=50%, Y=50%) -> NEUTRAL_AREA (hit=false)');

console.log('\nTESTE 5: Identificação de cliques nas margens externas de 10 cm');
const marginL = classifyImpact(1.5, 23.75, 'medium');
assert(marginL.classification === 'NEUTRAL_AREA' && marginL.hit === false, 'Margem esquerda (X=1.5%, Y=23.75%) -> NEUTRAL_AREA (hit=false)');

const marginR = classifyImpact(98.5, 23.75, 'medium');
assert(marginR.classification === 'NEUTRAL_AREA' && marginR.hit === false, 'Margem direita (X=98.5%, Y=23.75%) -> NEUTRAL_AREA (hit=false)');

const marginT = classifyImpact(50.0, 2.0, 'medium');
assert(marginT.classification === 'NEUTRAL_AREA' && marginT.hit === false, 'Margem superior (X=50%, Y=2.0%) -> NEUTRAL_AREA (hit=false)');

const marginB = classifyImpact(50.0, 97.5, 'medium');
assert(marginB.classification === 'NEUTRAL_AREA' && marginB.hit === false, 'Margem inferior (X=50%, Y=97.5%) -> NEUTRAL_AREA (hit=false)');

console.log('\nTESTE 6: Rejeição de impactos fora da parede projetada');
const outLeft = classifyImpact(-5, 50, 'medium');
assert(outLeft.classification === 'OUT_OF_BOUNDS' && outLeft.hit === false, 'Impacto fora à esquerda (X=-5%) -> OUT_OF_BOUNDS (hit=false)');
const outRight = classifyImpact(105, 50, 'medium');
assert(outRight.classification === 'OUT_OF_BOUNDS' && outRight.hit === false, 'Impacto fora à direita (X=105%) -> OUT_OF_BOUNDS (hit=false)');
const outTop = classifyImpact(50, -10, 'medium');
assert(outTop.classification === 'OUT_OF_BOUNDS' && outTop.hit === false, 'Impacto fora no topo (Y=-10%) -> OUT_OF_BOUNDS (hit=false)');
const outBottom = classifyImpact(50, 110, 'medium');
assert(outBottom.classification === 'OUT_OF_BOUNDS' && outBottom.hit === false, 'Impacto fora abaixo (Y=110%) -> OUT_OF_BOUNDS (hit=false)');

console.log('\nTESTE 7: Integração com o motor do jogo (gameEngine.resolveSensor)');
const resHit = resolveSensor(null, 50.0, 23.75, 'medium');
assert(resHit.is_hit === 1 && resHit.sensor.id === 2, `resolveSensor em (50%, 23.75%) -> is_hit=1, sensor=Alvo 2`);

const resGap = resolveSensor(null, 32.0, 23.75, 'medium');
assert(resGap.is_hit === 0 && resGap.classification === 'NEUTRAL_AREA', `resolveSensor em corredor (32%, 23.75%) -> is_hit=0, classification=NEUTRAL_AREA`);

console.log('\n================================================================');
console.log(`TOTAL DE TESTES EXECUTADOS: ${totalTests} | APROVADOS: ${passedTests} | FALHAS: ${totalTests - passedTests}`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
