const PRESETS = {
  small: { id: 'small', label: 'Pequena', width: 2.0, height: 1.5, aspectRatio: '4/3' },
  medium: { id: 'medium', label: 'Média', width: 3.0, height: 2.0, aspectRatio: '3/2' },
  large: { id: 'large', label: 'Grande', width: 4.0, height: 3.0, aspectRatio: '4/3' }
};

const Mx = 0.10;
const My = 0.10;
const Gx = 0.30;
const Gy = 0.30;

function calculateWallGeometry(presetKey = 'medium') {
  const preset = PRESETS[presetKey] || PRESETS.medium;
  const W = preset.width;
  const H = preset.height;

  const wt = (W - 2 * Mx - 2 * Gx) / 3;
  const ht = (H - 2 * My - 1 * Gy) / 2;

  const sectors = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const id = r * 3 + c + 1;
      const xStartM = Mx + c * (wt + Gx);
      const xEndM = xStartM + wt;
      const yStartM = My + r * (ht + Gy);
      const yEndM = yStartM + ht;

      const xMin = (xStartM / W) * 100;
      const xMax = (xEndM / W) * 100;
      const yMin = (yStartM / H) * 100;
      const yMax = (yEndM / H) * 100;

      sectors.push({
        id,
        name: `SETOR_${id}`,
        label: `${id}`,
        col: c,
        row: r,
        xStartM: Number(xStartM.toFixed(4)),
        xEndM: Number(xEndM.toFixed(4)),
        yStartM: Number(yStartM.toFixed(4)),
        yEndM: Number(yEndM.toFixed(4)),
        widthM: Number(wt.toFixed(4)),
        heightM: Number(ht.toFixed(4)),
        xMin: Number(xMin.toFixed(3)),
        xMax: Number(xMax.toFixed(3)),
        yMin: Number(yMin.toFixed(3)),
        yMax: Number(yMax.toFixed(3)),
        centerX: Number(((xMin + xMax) / 2).toFixed(3)),
        centerY: Number(((yMin + yMax) / 2).toFixed(3)),
        widthPct: Number(((wt / W) * 100).toFixed(3)),
        heightPct: Number(((ht / H) * 100).toFixed(3)),
        baseScore: 85
      });
    }
  }

  return {
    preset: preset.id,
    label: preset.label,
    widthM: W,
    heightM: H,
    aspectRatio: preset.aspectRatio,
    marginXM: Mx,
    marginYM: My,
    gapXM: Gx,
    gapYM: Gy,
    targetWidthM: Number(wt.toFixed(4)),
    targetHeightM: Number(ht.toFixed(4)),
    sectors
  };
}

function classifyImpact(x, y, presetKey = 'medium') {
  if (x === undefined || x === null || y === undefined || y === null) {
    return {
      classification: 'INVALID',
      hit: false,
      reason: 'Coordenadas não fornecidas'
    };
  }

  const numX = Number(x);
  const numY = Number(y);

  if (numX < 0 || numX > 100 || numY < 0 || numY > 100) {
    return {
      classification: 'OUT_OF_BOUNDS',
      hit: false,
      sectorId: null,
      targetId: null,
      sensorId: null,
      x: numX,
      y: numY,
      reason: 'Impacto fora da área da parede'
    };
  }

  const geometry = calculateWallGeometry(presetKey);

  for (const s of geometry.sectors) {
    if (numX >= s.xMin && numX <= s.xMax && numY >= s.yMin && numY <= s.yMax) {
      return {
        classification: 'TARGET_HIT',
        hit: true,
        sectorId: s.id,
        targetId: s.id,
        sensorId: s.id,
        sector: s,
        x: numX,
        y: numY,
        reason: `Alvo ${s.id} atingido com sucesso`
      };
    }
  }

  return {
    classification: 'NEUTRAL_AREA',
    hit: false,
    sectorId: null,
    targetId: null,
    sensorId: null,
    x: numX,
    y: numY,
    reason: 'Impacto em área neutra (espaçamento ou margem)'
  };
}

for (const key of ['small', 'medium', 'large']) {
  const g = calculateWallGeometry(key);
  console.log(`\n=== PRESET: ${g.label} (${g.widthM}m x ${g.heightM}m) ===`);
  console.log(`Alvo físico: ${g.targetWidthM * 100}cm x ${g.targetHeightM * 100}cm | Espaçamento: 30cm | Margem: 10cm`);
  for (const s of g.sectors) {
    console.log(` Alvo ${s.id} (Col ${s.col}, Lin ${s.row}): X=[${s.xMin}% - ${s.xMax}%], Y=[${s.yMin}% - ${s.yMax}%], Centro=(${s.centerX}%, ${s.centerY}%)`);
  }
}

console.log('\n--- Testes de Classificação de Impacto (Médio) ---');
console.log('Centro Alvo 1:', classifyImpact(15.556, 23.75, 'medium').classification);
console.log('Centro Alvo 2:', classifyImpact(50.0, 23.75, 'medium').classification);
console.log('Centro Alvo 6:', classifyImpact(84.444, 76.25, 'medium').classification);
console.log('Corredor H entre Alvo 1 e 2 (X=32%, Y=23.75%):', classifyImpact(32.0, 23.75, 'medium').classification);
console.log('Corredor V entre Alvo 2 e 5 (X=50%, Y=50%):', classifyImpact(50.0, 50.0, 'medium').classification);
console.log('Margem Esquerda (X=1.5%, Y=23.75%):', classifyImpact(1.5, 23.75, 'medium').classification);
console.log('Fora da Parede (X=105%, Y=50%):', classifyImpact(105.0, 50.0, 'medium').classification);
