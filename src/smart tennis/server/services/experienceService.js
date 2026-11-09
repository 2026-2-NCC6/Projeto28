
const crypto = require('crypto');
const { run, get, all, exec } = require('../database/db');
const { classifyImpact, calculateWallGeometry } = require('./wallGeometry');
const { broadcastEvent } = require('./eventHub');
const iotLocalizationService = require('./iotLocalizationService');

const GAMES = {
  free: { key: 'free', name: 'Treino Livre', sessionMode: 'Treino Livre' },
  single: { key: 'single', name: 'Liga Um por Vez', sessionMode: 'Liga um por vez' },
  clear_all: { key: 'clear_all', name: 'Apagar Todos', sessionMode: 'Apagar todos' }
};
const SEQUENCE = ['free', 'single', 'clear_all'];

const COMMERCIAL_PREPARE_SECONDS = 5;
const COMMERCIAL_ROUND_SECONDS = 120;
const DEFAULT_INTERVAL_SECONDS = 30;
const MAX_INTERVAL_SECONDS = 300;

const POINTS = { FREE_HIT: 85, SINGLE_HIT: 1, CLEAR_OFF: 100, CLEAR_WIN_BONUS: 500 };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isTestMode() {
  return process.env.SMART_TENNIS_TEST_MODE === '1';
}
function getRoundSeconds() {
  const override = Number(process.env.SMART_TENNIS_ROUND_SECONDS);
  if (isTestMode() && override > 0) return override;
  return COMMERCIAL_ROUND_SECONDS;
}
function getPrepareSeconds() {
  const override = Number(process.env.SMART_TENNIS_PREPARE_SECONDS);
  if (isTestMode() && Number.isFinite(override) && override >= 0 && process.env.SMART_TENNIS_PREPARE_SECONDS !== undefined && process.env.SMART_TENNIS_PREPARE_SECONDS !== '') {
    return override;
  }
  return COMMERCIAL_PREPARE_SECONDS;
}
function minIntervalSeconds() {
  return isTestMode() ? 1 : 5;
}

let lockChain = Promise.resolve();
function withLock(fn) {
  const result = lockChain.then(() => fn());
  lockChain = result.catch(() => {});
  return result;
}

function normalizeActor(userOrActor) {
  if (!userOrActor) return null;
  if (userOrActor.type === 'guest' && userOrActor.guestId) {
    return {
      type: 'guest',
      userId: null,
      guestId: userOrActor.guestId,
      role: 'guest'
    };
  }
  if (userOrActor.type === 'user' && userOrActor.userId) {
    return {
      type: 'user',
      userId: Number(userOrActor.userId),
      guestId: null,
      role: userOrActor.user?.role || userOrActor.role || 'player'
    };
  }
  if (userOrActor.isGuest && userOrActor.guestId) {
    return {
      type: 'guest',
      userId: null,
      guestId: userOrActor.guestId,
      role: 'guest'
    };
  }
  if (userOrActor.id) {
    return {
      type: 'user',
      userId: Number(userOrActor.id),
      guestId: null,
      role: userOrActor.role || 'player'
    };
  }
  return null;
}

async function ensureExperienceTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commercial_experiences (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      guest_id TEXT,
      state TEXT NOT NULL DEFAULT 'PREPARING',
      stage_index INTEGER NOT NULL DEFAULT 0,
      stage_started_at INTEGER NOT NULL,
      stage_ends_at INTEGER NOT NULL,
      stage_planned_seconds INTEGER NOT NULL,
      stages_json TEXT NOT NULL,
      round_state TEXT,
      wall_preset TEXT NOT NULL DEFAULT 'medium',
      version INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      end_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_comm_exp_state ON commercial_experiences(state);

    CREATE TABLE IF NOT EXISTS commercial_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experience_id TEXT NOT NULL,
      user_id INTEGER,
      round_index INTEGER NOT NULL,
      mode TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      planned_seconds INTEGER NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      shots_count INTEGER DEFAULT 0,
      hits_count INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      neutral_count INTEGER DEFAULT 0,
      reactivations INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      won INTEGER DEFAULT 0,
      session_id TEXT,
      UNIQUE(experience_id, round_index)
    );

    CREATE TABLE IF NOT EXISTS commercial_impacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experience_id TEXT NOT NULL,
      user_id INTEGER,
      round_index INTEGER,
      client_event_id TEXT,
      x REAL,
      y REAL,
      classification TEXT,
      sector_id INTEGER,
      accepted INTEGER NOT NULL,
      points INTEGER DEFAULT 0,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_impacts_evt
      ON commercial_impacts(experience_id, client_event_id) WHERE client_event_id IS NOT NULL;
  `);

  try {
    const cols = await all(`PRAGMA table_info(commercial_experiences)`);
    if (!cols.some((c) => c.name === 'guest_id')) {
      await run(`ALTER TABLE commercial_experiences ADD COLUMN guest_id TEXT`);
    }
  } catch (err) {}

  try {
    await run(`
      INSERT OR IGNORE INTO system_settings (key, value) VALUES
      ('installation_mode', 'personal'),
      ('shopping_interval_seconds', '30'),
      ('wall_preset', 'medium')
    `);
  } catch (err) {}
}

async function getSetting(key, fallback) {
  try {
    const row = await get(`SELECT value FROM system_settings WHERE key = ?`, [key]);
    return row && row.value !== null && row.value !== undefined ? row.value : fallback;
  } catch (err) {
    return fallback;
  }
}
async function setSetting(key, value) {
  try {
    await run(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [key, String(value)]
    );
  } catch (err) {
    console.error('[SETTINGS] Erro ao gravar system_setting:', err.message);
  }
}

async function getInstallation() {
  const mode = (await getSetting('installation_mode', 'personal')) === 'shopping' ? 'shopping' : 'personal';
  const interval = Number(await getSetting('shopping_interval_seconds', DEFAULT_INTERVAL_SECONDS));
  return {
    mode,
    shoppingIntervalSeconds: Number.isFinite(interval) && interval >= minIntervalSeconds() ? interval : DEFAULT_INTERVAL_SECONDS,
    roundSeconds: getRoundSeconds(),
    prepareSeconds: getPrepareSeconds(),
    testMode: isTestMode()
  };
}

function setInstallation({ mode, shoppingIntervalSeconds }) {
  return withLock(async () => {
    if (mode !== undefined && mode !== 'shopping' && mode !== 'personal') {
      throw new HttpError(400, 'Tipo de instalação inválido. Use "shopping" ou "personal".');
    }
    if (shoppingIntervalSeconds !== undefined) {
      const n = Number(shoppingIntervalSeconds);
      if (!Number.isInteger(n) || n < minIntervalSeconds() || n > MAX_INTERVAL_SECONDS) {
        throw new HttpError(400, `A duração do intervalo deve ser um inteiro entre ${minIntervalSeconds()} e ${MAX_INTERVAL_SECONDS} segundos.`);
      }
    }

    const active = await loadActiveSynced();
    if (active) {
      throw new HttpError(409, 'Há uma experiência Shopping em andamento. Aguarde o término ou interrompa-a antes de alterar a instalação.');
    }

    if (mode !== undefined) await setSetting('installation_mode', mode);
    if (shoppingIntervalSeconds !== undefined) await setSetting('shopping_interval_seconds', Number(shoppingIntervalSeconds));
    return getInstallation();
  });
}

function buildStages(intervalSeconds) {
  const R = getRoundSeconds();
  return [
    { type: 'round', game: 'free', seconds: R },
    { type: 'interval', seconds: intervalSeconds, nextGame: 'single' },
    { type: 'round', game: 'single', seconds: R },
    { type: 'interval', seconds: intervalSeconds, nextGame: 'clear_all' },
    { type: 'round', game: 'clear_all', seconds: R }
  ];
}

function randomOtherSector(current) {
  const options = [1, 2, 3, 4, 5, 6].filter((s) => s !== current);
  return options[crypto.randomInt(0, options.length)];
}

function initRoundState(game) {
  if (game === 'single') return { activeSector: crypto.randomInt(1, 7) };
  if (game === 'clear_all') return { sectorStates: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true } };
  return {};
}

async function saveExperience(exp) {
  await run(
    `UPDATE commercial_experiences SET
       state = ?, stage_index = ?, stage_started_at = ?, stage_ends_at = ?, stage_planned_seconds = ?,
       round_state = ?, version = ?, ended_at = ?, end_reason = ?
     WHERE id = ?`,
    [
      exp.state, exp.stage_index, exp.stage_started_at, exp.stage_ends_at, exp.stage_planned_seconds,
      exp.round_state, exp.version, exp.ended_at || null, exp.end_reason || null, exp.id
    ]
  );
}

async function createRound(exp, stage, roundIndex, startedAt) {
  await run(
    `INSERT OR IGNORE INTO commercial_rounds
       (experience_id, user_id, round_index, mode, started_at, planned_seconds, status)
     VALUES (?, ?, ?, ?, ?, ?, 'IN_PROGRESS')`,
    [exp.id, exp.user_id, roundIndex, stage.game, startedAt, stage.seconds]
  );
}

async function finalizeRound(exp, roundIndex, status, endedAt) {
  const round = await get(
    `SELECT * FROM commercial_rounds WHERE experience_id = ? AND round_index = ?`,
    [exp.id, roundIndex]
  );
  if (!round || round.status !== 'IN_PROGRESS') return;

  const duration = Math.max(0, Math.round((endedAt - round.started_at) / 1000));
  const savesSession = Boolean(exp.user_id) && !exp.guest_id && round.shots_count > 0;
  const sessionId = savesSession ? `exp_${exp.id}_r${roundIndex}` : null;

  await run(
    `UPDATE commercial_rounds SET status = ?, ended_at = ?, duration_seconds = ?, session_id = ?
     WHERE id = ? AND status = 'IN_PROGRESS'`,
    [status, endedAt, duration, sessionId, round.id]
  );

  if (savesSession) {
    const accuracy = round.shots_count > 0 ? Math.round((round.hits_count / round.shots_count) * 100) : 0;
    const mode = (GAMES[round.mode] || GAMES.free).sessionMode;
    await run(
      `INSERT OR IGNORE INTO sessions (
         id, user_id, equipment_id, mode, shots_count, hits_count, accuracy, total_score,
         avg_force, duration_seconds, reactivations, is_simulation,
         wall_preset, wall_width_m, wall_height_m, sensor_coordinates_json
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 80, ?, ?, 1, ?, ?, ?, ?)`,
      [
        sessionId, exp.user_id, mode, round.shots_count, round.hits_count, accuracy,
        round.score, duration, round.reactivations,
        exp.wall_preset || '3x2',
        Number(exp.wall_width_m || 3.0),
        Number(exp.wall_height_m || 2.0),
        exp.sensor_coordinates_json || null
      ]
    );
  }
}

async function loadExperience(id) {
  return get(`SELECT * FROM commercial_experiences WHERE id = ?`, [id]);
}

async function syncExperience(exp, now = Date.now()) {
  if (!exp) return exp;
  const stages = JSON.parse(exp.stages_json);
  let changed = false;

  if (exp.state === 'PREPARING' && now >= exp.stage_ends_at) {
    const firstStageStart = exp.stage_ends_at;
    const firstStage = stages[0];
    exp.state = 'ACTIVE';
    exp.stage_index = 0;
    exp.stage_started_at = firstStageStart;
    exp.stage_ends_at = firstStageStart + firstStage.seconds * 1000;
    exp.stage_planned_seconds = firstStage.seconds;
    exp.round_state = JSON.stringify(initRoundState(firstStage.game));
    await createRound(exp, firstStage, 0, firstStageStart);
    exp.version += 1;
    await saveExperience(exp);
    changed = true;
  }

  while (exp.state === 'ACTIVE' && now >= exp.stage_ends_at) {
    const stage = stages[exp.stage_index];
    if (stage.type === 'round') {
      await finalizeRound(exp, exp.stage_index / 2, 'COMPLETED', exp.stage_ends_at);
    }

    if (exp.stage_index >= stages.length - 1) {
      exp.state = 'COMPLETED';
      exp.ended_at = exp.stage_ends_at;
      exp.end_reason = 'TIME';
      exp.round_state = null;
    } else {
      const startAt = exp.stage_ends_at;
      exp.stage_index += 1;
      const next = stages[exp.stage_index];
      exp.stage_started_at = startAt;
      exp.stage_ends_at = startAt + next.seconds * 1000;
      exp.stage_planned_seconds = next.seconds;
      if (next.type === 'round') {
        exp.round_state = JSON.stringify(initRoundState(next.game));
        await createRound(exp, next, exp.stage_index / 2, startAt);
      } else {
        exp.round_state = null;
      }
    }
    exp.version += 1;
    await saveExperience(exp);
    changed = true;
  }

  if (changed) {
    broadcastEvent('EXPERIENCE_UPDATED', { id: exp.id, state: exp.state, stageIndex: exp.stage_index });
  }
  return exp;
}

async function loadActiveSynced(now = Date.now()) {
  const exp = await get(
    `SELECT * FROM commercial_experiences WHERE state IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC LIMIT 1`
  );
  if (!exp) return null;
  await syncExperience(exp, now);
  return (exp.state === 'PREPARING' || exp.state === 'ACTIVE') ? exp : null;
}

function mapRound(r) {
  const game = GAMES[r.mode] || GAMES.free;
  return {
    roundIndex: r.round_index,
    game: game.key,
    gameName: game.name,
    status: r.status,
    won: Boolean(r.won),
    score: r.score,
    shots: r.shots_count,
    hits: r.hits_count,
    errors: r.errors_count,
    neutral: r.neutral_count,
    reactivations: r.reactivations,
    plannedSeconds: r.planned_seconds,
    durationSeconds: r.duration_seconds
  };
}

async function buildState(exp, now = Date.now()) {
  const stages = JSON.parse(exp.stages_json);
  const isPreparing = exp.state === 'PREPARING';
  const active = exp.state === 'ACTIVE';
  const stage = stages[exp.stage_index] || stages[0];
  const rounds = await all(`SELECT * FROM commercial_rounds WHERE experience_id = ? ORDER BY round_index`, [exp.id]);
  const finished = rounds.filter((r) => r.status !== 'IN_PROGRESS').map(mapRound);
  const currentRow = rounds.find((r) => r.status === 'IN_PROGRESS');
  const roundState = exp.round_state ? JSON.parse(exp.round_state) : {};

  const all3 = rounds.map(mapRound);
  const totals = all3.reduce(
    (t, r) => ({
      score: t.score + r.score,
      shots: t.shots + r.shots,
      hits: t.hits + r.hits,
      errors: t.errors + r.errors,
      durationSeconds: t.durationSeconds + (r.status === 'IN_PROGRESS' ? 0 : r.durationSeconds)
    }),
    { score: 0, shots: 0, hits: 0, errors: 0, durationSeconds: 0 }
  );

  const prepRemainingMs = isPreparing ? Math.max(0, exp.stage_ends_at - now) : 0;
  const prepRemainingSeconds = isPreparing ? Math.max(0, Math.ceil(prepRemainingMs / 1000)) : 0;

  const stageInfo = isPreparing
    ? {
        index: 0,
        type: 'preparing',
        game: stages[0].game,
        gameName: GAMES[stages[0].game].name,
        nextGame: stages[0].game,
        nextGameName: GAMES[stages[0].game].name,
        plannedSeconds: stages[0].seconds,
        prepPlannedSeconds: exp.stage_planned_seconds,
        startedAt: exp.stage_started_at,
        endsAt: exp.stage_ends_at,
        remainingMs: stages[0].seconds * 1000,
        prepRemainingMs,
        prepRemainingSeconds,
        totalStages: stages.length
      }
    : {
        index: exp.stage_index,
        type: stage.type,
        game: stage.type === 'round' ? stage.game : null,
        gameName: stage.type === 'round' ? GAMES[stage.game].name : null,
        nextGame: stage.type === 'interval' ? stage.nextGame : null,
        nextGameName: stage.type === 'interval' ? GAMES[stage.nextGame].name : null,
        plannedSeconds: exp.stage_planned_seconds,
        startedAt: exp.stage_started_at,
        endsAt: exp.stage_ends_at,
        remainingMs: active ? Math.max(0, exp.stage_ends_at - now) : 0,
        prepRemainingMs: 0,
        prepRemainingSeconds: 0,
        totalStages: stages.length
      };

  return {
    id: exp.id,
    userId: exp.user_id,
    guestId: exp.guest_id || null,
    isGuest: Boolean(exp.guest_id),
    state: exp.state,
    endReason: exp.end_reason,
    version: exp.version,
    wallPreset: exp.wall_preset,
    serverNow: now,
    startedAt: exp.started_at,
    endedAt: exp.ended_at,
    prepRemainingMs,
    prepRemainingSeconds,
    stage: stageInfo,
    round: currentRow
      ? {
          ...mapRound(currentRow),
          activeSector: roundState.activeSector || null,
          sectorStates: roundState.sectorStates || null
        }
      : isPreparing
        ? {
            roundIndex: 0,
            game: stages[0].game,
            gameName: GAMES[stages[0].game].name,
            status: 'PREPARING',
            won: false,
            score: 0,
            shots: 0,
            hits: 0,
            errors: 0,
            neutral: 0,
            reactivations: 0,
            plannedSeconds: stages[0].seconds,
            durationSeconds: 0,
            activeSector: roundState.activeSector || null,
            sectorStates: roundState.sectorStates || null
          }
        : null,
    results: finished,
    totals,
    intervalSeconds: stages.find((s) => s.type === 'interval')?.seconds,
    roundSeconds: stages[0].seconds,
    prepareSeconds: isPreparing ? exp.stage_planned_seconds : getPrepareSeconds()
  };
}

function startExperience(userOrActor) {
  return withLock(async () => {
    const actor = normalizeActor(userOrActor);
    if (!actor) {
      throw new HttpError(401, 'Sessão não autenticada.');
    }

    const installation = await getInstallation();
    if (installation.mode !== 'shopping') {
      throw new HttpError(400, 'A instalação está em Modo Pessoal. A experiência comercial só existe no Modo Shopping.');
    }

    const running = await loadActiveSynced();
    if (running) {
      throw new HttpError(409, 'Já existe uma experiência Shopping em andamento neste equipamento.');
    }

    const now = Date.now();
    const stages = buildStages(installation.shoppingIntervalSeconds);
    const prepSeconds = getPrepareSeconds();
    const actorWallCfg = await iotLocalizationService.getWallConfigForActor(actor);
    const wallPreset = actorWallCfg.preset || (await getSetting('wall_preset', '3x2'));
    const wallWidthM = Number(actorWallCfg.widthM || 3.0);
    const wallHeightM = Number(actorWallCfg.heightM || 2.0);
    const sensorCoordinatesJson = JSON.stringify(actorWallCfg.sensors);

    const initialState = prepSeconds > 0 ? 'PREPARING' : 'ACTIVE';
    const initialPlanned = prepSeconds > 0 ? prepSeconds : stages[0].seconds;
    const initialEndsAt = now + initialPlanned * 1000;

    const exp = {
      id: crypto.randomUUID(),
      user_id: actor.type === 'user' ? actor.userId : null,
      guest_id: actor.type === 'guest' ? actor.guestId : null,
      state: initialState,
      stage_index: 0,
      stage_started_at: now,
      stage_ends_at: initialEndsAt,
      stage_planned_seconds: initialPlanned,
      stages_json: JSON.stringify(stages),
      round_state: JSON.stringify(initRoundState('free')),
      wall_preset: wallPreset,
      wall_width_m: wallWidthM,
      wall_height_m: wallHeightM,
      sensor_coordinates_json: sensorCoordinatesJson,
      version: 0,
      started_at: now
    };

    await run(
      `INSERT INTO commercial_experiences (
         id, user_id, guest_id, state, stage_index, stage_started_at, stage_ends_at, stage_planned_seconds,
         stages_json, round_state, wall_preset, wall_width_m, wall_height_m, sensor_coordinates_json, version, started_at
       ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        exp.id, exp.user_id, exp.guest_id, exp.state, exp.stage_started_at, exp.stage_ends_at,
        exp.stage_planned_seconds, exp.stages_json, exp.round_state, exp.wall_preset,
        exp.wall_width_m, exp.wall_height_m, exp.sensor_coordinates_json, exp.started_at
      ]
    );

    if (initialState === 'ACTIVE') {
      await createRound(exp, stages[0], 0, now);
    }

    broadcastEvent('EXPERIENCE_UPDATED', { id: exp.id, state: exp.state, stageIndex: 0 });
    return buildState(exp, now);
  });
}

function canAccess(exp, userOrActor) {
  const actor = normalizeActor(userOrActor);
  if (!actor || !exp) return false;
  if (actor.role === 'admin') return true;
  if (actor.type === 'user') {
    return exp.user_id !== null && Number(exp.user_id) === Number(actor.userId);
  }
  if (actor.type === 'guest') {
    return Boolean(exp.guest_id && exp.guest_id === actor.guestId);
  }
  return false;
}

function isSameOwner(exp, userOrActor) {
  const actor = normalizeActor(userOrActor);
  if (!actor || !exp) return false;
  if (actor.type === 'user') {
    return exp.user_id !== null && Number(exp.user_id) === Number(actor.userId);
  }
  if (actor.type === 'guest') {
    return Boolean(exp.guest_id && exp.guest_id === actor.guestId);
  }
  return false;
}

function getCurrentFor(userOrActor) {
  return withLock(async () => {
    const now = Date.now();
    const actor = normalizeActor(userOrActor);
    const installation = await getInstallation();
    const active = await loadActiveSynced(now);

    let activeState = null;
    let busy = false;
    if (active) {
      if (canAccess(active, actor)) activeState = await buildState(active, now);
      else busy = true;
    }

    let last = null;
    if (!active && actor) {
      if (actor.type === 'user') {
        const row = await get(
          `SELECT * FROM commercial_experiences WHERE user_id = ? AND state NOT IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC LIMIT 1`,
          [actor.userId]
        );
        if (row) last = await buildState(row, now);
      } else if (actor.type === 'guest') {
        const row = await get(
          `SELECT * FROM commercial_experiences WHERE guest_id = ? AND state NOT IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC LIMIT 1`,
          [actor.guestId]
        );
        if (row) last = await buildState(row, now);
      }
    }

    return { installation, experience: activeState, busy, last, serverNow: now };
  });
}

async function applyImpactLocked(exp, { x, y, clientEventId }, now) {
  await syncExperience(exp, now);

  const reject = async (reason, roundIndex = null, classification = null) => {
    await run(
      `INSERT OR IGNORE INTO commercial_impacts
         (experience_id, user_id, round_index, client_event_id, x, y, classification, sector_id, accepted, points, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, ?)`,
      [exp.id, exp.user_id, roundIndex, clientEventId || null, x ?? null, y ?? null, classification, reason, now]
    );
    return { accepted: false, reason, state: await buildState(exp, now) };
  };

  if (exp.state === 'PREPARING') return reject('PREPARING_BLOCKED');
  if (exp.state !== 'ACTIVE') return reject('EXPERIENCE_ENDED');

  if (clientEventId) {
    const dup = await get(
      `SELECT id, accepted, reason FROM commercial_impacts WHERE experience_id = ? AND client_event_id = ?`,
      [exp.id, clientEventId]
    );
    if (dup) return { accepted: Boolean(dup.accepted), duplicate: true, reason: dup.reason, state: await buildState(exp, now) };
  }

  const stages = JSON.parse(exp.stages_json);
  const stage = stages[exp.stage_index];
  if (stage.type !== 'round') return reject('INTERVAL_BLOCKED');

  const roundIndex = exp.stage_index / 2;
  const cls = classifyImpact(x, y, exp.wall_preset);
  if (cls.classification === 'INVALID' || cls.classification === 'OUT_OF_BOUNDS') {
    return reject(cls.classification, roundIndex, cls.classification);
  }

  const round = await get(`SELECT * FROM commercial_rounds WHERE experience_id = ? AND round_index = ?`, [exp.id, roundIndex]);
  const rs = exp.round_state ? JSON.parse(exp.round_state) : {};
  const game = stage.game;

  let points = 0;
  let isHit = false;
  let reactivated = false;
  let won = false;
  let reason = cls.classification;

  if (cls.classification === 'NEUTRAL_AREA') {
    isHit = false;
  } else {
    const sector = cls.sectorId;
    if (game === 'free') {
      isHit = true;
      points = POINTS.FREE_HIT;
    } else if (game === 'single') {
      if (sector === rs.activeSector) {
        isHit = true;
        points = POINTS.SINGLE_HIT;
        rs.activeSector = randomOtherSector(rs.activeSector);
      } else {
        reason = 'WRONG_SECTOR';
      }
    } else if (game === 'clear_all') {
      const wasOn = rs.sectorStates[sector] !== false;
      if (wasOn) {
        rs.sectorStates[sector] = false;
        isHit = true;
        points = POINTS.CLEAR_OFF;
        if ([1, 2, 3, 4, 5, 6].every((s) => rs.sectorStates[s] === false)) {
          won = true;
          points += POINTS.CLEAR_WIN_BONUS;
          reason = 'WIN';
        }
      } else {
        rs.sectorStates[sector] = true;
        reactivated = true;
        reason = 'REACTIVATED';
      }
    }
  }

  await run(
    `UPDATE commercial_rounds SET
       score = score + ?, shots_count = shots_count + 1, hits_count = hits_count + ?,
       errors_count = errors_count + ?, neutral_count = neutral_count + ?, reactivations = reactivations + ?,
       won = ?
     WHERE id = ?`,
    [
      points, isHit ? 1 : 0, isHit ? 0 : 1,
      cls.classification === 'NEUTRAL_AREA' ? 1 : 0,
      reactivated ? 1 : 0, won ? 1 : 0, round.id
    ]
  );

  await run(
    `INSERT OR IGNORE INTO commercial_impacts
       (experience_id, user_id, round_index, client_event_id, x, y, classification, sector_id, accepted, points, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [exp.id, exp.user_id, roundIndex, clientEventId || null, x, y, cls.classification, cls.sectorId || null, points, reason, now]
  );

  exp.round_state = JSON.stringify(rs);
  exp.version += 1;

  if (won) {
    await finalizeRound(exp, roundIndex, 'WON', now);
    exp.state = 'COMPLETED';
    exp.ended_at = now;
    exp.end_reason = 'WON';
  }
  await saveExperience(exp);
  broadcastEvent('EXPERIENCE_UPDATED', { id: exp.id, state: exp.state, stageIndex: exp.stage_index });

  return {
    accepted: true,
    hit: isHit,
    points,
    classification: cls.classification,
    sectorId: cls.sectorId || null,
    reason,
    won,
    state: await buildState(exp, now)
  };
}

function registerImpact(experienceId, userOrActor, payload) {
  return withLock(async () => {
    const exp = await loadExperience(experienceId);
    if (!exp) throw new HttpError(404, 'Experiência não encontrada.');
    if (!isSameOwner(exp, userOrActor)) {
      throw new HttpError(403, 'Esta experiência pertence a outro jogador.');
    }
    return applyImpactLocked(exp, payload, Date.now());
  });
}

function registerHardwareImpact(payload) {
  return withLock(async () => {
    const now = Date.now();
    const exp = await loadActiveSynced(now);
    if (!exp) {
      throw new HttpError(409, 'Modo Shopping: nenhuma experiência ativa. Impacto ignorado.');
    }
    let { x, y, sectorId } = payload;
    if ((x === undefined || x === null || y === undefined || y === null) && sectorId) {
      const s = calculateWallGeometry(exp.wall_preset).sectors.find((i) => i.id === Number(sectorId));
      if (s) { x = s.centerX; y = s.centerY; }
    }
    return applyImpactLocked(exp, { x, y, clientEventId: payload.clientEventId }, now);
  });
}

function abortExperience(experienceId, userOrActor) {
  return withLock(async () => {
    const exp = await loadExperience(experienceId);
    if (!exp) throw new HttpError(404, 'Experiência não encontrada.');
    if (!canAccess(exp, userOrActor)) throw new HttpError(403, 'Sem permissão para interromper esta experiência.');

    const now = Date.now();
    await syncExperience(exp, now);
    if (exp.state === 'PREPARING' || exp.state === 'ACTIVE') {
      const stages = JSON.parse(exp.stages_json);
      if (exp.state === 'ACTIVE' && stages[exp.stage_index]?.type === 'round') {
        await finalizeRound(exp, exp.stage_index / 2, 'INTERRUPTED', now);
      }
      exp.state = 'INTERRUPTED';
      exp.ended_at = now;
      exp.end_reason = 'ABORTED';
      exp.round_state = null;
      exp.version += 1;
      await saveExperience(exp);
      broadcastEvent('EXPERIENCE_UPDATED', { id: exp.id, state: exp.state, stageIndex: exp.stage_index });
    }
    return buildState(exp, now);
  });
}

function recoverOnStartup() {
  return withLock(async () => {
    const rows = await all(`SELECT * FROM commercial_experiences WHERE state IN ('PREPARING', 'ACTIVE')`);
    const summary = { found: rows.length, restored: 0, completed: 0 };
    for (const exp of rows) {
      await syncExperience(exp, Date.now());
      if (exp.state === 'PREPARING' || exp.state === 'ACTIVE') summary.restored += 1;
      else summary.completed += 1;
    }
    return summary;
  });
}

let tickerHandle = null;
function startExperienceTicker(intervalMs = 250) {
  if (tickerHandle) return;
  tickerHandle = setInterval(() => {
    withLock(() => loadActiveSynced()).catch((err) => console.error('[EXPERIENCE] ticker:', err.message));
  }, intervalMs);
  if (tickerHandle.unref) tickerHandle.unref();
}

module.exports = {
  HttpError,
  GAMES,
  SEQUENCE,
  COMMERCIAL_PREPARE_SECONDS,
  ensureExperienceTables,
  getInstallation,
  setInstallation,
  startExperience,
  getCurrentFor,
  registerImpact,
  registerHardwareImpact,
  abortExperience,
  recoverOnStartup,
  startExperienceTicker
};
