// 報到 / 完成治療 頁面邏輯
const state = { me: null, startDate: todayStr(), endDate: todayStr(), appointments: [], treatmentTypes: [] };

function statusLabel(s) {
  return { BOOKED: '已預約', CHECKED_IN: '已報到', COMPLETED: '已完成', NO_SHOW: '未到', CANCELLED: '已取消' }[s] || s;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  state.me = await requireLogin();
  if (!state.me) return;
  renderNav('checkin', state.me);

  document.getElementById('date-start-input').value = state.startDate;
  document.getElementById('date-end-input').value = state.endDate;
  document.getElementById('date-start-input').addEventListener('change', (e) => {
    state.startDate = e.target.value;
    load();
  });
  document.getElementById('date-end-input').addEventListener('change', (e) => {
    state.endDate = e.target.value;
    load();
  });
  document.getElementById('today-only-btn').addEventListener('click', () => {
    state.startDate = todayStr();
    state.endDate = todayStr();
    document.getElementById('date-start-input').value = state.startDate;
    document.getElementById('date-end-input').value = state.endDate;
    load();
  });
  document.getElementById('this-month-btn').addEventListener('click', () => {
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const last = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;
    state.startDate = first;
    state.endDate = last;
    document.getElementById('date-start-input').value = state.startDate;
    document.getElementById('date-end-input').value = state.endDate;
    load();
  });
  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('treatment-filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);

  state.treatmentTypes = await api('/treatment-types');
  document.getElementById('treatment-filter').innerHTML =
    '<option value="">全部</option>' +
    state.treatmentTypes.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}${t.active ? '' : '（已停用）'}</option>`).join('');

  await load();
}

async function load() {
  document.getElementById('list-error').innerHTML = '';
  try {
    state.appointments = await api(
      `/appointments?startDate=${encodeURIComponent(state.startDate)}&endDate=${encodeURIComponent(state.endDate)}`
    );
  } catch (e) {
    document.getElementById('list-error').innerHTML = `<div class="error-box">${e.message}</div>`;
    state.appointments = [];
  }
  render();
}

function render() {
  const q = document.getElementById('search-input').value.trim();
  const treatmentFilter = document.getElementById('treatment-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const isSingleDay = state.startDate === state.endDate;

  // 多日檢視時要先依日期排序，同一天內再依時間排序，避免不同天的時段混在一起
  let list = state.appointments.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  if (q) list = list.filter((a) => a.patientName.includes(q));
  if (treatmentFilter) list = list.filter((a) => a.treatmentTypeId === treatmentFilter);
  if (statusFilter) list = list.filter((a) => a.status === statusFilter);

  const stats = {
    total: state.appointments.length,
    checkedIn: state.appointments.filter((a) => a.status === 'CHECKED_IN' || a.status === 'COMPLETED').length,
    completed: state.appointments.filter((a) => a.status === 'COMPLETED').length,
    pending: state.appointments.filter((a) => a.status === 'BOOKED').length,
  };
  const totalLabel = isSingleDay ? '當日總預約' : '區間總預約';
  document.getElementById('stats').innerHTML = `
    <div class="stat-box"><div class="num">${stats.total}</div><div class="label">${totalLabel}</div></div>
    <div class="stat-box"><div class="num">${stats.pending}</div><div class="label">尚未報到</div></div>
    <div class="stat-box"><div class="num">${stats.checkedIn}</div><div class="label">已報到</div></div>
    <div class="stat-box"><div class="num">${stats.completed}</div><div class="label">已完成治療</div></div>
  `;

  const body = document.getElementById('list-body');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:24px;">沒有符合的預約紀錄</td></tr>`;
    return;
  }
  body.innerHTML = list
    .map((a) => {
      const actions = [];
      if (a.status === 'BOOKED') {
        actions.push(`<button class="btn warning small" data-action="checkin" data-id="${a.id}">✓ 報到</button>`);
        actions.push(`<button class="btn secondary small" data-action="no-show" data-id="${a.id}">未到</button>`);
      }
      if (a.status === 'CHECKED_IN') {
        actions.push(`<button class="btn success small" data-action="complete" data-id="${a.id}">✓ 完成治療</button>`);
      }
      if (a.status === 'BOOKED' || a.status === 'CHECKED_IN') {
        actions.push(`<button class="btn danger small" data-action="cancel" data-id="${a.id}">取消</button>`);
      }
      actions.push(`<button class="btn danger small" data-action="delete" data-id="${a.id}">刪除資料</button>`);
      return `
        <tr>
          <td>${a.date}</td>
          <td>${a.startTime}-${a.endTime}</td>
          <td>${escapeHtml(a.patientName)}</td>
          <td>${escapeHtml(a.treatmentTypeName)}${a.packageId ? ' <span class="badge COMPLETED">療程包</span>' : ''}</td>
          <td>${escapeHtml(a.therapistName)}</td>
          <td><span class="badge ${a.status}">${statusLabel(a.status)}</span></td>
          <td>${a.checkInAt ? fmtDateTime(a.checkInAt) : '-'}</td>
          <td>${a.completedAt ? fmtDateTime(a.completedAt) : '-'}</td>
          <td style="white-space:nowrap;">${actions.join(' ')}</td>
        </tr>
      `;
    })
    .join('');

  body.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'delete') {
        if (!(await confirmDialog('確定要刪除此筆預約資料嗎？此動作無法復原，將直接從系統移除，不會保留於統計報表中。'))) return;
      }
      btn.disabled = true;
      try {
        if (action === 'delete') {
          await api(`/appointments/${id}`, { method: 'DELETE' });
        } else {
          await api(`/appointments/${id}/${action}`, { method: 'PATCH' });
        }
        await load();
      } catch (e) {
        document.getElementById('list-error').innerHTML = `<div class="error-box">${e.message}</div>`;
        btn.disabled = false;
      }
    });
  });
}

init();
