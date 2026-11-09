export const WALL_PRESETS = {
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

export const NICOLAS_WALL_OPTIONS = [
  WALL_PRESETS['4x3'],
  WALL_PRESETS['3x3'],
  WALL_PRESETS['3x2']
];

export const PHYSICAL_CONSTANTS = {
  MARGIN_X_M: 0.10,
  MARGIN_Y_M: 0.10,
  GAP_X_M: 0.30,
  GAP_Y_M: 0.30,
  COLUMNS: 3,
  ROWS: 2,
  TOTAL_TARGETS: 6
};

export function resolveWallPreset(presetOrDims = '3x2') {
  if (presetOrDims && typeof presetOrDims === 'object') {
    const w = Number(presetOrDims.width || presetOrDims.widthM);
    const h = Number(presetOrDims.height || presetOrDims.heightM);
    if (w === 4 && h === 3) return WALL_PRESETS['4x3'];
    if (w === 3 && h === 3) return WALL_PRESETS['3x3'];
    if (w === 3 && h === 2) return WALL_PRESETS['3x2'];
  }
  const key = String(presetOrDims || '3x2').trim().toLowerCase();
  if (WALL_PRESETS[key]) return WALL_PRESETS[key];
  return WALL_PRESETS['3x2'];
}

export function calculateSensorPositions(presetOrDims = '3x2', sensorOffsetsCm = {}) {
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

    const screenXPct = Number((xNorm * 100).toFixed(4));
    const screenYPct = Number(((1 - yNorm) * 100).toFixed(4));

    return {
      id,
      name,
      model: 'KY-037',
      corner,
      cornerLabel,
      idealXM: Number(idealXM.toFixed(4)),
      idealYM: Number(idealYM.toFixed(4)),
      offsetXCm: Number(offsetXCm.toFixed(2)),
      offsetYCm: Number(offsetYCm.toFixed(2)),
      xM: effectiveXM,
      yM: effectiveYM,
      x: effectiveXM,
      y: effectiveYM,
      xNormalized: xNorm,
      yNormalized: yNorm,
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

export function calculateWallGeometry(presetKey = '3x2', sensorOffsetsCm = {}) {
  const preset = resolveWallPreset(presetKey);
  const W = preset.width;
  const H = preset.height;
  const { MARGIN_X_M, MARGIN_Y_M, GAP_X_M, GAP_Y_M } = PHYSICAL_CONSTANTS;

  const wt = (W - 2 * MARGIN_X_M - 2 * GAP_X_M) / 3;
  const ht = (H - 2 * MARGIN_Y_M - 1 * GAP_Y_M) / 2;

  const sectors = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const id = r * 3 + c + 1;
      const xStartM = MARGIN_X_M + c * (wt + GAP_X_M);
      const xEndM = xStartM + wt;
      const yScreenStartM = MARGIN_Y_M + r * (ht + GAP_Y_M);
      const yScreenEndM = yScreenStartM + ht;

      const cartesianYMaxM = H - yScreenStartM;
      const cartesianYMinM = H - yScreenEndM;

      const xMin = (xStartM / W) * 100;
      const xMax = (xEndM / W) * 100;
      const yMin = (yScreenStartM / H) * 100;
      const yMax = (yScreenEndM / H) * 100;

      sectors.push({
        id,
        name: `SETOR_${id}`,
        label: `${id}`,
        col: c,
        row: r,
        xStartM: Number(xStartM.toFixed(4)),
        xEndM: Number(xEndM.toFixed(4)),
        yStartM: Number(yScreenStartM.toFixed(4)),
        yEndM: Number(yScreenEndM.toFixed(4)),
        cartesianXMinM: Number(xStartM.toFixed(4)),
        cartesianXMaxM: Number(xEndM.toFixed(4)),
        cartesianYMinM: Number(cartesianYMinM.toFixed(4)),
        cartesianYMaxM: Number(cartesianYMaxM.toFixed(4)),
        widthM: Number(wt.toFixed(4)),
        heightM: Number(ht.toFixed(4)),
        xMinNorm: Number((xStartM / W).toFixed(6)),
        xMaxNorm: Number((xEndM / W).toFixed(6)),
        yMinNorm: Number((cartesianYMinM / H).toFixed(6)),
        yMaxNorm: Number((cartesianYMaxM / H).toFixed(6)),
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

export function classifyImpact(x, y, presetKey = '3x2') {
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

export const DEFAULT_GEOMETRY = calculateWallGeometry('3x2');
export const FIXED_SECTORS = DEFAULT_GEOMETRY.sectors;
export const FIXED_TARGETS = FIXED_SECTORS;
export const FIXED_SENSORS = DEFAULT_GEOMETRY.sensorList;
