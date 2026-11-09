const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

require('./config/supabaseConfig');

const { initializeDatabase } = require('./database/initDb');
const { initEventHub } = require('./services/eventHub');

// Existing Routes
const playerRoutes = require('./routes/playerRoutes');
const shotsRoutes = require('./routes/shotsRoutes');
const hardwareRoutes = require('./routes/hardwareRoutes');
const skillsRoutes = require('./routes/skillsRoutes');
const achievementsRoutes = require('./routes/achievementsRoutes');
const sessionsRoutes = require('./routes/sessionsRoutes');
const statusRoutes = require('./routes/statusRoutes');

// New Routes for Auth, Admin, Academy, and Sensors
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const academyRoutes = require('./routes/academyRoutes');
const sensorsRoutes = require('./routes/sensorsRoutes');

// Modo Shopping / Modo Pessoal / Modo Visitante
const { experienceRouter, installationRouter } = require('./routes/experienceRoutes');
const experienceService = require('./services/experienceService');
const personalMatchRoutes = require('./routes/personalMatchRoutes');
const personalMatchService = require('./services/personalMatchService');
const guestSessionService = require('./services/guestSessionService');
const iotLocalizationService = require('./services/iotLocalizationService');
const academyService = require('./services/academyService');
const cloudSyncWorker = require('./services/cloudSyncWorker');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/academy', academyRoutes);
app.use('/api/sensors', sensorsRoutes);
app.use('/api/installation', installationRouter);
app.use('/api/experience', experienceRouter);
app.use('/api/personal-match', personalMatchRoutes);

app.use('/api/player', playerRoutes);
app.use('/api/shots', shotsRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/status', statusRoutes);

// Static frontend serving (when built)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// 404 handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    error: 'Erro interno no servidor Motion Tennis',
    message: err.message
  });
});

async function startServer() {
  try {
    await initializeDatabase(false);

    // Tabelas da experiência comercial + recuperação após reinício + ticker de tempo
    await experienceService.ensureExperienceTables();
    const recovery = await experienceService.recoverOnStartup();
    if (recovery.found > 0) {
      console.log(`[EXPERIENCE] Recuperação: ${recovery.found} experiência(s) ativa(s) -> ${recovery.restored} restaurada(s), ${recovery.completed} finalizada(s).`);
    }
    experienceService.startExperienceTicker();

    // Modo Pessoal: partidas de 5 minutos controladas pelo backend
    await personalMatchService.ensurePersonalMatchTables();
    const personalRecovery = await personalMatchService.recoverPersonalMatchesOnStartup();
    if (personalRecovery.found > 0) {
      console.log(`[PERSONAL MATCH] Recuperação: ${personalRecovery.found} partida(s) ativa(s) -> ${personalRecovery.restored} restaurada(s), ${personalRecovery.completed} finalizada(s).`);
    }
    personalMatchService.startPersonalMatchTicker();

    // Sessões temporárias e isoladas de visitante + limpeza automática
    await guestSessionService.ensureGuestTables();
    await guestSessionService.cleanupExpiredGuestSessions();
    guestSessionService.startGuestCleanupTicker();

    await iotLocalizationService.ensureIotAndWallTables();

    await academyService.ensureAcademyTables();

    cloudSyncWorker.startWorker({ intervalMs: 20000 });

    initEventHub(server);

    server.listen(PORT, HOST, () => {
      console.log('====================================================');
      console.log('       🎾 MOTION TENNIS — SERVIDOR LOCAL ONLINE     ');
      console.log('====================================================');
      console.log(` Endereço:          http://${HOST}:${PORT}`);
      console.log(` API Status:        http://${HOST}:${PORT}/api/status`);
      console.log(` WebSocket:         ws://${HOST}:${PORT}/ws`);
      console.log(` Banco de Dados:    SQLite (smart_tennis.db)`);
      console.log(` Hardware Endpoint: http://${HOST}:${PORT}/api/hardware/hit`);
      console.log('====================================================');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[ERRO] A porta ${PORT} já está em uso por outro aplicativo.`);
      } else {
        console.error('[ERRO] Falha ao iniciar servidor:', err.message);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('[ERRO FATAL] Falha durante inicialização do banco ou servidor:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n[MOTION TENNIS] Encerrando servidor com segurança...');
  server.close(() => {
    console.log('[MOTION TENNIS] Servidor finalizado.');
    process.exit(0);
  });
});

startServer();
