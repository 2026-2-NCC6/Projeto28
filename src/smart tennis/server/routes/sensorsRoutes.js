const express = require('express');
const router = express.Router();
const {
  DETECTION_RADIUS,
  VISUAL_RADIUS,
  WALL_PRESETS,
  PHYSICAL_CONSTANTS
} = require('../services/gameEngine');
const { NICOLAS_WALL_OPTIONS } = require('../services/wallGeometry');
const { verifyToken, requireAuth } = require('../services/authService');
const guestSessionService = require('../services/guestSessionService');
const iotLocalizationService = require('../services/iotLocalizationService');
const { broadcastEvent } = require('../services/eventHub');

async function resolveOptionalActor(req) {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;

  const guestDecoded = guestSessionService.decodeGuestToken(token);
  if (guestDecoded) {
    const guestSess = await guestSessionService.verifyGuestSession(token);
    if (guestSess) {
      return { type: 'guest', guestId: guestSess.guestId };
    }
    return null;
  }

  const payload = verifyToken(token);
  if (payload && payload.id) {
    return { type: 'user', userId: Number(payload.id) };
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const actor = await resolveOptionalActor(req);
    const cfg = await iotLocalizationService.getWallConfigForActor(actor);
    res.json(cfg.geometry.sectors.map((t) => ({
      ...t,
      detection_radius: DETECTION_RADIUS,
      visual_radius: VISUAL_RADIUS,
      active: 1,
      status: 'online'
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/wall-config', async (req, res) => {
  try {
    const actor = await resolveOptionalActor(req);
    const cfg = await iotLocalizationService.getWallConfigForActor(actor);
    res.json({
      preset: cfg.preset,
      widthM: cfg.widthM,
      heightM: cfg.heightM,
      label: cfg.label,
      shortLabel: cfg.shortLabel,
      aspectRatio: cfg.aspectRatio,
      isNicolas: cfg.isNicolas,
      canConfigureWall: cfg.canConfigureWall,
      availableOptions: NICOLAS_WALL_OPTIONS,
      sensors: cfg.sensors,
      sensorList: cfg.sensorList,
      sensorOffsetsCm: cfg.sensorOffsetsCm,
      bottomRightHasSensor: false,
      calibration: cfg.calibration,
      presets: WALL_PRESETS,
      physicalConstants: PHYSICAL_CONSTANTS,
      geometry: cfg.geometry,
      updatedAt: cfg.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function handleUpdateWallConfig(req, res) {
  try {
    const {
      preset,
      widthM,
      heightM,
      sensorOffsetsCm,
      calibration
    } = req.body || {};

    const updated = await iotLocalizationService.updateNicolasWallConfig({
      actor: req.actor,
      preset,
      widthM,
      heightM,
      sensorOffsetsCm,
      calibration
    });

    broadcastEvent('WALL_CONFIG_UPDATED', {
      userId: updated.userId,
      preset: updated.preset,
      widthM: updated.widthM,
      heightM: updated.heightM,
      sensors: updated.sensors,
      geometry: updated.geometry
    });

    res.json({
      success: true,
      userId: updated.userId,
      preset: updated.preset,
      widthM: updated.widthM,
      heightM: updated.heightM,
      label: updated.label,
      shortLabel: updated.shortLabel,
      aspectRatio: updated.aspectRatio,
      isNicolas: updated.isNicolas,
      canConfigureWall: updated.canConfigureWall,
      sensors: updated.sensors,
      sensorList: updated.sensorList,
      sensorOffsetsCm: updated.sensorOffsetsCm,
      bottomRightHasSensor: false,
      calibration: updated.calibration,
      geometry: updated.geometry,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    if (error instanceof iotLocalizationService.WallConfigHttpError) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
        ...error.extra
      });
    }
    res.status(500).json({ error: error.message });
  }
}

router.put('/wall-config', requireAuth, handleUpdateWallConfig);
router.post('/wall-config', requireAuth, handleUpdateWallConfig);
router.put('/wall-config/me', requireAuth, handleUpdateWallConfig);
router.post('/wall-config/me', requireAuth, handleUpdateWallConfig);

module.exports = router;
