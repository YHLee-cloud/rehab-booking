// 將本系統安裝為 Windows 背景服務：開機自動啟動、程式意外中斷時自動重啟。
// 使用方式：在 Windows 上以「系統管理員」身分開啟 PowerShell，於專案目錄執行：
//   npm install
//   npm run install-windows-service
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'RehabBookingSystem',
  description: '復健科自費療程預約系統 Node.js 伺服器',
  script: path.join(__dirname, '..', 'server', 'server.js'),
  env: [
    { name: 'PORT', value: '3000' },
    { name: 'HTTPS', value: 'true' },
  ],
});

svc.on('install', () => {
  console.log('服務安裝完成，啟動中...');
  svc.start();
});
svc.on('start', () => {
  console.log('服務已啟動。之後每次開機會自動執行，可至「服務」(services.msc) 管理視窗查看名稱 RehabBookingSystem。');
});
svc.on('alreadyinstalled', () => {
  console.log('服務已經安裝過了。若要重新安裝，請先執行 npm run uninstall-windows-service。');
});

svc.install();
