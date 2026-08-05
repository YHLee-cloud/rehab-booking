// 桌面版進入點。伺服器會監聽所有網路介面（區網內其他電腦也能用瀏覽器連進來，
// 適合「同一個區網內兩台電腦共用同一份資料」的情境：其中一台當主機，另一台單純用
// 瀏覽器連過去即可，兩邊看到的是同一份資料，不需要另外同步。
// 因為只在信任的內部網路使用（不對外開放到網際網路），刻意不強制 HTTPS，
// 以降低自簽憑證帶來的瀏覽器警告與設定複雜度。
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// 必須在 require ./server/app 之前設定這兩個環境變數，
// server 端的 server/paths.js 會讀取它們來決定資料庫/靜態網頁檔案的位置。
process.env.REHAB_DATA_DIR = app.getPath('userData');
process.env.REHAB_PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = 3000;
const LISTEN_HOST = '0.0.0.0'; // 監聽所有網路介面，讓同網路其他電腦也能連線
const LOCAL_HOST = '127.0.0.1'; // 這台電腦自己開啟視窗時使用
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 自動更新：按鈕觸發才檢查/下載，避免在使用者不知情時默默佔用頻寬。
// 狀態存在這個物件裡，透過 server/routes/appUpdate.js 的 API 讓前端頁面查詢與觸發。
let updateState = { status: 'idle', currentVersion: app.getVersion(), message: '' };
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('checking-for-update', () => {
  updateState = { ...updateState, status: 'checking', message: '正在檢查更新...' };
});
autoUpdater.on('update-available', (info) => {
  updateState = { ...updateState, status: 'available', latestVersion: info.version, message: `發現新版本 v${info.version}` };
});
autoUpdater.on('update-not-available', () => {
  updateState = { ...updateState, status: 'not-available', message: '目前已是最新版本' };
});
autoUpdater.on('error', (err) => {
  updateState = { ...updateState, status: 'error', message: `更新失敗：${err.message}` };
});
autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent);
  updateState = { ...updateState, status: 'downloading', percent, message: `下載中... ${percent}%` };
});
autoUpdater.on('update-downloaded', (info) => {
  updateState = { ...updateState, status: 'downloaded', latestVersion: info.version, message: `已下載完成，可以安裝` };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(start);
}

function start() {
  app.setLoginItemSettings({ openAtLogin: true });

  const { app: expressApp } = require('./server/app');
  expressApp.locals.appUpdater = {
    getState: () => updateState,
    checkForUpdates: () => {
      autoUpdater.checkForUpdates().catch((err) => {
        updateState = { ...updateState, status: 'error', message: `檢查更新失敗：${err.message}` };
      });
    },
    startDownload: () => {
      autoUpdater.downloadUpdate().catch((err) => {
        updateState = { ...updateState, status: 'error', message: `下載更新失敗：${err.message}` };
      });
    },
    quitAndInstall: () => {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    },
  };
  const server = expressApp.listen(PORT, LISTEN_HOST, () => {
    createWindow();
    createTray();
    // 開機自動啟動時預設不彈出視窗，安靜留在工作列；使用者手動開啟才顯示主畫面
    const loginSettings = app.getLoginItemSettings();
    if (!loginSettings.wasOpenedAtLogin) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  server.on('error', (err) => {
    console.error('伺服器啟動失敗：', err);
    app.quit();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    icon: ICON_PATH,
    title: '復健科自費療程預約系統',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://${LOCAL_HOST}:${PORT}/`);

  // 保險機制：無論從哪裡呼叫 show()，都確保視窗真的拿到鍵盤焦點，
  // 否則在 Windows 上曾經發生視窗顯示了但輸入框打不了字的狀況。
  mainWindow.on('show', () => {
    mainWindow.focus();
  });

  // 關閉視窗只是隱藏到工作列，不會結束程式（背景服務常駐）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('復健科自費療程預約系統');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '開啟主畫面',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: '結束',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// 保留在背景執行（工作列圖示常駐），不要因為所有視窗關閉就結束整個程式
app.on('window-all-closed', () => {});
