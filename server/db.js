// 簡易 JSON 檔案資料層
// 正式上線建議改接 PostgreSQL（見 README 部署建議），此處以檔案儲存方便展示與快速部署。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BASE_DIR } = require('./paths');

const DATA_DIR = path.join(BASE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function seedData() {
  const now = new Date().toISOString();
  const doctors = [
    { id: crypto.randomUUID(), name: '王建民', active: true },
    { id: crypto.randomUUID(), name: '陳怡君', active: true },
    { id: crypto.randomUUID(), name: '林志豪', active: true },
  ];
  const therapists = [
    { id: crypto.randomUUID(), name: '張雅婷', active: true },
    { id: crypto.randomUUID(), name: '李承翰', active: true },
    { id: crypto.randomUUID(), name: '黃詩涵', active: true },
    { id: crypto.randomUUID(), name: '吳俊宏', active: true },
    { id: crypto.randomUUID(), name: '劉美玲', active: true },
    { id: crypto.randomUUID(), name: '許家豪', active: true },
  ];

  const sisId = crypto.randomUUID();
  const manualId = crypto.randomUUID();
  const eswtId = crypto.randomUUID();

  const treatmentTypes = [
    // capacity：同一個時段最多可同時進行幾個療程（例如徒手治療有多位人員可同時服務不同患者）
    { id: sisId, name: 'SIS超磁場治療', code: 'SIS', price: 1200, durationMinutes: 30, color: '#3b82f6', capacity: 1, active: true },
    { id: manualId, name: '徒手治療', code: 'MANUAL', price: 1500, durationMinutes: 40, color: '#10b981', capacity: 1, active: true },
    { id: eswtId, name: '體外震波治療', code: 'ESWT', price: 2000, durationMinutes: 20, color: '#f59e0b', capacity: 1, active: true },
  ];

  const patients = [
    { id: crypto.randomUUID(), name: '陳大明', phone: '0912345678' },
    { id: crypto.randomUUID(), name: '林小美', phone: '0922333444' },
  ];

  const { salt, hash } = hashPassword('admin123');
  const staff = [
    { id: crypto.randomUUID(), username: 'admin', displayName: '系統管理員', role: 'ADMIN', salt, hash },
  ];

  return {
    meta: {
      clinicName: '示範復健科診所',
      openBlocks: [
        { start: '08:00', end: '17:00' },
      ],
      slotIntervalMinutes: 15,
      createdAt: now,
    },
    doctors,
    therapists,
    treatmentTypes,
    patients,
    appointments: [],
    packages: [], // 療程包：患者一次購買多次療程，之後每次治療扣抵一次
    staff,
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(seedData(), null, 2), 'utf8');
  }
}

let cache = null;

function load() {
  ensureDb();
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  return cache;
}

function save() {
  // 寫入前先備份一份（保留最近一次備份，簡易保護避免寫入中斷損毀資料）
  try {
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
    }
  } catch (e) {
    // ignore backup errors
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function resetToSeed() {
  cache = seedData();
  save();
  return cache;
}

// 從硬碟重新讀取（例如復原備份後），讓執行中的伺服器立即套用，不需要重新啟動
function reloadFromDisk() {
  cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return cache;
}

module.exports = { load, save, hashPassword, verifyPassword, resetToSeed, reloadFromDisk, DATA_DIR, DB_FILE };
