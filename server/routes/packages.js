// 療程包：患者一次購買多次療程（例如徒手治療 10 次 10000 元），
// 之後每次「完成治療」扣抵一次，剩餘次數由實際預約紀錄推算而來，
// 不另外存一個計數器，避免取消/刪除預約後次數對不上。
const express = require('express');
const crypto = require('crypto');
const { load, save } = require('../db');
const { requireAuth } = require('../session');

const router = express.Router();

// 舊資料庫沒有 packages 欄位，統一從這裡取得，避免每個地方都要防呆
function getPackages(db) {
  if (!db.packages) db.packages = [];
  return db.packages;
}

// 每次治療分攤到的金額（購買時就固定下來，之後改動療程定價不影響已售出的療程包）
function unitPriceOf(pkg) {
  if (pkg.totalSessions <= 0) return 0;
  return Math.round(pkg.totalPrice / pkg.totalSessions);
}

function computeStats(db, pkg) {
  const linked = db.appointments.filter((a) => a.packageId === pkg.id);
  const usedSessions = linked.filter((a) => a.status === 'COMPLETED').length;
  const scheduledSessions = linked.filter((a) => a.status === 'BOOKED' || a.status === 'CHECKED_IN').length;
  return {
    usedSessions,
    scheduledSessions,
    remainingSessions: Math.max(0, pkg.totalSessions - usedSessions),
    // 尚未排定 = 剩餘扣掉已經排進表但還沒做的，代表「還可以再約幾次」
    unscheduledSessions: Math.max(0, pkg.totalSessions - usedSessions - scheduledSessions),
  };
}

function enrich(db, pkg) {
  const patient = db.patients.find((p) => p.id === pkg.patientId);
  const treatmentType = db.treatmentTypes.find((t) => t.id === pkg.treatmentTypeId);
  return {
    ...pkg,
    patientName: patient ? patient.name : '(未知患者)',
    patientPhone: patient ? patient.phone : '',
    treatmentTypeName: treatmentType ? treatmentType.name : '(已刪除療程)',
    treatmentColor: treatmentType ? treatmentType.color : '#999',
    unitPrice: unitPriceOf(pkg),
    ...computeStats(db, pkg),
  };
}

// GET /api/packages?patientId=&treatmentTypeId=&onlyAvailable=true
router.get('/', requireAuth, (req, res) => {
  const db = load();
  const { patientId, treatmentTypeId, onlyAvailable } = req.query;
  let list = getPackages(db);
  if (patientId) list = list.filter((p) => p.patientId === patientId);
  if (treatmentTypeId) list = list.filter((p) => p.treatmentTypeId === treatmentTypeId);
  let result = list.map((p) => enrich(db, p));
  if (onlyAvailable === 'true') {
    // 供開單畫面使用：只列出還有次數可以排的療程包
    result = result.filter((p) => p.unscheduledSessions > 0);
  }
  result.sort((a, b) => (b.purchaseDate + b.createdAt).localeCompare(a.purchaseDate + a.createdAt));
  res.json(result);
});

// POST /api/packages
router.post('/', requireAuth, (req, res) => {
  const db = load();
  const { patientId, patientName, patientPhone, treatmentTypeId, totalSessions, totalPrice, purchaseDate, note } =
    req.body || {};

  if (!treatmentTypeId || !totalSessions || totalPrice === undefined || totalPrice === null) {
    return res.status(400).json({ error: '缺少必要欄位（療程項目、總次數、總金額）' });
  }
  const sessions = Number(totalSessions);
  const price = Number(totalPrice);
  if (!Number.isInteger(sessions) || sessions < 1) {
    return res.status(400).json({ error: '總次數必須是 1 以上的整數' });
  }
  if (!(price >= 0)) {
    return res.status(400).json({ error: '總金額不可為負數' });
  }
  const treatmentType = db.treatmentTypes.find((t) => t.id === treatmentTypeId);
  if (!treatmentType) return res.status(400).json({ error: '找不到療程項目' });

  // 找患者，若無則用 patientName 快速建立（與開單流程一致）
  let finalPatientId = patientId;
  if (!finalPatientId) {
    if (!patientName || !patientName.trim()) {
      return res.status(400).json({ error: '請選擇患者或輸入新患者姓名' });
    }
    const newPatient = { id: crypto.randomUUID(), name: patientName.trim(), phone: (patientPhone || '').trim() };
    db.patients.push(newPatient);
    finalPatientId = newPatient.id;
  }

  const pkg = {
    id: crypto.randomUUID(),
    patientId: finalPatientId,
    treatmentTypeId,
    totalSessions: sessions,
    totalPrice: price,
    purchaseDate: purchaseDate || new Date().toISOString().slice(0, 10),
    note: note || '',
    createdAt: new Date().toISOString(),
    createdBy: req.staffId,
  };
  getPackages(db).push(pkg);
  save();
  res.status(201).json(enrich(db, pkg));
});

// DELETE /api/packages/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = load();
  const list = getPackages(db);
  const idx = list.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '找不到療程包' });

  const linked = db.appointments.filter((a) => a.packageId === req.params.id);

  // 只有「已完成」的治療才真正影響過業績報表，這種才擋下刪除，避免歷史資料對不上。
  // 已預約/已報到/未到/已取消的，本來就是隨這個療程包一起建立的，刪療程包時一併清掉即可，
  // 不然「新增療程包後直接排好幾次」這個流程建出來的療程包會永遠刪不掉。
  const completedLinked = linked.filter((a) => a.status === 'COMPLETED');
  if (completedLinked.length > 0) {
    return res.status(400).json({
      error: `此療程包已有 ${completedLinked.length} 筆已完成的治療紀錄，無法刪除，以保留正確的歷史業績資料`,
    });
  }

  const pendingLinked = linked.filter((a) => a.status !== 'COMPLETED');
  pendingLinked.forEach((a) => {
    const i = db.appointments.findIndex((x) => x.id === a.id);
    if (i !== -1) db.appointments.splice(i, 1);
  });

  list.splice(idx, 1);
  save();
  res.json({ ok: true, deletedAppointments: pendingLinked.length });
});

module.exports = { router, getPackages, unitPriceOf, computeStats };
