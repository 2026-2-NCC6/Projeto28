const express = require('express');
const router = express.Router();
const { get, run } = require('../database/db');
const { initializeDatabase } = require('../database/initDb');
const { broadcastEvent } = require('../services/eventHub');
const { requireAuth } = require('../services/authService');
const { ensurePlayerAttributes } = require('../services/gameEngine');

router.use(requireAuth);

async function resolvePlayerForRequest(req) {
  const userId = req.user.role === 'admin' && req.query?.user_id
    ? Number(req.query.user_id)
    : Number(req.user.id);

  let player = await get(`SELECT * FROM players WHERE user_id = ? LIMIT 1`, [userId]);
  if (!player) {
    const user = await get(`SELECT id, name, avatar FROM users WHERE id = ?`, [userId]);
    if (user) {
      await run(
        `INSERT OR IGNORE INTO players (user_id, name, avatar, level, title, xp, xp_next, precision, streak_days)
         VALUES (?, ?, ?, 1, 'Iniciante', 0, 250, 0, 1)`,
        [user.id, user.name, user.avatar || '🎾']
      );
      player = await get(`SELECT * FROM players WHERE user_id = ? LIMIT 1`, [user.id]);
      if (player) await ensurePlayerAttributes(player.id);
    }
  }
  return player;
}

router.get('/', async (req, res) => {
  try {
    const player = await resolvePlayerForRequest(req);
    if (!player) {
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { name, avatar } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome do jogador é obrigatório' });
    }
    const targetPlayer = await resolvePlayerForRequest(req);
    if (!targetPlayer) {
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }
    await run(
      `UPDATE players SET name = ?, avatar = COALESCE(?, avatar), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name.trim(), avatar, targetPlayer.id]
    );
    const updated = await get(`SELECT * FROM players WHERE id = ?`, [targetPlayer.id]);
    broadcastEvent('PLAYER_UPDATED', updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset', async (req, res) => {
  try {
    await initializeDatabase(true);
    const player = await resolvePlayerForRequest(req);
    broadcastEvent('SYSTEM_RESET', { message: 'Dados de demonstração restaurados' });
    res.json({ message: 'Dados de demonstração restaurados com sucesso', player });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/clear', async (req, res) => {
  try {
    const targetPlayer = await resolvePlayerForRequest(req);
    const userId = req.user.id;
    await run(`DELETE FROM shots WHERE user_id = ?`, [userId]);
    await run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    await run(`UPDATE achievements SET unlocked = 0, unlocked_at = NULL, progress = 0`);
    await run(`UPDATE skill_tree SET status = 'locked' WHERE id != 'node_iniciante'`);
    await run(`UPDATE skill_tree SET status = 'completed' WHERE id = 'node_iniciante'`);
    if (targetPlayer) {
      await run(
        `UPDATE players SET
          level = 1,
          title = 'Iniciante',
          xp = 0,
          xp_next = 250,
          precision = 0,
          total_shots = 0,
          total_hits = 0,
          avg_score = 0,
          best_score = 0,
          trainings_completed = 0,
          streak_days = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [targetPlayer.id]
      );
      await run(`UPDATE attributes SET level = 1, xp = 0 WHERE player_id = ?`, [targetPlayer.id]);
    }

    const player = await resolvePlayerForRequest(req);
    broadcastEvent('SYSTEM_RESET', { message: 'Dados limpos para novo jogador' });
    res.json({ message: 'Dados limpos com sucesso. Novo jogador pronto!', player });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
