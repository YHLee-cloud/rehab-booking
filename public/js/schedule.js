// 排程總覽頁面邏輯
const state = {
  me: null,
  meta: null,
  treatmentTypes: [],
  doctors: [],
  therapists: [],
  activeTreatmentTypeId: null,
  date: todayStr(),
  appointments: [],
};

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function buildTimeSlots(intervalMinutes) {
  const slots = [];
  const interval = intervalMinutes || 15;
  for (const block of state.meta.openBlocks) {
    let t = toMin(block.start);
    const end = toMin(block.end);
    while (t < end) {
      slots.push(toHHMM(t));
      t += interval;
    }
  }
  return slots;
}

async function init() {
  state.me = await requireLogin();
  if (!state.me) return;
  renderNav('schedule', state.me);

  const [meta, treatmentTypes, doctors, therapists] = await Promise.all([
    api('/meta'),
    api('/treatment-types'),
    api('/doctors'),
    api('/therapists'),
  ]);
  state.meta = meta;
  state.treatmentTypes = treatmentTypes.filter((t) => t.active);
  state.doctors = doctors.filter((d) => d.active);
  state.therapists = therapists.filter((t) => t.active);
  state.activeTreatmentTypeId = state.treatmentTypes[0] && state.treatmentTypes[0].id;

  document.getElementById('date-input').value = state.date;
  document.getElementById('date-input').addEventListener('change', (e) => {
    state.date = e.target.value;
    loadAndRender();
  });
  document.getElementById('prev-day').addEventListener('click', () => shiftDate(-1));
  document.getElementById('next-day').addEventListener('click', () => shiftDate(1));
  document.getElementById('today-btn').addEventListener('click', () => {
    state.date = todayStr();
    document.getElementById('date-input').value = state.date;
    loadAndRender();
  });
  document.getElementById('new-appt-btn').addEventListener('click', () => openBookingModal({}));
  document.getElementById('new-package-btn').addEventListener('click', () => openPackageModal());

  renderTabs();
  renderLegend();
  await loadAndRender();
}

function shiftDate(delta) {
  const d = new Date(state.date + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const pad = (x) => String(x).padStart(2, '0');
  state.date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  document.getElementById('date-input').value = state.date;
  loadAndRender();
}

function renderTabs() {
  const host = document.getElementById('treatment-tabs');
  host.innerHTML = state.treatmentTypes
    .map(
      (t) => `<button class="tab-btn ${t.id === state.activeTreatmentTypeId ? 'active' : ''}"
        style="${t.id === state.activeTreatmentTypeId ? `background:${t.color};border-color:${t.color}` : ''}"
        data-id="${t.id}">${t.name}</button>`
    )
    .join('');
  host.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTreatmentTypeId = btn.dataset.id;
      renderTabs();
      loadAndRender();
    });
  });
}

function renderLegend() {
  document.getElementById('legend').innerHTML = `
    <span><span class="dot" style="background:#fff;border:1px solid #cbd5e1"></span>可預約</span>
    <span><span class="badge BOOKED">已預約</span></span>
    <span><span class="badge CHECKED_IN">已報到</span></span>
    <span><span class="badge COMPLETED">已完成</span></span>
    <span><span class="badge NO_SHOW">未到/取消</span></span>
  `;
}

async function loadAndRender() {
  document.getElementById('grid-error').innerHTML = '';
  try {
    state.appointments = await api(
      `/appointments?date=${encodeURIComponent(state.date)}&treatmentTypeId=${encodeURIComponent(state.activeTreatmentTypeId)}`
    );
  } catch (e) {
    document.getElementById('grid-error').innerHTML = `<div class="error-box">${e.message}</div>`;
    state.appointments = [];
  }
  renderGrid();
}

function renderGrid() {
  const table = document.getElementById('schedule-table');
  const treatmentType = state.treatmentTypes.find((t) => t.id === state.activeTreatmentTypeId);
  const interval = treatmentType.durationMinutes;
  const slots = buildTimeSlots(interval);

  // 已取消的預約視同沒有預約，讓時段可以重新安排（跟後端衝突檢查的邏輯一致）
  const activeAppointments = state.appointments.filter((a) => a.status !== 'CANCELLED');
  const columns = assignAppointmentColumns(activeAppointments, treatmentType.capacity || 1);

  let html = '<thead><tr><th class="time-col">時間</th>';
  columns.forEach((_, i) => {
    // 只有一欄時直接顯示療程名稱；多欄時加上編號方便辨識是第幾個位置
    const label = columns.length === 1 ? treatmentType.name : `${treatmentType.name} ${i + 1}`;
    html += `<th style="background:${treatmentType.color}22">${escapeHtml(label)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // coveredUntil[i] = 分鐘數，表示第 i 欄被某預約佔用到這個時間點(不含)
  const coveredUntil = columns.map(() => -1);

  slots.forEach((slotTime) => {
    const slotMin = toMin(slotTime);
    html += `<tr><td class="time-col">${slotTime}</td>`;
    columns.forEach((colAppts, i) => {
      if (coveredUntil[i] > slotMin) {
        // 被上一列的預約 rowspan 涵蓋，這一欄不需輸出 td
        return;
      }
      // 用「落在這個時段區間內」而非「開始時間完全相等」來比對，
      // 這樣即使療程時長被調整過、舊預約的開始時間沒有對齊新的時段切點，
      // 該筆預約仍會顯示出來，不會在畫面上憑空消失。
      const appt = colAppts.find((a) => toMin(a.startTime) >= slotMin && toMin(a.startTime) < slotMin + interval);
      if (appt) {
        const span = Math.max(1, Math.round((toMin(appt.endTime) - toMin(appt.startTime)) / interval));
        coveredUntil[i] = toMin(appt.endTime);
        html += `<td rowspan="${span}"><div class="appt-cell status-${appt.status}" style="background:${treatmentType.color}" data-appt-id="${appt.id}">
          <span class="p-name">${escapeHtml(appt.patientName)}</span>
          <span class="t-name">執行人員：${escapeHtml(appt.therapistName)}</span>
          <span class="t-name">${appt.startTime}-${appt.endTime}</span>
        </div></td>`;
      } else {
        html += `<td><div class="slot empty" data-time="${slotTime}" data-slot-index="${i}"></div></td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;

  table.querySelectorAll('.slot.empty').forEach((el) => {
    el.addEventListener('click', () => {
      openBookingModal({ startTime: el.dataset.time, slotIndex: Number(el.dataset.slotIndex) });
    });
  });
  table.querySelectorAll('.appt-cell').forEach((el) => {
    el.addEventListener('click', () => {
      const appt = state.appointments.find((a) => a.id === el.dataset.apptId);
      if (appt) openDetailModal(appt);
    });
  });
}

// 把當日預約分配到 capacity 個欄位裡（同一欄內的預約時間不重疊），
// 讓「同時段可同時進行多個療程」的情況能以並排的欄位呈現。
// 每筆預約有自己記住的 slotIndex（在哪一欄開的單就固定顯示在哪一欄，
// 不會每次重新整理就被貪婪演算法換到別欄），沒有 slotIndex 的舊資料當作第 0 欄。
function assignAppointmentColumns(appointments, capacity) {
  const cap = Math.max(1, capacity);
  const sorted = appointments.slice().sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const columns = [];
  const columnEnd = []; // columnEnd[i] = 第 i 欄目前被佔用到的分鐘數
  for (let i = 0; i < cap; i++) {
    columns.push([]);
    columnEnd.push(-1);
  }

  const leftover = [];
  sorted.forEach((appt) => {
    const idx = typeof appt.slotIndex === 'number' ? appt.slotIndex : 0;
    const start = toMin(appt.startTime);
    if (idx >= 0 && idx < cap && columnEnd[idx] <= start) {
      columns[idx].push(appt);
      columnEnd[idx] = toMin(appt.endTime);
    } else {
      leftover.push(appt);
    }
  });

  // 少數放不進原本欄位的情況（例如同時段數量後來被調小、或舊資料沒有 slotIndex 剛好撞期），
  // 用貪婪演算法找空位，找不到才多開一欄，確保資料不會在畫面上憑空消失
  leftover.forEach((appt) => {
    const start = toMin(appt.startTime);
    let idx = columnEnd.findIndex((end) => end <= start);
    if (idx === -1) {
      columns.push([]);
      columnEnd.push(-1);
      idx = columns.length - 1;
    }
    columns[idx].push(appt);
    columnEnd[idx] = toMin(appt.endTime);
  });

  return columns;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function closeModal() {
  document.getElementById('modal-host').innerHTML = '';
}

// 新增療程包，建立完成後直接接續開啟預約視窗，讓操作人員一口氣把次數排進表裡
async function openPackageModal() {
  const patients = await api('/patients');
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h3>新增療程包</h3>
        <p class="hint">患者一次購買多次療程，之後每次「完成治療」自動扣抵一次。建立後會接著讓你直接排定時段。</p>
        <div id="modal-error"></div>
        <form id="package-form">
          <div class="form-grid">
            <div class="field full">
              <label>患者 *（可搜尋既有患者，或輸入新姓名自動建檔）</label>
              <input list="pkg-patient-list" id="pf-patient" placeholder="輸入姓名..." autocomplete="off" required />
              <datalist id="pkg-patient-list">
                ${patients.map((p) => `<option data-id="${p.id}" value="${escapeHtml(p.name)}">${escapeHtml(p.phone || '')}</option>`).join('')}
              </datalist>
            </div>
            <div class="field">
              <label>聯絡電話（新患者選填）</label>
              <input type="text" id="pf-phone" />
            </div>
            <div class="field">
              <label>療程項目 *</label>
              <select id="pf-treatment">
                ${state.treatmentTypes
                  .map((t) => `<option value="${t.id}" ${t.id === state.activeTreatmentTypeId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="field">
              <label>總次數 *</label>
              <input type="number" id="pf-sessions" min="1" step="1" placeholder="例如 10" required />
            </div>
            <div class="field">
              <label>總金額 *（自動計算，可改優惠價）</label>
              <input type="number" id="pf-price" min="0" step="1" placeholder="例如 10000" required />
            </div>
            <div class="field">
              <label>購買日期 *</label>
              <input type="date" id="pf-purchase-date" value="${todayStr()}" required />
            </div>
            <div class="field">
              <label>備註</label>
              <input type="text" id="pf-note" />
            </div>
            <div class="field full">
              <div class="toolbar" style="margin-bottom:6px;">
                <button type="button" class="btn secondary small" id="pf-recalc-btn">↻ 以單次定價重新計算</button>
              </div>
              <span class="hint" id="pf-price-hint"></span>
            </div>
          </div>
          <div class="toolbar" style="margin-top:16px;">
            <button type="button" class="btn secondary" id="modal-cancel">取消</button>
            <div style="flex:1"></div>
            <button type="submit" class="btn">建立並開始排程</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  // 總金額依「單次定價 × 次數」自動帶入，但使用者改成優惠價後就不再覆蓋
  let lastAutoPrice = null;
  function autoFillPrice({ force = false } = {}) {
    const tt = state.treatmentTypes.find((t) => t.id === document.getElementById('pf-treatment').value);
    const sessions = Number(document.getElementById('pf-sessions').value);
    const priceInput = document.getElementById('pf-price');
    if (tt && sessions > 0) {
      const auto = tt.price * sessions;
      const current = priceInput.value.trim();
      if (force || current === '' || Number(current) === lastAutoPrice) {
        priceInput.value = auto;
        lastAutoPrice = auto;
      }
    }
    renderPriceHint();
  }
  function renderPriceHint() {
    const tt = state.treatmentTypes.find((t) => t.id === document.getElementById('pf-treatment').value);
    const sessions = Number(document.getElementById('pf-sessions').value);
    const priceRaw = document.getElementById('pf-price').value.trim();
    const price = Number(priceRaw);
    const hintHost = document.getElementById('pf-price-hint');
    if (!(sessions > 0) || priceRaw === '' || !(price >= 0)) {
      hintHost.innerHTML = tt ? `此療程單次定價 ${fmtMoney(tt.price)}，填入次數後會自動計算總金額` : '';
      return;
    }
    const parts = [];
    if (tt) {
      const listPrice = tt.price * sessions;
      parts.push(`單次定價 ${fmtMoney(tt.price)} × ${sessions} 次 ＝ 原價 ${fmtMoney(listPrice)}`);
      const diff = listPrice - price;
      if (diff > 0) {
        const percent = listPrice > 0 ? Math.round((price / listPrice) * 1000) / 100 : 0;
        parts.push(`<span style="color:var(--success);font-weight:600;">優惠 ${fmtMoney(diff)}（約 ${percent.toFixed(1)} 折）</span>`);
      } else if (diff < 0) {
        parts.push(`<span style="color:var(--danger);font-weight:600;">高於原價 ${fmtMoney(-diff)}</span>`);
      }
    }
    parts.push(`每次治療分攤 ${fmtMoney(Math.round(price / sessions))}`);
    hintHost.innerHTML = parts.join('　｜　');
  }
  document.getElementById('pf-treatment').addEventListener('change', () => autoFillPrice());
  document.getElementById('pf-sessions').addEventListener('input', () => autoFillPrice());
  document.getElementById('pf-price').addEventListener('input', renderPriceHint);
  document.getElementById('pf-recalc-btn').addEventListener('click', () => autoFillPrice({ force: true }));
  autoFillPrice();

  document.getElementById('package-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorHost = document.getElementById('modal-error');
    errorHost.innerHTML = '';
    const patientInput = document.getElementById('pf-patient').value.trim();
    const patientOption = Array.from(document.getElementById('pkg-patient-list').options).find((o) => o.value === patientInput);
    const payload = {
      patientId: patientOption ? patientOption.dataset.id : undefined,
      patientName: patientOption ? undefined : patientInput,
      patientPhone: document.getElementById('pf-phone').value.trim(),
      treatmentTypeId: document.getElementById('pf-treatment').value,
      totalSessions: Number(document.getElementById('pf-sessions').value),
      totalPrice: Number(document.getElementById('pf-price').value),
      purchaseDate: document.getElementById('pf-purchase-date').value,
      note: document.getElementById('pf-note').value.trim(),
    };
    try {
      const pkg = await api('/packages', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      // 療程包若不是目前分頁的療程，先切到對應分頁，排程畫面才對得起來
      if (state.activeTreatmentTypeId !== pkg.treatmentTypeId) {
        state.activeTreatmentTypeId = pkg.treatmentTypeId;
        renderTabs();
      }
      await loadAndRender();
      // 接著直接開預約視窗，患者/療程包都帶好，並預設進入多時段模式
      await openBookingModal({
        patientId: pkg.patientId,
        patientName: pkg.patientName,
        packageId: pkg.id,
        multiSlot: true,
        slotCount: pkg.totalSessions,
      });
    } catch (err) {
      errorHost.innerHTML = `<div class="error-box">${err.message}</div>`;
    }
  });
}

async function openBookingModal(prefill) {
  const treatmentType = state.treatmentTypes.find((t) => t.id === state.activeTreatmentTypeId);
  const patients = await api('/patients');

  // 時間欄位固定只列出診所營業時段內、依療程時長切好的有效時間點，避免手動輸入打錯或選到營業時間外
  const validTimeSlots = buildTimeSlots(treatmentType.durationMinutes);
  function timeOptions(selected) {
    return (
      `<option value="">請選擇</option>` +
      validTimeSlots.map((t) => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('')
    );
  }

  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <h3>新增預約 - ${treatmentType.name}</h3>
        <div id="modal-error"></div>
        <form id="booking-form">
          <div class="form-grid">
            <div class="field full">
              <label>患者${prefill.patientId ? '（剛建立療程包的患者，此處不可更改）' : '（可搜尋既有患者，或輸入新姓名自動建檔）'}</label>
              <input list="patient-list" id="f-patient" placeholder="輸入姓名..." autocomplete="off" required
                     value="${escapeHtml(prefill.patientName || '')}" ${prefill.patientId ? 'readonly style="background:#f1f5f9;"' : ''} />
              <datalist id="patient-list">
                ${patients.map((p) => `<option data-id="${p.id}" value="${p.name}">${p.phone || ''}</option>`).join('')}
              </datalist>
            </div>
            <div class="field">
              <label>聯絡電話（新患者選填）</label>
              <input type="text" id="f-phone" />
            </div>
            <div class="field">
              <label>開單醫師</label>
              <select id="f-doctor">
                <option value="">（未指定）</option>
                ${state.doctors.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>開單日期</label>
              <input type="date" id="f-order-date" value="${state.date}" />
            </div>
            <div class="field">
              <label>執行人員 *</label>
              <select id="f-therapist" required>
                <option value="">請選擇</option>
                ${state.therapists.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="field full" id="package-field" style="display:none;">
              <label>療程包</label>
              <select id="f-package"></select>
              <span class="hint" id="package-hint"></span>
            </div>
            <div class="field full">
              <label style="display:flex;align-items:center;gap:6px;font-weight:400;">
                <input type="checkbox" id="f-multi-slot" style="width:auto;" />
                同一位患者一次預約多個時段（可跨不同日期）
              </label>
            </div>
            <div id="single-slot-fields" class="field full" style="display:contents;">
              <div class="field">
                <label>日期 *</label>
                <input type="date" id="f-date" value="${state.date}" required />
              </div>
              <div class="field">
                <label>開始時間 * (療程時長 ${treatmentType.durationMinutes} 分鐘)</label>
                <select id="f-time" required>${timeOptions(prefill.startTime)}</select>
              </div>
              ${
                treatmentType.code === 'SIS'
                  ? `<div class="field">
                      <label>&nbsp;</label>
                      <label style="display:flex;align-items:center;gap:6px;font-weight:400;">
                        <input type="checkbox" id="f-first-trial" style="width:auto;" />
                        首次體驗（金額固定 NT$1,000）
                      </label>
                      <span class="hint" id="first-trial-hint" style="display:none;color:var(--danger);">此患者已使用過首次體驗優惠，無法再次使用</span>
                    </div>
                    <div class="field">
                      <label>&nbsp;</label>
                      <label style="display:flex;align-items:center;gap:6px;font-weight:400;">
                        <input type="checkbox" id="f-eras" style="width:auto;" />
                        ERAS優惠價（金額固定 NT$250）
                      </label>
                      <span class="hint" id="eras-hint">一位患者一輩子最多 4 次，同一次排程操作最多約 2 次</span>
                    </div>`
                  : ''
              }
            </div>
            <div id="multi-slot-fields" class="field full" style="display:none;">
              <label>預約時段（可分別指定不同日期與時間，療程時長固定為 ${treatmentType.durationMinutes} 分鐘）</label>
              <div class="toolbar" style="margin-bottom:8px;">
                <div class="field" style="max-width:140px;margin-bottom:0;">
                  <label style="font-size:12px;">統一時間</label>
                  <select id="unify-time-input">${timeOptions(prefill.startTime)}</select>
                </div>
                <button type="button" class="btn secondary small" id="apply-unify-time-btn" style="align-self:flex-end;">套用到全部時段</button>
                <span class="hint" style="align-self:flex-end;">設定後新增的時段也會自動套用，個別時段仍可再自行調整</span>
              </div>
              <div id="multi-slot-rows"></div>
              <button type="button" class="btn secondary small" id="add-slot-row-btn" style="margin-top:6px;">＋ 新增時段</button>
            </div>
            <div class="field full">
              <label>備註</label>
              <input type="text" id="f-note" />
            </div>
          </div>
          <div class="toolbar" style="margin-top:16px;">
            <button type="button" class="btn secondary" id="modal-cancel">取消</button>
            <div style="flex:1"></div>
            <button type="submit" class="btn">確認預約</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  // ERAS 優惠：一位患者一輩子最多 4 次，同一次排程操作（多時段表單）最多勾選 2 次。
  // erasRemaining 由 onPatientChanged() 依患者已使用次數更新，這裡的上限取兩者中較小值。
  let erasRemaining = 4;
  function enforceMultiSlotErasLimit() {
    const boxes = Array.from(document.querySelectorAll('#multi-slot-rows .slot-eras'));
    const maxAllowed = Math.min(2, erasRemaining);
    const checkedCount = boxes.filter((b) => b.checked).length;
    boxes.forEach((b) => {
      if (!b.checked) b.disabled = checkedCount >= maxAllowed;
    });
  }

  // 多時段預約：切換單一日期/時間欄位 <-> 可重複新增的時段列表
  // 新增時段時，日期/時間預設帶入第一個時段的值，使用者只需要視需要調整（通常只改日期）
  function addSlotRow(date, time) {
    const rows = document.getElementById('multi-slot-rows');
    const firstRow = rows.children[0];
    const unifyTimeInput = document.getElementById('unify-time-input');
    const d = date !== undefined ? date : firstRow ? firstRow.querySelector('.slot-date').value : state.date;
    // 時間優先套用「統一時間」欄位的值，讓新增的時段不用每次重打，仍可事後個別修改
    const t = time !== undefined ? time : (unifyTimeInput && unifyTimeInput.value) || (firstRow ? firstRow.querySelector('.slot-time').value : '');
    const row = document.createElement('div');
    row.className = 'toolbar';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input type="date" class="slot-date" value="${d || state.date}" />
      <select class="slot-time">${timeOptions(t)}</select>
      ${
        treatmentType.code === 'SIS'
          ? `<label style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:400;white-space:nowrap;">
               <input type="checkbox" class="slot-eras" style="width:auto;" /> ERAS優惠
             </label>`
          : ''
      }
      <button type="button" class="btn danger small remove-slot-row-btn">移除</button>
    `;
    rows.appendChild(row);
    row.querySelector('.remove-slot-row-btn').addEventListener('click', () => {
      row.remove();
      enforceMultiSlotErasLimit();
    });
    const erasBox = row.querySelector('.slot-eras');
    if (erasBox) erasBox.addEventListener('change', enforceMultiSlotErasLimit);
    enforceMultiSlotErasLimit();
  }
  document.getElementById('add-slot-row-btn').addEventListener('click', () => addSlotRow());
  document.getElementById('apply-unify-time-btn').addEventListener('click', () => {
    const t = document.getElementById('unify-time-input').value;
    if (!t) return;
    document.querySelectorAll('#multi-slot-rows .slot-time').forEach((el) => {
      el.value = t;
    });
  });
  // 從療程包接續過來時，直接依購買次數準備對應數量的時段列（上限 20 列避免表單過長）
  const initialRowCount = Math.min(Math.max(prefill.slotCount || 2, 2), 20);
  addSlotRow(state.date, prefill.startTime);
  for (let i = 1; i < initialRowCount; i++) addSlotRow();

  document.getElementById('f-multi-slot').addEventListener('change', (e) => {
    document.getElementById('single-slot-fields').style.display = e.target.checked ? 'none' : 'contents';
    document.getElementById('multi-slot-fields').style.display = e.target.checked ? '' : 'none';
    document.getElementById('f-date').required = !e.target.checked;
    document.getElementById('f-time').required = !e.target.checked;
  });

  const firstTrialCheckbox = document.getElementById('f-first-trial');
  const erasCheckbox = document.getElementById('f-eras');
  // 首次體驗跟 ERAS優惠是兩種不同的特殊價，同一筆預約只能擇一使用
  if (firstTrialCheckbox && erasCheckbox) {
    firstTrialCheckbox.addEventListener('change', () => {
      if (firstTrialCheckbox.checked) erasCheckbox.checked = false;
    });
    erasCheckbox.addEventListener('change', () => {
      if (erasCheckbox.checked) firstTrialCheckbox.checked = false;
    });
  }

  // 選到既有患者時，查詢他這個療程還有沒有可用的療程包，有的話讓操作人員選擇扣抵
  async function onPatientChanged() {
    // 從療程包接續過來時患者已鎖定，直接用 id 對應，避免同名患者比對錯人
    let patient = null;
    if (prefill.patientId) {
      patient = patients.find((p) => p.id === prefill.patientId) || null;
    } else {
      const value = document.getElementById('f-patient').value.trim();
      const opt = Array.from(document.getElementById('patient-list').options).find((o) => o.value === value);
      patient = opt ? patients.find((p) => p.id === opt.dataset.id) : null;
    }

    if (firstTrialCheckbox) {
      const alreadyUsed = !!(patient && Array.isArray(patient.firstTrialUsedTreatmentTypeIds) && patient.firstTrialUsedTreatmentTypeIds.includes(treatmentType.id));
      firstTrialCheckbox.disabled = alreadyUsed;
      if (alreadyUsed) firstTrialCheckbox.checked = false;
      document.getElementById('first-trial-hint').style.display = alreadyUsed ? '' : 'none';
    }

    if (erasCheckbox) {
      const used = (patient && patient.erasUsedCount) || 0;
      erasRemaining = Math.max(0, 4 - used);
      erasCheckbox.disabled = erasRemaining <= 0;
      if (erasRemaining <= 0) erasCheckbox.checked = false;
      document.getElementById('eras-hint').textContent = patient
        ? `此患者已使用 ${used} / 4 次，還可再使用 ${erasRemaining} 次（同一次排程操作最多約 2 次）`
        : '一位患者一輩子最多 4 次，同一次排程操作最多約 2 次';
      enforceMultiSlotErasLimit();
    }

    const packageField = document.getElementById('package-field');
    const packageSelect = document.getElementById('f-package');
    const packageHint = document.getElementById('package-hint');
    if (!patient) {
      packageField.style.display = 'none';
      packageSelect.innerHTML = '';
      return;
    }
    let pkgs = [];
    try {
      pkgs = await api(`/packages?patientId=${encodeURIComponent(patient.id)}&treatmentTypeId=${encodeURIComponent(treatmentType.id)}&onlyAvailable=true`);
    } catch (err) {
      pkgs = [];
    }
    if (pkgs.length === 0) {
      packageField.style.display = 'none';
      packageSelect.innerHTML = '';
      packageHint.textContent = '';
      return;
    }
    packageField.style.display = '';
    packageSelect.innerHTML =
      '<option value="">不使用療程包（單次收費）</option>' +
      pkgs
        .map(
          (p) =>
            `<option value="${p.id}">${p.purchaseDate} 購買（共 ${p.totalSessions} 次）— 還可再約 ${p.unscheduledSessions} 次</option>`
        )
        .join('');
    // 有可用療程包時預設幫他選起來，避免忘記扣抵而重複收費
    packageSelect.value = pkgs[0].id;
    const updateHint = () => {
      const chosen = pkgs.find((p) => p.id === packageSelect.value);
      packageHint.textContent = chosen
        ? `此患者共購買 ${chosen.totalSessions} 次，已完成 ${chosen.usedSessions} 次、已排定 ${chosen.scheduledSessions} 次，本次治療將扣抵 1 次（金額 ${fmtMoney(chosen.unitPrice)}）`
        : '不扣抵療程包，本次以單次價格收費';
      if (firstTrialCheckbox && packageSelect.value) {
        firstTrialCheckbox.checked = false;
        firstTrialCheckbox.disabled = true;
      } else if (firstTrialCheckbox) {
        firstTrialCheckbox.disabled = false;
      }
      if (erasCheckbox) {
        if (packageSelect.value) {
          erasCheckbox.checked = false;
          erasCheckbox.disabled = true;
        } else {
          erasCheckbox.disabled = erasRemaining <= 0;
        }
      }
      // 多時段的療程包套用到整批時段，選了療程包後每一列的 ERAS 勾選都要一併停用
      document.querySelectorAll('#multi-slot-rows .slot-eras').forEach((b) => {
        if (packageSelect.value) {
          b.checked = false;
          b.disabled = true;
        }
      });
      enforceMultiSlotErasLimit();
    };
    packageSelect.onchange = updateHint;
    // 從療程包接續過來時，鎖定選到那個剛建立的療程包
    if (prefill.packageId && pkgs.some((p) => p.id === prefill.packageId)) {
      packageSelect.value = prefill.packageId;
    }
    updateHint();
  }
  document.getElementById('f-patient').addEventListener('input', onPatientChanged);

  // 帶入預填資料：載入該患者的療程包、並在需要時直接切到多時段模式
  if (prefill.patientId) {
    await onPatientChanged();
  }
  if (prefill.multiSlot) {
    const multiCheckbox = document.getElementById('f-multi-slot');
    multiCheckbox.checked = true;
    multiCheckbox.dispatchEvent(new Event('change'));
  }

  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientInput = document.getElementById('f-patient').value.trim();
    const patientOption = Array.from(document.getElementById('patient-list').options).find((o) => o.value === patientInput);
    const packageSelect = document.getElementById('f-package');
    // 患者被鎖定時一律用鎖定的 id，不再靠姓名比對（同名患者才不會排到錯的人身上）
    const resolvedPatientId = prefill.patientId || (patientOption ? patientOption.dataset.id : undefined);
    const basePayload = {
      patientId: resolvedPatientId,
      patientName: resolvedPatientId ? undefined : patientInput,
      patientPhone: document.getElementById('f-phone').value.trim(),
      doctorId: document.getElementById('f-doctor').value || null,
      orderDate: document.getElementById('f-order-date').value || undefined,
      therapistId: document.getElementById('f-therapist').value,
      treatmentTypeId: state.activeTreatmentTypeId,
      packageId: packageSelect && packageSelect.value ? packageSelect.value : undefined,
      note: document.getElementById('f-note').value,
    };
    const errorHost = document.getElementById('modal-error');
    errorHost.innerHTML = '';

    const isMultiSlot = document.getElementById('f-multi-slot').checked;
    if (isMultiSlot) {
      const rows = Array.from(document.getElementById('multi-slot-rows').children);
      const slots = rows
        .map((row) => ({
          date: row.querySelector('.slot-date').value,
          startTime: row.querySelector('.slot-time').value,
          eras: row.querySelector('.slot-eras') ? row.querySelector('.slot-eras').checked : false,
        }))
        .filter((s) => s.date && s.startTime);
      if (slots.length === 0) {
        errorHost.innerHTML = `<div class="error-box">請至少填寫一個時段</div>`;
        return;
      }
      const failures = [];
      let successCount = 0;
      // 若是新患者（沒有從既有名單選擇），第一筆成功建立後記住產生的 patientId，
      // 後續時段直接沿用同一個患者，避免每個時段各自用姓名快速建檔、變成好幾筆重複病患
      let resolvedPatientId = basePayload.patientId;
      for (const slot of slots) {
        try {
          const body = { ...basePayload, ...slot };
          if (resolvedPatientId) {
            body.patientId = resolvedPatientId;
            body.patientName = undefined;
          }
          const result = await api('/appointments', { method: 'POST', body: JSON.stringify(body) });
          successCount += 1;
          if (!resolvedPatientId && result.patientId) resolvedPatientId = result.patientId;
        } catch (err) {
          failures.push(`${slot.date} ${slot.startTime}：${err.message}`);
        }
      }
      await loadAndRender();
      if (failures.length === 0) {
        closeModal();
      } else {
        errorHost.innerHTML = `<div class="error-box">成功新增 ${successCount} 筆，${failures.length} 筆失敗：<br>${failures.map(escapeHtml).join('<br>')}</div>`;
      }
      return;
    }

    const payload = {
      ...basePayload,
      date: document.getElementById('f-date').value,
      startTime: document.getElementById('f-time').value,
      slotIndex: typeof prefill.slotIndex === 'number' ? prefill.slotIndex : undefined,
      firstTrial: document.getElementById('f-first-trial') ? document.getElementById('f-first-trial').checked : false,
      eras: document.getElementById('f-eras') ? document.getElementById('f-eras').checked : false,
    };
    try {
      await api('/appointments', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      await loadAndRender();
    } catch (err) {
      errorHost.innerHTML = `<div class="error-box">${err.message}</div>`;
    }
  });
}

function openDetailModal(appt) {
  const host = document.getElementById('modal-host');
  const canCheckIn = appt.status === 'BOOKED';
  const canComplete = appt.status === 'CHECKED_IN' || appt.status === 'BOOKED';
  const canCancel = appt.status === 'BOOKED' || appt.status === 'CHECKED_IN';
  const canNoShow = appt.status === 'BOOKED';
  let editingPersonnel = false;

  // 若目前指定的執行人員/開單醫師已被停用，編輯時仍要保留在清單裡顯示，
  // 避免存檔時被無聲換成別人（下拉選單裡找不到就預設選到第一個）
  function therapistOptions() {
    const list = state.therapists.some((t) => t.id === appt.therapistId)
      ? state.therapists
      : [...state.therapists, { id: appt.therapistId, name: `${appt.therapistName}（已停用）` }];
    return list
      .map((t) => `<option value="${t.id}" ${t.id === appt.therapistId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
      .join('');
  }
  function doctorOptions() {
    const list = !appt.doctorId || state.doctors.some((d) => d.id === appt.doctorId)
      ? state.doctors
      : [...state.doctors, { id: appt.doctorId, name: `${appt.doctorName}（已停用）` }];
    return (
      `<option value="" ${!appt.doctorId ? 'selected' : ''}>（未指定）</option>` +
      list.map((d) => `<option value="${d.id}" ${d.id === appt.doctorId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')
    );
  }

  function render() {
    host.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal">
          <h3>預約明細 <span class="badge ${appt.status}" style="margin-left:8px;">${statusLabel(appt.status)}</span></h3>
          <div id="modal-error"></div>
          <table class="data-table">
            <tr><th>患者</th><td>${escapeHtml(appt.patientName)} ${appt.patientPhone ? '(' + appt.patientPhone + ')' : ''}</td></tr>
            <tr><th>療程</th><td>${escapeHtml(appt.treatmentTypeName)}</td></tr>
            <tr><th>執行人員</th><td>${editingPersonnel ? `<select id="edit-therapist">${therapistOptions()}</select>` : escapeHtml(appt.therapistName)}</td></tr>
            <tr><th>開單醫師</th><td>${editingPersonnel ? `<select id="edit-doctor">${doctorOptions()}</select>` : escapeHtml(appt.doctorName) || '-'}</td></tr>
            <tr><th>開單日期</th><td>${editingPersonnel ? `<input type="date" id="edit-order-date" value="${appt.orderDate || appt.date}" />` : (appt.orderDate || appt.date)}</td></tr>
            <tr><th>日期時間</th><td>${appt.date} ${appt.startTime} - ${appt.endTime}</td></tr>
            <tr><th>金額</th><td>${fmtMoney(appt.price)}${appt.packageId ? ` <span class="badge COMPLETED">${escapeHtml(appt.packageLabel)}扣抵</span>` : ''}</td></tr>
            <tr><th>報到時間</th><td>${fmtDateTime(appt.checkInAt)}</td></tr>
            <tr><th>完成時間</th><td>${fmtDateTime(appt.completedAt)}</td></tr>
            <tr><th>備註</th><td>${escapeHtml(appt.note) || '-'}</td></tr>
          </table>
          <div class="toolbar" style="margin-top:16px; flex-wrap:wrap;">
            <button type="button" class="btn secondary" id="modal-close">關閉</button>
            <div style="flex:1"></div>
            ${
              editingPersonnel
                ? `<button type="button" class="btn secondary" id="btn-cancel-edit">取消</button>
                   <button type="button" class="btn" id="btn-save-personnel">儲存變更</button>`
                : `<button type="button" class="btn secondary" id="btn-edit-personnel">編輯執行人員/醫師/開單日期</button>
                   ${canNoShow ? '<button type="button" class="btn secondary" id="btn-noshow">標記未到</button>' : ''}
                   ${canCancel ? '<button type="button" class="btn danger" id="btn-cancel">取消預約</button>' : ''}
                   ${canCheckIn ? '<button type="button" class="btn warning" id="btn-checkin">✓ 報到成功</button>' : ''}
                   ${canComplete ? '<button type="button" class="btn success" id="btn-complete">✓ 完成治療</button>' : ''}`
            }
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    const errorHost = document.getElementById('modal-error');

    if (editingPersonnel) {
      document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        editingPersonnel = false;
        render();
      });
      document.getElementById('btn-save-personnel').addEventListener('click', async () => {
        const therapistId = document.getElementById('edit-therapist').value;
        const doctorId = document.getElementById('edit-doctor').value;
        const orderDate = document.getElementById('edit-order-date').value;
        try {
          await api(`/appointments/${appt.id}`, { method: 'PATCH', body: JSON.stringify({ therapistId, doctorId, orderDate }) });
          closeModal();
          await loadAndRender();
        } catch (err) {
          errorHost.innerHTML = `<div class="error-box">${err.message}</div>`;
        }
      });
      return;
    }

    document.getElementById('btn-edit-personnel').addEventListener('click', () => {
      editingPersonnel = true;
      render();
    });

    const wireAction = (btnId, action) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          await api(`/appointments/${appt.id}/${action}`, { method: 'PATCH' });
          closeModal();
          await loadAndRender();
        } catch (err) {
          errorHost.innerHTML = `<div class="error-box">${err.message}</div>`;
        }
      });
    };
    wireAction('btn-checkin', 'checkin');
    wireAction('btn-complete', 'complete');
    wireAction('btn-cancel', 'cancel');
    wireAction('btn-noshow', 'no-show');
  }

  render();
}

function statusLabel(s) {
  return { BOOKED: '已預約', CHECKED_IN: '已報到', COMPLETED: '已完成', NO_SHOW: '未到', CANCELLED: '已取消' }[s] || s;
}

init();
