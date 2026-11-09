const express = require('express');
const router = express.Router();
const { requireUserOrGuest } = require('../services/authService');
const personalMatchService = require('../services/personalMatchService');

router.use(requireUserOrGuest);

router.get('/current', async (req, res) => {
  try {
    const mode = req.query.mode || null;
    const data = await personalMatchService.getCurrentMatch({ actor: req.actor, mode });
    res.json(data);
  } catch (err) {
    if (err instanceof personalMatchService.PersonalMatchHttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { mode = 'free', forceNew = false, equipment_id = 1 } = req.body || {};
    const match = await personalMatchService.startMatch({
      actor: req.actor,
      equipmentId: equipment_id,
      mode,
      forceNew: Boolean(forceNew)
    });
    res.status(201).json({ success: true, match });
  } catch (err) {
    if (err instanceof personalMatchService.PersonalMatchHttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/finish', async (req, res) => {
  try {
    const { match_id = null } = req.body || {};
    const match = await personalMatchService.finishMatch({
      actor: req.actor,
      matchId: match_id
    });
    res.json({ success: true, match });
  } catch (err) {
    if (err instanceof personalMatchService.PersonalMatchHttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/impact', async (req, res) => {
  try {
    const {
      match_id,
      session_id,
      game_mode = 'free',
      sector_id,
      target_id,
      sensor_id,
      x,
      y,
      speed = 85,
      equipment_id = 1,
      source = 'mouse',
      is_simulation = true,
      client_event_id
    } = req.body || {};

    const resolvedSector = sector_id !== undefined ? sector_id : (target_id !== undefined ? target_id : sensor_id);
    const out = await personalMatchService.registerPersonalImpact({
      actor: req.actor,
      equipmentId: equipment_id,
      matchId: match_id || null,
      sessionId: session_id || null,
      gameMode: game_mode,
      sectorId: resolvedSector,
      x,
      y,
      speed,
      source,
      isSimulation: Boolean(is_simulation),
      clientEventId: client_event_id || null
    });

    res.status(201).json({
      success: true,
      received_by_backend: true,
      persisted_in_db: Boolean(out.persisted_in_db),
      is_guest: Boolean(out.is_guest),
      hit_id: out.hit_id,
      shot_id: out.shot_id,
      data: out
    });
  } catch (err) {
    if (err instanceof personalMatchService.PersonalMatchHttpError) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        ...err.extra
      });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
