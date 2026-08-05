// 把最新的 server/ 與 public/ 同步進 electron/ 資料夾，再呼叫 electron-builder 打包成 Windows 安裝檔。
// electron/ 底下的 server/、public/ 是建置時自動產生的複本，不要手動編輯，
// 要改動請改根目錄的 server/ 或 public/，再重新執行這個腳本。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT, 'electron');

function syncDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`已同步 ${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`);
}

syncDir(path.join(ROOT, 'server'), path.join(ELECTRON_DIR, 'server'));
syncDir(path.join(ROOT, 'public'), path.join(ELECTRON_DIR, 'public'));

console.log('安裝 electron 依賴套件...');
execSync('npm install', { cwd: ELECTRON_DIR, stdio: 'inherit' });

const shouldPublish = process.argv.includes('--publish');
if (shouldPublish) {
  console.log('開始打包並發布到 GitHub Releases（需要環境變數 GH_TOKEN）...');
  execSync('npm run dist:publish', { cwd: ELECTRON_DIR, stdio: 'inherit' });
  console.log('完成！已發布到 GitHub Releases，部署電腦按「檢查更新」就能抓到這個版本。');
} else {
  console.log('開始打包 Windows 安裝檔...');
  execSync('npm run dist', { cwd: ELECTRON_DIR, stdio: 'inherit' });
  console.log('完成！安裝檔在 electron/dist/ 底下。');
}
