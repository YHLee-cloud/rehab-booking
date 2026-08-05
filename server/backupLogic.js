// 備份核心邏輯：複製 data/db.json 加上時間戳記到 data/backups/，只保留最近 N 份。
// 供 server/backup.js（手動 / npm run backup / 雲端平台 Cron Job）
// 與 server.js（獨立執行檔內建的每日自動備份）共用。
const fs = require('fs');
const path = require('path');
const { BASE_DIR } = require('./paths');

const DATA_DIR = path.join(BASE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_LAST_N = 30; // 保留最近 30 份備份

function pad(n) { return String(n).padStart(2, '0'); }

function runBackup() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('尚無 db.json，略過備份');
    return;
  }
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const target = path.join(BACKUP_DIR, `db-${stamp}.json`);
  fs.copyFileSync(DB_FILE, target);
  console.log('已備份至', target);

  // 清理舊備份，只保留最近 N 份
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
    .sort();
  const excess = files.length - KEEP_LAST_N;
  if (excess > 0) {
    files.slice(0, excess).forEach((f) => {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log('已刪除舊備份', f);
    });
  }
}

module.exports = { runBackup };
