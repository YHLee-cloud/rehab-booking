const express = require('express');
const { load, save } = require('../db');
const { requireAuth } = require('../session');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const db = load();
  res.json(db.meta);
});

router.put('/', requireAuth, (req, res) => {
  const db = load();
  const { clinicName, openBlocks, slotIntervalMinutes } = req.body || {};
  if (clinicName) db.meta.clinicName = clinicName;
  if (Array.isArray(openBlocks)) db.meta.openBlocks = openBlocks;
  if (slotIntervalMinutes) db.meta.slotIntervalMinutes = slotIntervalMinutes;
  save();
  res.json(db.meta);
});

module.exports = router;
