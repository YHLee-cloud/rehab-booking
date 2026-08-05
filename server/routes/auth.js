const express = require('express');
const { load, verifyPassword, hashPassword } = require('../db');
const { createSession, getSession, destroySession, parseCookies, requireAuth } = require('../session');
const { HTTPS_ENABLED } = require('../config');

const router = express.Router();
const SECURE_ATTR = HTTPS_ENABLED ? '; Secure' : '';

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = load();
  const staff = db.staff.find((s) => s.username === username);
  if (!staff || !verifyPassword(password || '', staff.salt, staff.hash)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }
  const token = createSession(staff.id);
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; HttpOnly; Path=/; Max-Age=${12 * 60 * 60}; SameSite=Lax${SECURE_ATTR}`
  );
  res.json({ id: staff.id, username: staff.username, displayName: staff.displayName, role: staff.role });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req);
  destroySession(cookies.sid);
  res.setHeader('Set-Cookie', `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${SECURE_ATTR}`);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const cookies = parseCookies(req);
  const session = getSession(cookies.sid);
  if (!session) return res.status(401).json({ error: '未登入' });
  const db = load();
  const staff = db.staff.find((s) => s.id === session.staffId);
  if (!staff) return res.status(401).json({ error: '未登入' });
  res.json({ id: staff.id, username: staff.username, displayName: staff.displayName, role: staff.role });
});

router.post('/change-password', requireAuth, (req, res) => {
  const db = load();
  const staff = db.staff.find((s) => s.id === req.staffId);
  if (!staff) return res.status(404).json({ error: '找不到使用者' });
  const { oldPassword, newPassword } = req.body || {};
  if (!verifyPassword(oldPassword || '', staff.salt, staff.hash)) {
    return res.status(400).json({ error: '舊密碼錯誤' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: '新密碼至少 4 碼' });
  }
  const { salt, hash } = hashPassword(newPassword);
  staff.salt = salt;
  staff.hash = hash;
  require('../db').save();
  res.json({ ok: true });
});

module.exports = router;
