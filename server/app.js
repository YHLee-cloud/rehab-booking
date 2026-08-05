// 建立並匯出設定好的 Express app 本體（路由、靜態前端、每日自動備份排程）。
// 獨立拆成這個檔案，是為了讓「CLI / pkg 獨立執行檔」（server.js）
// 與「Electron 桌面應用程式」（electron/main.js）可以共用同一份路由設定，
// 不需要各自維護一份、容易漏改。
const express = require('express');
const crudFactory = require('./routes/crudFactory');
const authRouter = require('./routes/auth');
const patientsRouter = require('./routes/patients');
const appointmentsRouter = require('./routes/appointments');
const reportsRouter = require('./routes/reports');
const metaRouter = require('./routes/meta');
const backupsRouter = require('./routes/backups');
const { router: packagesRouter } = require('./routes/packages');
const appUpdateRouter = require('./routes/appUpdate');
const { runBackup } = require('./backupLogic');
const { PUBLIC_DIR } = require('./paths');
const { localIPv4s } = require('./network');
const { requireAuth } = require('./session');

const app = express();

app.use(express.json());

// API 路由
app.use('/api/auth', authRouter);
app.use('/api/doctors', crudFactory('doctors', ['name']));
app.use('/api/therapists', crudFactory('therapists', ['name']));
app.use('/api/treatment-types', crudFactory('treatmentTypes', ['name', 'code', 'price', 'durationMinutes', 'color', 'capacity']));
app.use('/api/patients', patientsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/meta', metaRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/app-update', appUpdateRouter);

// 靜態前端
app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 供前端顯示「同網路其他電腦可用這個網址連線」
app.get('/api/network-info', requireAuth, (req, res) => {
  res.json({ ips: localIPv4s(), port: req.socket.localPort });
});

// 每日自動備份一次
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
setInterval(runBackup, ONE_DAY_MS);

module.exports = { app };
