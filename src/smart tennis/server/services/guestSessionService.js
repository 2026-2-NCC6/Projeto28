// Regras de segurança e isolamento:

const crypto = require('crypto');
const { run, get, all, exec } = require('../database/db');

const SECRET_KEY = process.env.JWT_SECRET || 'smart-tennis-secret-key-2026';
const DEFAULT_GUEST_TTL_MS = 2 * 60 * 60 * 1000;

const memorySessions = new Map();

function isTestMode() {
  return process.env.SMART_TENNIS_TEST_MODE === '1';
}

function getGuestTtlMs(customTtlMs) {
  if (isTestMode() && Number(customTtlMs) > 0) {
    return Number(customTtlMs);
  }
  const envTtl = Number(process.env.SMART_TENNIS_GUEST_TTL_MS);
  if (isTestMode() && envTtl > 0) {
    return envTtl;
  }
  return DEFAULT_GUEST_TTL_MS;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function signGuestPayload(payload) {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

function decodeGuestToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadBase64, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payloadBase64).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (!payload || payload.type !== 'guest' || !payload.guestId || !payload.expiresAt) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

async function ensureGuestTables() {
  await exec(`
    CREATE TABLE IF NOT EXISTS ephemeral_guest_sessions (
      guest_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      personal_state_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ephemeral_guest_expires ON ephemeral_guest_sessions(expires_at);
  `);
}

async function cleanupGuestCommercialData(guestId) {
  if (!guestId) return;
  try {
    const exps = await all(
      `SELECT id, state FROM commercial_experiences WHERE guest_id = ?`,
      [guestId]
    );
    for (const exp of exps) {
      await run(`DELETE FROM commercial_impacts WHERE experience_id = ?`, [exp.id]);
      await run(`DELETE FROM commercial_rounds WHERE experience_id = ?`, [exp.id]);
      await run(`DELETE FROM commercial_experiences WHERE id = ?`, [exp.id]);
    }
  } catch (err) {
  }
}

async function destroyGuestSession(guestId) {
  if (!guestId) return false;
  memorySessions.delete(guestId);
  try {
    await run(`DELETE FROM ephemeral_guest_sessions WHERE guest_id = ?`, [guestId]);
  } catch (err) {}
  await cleanupGuestCommercialData(guestId);
  return true;
}

async function cleanupExpiredGuestSessions(now = Date.now()) {
  let purged = 0;
  for (const [guestId, sess] of memorySessions.entries()) {
    if (now >= sess.expiresAt) {
      memorySessions.delete(guestId);
      await cleanupGuestCommercialData(guestId);
      purged += 1;
    }
  }

  try {
    const expiredRows = await all(
      `SELECT guest_id FROM ephemeral_guest_sessions WHERE expires_at <= ?`,
      [now]
    );
    for (const row of expiredRows) {
      memorySessions.delete(row.guest_id);
      await cleanupGuestCommercialData(row.guest_id);
      purged += 1;
    }
    if (expiredRows.length > 0) {
      await run(`DELETE FROM ephemeral_guest_sessions WHERE expires_at <= ?`, [now]);
    }
  } catch (err) {}

  return purged;
}

async function createGuestSession(options = {}) {
  const now = Date.now();
  await cleanupExpiredGuestSessions(now);

  const ttlMs = getGuestTtlMs(options.ttlMs);
  const guestId = `guest_${crypto.randomBytes(16).toString('hex')}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = now + ttlMs;

  const payload = {
    type: 'guest',
    guestId,
    nonce,
    createdAt: now,
    expiresAt
  };

  const token = signGuestPayload(payload);
  const tokenHash = hashToken(token);

  const sessionObj = {
    guestId,
    tokenHash,
    createdAt: now,
    expiresAt,
    lastActivityAt: now,
    personalState: {
      activeMatch: null,
      lastMatchesByMode: {},
      impactEventIds: []
    }
  };

  memorySessions.set(guestId, sessionObj);

  await run(
    `INSERT OR REPLACE INTO ephemeral_guest_sessions (
       guest_id, token_hash, created_at, expires_at, last_activity_at, personal_state_json
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [guestId, tokenHash, now, expiresAt, now, JSON.stringify(sessionObj.personalState)]
  );

  return {
    guestId,
    token,
    createdAt: now,
    expiresAt,
    guest: {
      id: guestId,
      guestId,
      isGuest: true,
      role: 'guest',
      name: 'Visitante',
      avatar: '🎾',
      expiresAt
    }
  };
}

async function verifyGuestSession(token, now = Date.now()) {
  const payload = decodeGuestToken(token);
  if (!payload) return null;

  if (now >= payload.expiresAt) {
    await destroyGuestSession(payload.guestId);
    return null;
  }

  const expectedHash = hashToken(token);
  let sess = memorySessions.get(payload.guestId);

  if (!sess) {
    try {
      const row = await get(
        `SELECT * FROM ephemeral_guest_sessions WHERE guest_id = ?`,
        [payload.guestId]
      );
      if (!row) return null;
      if (now >= row.expires_at || row.token_hash !== expectedHash) {
        await destroyGuestSession(payload.guestId);
        return null;
      }
      let parsedState = { activeMatch: null, lastMatchesByMode: {}, impactEventIds: [] };
      if (row.personal_state_json) {
        try {
          parsedState = JSON.parse(row.personal_state_json);
        } catch (e) {}
      }
      sess = {
        guestId: row.guest_id,
        tokenHash: row.token_hash,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastActivityAt: now,
        personalState: parsedState
      };
      memorySessions.set(sess.guestId, sess);
    } catch (err) {
      return null;
    }
  }

  if (sess.tokenHash !== expectedHash) {
    return null;
  }
  if (now >= sess.expiresAt) {
    await destroyGuestSession(sess.guestId);
    return null;
  }

  sess.lastActivityAt = now;
  return sess;
}

async function saveGuestPersonalState(guestId, personalState) {
  const sess = memorySessions.get(guestId);
  if (sess) {
    sess.personalState = personalState;
    sess.lastActivityAt = Date.now();
  }
  try {
    await run(
      `UPDATE ephemeral_guest_sessions
       SET personal_state_json = ?, last_activity_at = ?
       WHERE guest_id = ?`,
      [JSON.stringify(personalState), Date.now(), guestId]
    );
  } catch (err) {}
}

async function getGuestPersonalState(guestId) {
  const sess = memorySessions.get(guestId);
  if (sess && sess.personalState) {
    return sess.personalState;
  }
  try {
    const row = await get(
      `SELECT personal_state_json FROM ephemeral_guest_sessions WHERE guest_id = ?`,
      [guestId]
    );
    if (row && row.personal_state_json) {
      const parsed = JSON.parse(row.personal_state_json);
      if (sess) sess.personalState = parsed;
      return parsed;
    }
  } catch (err) {}
  return { activeMatch: null, lastMatchesByMode: {}, impactEventIds: [] };
}

let cleanupTicker = null;
function startGuestCleanupTicker(intervalMs = 15000) {
  if (cleanupTicker) return;
  cleanupTicker = setInterval(() => {
    cleanupExpiredGuestSessions(Date.now()).catch(() => {});
  }, intervalMs);
  if (cleanupTicker.unref) cleanupTicker.unref();
}

module.exports = {
  ensureGuestTables,
  createGuestSession,
  verifyGuestSession,
  destroyGuestSession,
  cleanupExpiredGuestSessions,
  saveGuestPersonalState,
  getGuestPersonalState,
  decodeGuestToken,
  startGuestCleanupTicker
};
