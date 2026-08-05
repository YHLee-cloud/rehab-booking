// 移除先前安裝的 Windows 服務。
// 使用方式：以「系統管理員」身分開啟 PowerShell，於專案目錄執行：
//   npm run uninstall-windows-service
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'RehabBookingSystem',
  script: path.join(__dirname, '..', 'server', 'server.js'),
});

svc.on('uninstall', () => {
  console.log('服務已移除。');
});

svc.uninstall();
