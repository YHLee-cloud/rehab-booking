const express = require('express');
const crypto = require('crypto');
const { load, save } = require('../db');
const { requireAuth } = require('../session');

// 產生一組通用 CRUD 路由（給 doctors / therapists / treatmentTypes 使用）
// collectionName: db.json 中陣列欄位名稱
// fields: 允許寫入的欄位清單（白名單）
function crudFactory(collectionName, fields) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const db = load();
    res.json(db[collectionName]);
  });

  router.post('/', requireAuth, (req, res) => {
    const db = load();
    const item = { id: crypto.randomUUID(), active: true };
    for (const f of fields) {
      if (req.body[f] !== undefined) item[f] = req.body[f];
    }
    if (!item.name || !String(item.name).trim()) {
      return res.status(400).json({ error: '名稱為必填' });
    }
    db[collectionName].push(item);
    save();
    res.status(201).json(item);
  });

  router.put('/:id', requireAuth, (req, res) => {
    const db = load();
    const item = db[collectionName].find((x) => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: '找不到資料' });
    for (const f of fields) {
      if (req.body[f] !== undefined) item[f] = req.body[f];
    }
    if (req.body.active !== undefined) item.active = !!req.body.active;
    save();
    res.json(item);
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const db = load();
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '找不到資料' });
    // 為保留歷史預約完整性，採「停用」而非直接刪除
    db[collectionName][idx].active = false;
    save();
    res.json({ ok: true });
  });

  // 直接永久刪除（不可復原，僅供確定不需保留歷史關聯時使用）
  router.delete('/:id/permanent', requireAuth, (req, res) => {
    const db = load();
    const idx = db[collectionName].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '找不到資料' });
    db[collectionName].splice(idx, 1);
    save();
    res.json({ ok: true });
  });

  return router;
}

module.exports = crudFactory;
