// 療程包頁面邏輯（僅供查詢；新增療程包請於「排程總覽」頁面操作，建立後可直接接著排定時段）
const state = { me: null, packages: [] };

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  state.me = await requireLogin();
  if (!state.me) return;
  renderNav('packages', state.me);

  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('filter-select').addEventListener('change', render);

  await loadAll();
}

async function loadAll() {
  document.getElementById('list-error').innerHTML = '';
  try {
    state.packages = await api('/packages');
  } catch (e) {
    document.getElementById('list-error').innerHTML = `<div class="error-box">${e.message}</div>`;
    return;
  }
  render();
}

function render() {
  const q = document.getElementById('search-input').value.trim();
  const filter = document.getElementById('filter-select').value;

  let list = state.packages.slice();
  if (q) list = list.filter((p) => p.patientName.includes(q));
  if (filter === 'remaining') list = list.filter((p) => p.remainingSessions > 0);

  const stats = {
    activeCount: state.packages.filter((p) => p.remainingSessions > 0).length,
    remainingTotal: state.packages.reduce((n, p) => n + p.remainingSessions, 0),
    unscheduledTotal: state.packages.reduce((n, p) => n + p.unscheduledSessions, 0),
  };
  document.getElementById('stats').innerHTML = `
    <div class="stat-box"><div class="num">${stats.activeCount}</div><div class="label">尚未用完的療程包</div></div>
    <div class="stat-box"><div class="num">${stats.remainingTotal}</div><div class="label">剩餘總次數（含已排定）</div></div>
    <div class="stat-box"><div class="num">${stats.unscheduledTotal}</div><div class="label">還可以再約的次數</div></div>
  `;

  const body = document.getElementById('list-body');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#94a3b8;padding:24px;">沒有符合的療程包</td></tr>`;
    return;
  }
  body.innerHTML = list
    .map((p) => {
      const usedUp = p.remainingSessions === 0;
      return `<tr${usedUp ? ' style="opacity:0.55;"' : ''}>
        <td>${escapeHtml(p.patientName)}</td>
        <td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.treatmentColor};margin-right:5px;"></span>${escapeHtml(p.treatmentTypeName)}</td>
        <td>${p.purchaseDate}</td>
        <td>${p.totalSessions}</td>
        <td>${p.usedSessions}</td>
        <td>${p.scheduledSessions}</td>
        <td><strong style="font-size:16px;color:${usedUp ? 'var(--muted)' : 'var(--primary-dark)'};">${p.unscheduledSessions}</strong>
            ${usedUp ? '<span class="badge CANCELLED">已用完</span>' : ''}</td>
        <td>${fmtMoney(p.totalPrice)}</td>
        <td>${fmtMoney(p.unitPrice)}</td>
        <td>${escapeHtml(p.note) || '-'}</td>
        <td><button class="btn danger small" data-delete="${p.id}" data-name="${escapeHtml(p.patientName)}">刪除</button></td>
      </tr>`;
    })
    .join('');

  body.querySelectorAll('button[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`確定要刪除「${btn.dataset.name}」的這個療程包嗎？\n\n此動作無法復原，若這個療程包底下有還沒完成的預約（已預約/已報到/未到/已取消），會一併被刪除。`)) return;
      btn.disabled = true;
      const errorHost = document.getElementById('list-error');
      errorHost.innerHTML = '';
      try {
        const r = await api(`/packages/${btn.dataset.delete}`, { method: 'DELETE' });
        await loadAll();
        if (r.deletedAppointments > 0) {
          document.getElementById('list-error').innerHTML = `<div class="success-box">已刪除療程包，同時移除了 ${r.deletedAppointments} 筆未完成的預約</div>`;
        }
      } catch (e) {
        // 錯誤訊息放在清單上方，用 alert 再提醒一次，避免因為位置在畫面外而被忽略
        errorHost.innerHTML = `<div class="error-box">${e.message}</div>`;
        errorHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
        alert(e.message);
        btn.disabled = false;
      }
    });
  });
}

init();
