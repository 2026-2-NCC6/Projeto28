const express = require('express');
const router = express.Router();
const { all } = require('../database/db');
const { requireAuth } = require('../services/authService');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const achievements = await all(`SELECT * FROM achievements ORDER BY unlocked DESC, id ASC`);
    const total = achievements.length;
    const unlockedCount = achievements.filter(a => a.unlocked === 1).length;

    res.json({
      achievements,
      total,
      unlockedCount,
      completionRate: Math.round((unlockedCount / total) * 100)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
