// 桌面版自動更新 API。實際的 electron-updater 邏輯掛在 electron/main.js，
// 透過 app.locals.appUpdater 橋接過來，這樣前端頁面不用管是不是在 Electron 裡執行，
// 一律呼叫這幾個一般的 API 端點即可；非桌面版（背景服務／瀏覽器連線）就回報「不支援」。
const express = require('express');
const { requireAuth } = require('../session');

const router = express.Router();

function getUpdater(req) {
  return req.app.locals.appUpdater || null;
}

router.get('/status', requireAuth, (req, res) => {
  const updater = getUpdater(req);
  if (!updater) return res.json({ supported: false });
  res.json({ supported: true, ...updater.getState() });
});

router.post('/check', requireAuth, (req, res) => {
  const updater = getUpdater(req);
  if (!updater) return res.status(400).json({ error: '此功能僅桌面版程式支援' });
  updater.checkForUpdates();
  res.json({ ok: true });
});

router.post('/download', requireAuth, (req, res) => {
  const updater = getUpdater(req);
  if (!updater) return res.status(400).json({ error: '此功能僅桌面版程式支援' });
  updater.startDownload();
  res.json({ ok: true });
});

router.post('/install', requireAuth, (req, res) => {
  const updater = getUpdater(req);
  if (!updater) return res.status(400).json({ error: '此功能僅桌面版程式支援' });
  res.json({ ok: true });
  // 這行會關閉整個程式並啟動安裝檔，放在送出回應之後
  updater.quitAndInstall();
});

module.exports = router;
