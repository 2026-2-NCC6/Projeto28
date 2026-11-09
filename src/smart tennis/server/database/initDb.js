const { run, exec, get, all } = require('./db');
const { hashPassword } = require('../services/authService');

async function initializeDatabase(forceReset = false) {
  if (forceReset) {
    console.log('[DB] Resetando banco de dados para estado inicial...');
    await exec(`
      DROP TABLE IF EXISTS academy_content;
      DROP TABLE IF EXISTS hits;
      DROP TABLE IF EXISTS sensors;
      DROP TABLE IF EXISTS equipment_users;
      DROP TABLE IF EXISTS equipments;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS shots;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS achievements;
      DROP TABLE IF EXISTS trainings;
      DROP TABLE IF EXISTS skill_tree;
      DROP TABLE IF EXISTS attributes;
      DROP TABLE IF EXISTS players;
    `);
  }

  // Create all tables
  await exec(`
    -- Tabela de Usuários (com roles e senhas hasheadas)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player', -- 'player' ou 'admin'
      avatar TEXT DEFAULT '🎾',
      status TEXT DEFAULT 'active', -- 'active' ou 'inactive'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de Equipamentos Físicos Smart Tennis
    CREATE TABLE IF NOT EXISTS equipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'online', -- 'online', 'offline', 'maintenance'
      location TEXT DEFAULT 'Quadra Principal',
      wall_preset TEXT DEFAULT 'medium',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Relação Usuário <-> Equipamento
    CREATE TABLE IF NOT EXISTS equipment_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(equipment_id, user_id)
    );

    -- Sensores com Posições Físicas Fixas no Alvo
    CREATE TABLE IF NOT EXISTS sensors (
      id INTEGER PRIMARY KEY,
      equipment_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'online',
      base_score INTEGER DEFAULT 80
    );

    -- Impactos / Hits de Sensores Físicos e Simulação
    CREATE TABLE IF NOT EXISTS hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      equipment_id INTEGER DEFAULT 1,
      session_id TEXT,
      game_mode TEXT DEFAULT 'free', -- 'free', 'single', 'clear_all'
      sensor_id INTEGER,
      x REAL,
      y REAL,
      speed REAL DEFAULT 80,
      score INTEGER DEFAULT 0,
      is_simulation INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Conteúdos da Smart Tennis Academy
    CREATE TABLE IF NOT EXISTS academy_content (
      id TEXT PRIMARY KEY,
      skill TEXT NOT NULL, -- 'precision', 'consistency', 'speed', 'control', 'reflex', 'strategy'
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'VÍDEO EM BREVE',
      difficulty TEXT DEFAULT 'Iniciante',
      duration TEXT DEFAULT '5 min',
      thumbnail TEXT,
      video_url TEXT
    );

    -- Tabela de Jogadores (dados gamificados)
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '🎾',
      level INTEGER DEFAULT 1,
      title TEXT DEFAULT 'Iniciante',
      xp INTEGER DEFAULT 0,
      xp_next INTEGER DEFAULT 500,
      precision REAL DEFAULT 0,
      total_shots INTEGER DEFAULT 0,
      total_hits INTEGER DEFAULT 0,
      avg_score INTEGER DEFAULT 0,
      best_score INTEGER DEFAULT 0,
      best_region TEXT DEFAULT 'Centro',
      trainings_completed INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Atributos do Atleta
    CREATE TABLE IF NOT EXISTS attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      max_level INTEGER DEFAULT 10,
      xp INTEGER DEFAULT 0,
      xp_next INTEGER DEFAULT 1000,
      objective TEXT,
      strong_points TEXT,
      improvement_points TEXT,
      coach_tip TEXT,
      UNIQUE(player_id, key)
    );

    -- Árvore de Habilidades (Skill Tree)
    CREATE TABLE IF NOT EXISTS skill_tree (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tier INTEGER DEFAULT 1,
      status TEXT DEFAULT 'locked',
      description TEXT,
      requirement TEXT,
      xp_reward INTEGER DEFAULT 100,
      parent_id TEXT,
      pos_x REAL,
      pos_y REAL
    );

    -- Treinamentos
    CREATE TABLE IF NOT EXISTS trainings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      xp_reward INTEGER DEFAULT 150,
      attribute_key TEXT,
      attribute_name TEXT,
      objective TEXT,
      description TEXT,
      target_score INTEGER DEFAULT 500,
      shot_count INTEGER DEFAULT 10,
      mode TEXT DEFAULT 'free'
    );

    -- Conquistas
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT '🏆',
      unlocked INTEGER DEFAULT 0,
      unlocked_at DATETIME,
      progress INTEGER DEFAULT 0,
      target INTEGER DEFAULT 1,
      xp_reward INTEGER DEFAULT 200
    );

    -- Sessões de Treino
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER DEFAULT 1,
      equipment_id INTEGER DEFAULT 1,
      mode TEXT NOT NULL,
      shots_count INTEGER DEFAULT 0,
      hits_count INTEGER DEFAULT 0,
      accuracy REAL DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      avg_force REAL DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      reactivations INTEGER DEFAULT 0,
      is_simulation INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Legado de shots para compatibilidade
    CREATE TABLE IF NOT EXISTS shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id INTEGER,
      x REAL NOT NULL,
      y REAL NOT NULL,
      zone TEXT NOT NULL,
      zone_id INTEGER DEFAULT 5,
      force REAL DEFAULT 75.0,
      score INTEGER DEFAULT 0,
      is_hit INTEGER DEFAULT 1,
      is_bullseye INTEGER DEFAULT 0,
      source TEXT DEFAULT 'simulation',
      sensor_id TEXT DEFAULT 'S-01',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Configurações Globais do Sistema (chave/valor)
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Apply non-destructive migrations on existing databases
  await runNonDestructiveMigrations();

  // Check if users exist; if not seed demo users and data
  const user = await get(`SELECT * FROM users LIMIT 1`);
  if (!user) {
    console.log('[DB] Inicializando dados estruturais (usuários, equipamentos, sensores, academy)...');
    await seedDemoData();
  } else {
    // Check if new tables need seeding
    const sensorCount = await get(`SELECT count(*) as count FROM sensors`);
    if (!sensorCount || sensorCount.count === 0) {
      console.log('[DB] Populando sensores e academy_content em banco existente...');
      await seedSensorsAndAcademy();
    }
  }
}

async function hasColumn(tableName, colName) {
  const cols = await all(`PRAGMA table_info(${tableName})`);
  return cols.some((c) => c.name === colName);
}

async function runNonDestructiveMigrations() {
  // 1. Ensure default system_settings
  await run(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES
    ('installation_mode', 'personal'),
    ('shopping_interval_seconds', '30'),
    ('wall_preset', 'medium'),
    ('hardware_mode', 'simulation')
  `);

  // 2. Add missing columns non-destructively
  if (!(await hasColumn('equipments', 'wall_preset'))) {
    await run(`ALTER TABLE equipments ADD COLUMN wall_preset TEXT DEFAULT 'medium'`);
  }
  if (!(await hasColumn('hits', 'is_simulation'))) {
    await run(`ALTER TABLE hits ADD COLUMN is_simulation INTEGER DEFAULT 0`);
  }
  if (!(await hasColumn('sessions', 'is_simulation'))) {
    await run(`ALTER TABLE sessions ADD COLUMN is_simulation INTEGER DEFAULT 0`);
  }
  if (!(await hasColumn('shots', 'user_id'))) {
    await run(`ALTER TABLE shots ADD COLUMN user_id INTEGER`);
    // Associate historical unassigned shots with the primary demo player (user_id = 2)
    await run(`UPDATE shots SET user_id = 2 WHERE user_id IS NULL`);
  }

  // 3. Migrate attributes table if it has single-column UNIQUE(key) instead of UNIQUE(player_id, key)
  const attrMaster = await get(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attributes'`);
  if (attrMaster && attrMaster.sql && attrMaster.sql.includes('key TEXT UNIQUE')) {
    await exec(`
      CREATE TABLE IF NOT EXISTS attributes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        level INTEGER DEFAULT 1,
        max_level INTEGER DEFAULT 10,
        xp INTEGER DEFAULT 0,
        xp_next INTEGER DEFAULT 1000,
        objective TEXT,
        strong_points TEXT,
        improvement_points TEXT,
        coach_tip TEXT,
        UNIQUE(player_id, key)
      );
      INSERT OR IGNORE INTO attributes_new (
        id, player_id, key, name, level, max_level, xp, xp_next,
        objective, strong_points, improvement_points, coach_tip
      )
      SELECT
        id, COALESCE(player_id, 1), key, name, level, max_level, xp, xp_next,
        objective, strong_points, improvement_points, coach_tip
      FROM attributes;
      DROP TABLE attributes;
      ALTER TABLE attributes_new RENAME TO attributes;
    `);
  }

  // 4. Ensure every player in players has all 6 attributes
  const allPlayers = await all(`SELECT id FROM players`);
  const defaultAttrs = [
    {
      key: 'precision',
      name: 'Precisão',
      objective: 'Atingir 85% de precisão nos cantos inferiores em 5 treinos consecutivos.',
      strong_points: 'Excelente centralização nas jogadas de fundo e golpes retos.',
      improvement_points: 'Ajustar a mira nas bolas aceleradas para o canto direito.',
      coach_tip: 'Faça séries mirando alternadamente nos sensores dos cantos e no sensor central. Priorize controle antes de velocidade.'
    },
    {
      key: 'consistency',
      name: 'Consistência',
      objective: 'Manter sequência de 20 acertos sem errar o quadrante delimitado.',
      strong_points: 'Ritmo constante durante rallies médios.',
      improvement_points: 'Evitar oscilações de força após a décima jogada consecutiva.',
      coach_tip: 'Concentre-se na respiração antes de cada golpe. O segredo da consistência é repetir a mesma preparação de braço em cada repetição.'
    },
    {
      key: 'speed',
      name: 'Velocidade',
      objective: 'Alcançar média de impacto acima de 95 km/h mantendo 75% de acertos.',
      strong_points: 'Potência de saque inicial consistente e aceleração rápida.',
      improvement_points: 'Transferência de peso corporal para a perna de apoio ao acelerar.',
      coach_tip: 'Velocidade sem controle é ponto perdido. Solte o punho no final do movimento para ganhar efeito topspin sem perder o alvo.'
    },
    {
      key: 'control',
      name: 'Controle',
      objective: 'Variar a profundidade dos impactos alternando fundo e meio de quadra.',
      strong_points: 'Ótima absorção de bolas rápidas e amortecimentos precisos.',
      improvement_points: 'Controle de trajetória em bolas com altura acima dos ombros.',
      coach_tip: 'Ajuste o ângulo da face da raquete milissegundos antes do impacto. Menor movimento de braço gera maior controle direcional.'
    },
    {
      key: 'reflex',
      name: 'Reflexo',
      objective: 'Reagir em menos de 0.8s aos alvos dinâmicos no modo Alvo Único.',
      strong_points: 'Boa leitura visual e antecipação nas jogadas de voleio.',
      improvement_points: 'Tempo de recuperação postural após impactos descentralizados.',
      coach_tip: 'Mantenha os calcanhares ligeiramente fora do chão e a empunhadura relaxada enquanto aguarda a leitura dos sensores.'
    },
    {
      key: 'strategy',
      name: 'Estratégia',
      objective: 'Completar sequências de alvos táticos explorando o ponto fraco simulado.',
      strong_points: 'Excelente tomada de decisão em situações de pressão.',
      improvement_points: 'Construção tática do ponto ao invés de buscar winner prematuro.',
      coach_tip: 'Abra a quadra jogando primeiro no ponto seguro antes de buscar os sensores das linhas extremas.'
    }
  ];

  for (const p of allPlayers) {
    for (const a of defaultAttrs) {
      await run(`
        INSERT OR IGNORE INTO attributes (
          player_id, key, name, level, max_level, xp, xp_next,
          objective, strong_points, improvement_points, coach_tip
        ) VALUES (?, ?, ?, 1, 10, 0, 1000, ?, ?, ?, ?)
      `, [p.id, a.key, a.name, a.objective, a.strong_points, a.improvement_points, a.coach_tip]);
    }
  }

  // 5. Preparar associação segura com Supabase Auth sem alterar dados existentes
  if (!(await hasColumn('users', 'supabase_user_id'))) {
    await run(`ALTER TABLE users ADD COLUMN supabase_user_id TEXT`);
  }
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
    CREATE INDEX IF NOT EXISTS idx_user_cloud_identities_cloud_id ON user_cloud_identities(provider, cloud_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;
  `);

  // 6. Fila local de sincronização Cloud Outbox (Offline-First)
  await exec(`
    CREATE TABLE IF NOT EXISTS cloud_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      session_id TEXT,
      match_id TEXT,
      user_id INTEGER,
      cloud_user_id TEXT,
      equipment_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'MATCH_FINISHED',
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 10,
      next_retry_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_status_retry ON cloud_outbox(status, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_session ON cloud_outbox(session_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_outbox_user ON cloud_outbox(user_id);
  `);

  // Adiciona colunas granulares de impacto na tabela personal_match_impacts se ela existir
  const pmiExists = await get(`SELECT name FROM sqlite_master WHERE type='table' AND name='personal_match_impacts'`);
  if (pmiExists) {
    if (!(await hasColumn('personal_match_impacts', 'shot_score'))) {
      await run(`ALTER TABLE personal_match_impacts ADD COLUMN shot_score INTEGER DEFAULT 0`);
    }
    if (!(await hasColumn('personal_match_impacts', 'shot_xp'))) {
      await run(`ALTER TABLE personal_match_impacts ADD COLUMN shot_xp INTEGER DEFAULT 0`);
    }
    if (!(await hasColumn('personal_match_impacts', 'force_kmh'))) {
      await run(`ALTER TABLE personal_match_impacts ADD COLUMN force_kmh REAL DEFAULT 80.0`);
    }
    if (!(await hasColumn('personal_match_impacts', 'is_bullseye'))) {
      await run(`ALTER TABLE personal_match_impacts ADD COLUMN is_bullseye INTEGER DEFAULT 0`);
    }
  }
}

async function seedDemoData() {
  // 1. Criar Usuários Iniciais (Admin e Nicolas) com Hash de Senha Seguro
  const adminCred = hashPassword('admin123');
  const nicolasCred = hashPassword('nicolas123');

  await run(`
    INSERT INTO users (username, name, password_hash, salt, role, avatar, status)
    VALUES ('admin', 'Administrador', ?, ?, 'admin', '👑', 'active')
  `, [adminCred.hash, adminCred.salt]);

  const nicolasInsert = await run(`
    INSERT INTO users (username, name, password_hash, salt, role, avatar, status)
    VALUES ('nicolas', 'Nicolas', ?, ?, 'player', '🎾', 'active')
  `, [nicolasCred.hash, nicolasCred.salt]);

  const nicolasUserId = nicolasInsert.lastID;

  // 2. Criar Equipamentos Motion Tennis
  const eq1 = await run(`
    INSERT INTO equipments (code, name, status, location)
    VALUES ('ST-001', 'MOTION TENNIS #001', 'online', 'Quadra Principal - Centro de Treinamento')
  `);

  await run(`
    INSERT INTO equipments (code, name, status, location)
    VALUES ('ST-002', 'MOTION TENNIS #002', 'offline', 'Quadra B - Coberta')
  `);

  // 3. Associar Nicolas ao Equipamento #001
  await run(`
    INSERT INTO equipment_users (equipment_id, user_id)
    VALUES (?, ?)
  `, [eq1.lastID, nicolasUserId]);

  // 4. Perfil Gamificado de Nicolas
  await run(`
    INSERT INTO players (
      user_id, name, avatar, level, title, xp, xp_next, precision,
      total_shots, total_hits, avg_score, best_score, best_region,
      trainings_completed, streak_days, created_at
    ) VALUES (
      ?, 'Nicolas', '🎾', 12, 'Competidor', 2450, 3000, 82.0,
      435, 357, 780, 920, 'Centro / Sensor 5',
      24, 5, datetime('now', '-30 days')
    )
  `, [nicolasUserId]);

  // 5. Atributos
  const attributes = [
    {
      key: 'precision',
      name: 'Precisão',
      level: 7,
      max_level: 10,
      xp: 720,
      xp_next: 1000,
      objective: 'Atingir 85% de precisão nos cantos inferiores em 5 treinos consecutivos.',
      strong_points: 'Excelente centralização nas jogadas de fundo e golpes retos.',
      improvement_points: 'Ajustar a mira nas bolas aceleradas para o canto direito.',
      coach_tip: 'Faça séries mirando alternadamente nos sensores dos cantos e no sensor central. Priorize controle antes de velocidade.'
    },
    {
      key: 'consistency',
      name: 'Consistência',
      level: 5,
      max_level: 10,
      xp: 510,
      xp_next: 1000,
      objective: 'Manter sequência de 20 acertos sem errar o quadrante delimitado.',
      strong_points: 'Ritmo constante durante rallies médios.',
      improvement_points: 'Evitar oscilações de força após a décima jogada consecutiva.',
      coach_tip: 'Concentre-se na respiração antes de cada golpe. O segredo da consistência é repetir a mesma preparação de braço em cada repetição.'
    },
    {
      key: 'speed',
      name: 'Velocidade',
      level: 4,
      max_level: 10,
      xp: 430,
      xp_next: 1000,
      objective: 'Alcançar média de impacto acima de 95 km/h mantendo 75% de acertos.',
      strong_points: 'Potência de saque inicial consistente e aceleração rápida.',
      improvement_points: 'Transferência de peso corporal para a perna de apoio ao acelerar.',
      coach_tip: 'Velocidade sem controle é ponto perdido. Solte o punho no final do movimento para ganhar efeito topspin sem perder o alvo.'
    },
    {
      key: 'control',
      name: 'Controle',
      level: 6,
      max_level: 10,
      xp: 640,
      xp_next: 1000,
      objective: 'Variar a profundidade dos impactos alternando fundo e meio de quadra.',
      strong_points: 'Ótima absorção de bolas rápidas e amortecimentos precisos.',
      improvement_points: 'Controle de trajetória em bolas com altura acima dos ombros.',
      coach_tip: 'Ajuste o ângulo da face da raquete milissegundos antes do impacto. Menor movimento de braço gera maior controle direcional.'
    },
    {
      key: 'reflex',
      name: 'Reflexo',
      level: 3,
      max_level: 10,
      xp: 320,
      xp_next: 1000,
      objective: 'Reagir em menos de 0.8s aos alvos dinâmicos no modo Alvo Único.',
      strong_points: 'Boa leitura visual e antecipação nas jogadas de voleio.',
      improvement_points: 'Tempo de recuperação postural após impactos descentralizados.',
      coach_tip: 'Mantenha os calcanhares ligeiramente fora do chão e a empunhadura relaxada enquanto aguarda a leitura dos sensores.'
    },
    {
      key: 'strategy',
      name: 'Estratégia',
      level: 4,
      max_level: 10,
      xp: 410,
      xp_next: 1000,
      objective: 'Completar sequências de alvos táticos explorando o ponto fraco simulado.',
      strong_points: 'Excelente tomada de decisão em situações de pressão.',
      improvement_points: 'Construção tática do ponto ao invés de buscar winner prematuro.',
      coach_tip: 'Abra a quadra jogando primeiro no ponto seguro antes de buscar os sensores das linhas extremas.'
    }
  ];

  for (const attr of attributes) {
    await run(`
      INSERT INTO attributes (
        player_id, key, name, level, max_level, xp, xp_next,
        objective, strong_points, improvement_points, coach_tip
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [attr.key, attr.name, attr.level, attr.max_level, attr.xp, attr.xp_next, attr.objective, attr.strong_points, attr.improvement_points, attr.coach_tip]);
  }

  // 6. Skill Tree Nodes
  const nodes = [
    { id: 'node_iniciante', title: 'Iniciante', category: 'Geral', tier: 1, status: 'completed', description: 'Fundamentos básicos do tênis e primeiro contato com o Motion Tennis.', requirement: 'Completar o cadastro e calibrar sensores.', xp_reward: 100, parent_id: null, pos_x: 50, pos_y: 5 },
    { id: 'node_ctrl_1', title: 'Controle I', category: 'Controle', tier: 2, status: 'completed', description: 'Capacidade de manter a bola na área central do equipamento.', requirement: 'Acertar 10 jogadas na área central.', xp_reward: 150, parent_id: 'node_iniciante', pos_x: 35, pos_y: 18 },
    { id: 'node_prec_1', title: 'Precisão I', category: 'Precisão', tier: 2, status: 'completed', description: 'Primeiros golpes direcionados aos sensores específicos.', requirement: 'Atingir 60% de precisão em 1 sessão.', xp_reward: 150, parent_id: 'node_iniciante', pos_x: 65, pos_y: 18 },
    { id: 'node_prec_2', title: 'Precisão II', category: 'Precisão', tier: 3, status: 'completed', description: 'Detecção aprimorada e foco em cantos alternados.', requirement: 'Acertar 5 vezes os sensores superiores.', xp_reward: 200, parent_id: 'node_prec_1', pos_x: 65, pos_y: 32 },
    { id: 'node_cons_1', title: 'Consistência I', category: 'Consistência', tier: 3, status: 'completed', description: 'Sustentar sequência sem erros técnicos graves.', requirement: 'Completar 15 jogadas seguidas na quadra.', xp_reward: 200, parent_id: 'node_ctrl_1', pos_x: 35, pos_y: 32 },
    { id: 'node_interm', title: 'Jogador Intermediário', category: 'Geral', tier: 4, status: 'completed', description: 'Domínio comprovado de direção e força equilibradas.', requirement: 'Alcançar nível 6 geral e 70% de precisão.', xp_reward: 350, parent_id: 'node_prec_2', pos_x: 50, pos_y: 46 },
    { id: 'node_prec_3', title: 'Precisão III', category: 'Precisão', tier: 5, status: 'unlocked', description: 'Golpes cirúrgicos nas linhas limites do sensor.', requirement: 'Alcançar 80% de precisão em 3 treinos.', xp_reward: 300, parent_id: 'node_interm', pos_x: 35, pos_y: 60 },
    { id: 'node_ctrl_3', title: 'Controle III', category: 'Controle', tier: 5, status: 'unlocked', description: 'Variação dinâmica de altura e velocidade com mesmo gesto.', requirement: 'Completar 5 séries com variação inferior a 15%.', xp_reward: 300, parent_id: 'node_interm', pos_x: 65, pos_y: 60 },
    { id: 'node_competidor', title: 'Competidor', category: 'Geral', tier: 6, status: 'available', description: 'Nível profissional com alta taxa de acertos e controle tático.', requirement: 'Alcançar nível 12 e 300 acertos computados.', xp_reward: 500, parent_id: 'node_prec_3', pos_x: 50, pos_y: 74 },
    { id: 'node_especialista', title: 'Especialista', category: 'Geral', tier: 7, status: 'locked', description: 'Maestria total. Cada golpe é medido e executado com perfeição.', requirement: 'Alcançar nível 15 e precisão de 90% em Desafio.', xp_reward: 1000, parent_id: 'node_competidor', pos_x: 50, pos_y: 88 }
  ];

  for (const n of nodes) {
    await run(`
      INSERT INTO skill_tree (
        id, title, category, tier, status, description, requirement,
        xp_reward, parent_id, pos_x, pos_y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [n.id, n.title, n.category, n.tier, n.status, n.description, n.requirement, n.xp_reward, n.parent_id, n.pos_x, n.pos_y]);
  }

  // 7. Treinamentos
  const trainings = [
    { id: 'train_precision', title: 'Treino de Precisão', difficulty: 'Iniciante', xp_reward: 150, attribute_key: 'precision', attribute_name: 'Precisão', objective: 'Atingir os alvos destacados com precisão mínima de 75%.', description: 'Série focada nos sensores dos cantos e centro do equipamento.', target_score: 600, shot_count: 10, mode: 'single' },
    { id: 'train_direction_control', title: 'Controle de Direção', difficulty: 'Médio', xp_reward: 200, attribute_key: 'control', attribute_name: 'Controle', objective: 'Alternar impactos entre lado esquerdo e lado direito sem errar.', description: 'Trabalha a coordenação motora e o ponto de contato ideal da raquete.', target_score: 750, shot_count: 12, mode: 'single' },
    { id: 'train_consistency', title: 'Consistência de Saque', difficulty: 'Médio', xp_reward: 220, attribute_key: 'consistency', attribute_name: 'Consistência', objective: 'Manter 8 jogadas seguidas na mesma faixa do sensor.', description: 'Ideal para desenvolver memória muscular e regularidade em quadra.', target_score: 800, shot_count: 15, mode: 'free' },
    { id: 'train_target_sequence', title: 'Apague Todos — Desafio', difficulty: 'Pro', xp_reward: 300, attribute_key: 'strategy', attribute_name: 'Estratégia', objective: 'Desligar todos os sensores no menor número de jogadas.', description: 'Exige planejamento para não religar sensores já desativados.', target_score: 900, shot_count: 16, mode: 'clear_all' },
    { id: 'train_speed', title: 'Velocidade & Potência', difficulty: 'Médio', xp_reward: 250, attribute_key: 'speed', attribute_name: 'Velocidade', objective: 'Atingir sensores a mais de 85 km/h de impacto detectado.', description: 'Treine a aceleração do golpe mantendo a área do sensor sob controle.', target_score: 850, shot_count: 10, mode: 'free' },
    { id: 'train_score_challenge', title: 'Desafio Alvo Único', difficulty: 'Pro', xp_reward: 400, attribute_key: 'reflex', attribute_name: 'Reflexo', objective: 'Alcançar a maior pontuação em 20 jogadas com alvos dinâmicos.', description: 'Modo competitivo extremo. Alvos móveis com multiplicador de pontos.', target_score: 1200, shot_count: 20, mode: 'single' }
  ];

  for (const t of trainings) {
    await run(`
      INSERT INTO trainings (
        id, title, difficulty, xp_reward, attribute_key, attribute_name,
        objective, description, target_score, shot_count, mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [t.id, t.title, t.difficulty, t.xp_reward, t.attribute_key, t.attribute_name, t.objective, t.description, t.target_score, t.shot_count, t.mode]);
  }

  // 8. Conquistas
  const achievements = [
    { id: 'first_shot', title: 'Primeira Jogada', description: 'Complete sua primeira jogada registrada pelos sensores.', icon: '🎯', unlocked: 1, unlocked_at: '2026-09-01 10:00:00', progress: 1, target: 1, xp_reward: 100 },
    { id: 'bullseye', title: 'Na Mosca', description: 'Consiga um acerto perfeito nos sensores centrais do alvo.', icon: '🎯', unlocked: 1, unlocked_at: '2026-09-05 14:22:00', progress: 1, target: 1, xp_reward: 200 },
    { id: 'prec_80', title: 'Precisão 80', description: 'Alcance 80% de precisão em uma sessão completa.', icon: '⚡', unlocked: 1, unlocked_at: '2026-09-18 16:45:00', progress: 82, target: 80, xp_reward: 250 },
    { id: 'perfect_streak', title: 'Sequência Perfeita', description: 'Complete uma sequência de 10 jogadas sem nenhum erro.', icon: '🔥', unlocked: 1, unlocked_at: '2026-09-24 11:10:00', progress: 10, target: 10, xp_reward: 300 },
    { id: 'shots_100', title: '100 Jogadas', description: 'Realize 100 jogadas computadas no sistema.', icon: '🎾', unlocked: 1, unlocked_at: '2026-09-12 18:30:00', progress: 100, target: 100, xp_reward: 300 },
    { id: 'shots_500', title: 'Mestre dos Sensores', description: 'Realize 500 jogadas registradas pelo Motion Tennis.', icon: '👑', unlocked: 0, unlocked_at: null, progress: 435, target: 500, xp_reward: 500 },
    { id: 'consistent_training', title: 'Treino Consistente', description: 'Treine durante 7 dias seguidos.', icon: '📅', unlocked: 0, unlocked_at: null, progress: 5, target: 7, xp_reward: 350 },
    { id: 'speed_demon', title: 'Velocidade Sônica', description: 'Registre um golpe com velocidade superior a 100 km/h.', icon: '🚀', unlocked: 1, unlocked_at: '2026-09-28 17:05:00', progress: 104, target: 100, xp_reward: 250 },
    { id: 'clear_all_master', title: 'Apagador de Sensores', description: 'Vença uma partida de Apague Todos com menos de 3 reativações.', icon: '💡', unlocked: 1, unlocked_at: '2026-09-29 15:30:00', progress: 1, target: 1, xp_reward: 300 }
  ];

  for (const a of achievements) {
    await run(`
      INSERT INTO achievements (
        id, title, description, icon, unlocked, unlocked_at, progress, target, xp_reward
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [a.id, a.title, a.description, a.icon, a.unlocked, a.unlocked_at, a.progress, a.target, a.xp_reward]);
  }

  // 9. Sensores e Conteúdo Academy
  await seedSensorsAndAcademy();
}

async function seedSensorsAndAcademy() {
  // Sensores com Posições Físicas Fixas no Alvo Smart Tennis (Requirement 9 & 12-14)
  // Layout conceitual em proporção (X, Y em %):
  // Linha 1 (topo): S1(20,20)        S2(50,18)        S3(80,20)
  // Linha 2 (meio-alto):    S4(36,40)   S5(50,40)   S6(64,40)
  // Linha 3 (meio-baixo): S7(20,62)      S8(50,60)      S9(80,62)
  // Linha 4 (fundo):          S10(35,82)       S11(65,82)
  const sensors = [
    { id: 1, name: 'SENSOR-01', x: 20.0, y: 20.0, base_score: 85 },
    { id: 2, name: 'SENSOR-02', x: 50.0, y: 18.0, base_score: 80 },
    { id: 3, name: 'SENSOR-03', x: 80.0, y: 20.0, base_score: 85 },
    { id: 4, name: 'SENSOR-04', x: 36.0, y: 40.0, base_score: 90 },
    { id: 5, name: 'SENSOR-05', x: 50.0, y: 40.0, base_score: 100 }, // Centro Absoluto
    { id: 6, name: 'SENSOR-06', x: 64.0, y: 40.0, base_score: 90 },
    { id: 7, name: 'SENSOR-07', x: 20.0, y: 62.0, base_score: 85 },
    { id: 8, name: 'SENSOR-08', x: 50.0, y: 60.0, base_score: 95 },
    { id: 9, name: 'SENSOR-09', x: 80.0, y: 62.0, base_score: 85 },
    { id: 10, name: 'SENSOR-10', x: 35.0, y: 82.0, base_score: 85 },
    { id: 11, name: 'SENSOR-11', x: 65.0, y: 82.0, base_score: 85 }
  ];

  for (const s of sensors) {
    await run(`
      INSERT OR REPLACE INTO sensors (id, equipment_id, name, x, y, active, status, base_score)
      VALUES (?, 1, ?, ?, ?, 1, 'online', ?)
    `, [s.id, s.name, s.x, s.y, s.base_score]);
  }

  // Conteúdos da Smart Tennis Academy (Requirement 20 & 21)
  const academyCards = [
    // Precisão
    { id: 'prec_1', skill: 'precision', title: 'Fundamentos de Precisão', description: 'Como trabalhar direção e controle da bola com posicionamento correto do corpo.', difficulty: 'Iniciante', duration: '6 min' },
    { id: 'prec_2', skill: 'precision', title: 'Controle de Direção', description: 'Exercícios para aumentar a capacidade de direcionamento em cruzadas e paralelas.', difficulty: 'Intermediário', duration: '8 min' },
    { id: 'prec_3', skill: 'precision', title: 'Treino de Alvos', description: 'Trabalhe diferentes regiões do alvo mantendo consistência biomecânica.', difficulty: 'Avançado', duration: '10 min' },

    // Consistência
    { id: 'cons_1', skill: 'consistency', title: 'Regularidade', description: 'Desenvolvimento de ritmo respiratório e padrão motor repetitivo em trocas longas.', difficulty: 'Iniciante', duration: '5 min' },
    { id: 'cons_2', skill: 'consistency', title: 'Repetição Técnica', description: 'Séries focadas na mesma preparação de braço e terminação de golpe.', difficulty: 'Intermediário', duration: '7 min' },
    { id: 'cons_3', skill: 'consistency', title: 'Redução de Erros', description: 'Estratégias de margem de segurança acima da rede e ajuste de profundidade.', difficulty: 'Avançado', duration: '9 min' },

    // Velocidade
    { id: 'speed_1', skill: 'speed', title: 'Potência', description: 'Uso da cadeia cinética e rotação de tronco para gerar força com menor esforço de braço.', difficulty: 'Iniciante', duration: '6 min' },
    { id: 'speed_2', skill: 'speed', title: 'Aceleração', description: 'Soltura de punho na terminação do movimento para ganho de topspin acelerado.', difficulty: 'Intermediário', duration: '8 min' },
    { id: 'speed_3', skill: 'speed', title: 'Velocidade com Controle', description: 'Técnica para manter taxa de acerto acima de 80% em impactos acima de 95 km/h.', difficulty: 'Avançado', duration: '11 min' },

    // Controle
    { id: 'ctrl_1', skill: 'control', title: 'Controle da Bola', description: 'Absorção de impacto e sensação tátil no ponto de contato das cordas.', difficulty: 'Iniciante', duration: '5 min' },
    { id: 'ctrl_2', skill: 'control', title: 'Direcionamento', description: 'Ajuste do ângulo da face da raquete no momento exato do impacto com o alvo.', difficulty: 'Intermediário', duration: '7 min' },
    { id: 'ctrl_3', skill: 'control', title: 'Ajuste de Força', description: 'Alternância suave entre pancadas e amortecimentos com o mesmo gesto inicial.', difficulty: 'Avançado', duration: '9 min' },

    // Reflexo
    { id: 'refl_1', skill: 'reflex', title: 'Tempo de Reação', description: 'Redução do tempo de leitura visual da bola e sincronização do split-step.', difficulty: 'Iniciante', duration: '6 min' },
    { id: 'refl_2', skill: 'reflex', title: 'Resposta Rápida', description: 'Bloqueio de bolas rápidas com menor amplitude de backswing.', difficulty: 'Intermediário', duration: '8 min' },
    { id: 'refl_3', skill: 'reflex', title: 'Coordenação', description: 'Equilíbrio e estabilidade dos pés durante recuperação imediata após o golpe.', difficulty: 'Avançado', duration: '10 min' },

    // Estratégia
    { id: 'strat_1', skill: 'strategy', title: 'Escolha de Alvo', description: 'Critérios táticos para escolher entre o centro seguro ou arriscar os cantos.', difficulty: 'Iniciante', duration: '6 min' },
    { id: 'strat_2', skill: 'strategy', title: 'Sequências', description: 'Combinações de jogadas planejadas para desestabilizar o posicionamento adversário.', difficulty: 'Intermediário', duration: '8 min' },
    { id: 'strat_3', skill: 'strategy', title: 'Tomada de Decisão', description: 'Leitura tática sob pressão: saber o momento ideal de atacar ou defender.', difficulty: 'Avançado', duration: '10 min' }
  ];

  for (const c of academyCards) {
    await run(`
      INSERT OR REPLACE INTO academy_content (id, skill, title, description, status, difficulty, duration)
      VALUES (?, ?, ?, ?, 'VÍDEO EM BREVE', ?, ?)
    `, [c.id, c.skill, c.title, c.description, c.difficulty, c.duration]);
  }

  // Sessões e Hits de demonstração compatíveis com o novo modelo de sensores
  const sampleHits = [
    { sensor_id: 5, x: 50.0, y: 40.0, speed: 92, score: 100, mode: 'free' },
    { sensor_id: 5, x: 50.2, y: 40.1, speed: 95, score: 100, mode: 'free' },
    { sensor_id: 2, x: 50.0, y: 18.0, speed: 84, score: 80, mode: 'single' },
    { sensor_id: 1, x: 20.0, y: 20.0, speed: 88, score: 85, mode: 'single' },
    { sensor_id: 3, x: 80.0, y: 20.0, speed: 86, score: 85, mode: 'single' },
    { sensor_id: 8, x: 50.0, y: 60.0, speed: 89, score: 95, mode: 'clear_all' },
    { sensor_id: 4, x: 36.0, y: 40.0, speed: 91, score: 90, mode: 'clear_all' },
    { sensor_id: 6, x: 64.0, y: 40.0, speed: 87, score: 90, mode: 'clear_all' },
    { sensor_id: 10, x: 35.0, y: 82.0, speed: 82, score: 85, mode: 'free' },
    { sensor_id: 11, x: 65.0, y: 82.0, speed: 85, score: 85, mode: 'free' }
  ];

  for (const h of sampleHits) {
    await run(`
      INSERT INTO hits (user_id, equipment_id, session_id, game_mode, sensor_id, x, y, speed, score)
      VALUES (1, 1, 'sess_init', ?, ?, ?, ?, ?, ?)
    `, [h.mode, h.sensor_id, h.x, h.y, h.speed, h.score]);
  }

  console.log('[DB] Sensores fixos e conteúdos da Academy carregados com sucesso!');
}

module.exports = {
  initializeDatabase,
  seedDemoData,
  seedSensorsAndAcademy
};
