const { run, get, all } = require('../database/db');
const {
  WALL_PRESETS,
  PHYSICAL_CONSTANTS,
  calculateWallGeometry,
  classifyImpact,
  generateSimulatedImpact
} = require('./wallGeometry');

const DEFAULT_GEOMETRY = calculateWallGeometry('medium');
const FIXED_SECTORS = DEFAULT_GEOMETRY.sectors;
const FIXED_TARGETS = FIXED_SECTORS;
const FIXED_SENSORS = FIXED_SECTORS;
const DETECTION_RADIUS = 30.0;
const VISUAL_RADIUS = 20.0;

const LEVEL_TITLES = [
  { maxLevel: 2, title: 'Iniciante' },
  { maxLevel: 5, title: 'Praticante' },
  { maxLevel: 8, title: 'Intermediário' },
  { maxLevel: 11, title: 'Avançado' },
  { maxLevel: 14, title: 'Competidor' },
  { maxLevel: 999, title: 'Especialista' }
];

function getTitleForLevel(level) {
  for (const item of LEVEL_TITLES) {
    if (level <= item.maxLevel) return item.title;
  }
  return 'Especialista';
}

async function getActiveWallPreset() {
  try {
    const row = await get(`SELECT value FROM system_settings WHERE key = 'wall_preset'`);
    return (row?.value && WALL_PRESETS[row.value]) ? row.value : 'medium';
  } catch (err) {
    return 'medium';
  }
}

function detectSector(x, y, preset = 'medium') {
  if (x === undefined || x === null || y === undefined || y === null) {
    return { hit: false, sectorId: null, targetId: null, sensorId: null, sector: null, classification: 'INVALID' };
  }

  const result = classifyImpact(x, y, preset);
  if (result.classification === 'TARGET_HIT') {
    return {
      hit: true,
      sectorId: result.sectorId,
      targetId: result.sectorId,
      sensorId: result.sectorId,
      sector: result.sector,
      x: result.x,
      y: result.y,
      distance: 0,
      classification: 'TARGET_HIT'
    };
  }

  return {
    hit: false,
    sectorId: null,
    targetId: null,
    sensorId: null,
    sector: null,
    x: result.x,
    y: result.y,
    distance: 0,
    classification: result.classification,
    reason: result.reason
  };
}

function detectNearestTarget(x, y, preset = 'medium') {
  const res = detectSector(x, y, preset);
  return {
    hit: res.hit,
    targetId: res.sectorId,
    distance: 0,
    target: res.sector,
    classification: res.classification
  };
}

function resolveSensor(sensorId, x, y, preset = 'medium') {
  if (x !== undefined && x !== null && y !== undefined && y !== null) {
    const det = detectSector(x, y, preset);
    if (det.hit && det.sector) {
      return {
        sensor: det.sector,
        x: det.x,
        y: det.y,
        distance: 0,
        is_hit: 1,
        is_bullseye: 1,
        classification: 'TARGET_HIT'
      };
    } else if (det.classification === 'NEUTRAL_AREA') {
      return {
        sensor: { id: 0, name: 'NEUTRO', base_score: 0 },
        x: det.x,
        y: det.y,
        distance: 0,
        is_hit: 0,
        is_bullseye: 0,
        classification: 'NEUTRAL_AREA'
      };
    }
  }

  if (sensorId !== undefined && sensorId !== null) {
    const geo = calculateWallGeometry(preset);
    const s = geo.sectors.find((item) => item.id === Number(sensorId));
    if (s) {
      return {
        sensor: s,
        x: s.centerX,
        y: s.centerY,
        distance: 0,
        is_hit: 1,
        is_bullseye: 1,
        classification: 'TARGET_HIT'
      };
    }
  }

  return {
    sensor: { id: 0, name: 'FORA', base_score: 0 },
    x: 50.0,
    y: 50.0,
    distance: 0,
    is_hit: 0,
    is_bullseye: 0,
    classification: 'OUT_OF_BOUNDS'
  };
}

async function registerHit({
  userId = 1,
  equipmentId = 1,
  sessionId = null,
  gameMode = 'free',
  sensorId = null,
  sectorId = null,
  targetId = null,
  x = null,
  y = null,
  speed = 80,
  targetSensorId = null,
  source = 'mouse',
  isSimulation = false,
  is_simulation = false,
  skipStats = false,
  wallPreset = null
}) {
  const activePreset = wallPreset || (await getActiveWallPreset());
  const effectiveId = sectorId || targetId || sensorId;
  const resolved = resolveSensor(effectiveId, x, y, activePreset);
  const sensor = resolved.sensor;
  const isHit = resolved.is_hit;
  const isBullseye = resolved.is_bullseye;
  const hitSpeed = Number(Number(speed || 80).toFixed(1));
  const simFlag = Boolean(isSimulation || is_simulation);

  let score = 0;
  let xp = 0;

  if (isHit && sensor && sensor.id > 0) {
    score = sensor.base_score || 85;
    xp = Math.round(score / 2);

    if (gameMode === 'single') {
      if (targetSensorId && sensor.id === Number(targetSensorId)) {
        score += 30;
        xp += 20;
      }
    } else if (gameMode === 'clear_all') {
      score += 15;
      xp += 10;
    }

    if (hitSpeed > 95) {
      score += 5;
      xp += 5;
    }
  }

  const storedSensorId = isHit && sensor.id > 0 ? sensor.id : null;

  let hitInsert;
  try {
    hitInsert = await run(`
      INSERT INTO hits (
        user_id, equipment_id, session_id, game_mode, sensor_id, x, y, speed, score, is_simulation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, equipmentId, sessionId, gameMode, storedSensorId, resolved.x, resolved.y, hitSpeed, score, simFlag ? 1 : 0]);
  } catch (err) {
    hitInsert = await run(`
      INSERT INTO hits (
        user_id, equipment_id, session_id, game_mode, sensor_id, x, y, speed, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, equipmentId, sessionId, gameMode, storedSensorId, resolved.x, resolved.y, hitSpeed, score]);
  }

  let shotInsert;
  try {
    shotInsert = await run(`
      INSERT INTO shots (
        session_id, user_id, x, y, zone, zone_id, force, score, is_hit, is_bullseye, source, sensor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, userId, resolved.x, resolved.y, isHit ? sensor.name : 'FORA', storedSensorId || 0, hitSpeed, score, isHit, isBullseye, simFlag ? 'simulation' : source, isHit ? sensor.name : 'FORA']);
  } catch (err) {
    shotInsert = await run(`
      INSERT INTO shots (
        session_id, x, y, zone, zone_id, force, score, is_hit, is_bullseye, source, sensor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sessionId, resolved.x, resolved.y, isHit ? sensor.name : 'FORA', storedSensorId || 0, hitSpeed, score, isHit, isBullseye, simFlag ? 'simulation' : source, isHit ? sensor.name : 'FORA']);
  }

  let player = userId ? await get(`SELECT * FROM players WHERE user_id = ? LIMIT 1`, [userId]) : null;
  if (!player && userId) {
    const userRow = await get(`SELECT id, name, avatar, role FROM users WHERE id = ?`, [userId]);
    if (userRow) {
      const pIns = await run(`
        INSERT OR IGNORE INTO players (user_id, name, avatar, level, title, xp, xp_next, precision, streak_days)
        VALUES (?, ?, ?, 1, 'Iniciante', 0, 250, 0, 1)
      `, [userRow.id, userRow.name, userRow.avatar || '🎾']);
      player = await get(`SELECT * FROM players WHERE user_id = ? LIMIT 1`, [userRow.id]);
      if (player) await ensurePlayerAttributes(player.id);
    }
  }

  let currentLevel = player ? player.level : 1;
  let newTitle = player ? player.title : 'Iniciante';
  let newXp = player ? player.xp : 0;
  let xpNext = player ? player.xp_next : 500;
  let leveledUp = false;
  let newTotalShots = player ? player.total_shots : 0;
  let newTotalHits = player ? player.total_hits : 0;
  let newPrecision = player ? player.precision : 0;
  let bestScore = player ? (player.best_score || 0) : 0;
  let avgScore = player ? (player.avg_score || 0) : 0;

  if (!skipStats && player) {
    newXp += xp;
    while (newXp >= xpNext) {
      newXp -= xpNext;
      currentLevel += 1;
      xpNext = currentLevel * 250;
      leveledUp = true;
    }

    newTotalShots = (player.total_shots || 0) + 1;
    newTotalHits = (player.total_hits || 0) + (isHit ? 1 : 0);
    newPrecision = Number(((newTotalHits / newTotalShots) * 100).toFixed(1));
    newTitle = getTitleForLevel(currentLevel);
    bestScore = Math.max(player.best_score || 0, score);
    avgScore = Math.round(((player.avg_score || 0) * (newTotalShots - 1) + score) / newTotalShots);

    await run(`
      UPDATE players SET
        xp = ?,
        level = ?,
        title = ?,
        xp_next = ?,
        total_shots = ?,
        total_hits = ?,
        precision = ?,
        best_score = ?,
        avg_score = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newXp, currentLevel, newTitle, xpNext, newTotalShots, newTotalHits, newPrecision, bestScore, avgScore, player.id]);
  }

  if (player && !skipStats) {
    await ensurePlayerAttributes(player.id);
  }
  const attributeUpdates = (player && !skipStats) ? await updateAttributes({
    playerId: player.id,
    isHit,
    isBullseye,
    force: hitSpeed,
    sensorId: storedSensorId,
    gameMode
  }) : [];

  const unlockedAchievements = await checkAchievements({
    totalShots: newTotalShots,
    totalHits: newTotalHits,
    precision: newPrecision,
    isBullseye,
    force: hitSpeed
  });

  return {
    hit: {
      id: hitInsert.lastID,
      shot_id: shotInsert ? shotInsert.lastID : null,
      user_id: userId,
      equipment_id: equipmentId,
      session_id: sessionId,
      game_mode: gameMode,
      target_id: storedSensorId,
      sensor_id: storedSensorId,
      sensor_name: isHit && sensor.id > 0 ? sensor.name : 'FORA',
      distance: resolved.distance,
      x: resolved.x,
      y: resolved.y,
      speed: hitSpeed,
      score,
      xp,
      is_hit: isHit,
      is_bullseye: isBullseye,
      classification: resolved.classification,
      timestamp: new Date().toISOString()
    },
    player: {
      level: currentLevel,
      title: newTitle,
      xp: newXp,
      xp_next: xpNext,
      precision: newPrecision,
      total_shots: newTotalShots,
      total_hits: newTotalHits,
      best_score: bestScore,
      avg_score: avgScore,
      leveledUp
    },
    attributeUpdates,
    unlockedAchievements
  };
}

async function updateAttributes({ playerId, isHit, isBullseye, force, sensorId, gameMode }) {
  if (!playerId) return [];
  const updates = [];
  const attributes = await all(`SELECT * FROM attributes WHERE player_id = ?`, [playerId]);

  for (const attr of attributes) {
    let gainedXp = 5;

    if (attr.key === 'precision') {
      gainedXp += isBullseye ? 25 : (isHit ? 12 : 2);
    } else if (attr.key === 'consistency') {
      gainedXp += isHit ? 12 : 0;
    } else if (attr.key === 'speed') {
      gainedXp += force > 90 ? 20 : 8;
    } else if (attr.key === 'control') {
      gainedXp += [1, 3, 7, 9, 10, 11].includes(sensorId) ? 18 : 8;
    } else if (attr.key === 'reflex') {
      gainedXp += gameMode === 'single' ? 18 : 10;
    } else if (attr.key === 'strategy') {
      gainedXp += gameMode === 'clear_all' ? 20 : 10;
    }

    let newAttrXp = attr.xp + gainedXp;
    let newAttrLevel = attr.level;
    let attrNext = attr.xp_next;
    let attrLeveledUp = false;

    if (newAttrXp >= attrNext && newAttrLevel < attr.max_level) {
      newAttrXp -= attrNext;
      newAttrLevel += 1;
      attrLeveledUp = true;
    }

    await run(`
      UPDATE attributes SET
        xp = ?,
        level = ?
      WHERE id = ?
    `, [newAttrXp, newAttrLevel, attr.id]);

    updates.push({
      key: attr.key,
      name: attr.name,
      level: newAttrLevel,
      xp: newAttrXp,
      xp_next: attrNext,
      gainedXp,
      leveledUp: attrLeveledUp
    });
  }

  return updates;
}

async function checkAchievements({ totalShots, totalHits, precision, isBullseye, force }) {
  const newlyUnlocked = [];
  const achievements = await all(`SELECT * FROM achievements`);

  for (const ach of achievements) {
    if (ach.unlocked === 1) continue;

    let shouldUnlock = false;

    if (ach.id === 'first_shot' && totalShots >= 1) shouldUnlock = true;
    if (ach.id === 'bullseye' && isBullseye === 1) shouldUnlock = true;
    if (ach.id === 'shots_100' && totalShots >= 100) shouldUnlock = true;
    if (ach.id === 'shots_500' && totalShots >= 500) shouldUnlock = true;
    if (ach.id === 'prec_80' && precision >= 80 && totalShots >= 10) shouldUnlock = true;
    if (ach.id === 'speed_demon' && force >= 100) shouldUnlock = true;

    if (shouldUnlock) {
      await run(`
        UPDATE achievements SET
          unlocked = 1,
          unlocked_at = CURRENT_TIMESTAMP,
          progress = target
        WHERE id = ?
      `, [ach.id]);

      newlyUnlocked.push({
        ...ach,
        unlocked: 1,
        unlocked_at: new Date().toISOString()
      });
    } else {
      let currentProgress = ach.progress;
      if (ach.id === 'shots_500') currentProgress = totalShots;
      if (ach.id === 'speed_demon' && force > currentProgress) currentProgress = Math.round(force);

      await run(`UPDATE achievements SET progress = ? WHERE id = ?`, [currentProgress, ach.id]);
    }
  }

  return newlyUnlocked;
}

function generateSimulatedSensorHit(activeTargetSensorId = null, availableSensors = null, preset = 'medium') {
  return generateSimulatedImpact(preset, activeTargetSensorId, availableSensors);
}

const DEFAULT_ATTRIBUTES = [
  {
    key: 'precision',
    name: 'Precisão',
    objective: 'Atingir 85% de precisão nos cantos inferiores em 5 treinos consecutivos.',
    strong_points: 'Excelente centralização nas jogadas de fundo e golpes retos.',
    improvement_points: 'Ajustar a mira nas bolas aceleradas para o canto direito.',
    coach_tip: 'Faça séries mirando alternadamente nos sensores dos cantos e no sensor central. Priorize controle antes de velocidade.'
  },
  {
    key: 'consistency',
    name: 'Consistência',
    objective: 'Manter sequência de 20 acertos sem errar o quadrante delimitado.',
    strong_points: 'Ritmo constante durante rallies médios.',
    improvement_points: 'Evitar oscilações de força após a décima jogada consecutiva.',
    coach_tip: 'Concentre-se na respiração antes de cada golpe. O segredo da consistência é repetir a mesma preparação de braço em cada repetição.'
  },
  {
    key: 'speed',
    name: 'Velocidade',
    objective: 'Alcançar média de impacto acima de 95 km/h mantendo 75% de acertos.',
    strong_points: 'Potência de saque inicial consistente e aceleração rápida.',
    improvement_points: 'Transferência de peso corporal para a perna de apoio ao acelerar.',
    coach_tip: 'Velocidade sem controle é ponto perdido. Solte o punho no final do movimento para ganhar efeito topspin sem perder o alvo.'
  },
  {
    key: 'control',
    name: 'Controle',
    objective: 'Variar a profundidade dos impactos alternando fundo e meio de quadra.',
    strong_points: 'Ótima absorção de bolas rápidas e amortecimentos precisos.',
    improvement_points: 'Controle de trajetória em bolas com altura acima dos ombros.',
    coach_tip: 'Ajuste o ângulo da face da raquete milissegundos antes do impacto. Menor movimento de braço gera maior controle direcional.'
  },
  {
    key: 'reflex',
    name: 'Reflexo',
    objective: 'Reagir em menos de 0.8s aos alvos dinâmicos no modo Alvo Único.',
    strong_points: 'Boa leitura visual e antecipação nas jogadas de voleio.',
    improvement_points: 'Tempo de recuperação postural após impactos descentralizados.',
    coach_tip: 'Mantenha os calcanhares ligeiramente fora do chão e a empunhadura relaxada enquanto aguarda a leitura dos sensores.'
  },
  {
    key: 'strategy',
    name: 'Estratégia',
    objective: 'Completar sequências de alvos táticos explorando o ponto fraco simulado.',
    strong_points: 'Excelente tomada de decisão em situações de pressão.',
    improvement_points: 'Construção tática do ponto ao invés de buscar winner prematuro.',
    coach_tip: 'Abra a quadra jogando primeiro no ponto seguro antes de buscar os sensores das linhas extremas.'
  }
];

async function ensurePlayerAttributes(playerId) {
  if (!playerId) return [];
  const existing = await all(`SELECT key FROM attributes WHERE player_id = ?`, [playerId]);
  const existingKeys = new Set(existing.map(e => e.key));
  for (const attr of DEFAULT_ATTRIBUTES) {
    if (!existingKeys.has(attr.key)) {
      await run(`
        INSERT INTO attributes (
          player_id, key, name, level, max_level, xp, xp_next,
          objective, strong_points, improvement_points, coach_tip
        ) VALUES (?, ?, ?, 1, 10, 0, 1000, ?, ?, ?, ?)
      `, [playerId, attr.key, attr.name, attr.objective, attr.strong_points, attr.improvement_points, attr.coach_tip]);
    }
  }
  return await all(`SELECT * FROM attributes WHERE player_id = ? ORDER BY id ASC`, [playerId]);
}

module.exports = {
  FIXED_SECTORS,
  FIXED_TARGETS,
  FIXED_SENSORS,
  WALL_PRESETS,
  PHYSICAL_CONSTANTS,
  calculateWallGeometry,
  classifyImpact,
  generateSimulatedImpact,
  DETECTION_RADIUS,
  VISUAL_RADIUS,
  detectSector,
  detectNearestTarget,
  resolveSensor,
  registerHit,
  registerShot: registerHit,
  generateSimulatedSensorHit,
  generateSimulatedShot: (zone, speed) => generateSimulatedImpact('medium', zone),
  getActiveWallPreset,
  getTitleForLevel,
  ensurePlayerAttributes
};
