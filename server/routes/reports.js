const express = require('express');
const { load } = require('../db');
const { requireAuth } = require('../session');

const router = express.Router();

// 把一筆完成治療紀錄累加進「依人分組、底下再依療程項目分開統計」的結構
// { [人名]: { total: {count,revenue}, byTreatment: { [療程]: {count,revenue} } } }
function addToGrouped(map, key, ttName, price) {
  map[key] = map[key] || { total: { count: 0, revenue: 0 }, byTreatment: {} };
  map[key].total.count += 1;
  map[key].total.revenue += price;
  map[key].byTreatment[ttName] = map[key].byTreatment[ttName] || { count: 0, revenue: 0 };
  map[key].byTreatment[ttName].count += 1;
  map[key].byTreatment[ttName].revenue += price;
}

function buildMonthlyReport(db, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const completed = db.appointments.filter((a) => a.date.startsWith(prefix) && a.status === 'COMPLETED');

  const byTreatment = {};
  const byTherapist = {}; // { [執行人員]: { total: {count,revenue}, byTreatment: { [療程]: {count,revenue} } } }
  const byDoctor = {}; // 結構同上，依開單醫師分組
  let totalRevenue = 0;
  let totalCount = 0;

  for (const a of completed) {
    const tt = db.treatmentTypes.find((t) => t.id === a.treatmentTypeId);
    const therapist = db.therapists.find((t) => t.id === a.therapistId);
    const doctor = db.doctors.find((d) => d.id === a.doctorId);
    const ttName = tt ? tt.name : '未知療程';
    const thName = therapist ? therapist.name : '未知執行人員';
    const drName = doctor ? doctor.name : '未指定醫師';
    const price = a.price || 0;

    byTreatment[ttName] = byTreatment[ttName] || { count: 0, revenue: 0 };
    byTreatment[ttName].count += 1;
    byTreatment[ttName].revenue += price;

    addToGrouped(byTherapist, thName, ttName, price);
    addToGrouped(byDoctor, drName, ttName, price);

    totalRevenue += price;
    totalCount += 1;
  }

  const detail = completed
    .slice()
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .map((a) => {
      const tt = db.treatmentTypes.find((t) => t.id === a.treatmentTypeId);
      const therapist = db.therapists.find((t) => t.id === a.therapistId);
      const doctor = db.doctors.find((d) => d.id === a.doctorId);
      const patient = db.patients.find((p) => p.id === a.patientId);
      return {
        date: a.date,
        startTime: a.startTime,
        patientName: patient ? patient.name : '',
        treatmentTypeName: tt ? tt.name : '',
        therapistName: therapist ? therapist.name : '',
        doctorName: doctor ? doctor.name : '',
        price: a.price || 0,
        isPackageSession: !!a.packageId,
        completedAt: a.completedAt,
      };
    });

  // 當月實收（現金流）：療程包在購買當月一次認列全額，
  // 加上當月完成、且「不是用療程包扣抵」的一般治療（那些是當場收費）。
  // 這跟上面的 totalRevenue（實際服務金額，療程包分攤到每次）是兩種不同角度，兩者刻意分開列出。
  const packageSales = (db.packages || []).filter((p) => (p.purchaseDate || '').startsWith(prefix));
  const packageSalesRevenue = packageSales.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
  const walkInRevenue = completed.filter((a) => !a.packageId).reduce((sum, a) => sum + (a.price || 0), 0);
  const packageSessionRevenue = completed.filter((a) => a.packageId).reduce((sum, a) => sum + (a.price || 0), 0);

  const cashFlow = {
    packageSalesCount: packageSales.length,
    packageSalesRevenue,
    walkInRevenue,
    totalReceived: packageSalesRevenue + walkInRevenue,
    packageSessionRevenue, // 當月用療程包扣抵的服務金額（已含在 totalRevenue 內，但不是當月現金收入）
    packageSessionCount: completed.filter((a) => a.packageId).length,
  };

  return { year, month, totalRevenue, totalCount, cashFlow, byTreatment, byTherapist, byDoctor, detail };
}

router.get('/monthly', requireAuth, (req, res) => {
  const db = load();
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month) return res.status(400).json({ error: '請提供 year 與 month' });
  res.json(buildMonthlyReport(db, year, month));
});

router.get('/monthly/export.csv', requireAuth, (req, res) => {
  const db = load();
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month) return res.status(400).json({ error: '請提供 year 與 month' });
  const report = buildMonthlyReport(db, year, month);

  const rows = [];
  rows.push(['日期', '時間', '患者', '療程項目', '執行人員', '開單醫師', '金額', '付款方式']);
  for (const d of report.detail) {
    rows.push([
      d.date, d.startTime, d.patientName, d.treatmentTypeName, d.therapistName, d.doctorName, d.price,
      d.isPackageSession ? '療程包扣抵' : '單次收費',
    ]);
  }
  rows.push([]);
  rows.push(['彙總 - 依療程項目']);
  rows.push(['療程項目', '完成人次', '金額小計']);
  for (const [name, v] of Object.entries(report.byTreatment)) {
    rows.push([name, v.count, v.revenue]);
  }
  rows.push([]);
  rows.push(['彙總 - 依執行人員（各療程項目分開列出）']);
  rows.push(['執行人員', '療程項目', '完成人次', '金額小計']);
  for (const [name, v] of Object.entries(report.byTherapist)) {
    for (const [ttName, tv] of Object.entries(v.byTreatment)) {
      rows.push([name, ttName, tv.count, tv.revenue]);
    }
    rows.push([name + ' 小計', '', v.total.count, v.total.revenue]);
  }
  rows.push([]);
  rows.push(['彙總 - 依開單醫師（各療程項目分開列出）']);
  rows.push(['開單醫師', '療程項目', '完成人次', '金額小計']);
  for (const [name, v] of Object.entries(report.byDoctor)) {
    for (const [ttName, tv] of Object.entries(v.byTreatment)) {
      rows.push([name, ttName, tv.count, tv.revenue]);
    }
    rows.push([name + ' 小計', '', v.total.count, v.total.revenue]);
  }
  rows.push([]);
  rows.push(['【實際服務金額】療程包已分攤到每次治療，反映當月實際服務量']);
  rows.push(['完成治療人次', report.totalCount]);
  rows.push(['服務金額合計', report.totalRevenue]);
  rows.push(['　其中：療程包扣抵', report.cashFlow.packageSessionRevenue]);
  rows.push([]);
  rows.push(['【當月實收】反映當月實際收到的錢']);
  rows.push(['療程包銷售', report.cashFlow.packageSalesRevenue, `${report.cashFlow.packageSalesCount} 筆`]);
  rows.push(['單次收費治療', report.cashFlow.walkInRevenue]);
  rows.push(['實收合計', report.cashFlow.totalReceived]);

  const csv = rows
    .map((r) => r.map((cell) => {
      const s = String(cell === undefined || cell === null ? '' : cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(','))
    .join('\r\n');

  // 加上 UTF-8 BOM，確保 Excel 開啟中文不亂碼
  const bom = '﻿';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="monthly-report-${year}-${String(month).padStart(2, '0')}.csv"`
  );
  res.send(bom + csv);
});

module.exports = router;
