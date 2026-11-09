const express = require('express');
const router = express.Router();
const { get, all } = require('../database/db');
const { requireAuth, verifyToken } = require('../services/authService');
const guestSessionService = require('../services/guestSessionService');
const academyService = require('../services/academyService');

async function optionalAcademyAuth(req, res, next) {
  req.user = null;
  req.guest = null;
  req.actor = { type: 'anonymous' };

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next();
  }

  try {
    const guestDecoded = guestSessionService.decodeGuestToken(token);
    if (guestDecoded) {
      const guestSess = await guestSessionService.verifyGuestSession(token);
      if (guestSess) {
        req.guest = guestSess;
        req.actor = { type: 'guest', guestId: guestSess.guestId, guest: guestSess };
      }
      return next();
    }

    const payload = verifyToken(token);
    if (payload && payload.id) {
      const user = await get(
        'SELECT id, username, name, role, avatar, status FROM users WHERE id = ?',
        [payload.id]
      );
      if (user && user.status !== 'inactive') {
        req.user = user;
        req.actor = { type: 'user', userId: user.id, user };
      }
    }
  } catch (err) {
  }

  return next();
}

function handleAcademyError(res, error) {
  const status = error.status || 500;
  return res.status(status).json({ error: error.message || 'Erro na Motion Tennis Academy.' });
}

router.get('/catalog', optionalAcademyAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { category, level, search } = req.query;
    const catalog = await academyService.getPublicCatalog({
      userId,
      category,
      level,
      search
    });
    res.json(catalog);
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/lessons', optionalAcademyAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { category, level, search } = req.query;
    const catalog = await academyService.getPublicCatalog({
      userId,
      category,
      level,
      search
    });
    res.json({
      freeAccess: true,
      requiresLogin: false,
      requiresSubscription: false,
      totalPublished: catalog.totalPublished,
      plannedInitialLessonsCount: catalog.plannedInitialLessonsCount,
      lessons: catalog.lessons,
      categories: catalog.categories,
      userProgress: catalog.userProgress
    });
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/categories', optionalAcademyAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const catalog = await academyService.getPublicCatalog({ userId });
    res.json({
      freeAccess: true,
      categories: catalog.categories,
      totalPublished: catalog.totalPublished,
      plannedInitialLessonsCount: catalog.plannedInitialLessonsCount
    });
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/lessons/:id', optionalAcademyAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const isAdmin = Boolean(req.user && req.user.role === 'admin');
    const detail = await academyService.getLessonDetail(req.params.id, { userId, isAdmin });
    res.json(detail);
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/progress', requireAuth, async (req, res) => {
  try {
    const progress = await academyService.getUserProgress({ userId: req.user.id });
    res.json(progress);
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.post('/lessons/:id/progress', requireAuth, async (req, res) => {
  try {
    if (
      req.body?.user_id !== undefined &&
      req.body?.user_id !== null &&
      Number(req.body.user_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ error: 'Não é permitido alterar o progresso de outro jogador.' });
    }

    const completed = req.body?.completed !== undefined ? Boolean(req.body.completed) : true;
    const result = await academyService.setUserLessonProgress({
      userId: req.user.id,
      lessonId: req.params.id,
      completed
    });
    res.json(result);
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.put('/lessons/:id/progress', requireAuth, async (req, res) => {
  try {
    if (
      req.body?.user_id !== undefined &&
      req.body?.user_id !== null &&
      Number(req.body.user_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ error: 'Não é permitido alterar o progresso de outro jogador.' });
    }

    const completed = req.body?.completed !== undefined ? Boolean(req.body.completed) : true;
    const result = await academyService.setUserLessonProgress({
      userId: req.user.id,
      lessonId: req.params.id,
      completed
    });
    res.json(result);
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/', optionalAcademyAuth, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const catalog = await academyService.getPublicCatalog({ userId });

    const counts = await all(`
      SELECT skill,
             COUNT(*) as total_lessons,
             SUM(CASE WHEN published = 1 AND embed_url IS NOT NULL AND embed_url != '' THEN 1 ELSE 0 END) as published_lessons
      FROM academy_content
      GROUP BY skill
    `);

    let attributes = [];
    if (userId) {
      const player = await get('SELECT id FROM players WHERE user_id = ?', [userId]);
      if (player) {
        const rows = await all(
          'SELECT key, name, level, xp, xp_next, objective, strong_points, improvement_points, coach_tip FROM attributes WHERE player_id = ?',
          [player.id]
        );
        const iconMap = {
          precision: '🎯',
          consistency: '🔄',
          speed: '⚡',
          control: '🎮',
          reflex: '⚡',
          strategy: '🧠'
        };
        attributes = (rows || []).map((r) => ({
          key: r.key,
          name: r.name,
          icon: iconMap[r.key] || '🎾',
          level: r.level,
          xp: r.xp,
          xp_next: r.xp_next,
          description: r.objective || r.coach_tip || ''
        }));
      }
    }

    const defaultSkills = [
      { key: 'precision', name: 'Precisão', icon: '🎯', level: 1, xp: 0, xp_next: 100, description: 'Capacidade de acertar alvos específicos e zonas de pontuação máxima.' },
      { key: 'consistency', name: 'Consistência', icon: '🔄', level: 1, xp: 0, xp_next: 100, description: 'Manutenção de sequências longas de acertos sem erros.' },
      { key: 'speed', name: 'Velocidade', icon: '⚡', level: 1, xp: 0, xp_next: 100, description: 'Potência e velocidade média dos golpes registrados.' },
      { key: 'control', name: 'Controle', icon: '🎮', level: 1, xp: 0, xp_next: 100, description: 'Domínio sobre a direção e força da bola em diferentes alturas.' },
      { key: 'reflex', name: 'Reflexo', icon: '⚡', level: 1, xp: 0, xp_next: 100, description: 'Tempo de reação rápido em modos dinâmicos de alvos.' },
      { key: 'strategy', name: 'Estratégia', icon: '🧠', level: 1, xp: 0, xp_next: 100, description: 'Inteligência de jogo, leitura de quadra e tomada de decisão.' }
    ];

    const baseSkills = attributes.length > 0 ? attributes : defaultSkills;
    const overview = baseSkills.map((attr) => {
      const found = counts.find((c) => c.skill === attr.key);
      return {
        ...attr,
        total_lessons: found ? found.total_lessons : 2,
        published_lessons: found ? Number(found.published_lessons || 0) : 0,
        category: academyService.SKILL_TO_CATEGORY[attr.key] || attr.name
      };
    });

    res.json({
      skills: overview,
      freeAccess: true,
      requiresLogin: false,
      requiresSubscription: false,
      catalog
    });
  } catch (error) {
    handleAcademyError(res, error);
  }
});

router.get('/:skill', optionalAcademyAuth, async (req, res) => {
  try {
    const { skill } = req.params;
    const validSkills = ['precision', 'consistency', 'speed', 'control', 'reflex', 'strategy'];

    if (!validSkills.includes(skill)) {
      return res.status(400).json({ error: 'Habilidade inválida.' });
    }

    const userId = req.user ? req.user.id : null;
    const isAdmin = Boolean(req.user && req.user.role === 'admin');
    const catalog = await academyService.getPublicCatalog({ userId, category: skill });

    let attribute = null;
    let relatedTrainings = [];
    if (userId) {
      const player = await get('SELECT id FROM players WHERE user_id = ?', [userId]);
      if (player) {
        const row = await get(
          'SELECT key, name, level, xp, xp_next, objective, strong_points, improvement_points, coach_tip FROM attributes WHERE player_id = ? AND key = ?',
          [player.id, skill]
        );
        if (row) {
          const iconMap = {
            precision: '🎯',
            consistency: '🔄',
            speed: '⚡',
            control: '🎮',
            reflex: '⚡',
            strategy: '🧠'
          };
          attribute = {
            key: row.key,
            name: row.name,
            icon: iconMap[row.key] || '🎾',
            level: row.level,
            xp: row.xp,
            xp_next: row.xp_next,
            description: row.objective || row.coach_tip || `Módulo técnico de ${row.name}.`
          };
        }
      }
    }

    if (!attribute) {
      attribute = {
        key: skill,
        name: academyService.SKILL_TO_CATEGORY[skill] || skill,
        icon: '🎾',
        level: 1,
        xp: 0,
        xp_next: 100,
        description: `Módulo técnico de ${academyService.SKILL_TO_CATEGORY[skill] || skill} da Motion Tennis Academy.`
      };
    }

    relatedTrainings = await all('SELECT * FROM trainings WHERE attribute_key = ?', [skill]);

    const plannedSlots = catalog.initialModulesPreview.filter(
      (s) => s.category === academyService.SKILL_TO_CATEGORY[skill]
    );

    res.json({
      freeAccess: true,
      skill: attribute,
      lessons: catalog.lessons,
      plannedSlots,
      relatedTrainings,
      isAdmin
    });
  } catch (error) {
    handleAcademyError(res, error);
  }
});

module.exports = router;
