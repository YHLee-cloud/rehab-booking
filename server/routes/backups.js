// 備份清單 / 立即備份 / 從備份復原
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../session');
const { DATA_DIR, DB_FILE, reloadFromDisk } = require('../db');
const { runBackup } = require('../backupLogic');

const router = express.Router();
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

router.get('/', requireAuth, (req, res) => {
  res.json(listBackups());
});

router.post('/run', requireAuth, (req, res) => {
  runBackup();
  res.json({ ok: true, backups: listBackups() });
});

router.post('/:filename/restore', requireAuth, (req, res) => {
  // 只取檔名本身，避免路徑穿越
  const filename = path.basename(req.params.filename);
  const source = path.join(BACKUP_DIR, filename);
  if (!filename.startsWith('db-') || !filename.endsWith('.json') || !fs.existsSync(source)) {
    return res.status(404).json({ error: '找不到這份備份' });
  }

  // 復原前，先把目前的資料也存一份，避免復原本身造成無法回頭
  runBackup();

  fs.copyFileSync(source, DB_FILE);
  reloadFromDisk();

  res.json({ ok: true });
});

module.exports = router;
