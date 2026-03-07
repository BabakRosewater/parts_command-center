const SOURCES = [
  { id: 'dp1', label: 'DP1 Inventory Stratification', file: 'data/parts_data_point_1.csv' },
  { id: 'dp2', label: 'DP2 Stock Sales Ledger', file: 'data/parts_data_point_2.csv' },
  { id: 'dp3', label: 'DP3 Emergency Purchase Ledger', file: 'data/parts_data_point_3.csv' },
  { id: 'dp4', label: 'DP4 Purchasing Activity', file: 'data/parts_data_point_4.csv' },
  { id: 'dp5', label: 'DP5 Core Return Report', file: 'data/parts_data_point_5.csv' },
  { id: 'dp6', label: 'DP6 Replenishment Settings', file: 'data/parts_data_point_6.csv' },
  { id: 'dp7', label: 'DP7 Unrealized Sales / Pipeline', file: 'data/parts_data_point_7.csv' },
  { id: 'dp8', label: 'DP8 Service Level / Fill Rate', file: 'data/parts_data_point_8.csv' },
];

const charts = {};
const debugState = { visible: false, payload: null };

document.getElementById('btnRefresh').addEventListener('click', loadDashboard);
document.getElementById('btnDebug').addEventListener('click', () => {
  debugState.visible = !debugState.visible;
  document.getElementById('debugPanel').classList.toggle('hidden', !debugState.visible);
  if (debugState.visible && debugState.payload) {
    document.getElementById('debugText').textContent = JSON.stringify(debugState.payload, null, 2);
  }
});

renderSourceCards();
loadDashboard();

async function loadDashboard() {
  setText('statusReady', 'Loading…');
  try {
    const raw = {};
    for (const src of SOURCES) raw[src.id] = await parseCsv(src.id, src.file);
    const metrics = computeMetrics(raw);
    renderAll(metrics, raw);
    setText('statusReady', 'Ready');
    setText('lastRefresh', new Date().toLocaleString());
    debugState.payload = { metrics, rawCounts: Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, v.length])) };
    if (debugState.visible) document.getElementById('debugText').textContent = JSON.stringify(debugState.payload, null, 2);
  } catch (err) {
    console.error(err);
    setText('statusReady', 'Load Error');
    alert('Dashboard could not load one or more CSV files. Open browser console for detail.');
  }
}

function renderSourceCards() {
  document.getElementById('sourceGrid').innerHTML = SOURCES.map((s, i) => `
    <div class="source-card">
      <div class="text-[10px] uppercase tracking-[.08em] text-slate-500 font-bold">DP${i + 1}</div>
      <div class="font-extrabold text-sm mt-1">${s.label}</div>
      <div class="text-xs text-slate-500 mt-1">/${s.file}</div>
      <span class="tag">Local</span>
    </div>
  `).join('');
}

function parseCsv(id, file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      download: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        try {
          resolve(normalizeRows(id, results.data || []));
        } catch (e) { reject(e); }
      },
      error: reject,
    });
  });
}

function normalizeRows(id, rows) {
  if (!rows.length) return [];
  const cleanCell = (v) => String(v ?? '').trim();
  const normalized = rows.map(r => Array.isArray(r) ? r.map(cleanCell) : Object.values(r).map(cleanCell));

  if (id === 'dp2') {
    const idx = normalized.findIndex(r => r.join(' ').includes('MF Part Number/Description'));
    const usable = idx >= 0 ? normalized.slice(idx + 1) : normalized;
    return usable.filter(r => r.some(Boolean)).map(r => ({
      part_desc: r[0] || '', date: r[1] || '', qty: toNum(r[2]), net: toNum(r[3]), extension: toNum(r[4])
    })).filter(r => r.part_desc && /\d/.test(r.date));
  }
  if (id === 'dp1') {
    const [header, ...body] = normalized;
    return body.map(r => ({
      part_desc: r[0], pieces_sold: toNum(r[1]), total_sales: toNum(r[2]), accum_sales: toNum(r[3]), accum_pct: toNum(r[4]),
      oh_qty: toNum(r[5]), cost: toNum(r[6]), ext_cost: toNum(r[7]), stock_status: r[8]
    })).filter(r => r.part_desc);
  }
  if (id === 'dp3') {
    const [header, ...body] = normalized;
    return body.map(r => ({ part_desc: r[0], date: r[1], qty: toNum(r[2]), net: toNum(r[3]), extension: toNum(r[4]) })).filter(r => r.part_desc);
  }
  if (id === 'dp4') {
    const [header, ...body] = normalized;
    return body.map(r => ({ category: r[0], count: toNum(r[1]), pieces: toNum(r[2]), cost: toNum(r[3]), value: toNum(r[4]) })).filter(r => r.category);
  }
  if (id === 'dp5') {
    const [header, ...body] = normalized;
    return body.map(r => ({ stock_group: r[0], part_desc: r[1], rtn_qty: toNum(r[2]), dls: toNum(r[3]), dps: toNum(r[4]), oh: toNum(r[5]), cost: toNum(r[6]), value: toNum(r[7]) })).filter(r => r.part_desc);
  }
  if (id === 'dp6') {
    const [header, ...body] = normalized;
    return body.map(r => ({ part: r[0], description: r[1], bin: r[2], stock_max: toNum(r[3]), rop: toNum(r[4]), on_hand: toNum(r[5]), on_order: toNum(r[6]), qty_sugg: toNum(r[7]), status: r[8], avg_month: toNum(r[9]), hi_mth: toNum(r[10]), lo_mth: toNum(r[11]) })).filter(r => r.part || r.description);
  }
  if (id === 'dp7') {
    const [header, ...body] = normalized;
    return body.map(r => ({ category: r[0], sales: toNum(r[1]), gross: toNum(r[2]), pieces: toNum(r[3]) })).filter(r => r.category);
  }
  if (id === 'dp8') {
    const [header, ...body] = normalized;
    return body.map(r => ({ category: r[0], sales: toNum(r[1]), cost: toNum(r[2]), gross: toNum(r[3]), gp_pct: toNum(r[4]) })).filter(r => r.category);
  }
  return [];
}

function computeMetrics(raw) {
  const dp1 = raw.dp1;
  const dp2 = raw.dp2;
  const dp3 = raw.dp3;
  const dp4 = raw.dp4;
  const dp5 = raw.dp5;
  const dp6 = raw.dp6;
  const dp7 = raw.dp7;
  const dp8 = raw.dp8;

  const inventoryValue = sum(dp1, 'ext_cost');
  const deadStock = dp1.filter(r => r.pieces_sold === 0 && r.oh_qty > 0);
  const deadValue = sum(deadStock, 'ext_cost');
  const deadPct = ratio(deadValue, inventoryValue);
  const nonStockCount = dp6.filter(r => /non/i.test(r.status)).length;
  const topDead = deadStock.sort((a,b) => b.ext_cost - a.ext_cost).slice(0, 15).map(splitPartDescWithValue('ext_cost'));

  const stockSales = sum(dp2, 'extension');
  const epSpend = sum(dp3, 'extension');
  const moverMap = groupByPart(dp2, 'extension');
  const fastMovers = [...moverMap.values()].sort((a,b) => b.total - a.total).slice(0, 10);
  const epMap = groupByPart(dp3, 'extension');
  const phaseIn = [...epMap.values()].filter(x => x.hits >= 3).sort((a,b) => b.hits - a.hits || b.total - a.total).slice(0, 20);

  const stockPlaced = dp4.find(r => /stock orders placed/i.test(r.category))?.cost || 0;
  const specialPlaced = dp4.find(r => /special orders placed/i.test(r.category))?.cost || 0;
  const stockOrderPct = ratio(stockPlaced, stockPlaced + specialPlaced);
  const specialOrderPct = ratio(specialPlaced, stockPlaced + specialPlaced);
  const openCoreValue = sum(dp5, 'value');
  const coreQty = sum(dp5, 'rtn_qty');
  const topCore = dp5.filter(r => r.value > 0).sort((a,b) => b.value - a.value).slice(0, 15).map(splitPartDescWithValue('value'));

  const openRoSales = dp7.find(r => /open repair orders/i.test(r.category))?.sales || 0;
  const pendingGross = dp7.find(r => /open repair orders/i.test(r.category))?.gross || 0;
  const shelfSales = dp8.find(r => /filled from shelf/i.test(r.category))?.sales || 0;
  const epSales = dp8.find(r => /filled by ep/i.test(r.category))?.sales || 0;
  const soSales = dp8.find(r => /filled by so/i.test(r.category))?.sales || 0;
  const totalFillSales = shelfSales + epSales + soSales;
  const shelfFillPct = ratio(shelfSales, totalFillSales);
  const epFillPct = ratio(epSales, totalFillSales);

  const healthScore = Math.max(0, Math.min(100,
    100
    - (deadPct * 100 * 0.45)
    - (specialOrderPct * 100 * 0.20)
    - ((0.85 - shelfFillPct) > 0 ? (0.85 - shelfFillPct) * 100 * 0.40 : 0)
    - (phaseIn.length > 20 ? 8 : phaseIn.length > 10 ? 4 : 0)
  ));

  const alerts = buildAlerts({ deadPct, nonStockCount, epSpend, stockSales, phaseInCount: phaseIn.length, stockOrderPct, specialOrderPct, shelfFillPct, openRoSales, pendingGross, topDead, phaseIn });

  return {
    cards: { inventoryValue, deadValue, deadPct, nonStockCount, stockSales, epSpend, fastMoversCount: fastMovers.length, phaseInCount: phaseIn.length, stockOrderPct, specialOrderPct, openCoreValue, coreQty, openRoSales, pendingGross, shelfFillPct, epFillPct },
    tables: { topDead, phaseIn, topCore, pipeline: dp7.filter(r => r.sales || r.gross) },
    charts: {
      inventoryMix: [inventoryValue - deadValue, deadValue],
      fastMovers,
      buyRatio: [stockPlaced, specialPlaced],
      fillRate: [shelfSales, epSales, soSales],
    },
    alerts,
    healthScore,
    dataHealth: SOURCES.map(s => ({ id: s.id, label: s.label, rows: raw[s.id].length, file: s.file }))
  };
}

function buildAlerts(m) {
  const alerts = [];
  if (m.deadPct >= 0.25) {
    alerts.push(alertObj('Critical dead stock pressure', 'red', `Dead stock is ${pct(m.deadPct)} of inventory value. That is too much cash frozen on the shelf.`, 'Pull the top dead-stock list, create return / liquidation buckets, and assign an owner this week.'));
  } else if (m.deadPct >= 0.12) {
    alerts.push(alertObj('Moderate dead stock pressure', 'yellow', `Dead stock is ${pct(m.deadPct)} of inventory value.`, 'Review aged parts by value and set a monthly cleanup cadence.'));
  } else {
    alerts.push(alertObj('Dead stock in reasonable range', 'green', `Dead stock is ${pct(m.deadPct)} of inventory value.`, 'Maintain monthly review and keep A/B/C cleanup disciplined.'));
  }

  if (m.phaseInCount >= 20 || m.epSpend > m.stockSales) {
    alerts.push(alertObj('Emergency purchase pressure is high', 'red', `${num(m.phaseInCount)} repeated EP candidates found and EP spend is ${money(m.epSpend)}.`, 'Promote repeated EP parts into stocked inventory and review vendor phase-in logic.'));
  } else if (m.phaseInCount >= 8) {
    alerts.push(alertObj('Emergency purchase pressure is building', 'yellow', `${num(m.phaseInCount)} repeated EP candidates found.`, 'Review repeated EP items weekly and phase in the clear repeaters.'));
  }

  if (m.specialOrderPct >= 0.30) {
    alerts.push(alertObj('Special-order mix is too high', 'red', `Special orders represent ${pct(m.specialOrderPct)} of placed purchasing cost.`, 'Audit buy ratio discipline and identify which special-order demand should become stock demand.'));
  }

  if (m.shelfFillPct < 0.25) {
    alerts.push(alertObj('Shelf fill is extremely low', 'red', `Shelf fill is only ${pct(m.shelfFillPct)} by sales mix in this report.`, 'Verify the report definition, then address stocking gaps and non-stock fast movers immediately.'));
  } else if (m.shelfFillPct < 0.60) {
    alerts.push(alertObj('Shelf fill needs improvement', 'yellow', `Shelf fill is ${pct(m.shelfFillPct)}.`, 'Compare demand velocity against replenishment status and repair stocking exceptions.'));
  }

  if (m.pendingGross > 5000) {
    alerts.push(alertObj('Gross is trapped in open ROs', 'yellow', `${money(m.pendingGross)} gross is tied to open repair order parts.`, 'Partner with service leadership to close aged open ROs and convert pipeline to booked revenue.'));
  }
  return alerts;
}

function renderAll(metrics) {
  const c = metrics.cards;
  setText('invValue', money(c.inventoryValue));
  setText('deadValue', money(c.deadValue));
  setText('deadPct', pct(c.deadPct));
  setText('nonStockCount', num(c.nonStockCount));
  setText('stockSales', money(c.stockSales));
  setText('epSpend', money(c.epSpend));
  setText('fastMoversCount', num(c.fastMoversCount));
  setText('phaseInCount', num(c.phaseInCount));
  setText('stockOrderPct', pct(c.stockOrderPct));
  setText('specialOrderPct', pct(c.specialOrderPct));
  setText('openCoreValue', money(c.openCoreValue));
  setText('coreQty', num(c.coreQty));
  setText('openRoSales', money(c.openRoSales));
  setText('pendingGross', money(c.pendingGross));
  setText('shelfFillPct', pct(c.shelfFillPct));
  setText('epFillPct', pct(c.epFillPct));
  setText('healthScore', `${Math.round(metrics.healthScore)}/100`);

  renderAlerts(metrics.alerts);
  renderDataHealth(metrics.dataHealth);
  renderTable('tblDeadStock', metrics.tables.topDead, r => `<tr><td>${escapeHtml(r.part)}</td><td>${escapeHtml(r.description)}</td><td class="text-right">${money(r.value)}</td></tr>`);
  renderTable('tblPhaseIn', metrics.tables.phaseIn, r => `<tr><td>${escapeHtml(r.part)}</td><td>${escapeHtml(r.description)}</td><td class="text-right">${num(r.hits)}</td></tr>`);
  renderTable('tblCore', metrics.tables.topCore, r => `<tr><td>${escapeHtml(r.part)}</td><td>${escapeHtml(r.description)}</td><td class="text-right">${money(r.value)}</td></tr>`);
  renderTable('tblPipeline', metrics.tables.pipeline, r => `<tr><td>${escapeHtml(r.category)}</td><td class="text-right">${money(r.sales)}</td><td class="text-right">${money(r.gross)}</td></tr>`);

  drawChart('chartInventoryMix', 'doughnut', {
    labels: ['Active / Productive', 'Dead Stock'],
    datasets: [{ data: metrics.charts.inventoryMix, backgroundColor: ['#3b82f6', '#fb7185'] }]
  });
  drawChart('chartFastMovers', 'bar', {
    labels: metrics.charts.fastMovers.map(x => shorten(x.part, 14)),
    datasets: [{ label: 'Sales $', data: metrics.charts.fastMovers.map(x => round2(x.total)) }]
  });
  drawChart('chartBuyRatio', 'pie', {
    labels: ['Stock Orders', 'Special Orders'],
    datasets: [{ data: metrics.charts.buyRatio, backgroundColor: ['#3b82f6', '#fb7185'] }]
  });
  drawChart('chartFillRate', 'bar', {
    labels: ['Shelf', 'EP', 'SO'],
    datasets: [{ label: 'Sales $', data: metrics.charts.fillRate.map(round2) }]
  });
}

function renderAlerts(alerts) {
  document.getElementById('alerts').innerHTML = alerts.map(a => `
    <div class="alert">
      <div class="alert-top">
        <div class="alert-title">${escapeHtml(a.title)}</div>
        <span class="alert-tag alert-${a.level}">${a.level.toUpperCase()}</span>
      </div>
      <div class="alert-copy">${escapeHtml(a.copy)}</div>
      <div class="alert-action">Next move: ${escapeHtml(a.action)}</div>
    </div>`).join('');
}
function renderDataHealth(rows) {
  document.getElementById('dataHealth').innerHTML = rows.map(r => `
    <div class="row-health">
      <div>
        <div class="font-extrabold text-sm">${escapeHtml(r.label)}</div>
        <div class="meta">/${escapeHtml(r.file)}</div>
      </div>
      <div class="text-right">
        <div class="font-black text-lg">${num(r.rows)}</div>
        <div class="meta">rows loaded</div>
      </div>
    </div>`).join('');
}

function renderTable(id, rows, rowFn) { document.getElementById(id).innerHTML = rows.map(rowFn).join(''); }
function drawChart(id, type, data) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type,
    data,
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: type === 'bar' ? { y: { beginAtZero: true } } : {} }
  });
}
function groupByPart(rows, valueField) {
  const map = new Map();
  for (const row of rows) {
    const { part, description } = splitPartDesc(row.part_desc || row.part || '');
    const key = `${part}|${description}`;
    if (!map.has(key)) map.set(key, { part, description, hits: 0, total: 0 });
    const rec = map.get(key);
    rec.hits += 1;
    rec.total += toNum(row[valueField]);
  }
  return map;
}
function splitPartDesc(s) {
  const str = String(s || '');
  const parts = str.split(':');
  return { part: (parts[0] || '').trim(), description: (parts.slice(1).join(':') || '').trim() || '(no description)' };
}
function splitPartDescWithValue(valueField) {
  return (r) => {
    const p = splitPartDesc(r.part_desc || r.part || '');
    return { part: p.part, description: p.description, value: toNum(r[valueField]) };
  };
}
function alertObj(title, level, copy, action) { return { title, level, copy, action }; }
function setText(id, val) { document.getElementById(id).textContent = val; }
function sum(arr, field) { return arr.reduce((a, r) => a + toNum(r[field]), 0); }
function ratio(a, b) { return b ? a / b : 0; }
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[,$%()]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}
function money(n) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(toNum(n)); }
function pct(n) { return `${(toNum(n) * 100).toFixed(1)}%`; }
function num(n) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(toNum(n)); }
function round2(n) { return Math.round(toNum(n) * 100) / 100; }
function shorten(s, len) { s = String(s || ''); return s.length > len ? `${s.slice(0, len)}…` : s; }
function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
