

const crypto = require('crypto');
const { get, run, all, exec } = require('../database/db');
const {
  getSupabaseConfig,
  isSupabaseConfigured,
  isValidUuid
} = require('../config/supabaseConfig');

let tablesEnsured = false;

async function ensureCloudIdentityTables() {
  if (tablesEnsured) return;
  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS user_cloud_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'supabase',
        cloud_user_id TEXT NOT NULL,
        email TEXT,
        metadata_json TEXT,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider),
        UNIQUE(provider, cloud_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_cloud_identities_cloud ON user_cloud_identities(provider, cloud_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_cloud_identities_user ON user_cloud_identities(user_id);
    `);

    try {
      await run('ALTER TABLE users ADD COLUMN supabase_user_id TEXT');
    } catch (_) {
    }

    tablesEnsured = true;
  } catch (err) {
    console.error('[CLOUD IDENTITY] Aviso ao verificar tabelas:', err.message);
  }
}

/**
 * Decodifica com segurança uma parte Base64URL de um JWT sem lançar exceções.
 */
function decodeBase64UrlJson(str) {
  try {
    if (!str || typeof str !== 'string') return null;
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}

async function verifySupabaseToken(token, options = {}) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token não fornecido ou em formato inválido.', code: 'INVALID_TOKEN_FORMAT' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'O token JWT deve conter exatamente 3 segmentos.', code: 'MALFORMED_JWT' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);

  if (!header || !payload) {
    return { valid: false, error: 'Falha ao decodificar cabeçalho ou payload do JWT.', code: 'MALFORMED_JWT_PAYLOAD' };
  }

  if (!header.alg || header.alg === 'none' || (header.alg !== 'HS256' && header.alg !== 'RS256' && header.alg !== 'ES256')) {
    return { valid: false, error: `Algoritmo não suportado ou ausente: ${header.alg || 'none'}`, code: 'UNSUPPORTED_ALGORITHM' };
  }

  const cloudUserId = payload.sub;
  if (!isValidUuid(cloudUserId)) {
    return { valid: false, error: 'A claim sub deve ser um UUID válido.', code: 'INVALID_SUB_UUID' };
  }

  if (payload.aud !== 'authenticated') {
    return { valid: false, error: "Audiência inválida. Esperado: 'authenticated'.", code: 'INVALID_AUDIENCE' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || typeof payload.exp !== 'number') {
    return { valid: false, error: 'Token não possui claim de expiração (exp).', code: 'MISSING_EXPIRATION' };
  }
  if (payload.exp <= nowSec) {
    return { valid: false, error: 'Token Supabase Auth expirado.', code: 'TOKEN_EXPIRED' };
  }

  if (payload.nbf && typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) {
    return { valid: false, error: 'Token ainda não é válido (nbf futuro).', code: 'TOKEN_NOT_YET_VALID' };
  }

  const config = getSupabaseConfig();
  if (config.configured && config.url) {
    const expectedIss = `${config.url}/auth/v1`;
    if (!payload.iss) {
      return { valid: false, error: 'Token não possui claim de emissor (iss).', code: 'MISSING_ISSUER' };
    }
    if (payload.iss !== expectedIss) {
      return { valid: false, error: 'Emissor (iss) do token não corresponde ao projeto configurado.', code: 'INVALID_ISSUER' };
    }
  }

  const jwtSecret = options.jwtSecret || config.jwtSecret;
  if (jwtSecret) {
    if (header.alg !== 'HS256') {
      return { valid: false, error: 'Algoritmo assimétrico incompatível com segredo HMAC configurado.', code: 'ALGORITHM_SECRET_MISMATCH' };
    }
    const dataToSign = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(dataToSign)
      .digest('base64url');

    try {
      const sigBuf = Buffer.from(signatureB64);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { valid: false, error: 'Assinatura do token Supabase Auth inválida.', code: 'INVALID_SIGNATURE' };
      }
    } catch (e) {
      return { valid: false, error: 'Falha na verificação da assinatura criptográfica.', code: 'SIGNATURE_CHECK_FAILED' };
    }
  } else if (config.configured && config.url && config.anonKey) {
    try {
      const verifyRes = await fetch(`${config.url}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${token}`
        }
      });

      if (!verifyRes.ok) {
        return { valid: false, error: 'Token rejeitado pelo servidor Supabase Auth.', code: 'REMOTE_AUTH_FAILED' };
      }

      const remoteUser = await verifyRes.json();
      if (!remoteUser || remoteUser.id !== cloudUserId) {
        return { valid: false, error: 'Inconsistência entre payload e identidade remota.', code: 'REMOTE_USER_MISMATCH' };
      }
    } catch (netErr) {
      return {
        valid: false,
        error: 'Não foi possível verificar a assinatura do token Supabase remotamente (servidor offline ou inacessível).',
        code: 'SIGNATURE_VERIFICATION_UNAVAILABLE'
      };
    }
  } else {
    return {
      valid: false,
      error: 'Assinatura não pôde ser verificada: Supabase não está configurado e nenhum JWT Secret está presente.',
      code: 'VERIFICATION_UNAVAILABLE'
    };
  }

  return {
    valid: true,
    cloudUserId,
    email: payload.email || null,
    payload
  };
}

async function getLinkedUserByCloudId(cloudUserId, provider = 'supabase') {
  if (!cloudUserId || !isValidUuid(cloudUserId)) return null;
  await ensureCloudIdentityTables();

  const row = await get(
    `SELECT u.id, u.username, u.name, u.role, u.avatar, u.status, u.created_at, u.supabase_user_id,
            uci.cloud_user_id, uci.email as cloud_email, uci.linked_at, uci.last_seen_at
     FROM users u
     JOIN user_cloud_identities uci ON uci.user_id = u.id
     WHERE uci.provider = ? AND uci.cloud_user_id = ?
     LIMIT 1`,
    [provider, cloudUserId]
  );

  return row || null;
}

async function getCloudIdentityForUser(userId, provider = 'supabase') {
  if (!userId) return null;
  await ensureCloudIdentityTables();

  const row = await get(
    `SELECT cloud_user_id, email, provider, linked_at, last_seen_at, metadata_json
     FROM user_cloud_identities
     WHERE user_id = ? AND provider = ?
     LIMIT 1`,
    [userId, provider]
  );

  return row || null;
}

/**
 * Associa com segurança um usuário local do SQLite a um UUID do Supabase Auth.
 * Garante unicidade bidirecional (1:1).
 */
async function linkLocalUserToCloud({ userId, cloudUserId, email = null, metadata = null, provider = 'supabase' }) {
  if (!userId || !Number.isInteger(Number(userId))) {
    throw new Error('ID de usuário local inválido.');
  }
  if (!cloudUserId || !isValidUuid(cloudUserId)) {
    throw new Error('ID de usuário cloud (UUID) inválido.');
  }
  await ensureCloudIdentityTables();

  const localUser = await get('SELECT id, username FROM users WHERE id = ?', [userId]);
  if (!localUser) {
    throw new Error('Usuário local não encontrado no SQLite.');
  }

  const existingForUser = await get(
    'SELECT cloud_user_id FROM user_cloud_identities WHERE user_id = ? AND provider = ?',
    [userId, provider]
  );
  if (existingForUser && existingForUser.cloud_user_id !== cloudUserId) {
    throw new Error(`Este usuário local já está vinculado à identidade cloud ${existingForUser.cloud_user_id}. Desvincule primeiro.`);
  }

  const existingForCloud = await get(
    'SELECT user_id FROM user_cloud_identities WHERE cloud_user_id = ? AND provider = ?',
    [cloudUserId, provider]
  );
  if (existingForCloud && Number(existingForCloud.user_id) !== Number(userId)) {
    throw new Error('Esta conta cloud já está associada a outro atleta neste equipamento.');
  }

  const metaStr = metadata ? JSON.stringify(metadata) : null;

  await run(
    `INSERT INTO user_cloud_identities (user_id, provider, cloud_user_id, email, metadata_json, linked_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       cloud_user_id = excluded.cloud_user_id,
       email = COALESCE(excluded.email, user_cloud_identities.email),
       metadata_json = COALESCE(excluded.metadata_json, user_cloud_identities.metadata_json),
       last_seen_at = CURRENT_TIMESTAMP`,
    [userId, provider, cloudUserId, email, metaStr]
  );

  try {
    await run('UPDATE users SET supabase_user_id = ? WHERE id = ?', [cloudUserId, userId]);
  } catch (e) {
  }

  try {
    const pendingOutbox = await all(
      `SELECT id, payload_json FROM cloud_outbox WHERE user_id = ? AND status = 'pending_link'`,
      [userId]
    );
    for (const ev of pendingOutbox) {
      try {
        const parsed = JSON.parse(ev.payload_json);
        if (parsed && parsed.payload) {
          parsed.payload.user_id = cloudUserId;
        }
        await run(
          `UPDATE cloud_outbox
           SET cloud_user_id = ?, payload_json = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [cloudUserId, JSON.stringify(parsed), ev.id]
        );
      } catch (_) {}
    }

    if (pendingOutbox && pendingOutbox.length > 0) {
      try {
        const { triggerSync } = require('./cloudSyncWorker');
        if (typeof triggerSync === 'function') {
          setImmediate(() => triggerSync().catch(() => {}));
        }
      } catch (_) {}
    }
  } catch (_) {}

  return {
    success: true,
    userId,
    cloudUserId,
    email,
    provider
  };
}

async function unlinkLocalUserFromCloud(userId, provider = 'supabase') {
  if (!userId) return { success: false, error: 'ID de usuário não informado.' };

  await run('DELETE FROM user_cloud_identities WHERE user_id = ? AND provider = ?', [userId, provider]);
  try {
    await run('UPDATE users SET supabase_user_id = NULL WHERE id = ?', [userId]);
  } catch (e) {}

  return { success: true, message: 'Vínculo com Supabase Auth removido com sucesso.' };
}

async function provisionLocalPlayerForCloud({ cloudUserId, email = null, name = null, metadata = null, password = null }) {
  if (!cloudUserId || !isValidUuid(cloudUserId)) {
    throw new Error('ID de usuário cloud (UUID) inválido para provisionamento.');
  }
  await ensureCloudIdentityTables();

  const existing = await getLinkedUserByCloudId(cloudUserId);
  if (existing) {
    return existing;
  }

  const rawBase = (name || (email ? email.split('@')[0] : 'atleta')).trim();
  const cleanBase = rawBase.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'atleta';
  let candidateUsername = cleanBase;
  while (await get('SELECT id FROM users WHERE LOWER(username) = ?', [candidateUsername])) {
    const suffix = crypto.randomBytes(2).toString('hex');
    candidateUsername = `${cleanBase}_${suffix}`;
  }

  const displayName = name && name.trim() ? name.trim() : (cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1));

  const salt = crypto.randomBytes(16).toString('hex');
  const rawPass = password && typeof password === 'string' && password.length >= 6
    ? password
    : crypto.randomBytes(32).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(rawPass, salt, 10000, 64, 'sha512').toString('hex');

  const userInsert = await run(
    `INSERT INTO users (username, name, password_hash, salt, role, avatar, status, supabase_user_id)
     VALUES (?, ?, ?, ?, 'player', '🎾', 'active', ?)`,
    [candidateUsername, displayName, passwordHash, salt, cloudUserId]
  );
  const newUserId = userInsert.lastID;

  await run(
    `INSERT INTO players (user_id, name, avatar, level, title, xp, xp_next, precision, streak_days, created_at)
     VALUES (?, ?, '🎾', 1, 'Iniciante', 0, 250, 0, 1, CURRENT_TIMESTAMP)`,
    [newUserId, displayName]
  );

  try {
    const { ensurePlayerAttributes } = require('./gameEngine');
    if (typeof ensurePlayerAttributes === 'function') {
      await ensurePlayerAttributes(newUserId);
    }
  } catch (_) {}

  try {
    await run(`INSERT OR IGNORE INTO equipment_users (equipment_id, user_id) VALUES (1, ?)`, [newUserId]);
  } catch (_) {}

  await linkLocalUserToCloud({
    userId: newUserId,
    cloudUserId,
    email,
    metadata: metadata || { autoProvisioned: true, provisionedAt: new Date().toISOString() }
  });

  return getLinkedUserByCloudId(cloudUserId);
}

module.exports = {
  ensureCloudIdentityTables,
  verifySupabaseToken,
  getLinkedUserByCloudId,
  getCloudIdentityForUser,
  linkLocalUserToCloud,
  unlinkLocalUserFromCloud,
  provisionLocalPlayerForCloud
};
