const express = require('express');
const router = express.Router();
const { get, all, run } = require('../database/db');
const { requireAuth, requireAdmin, hashPassword } = require('../services/authService');
const { FIXED_SENSORS } = require('../services/gameEngine');

router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res) => {
  try {
    try {
      const { ensureCloudIdentityTables } = require('../services/cloudIdentityService');
      await ensureCloudIdentityTables();
    } catch (_) {}

    const users = await all(`
      SELECT u.id, u.username, u.name, u.role, u.avatar, u.status, u.created_at, u.supabase_user_id,
             e.id as equipment_id, e.name as equipment_name,
             p.level, p.xp, p.precision, p.trainings_completed, p.total_shots,
             uci.email as cloud_email, uci.cloud_user_id
      FROM users u
      LEFT JOIN equipment_users eu ON eu.user_id = u.id
      LEFT JOIN equipments e ON e.id = eu.equipment_id
      LEFT JOIN players p ON p.user_id = u.id
      LEFT JOIN user_cloud_identities uci ON uci.user_id = u.id
      ORDER BY u.id ASC
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, name, password, role = 'player', equipment_id } = req.body;

    if (!username || !name || !password) {
      return res.status(400).json({ error: 'Username, nome e senha são obrigatórios.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
    }

    const { hash, salt } = hashPassword(password);
    const result = await run(`
      INSERT INTO users (username, name, password_hash, salt, role, avatar, status)
      VALUES (?, ?, ?, ?, ?, '🎾', 'active')
    `, [cleanUsername, name.trim(), hash, salt, role === 'admin' ? 'admin' : 'player']);

    const newUserId = result.lastID;

    if (role === 'player') {
      const { ensurePlayerAttributes } = require('../services/gameEngine');
      const pRes = await run(`
        INSERT INTO players (user_id, name, level, title, xp, xp_next, precision, streak_days)
        VALUES (?, ?, 1, 'Iniciante', 0, 250, 0, 1)
      `, [newUserId, name.trim()]);
      await ensurePlayerAttributes(pRes.lastID);
    }

    if (equipment_id) {
      await run(`
        INSERT OR REPLACE INTO equipment_users (equipment_id, user_id)
        VALUES (?, ?)
      `, [equipment_id, newUserId]);
    }

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso.',
      userId: newUserId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { name, role, status, avatar, equipment_id } = req.body;
    const userId = Number(req.params.id);

    const user = await get('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (req.user.id === userId && status === 'inactive') {
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta de administrador.' });
    }

    await run(`
      UPDATE users SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        avatar = COALESCE(?, avatar),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, role, status, avatar, userId]);

    if (equipment_id !== undefined) {
      await run('DELETE FROM equipment_users WHERE user_id = ?', [userId]);
      if (equipment_id) {
        await run('INSERT INTO equipment_users (equipment_id, user_id) VALUES (?, ?)', [equipment_id, userId]);
      }
    }

    res.json({ success: true, message: 'Usuário atualizado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta de administrador.' });
    }

    await run('DELETE FROM equipment_users WHERE user_id = ?', [userId]);
    await run('DELETE FROM players WHERE user_id = ?', [userId]);
    await run('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    await run('UPDATE users SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      hash,
      salt,
      req.params.id
    ]);

    res.json({ success: true, message: 'Senha redefinida com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/equipments', async (req, res) => {
  try {
    const equipments = await all(`
      SELECT e.*,
             (SELECT COUNT(*) FROM equipment_users WHERE equipment_id = e.id) as users_count,
             (SELECT COUNT(*) FROM sessions WHERE equipment_id = e.id) as sessions_count,
             (SELECT COUNT(*) FROM hits WHERE equipment_id = e.id) as hits_count
      FROM equipments e
      ORDER BY e.id ASC
    `);
    res.json(equipments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equipments', async (req, res) => {
  try {
    const { name, code, location = 'Quadra Principal', status = 'online' } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Nome e código do equipamento são obrigatórios.' });
    }

    const result = await run(`
      INSERT INTO equipments (code, name, status, location)
      VALUES (?, ?, ?, ?)
    `, [code.trim(), name.trim(), status, location.trim()]);

    res.status(201).json({
      success: true,
      message: 'Equipamento cadastrado com sucesso.',
      equipmentId: result.lastID
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/equipments/:id', async (req, res) => {
  try {
    const { name, code, status, location } = req.body;
    await run(`
      UPDATE equipments SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        status = COALESCE(?, status),
        location = COALESCE(?, location),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, code, status, location, req.params.id]);

    res.json({ success: true, message: 'Equipamento atualizado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/equipments/:id', async (req, res) => {
  try {
    await run('DELETE FROM equipment_users WHERE equipment_id = ?', [req.params.id]);
    await run('DELETE FROM equipments WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Equipamento excluído com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/equipments/:id/users', async (req, res) => {
  try {
    const users = await all(`
      SELECT u.id, u.username, u.name, u.role, u.avatar, eu.assigned_at
      FROM users u
      JOIN equipment_users eu ON eu.user_id = u.id
      WHERE eu.equipment_id = ?
    `, [req.params.id]);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/equipments/:id/users', async (req, res) => {
  try {
    const { userId } = req.body;
    await run(`
      INSERT OR REPLACE INTO equipment_users (equipment_id, user_id)
      VALUES (?, ?)
    `, [req.params.id, userId]);
    res.json({ success: true, message: 'Jogador vinculado ao equipamento com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/equipments/:id/users/:userId', async (req, res) => {
  try {
    await run(`
      DELETE FROM equipment_users
      WHERE equipment_id = ? AND user_id = ?
    `, [req.params.id, req.params.userId]);
    res.json({ success: true, message: 'Jogador desvinculado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sensors', async (req, res) => {
  try {
    const sensors = await all(`SELECT * FROM sensors ORDER BY id ASC`);
    const totalHitsPerSensor = await all(`
      SELECT sensor_id, COUNT(*) as hit_count, AVG(speed) as avg_speed
      FROM hits
      GROUP BY sensor_id
    `);

    const hitMap = {};
    totalHitsPerSensor.forEach((h) => {
      hitMap[h.sensor_id] = { count: h.hit_count, avgSpeed: Math.round(h.avg_speed || 0) };
    });

    const enriched = sensors.map((s) => ({
      ...s,
      totalHits: hitMap[s.id]?.count || 0,
      avgSpeed: hitMap[s.id]?.avgSpeed || 0
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await all(`
      SELECT s.*, u.name as user_name, u.username, e.name as equipment_name
      FROM sessions s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN equipments e ON e.id = s.equipment_id
      ORDER BY s.created_at DESC
      LIMIT 100
    `);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const [totalUsers, totalEquipments, totalSessions, totalHits, avgPrecision] = await Promise.all([
      get('SELECT COUNT(*) as count FROM users WHERE role = "player"'),
      get('SELECT COUNT(*) as count FROM equipments'),
      get('SELECT COUNT(*) as count FROM sessions'),
      get('SELECT COUNT(*) as count FROM hits'),
      get('SELECT AVG(accuracy) as avg FROM sessions')
    ]);

    const gameModeCounts = await all(`
      SELECT game_mode, COUNT(*) as count
      FROM hits
      GROUP BY game_mode
    `);

    res.json({
      totalPlayers: totalUsers?.count || 0,
      totalEquipments: totalEquipments?.count || 0,
      totalSessions: totalSessions?.count || 0,
      totalHits: totalHits?.count || 0,
      averageAccuracy: Math.round(avgPrecision?.avg || 82),
      gameModesDistribution: gameModeCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/wall-config', async (req, res) => {
  try {
    const { WALL_PRESETS, PHYSICAL_CONSTANTS, calculateWallGeometry, getActiveWallPreset } = require('../services/gameEngine');
    const preset = await getActiveWallPreset();
    const geometry = calculateWallGeometry(preset);
    res.json({
      preset,
      presets: WALL_PRESETS,
      physicalConstants: PHYSICAL_CONSTANTS,
      geometry
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/wall-config', async (req, res) => {
  try {
    const { WALL_PRESETS, calculateWallGeometry } = require('../services/gameEngine');
    const { broadcastEvent } = require('../services/eventHub');
    const { preset } = req.body || {};
    if (!preset || !WALL_PRESETS[preset]) {
      return res.status(400).json({ error: 'Preset inválido. Use 4x3, 3x3, 3x2, small, medium ou large.' });
    }
    await run(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('wall_preset', ?, CURRENT_TIMESTAMP)`,
      [preset]
    );
    await run(`UPDATE equipments SET wall_preset = ?, updated_at = CURRENT_TIMESTAMP`, [preset]);
    const geometry = calculateWallGeometry(preset);
    broadcastEvent('WALL_CONFIG_UPDATED', { preset, geometry });
    res.json({ success: true, preset, geometry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const academyService = require('../services/academyService');

router.get('/academy/lessons', async (req, res) => {
  try {
    const data = await academyService.listAdminLessons();
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/academy/lessons', async (req, res) => {
  try {
    const created = await academyService.createAdminLesson(req.body);
    res.status(201).json(created);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.put('/academy/lessons/:id', async (req, res) => {
  try {
    const updated = await academyService.updateAdminLesson(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.patch('/academy/lessons/:id/publish', async (req, res) => {
  try {
    const updated = await academyService.setAdminLessonPublished(req.params.id, Boolean(req.body?.published));
    res.json(updated);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.delete('/academy/lessons/:id', async (req, res) => {
  try {
    const deleted = await academyService.deleteAdminLesson(req.params.id);
    res.json(deleted);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.put('/academy/settings', async (req, res) => {
  try {
    const showComingSoon = Boolean(req.body?.showComingSoon);
    await academyService.setShowComingSoonSetting(showComingSoon);
    res.json({ showComingSoon });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/academy/validate-youtube', async (req, res) => {
  try {
    const parsed = academyService.validateAndParseYouTubeUrl(req.body?.url, { allowEmpty: false });
    res.json(parsed);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
