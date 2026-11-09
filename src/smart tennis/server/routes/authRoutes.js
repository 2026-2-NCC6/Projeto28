const express = require('express');
const router = express.Router();
const { get, run } = require('../database/db');
const { verifyPassword, generateToken, requireAuth } = require('../services/authService');
const guestSessionService = require('../services/guestSessionService');
const { getPublicClientConfig } = require('../config/supabaseConfig');
const {
  ensureCloudIdentityTables,
  verifySupabaseToken,
  getLinkedUserByCloudId,
  getCloudIdentityForUser,
  linkLocalUserToCloud,
  unlinkLocalUserFromCloud,
  provisionLocalPlayerForCloud
} = require('../services/cloudIdentityService');

router.post('/login', async (req, res) => {
  try {
    const { username, password, guest_token } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const prevGuest = guestSessionService.decodeGuestToken(authHeader.split(' ')[1]);
      if (prevGuest?.guestId) {
        await guestSessionService.destroyGuestSession(prevGuest.guestId);
      }
    }
    if (guest_token) {
      const prevGuest = guestSessionService.decodeGuestToken(guest_token);
      if (prevGuest?.guestId) {
        await guestSessionService.destroyGuestSession(prevGuest.guestId);
      }
    }

    await ensureCloudIdentityTables();
    const cleanIdentifier = username.trim().toLowerCase();
    const user = await get(`
      SELECT u.* 
      FROM users u
      LEFT JOIN user_cloud_identities uci ON uci.user_id = u.id
      WHERE LOWER(u.username) = ? OR LOWER(uci.email) = ?
      LIMIT 1
    `, [cleanIdentifier, cleanIdentifier]);

    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Esta conta de usuário está desativada. Contate o administrador.' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    const eqUser = await get(`
      SELECT e.id, e.code, e.name, e.status, e.location 
      FROM equipments e
      JOIN equipment_users eu ON eu.equipment_id = e.id
      WHERE eu.user_id = ?
      LIMIT 1
    `, [user.id]);

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        equipment: eqUser || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/guest', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const prev = guestSessionService.decodeGuestToken(authHeader.split(' ')[1]);
      if (prev?.guestId) {
        await guestSessionService.destroyGuestSession(prev.guestId);
      }
    }

    const ttlMs = req.body?.ttl_ms;
    const session = await guestSessionService.createGuestSession({ ttlMs });

    res.status(201).json({
      success: true,
      token: session.token,
      guest: session.guest
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/guest/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sessão de visitante não informada.' });
    }
    const token = authHeader.split(' ')[1];
    const sess = await guestSessionService.verifyGuestSession(token);
    if (!sess) {
      return res.status(401).json({ error: 'Sessão de visitante inválida ou expirada.' });
    }

    res.json({
      guest: {
        id: sess.guestId,
        guestId: sess.guestId,
        isGuest: true,
        role: 'guest',
        name: 'Visitante',
        avatar: '🎾',
        expiresAt: sess.expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/guest/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = guestSessionService.decodeGuestToken(token);
      if (decoded?.guestId) {
        await guestSessionService.destroyGuestSession(decoded.guestId);
      }
    }
    res.json({ success: true, message: 'Sessão de visitante encerrada e dados temporários removidos.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const eqUser = await get(`
      SELECT e.id, e.code, e.name, e.status, e.location 
      FROM equipments e
      JOIN equipment_users eu ON eu.equipment_id = e.id
      WHERE eu.user_id = ?
      LIMIT 1
    `, [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        equipment: eqUser || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = guestSessionService.decodeGuestToken(token);
      if (decoded?.guestId) {
        await guestSessionService.destroyGuestSession(decoded.guestId);
      }
    }
  } catch (e) {}
  res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

router.get('/cloud/config', (req, res) => {
  try {
    const config = getPublicClientConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cloud/status', requireAuth, async (req, res) => {
  try {
    const identity = await getCloudIdentityForUser(req.user.id);
    res.json({
      success: true,
      userId: req.user.id,
      linked: Boolean(identity),
      identity: identity ? {
        cloudUserId: identity.cloud_user_id,
        email: identity.email,
        linkedAt: identity.linked_at,
        lastSeenAt: identity.last_seen_at
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/cloud/link — Vincula com segurança o atleta local autenticado à sua conta Supabase Auth
router.post('/cloud/link', requireAuth, async (req, res) => {
  try {
    const { supabase_token, access_token } = req.body || {};
    const token = supabase_token || access_token;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        error: 'É obrigatório fornecer um token Supabase válido (supabase_token ou access_token) para comprovar a identidade cloud.',
        code: 'TOKEN_REQUIRED'
      });
    }

    const verifyRes = await verifySupabaseToken(token);
    if (!verifyRes.valid) {
      return res.status(401).json({ error: verifyRes.error || 'Token Supabase inválido.', code: verifyRes.code });
    }

    const result = await linkLocalUserToCloud({
      userId: req.user.id,
      cloudUserId: verifyRes.cloudUserId,
      email: verifyRes.email,
      metadata: { verifiedVia: 'supabase_jwt', verifiedAt: new Date().toISOString() }
    });

    let pairingResult = null;
    try {
      const { pairAthleteWithEquipment } = require('../services/equipmentPairingService');
      pairingResult = await pairAthleteWithEquipment({
        accessToken: token,
        cloudUserId: verifyRes.cloudUserId
      });
    } catch (pairingErr) {
      console.warn('[AUTH] Aviso no pareamento automático ao vincular:', pairingErr.message);
    }

    res.json({
      success: true,
      message: 'Atleta vinculado com sucesso à conta Supabase Auth.',
      data: result,
      pairing: pairingResult
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/cloud/unlink', requireAuth, async (req, res) => {
  try {
    // Se senha fornecida para confirmação de segurança, valida contra o hash PBKDF2 local
    if (req.body?.password) {
      const dbUser = await get('SELECT password_hash, salt FROM users WHERE id = ?', [req.user.id]);
      if (dbUser && !verifyPassword(req.body.password, dbUser.password_hash, dbUser.salt)) {
        return res.status(401).json({ error: 'Senha incorreta para confirmar a desvinculação.', code: 'INVALID_PASSWORD' });
      }
    }

    const result = await unlinkLocalUserFromCloud(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cloud/login-with-token', async (req, res) => {
  try {
    const { access_token } = req.body || {};
    if (!access_token) {
      return res.status(400).json({ error: 'Token Supabase access_token não informado.' });
    }

    const verifyRes = await verifySupabaseToken(access_token);
    if (!verifyRes.valid) {
      return res.status(401).json({ error: verifyRes.error || 'Token Supabase inválido.', code: verifyRes.code });
    }

    let linkedUser = await getLinkedUserByCloudId(verifyRes.cloudUserId);
    if (!linkedUser && (req.body?.create_if_missing || req.body?.auto_provision)) {
      linkedUser = await provisionLocalPlayerForCloud({
        cloudUserId: verifyRes.cloudUserId,
        email: verifyRes.email,
        name: req.body?.name || verifyRes.payload?.user_metadata?.name || verifyRes.payload?.user_metadata?.full_name,
        password: req.body?.password
      });
    } else if (linkedUser && req.body?.password && typeof req.body.password === 'string' && req.body.password.length >= 6) {
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.pbkdf2Sync(req.body.password, salt, 10000, 64, 'sha512').toString('hex');
      try {
        await run('UPDATE users SET password_hash = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, salt, linkedUser.id]);
      } catch (_) {}
    }

    if (!linkedUser) {
      return res.status(403).json({
        success: false,
        error: 'Esta conta Supabase Auth não está vinculada a nenhum atleta neste equipamento.',
        code: 'CLOUD_USER_NOT_LINKED',
        cloudUserId: verifyRes.cloudUserId,
        email: verifyRes.email
      });
    }

    if (linkedUser.status === 'inactive') {
      return res.status(403).json({ error: 'Esta conta de usuário está desativada. Contate o administrador.' });
    }

    const eqUser = await get(`
      SELECT e.id, e.code, e.name, e.status, e.location 
      FROM equipments e
      JOIN equipment_users eu ON eu.equipment_id = e.id
      WHERE eu.user_id = ?
      LIMIT 1
    `, [linkedUser.id]);

    let pairingResult = null;
    try {
      const { pairAthleteWithEquipment } = require('../services/equipmentPairingService');
      pairingResult = await pairAthleteWithEquipment({
        accessToken: access_token,
        cloudUserId: verifyRes.cloudUserId
      });
    } catch (pairingErr) {
      console.warn('[AUTH] Aviso no pareamento automático ao logar:', pairingErr.message);
    }

    const token = generateToken(linkedUser);

    res.json({
      success: true,
      token,
      authType: 'supabase',
      pairing: pairingResult,
      user: {
        id: linkedUser.id,
        username: linkedUser.username,
        name: linkedUser.name,
        role: linkedUser.role,
        avatar: linkedUser.avatar,
        status: linkedUser.status,
        cloudUserId: verifyRes.cloudUserId,
        equipment: eqUser || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cloud/authorize-pairing', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.body || {};
    if (!access_token || typeof access_token !== 'string') {
      return res.status(400).json({ error: 'Token Supabase access_token não informado.', code: 'TOKEN_REQUIRED' });
    }

    const verifyRes = await verifySupabaseToken(access_token);
    if (!verifyRes.valid) {
      return res.status(401).json({ error: verifyRes.error || 'Token Supabase inválido.', code: verifyRes.code });
    }

    const { pairAthleteWithEquipment } = require('../services/equipmentPairingService');
    const result = await pairAthleteWithEquipment({
      accessToken: access_token,
      cloudUserId: verifyRes.cloudUserId
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Equipamento autorizado e pareado com sucesso na nuvem!',
        pairing: result.pairing
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Falha ao autorizar pareamento com a nuvem.',
        code: result.code
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cloud/pairing-status', requireAuth, async (req, res) => {
  try {
    const { access_token } = req.body || {};
    if (!access_token) {
      return res.json({ paired: false, reason: 'TOKEN_REQUIRED' });
    }
    const verifyRes = await verifySupabaseToken(access_token);
    if (!verifyRes.valid) {
      return res.json({ paired: false, reason: 'INVALID_TOKEN' });
    }
    const { checkAthletePairingStatus } = require('../services/equipmentPairingService');
    const status = await checkAthletePairingStatus({
      accessToken: access_token,
      cloudUserId: verifyRes.cloudUserId
    });
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
