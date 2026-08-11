const express = require('express');
const crypto = require('crypto');
const { load, save } = require('../db');
const { requireAuth } = require('../session');
const { addMinutes, overlaps } = require('../time');
const { getPackages, unitPriceOf, computeStats } = require('./packages');

const router = express.Router();

function enrich(db, appt) {
  const patient = db.patients.find((p) => p.id === appt.patientId);
  const doctor = db.doctors.find((d) => d.id === appt.doctorId);
  const therapist = db.therapists.find((t) => t.id === appt.therapistId);
  const treatmentType = db.treatmentTypes.find((t) => t.id === appt.treatmentTypeId);
  const pkg = appt.packageId ? getPackages(db).find((p) => p.id === appt.packageId) : null;
  return {
    ...appt,
    patientName: patient ? patient.name : '(未知患者)',
    patientPhone: patient ? patient.phone : '',
    doctorName: doctor ? doctor.name : '',
    therapistName: therapist ? therapist.name : '',
    treatmentTypeName: treatmentType ? treatmentType.name : '',
    treatmentColor: treatmentType ? treatmentType.color : '#999',
    packageLabel: pkg ? `療程包（共 ${pkg.totalSessions} 次）` : '',
  };
}

// 檢查同一執行人員是否已有預約衝突，以及同一療程「特定欄位」（slotIndex）是否已被佔用。
// 每個療程在排程總覽上有 capacity 個並排欄位（例如徒手治療同時段 3 個），
// 每筆預約會固定記住自己屬於第幾欄（0 起算），畫面才會穩定顯示在原本被安排的那一欄，
// 不會每次重新整理就被隨機/貪婪演算法換到別欄去。
function findConflicts(db, { date, startTime, endTime, therapistId, treatmentTypeId, slotIndex, excludeId }) {
  const sameDay = db.appointments.filter(
    (a) => a.date === date && a.status !== 'CANCELLED' && a.id !== excludeId
  );
  const therapistConflicts = sameDay.filter(
    (a) => a.therapistId === therapistId && overlaps(startTime, endTime, a.startTime, a.endTime)
  );
  const slotConflicts = sameDay.filter(
    (a) =>
      a.treatmentTypeId === treatmentTypeId &&
      (a.slotIndex || 0) === slotIndex &&
      overlaps(startTime, endTime, a.startTime, a.endTime)
  );
  return { therapistConflicts, slotConflicts };
}

// 找出這個時段第一個沒有衝突的欄位（0 ~ capacity-1）；全部額滿則回傳 -1
function findAvailableSlotIndex(db, { date, startTime, endTime, treatmentTypeId, capacity, excludeId }) {
  for (let i = 0; i < capacity; i++) {
    const { slotConflicts } = findConflicts(db, { date, startTime, endTime, treatmentTypeId, slotIndex: i, excludeId });
    if (slotConflicts.length === 0) return i;
  }
  return -1;
}

// GET /api/appointments?date=YYYY-MM-DD&treatmentTypeId=xxx
// 或用 startDate/endDate 查詢一段日期範圍（供報到/完成治療頁面核對多日資料用）
router.get('/', requireAuth, (req, res) => {
  const db = load();
  const { date, startDate, endDate, treatmentTypeId } = req.query;
  let list = db.appointments;
  if (date) list = list.filter((a) => a.date === date);
  if (startDate) list = list.filter((a) => a.date >= startDate);
  if (endDate) list = list.filter((a) => a.date <= endDate);
  if (treatmentTypeId) list = list.filter((a) => a.treatmentTypeId === treatmentTypeId);
  res.json(list.map((a) => enrich(db, a)));
});

// POST /api/appointments
router.post('/', requireAuth, (req, res) => {
  const db = load();
  const { patientId, patientName, patientPhone, doctorId, treatmentTypeId, therapistId, date, startTime, note, firstTrial, eras, slotIndex, packageId, orderDate } =
    req.body || {};

  if (!treatmentTypeId || !therapistId || !date || !startTime) {
    return res.status(400).json({ error: '缺少必要欄位（療程、執行人員、日期、時間）' });
  }
  const treatmentType = db.treatmentTypes.find((t) => t.id === treatmentTypeId);
  if (!treatmentType) return res.status(400).json({ error: '找不到療程項目' });

  // 找患者，若無則用 patientName 快速建立
  let finalPatientId = patientId;
  if (!finalPatientId) {
    if (!patientName || !patientName.trim()) {
      return res.status(400).json({ error: '請選擇患者或輸入新患者姓名' });
    }
    const newPatient = { id: crypto.randomUUID(), name: patientName.trim(), phone: (patientPhone || '').trim() };
    db.patients.push(newPatient);
    finalPatientId = newPatient.id;
  }
  const finalPatient = db.patients.find((p) => p.id === finalPatientId);

  if (firstTrial) {
    finalPatient.firstTrialUsedTreatmentTypeIds = finalPatient.firstTrialUsedTreatmentTypeIds || [];
    if (finalPatient.firstTrialUsedTreatmentTypeIds.includes(treatmentTypeId)) {
      return res.status(400).json({ error: '此患者已使用過此療程的首次體驗優惠，無法再次使用' });
    }
  }

  // ERAS 優惠價：SIS 特殊優惠，固定 250 元，一輩子最多 4 次（同一次排程操作最多 2 次由前端把關）
  if (eras) {
    if (firstTrial) {
      return res.status(400).json({ error: 'ERAS優惠與首次體驗優惠不能同時使用，請擇一' });
    }
    if ((finalPatient.erasUsedCount || 0) >= 4) {
      return res.status(400).json({ error: '此患者已使用滿 4 次 ERAS優惠（一輩子上限），無法再次使用' });
    }
  }

  // 使用療程包時，金額改用療程包的每次分攤價，並檢查次數是否還夠
  let usedPackage = null;
  if (packageId) {
    usedPackage = getPackages(db).find((p) => p.id === packageId);
    if (!usedPackage) return res.status(400).json({ error: '找不到指定的療程包' });
    if (usedPackage.patientId !== finalPatientId) {
      return res.status(400).json({ error: '此療程包不屬於這位患者' });
    }
    if (usedPackage.treatmentTypeId !== treatmentTypeId) {
      return res.status(400).json({ error: '此療程包不適用於這個療程項目' });
    }
    const stats = computeStats(db, usedPackage);
    if (stats.unscheduledSessions <= 0) {
      return res.status(400).json({
        error: `此療程包已無可排定的次數（共 ${usedPackage.totalSessions} 次，已完成 ${stats.usedSessions} 次、已排定 ${stats.scheduledSessions} 次）`,
      });
    }
    if (firstTrial) {
      return res.status(400).json({ error: '首次體驗優惠與療程包不能同時使用，請擇一' });
    }
    if (eras) {
      return res.status(400).json({ error: 'ERAS優惠與療程包不能同時使用，請擇一' });
    }
  }

  const endTime = addMinutes(startTime, treatmentType.durationMinutes);
  const capacity = treatmentType.capacity || 1;

  // 有指定欄位（從排程總覽點某一欄的空格開單）就檢查那一欄是否可用；
  // 沒指定（例如用「新增預約」按鈕）就自動找第一個沒有衝突的欄位
  let finalSlotIndex = slotIndex;
  if (finalSlotIndex === undefined || finalSlotIndex === null) {
    finalSlotIndex = findAvailableSlotIndex(db, { date, startTime, endTime, treatmentTypeId, capacity });
    if (finalSlotIndex === -1) {
      return res.status(409).json({
        error: capacity > 1 ? `此療程此時段已額滿（同時段上限 ${capacity} 位），請選擇其他時間` : '此療程時段已被預約，請選擇其他時間',
        conflictType: 'TREATMENT_SLOT',
      });
    }
  } else if (finalSlotIndex < 0 || finalSlotIndex >= capacity) {
    // 前端畫面沒即時更新、點到已經不存在的欄位時的防呆
    return res.status(400).json({ error: '這個欄位已不存在，請重新整理頁面後再試一次' });
  }

  const { therapistConflicts, slotConflicts } = findConflicts(db, {
    date,
    startTime,
    endTime,
    therapistId,
    treatmentTypeId,
    slotIndex: finalSlotIndex,
  });

  if (therapistConflicts.length > 0) {
    return res.status(409).json({
      error: '該執行人員此時段已有其他預約，請選擇其他時間或執行人員',
      conflicts: therapistConflicts.map((a) => enrich(db, a)),
      conflictType: 'THERAPIST',
    });
  }
  if (slotConflicts.length > 0) {
    return res.status(409).json({
      error: capacity > 1 ? '這個欄位此時段已被預約，請選擇其他欄位或時間' : '此療程時段已被預約，請選擇其他時間',
      conflicts: slotConflicts.map((a) => enrich(db, a)),
      conflictType: 'TREATMENT_SLOT',
    });
  }

  const appt = {
    id: crypto.randomUUID(),
    patientId: finalPatientId,
    doctorId: doctorId || null,
    treatmentTypeId,
    therapistId,
    slotIndex: finalSlotIndex,
    packageId: usedPackage ? usedPackage.id : null,
    date,
    startTime,
    endTime,
    // 開單日期：給業績報表統計用，跟實際治療日期是分開的兩件事，沒填就預設用治療日期
    orderDate: orderDate || date,
    // 療程包的每次金額用購買當下分攤的單價，這樣個人業績報表仍能正確反映實際服務量
    price: usedPackage ? unitPriceOf(usedPackage) : eras ? 250 : firstTrial ? 1000 : treatmentType.price,
    isFirstTrial: !!firstTrial,
    isEras: !!eras,
    status: 'BOOKED', // BOOKED -> CHECKED_IN -> COMPLETED, or CANCELLED
    checkInAt: null,
    completedAt: null,
    note: note || '',
    createdAt: new Date().toISOString(),
    createdBy: req.staffId,
  };
  db.appointments.push(appt);
  if (firstTrial) {
    finalPatient.firstTrialUsedTreatmentTypeIds.push(treatmentTypeId);
  }
  if (eras) {
    finalPatient.erasUsedCount = (finalPatient.erasUsedCount || 0) + 1;
  }
  save();
  res.status(201).json(enrich(db, appt));
});

// PATCH /api/appointments/:id  (改期/編輯)
router.patch('/:id', requireAuth, (req, res) => {
  const db = load();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: '找不到預約' });

  const { therapistId, date, startTime, note, doctorId, orderDate } = req.body || {};
  const treatmentType = db.treatmentTypes.find((t) => t.id === appt.treatmentTypeId);
  const newTherapistId = therapistId || appt.therapistId;
  const newDate = date || appt.date;
  const newStartTime = startTime || appt.startTime;
  const newEndTime = addMinutes(newStartTime, treatmentType.durationMinutes * (appt.slotCount || 1));

  const { therapistConflicts, slotConflicts } = findConflicts(db, {
    date: newDate,
    startTime: newStartTime,
    endTime: newEndTime,
    therapistId: newTherapistId,
    treatmentTypeId: appt.treatmentTypeId,
    slotIndex: appt.slotIndex || 0,
    excludeId: appt.id,
  });
  if (therapistConflicts.length > 0) {
    return res.status(409).json({ error: '該執行人員此時段已有其他預約', conflicts: therapistConflicts.map((a) => enrich(db, a)) });
  }
  if (slotConflicts.length > 0) {
    return res.status(409).json({ error: '此欄位此時段已被預約', conflicts: slotConflicts.map((a) => enrich(db, a)) });
  }

  appt.therapistId = newTherapistId;
  appt.date = newDate;
  appt.startTime = newStartTime;
  appt.endTime = newEndTime;
  if (doctorId !== undefined) appt.doctorId = doctorId || null;
  if (note !== undefined) appt.note = note;
  if (orderDate !== undefined) appt.orderDate = orderDate || appt.date;
  save();
  res.json(enrich(db, appt));
});

router.patch('/:id/checkin', requireAuth, (req, res) => {
  const db = load();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: '找不到預約' });
  if (appt.status === 'CANCELLED') return res.status(400).json({ error: '此預約已取消' });
  appt.status = 'CHECKED_IN';
  appt.checkInAt = new Date().toISOString();
  save();
  res.json(enrich(db, appt));
});

router.patch('/:id/complete', requireAuth, (req, res) => {
  const db = load();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: '找不到預約' });
  if (appt.status === 'CANCELLED') return res.status(400).json({ error: '此預約已取消' });
  appt.status = 'COMPLETED';
  appt.completedAt = new Date().toISOString();
  save();
  res.json(enrich(db, appt));
});

router.patch('/:id/no-show', requireAuth, (req, res) => {
  const db = load();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: '找不到預約' });
  appt.status = 'NO_SHOW';
  save();
  res.json(enrich(db, appt));
});

router.patch('/:id/cancel', requireAuth, (req, res) => {
  const db = load();
  const appt = db.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: '找不到預約' });
  appt.status = 'CANCELLED';
  save();
  res.json(enrich(db, appt));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = load();
  const idx = db.appointments.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '找不到預約' });
  db.appointments.splice(idx, 1);
  save();
  res.json({ ok: true });
});

module.exports = router;
