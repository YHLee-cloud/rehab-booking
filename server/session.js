// 極簡 in-memory session（單一伺服器實例即可運作；正式環境如需多節點，
// 建議改用 Redis 或資料庫儲存 session，見 README）
const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 小時
const sessions = new Map(); // token -> { staffId, expiresAt }

function createSession(staffId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { staffId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  sessions.delete(token);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  });
  return out;
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = getSession(cookies.sid);
  if (!session) {
    return res.status(401).json({ error: '未登入或登入逾時，請重新登入' });
  }
  req.staffId = session.staffId;
  next();
}

module.exports = { createSession, getSession, destroySession, parseCookies, requireAuth };
