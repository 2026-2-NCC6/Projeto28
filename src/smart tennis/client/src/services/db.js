import { openDB } from 'idb';

const DB_NAME = 'smart_tennis_offline_db';
const DB_VERSION = 1;

export async function getOfflineDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'userId' });
      }

      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('by_user', 'userId');
      }

      if (!db.objectStoreNames.contains('attributes')) {
        const attrStore = db.createObjectStore('attributes', { keyPath: ['userId', 'key'] });
        attrStore.createIndex('by_user', 'userId');
      }

      if (!db.objectStoreNames.contains('achievements')) {
        const achStore = db.createObjectStore('achievements', { keyPath: ['userId', 'id'] });
        achStore.createIndex('by_user', 'userId');
      }

      if (!db.objectStoreNames.contains('shots')) {
        const shotStore = db.createObjectStore('shots', { keyPath: ['userId', 'id'] });
        shotStore.createIndex('by_user', 'userId');
      }

      if (!db.objectStoreNames.contains('sync_metadata')) {
        db.createObjectStore('sync_metadata', { keyPath: 'userId' });
      }
    }
  });
}

export async function savePlayerSnapshot(userId, snapshot) {
  if (!userId) throw new Error('userId obrigatório para salvar snapshot local.');
  const db = await getOfflineDb();
  const tx = db.transaction(
    ['profiles', 'sessions', 'attributes', 'achievements', 'shots', 'sync_metadata'],
    'readwrite'
  );

  try {
    const numUserId = Number(userId);

    if (snapshot.profile) {
      await tx.objectStore('profiles').put({
        ...snapshot.profile,
        userId: numUserId,
        cachedAt: new Date().toISOString()
      });
    }

    if (Array.isArray(snapshot.sessions)) {
      const sessionStore = tx.objectStore('sessions');
      const userIndex = sessionStore.index('by_user');
      let cursor = await userIndex.openCursor(IDBKeyRange.only(numUserId));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      for (const sess of snapshot.sessions) {
        await sessionStore.put({
          ...sess,
          userId: numUserId
        });
      }
    }

    if (Array.isArray(snapshot.attributes)) {
      const attrStore = tx.objectStore('attributes');
      const userIndex = attrStore.index('by_user');
      let cursor = await userIndex.openCursor(IDBKeyRange.only(numUserId));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      for (const attr of snapshot.attributes) {
        await attrStore.put({
          ...attr,
          userId: numUserId
        });
      }
    }

    if (Array.isArray(snapshot.achievements)) {
      const achStore = tx.objectStore('achievements');
      const userIndex = achStore.index('by_user');
      let cursor = await userIndex.openCursor(IDBKeyRange.only(numUserId));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      for (const ach of snapshot.achievements) {
        await achStore.put({
          ...ach,
          userId: numUserId
        });
      }
    }

    if (snapshot.hitmap && Array.isArray(snapshot.hitmap.shots)) {
      const shotStore = tx.objectStore('shots');
      const userIndex = shotStore.index('by_user');
      let cursor = await userIndex.openCursor(IDBKeyRange.only(numUserId));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      for (const shot of snapshot.hitmap.shots) {
        await shotStore.put({
          ...shot,
          userId: numUserId
        });
      }
    }

    const syncTime = new Date().toISOString();
    await tx.objectStore('sync_metadata').put({
      userId: numUserId,
      lastSyncAt: syncTime,
      totalSessions: snapshot.sessions?.length || 0,
      status: 'success'
    });

    await tx.done;
    return { success: true, lastSyncAt: syncTime };
  } catch (err) {
    tx.abort();
    throw err;
  }
}

export async function getPlayerOfflineData(userId) {
  if (!userId) return null;
  const numUserId = Number(userId);
  const db = await getOfflineDb();

  const profile = await db.get('profiles', numUserId);
  const meta = await db.get('sync_metadata', numUserId);

  if (!profile && !meta) {
    return null;
  }

  const sessions = await db.getAllFromIndex('sessions', 'by_user', numUserId);

  const attributes = await db.getAllFromIndex('attributes', 'by_user', numUserId);

  const achievements = await db.getAllFromIndex('achievements', 'by_user', numUserId);

  const shots = await db.getAllFromIndex('shots', 'by_user', numUserId);

  const zoneDistribution = {};
  let totalHits = 0;
  let bullseyes = 0;
  for (const s of shots) {
    if (s.zone) {
      zoneDistribution[s.zone] = (zoneDistribution[s.zone] || 0) + 1;
    }
    if (s.is_hit) totalHits++;
    if (s.is_bullseye) bullseyes++;
  }

  const hitmap = {
    shots,
    totalCount: shots.length,
    totalHits,
    bullseyes,
    zoneDistribution
  };

  return {
    userId: numUserId,
    profile,
    sessions,
    attributes,
    achievements,
    hitmap,
    meta: meta || { lastSyncAt: null }
  };
}

export async function getSyncMetadata(userId) {
  if (!userId) return null;
  const db = await getOfflineDb();
  return await db.get('sync_metadata', Number(userId));
}

/**
 * Limpa com segurança o cache local de um usuário específico ao deslogar ou trocar de conta.
 */
export async function purgeUserOfflineCache(userId) {
  if (!userId) return;
  const numUserId = Number(userId);
  const db = await getOfflineDb();
  const tx = db.transaction(
    ['profiles', 'sessions', 'attributes', 'achievements', 'shots', 'sync_metadata'],
    'readwrite'
  );

  await tx.objectStore('profiles').delete(numUserId);
  await tx.objectStore('sync_metadata').delete(numUserId);

  const clearStore = async (storeName) => {
    const store = tx.objectStore(storeName);
    const index = store.index('by_user');
    let cursor = await index.openCursor(IDBKeyRange.only(numUserId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  };

  await clearStore('sessions');
  await clearStore('attributes');
  await clearStore('achievements');
  await clearStore('shots');

  await tx.done;
}
