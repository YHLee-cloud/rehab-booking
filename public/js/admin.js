// 內部維護頁面邏輯
const state = {
  me: null,
  doctors: [],
  therapists: [],
  treatmentTypes: [],
  editingTreatmentTypeId: null,
  backups: [],
  patients: [],
  selectedPatientIds: new Set(),
};

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  state.me = await requireLogin();
  if (!state.me) return;
  renderNav('admin', state.me);

  document.querySelectorAll('#admin-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#admin-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ['doctors', 'therapists', 'treatments', 'patients', 'backups', 'account', 'version'].forEach((t) => {
        document.getElementById('panel-' + t).style.display = t === btn.dataset.tab ? '' : 'none';
      });
    });
  });

  document.getElementById('add-doctor-btn').addEventListener('click', addDoctor);
  document.getElementById('add-therapist-btn').addEventListener('click', addTherapist);
  document.getElementById('add-tt-btn').addEventListener('click', addTreatmentType);
  document.getElementById('cancel-tt-edit-btn').addEventListener('click', cancelEditTreatmentType);
  document.getElementById('run-backup-btn').addEventListener('click', runBackupNow);
  document.getElementById('change-password-btn').addEventListener('click', changePassword);
  document.getElementById('patient-search-input').addEventListener('input', renderPatients);
  document.getElementById('merge-patients-btn').addEventListener('click', openMergeModal);

  await loadAll();
}

async function loadAll() {
  const [doctors, therapists, treatmentTypes, backups, patients] = await Promise.all([
    api('/doctors'),
    api('/therapists'),
    api('/treatment-types'),
    api('/backups'),
    api('/patients'),
  ]);
  state.doctors = doctors;
  state.therapists = therapists;
  state.treatmentTypes = treatmentTypes;
  state.backups = backups;
  state.patients = patients;
  renderNetworkInfo();
  refreshUpdaterStatus();
  renderDoctors();
  renderTherapists();
  renderTreatmentTypes();
  renderBackups();
  renderPatients();
}

function renderDoctors() {
  document.getElementById('doctors-body').innerHTML = state.doctors
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.active ? '<span class="badge COMPLETED">啟用</span>' : '<span class="badge CANCELLED">停用</span>'}</td>
        <td>
          ${d.active ? `<button class="btn secondary small" data-kind="doctor" data-action="disable" data-id="${d.id}">停用</button>` : `<button class="btn small" data-kind="doctor" data-action="enable" data-id="${d.id}">啟用</button>`}
          <button class="btn danger small" data-kind="doctor" data-action="delete" data-id="${d.id}" data-name="${escapeHtml(d.name)}">刪除</button>
        </td>
      </tr>`
    )
    .join('');
  wireRowActions();
}

function renderTherapists() {
  document.getElementById('therapists-body').innerHTML = state.therapists
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.name)}</td>
        <td>${t.active ? '<span class="badge COMPLETED">啟用</span>' : '<span class="badge CANCELLED">停用</span>'}</td>
        <td>
          ${t.active ? `<button class="btn secondary small" data-kind="therapist" data-action="disable" data-id="${t.id}">停用</button>` : `<button class="btn small" data-kind="therapist" data-action="enable" data-id="${t.id}">啟用</button>`}
          <button class="btn danger small" data-kind="therapist" data-action="delete" data-id="${t.id}" data-name="${escapeHtml(t.name)}">刪除</button>
        </td>
      </tr>`
    )
    .join('');
  wireRowActions();
}

function renderTreatmentTypes() {
  document.getElementById('tt-body').innerHTML = state.treatmentTypes
    .map(
      (t) => `<tr>
        <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${t.color};"></span></td>
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.code)}</td>
        <td>${fmtMoney(t.price)}</td>
        <td>${t.durationMinutes}</td>
        <td>${t.capacity || 1}</td>
        <td>${t.active ? '<span class="badge COMPLETED">啟用</span>' : '<span class="badge CANCELLED">停用</span>'}</td>
        <td>
          <button class="btn secondary small" data-edit-tt="${t.id}">編輯</button>
          ${t.active ? `<button class="btn secondary small" data-kind="tt" data-action="disable" data-id="${t.id}">停用</button>` : `<button class="btn small" data-kind="tt" data-action="enable" data-id="${t.id}">啟用</button>`}
          <button class="btn danger small" data-kind="tt" data-action="delete" data-id="${t.id}" data-name="${escapeHtml(t.name)}">刪除</button>
        </td>
      </tr>`
    )
    .join('');
  wireRowActions();
  document.querySelectorAll('button[data-edit-tt]').forEach((btn) => {
    btn.onclick = () => startEditTreatmentType(btn.dataset.editTt);
  });
}

function startEditTreatmentType(id) {
  const t = state.treatmentTypes.find((x) => x.id === id);
  if (!t) return;
  state.editingTreatmentTypeId = id;
  document.getElementById('new-tt-name').value = t.name;
  document.getElementById('new-tt-code').value = t.code || '';
  document.getElementById('new-tt-price').value = t.price;
  document.getElementById('new-tt-duration').value = t.durationMinutes;
  document.getElementById('new-tt-capacity').value = String(t.capacity || 1);
  document.getElementById('new-tt-color').value = t.color;
  document.getElementById('add-tt-btn').textContent = '儲存修改';
  document.getElementById('cancel-tt-edit-btn').style.display = '';
}

function cancelEditTreatmentType() {
  state.editingTreatmentTypeId = null;
  document.getElementById('new-tt-name').value = '';
  document.getElementById('new-tt-code').value = '';
  document.getElementById('new-tt-price').value = '';
  document.getElementById('new-tt-duration').value = '';
  document.getElementById('new-tt-capacity').value = '1';
  document.getElementById('new-tt-color').value = '#3b82f6';
  document.getElementById('add-tt-btn').textContent = '＋ 新增療程';
  document.getElementById('cancel-tt-edit-btn').style.display = 'none';
}

function closeModal() {
  document.getElementById('modal-host').innerHTML = '';
}

function renderPatients() {
  const q = document.getElementById('patient-search-input').value.trim();
  let list = state.patients.slice();
  if (q) list = list.filter((p) => p.name.includes(q) || (p.phone || '').includes(q));
  list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  const body = document.getElementById('patients-body');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:16px;">沒有符合的患者資料</td></tr>`;
  } else {
    body.innerHTML = list
      .map(
        (p) => `<tr>
          <td><input type="checkbox" class="patient-checkbox" data-id="${p.id}" ${state.selectedPatientIds.has(p.id) ? 'checked' : ''} /></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.phone) || '-'}</td>
          <td>${p.appointmentCount}</td>
          <td>${p.packageCount}</td>
        </tr>`
      )
      .join('');
  }
  document.querySelectorAll('.patient-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedPatientIds.add(cb.dataset.id);
      else state.selectedPatientIds.delete(cb.dataset.id);
      updateMergeButton();
    });
  });
  updateMergeButton();
}

function updateMergeButton() {
  const btn = document.getElementById('merge-patients-btn');
  const n = state.selectedPatientIds.size;
  btn.textContent = `合併選取的患者（${n}）`;
  btn.disabled = n < 2;
}

function openMergeModal() {
  const selected = state.patients.filter((p) => state.selectedPatientIds.has(p.id));
  if (selected.length < 2) return;
  // 預設選有最多預約/療程包紀錄的那筆作為保留對象，通常就是「正確」的那一筆
  const defaultKeep = selected.slice().sort((a, b) => (b.appointmentCount + b.packageCount) - (a.appointmentCount + a.packageCount))[0];

  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h3>合併患者資料</h3>
        <p class="hint">請選擇要「保留」的那一筆，其餘的預約與療程包紀錄會全部合併過去，重複的患者資料會被刪除。此動作無法復原。</p>
        <div id="modal-error"></div>
        <table class="data-table">
          <thead><tr><th>保留</th><th>姓名</th><th>電話</th><th>預約次數</th><th>療程包數</th></tr></thead>
          <tbody>
            ${selected
              .map(
                (p) => `<tr>
                  <td><input type="radio" name="keep-patient" value="${p.id}" ${p.id === defaultKeep.id ? 'checked' : ''} /></td>
                  <td>${escapeHtml(p.name)}</td>
                  <td>${escapeHtml(p.phone) || '-'}</td>
                  <td>${p.appointmentCount}</td>
                  <td>${p.packageCount}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="toolbar" style="margin-top:16px;">
          <button type="button" class="btn secondary" id="modal-cancel">取消</button>
          <div style="flex:1"></div>
          <button type="button" class="btn danger" id="modal-confirm-merge">確認合併</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  document.getElementById('modal-confirm-merge').addEventListener('click', async () => {
    const keepId = document.querySelector('input[name="keep-patient"]:checked').value;
    const mergeIds = selected.map((p) => p.id).filter((id) => id !== keepId);
    if (!(await confirmDialog(`確定要把其餘 ${mergeIds.length} 筆資料合併到「${selected.find((p) => p.id === keepId).name}」嗎？此動作無法復原。`))) return;
    const errorHost = document.getElementById('modal-error');
    try {
      const r = await api('/patients/merge', { method: 'POST', body: JSON.stringify({ keepId, mergeIds }) });
      closeModal();
      state.selectedPatientIds.clear();
      const msg = document.getElementById('patient-msg');
      msg.innerHTML = `<div class="success-box">已合併 ${r.mergedCount} 筆重複資料，共移轉 ${r.reassignedAppointments} 筆預約、${r.reassignedPackages} 筆療程包</div>`;
      state.patients = await api('/patients');
      renderPatients();
    } catch (e) {
      errorHost.innerHTML = `<div class="error-box">${e.message}</div>`;
    }
  });
}

let updaterPollTimer = null;

function startUpdaterPolling() {
  if (updaterPollTimer) return;
  updaterPollTimer = setInterval(refreshUpdaterStatus, 1500);
}
function stopUpdaterPolling() {
  if (updaterPollTimer) {
    clearInterval(updaterPollTimer);
    updaterPollTimer = null;
  }
}

async function refreshUpdaterStatus() {
  const host = document.getElementById('updater-section');
  if (!host) return;
  let status;
  try {
    status = await api('/app-update/status');
  } catch (e) {
    host.innerHTML = `<p class="hint">目前無法取得更新狀態</p>`;
    return;
  }
  renderUpdaterSection(status);
}

function renderUpdaterSection(status) {
  const host = document.getElementById('updater-section');
  if (!status.supported) {
    host.innerHTML = `<p class="hint">此功能僅「Windows 桌面應用程式」版本支援，透過瀏覽器連線或背景服務模式無法使用自動更新。</p>`;
    stopUpdaterPolling();
    return;
  }

  const parts = [`<p class="hint">目前版本：v${escapeHtml(status.currentVersion)}</p>`];
  if (status.status === 'downloading') {
    const percent = status.percent || 0;
    parts.push(`<p class="hint">${escapeHtml(status.message || '下載中...')}</p>`);
    parts.push(
      `<div style="background:#e2e8f0;border-radius:6px;overflow:hidden;height:10px;margin-bottom:8px;"><div style="background:var(--primary);height:100%;width:${percent}%;"></div></div>`
    );
  } else if (status.message) {
    parts.push(`<p class="hint">${escapeHtml(status.message)}</p>`);
  }

  parts.push(`<div class="toolbar">
    ${status.status === 'available' ? '<button class="btn" id="download-update-btn">下載更新</button>' : ''}
    ${status.status === 'downloaded' ? '<button class="btn success" id="install-update-btn">立即重新啟動並安裝</button>' : ''}
    <button class="btn secondary" id="check-update-btn" ${status.status === 'checking' || status.status === 'downloading' ? 'disabled' : ''}>檢查更新</button>
  </div>`);

  host.innerHTML = parts.join('');

  document.getElementById('check-update-btn').addEventListener('click', async () => {
    await api('/app-update/check', { method: 'POST' });
    await refreshUpdaterStatus();
    startUpdaterPolling();
  });
  const downloadBtn = document.getElementById('download-update-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      await api('/app-update/download', { method: 'POST' });
      await refreshUpdaterStatus();
      startUpdaterPolling();
    });
  }
  const installBtn = document.getElementById('install-update-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('確定要立即重新啟動並安裝更新嗎？請確認目前沒有其他人正在使用系統。'))) return;
      await api('/app-update/install', { method: 'POST' });
    });
  }

  if (status.status === 'checking' || status.status === 'downloading') {
    startUpdaterPolling();
  } else {
    stopUpdaterPolling();
  }
}

async function renderNetworkInfo() {
  const host = document.getElementById('network-info');
  if (!host) return;
  try {
    const info = await api('/network-info');
    if (!info.ips || info.ips.length === 0) {
      host.innerHTML = `<p class="hint">目前偵測不到區網 IP（可能沒有連接網路）。</p>`;
      return;
    }
    host.innerHTML = info.ips
      .map((ip) => `<div class="badge COMPLETED" style="font-size:14px;margin:4px 4px 4px 0;">http://${ip}:${info.port}</div>`)
      .join('');
  } catch (e) {
    host.innerHTML = '';
  }
}

function renderBackups() {
  const body = document.getElementById('backups-body');
  if (state.backups.length === 0) {
    body.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px;">尚無備份，系統每天會自動備份一次</td></tr>`;
    return;
  }
  body.innerHTML = state.backups
    .map(
      (b) => `<tr>
        <td>${fmtDateTime(b.mtime)}</td>
        <td>${fmtBytes(b.size)}</td>
        <td><button class="btn danger small" data-restore="${b.name}">復原到這一份</button></td>
      </tr>`
    )
    .join('');
  document.querySelectorAll('button[data-restore]').forEach((btn) => {
    btn.onclick = () => restoreBackup(btn.dataset.restore);
  });
}

async function runBackupNow() {
  const msg = document.getElementById('backups-msg');
  msg.innerHTML = '';
  try {
    await api('/backups/run', { method: 'POST' });
    msg.innerHTML = `<div class="success-box">已完成備份</div>`;
    state.backups = await api('/backups');
    renderBackups();
  } catch (e) {
    msg.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
}

async function restoreBackup(filename) {
  if (!(await confirmDialog(`確定要復原到這一份備份嗎？\n\n目前的資料會先自動存一份備份再進行復原，但復原後這份備份「當下」之後新增的資料就會消失，請確認時間點正確。`))) return;
  const msg = document.getElementById('backups-msg');
  msg.innerHTML = '';
  try {
    await api(`/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
    msg.innerHTML = `<div class="success-box">已復原完成，資料已套用</div>`;
    await loadAll();
  } catch (e) {
    msg.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
}

function wireRowActions() {
  document.querySelectorAll('button[data-kind]').forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const endpointMap = { doctor: '/doctors', therapist: '/therapists', tt: '/treatment-types' };
      const endpoint = endpointMap[kind];
      try {
        if (action === 'delete') {
          const name = btn.dataset.name || '';
          if (!(await confirmDialog(`確定要永久刪除「${name}」嗎？此動作無法復原，過去關聯的預約紀錄將無法再顯示其名稱。`))) return;
          await api(`${endpoint}/${id}/permanent`, { method: 'DELETE' });
        } else if (action === 'disable') {
          await api(`${endpoint}/${id}`, { method: 'DELETE' });
        } else {
          await api(`${endpoint}/${id}`, { method: 'PUT', body: JSON.stringify({ active: true }) });
        }
        await loadAll();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

async function addDoctor() {
  const input = document.getElementById('new-doctor-name');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/doctors', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function addTherapist() {
  const input = document.getElementById('new-therapist-name');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/therapists', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function addTreatmentType() {
  const name = document.getElementById('new-tt-name').value.trim();
  const code = document.getElementById('new-tt-code').value.trim();
  const price = Number(document.getElementById('new-tt-price').value);
  const durationMinutes = Number(document.getElementById('new-tt-duration').value);
  const capacity = Number(document.getElementById('new-tt-capacity').value) || 1;
  const color = document.getElementById('new-tt-color').value;
  if (!name || !price || !durationMinutes) {
    alert('請填寫療程名稱、價格、時長');
    return;
  }
  try {
    if (state.editingTreatmentTypeId) {
      await api(`/treatment-types/${state.editingTreatmentTypeId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, code, price, durationMinutes, capacity, color }),
      });
      cancelEditTreatmentType();
    } else {
      await api('/treatment-types', { method: 'POST', body: JSON.stringify({ name, code, price, durationMinutes, capacity, color }) });
      document.getElementById('new-tt-name').value = '';
      document.getElementById('new-tt-code').value = '';
      document.getElementById('new-tt-price').value = '';
      document.getElementById('new-tt-duration').value = '';
      document.getElementById('new-tt-capacity').value = '1';
    }
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  const msg = document.getElementById('account-msg');
  msg.innerHTML = '';
  try {
    await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
    msg.innerHTML = `<div class="success-box">密碼已更新</div>`;
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
  } catch (e) {
    msg.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
}

init();
