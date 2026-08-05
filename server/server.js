// CLI / pkg 獨立執行檔進入點：以 HTTP 或 HTTPS 監聽所有網路介面（供區網內其他裝置連線）。
// Electron 桌面版不會執行這個檔案，而是由 electron/main.js 直接引用 ./app 裡的 Express app，
// 綁定在 127.0.0.1（僅本機），見 electron/main.js。
const { app } = require('./app');
const { HTTPS_ENABLED } = require('./config');

const PORT = process.env.PORT || 3000;

// 獨立執行檔被直接雙擊執行時，若發生未預期錯誤，預設 Console 視窗會「閃一下就關掉」，
// 使用者根本來不及看到錯誤訊息。這裡攔截所有未預期錯誤，印出詳細內容後暫停視窗，
// 讓使用者（或回報給開發者時）看得到實際發生了什麼事。
function pauseAndExit(code) {
  if (process.pkg) {
    try {
      console.log('\n按 Enter 鍵關閉此視窗...');
      require('fs').readSync(0, Buffer.alloc(1), 0, 1, null);
    } catch (e) {
      // 非互動環境（例如由工作排程器背景執行）沒有可讀的標準輸入，直接結束即可
    }
  }
  process.exit(code);
}

process.on('uncaughtException', (err) => {
  console.error('發生未預期的錯誤，程式即將關閉：');
  console.error(err && err.stack ? err.stack : err);
  pauseAndExit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('發生未預期的錯誤（Promise rejection），程式即將關閉：');
  console.error(err && err.stack ? err.stack : err);
  pauseAndExit(1);
});

async function start() {
  if (HTTPS_ENABLED) {
    try {
      const https = require('https');
      const { ensureCerts, localIPv4s } = require('./certs');
      const { key, cert } = await ensureCerts();
      https.createServer({ key, cert }, app).listen(PORT, () => {
        console.log(`復健科自費療程預約系統已啟動（HTTPS）： https://localhost:${PORT}`);
        localIPv4s().forEach((ip) => console.log(`  區網存取： https://${ip}:${PORT}`));
        console.log('（自簽憑證，瀏覽器第一次連線會顯示安全性警告，屬正常現象，請選擇「進階」→「繼續前往」）');
        console.log('預設管理者帳號：admin / admin123 （請登入後立即於維護介面修改密碼）');
      });
      return;
    } catch (err) {
      console.error('啟用 HTTPS 失敗，改用 HTTP 繼續啟動（診所內仍可正常使用，只是瀏覽器網址列不會顯示鎖頭）：');
      console.error(err && err.stack ? err.stack : err);
    }
  }
  app.listen(PORT, () => {
    console.log(`復健科自費療程預約系統已啟動： http://localhost:${PORT}`);
    console.log('預設管理者帳號：admin / admin123 （請登入後立即於維護介面修改密碼）');
  });
}

start().catch((err) => {
  console.error('伺服器啟動失敗：');
  console.error(err && err.stack ? err.stack : err);
  pauseAndExit(1);
});
