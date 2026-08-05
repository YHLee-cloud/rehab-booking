const express = require('express');
const crypto = require('crypto');
const { load, save } = require('../db');
const { requireAuth } = require('../session');
const { getPackages } = require('./packages');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const db = load();
  const q = (req.query.q || '').trim();
  let list = db.patients;
  if (q) {
    list = list.filter((p) => p.name.includes(q) || (p.phone || '').includes(q));
  }
  // 合併重複患者的畫面需要用預約/療程包筆數幫忙判斷哪筆是主要資料，這裡一併算出來
  const packages = getPackages(db);
  const result = list.map((p) => ({
    ...p,
    appointmentCount: db.appointments.filter((a) => a.patientId === p.id).length,
    packageCount: packages.filter((pkg) => pkg.patientId === p.id).length,
  }));
  res.json(result);
});

router.post('/', requireAuth, (req, res) => {
  const db = load();
  const { name, phone } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '姓名為必填' });
  const patient = { id: crypto.randomUUID(), name: name.trim(), phone: (phone || '').trim() };
  db.patients.push(patient);
  save();
  res.status(201).json(patient);
});

// POST /api/patients/merge — 把打錯字造成的重複患者資料合併成一筆，
// 所有預約與療程包都改指向保留的那一筆，其餘重複資料直接刪除
router.post('/merge', requireAuth, (req, res) => {
  const db = load();
  const { keepId, mergeIds } = req.body || {};
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return res.status(400).json({ error: '請選擇要保留的患者，以及至少一筆要合併的重複資料' });
  }
  const keepPatient = db.patients.find((p) => p.id === keepId);
  if (!keepPatient) return res.status(404).json({ error: '找不到要保留的患者' });

  const mergeIdSet = new Set(mergeIds.filter((id) => id && id !== keepId));
  const mergePatients = db.patients.filter((p) => mergeIdSet.has(p.id));
  if (mergePatients.length === 0) {
    return res.status(400).json({ error: '找不到要合併的重複資料' });
  }

  let reassignedAppointments = 0;
  db.appointments.forEach((a) => {
    if (mergeIdSet.has(a.patientId)) {
      a.patientId = keepId;
      reassignedAppointments += 1;
    }
  });

  let reassignedPackages = 0;
  getPackages(db).forEach((pkg) => {
    if (mergeIdSet.has(pkg.patientId)) {
      pkg.patientId = keepId;
      reassignedPackages += 1;
    }
  });

  // 合併「首次體驗已使用」紀錄，避免合併後同一個人又能重複使用優惠
  const trialSet = new Set(keepPatient.firstTrialUsedTreatmentTypeIds || []);
  mergePatients.forEach((p) => {
    (p.firstTrialUsedTreatmentTypeIds || []).forEach((id) => trialSet.add(id));
  });
  if (trialSet.size > 0) keepPatient.firstTrialUsedTreatmentTypeIds = [...trialSet];

  // 保留的患者若沒有留電話，從被合併的資料裡補一個，避免合併後反而遺失聯絡方式
  if (!keepPatient.phone) {
    const withPhone = mergePatients.find((p) => p.phone);
    if (withPhone) keepPatient.phone = withPhone.phone;
  }

  db.patients = db.patients.filter((p) => !mergeIdSet.has(p.id));
  save();
  res.json({
    ok: true,
    mergedCount: mergePatients.length,
    reassignedAppointments,
    reassignedPackages,
  });
});

module.exports = router;
