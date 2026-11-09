const crypto = require('crypto');
const { run, get, all, exec } = require('../database/db');
const { classifyImpact, calculateWallGeometry } = require('./wallGeometry');
const { registerHit, getActiveWallPreset } = require('./gameEngine');
const { broadcastEvent } = require('./eventHub');
const guestSessionService = require('./guestSessionService');
const iotLocalizationService = require('./iotLocalizationService');
const arduinoIngestService = require('./arduinoIngestService');
const cloudOutboxService = require('./cloudOutboxService');

const PERSONAL_MATCH_SECONDS = 300;
const PERSONAL_PREPARE_SECONDS = 5;

const GAMES = {
  free: { key: 'free', name: 'Treino Livre', sessionMode: 'Treino Livre' },
  single: { key: 'single', name: 'Liga Um por Vez', sessionMode: 'Liga um por vez' },
  clear_all: { key: 'clear_all', name: 'Apagar Todos', sessionMode: 'Apagar todos' }
};

class PersonalMatchHttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function isTestMode() {
  return process.env.SMART_TENNIS_TEST_MODE === '1';
}

function getPersonalMatchSeconds() {
  const override = Number(process.env.SMART_TENNIS_PERSONAL_SECONDS);
  return isTestMode() && override > 0 ? override : PERSONAL_MATCH_SECONDS;
}

function getPrepareSeconds() {
  const override = Number(process.env.SMART_TENNIS_PREPARE_SECONDS);
  if (isTestMode() && Number.isFinite(override) && override >= 0 && process.env.SMART_TENNIS_PREPARE_SECONDS !== undefined && process.env.SMART_TENNIS_PREPARE_SECONDS !== '') {
    return override;
  }
  return PERSONAL_PREPARE_SECONDS;
}

let lockChain = Promise.resolve();
function withLock(fn) {
  const result = lockChain.then(() => fn());
  lockChain = result.catch(() => {});
  return result;
}

async function ensurePersonalMatchTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS personal_matches (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      equipment_id INTEGER DEFAULT 1,
      mode TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'PREPARING',
      prepare_started_at INTEGER,
      started_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      ended_at INTEGER,
      planned_seconds INTEGER NOT NULL DEFAULT 300,
      duration_seconds INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      shots_count INTEGER DEFAULT 0,
      hits_count INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      neutral_count INTEGER DEFAULT 0,
      reactivations INTEGER DEFAULT 0,
      won INTEGER DEFAULT 0,
      end_reason TEXT,
      round_state TEXT,
      wall_preset TEXT DEFAULT 'medium',
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pers_match_user_state ON personal_matches(user_id, state);

    CREATE TABLE IF NOT EXISTS personal_match_impacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      user_id INTEGER,
      client_event_id TEXT,
      hit_id INTEGER,
      shot_id INTEGER,
      x REAL,
      y REAL,
      sector_id INTEGER,
      classification TEXT,
      accepted INTEGER NOT NULL,
      points INTEGER DEFAULT 0,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pers_impacts_evt
      ON personal_match_impacts(match_id, client_event_id) WHERE client_event_id IS NOT NULL;
  `);

  try {
    const cols = await all(`PRAGMA table_info(personal_matches)`);
    if (!cols.some((c) => c.name === 'prepare_started_at')) await run(`ALTER TABLE personal_matches ADD COLUMN prepare_started_at INTEGER`);
    if (!cols.some((c) => c.name === 'is_simulation')) await run(`ALTER TABLE personal_matches ADD COLUMN is_simulation INTEGER DEFAULT 0`);
  } catch {}

  try {
    const impCols = await all(`PRAGMA table_info(personal_match_impacts)`);
    const extraCols = [
      ['shot_score', 'INTEGER DEFAULT 0'],
      ['shot_xp', 'INTEGER DEFAULT 0'],
      ['force_kmh', 'REAL DEFAULT 80.0'],
      ['is_bullseye', 'INTEGER DEFAULT 0']
    ];
    for (const [col, def] of extraCols) {
      if (!impCols.some((c) => c.name === col)) await run(`ALTER TABLE personal_match_impacts ADD COLUMN ${col} ${def}`);
    }
  } catch {}

  await cloudOutboxService.ensureOutboxTable();
  await iotLocalizationService.ensureIotAndWallTables();
}

function randomOtherSector(current) {
  const options = [1, 2, 3, 4, 5, 6].filter((s) => s !== Number(current));
  return options[crypto.randomInt(0, options.length)];
}

function initRoundState(mode) {
  const sectorHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  if (mode === 'single') return { activeSector: crypto.randomInt(1, 7), sectorHits };
  if (mode === 'clear_all') return { sectorStates: { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }, sectorHits };
  return { sectorHits };
}

function buildMatchState(match, now = Date.now()) {
  if (!match) return null;
  const rs = typeof match.round_state === 'string' ? JSON.parse(match.round_state) : (match.round_state || {});
  const isPreparing = match.state === 'PREPARING';
  const isActive = match.state === 'ACTIVE';

  const prepareStartedAt = match.prepare_started_at || (match.started_at - PERSONAL_PREPARE_SECONDS * 1000);
  const prepPlannedSeconds = Math.max(0, Math.round((match.started_at - prepareStartedAt) / 1000)) || PERSONAL_PREPARE_SECONDS;
  const prepRemainingMs = isPreparing ? Math.max(0, match.started_at - now) : 0;
  const prepRemainingSeconds = isPreparing ? Math.max(0, Math.ceil(prepRemainingMs / 1000)) : 0;

  const remainingMs = isPreparing ? match.planned_seconds * 1000 : isActive ? Math.max(0, match.ends_at - now) : 0;
  const remainingSeconds = isPreparing ? match.planned_seconds : isActive ? Math.ceil(remainingMs / 1000) : 0;

  const elapsedSeconds = isPreparing
    ? 0
    : isActive
      ? Math.max(0, Math.min(match.planned_seconds, Math.floor((now - match.started_at) / 1000)))
      : (match.duration_seconds || Math.max(0, Math.min(match.planned_seconds, Math.round(((match.ended_at || now) - match.started_at) / 1000))));

  const game = GAMES[match.mode] || GAMES.free;
  const accuracy = match.shots_count > 0 ? Math.round((match.hits_count / match.shots_count) * 100) : 0;

  return {
    id: match.id,
    sessionId: match.session_id || (match.is_guest ? null : `pers_${match.id}`),
    userId: match.user_id || null,
    guestId: match.guest_id || null,
    isGuest: Boolean(match.is_guest || match.guest_id),
    equipmentId: match.equipment_id || 1,
    mode: game.key,
    modeName: game.name,
    sessionMode: game.sessionMode,
    state: match.state,
    won: Boolean(match.won),
    endReason: match.end_reason || null,
    prepareStartedAt,
    startedAt: match.started_at,
    endsAt: match.ends_at,
    endedAt: match.ended_at || null,
    serverNow: now,
    prepPlannedSeconds,
    prepRemainingMs,
    prepRemainingSeconds,
    plannedSeconds: match.planned_seconds,
    durationSeconds: isPreparing ? 0 : (isActive ? elapsedSeconds : (match.duration_seconds ?? elapsedSeconds)),
    remainingMs,
    remainingSeconds,
    score: match.score || 0,
    shots: match.shots_count || 0,
    hits: match.hits_count || 0,
    errors: match.errors_count || 0,
    neutral: match.neutral_count || 0,
    reactivations: match.reactivations || 0,
    accuracy,
    activeSector: rs.activeSector || 1,
    sectorStates: rs.sectorStates || { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
    sectorHits: rs.sectorHits || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    wallPreset: match.wall_preset || '3x2',
    wallWidthM: Number(match.wall_width_m || 3.0),
    wallHeightM: Number(match.wall_height_m || 2.0),
    sensorCoordinates: typeof match.sensor_coordinates_json === 'string' && match.sensor_coordinates_json
      ? JSON.parse(match.sensor_coordinates_json)
      : null
  };
}

async function finalizePersonalMatch(match, nextState, endReason, endedAt = Date.now()) {
  if (!match || (match.state !== 'ACTIVE' && match.state !== 'PREPARING')) return match;

  if (match.state === 'PREPARING' || endedAt < match.started_at) {
    await run(
      `UPDATE personal_matches SET state = 'CANCELLED', ended_at = ?, duration_seconds = 0, end_reason = ?, session_id = NULL WHERE id = ? AND state IN ('PREPARING', 'ACTIVE')`,
      [endedAt, endReason || 'CANCELLED', match.id]
    );
    Object.assign(match, { state: 'CANCELLED', ended_at: endedAt, duration_seconds: 0, end_reason: endReason || 'CANCELLED', session_id: null });
    broadcastEvent('PERSONAL_MATCH_UPDATED', buildMatchState(match, endedAt));
    return match;
  }

  const rawElapsed = Math.round((endedAt - match.started_at) / 1000);
  const durationSeconds = endReason === 'TIME' ? match.planned_seconds : Math.max(1, Math.min(match.planned_seconds, rawElapsed));
  const sessionId = match.session_id || `pers_${match.id}`;
  const shouldSaveSession = Boolean(match.user_id) && !match.is_guest && (
    endReason === 'TIME' || endReason === 'WON' || endReason === 'MANUAL' || match.shots_count > 0
  );

  await run(
    `UPDATE personal_matches SET state = ?, ended_at = ?, duration_seconds = ?, end_reason = ?, session_id = ? WHERE id = ? AND state IN ('PREPARING', 'ACTIVE')`,
    [nextState, endedAt, durationSeconds, endReason, shouldSaveSession ? sessionId : null, match.id]
  );

  Object.assign(match, {
    state: nextState,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    end_reason: endReason,
    session_id: shouldSaveSession ? sessionId : null
  });

  if (shouldSaveSession) {
    const game = GAMES[match.mode] || GAMES.free;
    const accuracy = match.shots_count > 0 ? Math.round((match.hits_count / match.shots_count) * 100) : 0;
    await run(
      `INSERT OR IGNORE INTO sessions (
         id, user_id, equipment_id, mode, shots_count, hits_count, accuracy,
         total_score, avg_force, duration_seconds, reactivations, is_simulation,
         wall_preset, wall_width_m, wall_height_m, sensor_coordinates_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 82, ?, ?, 1, ?, ?, ?, ?)`,
      [
        sessionId,
        match.user_id,
        match.equipment_id || 1,
        game.sessionMode,
        match.shots_count,
        match.hits_count,
        accuracy,
        match.score,
        durationSeconds,
        match.mode === 'clear_all' ? match.reactivations : 0,
        match.wall_preset || '3x2',
        Number(match.wall_width_m || 3.0),
        Number(match.wall_height_m || 2.0),
        match.sensor_coordinates_json || null
      ]
    );

    try {
      await cloudOutboxService.createMatchFinishedEvent({ match, durationSeconds, sessionId, endedAt });
    } catch (outboxErr) {
      console.warn('[OUTBOX] Falha ao enfileirar evento de partida finalizada:', outboxErr.message);
    }
  }

  broadcastEvent('PERSONAL_MATCH_UPDATED', buildMatchState(match, endedAt));
  return match;
}

async function syncMatchClock(match, now = Date.now()) {
  if (!match) return null;
  if (match.state === 'PREPARING' && now >= match.started_at) {
    await run(`UPDATE personal_matches SET state = 'ACTIVE' WHERE id = ? AND state = 'PREPARING'`, [match.id]);
    match.state = 'ACTIVE';
    if (now < match.ends_at) broadcastEvent('PERSONAL_MATCH_UPDATED', buildMatchState(match, now));
  }
  if (match.state === 'ACTIVE' && now >= match.ends_at) {
    await finalizePersonalMatch(match, 'COMPLETED', 'TIME', match.ends_at);
  }
  return match;
}

async function syncUserActiveMatches(userId, now = Date.now()) {
  const activeRows = await all(
    `SELECT * FROM personal_matches WHERE user_id = ? AND state IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC`,
    [userId]
  );
  for (const row of activeRows) await syncMatchClock(row, now);
  const stillRunning = activeRows.filter((r) => r.state === 'PREPARING' || r.state === 'ACTIVE');
  for (let i = 1; i < stillRunning.length; i += 1) {
    await finalizePersonalMatch(stillRunning[i], 'INTERRUPTED', 'SUPERSEDED', now);
  }
  return stillRunning[0] || null;
}

function finalizeGuestMatchInMemory(guestState, match, nextState, endReason, endedAt = Date.now()) {
  if (!match) return null;
  if (match.state === 'PREPARING' || endedAt < match.started_at) {
    Object.assign(match, { state: 'CANCELLED', ended_at: endedAt, duration_seconds: 0, end_reason: endReason || 'CANCELLED' });
    if (guestState.activeMatch?.id === match.id) guestState.activeMatch = null;
    return match;
  }

  const rawElapsed = Math.round((endedAt - match.started_at) / 1000);
  const durationSeconds = endReason === 'TIME' ? match.planned_seconds : Math.max(1, Math.min(match.planned_seconds, rawElapsed));
  Object.assign(match, { state: nextState, ended_at: endedAt, duration_seconds: durationSeconds, end_reason: endReason });

  if (!guestState.lastMatchesByMode) guestState.lastMatchesByMode = {};
  guestState.lastMatchesByMode[match.mode] = { ...match };
  guestState.lastMatch = { ...match };
  if (guestState.activeMatch?.id === match.id) guestState.activeMatch = null;
  return match;
}

async function syncGuestMatchClock(guestId, guestState, now = Date.now()) {
  if (!guestState?.activeMatch) return null;
  const m = guestState.activeMatch;
  let dirty = false;

  if (m.state === 'PREPARING' && now >= m.started_at) {
    m.state = 'ACTIVE';
    dirty = true;
  }
  if (m.state === 'ACTIVE' && now >= m.ends_at) {
    finalizeGuestMatchInMemory(guestState, m, 'COMPLETED', 'TIME', m.ends_at);
    dirty = true;
  }
  if (dirty) await guestSessionService.saveGuestPersonalState(guestId, guestState);
  return guestState.activeMatch;
}

function normalizeActor({ actor, userId }) {
  if (actor?.type === 'guest' && actor.guestId) return { type: 'guest', guestId: actor.guestId };
  if (actor?.type === 'user' && actor.userId) return { type: 'user', userId: Number(actor.userId) };
  if (userId) return { type: 'user', userId: Number(userId) };
  throw new PersonalMatchHttpError(401, 'Sessão não autenticada.');
}

function createInitialMatchObject({ id, userId, guestId, isGuest, equipmentId, mode, prepSeconds, plannedSeconds, now, wallPreset, wallWidthM, wallHeightM, sensorCoordinatesJson, sessionId }) {
  const startedAt = now + prepSeconds * 1000;
  return {
    id,
    user_id: userId || null,
    guest_id: guestId || null,
    is_guest: Boolean(isGuest),
    equipment_id: Number(equipmentId || 1),
    mode,
    state: prepSeconds > 0 ? 'PREPARING' : 'ACTIVE',
    prepare_started_at: now,
    started_at: startedAt,
    ends_at: startedAt + plannedSeconds * 1000,
    ended_at: null,
    planned_seconds: plannedSeconds,
    duration_seconds: 0,
    score: 0,
    shots_count: 0,
    hits_count: 0,
    errors_count: 0,
    neutral_count: 0,
    reactivations: 0,
    won: 0,
    end_reason: null,
    round_state: JSON.stringify(initRoundState(mode)),
    wall_preset: wallPreset,
    wall_width_m: wallWidthM,
    wall_height_m: wallHeightM,
    sensor_coordinates_json: sensorCoordinatesJson,
    session_id: sessionId || null
  };
}

function assertMatchReadyForImpact(match, now, noMatchMsg) {
  if (!match) {
    throw new PersonalMatchHttpError(409, noMatchMsg, { accepted: false, reason: 'NO_ACTIVE_MATCH' });
  }
  if (match.state === 'PREPARING') {
    throw new PersonalMatchHttpError(409, 'Contagem regressiva de 5 segundos em andamento. Impactos bloqueados até o JÁ!.', {
      accepted: false,
      reason: 'PREPARING_BLOCKED',
      match: buildMatchState(match, now)
    });
  }
  if (match.state !== 'ACTIVE') {
    throw new PersonalMatchHttpError(409, 'Partida encerrada. Novos impactos estão bloqueados.', {
      accepted: false,
      reason: 'MATCH_ENDED',
      match: buildMatchState(match, now)
    });
  }
}

function evaluateAndApplyMatchRules(match, cls, rs) {
  let matchPoints = 0;
  let isMatchHit = false;
  let isReactivation = false;
  let won = false;
  let reason = cls.classification;

  if (cls.classification === 'TARGET_HIT' && cls.sectorId) {
    const hitSector = Number(cls.sectorId);
    rs.sectorHits[hitSector] = (rs.sectorHits[hitSector] || 0) + 1;

    if (match.mode === 'free') {
      isMatchHit = true;
      matchPoints = 85;
    } else if (match.mode === 'single') {
      if (hitSector === Number(rs.activeSector)) {
        isMatchHit = true;
        matchPoints = 1;
        rs.activeSector = randomOtherSector(rs.activeSector);
      } else {
        reason = 'WRONG_SECTOR';
      }
    } else if (match.mode === 'clear_all') {
      if (!rs.sectorStates) rs.sectorStates = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
      if (rs.sectorStates[hitSector] !== false) {
        rs.sectorStates[hitSector] = false;
        isMatchHit = true;
        matchPoints = 100;
        if ([1, 2, 3, 4, 5, 6].every((s) => rs.sectorStates[s] === false)) {
          won = true;
          matchPoints += 500;
          reason = 'WIN';
        }
      } else {
        rs.sectorStates[hitSector] = true;
        isReactivation = true;
        reason = 'REACTIVATED';
      }
    }
  }

  match.score += matchPoints;
  match.shots_count += 1;
  if (isMatchHit) match.hits_count += 1;
  else match.errors_count += 1;
  if (cls.classification === 'NEUTRAL_AREA') match.neutral_count += 1;
  if (isReactivation) match.reactivations += 1;
  if (won) match.won = 1;
  match.round_state = JSON.stringify(rs);

  return { matchPoints, isMatchHit, isReactivation, won, reason };
}

function resolveImpactCoordinates(x, y, sectorId, preset) {
  let resolvedX = x;
  let resolvedY = y;
  if ((resolvedX === undefined || resolvedX === null || resolvedY === undefined || resolvedY === null) && sectorId) {
    const s = calculateWallGeometry(preset).sectors.find((item) => item.id === Number(sectorId));
    if (s) {
      resolvedX = s.centerX;
      resolvedY = s.centerY;
    }
  }
  return { resolvedX, resolvedY, cls: classifyImpact(resolvedX, resolvedY, preset) };
}

function getCurrentMatch({ actor = null, userId = null, mode = null }) {
  return withLock(async () => {
    const now = Date.now();
    const resolvedActor = normalizeActor({ actor, userId });

    if (resolvedActor.type === 'guest') {
      const guestState = await guestSessionService.getGuestPersonalState(resolvedActor.guestId);
      const active = await syncGuestMatchClock(resolvedActor.guestId, guestState, now);
      const current = active && (!mode || active.mode === mode) ? buildMatchState(active, now) : null;
      const lastObj = mode ? guestState.lastMatchesByMode?.[mode] || null : guestState.lastMatch || null;

      return {
        match: current,
        lastMatch: lastObj ? buildMatchState(lastObj, now) : null,
        plannedSeconds: getPersonalMatchSeconds(),
        prepareSeconds: getPrepareSeconds(),
        isGuest: true,
        serverNow: now
      };
    }

    const effectiveUserId = resolvedActor.userId;
    const active = await syncUserActiveMatches(effectiveUserId, now);
    const current = active && (!mode || active.mode === mode) ? buildMatchState(active, now) : null;

    const lastQuery = mode
      ? await get(
          `SELECT * FROM personal_matches WHERE user_id = ? AND mode = ? AND state NOT IN ('PREPARING', 'ACTIVE', 'CANCELLED') ORDER BY started_at DESC LIMIT 1`,
          [effectiveUserId, mode]
        )
      : await get(
          `SELECT * FROM personal_matches WHERE user_id = ? AND state NOT IN ('PREPARING', 'ACTIVE', 'CANCELLED') ORDER BY started_at DESC LIMIT 1`,
          [effectiveUserId]
        );

    return {
      match: current,
      lastMatch: lastQuery ? buildMatchState(lastQuery, now) : null,
      plannedSeconds: getPersonalMatchSeconds(),
      prepareSeconds: getPrepareSeconds(),
      isGuest: false,
      serverNow: now
    };
  });
}

function startMatch({ actor = null, userId = null, equipmentId = 1, mode = 'free', forceNew = false }) {
  return withLock(async () => {
    const now = Date.now();
    const resolvedActor = normalizeActor({ actor, userId });
    const cleanMode = GAMES[mode] ? mode : 'free';
    const prepSeconds = getPrepareSeconds();
    const plannedSeconds = getPersonalMatchSeconds();
    const actorWallCfg = await iotLocalizationService.getWallConfigForActor(resolvedActor);
    const wallPreset = actorWallCfg.preset || (await getActiveWallPreset());
    const wallWidthM = Number(actorWallCfg.widthM || 3.0);
    const wallHeightM = Number(actorWallCfg.heightM || 2.0);
    const sensorCoordinatesJson = JSON.stringify(actorWallCfg.sensors);

    if (resolvedActor.type === 'guest') {
      const guestState = await guestSessionService.getGuestPersonalState(resolvedActor.guestId);
      const existing = await syncGuestMatchClock(resolvedActor.guestId, guestState, now);

      if (existing) {
        if (!forceNew && existing.mode === cleanMode) return buildMatchState(existing, now);
        finalizeGuestMatchInMemory(guestState, existing, 'INTERRUPTED', 'SWITCHED', now);
      }

      const guestMatch = createInitialMatchObject({
        id: `gpm_${crypto.randomUUID()}`,
        guestId: resolvedActor.guestId,
        isGuest: true,
        equipmentId,
        mode: cleanMode,
        prepSeconds,
        plannedSeconds,
        now,
        wallPreset,
        wallWidthM,
        wallHeightM,
        sensorCoordinatesJson
      });

      guestState.activeMatch = guestMatch;
      guestState.impactEventIds = [];
      await guestSessionService.saveGuestPersonalState(resolvedActor.guestId, guestState);
      return buildMatchState(guestMatch, now);
    }

    const effectiveUserId = resolvedActor.userId;
    const existingActive = await syncUserActiveMatches(effectiveUserId, now);
    if (existingActive) {
      if (!forceNew && existingActive.mode === cleanMode) return buildMatchState(existingActive, now);
      await finalizePersonalMatch(existingActive, 'INTERRUPTED', 'SWITCHED', now);
    }

    const id = `pm_${crypto.randomUUID()}`;
    const match = createInitialMatchObject({
      id,
      userId: effectiveUserId,
      isGuest: false,
      equipmentId,
      mode: cleanMode,
      prepSeconds,
      plannedSeconds,
      now,
      wallPreset,
      wallWidthM,
      wallHeightM,
      sensorCoordinatesJson,
      sessionId: `pers_${id}`
    });

    await run(
      `INSERT INTO personal_matches (
         id, user_id, equipment_id, mode, state, prepare_started_at, started_at, ends_at, planned_seconds,
         round_state, wall_preset, wall_width_m, wall_height_m, sensor_coordinates_json, session_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id, match.user_id, match.equipment_id, match.mode, match.state,
        match.prepare_started_at, match.started_at, match.ends_at, match.planned_seconds,
        match.round_state, match.wall_preset, match.wall_width_m, match.wall_height_m,
        match.sensor_coordinates_json, match.session_id
      ]
    );

    const state = buildMatchState(match, now);
    broadcastEvent('PERSONAL_MATCH_UPDATED', state);
    return state;
  });
}

function finishMatch({ actor = null, userId = null, matchId = null }) {
  return withLock(async () => {
    const now = Date.now();
    const resolvedActor = normalizeActor({ actor, userId });

    if (resolvedActor.type === 'guest') {
      const guestState = await guestSessionService.getGuestPersonalState(resolvedActor.guestId);
      await syncGuestMatchClock(resolvedActor.guestId, guestState, now);
      const match = guestState.activeMatch;
      if (!match) {
        if (guestState.lastMatch && (!matchId || guestState.lastMatch.id === matchId)) {
          return buildMatchState(guestState.lastMatch, now);
        }
        throw new PersonalMatchHttpError(404, 'Nenhuma partida de visitante encontrada para encerrar.');
      }
      if (match.state === 'PREPARING') finalizeGuestMatchInMemory(guestState, match, 'CANCELLED', 'CANCELLED', now);
      else if (match.state === 'ACTIVE') finalizeGuestMatchInMemory(guestState, match, 'COMPLETED', 'MANUAL', now);
      await guestSessionService.saveGuestPersonalState(resolvedActor.guestId, guestState);
      return buildMatchState(match, now);
    }

    const effectiveUserId = resolvedActor.userId;
    const match = matchId
      ? await get(`SELECT * FROM personal_matches WHERE id = ? AND user_id = ?`, [matchId, effectiveUserId])
      : await get(`SELECT * FROM personal_matches WHERE user_id = ? AND state IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC LIMIT 1`, [effectiveUserId]);

    if (!match) throw new PersonalMatchHttpError(404, 'Nenhuma partida pessoal encontrada para encerrar.');
    await syncMatchClock(match, now);
    if (match.state === 'PREPARING') await finalizePersonalMatch(match, 'CANCELLED', 'CANCELLED', now);
    else if (match.state === 'ACTIVE') await finalizePersonalMatch(match, 'COMPLETED', 'MANUAL', now);
    return buildMatchState(match, now);
  });
}

function registerPersonalImpact({
  actor = null,
  userId = null,
  equipmentId = 1,
  matchId = null,
  sessionId = null,
  gameMode = 'free',
  sectorId = null,
  x = null,
  y = null,
  speed = 80,
  source = 'mouse',
  isSimulation = true,
  clientEventId = null
}) {
  return withLock(async () => {
    const now = Date.now();
    const resolvedActor = normalizeActor({ actor, userId });
    const cleanMode = GAMES[gameMode] ? gameMode : 'free';

    if (resolvedActor.type === 'guest') {
      const guestState = await guestSessionService.getGuestPersonalState(resolvedActor.guestId);
      await syncGuestMatchClock(resolvedActor.guestId, guestState, now);

      let match = guestState.activeMatch;
      if (!match && matchId && guestState.lastMatch?.id === matchId) match = guestState.lastMatch;
      assertMatchReadyForImpact(match, now, 'Nenhuma partida iniciada. Clique em JOGAR para iniciar a contagem.');

      if (!Array.isArray(guestState.impactEventIds)) guestState.impactEventIds = [];
      if (clientEventId && guestState.impactEventIds.includes(clientEventId)) {
        return {
          accepted: true,
          duplicate: true,
          received_by_backend: true,
          persisted_in_db: false,
          is_guest: true,
          hit_id: null,
          shot_id: null,
          attributeUpdates: [],
          unlockedAchievements: [],
          match: buildMatchState(match, now)
        };
      }
      if (clientEventId) {
        guestState.impactEventIds.push(clientEventId);
        if (guestState.impactEventIds.length > 500) guestState.impactEventIds.shift();
      }

      const preset = match.wall_preset || 'medium';
      const { resolvedX, resolvedY, cls } = resolveImpactCoordinates(x, y, sectorId, preset);
      const rs = typeof match.round_state === 'string' ? JSON.parse(match.round_state) : initRoundState(match.mode);
      if (!rs.sectorHits) rs.sectorHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      const { matchPoints, isMatchHit, isReactivation, won, reason } = evaluateAndApplyMatchRules(match, cls, rs);
      if (won) finalizeGuestMatchInMemory(guestState, match, 'WON', 'WON', now);

      await guestSessionService.saveGuestPersonalState(resolvedActor.guestId, guestState);
      return {
        accepted: true,
        duplicate: false,
        received_by_backend: true,
        persisted_in_db: false,
        is_guest: true,
        hit_id: null,
        shot_id: null,
        hit: {
          id: null,
          sensor_id: cls.sectorId || null,
          target_id: cls.sectorId || null,
          x: resolvedX,
          y: resolvedY,
          speed,
          score: matchPoints,
          xp: 0,
          is_hit: isMatchHit ? 1 : 0,
          classification: cls.classification
        },
        player: null,
        attributeUpdates: [],
        unlockedAchievements: [],
        match_points: matchPoints,
        is_match_hit: isMatchHit,
        reactivated: isReactivation,
        won,
        reason,
        match: buildMatchState(match, now)
      };
    }

    const effectiveUserId = resolvedActor.userId;
    let match = null;
    if (matchId) {
      match = await get(`SELECT * FROM personal_matches WHERE id = ? AND user_id = ?`, [matchId, effectiveUserId]);
      if (match) await syncMatchClock(match, now);
    } else {
      const active = await syncUserActiveMatches(effectiveUserId, now);
      if (active && active.mode === cleanMode) match = active;
    }

    assertMatchReadyForImpact(match, now, 'Nenhuma partida ativa no momento. Clique em JOGAR para iniciar.');

    if (clientEventId) {
      const dup = await get(`SELECT * FROM personal_match_impacts WHERE match_id = ? AND client_event_id = ?`, [match.id, clientEventId]);
      if (dup) {
        const existingHit = dup.hit_id ? await get(`SELECT * FROM hits WHERE id = ?`, [dup.hit_id]) : null;
        const player = await get(`SELECT * FROM players WHERE user_id = ? LIMIT 1`, [effectiveUserId]);
        return {
          accepted: Boolean(dup.accepted),
          duplicate: true,
          received_by_backend: true,
          persisted_in_db: true,
          hit_id: dup.hit_id,
          shot_id: dup.shot_id,
          hit: existingHit,
          player,
          attributeUpdates: [],
          unlockedAchievements: [],
          match: buildMatchState(match, now)
        };
      }
    }

    const preset = match.wall_preset || 'medium';
    const { resolvedX, resolvedY, cls } = resolveImpactCoordinates(x, y, sectorId, preset);
    const rs = match.round_state ? JSON.parse(match.round_state) : initRoundState(match.mode);
    if (!rs.sectorHits) rs.sectorHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    const targetBeforeHit = rs.activeSector || null;
    const hitSectorOrNull = cls.classification === 'TARGET_HIT' ? cls.sectorId : null;

    const engineResult = await registerHit({
      userId: effectiveUserId,
      equipmentId: match.equipment_id || equipmentId || 1,
      sessionId: sessionId || match.session_id,
      gameMode: match.mode,
      sectorId: hitSectorOrNull,
      sensorId: hitSectorOrNull,
      targetId: hitSectorOrNull,
      x: resolvedX,
      y: resolvedY,
      speed,
      targetSensorId: targetBeforeHit,
      source,
      isSimulation,
      is_simulation: isSimulation,
      wallPreset: preset
    });

    if (isSimulation) {
      arduinoIngestService.recordSimulatedImpactDiagnostic({
        xPct: resolvedX,
        yPct: resolvedY,
        sectorId: cls.sectorId || null,
        classification: cls.classification,
        gameMode: match.mode,
        wallPreset: preset
      });
    }

    const { matchPoints, isMatchHit, isReactivation, won, reason } = evaluateAndApplyMatchRules(match, cls, rs);

    await run(
      `UPDATE personal_matches SET
         score = ?, shots_count = ?, hits_count = ?, errors_count = ?,
         neutral_count = ?, reactivations = ?, won = ?, round_state = ?
       WHERE id = ?`,
      [
        match.score, match.shots_count, match.hits_count, match.errors_count,
        match.neutral_count, match.reactivations, match.won, match.round_state,
        match.id
      ]
    );

    if (isSimulation) match.is_simulation = 1;

    const hitId = engineResult.hit?.id || null;
    const shotId = engineResult.hit?.shot_id || null;
    const shotScore = engineResult.hit?.score || 0;
    const shotXp = engineResult.hit?.xp || 0;
    const shotSpeed = engineResult.hit?.speed !== undefined ? engineResult.hit.speed : (speed || 80);
    const isBullseye = engineResult.hit?.is_bullseye ? 1 : 0;

    await run(
      `INSERT OR IGNORE INTO personal_match_impacts (
         match_id, user_id, client_event_id, hit_id, shot_id, x, y,
         sector_id, classification, accepted, points, reason, created_at,
         shot_score, shot_xp, force_kmh, is_bullseye
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id, effectiveUserId, clientEventId || null, hitId, shotId,
        resolvedX, resolvedY, cls.sectorId || null, cls.classification,
        matchPoints, reason, now,
        shotScore, shotXp, shotSpeed, isBullseye
      ]
    );

    if (won) await finalizePersonalMatch(match, 'WON', 'WON', now);

    const matchState = buildMatchState(match, now);
    broadcastEvent('PERSONAL_MATCH_UPDATED', matchState);

    return {
      ...engineResult,
      accepted: true,
      duplicate: false,
      received_by_backend: true,
      persisted_in_db: true,
      hit_id: hitId,
      shot_id: shotId,
      match_points: matchPoints,
      is_match_hit: isMatchHit,
      reactivated: isReactivation,
      won,
      reason,
      match: matchState
    };
  });
}

function recoverPersonalMatchesOnStartup() {
  return withLock(async () => {
    const now = Date.now();
    const rows = await all(`SELECT * FROM personal_matches WHERE state IN ('PREPARING', 'ACTIVE')`);
    let restored = 0;
    let completed = 0;
    for (const row of rows) {
      await syncMatchClock(row, now);
      if (row.state === 'PREPARING' || row.state === 'ACTIVE') restored += 1;
      else completed += 1;
    }
    return { found: rows.length, restored, completed };
  });
}

let personalTickerHandle = null;
function startPersonalMatchTicker(intervalMs = 250) {
  if (personalTickerHandle) return;
  personalTickerHandle = setInterval(() => {
    withLock(async () => {
      const now = Date.now();
      const running = await all(
        `SELECT * FROM personal_matches WHERE (state = 'PREPARING' AND started_at <= ?) OR (state = 'ACTIVE' AND ends_at <= ?)`,
        [now, now]
      );
      for (const match of running) await syncMatchClock(match, now);
    }).catch((err) => console.error('[PERSONAL MATCH] ticker:', err.message));
  }, intervalMs);
  if (personalTickerHandle.unref) personalTickerHandle.unref();
}

module.exports = {
  PersonalMatchHttpError,
  PERSONAL_MATCH_SECONDS,
  PERSONAL_PREPARE_SECONDS,
  getPersonalMatchSeconds,
  getPrepareSeconds,
  ensurePersonalMatchTables,
  getCurrentMatch,
  startMatch,
  finishMatch,
  registerPersonalImpact,
  recoverPersonalMatchesOnStartup,
  startPersonalMatchTicker
};
