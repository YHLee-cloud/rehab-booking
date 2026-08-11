// 月業績報表頁面邏輯
const state = { me: null, year: null, month: null };

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  state.me = await requireLogin();
  if (!state.me) return;
  renderNav('reports', state.me);

  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  document.getElementById('year-input').value = state.year;
  const monthSelect = document.getElementById('month-input');
  monthSelect.innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}" ${m === state.month ? 'selected' : ''}>${m} 月</option>`)
    .join('');

  document.getElementById('load-btn').addEventListener('click', load);
  document.getElementById('export-btn').addEventListener('click', () => {
    const y = document.getElementById('year-input').value;
    const m = monthSelect.value;
    window.open(`/api/reports/monthly/export.csv?year=${y}&month=${m}`, '_blank');
  });

  await load();
}

async function load() {
  const year = document.getElementById('year-input').value;
  const month = document.getElementById('month-input').value;
  const report = await api(`/reports/monthly?year=${year}&month=${month}`);

  const cf = report.cashFlow || { totalReceived: 0, byTreatment: {} };
  document.getElementById('summary-stats').innerHTML = `
    <div class="stat-box"><div class="num">${fmtMoney(cf.totalReceived)}</div><div class="label">已收費金額</div></div>
    <div class="stat-box"><div class="num">${report.totalCount}</div><div class="label">已執行人次</div></div>
    <div class="stat-box"><div class="num">${fmtMoney(report.totalRevenue)}</div><div class="label">已執行金額</div></div>
  `;

  // 已收費（實際收到的錢）跟已執行（完成的治療服務量）分開統計，
  // 療程包購買當下就收費，但可能之後才慢慢執行完，兩個數字本來就不會完全對齊
  const ttNames = Array.from(new Set([...Object.keys(report.byTreatment), ...Object.keys(cf.byTreatment || {})]));
  ttNames.sort((a, b) => (cf.byTreatment[b]?.totalReceived || 0) - (cf.byTreatment[a]?.totalReceived || 0));
  document.getElementById('cashflow-detail').innerHTML = `
    <table class="data-table">
      <thead><tr><th>療程項目</th><th>已收費次數</th><th>已收費金額</th><th>已執行人次</th><th>已執行金額</th></tr></thead>
      <tbody>
        ${
          ttNames.length === 0
            ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px;">尚無資料</td></tr>`
            : ttNames
                .map((name) => {
                  const billed = cf.byTreatment[name] || { billedCount: 0, totalReceived: 0 };
                  const done = report.byTreatment[name] || { count: 0, revenue: 0 };
                  return `<tr><td>${escapeHtml(name)}</td><td>${billed.billedCount}</td><td>${fmtMoney(billed.totalReceived)}</td><td>${done.count}</td><td>${fmtMoney(done.revenue)}</td></tr>`;
                })
                .join('')
        }
        <tr style="background:#f8fafc;font-weight:700;">
          <td>合計</td><td>-</td><td>${fmtMoney(cf.totalReceived)}</td><td>${report.totalCount}</td><td>${fmtMoney(report.totalRevenue)}</td>
        </tr>
      </tbody>
    </table>
  `;

  renderGroupedTable('by-therapist', '執行人員', report.byTherapist);
  renderGroupedTable('by-doctor', '開單醫師', report.byDoctor);

  const detailBody = document.getElementById('detail-body');
  if (report.detail.length === 0) {
    detailBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px;">此月份尚無完成治療紀錄</td></tr>`;
  } else {
    detailBody.innerHTML = report.detail
      .map(
        (d) => `<tr>
          <td>${d.date}</td><td>${d.startTime}</td><td>${d.orderDate}</td><td>${escapeHtml(d.patientName)}</td>
          <td>${escapeHtml(d.treatmentTypeName)}</td><td>${escapeHtml(d.therapistName)}</td>
          <td>${escapeHtml(d.doctorName)}</td><td>${fmtMoney(d.price)}</td>
        </tr>`
      )
      .join('');
  }
}

// 依人分組（執行人員或開單醫師皆適用），每個人底下再依療程項目分開列出，最後一列是小計
function renderGroupedTable(elId, groupLabel, dataObj) {
  const entries = Object.entries(dataObj);
  const host = document.getElementById(elId);
  if (entries.length === 0) {
    host.innerHTML = `<tr><td style="color:#94a3b8;padding:12px;">尚無資料</td></tr>`;
    return;
  }
  let body = '';
  entries.forEach(([name, v]) => {
    // 每個人底下的療程項目，依金額由高到低排列，最直觀看出主要業績來源
    const ttEntries = Object.entries(v.byTreatment).sort((a, b) => b[1].revenue - a[1].revenue);
    const rowCount = ttEntries.length + 1; // +1 是最後的小計列
    ttEntries.forEach(([ttName, tv], i) => {
      body += '<tr>';
      if (i === 0) {
        body += `<td rowspan="${rowCount}" style="font-weight:700;vertical-align:top;border-right:2px solid var(--border);">${escapeHtml(name)}</td>`;
      }
      body += `<td>${escapeHtml(ttName)}</td><td>${tv.count}</td><td>${fmtMoney(tv.revenue)}</td>`;
      body += '</tr>';
    });
    body += `<tr style="background:#f8fafc;font-weight:700;">
      <td>小計</td><td>${v.total.count}</td><td>${fmtMoney(v.total.revenue)}</td>
    </tr>`;
  });
  host.innerHTML = `
    <thead><tr><th>${groupLabel}</th><th>療程項目</th><th>完成人次</th><th>金額小計</th></tr></thead>
    <tbody>${body}</tbody>
  `;
}

init();
