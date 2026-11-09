const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database/db');
const { broadcastEvent } = require('../services/eventHub');
const { requireAuth } = require('../services/authService');
const { ensurePlayerAttributes } = require('../services/gameEngine');

router.use(requireAuth);

async function resolvePlayerAndUser(req) {
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
    }
  }
  if (player) {
    await ensurePlayerAttributes(player.id);
  }
  return { userId, player };
}

router.get('/attributes', async (req, res) => {
  try {
    const { player } = await resolvePlayerAndUser(req);
    const attributes = player
      ? await all(`SELECT * FROM attributes WHERE player_id = ? ORDER BY id ASC`, [player.id])
      : [];
    res.json(attributes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/attribute/:key', async (req, res) => {
  try {
    const { userId, player } = await resolvePlayerAndUser(req);
    const attribute = player
      ? await get(`SELECT * FROM attributes WHERE player_id = ? AND key = ?`, [player.id, req.params.key])
      : null;
    if (!attribute) {
      return res.status(404).json({ error: 'Habilidade não encontrada' });
    }

    const recentShots = await all(`SELECT * FROM shots WHERE user_id = ? ORDER BY id DESC LIMIT 10`, [userId]);

    res.json({
      attribute,
      recentShots,
      videoIntegration: {
        hasVideo: false,
        videoUrl: null,
        placeholderText: 'Em breve: Vídeo demonstrativo gravado pelo treinador oficial Motion Tennis.'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tree', async (req, res) => {
  try {
    const nodes = await all(`SELECT * FROM skill_tree ORDER BY tier ASC, pos_y ASC`);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tree/:id/unlock', async (req, res) => {
  try {
    const node = await get(`SELECT * FROM skill_tree WHERE id = ?`, [req.params.id]);
    if (!node) {
      return res.status(404).json({ error: 'Nó da árvore de habilidades não encontrado' });
    }

    if (node.status === 'completed') {
      return res.json({ message: 'Habilidade já foi concluída', node });
    }

    await run(`UPDATE skill_tree SET status = 'completed' WHERE id = ?`, [req.params.id]);
    await run(`UPDATE skill_tree SET status = 'unlocked' WHERE parent_id = ? AND status = 'locked'`, [req.params.id]);

    const { player } = await resolvePlayerAndUser(req);
    if (player && node.xp_reward > 0) {
      const newXp = player.xp + node.xp_reward;
      await run(`UPDATE players SET xp = ? WHERE id = ?`, [newXp, player.id]);
    }

    const updatedNodes = await all(`SELECT * FROM skill_tree ORDER BY tier ASC, pos_y ASC`);
    broadcastEvent('SKILL_TREE_UPDATED', updatedNodes);

    res.json({
      success: true,
      message: `Habilidade "${node.title}" concluída! +${node.xp_reward} XP concedido.`,
      nodeId: node.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
