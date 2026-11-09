const { get, all, run } = require('../database/db');

class AcademyHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SKILL_TO_CATEGORY = {
  precision: 'Precisão & Direção',
  consistency: 'Consistência & Ritmo',
  speed: 'Velocidade & Potência',
  control: 'Controle & Sensibilidade',
  reflex: 'Reflexo & Agilidade',
  strategy: 'Estratégia & Tática'
};

const CATEGORY_TO_SKILL = {
  'Precisão & Direção': 'precision',
  'Consistência & Ritmo': 'consistency',
  'Velocidade & Potência': 'speed',
  'Controle & Sensibilidade': 'control',
  'Reflexo & Agilidade': 'reflex',
  'Estratégia & Tática': 'strategy'
};

const VALID_LEVELS = ['Iniciante', 'Intermediário', 'Avançado'];

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
]);

const INITIAL_12_SLOTS = [
  { id: 'prec_1', slotNumber: 1, displayOrder: 1, category: 'Precisão & Direção' },
  { id: 'prec_2', slotNumber: 2, displayOrder: 2, category: 'Precisão & Direção' },
  { id: 'cons_1', slotNumber: 3, displayOrder: 3, category: 'Consistência & Ritmo' },
  { id: 'cons_2', slotNumber: 4, displayOrder: 4, category: 'Consistência & Ritmo' },
  { id: 'speed_1', slotNumber: 5, displayOrder: 5, category: 'Velocidade & Potência' },
  { id: 'speed_2', slotNumber: 6, displayOrder: 6, category: 'Velocidade & Potência' },
  { id: 'ctrl_1', slotNumber: 7, displayOrder: 7, category: 'Controle & Sensibilidade' },
  { id: 'ctrl_2', slotNumber: 8, displayOrder: 8, category: 'Controle & Sensibilidade' },
  { id: 'refl_1', slotNumber: 9, displayOrder: 9, category: 'Reflexo & Agilidade' },
  { id: 'refl_2', slotNumber: 10, displayOrder: 10, category: 'Reflexo & Agilidade' },
  { id: 'strat_1', slotNumber: 11, displayOrder: 11, category: 'Estratégia & Tática' },
  { id: 'strat_2', slotNumber: 12, displayOrder: 12, category: 'Estratégia & Tática' }
];

function validateAndParseYouTubeUrl(rawUrl, { allowEmpty = false } = {}) {
  if (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === '') {
    if (allowEmpty) {
      return {
        valid: true,
        empty: true,
        videoId: null,
        youtubeUrl: null,
        embedUrl: null,
        defaultThumbnail: null
      };
    }
    throw new AcademyHttpError(400, 'A URL do vídeo do YouTube é obrigatória.');
  }

  const trimmed = String(rawUrl).trim();
  if (trimmed.length > 500 || /[<>"'`]/.test(trimmed) || /^(javascript|data|vbscript):/i.test(trimmed)) {
    throw new AcademyHttpError(400, 'URL do YouTube inválida ou formato não permitido.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new AcademyHttpError(
      400,
      'URL inválida. Informe um link completo do YouTube (ex: https://www.youtube.com/watch?v=VIDEO_ID).'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AcademyHttpError(400, 'A URL do YouTube deve utilizar protocolo HTTP ou HTTPS.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
    throw new AcademyHttpError(
      400,
      'Domínio não permitido. Apenas links oficiais do YouTube (youtube.com ou youtu.be) são aceitos.'
    );
  }

  let videoId = null;
  const pathSegments = parsed.pathname.split('/').filter(Boolean);

  if (hostname === 'youtu.be') {
    videoId = pathSegments[0] || null;
  } else if (parsed.pathname === '/watch') {
    videoId = parsed.searchParams.get('v');
  } else if (
    pathSegments.length >= 2 &&
    ['embed', 'shorts', 'v', 'live'].includes(pathSegments[0].toLowerCase())
  ) {
    videoId = pathSegments[1];
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new AcademyHttpError(
      400,
      'Identificador de vídeo do YouTube inválido. O ID do vídeo deve conter 11 caracteres válidos.'
    );
  }

  return {
    valid: true,
    empty: false,
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    defaultThumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  };
}

function normalizeLevel(level) {
  if (!level) return 'Iniciante';
  const trimmed = String(level).trim();
  if (VALID_LEVELS.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('inic')) return 'Iniciante';
  if (lower.startsWith('inter')) return 'Intermediário';
  if (lower.startsWith('avan')) return 'Avançado';
  throw new AcademyHttpError(
    400,
    `Nível inválido ("${level}"). Os níveis permitidos são: ${VALID_LEVELS.join(', ')}.`
  );
}

function resolveSkillFromCategory(category, fallbackSkill = 'precision') {
  if (!category) return fallbackSkill;
  if (CATEGORY_TO_SKILL[category]) return CATEGORY_TO_SKILL[category];
  const lower = String(category).toLowerCase();
  if (lower.includes('precis') || lower.includes('dire')) return 'precision';
  if (lower.includes('consist') || lower.includes('ritmo') || lower.includes('fundament')) return 'consistency';
  if (lower.includes('veloc') || lower.includes('pot') || lower.includes('saque')) return 'speed';
  if (lower.includes('control') || lower.includes('voleio') || lower.includes('sensib')) return 'control';
  if (lower.includes('reflex') || lower.includes('agil') || lower.includes('moviment')) return 'reflex';
  if (lower.includes('estrat') || lower.includes('tátic') || lower.includes('tatic') || lower.includes('mental')) return 'strategy';
  return fallbackSkill;
}

async function ensureAcademyTables() {
  const columns = await all(`PRAGMA table_info(academy_content)`);
  const existingCols = new Set(columns.map((c) => c.name));

  const columnsToAdd = [
    { name: 'category', sql: `ALTER TABLE academy_content ADD COLUMN category TEXT` },
    { name: 'level', sql: `ALTER TABLE academy_content ADD COLUMN level TEXT DEFAULT 'Iniciante'` },
    { name: 'instructor', sql: `ALTER TABLE academy_content ADD COLUMN instructor TEXT DEFAULT ''` },
    { name: 'youtube_url', sql: `ALTER TABLE academy_content ADD COLUMN youtube_url TEXT` },
    { name: 'youtube_video_id', sql: `ALTER TABLE academy_content ADD COLUMN youtube_video_id TEXT` },
    { name: 'embed_url', sql: `ALTER TABLE academy_content ADD COLUMN embed_url TEXT` },
    { name: 'display_order', sql: `ALTER TABLE academy_content ADD COLUMN display_order INTEGER DEFAULT 0` },
    { name: 'published', sql: `ALTER TABLE academy_content ADD COLUMN published INTEGER DEFAULT 0` },
    { name: 'slot_number', sql: `ALTER TABLE academy_content ADD COLUMN slot_number INTEGER` },
    { name: 'created_at', sql: `ALTER TABLE academy_content ADD COLUMN created_at DATETIME` },
    { name: 'updated_at', sql: `ALTER TABLE academy_content ADD COLUMN updated_at DATETIME` }
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      await run(col.sql);
    }
  }

  await run(`
    CREATE TABLE IF NOT EXISTS academy_user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES academy_content(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 1,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, lesson_id)
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_academy_progress_user ON academy_user_progress(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_academy_progress_lesson ON academy_user_progress(lesson_id)`);

  await run(
    `INSERT OR IGNORE INTO system_settings (key, value) VALUES ('academy_show_coming_soon', 'true')`
  );

  const allRows = await all(`SELECT * FROM academy_content ORDER BY id ASC`);
  let fallbackOrder = 100;

  for (const row of allRows) {
    const slotDef = INITIAL_12_SLOTS.find((s) => s.id === row.id);
    const category = row.category || (slotDef ? slotDef.category : SKILL_TO_CATEGORY[row.skill] || 'Fundamentos do Tênis');
    const level = row.level || (VALID_LEVELS.includes(row.difficulty) ? row.difficulty : 'Iniciante');
    const displayOrder =
      row.display_order && Number(row.display_order) > 0
        ? Number(row.display_order)
        : slotDef
          ? slotDef.displayOrder
          : fallbackOrder++;
    const slotNumber = row.slot_number !== null && row.slot_number !== undefined
      ? row.slot_number
      : slotDef
        ? slotDef.slotNumber
        : null;

    await run(
      `UPDATE academy_content
       SET category = COALESCE(NULLIF(category, ''), ?),
           level = COALESCE(NULLIF(level, ''), ?),
           display_order = CASE WHEN display_order IS NULL OR display_order = 0 THEN ? ELSE display_order END,
           slot_number = COALESCE(slot_number, ?),
           published = COALESCE(published, 0),
           instructor = COALESCE(instructor, ''),
           created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
           updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [category, level, displayOrder, slotNumber, row.id]
    );
  }
}

function formatLessonRow(row, completedLessonIds = new Set()) {
  if (!row) return null;
  const isPublished = Number(row.published) === 1 && Boolean(row.embed_url);
  const category = row.category || SKILL_TO_CATEGORY[row.skill] || 'Fundamentos do Tênis';
  const level = row.level || row.difficulty || 'Iniciante';
  const youtubeUrl = row.youtube_url || row.video_url || null;
  const videoId = row.youtube_video_id || null;
  const embedUrl = isPublished ? row.embed_url : null;
  const thumbnail =
    row.thumbnail ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);

  return {
    id: row.id,
    skill: row.skill,
    category,
    title: row.title,
    description: row.description,
    level,
    difficulty: level,
    duration: row.duration || '10 min',
    instructor: row.instructor && String(row.instructor).trim() ? String(row.instructor).trim() : null,
    thumbnail,
    youtube_url: isPublished ? youtubeUrl : (row._includeAdminFields ? youtubeUrl : null),
    video_url: isPublished ? youtubeUrl : (row._includeAdminFields ? youtubeUrl : null),
    youtube_video_id: isPublished ? videoId : (row._includeAdminFields ? videoId : null),
    embed_url: isPublished ? embedUrl : (row._includeAdminFields ? row.embed_url : null),
    published: Number(row.published) === 1,
    status: isPublished ? 'PUBLICADO' : 'EM BREVE',
    display_order: Number(row.display_order || 0),
    slot_number: row.slot_number !== null && row.slot_number !== undefined ? Number(row.slot_number) : null,
    completed: completedLessonIds.has(row.id),
    is_free: true,
    requires_payment: false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function getCompletedLessonIdSet(userId) {
  if (!userId || !Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    return new Set();
  }
  const rows = await all(
    `SELECT lesson_id FROM academy_user_progress WHERE user_id = ? AND completed = 1`,
    [Number(userId)]
  );
  return new Set(rows.map((r) => r.lesson_id));
}

async function getShowComingSoonSetting() {
  const row = await get(`SELECT value FROM system_settings WHERE key = 'academy_show_coming_soon'`);
  return !row || row.value !== 'false';
}

async function setShowComingSoonSetting(show) {
  const val = show ? 'true' : 'false';
  await run(
    `INSERT INTO system_settings (key, value) VALUES ('academy_show_coming_soon', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [val]
  );
  return show;
}

async function getPublicCatalog({ userId = null, category = null, level = null, search = null } = {}) {
  const completedSet = await getCompletedLessonIdSet(userId);
  const showComingSoon = await getShowComingSoonSetting();

  const allRows = await all(`
    SELECT * FROM academy_content
    ORDER BY display_order ASC, slot_number ASC, id ASC
  `);

  const allFormatted = allRows.map((r) => formatLessonRow(r, completedSet));

  const allPublished = allFormatted.filter((lesson) => lesson.published && lesson.embed_url);

  let filteredPublished = allPublished;
  if (category && category !== 'Todas' && category !== 'all') {
    filteredPublished = filteredPublished.filter(
      (l) => l.category.toLowerCase() === String(category).trim().toLowerCase() ||
             l.skill.toLowerCase() === String(category).trim().toLowerCase()
    );
  }
  if (level && level !== 'Todos' && level !== 'all') {
    filteredPublished = filteredPublished.filter(
      (l) => l.level.toLowerCase() === String(level).trim().toLowerCase()
    );
  }
  if (search && String(search).trim() !== '') {
    const q = String(search).trim().toLowerCase();
    filteredPublished = filteredPublished.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.instructor && l.instructor.toLowerCase().includes(q))
    );
  }

  const categoryMap = new Map();
  for (const catName of Object.values(SKILL_TO_CATEGORY)) {
    categoryMap.set(catName, {
      name: catName,
      skill: CATEGORY_TO_SKILL[catName] || 'precision',
      publishedCount: 0,
      plannedSlotsCount: 0,
      completedCount: 0
    });
  }

  for (const item of allFormatted) {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, {
        name: item.category,
        skill: item.skill,
        publishedCount: 0,
        plannedSlotsCount: 0,
        completedCount: 0
      });
    }
    const entry = categoryMap.get(item.category);
    if (item.slot_number && item.slot_number <= 12) {
      entry.plannedSlotsCount += 1;
    }
    if (item.published && item.embed_url) {
      entry.publishedCount += 1;
      if (item.completed) {
        entry.completedCount += 1;
      }
    }
  }

  const categories = Array.from(categoryMap.values()).map((c) => ({
    ...c,
    progressPercent: c.publishedCount > 0 ? Math.round((c.completedCount / c.publishedCount) * 100) : 0
  }));

  const initial12Slots = allFormatted
    .filter((l) => l.slot_number !== null && l.slot_number >= 1 && l.slot_number <= 12)
    .sort((a, b) => a.slot_number - b.slot_number)
    .map((slot) => ({
      slot_number: slot.slot_number,
      id: slot.published ? slot.id : null,
      category: slot.category,
      level: slot.level,
      duration: slot.duration,
      status: slot.published ? 'PUBLICADO' : 'EM BREVE',
      published: slot.published,
      title: slot.published ? slot.title : `Aula ${String(slot.slot_number).padStart(2, '0')} — ${slot.category} (Em breve)`
    }));

  const completedPublishedCount = allPublished.filter((l) => l.completed).length;
  const userProgress = userId
    ? {
        authenticated: true,
        userId: Number(userId),
        completedCount: completedPublishedCount,
        totalPublished: allPublished.length,
        overallPercent:
          allPublished.length > 0 ? Math.round((completedPublishedCount / allPublished.length) * 100) : 0,
        completedLessonIds: Array.from(completedSet),
        byCategory: categories
      }
    : null;

  return {
    freeAccess: true,
    requiresLogin: false,
    requiresSubscription: false,
    commercialPolicy: 'GRATUITO_PARA_TODOS',
    showComingSoon,
    totalPublished: allPublished.length,
    plannedInitialLessonsCount: 12,
    lessons: filteredPublished,
    categories,
    initialModulesPreview: showComingSoon ? initial12Slots : [],
    userProgress
  };
}

async function getLessonDetail(lessonId, { userId = null, isAdmin = false } = {}) {
  if (!lessonId) {
    throw new AcademyHttpError(400, 'ID da aula é obrigatório.');
  }

  const row = await get(`SELECT * FROM academy_content WHERE id = ?`, [String(lessonId).trim()]);
  if (!row) {
    throw new AcademyHttpError(404, 'Aula não encontrada no catálogo da Motion Tennis Academy.');
  }

  const isPublished = Number(row.published) === 1 && Boolean(row.embed_url);
  if (!isPublished && !isAdmin) {
    throw new AcademyHttpError(404, 'Esta aula ainda não foi publicada ou está em preparação.');
  }

  const completedSet = await getCompletedLessonIdSet(userId);
  if (isAdmin) {
    row._includeAdminFields = true;
  }
  const lesson = formatLessonRow(row, completedSet);

  const relatedRows = await all(
    `SELECT * FROM academy_content
     WHERE id != ? AND published = 1 AND embed_url IS NOT NULL AND embed_url != ''
     ORDER BY CASE WHEN category = ? OR skill = ? THEN 0 ELSE 1 END, display_order ASC
     LIMIT 6`,
    [lesson.id, lesson.category, lesson.skill]
  );

  const relatedLessons = relatedRows.map((r) => formatLessonRow(r, completedSet));

  return {
    freeAccess: true,
    requiresPayment: false,
    lesson,
    relatedLessons
  };
}

async function setUserLessonProgress({ userId, lessonId, completed = true }) {
  if (!userId || !Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    throw new AcademyHttpError(403, 'Apenas jogadores autenticados podem salvar progresso de aulas.');
  }
  if (!lessonId) {
    throw new AcademyHttpError(400, 'ID da aula é obrigatório.');
  }

  const row = await get(`SELECT * FROM academy_content WHERE id = ?`, [String(lessonId).trim()]);
  if (!row) {
    throw new AcademyHttpError(404, 'Aula não encontrada.');
  }
  if (Number(row.published) !== 1) {
    throw new AcademyHttpError(400, 'Não é possível registrar progresso em uma aula não publicada.');
  }

  const isCompleted = Boolean(completed);
  if (isCompleted) {
    await run(
      `INSERT INTO academy_user_progress (user_id, lesson_id, completed, completed_at, updated_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         completed = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [Number(userId), row.id]
    );
  } else {
    await run(
      `DELETE FROM academy_user_progress WHERE user_id = ? AND lesson_id = ?`,
      [Number(userId), row.id]
    );
  }

  return getUserProgress({ userId: Number(userId), targetLessonId: row.id });
}

async function getUserProgress({ userId, targetLessonId = null }) {
  if (!userId || !Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    throw new AcademyHttpError(401, 'Autenticação necessária para consultar progresso pessoal.');
  }

  const catalog = await getPublicCatalog({ userId: Number(userId) });
  const completedRows = await all(
    `SELECT lesson_id, completed_at, updated_at
     FROM academy_user_progress
     WHERE user_id = ? AND completed = 1
     ORDER BY updated_at DESC`,
    [Number(userId)]
  );

  return {
    userId: Number(userId),
    lessonId: targetLessonId,
    completed: targetLessonId ? completedRows.some((r) => r.lesson_id === targetLessonId) : undefined,
    completedCount: catalog.userProgress ? catalog.userProgress.completedCount : 0,
    totalPublished: catalog.totalPublished,
    overallPercent: catalog.userProgress ? catalog.userProgress.overallPercent : 0,
    completedLessonIds: completedRows.map((r) => r.lesson_id),
    history: completedRows,
    byCategory: catalog.categories
  };
}

async function listAdminLessons() {
  const showComingSoon = await getShowComingSoonSetting();
  const rows = await all(`
    SELECT * FROM academy_content
    ORDER BY display_order ASC, slot_number ASC, id ASC
  `);

  const lessons = rows.map((r) => {
    r._includeAdminFields = true;
    return formatLessonRow(r, new Set());
  });

  return {
    totalCount: lessons.length,
    publishedCount: lessons.filter((l) => l.published).length,
    unpublishedCount: lessons.filter((l) => !l.published).length,
    initialSlotsCount: lessons.filter((l) => l.slot_number && l.slot_number <= 12).length,
    showComingSoon,
    validLevels: VALID_LEVELS,
    defaultCategories: Object.values(SKILL_TO_CATEGORY),
    lessons
  };
}

async function createAdminLesson(payload = {}) {
  const title = payload.title ? String(payload.title).trim() : '';
  const description = payload.description ? String(payload.description).trim() : '';
  const category = payload.category ? String(payload.category).trim() : 'Fundamentos do Tênis';
  const level = normalizeLevel(payload.level || payload.difficulty || 'Iniciante');
  const duration = payload.duration ? String(payload.duration).trim() : '10 min';
  const instructor = payload.instructor !== undefined && payload.instructor !== null ? String(payload.instructor).trim() : '';
  const published = Boolean(payload.published);
  const rawYoutubeUrl = payload.youtube_url !== undefined ? payload.youtube_url : payload.video_url;

  if (!title) {
    throw new AcademyHttpError(400, 'O título da aula é obrigatório.');
  }
  if (!description) {
    throw new AcademyHttpError(400, 'A descrição da aula é obrigatória.');
  }
  if (!category) {
    throw new AcademyHttpError(400, 'A categoria da aula é obrigatória.');
  }

  const ytParsed = validateAndParseYouTubeUrl(rawYoutubeUrl, { allowEmpty: !published });
  if (published && ytParsed.empty) {
    throw new AcademyHttpError(400, 'Para publicar uma aula, informe uma URL válida do YouTube.');
  }

  const skill = payload.skill && SKILL_TO_CATEGORY[payload.skill]
    ? payload.skill
    : resolveSkillFromCategory(category, 'precision');

  let displayOrder = Number(payload.display_order);
  if (!Number.isFinite(displayOrder) || displayOrder <= 0) {
    const maxRow = await get(`SELECT MAX(display_order) as maxOrder FROM academy_content`);
    displayOrder = (maxRow?.maxOrder || 0) + 1;
  }

  const slotNumber =
    payload.slot_number !== undefined && payload.slot_number !== null && payload.slot_number !== ''
      ? Number(payload.slot_number)
      : null;

  const customThumbnail =
    payload.thumbnail && String(payload.thumbnail).trim() !== ''
      ? String(payload.thumbnail).trim()
      : ytParsed.defaultThumbnail;

  const lessonId =
    payload.id && String(payload.id).trim() !== ''
      ? String(payload.id).trim().replace(/[^a-zA-Z0-9_-]/g, '')
      : `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const existing = await get(`SELECT id FROM academy_content WHERE id = ?`, [lessonId]);
  if (existing) {
    throw new AcademyHttpError(400, `Já existe uma aula cadastrada com o identificador "${lessonId}".`);
  }

  await run(
    `INSERT INTO academy_content (
      id, skill, category, title, description, status, difficulty, level, duration,
      instructor, thumbnail, video_url, youtube_url, youtube_video_id, embed_url,
      display_order, published, slot_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      lessonId,
      skill,
      category,
      title,
      description,
      published ? 'PUBLICADO' : 'EM BREVE',
      level,
      level,
      duration,
      instructor,
      customThumbnail,
      ytParsed.youtubeUrl,
      ytParsed.youtubeUrl,
      ytParsed.videoId,
      ytParsed.embedUrl,
      displayOrder,
      published ? 1 : 0,
      slotNumber
    ]
  );

  const created = await get(`SELECT * FROM academy_content WHERE id = ?`, [lessonId]);
  created._includeAdminFields = true;
  return formatLessonRow(created, new Set());
}

async function updateAdminLesson(lessonId, payload = {}) {
  if (!lessonId) {
    throw new AcademyHttpError(400, 'ID da aula é obrigatório.');
  }

  const existing = await get(`SELECT * FROM academy_content WHERE id = ?`, [String(lessonId).trim()]);
  if (!existing) {
    throw new AcademyHttpError(404, 'Aula não encontrada.');
  }

  const title = payload.title !== undefined ? String(payload.title).trim() : existing.title;
  const description = payload.description !== undefined ? String(payload.description).trim() : existing.description;
  const category = payload.category !== undefined ? String(payload.category).trim() : (existing.category || SKILL_TO_CATEGORY[existing.skill] || 'Fundamentos do Tênis');
  const level = payload.level !== undefined || payload.difficulty !== undefined
    ? normalizeLevel(payload.level || payload.difficulty)
    : normalizeLevel(existing.level || existing.difficulty || 'Iniciante');
  const duration = payload.duration !== undefined ? String(payload.duration).trim() : (existing.duration || '10 min');
  const instructor = payload.instructor !== undefined
    ? (payload.instructor === null ? '' : String(payload.instructor).trim())
    : (existing.instructor || '');

  if (!title) {
    throw new AcademyHttpError(400, 'O título da aula não pode ficar vazio.');
  }
  if (!description) {
    throw new AcademyHttpError(400, 'A descrição da aula não pode ficar vazia.');
  }
  if (!category) {
    throw new AcademyHttpError(400, 'A categoria da aula não pode ficar vazia.');
  }

  const published =
    payload.published !== undefined ? Boolean(payload.published) : Number(existing.published) === 1;

  const rawYoutubeUrl =
    payload.youtube_url !== undefined
      ? payload.youtube_url
      : payload.video_url !== undefined
        ? payload.video_url
        : existing.youtube_url || existing.video_url || '';

  const ytParsed = validateAndParseYouTubeUrl(rawYoutubeUrl, { allowEmpty: !published });
  if (published && ytParsed.empty) {
    throw new AcademyHttpError(
      400,
      'Não é possível publicar uma aula sem uma URL válida do YouTube.'
    );
  }

  const skill = payload.skill && SKILL_TO_CATEGORY[payload.skill]
    ? payload.skill
    : resolveSkillFromCategory(category, existing.skill || 'precision');

  const displayOrder =
    payload.display_order !== undefined && Number.isFinite(Number(payload.display_order))
      ? Number(payload.display_order)
      : Number(existing.display_order || 1);

  const slotNumber =
    payload.slot_number !== undefined
      ? (payload.slot_number === null || payload.slot_number === '' ? null : Number(payload.slot_number))
      : existing.slot_number;

  const thumbnail =
    payload.thumbnail !== undefined
      ? (payload.thumbnail && String(payload.thumbnail).trim() !== ''
          ? String(payload.thumbnail).trim()
          : ytParsed.defaultThumbnail)
      : (existing.thumbnail || ytParsed.defaultThumbnail);

  await run(
    `UPDATE academy_content
     SET skill = ?,
         category = ?,
         title = ?,
         description = ?,
         status = ?,
         difficulty = ?,
         level = ?,
         duration = ?,
         instructor = ?,
         thumbnail = ?,
         video_url = ?,
         youtube_url = ?,
         youtube_video_id = ?,
         embed_url = ?,
         display_order = ?,
         published = ?,
         slot_number = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      skill,
      category,
      title,
      description,
      published ? 'PUBLICADO' : 'EM BREVE',
      level,
      level,
      duration,
      instructor,
      thumbnail,
      ytParsed.youtubeUrl,
      ytParsed.youtubeUrl,
      ytParsed.videoId,
      ytParsed.embedUrl,
      displayOrder,
      published ? 1 : 0,
      slotNumber,
      existing.id
    ]
  );

  const updated = await get(`SELECT * FROM academy_content WHERE id = ?`, [existing.id]);
  updated._includeAdminFields = true;
  return formatLessonRow(updated, new Set());
}

async function setAdminLessonPublished(lessonId, published) {
  if (!lessonId) {
    throw new AcademyHttpError(400, 'ID da aula é obrigatório.');
  }
  const existing = await get(`SELECT * FROM academy_content WHERE id = ?`, [String(lessonId).trim()]);
  if (!existing) {
    throw new AcademyHttpError(404, 'Aula não encontrada.');
  }

  const targetPublished = Boolean(published);
  const currentUrl = existing.youtube_url || existing.video_url || '';

  if (targetPublished) {
    const ytParsed = validateAndParseYouTubeUrl(currentUrl, { allowEmpty: false });
    await run(
      `UPDATE academy_content
       SET published = 1,
           status = 'PUBLICADO',
           youtube_url = ?,
           video_url = ?,
           youtube_video_id = ?,
           embed_url = ?,
           thumbnail = COALESCE(NULLIF(thumbnail, ''), ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        ytParsed.youtubeUrl,
        ytParsed.youtubeUrl,
        ytParsed.videoId,
        ytParsed.embedUrl,
        ytParsed.defaultThumbnail,
        existing.id
      ]
    );
  } else {
    await run(
      `UPDATE academy_content
       SET published = 0,
           status = 'EM BREVE',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [existing.id]
    );
  }

  const updated = await get(`SELECT * FROM academy_content WHERE id = ?`, [existing.id]);
  updated._includeAdminFields = true;
  return formatLessonRow(updated, new Set());
}

async function deleteAdminLesson(lessonId) {
  if (!lessonId) {
    throw new AcademyHttpError(400, 'ID da aula é obrigatório.');
  }
  const existing = await get(`SELECT * FROM academy_content WHERE id = ?`, [String(lessonId).trim()]);
  if (!existing) {
    throw new AcademyHttpError(404, 'Aula não encontrada.');
  }

  await run(`DELETE FROM academy_user_progress WHERE lesson_id = ?`, [existing.id]);
  await run(`DELETE FROM academy_content WHERE id = ?`, [existing.id]);

  return { deleted: true, id: existing.id, title: existing.title };
}

module.exports = {
  AcademyHttpError,
  SKILL_TO_CATEGORY,
  CATEGORY_TO_SKILL,
  VALID_LEVELS,
  validateAndParseYouTubeUrl,
  ensureAcademyTables,
  getPublicCatalog,
  getLessonDetail,
  setUserLessonProgress,
  getUserProgress,
  listAdminLessons,
  createAdminLesson,
  updateAdminLesson,
  setAdminLessonPublished,
  deleteAdminLesson,
  getShowComingSoonSetting,
  setShowComingSoonSetting
};
