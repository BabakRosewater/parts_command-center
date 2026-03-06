const DATA_SOURCES = {
  dp1: { label: "DP1 Inventory Stratification", path: "./data/parts_data_point_1.csv" },
  dp2: { label: "DP2 Stock Sales Ledger", path: "./data/parts_data_point_2.csv" },
  dp3: { label: "DP3 Emergency Purchase Ledger", path: "./data/parts_data_point_3.csv" },
  dp4: { label: "DP4 Purchasing Activity", path: "./data/parts_data_point_4.csv" },
  dp5: { label: "DP5 Core Return Report", path: "./data/parts_data_point_5.csv" },
  dp6: { label: "DP6 Replenishment Settings", path: "./data/parts_data_point_6.csv" },
  dp7: { label: "DP7 Unrealized Sales / Pipeline", path: "./data/parts_data_point_7.csv" },
  dp8: { label: "DP8 Service Level / Fill Rate", path: "./data/parts_data_point_8.csv" }
};

// Replace any path with a GitHub raw URL when ready.
// Example:
// DATA_SOURCES.dp1.path = "https://raw.githubusercontent.com/BabakRosewater/parts/main/data/parts_data_point_1.csv";

const state = {
  raw: {},
  charts: {},
  debug: false
};

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function formatMoney(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

function formatPct(value, digits = 1) {
  const num = Number(value || 0);
  return `${num.toFixed(digits)}%`;
}

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function normalizePart(raw) {
  const text = String(raw || "").trim();
  if (!text) return { number: "", description: "" };

  const noPrefix = text.replace(/^([A-Z]{2,3})\s+/, "");
  const parts = noPrefix.split(" : ");
  return {
    number: (parts[0] || "").trim(),
    description: parts.slice(1).join(" : ").trim()
  };
}

async function fetchCsv(source) {
  const response = await fetch(source.path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${source.path} (${response.status})`);
  return response.text();
}

function parseCsv(text) {
  return Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  }).data;
}

function cleanDp2(text) {
  const lines = String(text).split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes("MF Part Number/Description"));
  const cleaned = headerIndex >= 0 ? lines.slice(headerIndex).join("\n") : text;
  return parseCsv(cleaned).filter((row) => row["MF Part Number/Description"]);
}

function cleanDefault(text) {
  return parseCsv(text).filter((row) => Object.values(row).some((v) => String(v || "").trim() !== ""));
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + safeNumber(row[key]), 0);
}

function topN(items, n, sortKey) {
  return [...items].sort((a, b) => safeNumber(b[sortKey]) - safeNumber(a[sortKey])).slice(0, n);
}

function percent(part, total) {
  return total > 0 ? (part / total) * 100 : 0;
}

function buildTable(containerId, columns, rows) {
  const target = $(containerId);
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">No rows available.</div>`;
    return;
  }

  const head = columns.map((col) => `<th>${col.label}</th>`).join("");
  const body = rows.map((row) => {
    const cells = columns.map((col) => `<td>${col.format ? col.format(row[col.key], row) : (row[col.key] ?? "")}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  target.innerHTML = `
    <div class="table-scroll max-h-72">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function makeChart(key, canvasId, config) {
  destroyChart(key);
  const ctx = $(canvasId)?.getContext("2d");
  if (!ctx) return;
  state.charts[key] = new Chart(ctx, config);
}

function renderSources() {
  const html = Object.entries(DATA_SOURCES).map(([key, source]) => {
    const mode = source.path.includes("raw.githubusercontent.com") ? "GitHub Raw" : "Local";
    return `
      <div class="source-card">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">${key.toUpperCase()}</div>
        <div class="font-semibold mt-1">${source.label}</div>
        <div class="text-xs text-slate-600 mt-2 break-all">${source.path}</div>
        <div class="mt-3"><span class="code-pill">${mode}</span></div>
      </div>
    `;
  }).join("");

  $("sourceList").innerHTML = html;
  setText("sourceMode", Object.values(DATA_SOURCES).some((s) => s.path.includes("raw.githubusercontent.com")) ? "Mixed / GitHub" : "Local CSV");
}

function computeInventoryHealth(dp1, dp6) {
  const inventoryRows = dp1.map((row) => {
    const part = normalizePart(row["Part/Description"]);
    return {
      ...row,
      partNumber: part.number,
      description: part.description,
      piecesSold: safeNumber(row.PiecesSold),
      onHandQty: safeNumber(row["O/HQty"]),
      extCost: safeNumber(row.ExtCost),
      stockStatus: String(row.StockStatus || "").trim()
    };
  });

  const replRows = dp6.map((row) => ({
    partNumber: String(row.Part || "").trim(),
    description: String(row.Description || "").trim(),
    status: String(row.Status || "").trim(),
    onHand: safeNumber(row["On Hand"]),
    avgMonth: safeNumber(row["Avg Month"]),
    stockMax: safeNumber(row["Stock Max"]),
    rop: safeNumber(row.ROP)
  }));

  const inventoryValue = sum(inventoryRows, "extCost");
  const deadStockRows = inventoryRows.filter((r) => r.piecesSold === 0 && r.onHandQty > 0);
  const deadStockValue = sum(deadStockRows, "extCost");
  const nonStockCount = replRows.filter((r) => r.status.toLowerCase() === "non").length;
  const activeCount = inventoryRows.filter((r) => r.piecesSold > 0).length;

  return {
    inventoryValue,
    deadStockValue,
    deadPct: percent(deadStockValue, inventoryValue),
    nonStockCount,
    activeCount,
    deadStockRows: topN(deadStockRows, 10, "extCost")
  };
}

function computeDemand(dp2, dp3) {
  const stockRows = dp2.map((row) => {
    const part = normalizePart(row["MF Part Number/Description"]);
    return {
      ...row,
      partNumber: part.number,
      description: part.description,
      qty: safeNumber(row.Qty),
      net: safeNumber(row.Net),
      date: row.Date
    };
  });

  const epRows = dp3.map((row) => {
    const part = normalizePart(row["MF Part Number/Description"]);
    return {
      ...row,
      partNumber: part.number,
      description: part.description,
      qty: safeNumber(row.Qty),
      net: safeNumber(row.Net),
      extension: safeNumber(row.Extension),
      date: row.Date
    };
  });

  const groupedStock = new Map();
  stockRows.forEach((row) => {
    const key = row.partNumber || row.description;
    const current = groupedStock.get(key) || { partNumber: row.partNumber, description: row.description, qty: 0, net: 0, transactions: 0 };
    current.qty += row.qty;
    current.net += row.net;
    current.transactions += 1;
    groupedStock.set(key, current);
  });

  const groupedEP = new Map();
  epRows.forEach((row) => {
    const key = row.partNumber || row.description;
    const current = groupedEP.get(key) || { partNumber: row.partNumber, description: row.description, hits: 0, spend: 0, qty: 0 };
    current.hits += 1;
    current.spend += row.extension || row.net;
    current.qty += row.qty;
    groupedEP.set(key, current);
  });

  const fastMovers = topN([...groupedStock.values()], 10, "qty");
  const phaseInCandidates = [...groupedEP.values()].filter((r) => r.hits >= 3).sort((a, b) => b.hits - a.hits || b.spend - a.spend);

  return {
    stockSales: sum(stockRows, "net"),
    epSpend: epRows.reduce((acc, row) => acc + (row.extension || row.net), 0),
    fastMovers,
    phaseInCandidates
  };
}

function computePurchasing(dp4, dp5) {
  const purchaseRows = dp4.map((row) => ({
    category: String(row.Category || "").trim(),
    count: safeNumber(row.Count),
    pieces: safeNumber(row.Pieces),
    cost: safeNumber(row.Cost),
    value: safeNumber(row.Value)
  }));

  const coreRows = dp5.map((row) => {
    const part = normalizePart(row["Part/Description"]);
    return {
      ...row,
      partNumber: part.number,
      description: part.description,
      rtnQty: safeNumber(row.RtnQty),
      onHand: safeNumber(row["O/H"]),
      cost: safeNumber(row.Cost),
      value: safeNumber(row.Value)
    };
  });

  const stockPlaced = purchaseRows.find((r) => /stock orders placed/i.test(r.category))?.cost || 0;
  const specialPlaced = purchaseRows.find((r) => /special orders placed/i.test(r.category))?.cost || 0;
  const totalPlaced = stockPlaced + specialPlaced;
  const openCoreValue = sum(coreRows, "value");
  const coreQty = sum(coreRows, "rtnQty");

  return {
    stockOrderPct: percent(stockPlaced, totalPlaced),
    specialOrderPct: percent(specialPlaced, totalPlaced),
    openCoreValue,
    coreQty,
    coreRows: topN(coreRows, 10, "value")
  };
}

function computeOps(dp7, dp8) {
  const pipelineRows = dp7.map((row) => ({
    category: String(row.Category || "").trim(),
    sales: safeNumber(row.Sales),
    gross: safeNumber(row.Gross),
    pieces: safeNumber(row.Pieces)
  }));

  const fillRows = dp8.map((row) => ({
    category: String(row.Category || "").trim(),
    sales: safeNumber(row.Sales),
    cost: safeNumber(row.Cost),
    gross: safeNumber(row.Gross),
    gpPct: safeNumber(row["GP%"])
  }));

  const totalFillSales = sum(fillRows, "sales");
  const shelfSales = fillRows.find((r) => /shelf/i.test(r.category))?.sales || 0;
  const epSales = fillRows.find((r) => /ep/i.test(r.category))?.sales || 0;
  const soSales = fillRows.find((r) => /so/i.test(r.category))?.sales || 0;

  return {
    openRoSales: pipelineRows.find((r) => /open repair orders/i.test(r.category))?.sales || 0,
    pendingGross: pipelineRows.find((r) => /open repair orders/i.test(r.category))?.gross || 0,
    shelfFillPct: percent(shelfSales, totalFillSales),
    epFillPct: percent(epSales, totalFillSales),
    soFillPct: percent(soSales, totalFillSales),
    pipelineRows,
    fillRows
  };
}

function renderDashboard(metrics) {
  // Panel 1
  setText("invValue", formatMoney(metrics.inventory.inventoryValue));
  setText("deadValue", formatMoney(metrics.inventory.deadStockValue));
  setText("deadPct", formatPct(metrics.inventory.deadPct));
  setText("nonStockCount", formatNumber(metrics.inventory.nonStockCount));

  makeChart("inventoryMix", "inventoryMixChart", {
    type: "doughnut",
    data: {
      labels: ["Dead Stock", "Active / Productive"],
      datasets: [{ data: [metrics.inventory.deadStockValue, Math.max(metrics.inventory.inventoryValue - metrics.inventory.deadStockValue, 0)] }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  buildTable("deadStockTable", [
    { key: "partNumber", label: "Part" },
    { key: "description", label: "Description" },
    { key: "onHandQty", label: "OH Qty", format: (v) => formatNumber(v) },
    { key: "extCost", label: "Ext Cost", format: (v) => formatMoney(v) }
  ], metrics.inventory.deadStockRows);

  // Panel 2
  setText("stockSales", formatMoney(metrics.demand.stockSales));
  setText("epSpend", formatMoney(metrics.demand.epSpend));
  setText("fastMoverCount", formatNumber(metrics.demand.fastMovers.length));
  setText("phaseInCount", formatNumber(metrics.demand.phaseInCandidates.length));

  makeChart("velocity", "velocityChart", {
    type: "bar",
    data: {
      labels: metrics.demand.fastMovers.map((r) => r.partNumber || r.description).slice(0, 8),
      datasets: [{ label: "Qty Sold", data: metrics.demand.fastMovers.map((r) => r.qty).slice(0, 8) }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } }
    }
  });

  buildTable("phaseInTable", [
    { key: "partNumber", label: "Part" },
    { key: "description", label: "Description" },
    { key: "hits", label: "EP Hits", format: (v) => formatNumber(v) },
    { key: "spend", label: "Spend", format: (v) => formatMoney(v) }
  ], metrics.demand.phaseInCandidates.slice(0, 10));

  // Panel 3
  setText("stockOrderPct", formatPct(metrics.purchasing.stockOrderPct));
  setText("specialOrderPct", formatPct(metrics.purchasing.specialOrderPct));
  setText("coreValue", formatMoney(metrics.purchasing.openCoreValue));
  setText("coreQty", formatNumber(metrics.purchasing.coreQty));

  makeChart("buyRatio", "buyRatioChart", {
    type: "pie",
    data: {
      labels: ["Stock Orders", "Special Orders"],
      datasets: [{ data: [metrics.purchasing.stockOrderPct, metrics.purchasing.specialOrderPct] }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  buildTable("coreTable", [
    { key: "partNumber", label: "Part" },
    { key: "description", label: "Description" },
    { key: "rtnQty", label: "Qty", format: (v) => formatNumber(v) },
    { key: "value", label: "Value", format: (v) => formatMoney(v) }
  ], metrics.purchasing.coreRows);

  // Panel 4
  setText("openRoSales", formatMoney(metrics.ops.openRoSales));
  setText("pendingGross", formatMoney(metrics.ops.pendingGross));
  setText("shelfFillPct", formatPct(metrics.ops.shelfFillPct));
  setText("epFillPct", formatPct(metrics.ops.epFillPct));

  makeChart("serviceLevel", "serviceLevelChart", {
    type: "bar",
    data: {
      labels: ["Shelf", "EP", "SO"],
      datasets: [{ label: "Fill Mix %", data: [metrics.ops.shelfFillPct, metrics.ops.epFillPct, metrics.ops.soFillPct] }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100 } },
      plugins: { legend: { display: false } }
    }
  });

  buildTable("pipelineTable", [
    { key: "category", label: "Category" },
    { key: "sales", label: "Sales", format: (v) => formatMoney(v) },
    { key: "gross", label: "Gross", format: (v) => formatMoney(v) },
    { key: "pieces", label: "Pieces", format: (v) => formatNumber(v) }
  ], metrics.ops.pipelineRows);
}

function renderDebug(metrics) {
  const debugPayload = {
    timestamp: new Date().toISOString(),
    rowCounts: Object.fromEntries(Object.entries(state.raw).map(([k, v]) => [k, v.length])),
    metrics
  };
  $("debugBox").textContent = JSON.stringify(debugPayload, null, 2);
}

async function loadAllData() {
  setText("appStatus", "Loading…");
  try {
    renderSources();

    const [dp1Text, dp2Text, dp3Text, dp4Text, dp5Text, dp6Text, dp7Text, dp8Text] = await Promise.all(
      Object.values(DATA_SOURCES).map((source) => fetchCsv(source))
    );

    state.raw.dp1 = cleanDefault(dp1Text);
    state.raw.dp2 = cleanDp2(dp2Text);
    state.raw.dp3 = cleanDefault(dp3Text);
    state.raw.dp4 = cleanDefault(dp4Text);
    state.raw.dp5 = cleanDefault(dp5Text);
    state.raw.dp6 = cleanDefault(dp6Text);
    state.raw.dp7 = cleanDefault(dp7Text);
    state.raw.dp8 = cleanDefault(dp8Text);

    const metrics = {
      inventory: computeInventoryHealth(state.raw.dp1, state.raw.dp6),
      demand: computeDemand(state.raw.dp2, state.raw.dp3),
      purchasing: computePurchasing(state.raw.dp4, state.raw.dp5),
      ops: computeOps(state.raw.dp7, state.raw.dp8)
    };

    renderDashboard(metrics);
    renderDebug(metrics);
    setText("appStatus", "Ready");
    setText("lastRefresh", new Date().toLocaleString());
  } catch (error) {
    console.error(error);
    setText("appStatus", "Error");
    $("debugBox").classList.remove("hidden");
    $("debugBox").textContent = String(error?.stack || error);
  }
}

function bindEvents() {
  $("btnRefresh").addEventListener("click", loadAllData);
  $("btnToggleDebug").addEventListener("click", () => {
    state.debug = !state.debug;
    $("debugBox").classList.toggle("hidden", !state.debug);
  });
}

bindEvents();
loadAllData();
