const express = require('express');
const router = express.Router();
const { all, run } = require('../database/db');
const { requireAuth } = require('../services/authService');
const iotLocalizationService = require('../services/iotLocalizationService');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const userId = req.user.role === 'admin' && req.query?.user_id
      ? Number(req.query.user_id)
      : Number(req.user.id);

    const sessions = await all(
      `SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      id: bodyId,
      session_id,
      mode,
      shots_count,
      hits_count,
      accuracy,
      total_score,
      avg_force,
      duration_seconds,
      equipment_id,
      reactivations,
      wall_preset,
      wall_width_m,
      wall_height_m
    } = req.body || {};

    const effectiveUserId = Number(req.user.id);
    const id = bodyId || session_id || `sess_${Date.now()}`;
    const scoreVal = total_score || 0;

    const actorWallCfg = await iotLocalizationService.getWallConfigForActor(req.actor);
    const snapPreset = wall_preset || actorWallCfg.preset || '3x2';
    const snapWidth = Number(wall_width_m || actorWallCfg.widthM || 3.0);
    const snapHeight = Number(wall_height_m || actorWallCfg.heightM || 2.0);
    const snapSensorsJson = JSON.stringify(actorWallCfg.sensors);

    await run(`
      INSERT OR REPLACE INTO sessions (
        id, user_id, equipment_id, mode, shots_count, hits_count, accuracy, total_score, avg_force, duration_seconds, reactivations,
        wall_preset, wall_width_m, wall_height_m, sensor_coordinates_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      effectiveUserId,
      equipment_id || 1,
      mode || 'Treino Livre',
      shots_count || 0,
      hits_count || 0,
      accuracy || 0,
      scoreVal,
      avg_force || 80,
      duration_seconds || 0,
      reactivations || 0,
      snapPreset,
      snapWidth,
      snapHeight,
      snapSensorsJson
    ]);

    if (effectiveUserId) {
      try {
        await run(`
          UPDATE players SET
            trainings_completed = COALESCE(trainings_completed, 0) + 1,
            best_score = MAX(COALESCE(best_score, 0), ?)
          WHERE user_id = ?
        `, [scoreVal, effectiveUserId]);
      } catch (err) {
        console.warn('[SESSIONS] Aviso ao atualizar agregado do jogador:', err.message);
      }
    }

    res.status(201).json({ success: true, sessionId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
