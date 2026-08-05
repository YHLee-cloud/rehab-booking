// 純工具函式，列出本機的區域網路 IPv4 位址。刻意獨立成檔案（不依賴 selfsigned 等套件），
// 讓 Electron 桌面版也能引用，不需要一併安裝 HTTPS 憑證相關的依賴。
const os = require('os');

function localIPv4s() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

module.exports = { localIPv4s };
