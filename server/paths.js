// 決定「可寫入資料」（data/）與「網頁前端靜態檔案」（public/）該放在哪裡。
// 這兩者刻意分開設定：data/ 是可寫入、需要跨版本保留的使用者資料；
// public/ 是唯讀、隨程式一起打包的靜態資源，兩者在不同封裝方式下可能位於不同位置
// （例如 Electron 版：使用者資料放在 userData 目錄，網頁檔案隨應用程式本體安裝）。
//
// 一般以原始碼執行時：兩者都在專案根目錄。
// 打包成 pkg 獨立執行檔時：__dirname 會指向唯讀的虛擬快照路徑，
// 兩者都改放到執行檔所在的實際磁碟位置旁邊。
// 打包成 Electron 應用程式時：由 electron/main.js 在 require 這個模組之前，
// 透過 REHAB_DATA_DIR / REHAB_PUBLIC_DIR 環境變數明確指定路徑。
const path = require('path');

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

const DATA_DIR_OVERRIDE = process.env.REHAB_DATA_DIR;
const PUBLIC_DIR_OVERRIDE = process.env.REHAB_PUBLIC_DIR;

const DATA_BASE_DIR = DATA_DIR_OVERRIDE || BASE_DIR;
const PUBLIC_DIR = PUBLIC_DIR_OVERRIDE || path.join(BASE_DIR, 'public');

module.exports = { BASE_DIR: DATA_BASE_DIR, PUBLIC_DIR };
