

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n==============================================================================');
console.log('🎾 MOTION TENNIS — COMPILAÇÃO DEFINITIVA DO APK ANDROID CLOUD');
console.log('==============================================================================\n');

const clientDir = path.resolve('client');
const androidDir = path.resolve('client/android');

try {
  console.log('📦 [1/5] Compilando frontend Vite em modo Android Cloud (client/dist)...');
  execSync('npm run build:android', { cwd: clientDir, stdio: 'inherit' });

  console.log('\n🔍 [2/5] Validando integridade dos assets gerados em client/dist...');
  const distIndexHtml = path.join(clientDir, 'dist/index.html');
  if (!fs.existsSync(distIndexHtml)) {
    throw new Error('Arquivo dist/index.html não foi gerado.');
  }

  const assetsDir = path.join(clientDir, 'dist/assets');
  const files = fs.readdirSync(assetsDir);
  const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
  if (!jsFile) {
    throw new Error('Nenhum bundle JS principal encontrado em client/dist/assets.');
  }

  const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
  if (!jsContent.includes('android_cloud')) {
    throw new Error('O bundle não contém a flag android_cloud embutida.');
  }
  if (jsContent.includes('UUID SUPABASE AUTH')) {
    throw new Error('O bundle contém vazamento de UUID.');
  }
  if (jsContent.includes('Notebook da Quadra') && jsContent.includes('Configurar →')) {
    throw new Error('O bundle ainda contém o card técnico Notebook da Quadra.');
  }
  console.log(`      Bundle verificado com sucesso: ${jsFile} (${(jsContent.length / 1024).toFixed(1)} KB)`);

  console.log('\n🔄 [3/5] Sincronizando assets com o projeto nativo Android...');
  execSync('npx cap sync android', { cwd: clientDir, stdio: 'inherit' });

  console.log('\n⚙️ [4/5] Compilando APK Debug com Gradle Wrapper (assembleDebug)...');
  execSync('.\\gradlew.bat assembleDebug', { cwd: androidDir, stdio: 'inherit' });

  console.log('\n📱 [5/5] Verificando APK gerado...');
  const apkPath = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK não encontrado em ${apkPath}`);
  }

  const stats = fs.statSync(apkPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`\n🎉 BUILD CONCLUÍDO COM SUCESSO!`);
  console.log(`   Arquivo: ${apkPath}`);
  console.log(`   Tamanho: ${sizeMb} MB (${stats.size} bytes)`);
  console.log(`   Ambiente: ANDROID CLOUD (Supabase Online / Sem dependência de IP local)\n`);
} catch (err) {
  console.error('\n❌ FALHA NO PROCESSO DE BUILD:', err.message);
  process.exit(1);
}
