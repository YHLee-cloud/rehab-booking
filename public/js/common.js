// 共用工具：API 呼叫、身分驗證檢查、導覽列渲染

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `發生錯誤 (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function requireLogin() {
  try {
    const me = await api('/auth/me');
    return me;
  } catch (e) {
    window.location.href = '/login.html';
    return null;
  }
}

function renderNav(activePage, me) {
  const navHost = document.getElementById('nav-host');
  if (!navHost) return;
  const items = [
    { href: '/index.html', key: 'schedule', label: '排程總覽' },
    { href: '/checkin.html', key: 'checkin', label: '報到 / 完成治療' },
    { href: '/packages.html', key: 'packages', label: '療程包' },
    { href: '/reports.html', key: 'reports', label: '月業績報表' },
    { href: '/admin.html', key: 'admin', label: '內部維護' },
  ];
  navHost.innerHTML = `
    <div class="topbar">
      <div class="brand">🏥 復健科自費療程預約系統</div>
      <div class="nav">
        ${items.map((it) => `<a href="${it.href}" class="${it.key === activePage ? 'active' : ''}">${it.label}</a>`).join('')}
      </div>
      <div class="user-box">
        <span>${me ? me.displayName + ' (' + me.username + ')' : ''}</span>
        <button class="btn secondary small" id="logout-btn">登出</button>
      </div>
    </div>
  `;
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { hour12: false });
}

function fmtMoney(n) {
  return 'NT$ ' + (n || 0).toLocaleString('zh-TW');
}

function todayStr() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 用自己畫的視窗取代瀏覽器原生 confirm()。
// 原生 confirm() 在 Windows 版桌面應用程式裡偶爾會讓 Electron 視窗卡在「顯示著但所有輸入框都沒反應」
// 的狀態，只能重開程式才能恢復（跟 electron/main.js 裡處理視窗 focus 的已知問題同類），
// 改成純 DOM 畫的對話框就不會有這個風險。
function confirmDialog(message, { confirmLabel = '確定', cancelLabel = '取消', danger = true } = {}) {
  return new Promise((resolve) => {
    const escaped = String(message || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="modal-backdrop" id="confirm-dialog-backdrop">
        <div class="modal">
          <p style="white-space:pre-line;margin-top:0;">${escaped}</p>
          <div class="toolbar" style="margin-top:16px;">
            <button type="button" class="btn secondary" id="confirm-dialog-cancel">${cancelLabel}</button>
            <div style="flex:1"></div>
            <button type="button" class="btn ${danger ? 'danger' : ''}" id="confirm-dialog-ok">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(host);
    const cleanup = (result) => {
      document.body.removeChild(host);
      resolve(result);
    };
    document.getElementById('confirm-dialog-cancel').addEventListener('click', () => cleanup(false));
    document.getElementById('confirm-dialog-ok').addEventListener('click', () => cleanup(true));
    document.getElementById('confirm-dialog-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'confirm-dialog-backdrop') cleanup(false);
    });
  });
}

function renderFooter() {
  const footer = document.createElement('div');
  footer.className = 'app-footer';
  footer.textContent = '本程式開發及維護：臺北醫學大學新國民醫院 復健科 李育豪';
  document.body.appendChild(footer);
}
renderFooter();
