const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

console.log('====================================================');
console.log('       🎾 SMART TENNIS — INICIALIZADOR LOCAL        ');
console.log('====================================================');
console.log(` Iniciando servidor na porta ${PORT}...`);

const serverProcess = spawn('node', ['server/index.js'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true
});

function pollServer(retries = 20) {
  if (retries <= 0) {
    console.log('[AVISO] Tempo limite de espera pelo servidor.');
    return;
  }

  const req = http.get(`${URL}/api/status`, (res) => {
    if (res.statusCode === 200) {
      console.log(`\n[OK] Smart Tennis online em ${URL}!`);
      console.log('[OK] Abrindo navegador automaticamente...');
      
      const startCmd = process.platform === 'win32' ? `start ${URL}` : process.platform === 'darwin' ? `open ${URL}` : `xdg-open ${URL}`;
      exec(startCmd);
    } else {
      setTimeout(() => pollServer(retries - 1), 500);
    }
  });

  req.on('error', () => {
    setTimeout(() => pollServer(retries - 1), 500);
  });
}

setTimeout(() => pollServer(), 1000);

process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
  process.exit(0);
});
