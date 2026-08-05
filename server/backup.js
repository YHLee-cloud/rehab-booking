// 手動執行一次備份。用法： node server/backup.js（或 npm run backup）
// 建議搭配作業系統排程器每日執行一次（Linux/Mac: cron；Windows: 工作排程器；
// 若部署在 Render/Zeabur 等平台，可用其 Cron Job 功能執行同一指令）。
// 註：獨立執行檔（pkg 打包版）已內建每日自動備份，不需要另外設定排程，見 server.js。
const { runBackup } = require('./backupLogic');

runBackup();
