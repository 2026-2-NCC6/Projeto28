const express = require('express');
const router = express.Router();
const { get, run, all } = require('../database/db');
const { generateSimulatedSensorHit } = require('../services/gameEngine');
const { broadcastEvent } = require('../services/eventHub');
const { requireAuth, requireUserOrGuest } = require('../services/authService');
const experienceService = require('../services/experienceService');
const personalMatchService = require('../services/personalMatchService');
const iotLocalizationService = require('../services/iotLocalizationService');
const arduinoIngestService = require('../services/arduinoIngestService');

let hardwareStatus = {
  mode: 'simulation',
  lastSeen: null,
  activeSensors: ['S1', 'S2', 'S3'],
  baudRate: 115200,
  port: 'COM3 (Virtual)'
};

(async function initHardwareMode() {
  try {
    const row = await get(`SELECT value FROM system_settings WHERE key = 'hardware_mode'`);
    if (row?.value && (row.value === 'simulation' || row.value === 'connected')) {
      hardwareStatus.mode = row.value;
      arduinoIngestService.setHardwareConnectionMode(row.value);
    }
  } catch {}
})();

async function requireNicolasOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
  const isAdmin = req.user.role === 'admin';
  const isNicolas = await iotLocalizationService.isNicolasAccount(req.user.id);
  if (!isAdmin && !isNicolas) {
    return res.status(403).json({
      error: 'Acesso restrito. O painel técnico de diagnóstico IoT é exclusivo para usuários autorizados.'
    });
  }
  return next();
}

router.get('/status', (req, res) => {
  res.json({
    status: hardwareStatus.mode === 'connected' ? 'connected' : 'simulation',
    details: hardwareStatus
  });
});

router.post('/mode', async (req, res) => {
  const { mode, port, baudRate } = req.body || {};
  if (mode !== 'simulation' && mode !== 'connected') {
    return res.status(400).json({ error: 'Modo inválido. Use "simulation" ou "connected"' });
  }
  hardwareStatus.mode = mode;
  if (port) hardwareStatus.port = port;
  if (baudRate) hardwareStatus.baudRate = Number(baudRate);
  hardwareStatus.lastSeen = new Date().toISOString();
  arduinoIngestService.setHardwareConnectionMode(mode, { port, baudRate });
  try {
    await run(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('hardware_mode', ?, CURRENT_TIMESTAMP)`,
      [mode]
    );
  } catch (e) {
    console.warn('[Hardware] Falha ao persistir hardware_mode:', e.message);
  }
  broadcastEvent('HARDWARE_STATUS_CHANGED', hardwareStatus);
  return res.json({ success: true, hardwareStatus });
});

async function resolveUnequivocalActiveMatch(equipmentId) {
  const now = Date.now();
  const eqId = Number(equipmentId || 1);
  const candidates = await all(
    `SELECT * FROM personal_matches WHERE equipment_id = ? AND state IN ('PREPARING', 'ACTIVE') ORDER BY started_at DESC`,
    [eqId]
  );
  if (!candidates?.length) return { match: null, reason: 'NO_ACTIVE_MATCH', eligibleToScore: false };

  const validRunning = [];
  for (const m of candidates) {
    if (m.ends_at && now >= m.ends_at) {
      await run(`UPDATE personal_matches SET state = 'COMPLETED', ended_at = ?, end_reason = 'TIME' WHERE id = ?`, [m.ends_at, m.id]).catch(() => {});
      continue;
    }
    if (m.state === 'PREPARING' && m.started_at && now >= m.started_at) {
      m.state = 'ACTIVE';
      await run(`UPDATE personal_matches SET state = 'ACTIVE' WHERE id = ?`, [m.id]).catch(() => {});
    }
    validRunning.push(m);
  }

  if (validRunning.length === 0) return { match: null, reason: 'NO_ACTIVE_MATCH', eligibleToScore: false };
  if (validRunning.length > 1) return { match: null, reason: 'AMBIGUOUS_ACTIVE_MATCHES', eligibleToScore: false, count: validRunning.length };
  const activeMatch = validRunning[0];
  if (activeMatch.state === 'PREPARING') return { match: activeMatch, reason: 'MATCH_IN_PREPARATION', eligibleToScore: false };
  return { match: activeMatch, reason: 'EQUIVOCAL_ACTIVE_MATCH', eligibleToScore: true };
}

function broadcastVisualImpact(impact, extra = {}) {
  broadcastEvent('HIT_REGISTERED', {
    hit: {
      x: impact.screenXPct,
      y: impact.screenYPct,
      sensor_id: impact.sectorId,
      is_hit: impact.sectorClassification === 'TARGET_HIT' ? 1 : 0,
      classification: impact.sectorClassification,
      ...(extra.uncertain ? { uncertain: true } : {})
    },
    match: null,
    received_by_backend: true,
    persisted_in_db: false,
    source: extra.source || 'arduino',
    is_simulation: Boolean(extra.is_simulation),
    ...(extra.reason ? { reason: extra.reason } : {})
  });
}

function emitMatchImpactEvents(result, { source, is_simulation, client_event_id, broadcastGuest = false }) {
  const broadcastPayload = {
    ...result,
    source,
    is_simulation,
    client_event_id,
    hit_id: result.hit ? result.hit.id : result.hit_id || null,
    shot_id: result.hit ? result.hit.shot_id : result.shot_id || null,
    received_by_backend: true,
    persisted_in_db: Boolean(result.persisted_in_db)
  };

  if (!result.duplicate && !result.is_guest) {
    broadcastEvent('HIT_REGISTERED', broadcastPayload);
    broadcastEvent('SHOT_REGISTERED', {
      shot: result.hit,
      player: result.player,
      attributeUpdates: result.attributeUpdates,
      unlockedAchievements: result.unlockedAchievements
    });
    if (result.player?.leveledUp) broadcastEvent('LEVEL_UP', result.player);
    if (result.unlockedAchievements?.length > 0) broadcastEvent('ACHIEVEMENT_UNLOCKED', result.unlockedAchievements);
  } else if (broadcastGuest && result.is_guest) {
    broadcastEvent('HIT_REGISTERED', broadcastPayload);
  }
  return broadcastPayload;
}

async function handleArduinoEvents(req, res) {
  try {
    const payload = req.body || {};
    const result = await arduinoIngestService.ingestArduinoPayload(payload);
    hardwareStatus.lastSeen = new Date().toISOString();

    const isTestOrSimulation = Boolean(
      payload.is_simulation || payload.isSimulation || payload.is_test || payload.isTest ||
      /TEST|BENCH|SIMULAT/i.test(String(payload.device_id || '')) ||
      (result.impact && (result.impact.isSimulation || /TEST|BENCH|SIMULAT/i.test(String(result.impact.deviceId || ''))))
    );

    if (!isTestOrSimulation && payload.device_id && hardwareStatus.mode !== 'connected') {
      hardwareStatus.mode = 'connected';
      arduinoIngestService.setHardwareConnectionMode('connected');
      run(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('hardware_mode', 'connected', CURRENT_TIMESTAMP)`).catch(() => {});
      broadcastEvent('HARDWARE_STATUS_CHANGED', hardwareStatus);
    }

    const impact = result.impact;
    const hasValidLocation = impact && impact.screenXPct !== null && impact.screenYPct !== null;
    const isEstimationStrictlyValid = hasValidLocation && impact.estimationStatus === 'valid';

    if (isEstimationStrictlyValid && !isTestOrSimulation) {
      try {
        const targetEquipmentId = Number(payload.equipment_id || 1);
        const matchResolution = await resolveUnequivocalActiveMatch(targetEquipmentId);

        if (matchResolution.eligibleToScore && matchResolution.match) {
          const activeMatch = matchResolution.match;
          const actor = activeMatch.user_id
            ? { type: 'user', userId: activeMatch.user_id }
            : { type: 'guest', guestId: activeMatch.guest_id };
          const measuredSpeed = payload.speed !== undefined
            ? Number(payload.speed)
            : (payload.force !== undefined ? Number(payload.force) : undefined);

          const matchResult = await personalMatchService.registerPersonalImpact({
            actor,
            equipmentId: activeMatch.equipment_id || targetEquipmentId,
            matchId: activeMatch.id,
            gameMode: activeMatch.mode,
            sectorId: impact.sectorId,
            x: impact.screenXPct,
            y: impact.screenYPct,
            speed: measuredSpeed,
            source: 'arduino',
            isSimulation: false,
            clientEventId: impact.eventId || impact.groupId
          });

          emitMatchImpactEvents(matchResult, {
            source: 'arduino',
            is_simulation: false,
            client_event_id: impact.eventId || impact.groupId,
            broadcastGuest: true
          });
          result.matchImpact = matchResult;
        } else {
          broadcastVisualImpact(impact, { reason: matchResolution.reason });
        }
      } catch (matchErr) {
        console.warn('[ARDUINO INGEST] Erro ao registrar impacto na partida:', matchErr.message);
        broadcastVisualImpact(impact, { reason: 'MATCH_REGISTRATION_FAILED' });
      }
    } else if (hasValidLocation && !isTestOrSimulation) {
      broadcastVisualImpact(impact, { uncertain: true, reason: 'LOCATION_UNCERTAIN' });
    } else if (hasValidLocation && isTestOrSimulation) {
      broadcastVisualImpact(impact, { source: 'test_simulation', is_simulation: true });
    }

    const httpCode = result.accepted ? 200 : (
      result.status === 'REJECTED_DUPLICATE_EVENT' || result.duplicateSensorInGroup ? 409 : 422
    );
    return res.status(httpCode).json({ success: Boolean(result.accepted), ...result });
  } catch (error) {
    console.error('[ARDUINO INGEST] Erro ao processar leitura do Arduino:', error);
    return res.status(500).json({ error: error.message });
  }
}

router.post('/arduino/events', handleArduinoEvents);
router.post('/arduino/reading', handleArduinoEvents);

router.get('/iot-diagnostics', requireAuth, requireNicolasOrAdmin, async (req, res) => {
  try {
    res.json(await arduinoIngestService.getIotDiagnosticsState(req.actor));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function handleUpdateIotCalibration(req, res) {
  try {
    const { calibration, sensorOffsetsCm, preset } = req.body || {};
    const updated = await iotLocalizationService.updateNicolasWallConfig({
      actor: req.actor,
      preset,
      sensorOffsetsCm,
      calibration
    });
    const diag = await arduinoIngestService.getIotDiagnosticsState(req.actor);
    broadcastEvent('IOT_DIAGNOSTIC_UPDATED', diag);
    res.json({ success: true, wallConfig: updated, diagnostics: diag });
  } catch (error) {
    if (error instanceof iotLocalizationService.WallConfigHttpError) {
      return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
    }
    res.status(500).json({ error: error.message });
  }
}

router.put('/iot-calibration', requireAuth, requireNicolasOrAdmin, handleUpdateIotCalibration);
router.post('/iot-calibration', requireAuth, requireNicolasOrAdmin, handleUpdateIotCalibration);

router.post('/iot-diagnostics/test-tdoa', requireAuth, requireNicolasOrAdmin, async (req, res) => {
  try {
    const { xMeters, yMeters, t1Us, t2Us, t3Us, eventId, deviceId = 'ARDUINO_TEST_BENCH' } = req.body || {};
    const wallCfg = await iotLocalizationService.getWallConfigForActor(req.actor);
    let payloadToIngest;

    if (t1Us !== undefined || t2Us !== undefined || t3Us !== undefined) {
      payloadToIngest = {
        event_id: eventId || `bench_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        device_id: deviceId,
        t1_us: t1Us,
        t2_us: t2Us,
        t3_us: t3Us,
        valid: true
      };
    } else {
      const synth = iotLocalizationService.generateSyntheticArduinoTimestamps({
        xMeters: xMeters !== undefined ? Number(xMeters) : Number((wallCfg.widthM / 2).toFixed(2)),
        yMeters: yMeters !== undefined ? Number(yMeters) : Number((wallCfg.heightM / 2).toFixed(2)),
        presetOrDims: { width: wallCfg.widthM, height: wallCfg.heightM },
        sensorOffsetsCm: wallCfg.sensorOffsetsCm,
        propagationSpeedMps: Number(wallCfg.calibration?.propagationSpeedMps || 340),
        baseTimestampUs: 1000000 + Math.floor(Math.random() * 500000),
        sensorDelayOffsetsUs: wallCfg.calibration?.sensorDelayOffsetsUs
      });

      const baseEvt = eventId || `synth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      payloadToIngest = {
        readings: ['S1', 'S2', 'S3'].map((s, idx) => ({
          event_id: `${baseEvt}_${s}`,
          sensor_id: s,
          timestamp_us: [synth.t1Us, synth.t2Us, synth.t3Us][idx],
          device_id: deviceId,
          valid: true
        })),
        finalize_pending: true
      };
    }

    const ingestResult = await arduinoIngestService.ingestArduinoPayload(payloadToIngest, req.actor);
    const diagnostics = await arduinoIngestService.getIotDiagnosticsState(req.actor);
    res.json({ success: Boolean(ingestResult.accepted), ingestResult, diagnostics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/hit', requireUserOrGuest, async (req, res) => {
  try {
    const {
      sensor_id, sector_id, target_id, speed, force, x, y,
      equipment_id = 1, session_id, match_id, game_mode = 'free',
      source = 'mouse', is_simulation = true, client_event_id
    } = req.body || {};

    const resolvedId = sector_id !== undefined ? sector_id : (target_id !== undefined ? target_id : sensor_id);
    if (resolvedId === undefined && x === undefined && y === undefined) {
      return res.status(400).json({
        error: 'Informe setor_id (1 a 6) ou coordenadas X e Y.',
        expected: { sector_id: 'Setor de 1 a 6', x: 'Coordenada X (0 a 100)', y: 'Coordenada Y (0 a 100)', game_mode: 'free | single | clear_all' }
      });
    }

    hardwareStatus.lastSeen = new Date().toISOString();

    const installation = await experienceService.getInstallation();
    if (installation.mode === 'shopping') {
      try {
        const out = await experienceService.registerHardwareImpact({ x, y, sectorId: resolvedId, clientEventId: client_event_id });
        return res.status(out.accepted ? 201 : 200).json({
          success: out.accepted,
          shopping: true,
          received_by_backend: true,
          persisted_in_db: !out.state?.isGuest,
          data: out
        });
      } catch (err) {
        if (err instanceof experienceService.HttpError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    let result;
    try {
      result = await personalMatchService.registerPersonalImpact({
        actor: req.actor,
        equipmentId: equipment_id,
        matchId: match_id || null,
        sessionId: session_id || null,
        gameMode: game_mode,
        sectorId: resolvedId,
        x,
        y,
        speed: speed !== undefined ? speed : (force !== undefined ? force : 80),
        source,
        isSimulation: Boolean(is_simulation),
        clientEventId: client_event_id || null
      });
    } catch (err) {
      if (err instanceof personalMatchService.PersonalMatchHttpError) {
        return res.status(err.status).json({ success: false, error: err.message, ...err.extra });
      }
      throw err;
    }

    const broadcastPayload = emitMatchImpactEvents(result, { source, is_simulation, client_event_id });
    res.status(201).json({
      success: true,
      received_by_backend: true,
      persisted_in_db: Boolean(result.persisted_in_db),
      is_guest: Boolean(result.is_guest),
      hit_id: broadcastPayload.hit_id,
      shot_id: broadcastPayload.shot_id,
      duplicate: Boolean(result.duplicate),
      message: result.is_guest
        ? 'Impacto computado na sessão temporária de visitante.'
        : 'Impacto computado e persistido no SQLite com sucesso.',
      data: broadcastPayload
    });
  } catch (error) {
    console.error('[HW] Erro ao registrar impacto no hardware:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/simulate', requireUserOrGuest, async (req, res) => {
  try {
    const { target_sensor_id, target_id, game_mode = 'free', active_sensors, active_targets, equipment_id = 1, session_id, match_id, client_event_id } = req.body || {};
    const sim = generateSimulatedSensorHit(
      target_id !== undefined ? target_id : target_sensor_id,
      active_targets !== undefined ? active_targets : active_sensors
    );

    const installation = await experienceService.getInstallation();
    if (installation.mode === 'shopping') {
      try {
        const out = await experienceService.registerHardwareImpact({ x: sim.x, y: sim.y, sectorId: sim.target_id, clientEventId: client_event_id });
        return res.status(out.accepted ? 201 : 200).json({ success: out.accepted, shopping: true, data: out });
      } catch (err) {
        if (err instanceof experienceService.HttpError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    const result = await personalMatchService.registerPersonalImpact({
      actor: req.actor,
      equipmentId: equipment_id,
      matchId: match_id || null,
      sessionId: session_id || null,
      gameMode: game_mode,
      sectorId: sim.target_id,
      x: sim.x,
      y: sim.y,
      speed: sim.speed,
      source: 'simulation',
      isSimulation: true,
      clientEventId: client_event_id || null
    });

    res.json(result);
  } catch (error) {
    if (error instanceof personalMatchService.PersonalMatchHttpError) {
      return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
