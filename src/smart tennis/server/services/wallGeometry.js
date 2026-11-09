// SMART TENNIS — GEOMETRIA FÍSICA DA PAREDE, POSICIONAMENTO DOS 3 SENSORES KY-037 E CLASSIFICAÇÃO DE IMPACTOS
// Origem cartesiana física: canto inferior esquerdo da parede = (0, 0).
// Mapeamento físico oficial dos sensores KY-037:
//   S1 = D2 = (0, 0)        -> Canto inferior esquerdo
//   S2 = D3 = (0, altura)   -> Canto superior esquerdo
//   S3 = D4 = (largura, 0)  -> Canto inferior direito
//   Canto superior direito NÃO possui sensor.

const WALL_PRESETS = {
  '4x3': {
    id: '4x3',
    key: '4x3',
    legacyKey: 'large',
    label: '4 × 3 metros',
    shortLabel: '4m × 3m',
    width: 4.0,
    height: 3.0,
    aspectRatio: '4/3',
    ratioClass: 'aspect-[4/3]',
    ratioValue: 4 / 3
  },
  '3x3': {
    id: '3x3',
    key: '3x3',
    legacyKey: '3x3',
    label: '3 × 3 metros',
    shortLabel: '3m × 3m',
    width: 3.0,
    height: 3.0,
    aspectRatio: '1/1',
    ratioClass: 'aspect-square',
    ratioValue: 1.0
  },
  '3x2': {
    id: '3x2',
    key: '3x2',
    legacyKey: 'medium',
    label: '3 × 2 metros',
    shortLabel: '3m × 2m',
    width: 3.0,
    height: 2.0,
    aspectRatio: '3/2',
    ratioClass: 'aspect-[3/2]',
    ratioValue: 3 / 2
  },
  // Aliases de compatibilidade legada
  large: {
    id: '4x3',
    key: '4x3',
    legacyKey: 'large',
    label: '4 × 3 metros',
    shortLabel: '4m × 3m',
    width: 4.0,
    height: 3.0,
    aspectRatio: '4/3',
    ratioClass: 'aspect-[4/3]',
    ratioValue: 4 / 3
  },
  medium: {
    id: '3x2',
    key: '3x2',
    legacyKey: 'medium',
    label: '3 × 2 metros',
    shortLabel: '3m × 2m',
    width: 3.0,
    height: 2.0,
    aspectRatio: '3/2',
    ratioClass: 'aspect-[3/2]',
    ratioValue: 3 / 2
  },
  small: {
    id: 'small',
    key: 'small',
    legacyKey: 'small',
    label: '2 × 1,5 metros',
    shortLabel: '2m × 1,5m',
    width: 2.0,
    height: 1.5,
    aspectRatio: '4/3',
    ratioClass: 'aspect-[4/3]',
    ratioValue: 4 / 3
  }
};

// Opções oficiais selecionáveis para a parede do jogador Nicolas
const NICOLAS_WALL_OPTIONS = [
  WALL_PRESETS['4x3'],
  WALL_PRESETS['3x3'],
  WALL_PRESETS['3x2']
];

// Constantes físicas obrigatórias dos 6 setores (em metros)
const PHYSICAL_CONSTANTS = {
  MARGIN_X_M: 0.10, // Margem externa horizontal: 10 cm
  MARGIN_Y_M: 0.10, // Margem externa vertical: 10 cm
  GAP_X_M: 0.30,    // Espaçamento físico horizontal entre alvos: 30 cm
  GAP_Y_M: 0.30,    // Espaçamento físico vertical entre alvos: 30 cm
  COLUMNS: 3,
  ROWS: 2,
  TOTAL_TARGETS: 6
};

/**
 * Normaliza qualquer identificador de preset ('4x3', '3x3', '3x2', 'large', 'medium', 'small')
 * ou objeto { width, height } para o preset correspondente.
 */
function resolveWallPreset(presetOrDims = '3x2') {
  if (presetOrDims && typeof presetOrDims === 'object') {
    const w = Number(presetOrDims.width || presetOrDims.widthM);
    const h = Number(presetOrDims.height || presetOrDims.heightM);
    if (w === 4 && h === 3) return WALL_PRESETS['4x3'];
    if (w === 3 && h === 3) return WALL_PRESETS['3x3'];
    if (w === 3 && h === 2) return WALL_PRESETS['3x2'];
    if (w > 0 && h > 0) {
      return {
        id: `${w}x${h}`,
        key: `${w}x${h}`,
        label: `${w} × ${h} metros`,
        shortLabel: `${w}m × ${h}m`,
        width: w,
        height: h,
        aspectRatio: `${w}/${h}`,
        ratioClass: w === h ? 'aspect-square' : (w / h === 1.5 ? 'aspect-[3/2]' : 'aspect-[4/3]'),
        ratioValue: w / h
      };
    }
  }
  const key = String(presetOrDims || '3x2').trim().toLowerCase();
  if (WALL_PRESETS[key]) return WALL_PRESETS[key];
  return WALL_PRESETS['3x2'];
}

/**
 * Calcula dinamicamente as coordenadas físicas dos 3 sensores KY-037 instalados nos cantos da parede.
 * Sistema Cartesiano com origem (0, 0) no canto inferior esquerdo:
 *   S1 = D2 = (0, 0)        -> Canto inferior esquerdo
 *   S2 = D3 = (0, altura)   -> Canto superior esquerdo
 *   S3 = D4 = (largura, 0)  -> Canto inferior direito
 *   Canto superior direito NÃO possui sensor.
 *
 * Também permite configurar deslocamentos reais em centímetros (offsetXCm, offsetYCm)
 * caso os sensores físicos sejam instalados ligeiramente afastados dos cantos ideais.
 */
function calculateSensorPositions(presetOrDims = '3x2', sensorOffsetsCm = {}) {
  const preset = resolveWallPreset(presetOrDims);
  const W = Number(preset.width);
  const H = Number(preset.height);

  const offsets = sensorOffsetsCm && typeof sensorOffsetsCm === 'object' ? sensorOffsetsCm : {};

  const buildSensor = (id, name, corner, cornerLabel, idealXM, idealYM) => {
    const rawOffX = Number(offsets[id]?.offsetXCm ?? offsets[id]?.offset_x_cm ?? 0);
    const rawOffY = Number(offsets[id]?.offsetYCm ?? offsets[id]?.offset_y_cm ?? 0);
    const offsetXCm = Number.isFinite(rawOffX) ? rawOffX : 0;
    const offsetYCm = Number.isFinite(rawOffY) ? rawOffY : 0;

    const effectiveXM = Math.max(0, Math.min(W, Number((idealXM + offsetXCm / 100).toFixed(4))));
    const effectiveYM = Math.max(0, Math.min(H, Number((idealYM + offsetYCm / 100).toFixed(4))));

    const xNorm = Number((effectiveXM / W).toFixed(6));
    const yNorm = Number((effectiveYM / H).toFixed(6));

    // Coordenadas de tela (origem visual no topo-esquerdo: X de 0 a 100%, Y de 0 no topo a 100% na base)
    const screenXPct = Number((xNorm * 100).toFixed(4));
    const screenYPct = Number(((1 - yNorm) * 100).toFixed(4));

    return {
      id,
      name,
      model: 'KY-037',
      corner,
      cornerLabel,
      // Coordenadas ideais nos cantos (metros)
      idealXM: Number(idealXM.toFixed(4)),
      idealYM: Number(idealYM.toFixed(4)),
      // Deslocamentos configuráveis em centímetros
      offsetXCm: Number(offsetXCm.toFixed(2)),
      offsetYCm: Number(offsetYCm.toFixed(2)),
      // Coordenadas reais utilizadas nos cálculos TDOA (metros, origem no canto inferior esquerdo)
      xM: effectiveXM,
      yM: effectiveYM,
      x: effectiveXM,
      y: effectiveYM,
      // Coordenadas normalizadas cartesianas (0 a 1)
      xNormalized: xNorm,
      yNormalized: yNorm,
      // Coordenadas percentuais para renderização visual na tela (0 a 100%)
      screenXPct,
      screenYPct
    };
  };

  const S1 = buildSensor('S1', 'Sensor S1', 'bottom_left', 'Canto Inferior Esquerdo', 0, 0);
  const S2 = buildSensor('S2', 'Sensor S2', 'top_left', 'Canto Superior Esquerdo', 0, H);
  const S3 = buildSensor('S3', 'Sensor S3', 'bottom_right', 'Canto Inferior Direito', W, 0);

  return {
    origin: 'bottom_left',
    originDescription: 'Origem cartesiana (0, 0) no canto inferior esquerdo (S1)',
    widthM: W,
    heightM: H,
    sensorCount: 3,
    bottomRightHasSensor: true,
    topRightHasSensor: false,
    sensors: { S1, S2, S3 },
    sensorList: [S1, S2, S3]
  };
}

/**
 * Converte coordenadas físicas em metros (origem no canto inferior esquerdo)
 * para coordenadas normalizadas [0, 1] e coordenadas de tela [0, 100%].
 *
 * X_normalizado = X_metros / largura_metros
 * Y_normalizado = Y_metros / altura_metros
 */
function physicalToNormalized(xMeters, yMeters, presetOrDims = '3x2') {
  const preset = resolveWallPreset(presetOrDims);
  const W = Number(preset.width);
  const H = Number(preset.height);

  if (
    xMeters === undefined || xMeters === null ||
    yMeters === undefined || yMeters === null ||
    !Number.isFinite(Number(xMeters)) || !Number.isFinite(Number(yMeters))
  ) {
    return { valid: false, outOfBounds: false, reason: 'INVALID_COORDINATES' };
  }

  const xM = Number(xMeters);
  const yM = Number(yMeters);
  const eps = 1e-6;
  const outOfBounds = xM < -eps || xM > W + eps || yM < -eps || yM > H + eps;

  const xNormalized = Number((xM / W).toFixed(6));
  const yNormalized = Number((yM / H).toFixed(6));

  // Em coordenadas de tela (DOM): X vai de 0% (esquerda) a 100% (direita);
  // Y_tela vai de 0% (topo = altura H) a 100% (base = origem Y=0).
  const screenXPct = Number((xNormalized * 100).toFixed(4));
  const screenYPct = Number(((1 - yNormalized) * 100).toFixed(4));

  return {
    valid: !outOfBounds,
    outOfBounds,
    widthM: W,
    heightM: H,
    xMeters: Number(xM.toFixed(4)),
    yMeters: Number(yM.toFixed(4)),
    xNormalized,
    yNormalized,
    screenXPct,
    screenYPct
  };
}

/**
 * Converte coordenadas normalizadas cartesianas (X_normalizado, Y_normalizado em [0, 1])
 * para coordenadas físicas em metros (X_metros, Y_metros) na parede selecionada.
 */
function normalizedToPhysical(xNormalized, yNormalized, presetOrDims = '3x2') {
  const preset = resolveWallPreset(presetOrDims);
  const W = Number(preset.width);
  const H = Number(preset.height);

  if (
    xNormalized === undefined || xNormalized === null ||
    yNormalized === undefined || yNormalized === null ||
    !Number.isFinite(Number(xNormalized)) || !Number.isFinite(Number(yNormalized))
  ) {
    return { valid: false, outOfBounds: false, reason: 'INVALID_COORDINATES' };
  }

  const xN = Number(xNormalized);
  const yN = Number(yNormalized);
  const eps = 1e-6;
  const outOfBounds = xN < -eps || xN > 1 + eps || yN < -eps || yN > 1 + eps;

  const xMeters = Number((xN * W).toFixed(4));
  const yMeters = Number((yN * H).toFixed(4));
  const screenXPct = Number((xN * 100).toFixed(4));
  const screenYPct = Number(((1 - yN) * 100).toFixed(4));

  return {
    valid: !outOfBounds,
    outOfBounds,
    widthM: W,
    heightM: H,
    xNormalized: Number(xN.toFixed(6)),
    yNormalized: Number(yN.toFixed(6)),
    xMeters,
    yMeters,
    screenXPct,
    screenYPct
  };
}

/**
 * Calcula a geometria dinâmica da parede, dos 6 setores e dos 3 sensores KY-037
 * @param {string|object} presetKey - '4x3', '3x3', '3x2' (ou aliases 'large', 'medium', 'small')
 * @param {object} sensorOffsetsCm - deslocamentos opcionais dos sensores em cm
 */
function calculateWallGeometry(presetKey = '3x2', sensorOffsetsCm = {}) {
  const preset = resolveWallPreset(presetKey);
  const W = preset.width;
  const H = preset.height;
  const { MARGIN_X_M, MARGIN_Y_M, GAP_X_M, GAP_Y_M } = PHYSICAL_CONSTANTS;

  // Dimensões físicas dos alvos em metros
  // 3 colunas -> 2 margens de 10cm + 2 espaçamentos de 30cm = 0.80m de espaço neutro
  const wt = (W - 2 * MARGIN_X_M - 2 * GAP_X_M) / 3;
  // 2 linhas -> 2 margens de 10cm + 1 espaçamento de 30cm = 0.50m de espaço neutro
  const ht = (H - 2 * MARGIN_Y_M - 1 * GAP_Y_M) / 2;

  const sectors = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const id = r * 3 + c + 1;
      const xStartM = MARGIN_X_M + c * (wt + GAP_X_M);
      const xEndM = xStartM + wt;

      // Coordenada Y de tela (de cima para baixo: r=0 é linha superior [Setores 1,2,3], r=1 é linha inferior [Setores 4,5,6])
      const yScreenStartM = MARGIN_Y_M + r * (ht + GAP_Y_M);
      const yScreenEndM = yScreenStartM + ht;

      // Coordenada Y cartesiana física (origem Y=0 na base inferior esquerda S3, Y=H no topo S1/S2)
      const cartesianYMaxM = H - yScreenStartM;
      const cartesianYMinM = H - yScreenEndM;

      // Normalizado de tela (0 a 100%)
      const xMin = (xStartM / W) * 100;
      const xMax = (xEndM / W) * 100;
      const yMin = (yScreenStartM / H) * 100;
      const yMax = (yScreenEndM / H) * 100;

      // Normalizado cartesiano [0, 1] (X_normalizado = X_m / W, Y_normalizado = Y_m / H)
      const xMinNorm = xStartM / W;
      const xMaxNorm = xEndM / W;
      const yMinNorm = cartesianYMinM / H;
      const yMaxNorm = cartesianYMaxM / H;

      sectors.push({
        id,
        name: `SETOR_${id}`,
        label: `${id}`,
        col: c,
        row: r,
        // Dimensões físicas em metros
        xStartM: Number(xStartM.toFixed(4)),
        xEndM: Number(xEndM.toFixed(4)),
        yStartM: Number(yScreenStartM.toFixed(4)),
        yEndM: Number(yScreenEndM.toFixed(4)),
        cartesianXMinM: Number(xStartM.toFixed(4)),
        cartesianXMaxM: Number(xEndM.toFixed(4)),
        cartesianYMinM: Number(cartesianYMinM.toFixed(4)),
        cartesianYMaxM: Number(cartesianYMaxM.toFixed(4)),
        cartesianCenterXM: Number(((xStartM + xEndM) / 2).toFixed(4)),
        cartesianCenterYM: Number(((cartesianYMinM + cartesianYMaxM) / 2).toFixed(4)),
        widthM: Number(wt.toFixed(4)),
        heightM: Number(ht.toFixed(4)),
        // Coordenadas normalizadas cartesianas [0, 1]
        xMinNorm: Number(xMinNorm.toFixed(6)),
        xMaxNorm: Number(xMaxNorm.toFixed(6)),
        yMinNorm: Number(yMinNorm.toFixed(6)),
        yMaxNorm: Number(yMaxNorm.toFixed(6)),
        centerXNorm: Number(((xMinNorm + xMaxNorm) / 2).toFixed(6)),
        centerYNorm: Number(((yMinNorm + yMaxNorm) / 2).toFixed(6)),
        // Percentual para projeção de tela (0 a 100%)
        xMin: Number(xMin.toFixed(4)),
        xMax: Number(xMax.toFixed(4)),
        yMin: Number(yMin.toFixed(4)),
        yMax: Number(yMax.toFixed(4)),
        centerX: Number(((xMin + xMax) / 2).toFixed(4)),
        centerY: Number(((yMin + yMax) / 2).toFixed(4)),
        widthPct: Number(((wt / W) * 100).toFixed(4)),
        heightPct: Number(((ht / H) * 100).toFixed(4)),
        base_score: 85,
        baseScore: 85
      });
    }
  }

  const sensorLayout = calculateSensorPositions(preset, sensorOffsetsCm);

  return {
    preset: preset.id,
    presetKey: preset.key,
    legacyPreset: preset.legacyKey,
    label: preset.label,
    shortLabel: preset.shortLabel,
    width: W,
    height: H,
    widthM: W,
    heightM: H,
    aspectRatio: preset.aspectRatio,
    ratioClass: preset.ratioClass,
    ratioValue: preset.ratioValue,
    marginXM: MARGIN_X_M,
    marginYM: MARGIN_Y_M,
    gapXM: GAP_X_M,
    gapYM: GAP_Y_M,
    targetWidthM: Number(wt.toFixed(4)),
    targetHeightM: Number(ht.toFixed(4)),
    sectors,
    sensors: sensorLayout.sensors,
    sensorList: sensorLayout.sensorList,
    bottomRightHasSensor: true,
    topRightHasSensor: false
  };
}

/**
 * Classificação matemática unificada de impacto em coordenadas de tela (0 a 100%)
 */
function classifyImpact(x, y, presetKey = '3x2') {
  if (x === undefined || x === null || y === undefined || y === null || Number.isNaN(Number(x)) || Number.isNaN(Number(y))) {
    return {
      classification: 'INVALID',
      hit: false,
      sectorId: null,
      targetId: null,
      sensorId: null,
      reason: 'Coordenadas ausentes'
    };
  }

  const numX = Number(x);
  const numY = Number(y);
  const eps = 1e-4;

  // 1. Rejeição de impactos fora da parede projetada
  if (numX < -eps || numX > 100 + eps || numY < -eps || numY > 100 + eps) {
    return {
      classification: 'OUT_OF_BOUNDS',
      hit: false,
      sectorId: null,
      targetId: null,
      sensorId: null,
      x: numX,
      y: numY,
      reason: 'Impacto fora da área da parede projetada'
    };
  }

  const clampedX = Math.max(0, Math.min(100, numX));
  const clampedY = Math.max(0, Math.min(100, numY));
  const geometry = calculateWallGeometry(presetKey);

  // 2. Identificação de impacto dentro de um alvo válido (tratando bordas de forma inclusiva)
  for (const s of geometry.sectors) {
    if (
      clampedX >= s.xMin - eps && clampedX <= s.xMax + eps &&
      clampedY >= s.yMin - eps && clampedY <= s.yMax + eps
    ) {
      return {
        classification: 'TARGET_HIT',
        hit: true,
        sectorId: s.id,
        targetId: s.id,
        sensorId: s.id,
        sector: s,
        x: Number(clampedX.toFixed(2)),
        y: Number(clampedY.toFixed(2)),
        xNormalized: Number((clampedX / 100).toFixed(4)),
        yNormalized: Number((1 - clampedY / 100).toFixed(4)),
        reason: `Alvo ${s.id} atingido`
      };
    }
  }

  // 3. Impacto dentro da parede, mas na área neutra (espaçamento de 30cm ou margem de 10cm)
  return {
    classification: 'NEUTRAL_AREA',
    hit: false,
    sectorId: null,
    targetId: null,
    sensorId: null,
    x: Number(clampedX.toFixed(2)),
    y: Number(clampedY.toFixed(2)),
    xNormalized: Number((clampedX / 100).toFixed(4)),
    yNormalized: Number((1 - clampedY / 100).toFixed(4)),
    reason: 'Impacto em área neutra (espaçamento entre alvos ou margem)'
  };
}

/**
 * Classifica um impacto a partir de coordenadas normalizadas cartesianas (X_normalizado, Y_normalizado em [0, 1]),
 * onde (0, 0) é o canto inferior esquerdo (S3) e (1, 1) é o canto superior direito (S2).
 */
function classifyNormalizedImpact(xNormalized, yNormalized, presetKey = '3x2') {
  const conv = normalizedToPhysical(xNormalized, yNormalized, presetKey);
  if (!conv.valid) {
    return {
      classification: conv.outOfBounds ? 'OUT_OF_BOUNDS' : 'INVALID',
      hit: false,
      sectorId: null,
      targetId: null,
      sensorId: null,
      xNormalized,
      yNormalized,
      reason: conv.outOfBounds ? 'Coordenadas normalizadas fora do intervalo [0, 1]' : 'Coordenadas normalizadas inválidas'
    };
  }
  const res = classifyImpact(conv.screenXPct, conv.screenYPct, presetKey);
  return {
    ...res,
    xMeters: conv.xMeters,
    yMeters: conv.yMeters,
    xNormalized: conv.xNormalized,
    yNormalized: conv.yNormalized,
    screenXPct: conv.screenXPct,
    screenYPct: conv.screenYPct
  };
}

/**
 * Classifica um impacto a partir de coordenadas físicas em metros (X_metros, Y_metros),
 * com origem (0, 0) no canto inferior esquerdo (S3).
 */
function classifyPhysicalImpact(xMeters, yMeters, presetKey = '3x2') {
  const conv = physicalToNormalized(xMeters, yMeters, presetKey);
  if (!conv.valid) {
    return {
      classification: conv.outOfBounds ? 'OUT_OF_BOUNDS' : 'INVALID',
      hit: false,
      sectorId: null,
      targetId: null,
      sensorId: null,
      xMeters,
      yMeters,
      reason: conv.outOfBounds ? 'Impacto físico fora dos limites da parede' : 'Coordenadas físicas inválidas'
    };
  }
  const res = classifyImpact(conv.screenXPct, conv.screenYPct, presetKey);
  return {
    ...res,
    xMeters: conv.xMeters,
    yMeters: conv.yMeters,
    xNormalized: conv.xNormalized,
    yNormalized: conv.yNormalized,
    screenXPct: conv.screenXPct,
    screenYPct: conv.screenYPct
  };
}

/**
 * Gera um impacto simulado coerente com a geometria física atual da parede.
 */
function generateSimulatedImpact(presetKey = '3x2', targetId = null, available = null, rng = Math.random) {
  const geo = calculateWallGeometry(presetKey);
  const pool = Array.isArray(available) && available.length > 0
    ? geo.sectors.filter((s) => available.map(Number).includes(s.id))
    : geo.sectors;
  const list = pool.length > 0 ? pool : geo.sectors;

  let target = null;
  if (targetId && rng() < 0.85) target = geo.sectors.find((s) => s.id === Number(targetId)) || null;
  if (!target) target = list[Math.floor(rng() * list.length)];

  const speed = Math.round(75 + rng() * 30);
  const isMiss = rng() < 0.08;

  if (!isMiss) {
    const padX = target.widthPct * 0.1;
    const padY = target.heightPct * 0.1;
    const x = target.xMin + padX + rng() * (target.widthPct - 2 * padX);
    const y = target.yMin + padY + rng() * (target.heightPct - 2 * padY);
    return { sensor_id: target.id, target_id: target.id, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), speed, kind: 'target' };
  }

  for (let i = 0; i < 50; i++) {
    const x = rng() * 100;
    const y = rng() * 100;
    if (classifyImpact(x, y, presetKey).classification === 'NEUTRAL_AREA') {
      return { sensor_id: target.id, target_id: target.id, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), speed, kind: 'neutral' };
    }
  }
  return { sensor_id: target.id, target_id: target.id, x: Number((target.xMax + 1).toFixed(2)), y: Number(target.centerY.toFixed(2)), speed, kind: 'neutral' };
}

module.exports = {
  WALL_PRESETS,
  NICOLAS_WALL_OPTIONS,
  PHYSICAL_CONSTANTS,
  resolveWallPreset,
  calculateSensorPositions,
  physicalToNormalized,
  normalizedToPhysical,
  calculateWallGeometry,
  classifyImpact,
  classifyNormalizedImpact,
  classifyPhysicalImpact,
  generateSimulatedImpact
};
