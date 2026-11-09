const { run, get, all, exec } = require('../database/db');
const {
  NICOLAS_WALL_OPTIONS,
  resolveWallPreset,
  calculateSensorPositions,
  calculateWallGeometry,
  classifyPhysicalImpact
} = require('./wallGeometry');

const ALLOWED_NICOLAS_PRESETS = new Set(['4x3', '3x3', '3x2', 'large', 'medium']);

const DEFAULT_CALIBRATION_PARAMS = {
  calibrated: false,
  propagationSpeedMps: null,
  groupingWindowUs: 25000,
  refractoryWindowUs: 40000,
  maxResidualM: 0.20,
  causalityToleranceFactor: 1.15,
  sensorDelayOffsetsUs: { S1: 0, S2: 0, S3: 0 },
  minSignalLevel: 0,
  notes: 'Aguardando calibração experimental com os 3 sensores KY-037 e Arduino.'
};

const DEFAULT_SENSOR_OFFSETS_CM = {
  S1: { offsetXCm: 0, offsetYCm: 0 },
  S2: { offsetXCm: 0, offsetYCm: 0 },
  S3: { offsetXCm: 0, offsetYCm: 0 }
};

class WallConfigHttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function hasColumn(tableName, colName) {
  const cols = await all(`PRAGMA table_info(${tableName})`);
  return cols.some((c) => c.name === colName);
}

async function ensureIotAndWallTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS user_wall_configs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wall_preset TEXT NOT NULL DEFAULT '3x2',
      width_m REAL NOT NULL DEFAULT 3.0,
      height_m REAL NOT NULL DEFAULT 2.0,
      sensor_offsets_json TEXT NOT NULL DEFAULT '{}',
      sensor_coordinates_json TEXT NOT NULL,
      calibration_params_json TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrations = [
    ['sessions', 'wall_preset', "TEXT DEFAULT '3x2'"],
    ['sessions', 'wall_width_m', 'REAL DEFAULT 3.0'],
    ['sessions', 'wall_height_m', 'REAL DEFAULT 2.0'],
    ['personal_matches', 'wall_width_m', 'REAL DEFAULT 3.0'],
    ['personal_matches', 'wall_height_m', 'REAL DEFAULT 2.0'],
    ['personal_matches', 'sensor_coordinates_json', 'TEXT'],
    ['commercial_experiences', 'wall_width_m', 'REAL DEFAULT 3.0'],
    ['commercial_experiences', 'wall_height_m', 'REAL DEFAULT 2.0'],
    ['commercial_experiences', 'sensor_coordinates_json', 'TEXT']
  ];
  for (const [table, col, def] of migrations) {
    if (!(await hasColumn(table, col))) {
      await run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  }

  if (!(await hasColumn('sessions', 'sensor_coordinates_json'))) {
    const defaultSensorsJson = JSON.stringify(calculateSensorPositions('3x2').sensors);
    await run(`ALTER TABLE sessions ADD COLUMN sensor_coordinates_json TEXT`);
    await run(
      `UPDATE sessions SET wall_preset = COALESCE(wall_preset, '3x2'), wall_width_m = COALESCE(wall_width_m, 3.0), wall_height_m = COALESCE(wall_height_m, 2.0), sensor_coordinates_json = COALESCE(sensor_coordinates_json, ?) WHERE wall_width_m IS NULL OR sensor_coordinates_json IS NULL`,
      [defaultSensorsJson]
    );
  }

  const nicolasAccount = await get(`SELECT id, username, name FROM users WHERE LOWER(username) = 'nicolas' LIMIT 1`);
  if (nicolasAccount) {
    const existing = await get(`SELECT user_id FROM user_wall_configs WHERE user_id = ?`, [nicolasAccount.id]);
    if (!existing) {
      const preset = resolveWallPreset('3x2');
      const sensorLayout = calculateSensorPositions(preset, DEFAULT_SENSOR_OFFSETS_CM);
      await run(
        `INSERT OR IGNORE INTO user_wall_configs (
           user_id, wall_preset, width_m, height_m, sensor_offsets_json, sensor_coordinates_json, calibration_params_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          nicolasAccount.id,
          preset.id,
          preset.width,
          preset.height,
          JSON.stringify(DEFAULT_SENSOR_OFFSETS_CM),
          JSON.stringify(sensorLayout.sensors),
          JSON.stringify(DEFAULT_CALIBRATION_PARAMS)
        ]
      );
    }
  }

  const allConfigs = await all(`SELECT user_id, wall_preset, width_m, height_m, sensor_offsets_json, sensor_coordinates_json FROM user_wall_configs`).catch(() => []);
  for (const cfgRow of allConfigs || []) {
    try {
      const parsed = JSON.parse(cfgRow.sensor_coordinates_json || '{}');
      if (parsed?.S1?.corner === 'top_left' || parsed?.S2?.corner === 'top_right') {
        const preset = resolveWallPreset(cfgRow.wall_preset || { width: cfgRow.width_m, height: cfgRow.height_m });
        let offsets = DEFAULT_SENSOR_OFFSETS_CM;
        try { offsets = sanitizeSensorOffsets(JSON.parse(cfgRow.sensor_offsets_json || '{}')); } catch {}
        const sensorLayout = calculateSensorPositions(preset, offsets);
        await run(
          `UPDATE user_wall_configs SET sensor_coordinates_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [JSON.stringify(sensorLayout.sensors), cfgRow.user_id]
        );
      }
    } catch {}
  }
}

async function isNicolasAccount(userId) {
  if (!userId || !Number.isInteger(Number(userId)) || Number(userId) <= 0) return false;
  const row = await get(`SELECT id, username FROM users WHERE id = ? LIMIT 1`, [Number(userId)]);
  return Boolean(row && String(row.username).toLowerCase() === 'nicolas');
}

async function getNicolasAccount() {
  return get(`SELECT id, username, name, role FROM users WHERE LOWER(username) = 'nicolas' LIMIT 1`);
}

function sanitizeSensorOffsets(rawOffsets = {}) {
  const clean = {};
  for (const sId of ['S1', 'S2', 'S3']) {
    const item = rawOffsets && typeof rawOffsets === 'object' ? (rawOffsets[sId] || {}) : {};
    const ox = Number(item.offsetXCm ?? item.offset_x_cm ?? 0);
    const oy = Number(item.offsetYCm ?? item.offset_y_cm ?? 0);
    clean[sId] = {
      offsetXCm: Number.isFinite(ox) ? Math.max(-50, Math.min(50, Number(ox.toFixed(2)))) : 0,
      offsetYCm: Number.isFinite(oy) ? Math.max(-50, Math.min(50, Number(oy.toFixed(2)))) : 0
    };
  }
  return clean;
}

function sanitizeCalibrationParams(rawCal = {}, currentCal = DEFAULT_CALIBRATION_PARAMS) {
  const base = { ...DEFAULT_CALIBRATION_PARAMS, ...(currentCal || {}) };
  if (!rawCal || typeof rawCal !== 'object') return base;

  const calibrated = rawCal.calibrated !== undefined ? Boolean(rawCal.calibrated) : Boolean(base.calibrated);
  const rawSpeed = rawCal.propagationSpeedMps !== undefined ? rawCal.propagationSpeedMps : base.propagationSpeedMps;
  const speedNum = rawSpeed !== null && rawSpeed !== '' && Number.isFinite(Number(rawSpeed)) && Number(rawSpeed) > 0
    ? Number(Number(rawSpeed).toFixed(2))
    : null;

  const groupingWindowUs = Number.isFinite(Number(rawCal.groupingWindowUs)) && Number(rawCal.groupingWindowUs) >= 1000
    ? Math.min(500000, Math.round(Number(rawCal.groupingWindowUs)))
    : base.groupingWindowUs;

  const refractoryWindowUs = Number.isFinite(Number(rawCal.refractoryWindowUs)) && Number(rawCal.refractoryWindowUs) >= 2000
    ? Math.min(1000000, Math.round(Number(rawCal.refractoryWindowUs)))
    : base.refractoryWindowUs;

  const maxResidualM = Number.isFinite(Number(rawCal.maxResidualM)) && Number(rawCal.maxResidualM) > 0
    ? Math.min(2.0, Number(Number(rawCal.maxResidualM).toFixed(4)))
    : base.maxResidualM;

  const causalityToleranceFactor = Number.isFinite(Number(rawCal.causalityToleranceFactor)) && Number(rawCal.causalityToleranceFactor) >= 1.0
    ? Math.min(2.0, Number(Number(rawCal.causalityToleranceFactor).toFixed(3)))
    : base.causalityToleranceFactor;

  const delays = rawCal.sensorDelayOffsetsUs || base.sensorDelayOffsetsUs || { S1: 0, S2: 0, S3: 0 };

  return {
    calibrated: Boolean(calibrated && speedNum !== null && speedNum > 0),
    propagationSpeedMps: speedNum,
    groupingWindowUs,
    refractoryWindowUs,
    maxResidualM,
    causalityToleranceFactor,
    sensorDelayOffsetsUs: {
      S1: Number.isFinite(Number(delays.S1)) ? Number(delays.S1) : 0,
      S2: Number.isFinite(Number(delays.S2)) ? Number(delays.S2) : 0,
      S3: Number.isFinite(Number(delays.S3)) ? Number(delays.S3) : 0
    },
    minSignalLevel: Number.isFinite(Number(rawCal.minSignalLevel)) ? Number(rawCal.minSignalLevel) : base.minSignalLevel,
    notes: typeof rawCal.notes === 'string' ? rawCal.notes.slice(0, 300) : base.notes
  };
}

async function getWallConfigForActor(actorOrUserId = null) {
  await ensureIotAndWallTables();

  let userId = null;
  if (actorOrUserId && typeof actorOrUserId === 'object') {
    if (actorOrUserId.type === 'user' && actorOrUserId.userId) userId = Number(actorOrUserId.userId);
    else if (actorOrUserId.id && !actorOrUserId.isGuest) userId = Number(actorOrUserId.id);
  } else if (Number.isInteger(Number(actorOrUserId)) && Number(actorOrUserId) > 0) {
    userId = Number(actorOrUserId);
  }

  const isNicolas = userId ? await isNicolasAccount(userId) : false;
  let preset = null;
  let offsets = DEFAULT_SENSOR_OFFSETS_CM;
  let calibration = DEFAULT_CALIBRATION_PARAMS;
  let updatedAt = null;
  let configured = false;

  if (isNicolas) {
    const row = await get(`SELECT * FROM user_wall_configs WHERE user_id = ?`, [userId]);
    if (row) {
      configured = true;
      preset = resolveWallPreset({ width: row.width_m, height: row.height_m });
      updatedAt = row.updated_at;
      try { offsets = sanitizeSensorOffsets(JSON.parse(row.sensor_offsets_json || '{}')); } catch {}
      try { calibration = sanitizeCalibrationParams(JSON.parse(row.calibration_params_json || '{}')); } catch {}
    }
  }

  if (!preset) {
    const sysRow = await get(`SELECT value FROM system_settings WHERE key = 'wall_preset'`).catch(() => null);
    preset = resolveWallPreset(sysRow?.value || '3x2');
  }

  const geometry = calculateWallGeometry(preset.id, offsets);
  return {
    userId: userId || null,
    isNicolas: configured,
    canConfigureWall: configured,
    preset: preset.id,
    widthM: preset.width,
    heightM: preset.height,
    label: preset.label,
    shortLabel: preset.shortLabel,
    aspectRatio: preset.aspectRatio,
    sensorOffsetsCm: offsets,
    sensors: geometry.sensors,
    sensorList: geometry.sensorList,
    bottomRightHasSensor: true,
    topRightHasSensor: false,
    calibration,
    geometry,
    availableOptions: NICOLAS_WALL_OPTIONS,
    updatedAt
  };
}

async function hasActiveMatchForUser(userId) {
  if (!userId) return false;
  const now = Date.now();
  const activePersonal = await get(
    `SELECT id, state, mode, ends_at FROM personal_matches
     WHERE user_id = ? AND state IN ('PREPARING', 'ACTIVE') AND ends_at > ? LIMIT 1`,
    [userId, now]
  );
  if (activePersonal) return activePersonal;

  const activeShopping = await get(
    `SELECT id, state FROM commercial_experiences
     WHERE user_id = ? AND state IN ('PREPARING', 'ACTIVE') LIMIT 1`,
    [userId]
  );
  return activeShopping || null;
}

async function updateNicolasWallConfig({ actor, preset, widthM, heightM, sensorOffsetsCm, calibration }) {
  await ensureIotAndWallTables();

  if (!actor || actor.type !== 'user' || !actor.userId) {
    throw new WallConfigHttpError(403, 'Apenas a conta autenticada autorizada pode configurar as dimensões da parede.');
  }

  const userRow = await get(`SELECT id, username, role FROM users WHERE id = ? LIMIT 1`, [Number(actor.userId)]);
  if (!userRow) throw new WallConfigHttpError(401, 'Usuário autenticado não encontrado.');

  const isNicolas = String(userRow.username).toLowerCase() === 'nicolas';
  const isAdmin = userRow.role === 'admin';
  if (!isNicolas && !isAdmin) {
    throw new WallConfigHttpError(403, 'Configuração de dimensões da parede disponível exclusivamente para a conta Nicolas.');
  }

  const nicolasRow = isNicolas ? userRow : await getNicolasAccount();
  if (!nicolasRow) throw new WallConfigHttpError(404, 'Conta Nicolas não localizada no banco de dados.');
  const targetUserId = nicolasRow.id;

  const runningMatch = await hasActiveMatchForUser(targetUserId);
  if (runningMatch) {
    throw new WallConfigHttpError(
      409,
      'Não é permitido alterar as dimensões da parede durante uma partida já iniciada.',
      { reason: 'MATCH_IN_PROGRESS', matchId: runningMatch.id, state: runningMatch.state }
    );
  }

  const currentRow = await get(`SELECT * FROM user_wall_configs WHERE user_id = ?`, [targetUserId]);
  let currentOffsets = DEFAULT_SENSOR_OFFSETS_CM;
  let currentCal = DEFAULT_CALIBRATION_PARAMS;
  const currentPresetKey = currentRow?.wall_preset || '3x2';

  if (currentRow) {
    try { currentOffsets = JSON.parse(currentRow.sensor_offsets_json || '{}'); } catch {}
    try { currentCal = JSON.parse(currentRow.calibration_params_json || '{}'); } catch {}
  }

  let resolvedPreset;
  if (preset !== undefined && preset !== null) {
    const key = String(preset).trim().toLowerCase();
    if (!ALLOWED_NICOLAS_PRESETS.has(key)) {
      throw new WallConfigHttpError(400, 'Dimensão inválida. As opções disponíveis são: 4x3 (4 × 3 m), 3x3 (3 × 3 m) ou 3x2 (3 × 2 m).');
    }
    resolvedPreset = resolveWallPreset(key);
  } else if (widthM !== undefined && heightM !== undefined) {
    const w = Number(widthM);
    const h = Number(heightM);
    if (!((w === 4 && h === 3) || (w === 3 && h === 3) || (w === 3 && h === 2))) {
      throw new WallConfigHttpError(400, 'Dimensões físicas inválidas. Escolha entre 4×3m, 3×3m ou 3×2m.');
    }
    resolvedPreset = resolveWallPreset({ width: w, height: h });
  } else {
    resolvedPreset = resolveWallPreset(currentPresetKey);
  }

  const nextOffsets = sanitizeSensorOffsets(sensorOffsetsCm !== undefined ? sensorOffsetsCm : currentOffsets);
  const nextCal = calibration !== undefined
    ? sanitizeCalibrationParams(calibration, currentCal)
    : sanitizeCalibrationParams(currentCal, DEFAULT_CALIBRATION_PARAMS);
  const sensorLayout = calculateSensorPositions(resolvedPreset, nextOffsets);

  await run(
    `INSERT INTO user_wall_configs (
       user_id, wall_preset, width_m, height_m, sensor_offsets_json, sensor_coordinates_json, calibration_params_json, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       wall_preset = excluded.wall_preset,
       width_m = excluded.width_m,
       height_m = excluded.height_m,
       sensor_offsets_json = excluded.sensor_offsets_json,
       sensor_coordinates_json = excluded.sensor_coordinates_json,
       calibration_params_json = excluded.calibration_params_json,
       updated_at = CURRENT_TIMESTAMP`,
    [
      targetUserId,
      resolvedPreset.id,
      resolvedPreset.width,
      resolvedPreset.height,
      JSON.stringify(nextOffsets),
      JSON.stringify(sensorLayout.sensors),
      JSON.stringify(nextCal)
    ]
  );

  return getWallConfigForActor({ type: 'user', userId: targetUserId });
}

const UINT32_MOD = 4294967296;
const UINT32_HALF = 2147483648;

function signedMicrosDiff(tB, tA) {
  const b = Number(tB);
  const a = Number(tA);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;

  let diff = b - a;
  if (a >= 0 && b >= 0 && a < UINT32_MOD && b < UINT32_MOD) {
    if (diff < -UINT32_HALF) diff += UINT32_MOD;
    else if (diff > UINT32_HALF) diff -= UINT32_MOD;
  }
  return Math.round(diff);
}

function estimateImpactLocationTDOA({
  t1Us,
  t2Us,
  t3Us,
  presetOrDims = '3x2',
  sensorOffsetsCm = DEFAULT_SENSOR_OFFSETS_CM,
  calibration = DEFAULT_CALIBRATION_PARAMS
}) {
  const sensorLayout = calculateSensorPositions(presetOrDims, sensorOffsetsCm);
  const W = sensorLayout.widthM;
  const H = sensorLayout.heightM;
  const { S1, S2, S3 } = sensorLayout.sensors;
  const cal = sanitizeCalibrationParams(calibration, DEFAULT_CALIBRATION_PARAMS);

  const hasT1 = t1Us !== null && t1Us !== undefined && t1Us !== '' && Number.isFinite(Number(t1Us)) && Number(t1Us) >= 0;
  const hasT2 = t2Us !== null && t2Us !== undefined && t2Us !== '' && Number.isFinite(Number(t2Us)) && Number(t2Us) >= 0;
  const hasT3 = t3Us !== null && t3Us !== undefined && t3Us !== '' && Number.isFinite(Number(t3Us)) && Number(t3Us) >= 0;

  const unavailable = (extra) => ({
    status: 'unavailable',
    classificationLabel: 'indisponível',
    impactDetected: true,
    locationReliable: false,
    calibrated: cal.calibrated,
    wallWidthM: W,
    wallHeightM: H,
    sensors: { S1, S2, S3 },
    t1Us: hasT1 ? Number(t1Us) : null,
    t2Us: hasT2 ? Number(t2Us) : null,
    t3Us: hasT3 ? Number(t3Us) : null,
    dt21Us: null,
    dt31Us: null,
    dt32Us: null,
    xMeters: null,
    yMeters: null,
    xNormalized: null,
    yNormalized: null,
    screenXPct: null,
    screenYPct: null,
    sectorId: null,
    sectorClassification: null,
    residualRmsM: null,
    residualMaxM: null,
    ...extra
  });

  if (!hasT1 || !hasT2 || !hasT3) {
    return unavailable({
      reason: 'INCOMPLETE_READINGS',
      message: 'Leitura incompleta: são necessários os timestamps válidos dos três sensores (S1, S2 e S3).',
      impactDetected: Boolean(hasT1 || hasT2 || hasT3),
      dt21Us: hasT1 && hasT2 ? signedMicrosDiff(t2Us, t1Us) : null,
      dt31Us: hasT1 && hasT3 ? signedMicrosDiff(t3Us, t1Us) : null,
      dt32Us: hasT2 && hasT3 ? signedMicrosDiff(t3Us, t2Us) : null
    });
  }

  const delayS1 = Number(cal.sensorDelayOffsetsUs?.S1 || 0);
  const delayS2 = Number(cal.sensorDelayOffsetsUs?.S2 || 0);
  const delayS3 = Number(cal.sensorDelayOffsetsUs?.S3 || 0);

  const dt21Us = signedMicrosDiff(t2Us, t1Us) - (delayS2 - delayS1);
  const dt31Us = signedMicrosDiff(t3Us, t1Us) - (delayS3 - delayS1);
  const dt32Us = dt31Us - dt21Us;

  if (!cal.calibrated || !cal.propagationSpeedMps || cal.propagationSpeedMps <= 0) {
    return unavailable({
      reason: 'CALIBRATION_REQUIRED',
      message: 'Impacto detectado pelo hardware, porém sem localização confiável (calibração experimental pendente).',
      calibrated: false,
      dt21Us,
      dt31Us,
      dt32Us
    });
  }

  const v = Number(cal.propagationSpeedMps);
  const dd21 = v * (dt21Us * 1e-6);
  const dd31 = v * (dt31Us * 1e-6);
  const dd32 = v * (dt32Us * 1e-6);

  const L21 = Math.hypot(S2.xM - S1.xM, S2.yM - S1.yM);
  const L31 = Math.hypot(S3.xM - S1.xM, S3.yM - S1.yM);
  const L32 = Math.hypot(S3.xM - S2.xM, S3.yM - S2.yM);

  const maxCausalityRatio = Math.max(
    L21 > 0 ? Math.abs(dd21) / L21 : 0,
    L31 > 0 ? Math.abs(dd31) / L31 : 0,
    L32 > 0 ? Math.abs(dd32) / L32 : 0
  );

  if (maxCausalityRatio > (cal.causalityToleranceFactor || 1.15)) {
    return unavailable({
      reason: 'INCONSISTENT_TDOA_CAUSALITY',
      message: 'Diferenças de tempo incompatíveis com as dimensões físicas da parede e velocidade calibrada.',
      calibrated: true,
      propagationSpeedMps: v,
      dt21Us,
      dt31Us,
      dt32Us,
      observedDiffMeters: { dd21: Number(dd21.toFixed(4)), dd31: Number(dd31.toFixed(4)), dd32: Number(dd32.toFixed(4)) },
      maxCausalityRatio: Number(maxCausalityRatio.toFixed(4))
    });
  }

  const evaluateCost = (x, y) => {
    const d1 = Math.hypot(x - S1.xM, y - S1.yM);
    const d2 = Math.hypot(x - S2.xM, y - S2.yM);
    const d3 = Math.hypot(x - S3.xM, y - S3.yM);
    const r21 = (d2 - d1) - dd21;
    const r31 = (d3 - d1) - dd31;
    const r32 = (d3 - d2) - dd32;
    return { cost: r21 * r21 + r31 * r31 + r32 * r32, r21, r31, r32, d1, d2, d3 };
  };

  const gridN = 28;
  const candidates = [];
  for (let ix = 0; ix <= gridN; ix++) {
    const gx = (ix / gridN) * W;
    for (let iy = 0; iy <= gridN; iy++) {
      const gy = (iy / gridN) * H;
      candidates.push({ x: gx, y: gy, cost: evaluateCost(gx, gy).cost });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);

  const refinePoint = (startX, startY) => {
    let x = Math.max(0, Math.min(W, startX));
    let y = Math.max(0, Math.min(H, startY));
    let current = evaluateCost(x, y);

    for (let iter = 0; iter < 60; iter++) {
      const d1 = Math.max(1e-6, current.d1);
      const d2 = Math.max(1e-6, current.d2);
      const d3 = Math.max(1e-6, current.d3);

      const u1x = (x - S1.xM) / d1, u1y = (y - S1.yM) / d1;
      const u2x = (x - S2.xM) / d2, u2y = (y - S2.yM) / d2;
      const u3x = (x - S3.xM) / d3, u3y = (y - S3.yM) / d3;

      const j1x = u2x - u1x, j1y = u2y - u1y;
      const j2x = u3x - u1x, j2y = u3y - u1y;
      const j3x = u3x - u2x, j3y = u3y - u2y;

      const a11 = j1x * j1x + j2x * j2x + j3x * j3x + 1e-4;
      const a12 = j1x * j1y + j2x * j2y + j3x * j3y;
      const a22 = j1y * j1y + j2y * j2y + j3y * j3y + 1e-4;

      const b1 = -(j1x * current.r21 + j2x * current.r31 + j3x * current.r32);
      const b2 = -(j1y * current.r21 + j2y * current.r31 + j3y * current.r32);

      const det = a11 * a22 - a12 * a12;
      if (Math.abs(det) < 1e-12) break;

      const dx = (a22 * b1 - a12 * b2) / det;
      const dy = (a11 * b2 - a12 * b1) / det;

      let improved = false;
      let alpha = 1.0;
      while (alpha >= 1 / 64) {
        const nx = Math.max(0, Math.min(W, x + alpha * dx));
        const ny = Math.max(0, Math.min(H, y + alpha * dy));
        const nextEv = evaluateCost(nx, ny);
        if (nextEv.cost < current.cost) {
          const stepNorm = Math.hypot(nx - x, ny - y);
          x = nx;
          y = ny;
          current = nextEv;
          improved = true;
          if (stepNorm < 1e-7) return { x, y, ...current };
          break;
        }
        alpha *= 0.5;
      }
      if (!improved) break;
    }

    let step = 0.01;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (step >= 1e-5) {
      let bestLocal = current, bx = x, by = y;
      for (const [ox, oy] of dirs) {
        const nx = Math.max(0, Math.min(W, x + ox * step));
        const ny = Math.max(0, Math.min(H, y + oy * step));
        const ev = evaluateCost(nx, ny);
        if (ev.cost < bestLocal.cost) {
          bestLocal = ev;
          bx = nx;
          by = ny;
        }
      }
      if (bx !== x || by !== y) {
        x = bx;
        y = by;
        current = bestLocal;
      } else {
        step *= 0.25;
      }
    }
    return { x, y, ...current };
  };

  let bestSolution = null;
  for (let i = 0; i < Math.min(4, candidates.length); i++) {
    const sol = refinePoint(candidates[i].x, candidates[i].y);
    if (!bestSolution || sol.cost < bestSolution.cost) bestSolution = sol;
  }

  const residualRmsM = Number(Math.sqrt(bestSolution.cost / 3).toFixed(5));
  const residualMaxM = Number(
    Math.max(Math.abs(bestSolution.r21), Math.abs(bestSolution.r31), Math.abs(bestSolution.r32)).toFixed(5)
  );

  const maxAllowedResidual = Number(cal.maxResidualM || 0.20);
  const isReliable = residualRmsM <= maxAllowedResidual && maxCausalityRatio <= 1.03;
  const isUncertain = !isReliable && residualRmsM <= maxAllowedResidual * 2.5;

  if (!isReliable && !isUncertain) {
    return unavailable({
      reason: 'HIGH_RESIDUAL_ERROR',
      message: 'Resíduo numérico elevado na convergência TDOA. Localização descartada por inconsistência.',
      calibrated: true,
      propagationSpeedMps: v,
      dt21Us,
      dt31Us,
      dt32Us,
      residualRmsM,
      residualMaxM
    });
  }

  const xMeters = Number(bestSolution.x.toFixed(4));
  const yMeters = Number(bestSolution.y.toFixed(4));
  const sectorMap = classifyPhysicalImpact(xMeters, yMeters, { width: W, height: H });

  return {
    status: isReliable ? 'valid' : 'uncertain',
    classificationLabel: isReliable ? 'válida' : 'incerta',
    reason: isReliable ? 'TDOA_CONVERGED' : 'TDOA_UNCERTAIN_RESIDUAL',
    message: isReliable
      ? `Impacto localizado pelo algoritmo com calibração válida (${sectorMap.classification === 'TARGET_HIT' ? `Setor ${sectorMap.sectorId}` : 'Área Neutra'}).`
      : 'Estimativa de posição com incerteza elevada (resíduo acima do limiar estrito).',
    impactDetected: true,
    locationReliable: isReliable,
    calibrated: true,
    propagationSpeedMps: v,
    wallWidthM: W,
    wallHeightM: H,
    sensors: { S1, S2, S3 },
    t1Us: Number(t1Us),
    t2Us: Number(t2Us),
    t3Us: Number(t3Us),
    dt21Us,
    dt31Us,
    dt32Us,
    observedDiffMeters: {
      dd21: Number(dd21.toFixed(4)),
      dd31: Number(dd31.toFixed(4)),
      dd32: Number(dd32.toFixed(4))
    },
    residualRmsM,
    residualMaxM,
    xMeters,
    yMeters,
    xNormalized: sectorMap.xNormalized,
    yNormalized: sectorMap.yNormalized,
    screenXPct: sectorMap.screenXPct,
    screenYPct: sectorMap.screenYPct,
    sectorId: sectorMap.sectorId || null,
    sectorClassification: sectorMap.classification
  };
}

function generateSyntheticArduinoTimestamps({
  xMeters,
  yMeters,
  presetOrDims = '3x2',
  sensorOffsetsCm = DEFAULT_SENSOR_OFFSETS_CM,
  propagationSpeedMps = 340,
  baseTimestampUs = 1000000,
  sensorDelayOffsetsUs = { S1: 0, S2: 0, S3: 0 }
}) {
  const layout = calculateSensorPositions(presetOrDims, sensorOffsetsCm);
  const { S1, S2, S3 } = layout.sensors;
  const v = Number(propagationSpeedMps);

  const d1 = Math.hypot(xMeters - S1.xM, yMeters - S1.yM);
  const d2 = Math.hypot(xMeters - S2.xM, yMeters - S2.yM);
  const d3 = Math.hypot(xMeters - S3.xM, yMeters - S3.yM);

  const t1Us = Math.round(baseTimestampUs + (d1 / v) * 1e6 + Number(sensorDelayOffsetsUs?.S1 || 0));
  const t2Us = Math.round(baseTimestampUs + (d2 / v) * 1e6 + Number(sensorDelayOffsetsUs?.S2 || 0));
  const t3Us = Math.round(baseTimestampUs + (d3 / v) * 1e6 + Number(sensorDelayOffsetsUs?.S3 || 0));

  return {
    xMeters,
    yMeters,
    widthM: layout.widthM,
    heightM: layout.heightM,
    sensors: { S1, S2, S3 },
    distancesM: {
      d1: Number(d1.toFixed(5)),
      d2: Number(d2.toFixed(5)),
      d3: Number(d3.toFixed(5))
    },
    t1Us,
    t2Us,
    t3Us,
    dt21Us: t2Us - t1Us,
    dt31Us: t3Us - t1Us
  };
}

module.exports = {
  WallConfigHttpError,
  DEFAULT_CALIBRATION_PARAMS,
  DEFAULT_SENSOR_OFFSETS_CM,
  ensureIotAndWallTables,
  isNicolasAccount,
  getNicolasAccount,
  getWallConfigForActor,
  updateNicolasWallConfig,
  hasActiveMatchForUser,
  signedMicrosDiff,
  estimateImpactLocationTDOA,
  generateSyntheticArduinoTimestamps
};
