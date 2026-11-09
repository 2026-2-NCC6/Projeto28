const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REAL = path.join(ROOT, 'server', 'database', 'smart_tennis.db');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const script = process.argv[2];
if (!script) { console.error('Informe o script.'); process.exit(2); }

const before = sha(REAL);
const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-copy-')), 'copy.db');
fs.copyFileSync(REAL, copy);

const r = spawnSync(process.execPath, [script], {
  cwd: ROOT, env: { ...process.env, SMART_TENNIS_DB_PATH: copy }, encoding: 'utf8'
});
const out = (r.stdout || '') + (r.stderr || '');
console.log(out.split('\n').filter((l) => /PASS|FAIL|TOTAL|RESULTADO|Conectado/.test(l) && !/✅/.test(l) || /❌/.test(l)).join('\n'));
console.log(`Saída do script: código ${r.status}`);
console.log(`Banco real intocado: ${before === sha(REAL)}`);
fs.rmSync(path.dirname(copy), { recursive: true, force: true });
process.exit(r.status === 0 && before === sha(REAL) ? 0 : 1);
