const express = require('express');
const router = express.Router();
const { all } = require('../database/db');
const { registerShot, generateSimulatedShot } = require('../services/gameEngine');
const { broadcastEvent } = require('../services/eventHub');
const { requireAuth } = require('../services/authService');
const experienceService = require('../services/experienceService');

router.use(requireAuth);

router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const userId = req.user.role === 'admin' && req.query?.user_id
      ? Number(req.query.user_id)
      : Number(req.user.id);

    let shots = await all(`SELECT * FROM shots WHERE user_id = ? ORDER BY id DESC LIMIT ?`, [userId, limit]);
    if (shots.length === 0) {
      shots = await all(`
        SELECT s.* FROM shots s
        LEFT JOIN sessions sess ON s.session_id = sess.id
        WHERE sess.user_id = ? OR s.user_id = ?
        ORDER BY s.id DESC LIMIT ?
      `, [userId, userId, limit]);
    }
    res.json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/hitmap', async (req, res) => {
  try {
    const userId = req.user.role === 'admin' && req.query?.user_id
      ? Number(req.query.user_id)
      : Number(req.user.id);

    const shots = await all(`
      SELECT s.id, s.x, s.y, s.zone, s.zone_id, s.force, s.score, s.is_hit, s.is_bullseye, s.created_at
      FROM shots s
      LEFT JOIN sessions sess ON s.session_id = sess.id
      WHERE s.user_id = ? OR sess.user_id = ?
      ORDER BY s.id DESC LIMIT 200
    `, [userId, userId]);

    const zoneCounts = {};
    let totalHits = 0;
    let bullseyes = 0;

    shots.forEach(s => {
      zoneCounts[s.zone] = (zoneCounts[s.zone] || 0) + 1;
      if (s.is_hit) totalHits++;
      if (s.is_bullseye) bullseyes++;
    });

    res.json({
      shots,
      totalCount: shots.length,
      totalHits,
      bullseyes,
      zoneDistribution: zoneCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/simulate', async (req, res) => {
  try {
    const { targetZone, speed, sessionId, client_event_id } = req.body || {};
    const simCoords = generateSimulatedShot(targetZone, speed);

    const installation = await experienceService.getInstallation();
    if (installation.mode === 'shopping') {
      try {
        const out = await experienceService.registerHardwareImpact({
          x: simCoords.x,
          y: simCoords.y,
          sectorId: simCoords.target_id || targetZone,
          clientEventId: client_event_id
        });
        return res.status(out.accepted ? 201 : 200).json({ success: out.accepted, shopping: true, data: out });
      } catch (err) {
        if (err instanceof experienceService.HttpError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    const userId = Number(req.user.id);
    const result = await registerShot({
      userId,
      x: simCoords.x,
      y: simCoords.y,
      speed: simCoords.speed || speed || 80,
      source: 'simulation',
      isSimulation: true,
      sensorId: simCoords.sensor_id,
      sectorId: simCoords.target_id,
      sessionId
    });

    broadcastEvent('SHOT_REGISTERED', result);
    if (result.player && result.player.leveledUp) {
      broadcastEvent('LEVEL_UP', result.player);
    }
    if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
      broadcastEvent('ACHIEVEMENT_UNLOCKED', result.unlockedAchievements);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/manual', async (req, res) => {
  try {
    const { x, y, force = 80, sessionId, client_event_id } = req.body || {};
    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: 'Coordenadas X e Y são obrigatórias' });
    }

    const installation = await experienceService.getInstallation();
    if (installation.mode === 'shopping') {
      try {
        const out = await experienceService.registerHardwareImpact({
          x: Number(x),
          y: Number(y),
          clientEventId: client_event_id
        });
        return res.status(out.accepted ? 201 : 200).json({ success: out.accepted, shopping: true, data: out });
      } catch (err) {
        if (err instanceof experienceService.HttpError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    const userId = Number(req.user.id);
    const result = await registerShot({
      userId,
      x: Number(x),
      y: Number(y),
      speed: Number(force) || 80,
      source: 'manual',
      sessionId
    });

    broadcastEvent('SHOT_REGISTERED', result);
    if (result.player && result.player.leveledUp) {
      broadcastEvent('LEVEL_UP', result.player);
    }
    if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
      broadcastEvent('ACHIEVEMENT_UNLOCKED', result.unlockedAchievements);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
