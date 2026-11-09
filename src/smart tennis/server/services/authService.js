const crypto = require('crypto');
const { get, run } = require('../database/db');
const guestSessionService = require('./guestSessionService');
const { verifySupabaseToken, getLinkedUserByCloudId } = require('./cloudIdentityService');

const SECRET_KEY = process.env.JWT_SECRET || 'smart-tennis-secret-key-2026';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return checkHash === hash;
}

function generateToken(user) {
  const payload = {
    type: 'user',
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    timestamp: Date.now()
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payloadBase64).digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (!payload || payload.type === 'guest' || !Number.isInteger(Number(payload.id)) || Number(payload.id) <= 0) {
      return null;
    }
    if (Date.now() - payload.timestamp > 7 * 24 * 60 * 60 * 1000) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

async function resolveTokenUser(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');

  if (parts.length === 2) {
    const payload = verifyToken(token);
    if (!payload) return null;
    const user = await get('SELECT id, username, name, role, avatar, status FROM users WHERE id = ?', [payload.id]);
    if (!user || user.status === 'inactive') return { error: 'Usuário desativado ou não encontrado.', status: 403 };
    return { user, authType: 'local' };
  }

  if (parts.length === 3) {
    const verifyRes = await verifySupabaseToken(token);
    if (!verifyRes.valid) {
      return { error: verifyRes.error || 'Token Supabase Auth inválido.', code: verifyRes.code, status: 401 };
    }

    const linkedUser = await getLinkedUserByCloudId(verifyRes.cloudUserId);
    if (!linkedUser) {
      return {
        error: 'Esta conta Supabase Auth ainda não está associada a nenhum atleta neste equipamento. Faça login com suas credenciais locais para vinculá-la.',
        code: 'CLOUD_USER_NOT_LINKED',
        cloudUserId: verifyRes.cloudUserId,
        email: verifyRes.email,
        status: 403
      };
    }

    if (linkedUser.status === 'inactive') {
      return { error: 'Usuário desativado ou não encontrado.', status: 403 };
    }

    return {
      user: linkedUser,
      authType: 'supabase',
      cloudUserId: verifyRes.cloudUserId,
      email: verifyRes.email
    };
  }

  return null;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login primeiro.' });
  }

  const token = authHeader.split(' ')[1];

  const guestDecoded = guestSessionService.decodeGuestToken(token);
  if (guestDecoded) {
    return res.status(403).json({
      error: 'Acesso negado. Sessões de visitante não possuem permissão para acessar dados pessoais, históricos ou administração.'
    });
  }

  const resolved = await resolveTokenUser(token);
  if (!resolved || resolved.error) {
    const status = resolved?.status || 401;
    return res.status(status).json({
      error: resolved?.error || 'Sessão inválida ou expirada. Faça login novamente.',
      code: resolved?.code || 'INVALID_SESSION'
    });
  }

  const user = resolved.user;

  const requestedUserId = req.query?.user_id !== undefined ? req.query.user_id : req.body?.user_id;
  if (
    requestedUserId !== undefined &&
    requestedUserId !== null &&
    requestedUserId !== '' &&
    user.role !== 'admin' &&
    Number(requestedUserId) !== Number(user.id)
  ) {
    return res.status(403).json({ error: 'Acesso negado aos dados de outro jogador.' });
  }

  req.user = user;
  req.authType = resolved.authType;
  req.cloudUserId = resolved.cloudUserId || null;
  req.actor = { type: 'user', userId: user.id, user, cloudUserId: resolved.cloudUserId || null };
  next();
}

async function requireUserOrGuest(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Sessão não autenticada. Entre com sua conta ou inicie uma sessão oficial como visitante.'
    });
  }

  const token = authHeader.split(' ')[1];

  const guestDecoded = guestSessionService.decodeGuestToken(token);
  if (guestDecoded) {
    const guestSess = await guestSessionService.verifyGuestSession(token);
    if (!guestSess) {
      return res.status(401).json({ error: 'Sessão de visitante inválida, encerrada ou expirada.' });
    }

    const bodyUserId = req.body?.user_id;
    const queryUserId = req.query?.user_id;
    if (
      (bodyUserId !== undefined && bodyUserId !== null && bodyUserId !== '') ||
      (queryUserId !== undefined && queryUserId !== null && queryUserId !== '')
    ) {
      return res.status(403).json({ error: 'Visitante não tem permissão para informar ou utilizar user_id.' });
    }

    req.guest = guestSess;
    req.user = null;
    req.actor = {
      type: 'guest',
      guestId: guestSess.guestId,
      expiresAt: guestSess.expiresAt,
      guest: guestSess
    };
    return next();
  }

  const resolved = await resolveTokenUser(token);
  if (!resolved || resolved.error) {
    const status = resolved?.status || 401;
    return res.status(status).json({
      error: resolved?.error || 'Sessão inválida ou expirada.',
      code: resolved?.code || 'INVALID_SESSION'
    });
  }

  const user = resolved.user;

  const requestedUserId = req.body?.user_id !== undefined ? req.body.user_id : req.query?.user_id;
  if (
    requestedUserId !== undefined &&
    requestedUserId !== null &&
    requestedUserId !== '' &&
    user.role !== 'admin' &&
    Number(requestedUserId) !== Number(user.id)
  ) {
    return res.status(403).json({ error: 'Não é permitido falsificar user_id de outro jogador.' });
  }

  req.user = user;
  req.guest = null;
  req.authType = resolved.authType;
  req.cloudUserId = resolved.cloudUserId || null;
  req.actor = {
    type: 'user',
    userId: user.id,
    user,
    cloudUserId: resolved.cloudUserId || null
  };
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Esta área requer privilégios de Administrador.' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  resolveTokenUser,
  requireAuth,
  requireUserOrGuest,
  requireAdmin
};
