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

function renderFooter() {
  const footer = document.createElement('div');
  footer.className = 'app-footer';
  footer.textContent = '本程式開發及維護：臺北醫學大學新國民醫院 復健科 李育豪';
  document.body.appendChild(footer);
}
renderFooter();
