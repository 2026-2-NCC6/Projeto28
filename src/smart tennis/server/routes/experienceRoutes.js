const express = require('express');
const { requireAuth, requireAdmin, requireUserOrGuest } = require('../services/authService');
const svc = require('../services/experienceService');

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof svc.HttpError) return res.status(err.status).json({ error: err.message });
      console.error('[EXPERIENCE]', err);
      res.status(500).json({ error: err.message });
    }
  };
}

const installationRouter = express.Router();

installationRouter.get('/', handle(async (req, res) => {
  res.json(await svc.getInstallation());
}));

installationRouter.put('/', requireAuth, requireAdmin, handle(async (req, res) => {
  const { mode, shoppingIntervalSeconds } = req.body || {};
  const updated = await svc.setInstallation({ mode, shoppingIntervalSeconds });
  res.json({ success: true, ...updated });
}));

const experienceRouter = express.Router();
experienceRouter.use(requireUserOrGuest);

experienceRouter.get('/current', handle(async (req, res) => {
  res.json(await svc.getCurrentFor(req.actor));
}));

experienceRouter.post('/start', handle(async (req, res) => {
  const state = await svc.startExperience(req.actor);
  res.status(201).json({ experience: state });
}));

experienceRouter.post('/:id/impact', handle(async (req, res) => {
  const { x, y, client_event_id } = req.body || {};
  const result = await svc.registerImpact(req.params.id, req.actor, {
    x: x === undefined || x === null ? null : Number(x),
    y: y === undefined || y === null ? null : Number(y),
    clientEventId: client_event_id ? String(client_event_id).slice(0, 80) : null
  });
  res.json(result);
}));

experienceRouter.post('/:id/abort', handle(async (req, res) => {
  const state = await svc.abortExperience(req.params.id, req.actor);
  res.json({ experience: state });
}));

module.exports = { experienceRouter, installationRouter };
