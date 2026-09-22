import localforage from 'localforage';

const API_BASE = '/api';

// --- Backend Portfolio Management ---
export async function getPortfolio() {
  const res = await fetch(`${API_BASE}/portfolio`);
  return res.json();
}

export async function savePortfolioItem(item) {
  const res = await fetch(`${API_BASE}/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.ok;
}

export async function deletePortfolioItem(stockCode) {
  const res = await fetch(`${API_BASE}/portfolio/${stockCode}`, {
    method: 'DELETE',
  });
  return res.ok;
}

// --- Local-First Tracking Management ---
export async function getLocalTracking() {
  const t = await localforage.getItem('twse_tracking');
  return t || [];
}

export async function saveLocalTracking(tracking) {
  await localforage.setItem('twse_tracking', tracking);
}

async function safeJsonFetch(url, options = {}, fallback = null) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`[API] HTTP ${res.status} for ${url}`);
      return fallback;
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[API] Non-JSON content-type for ${url}`);
      return fallback;
    }
    return await res.json();
  } catch (err) {
    console.error(`[API] Network error for ${url}:`, err);
    return fallback;
  }
}

// --- Stateless Server APIs ---
export async function fetchStrategies() {
  return (await safeJsonFetch(`${API_BASE}/analysis/strategies`, {}, [])) || [];
}

export async function getDailyReport(date = null) {
  let url = `${API_BASE}/dailyreport`;
  if (date) url += `?date=${encodeURIComponent(date)}`;
  return safeJsonFetch(url, {}, null);
}

export async function scanPortfolio(strategyFileName, myStocks) {
  return (await safeJsonFetch(`${API_BASE}/analysis/scan-portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyFileName, myStocks }),
  }, [])) || [];
}

export async function fetchCombos() {
  return (await safeJsonFetch(`${API_BASE}/analysis/combos`, {}, [])) || [];
}

export async function saveCombo(combo) {
  return safeJsonFetch(`${API_BASE}/analysis/combos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(combo),
  }, null);
}

export async function deleteCombo(id) {
  const res = await fetch(`${API_BASE}/analysis/combos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function scanCombo(params) {
  return (await safeJsonFetch(`${API_BASE}/analysis/scan-combo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, { results: [], totalTargetCount: 0, matchedCount: 0 })) || { results: [], totalTargetCount: 0, matchedCount: 0 };
}

export async function fetchStocks() {
  return (await safeJsonFetch(`${API_BASE}/stocks`, {}, [])) || [];
}

export async function fetchPrices(stockCode, days = null) {
  let url = `${API_BASE}/stocks/${stockCode}/prices`;
  if (days) url += `?days=${days}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchSnapshot(codes) {
  if (!codes || codes.length === 0) return [];
  const res = await fetch(`${API_BASE}/analysis/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  });
  return res.json();
}

// --- Manual Jobs ---
export async function runUpdateJob() {
  const res = await fetch(`${API_BASE}/jobs/update-data`, { method: 'POST' });
  return res.json();
}

export async function runAnalysisJob(date = null) {
  let url = `${API_BASE}/jobs/run-analysis`;
  if (date) url += `?date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

// --- Adaptive Learning & Verification ---
export async function getVerificationSummary(days = 60) {
  const res = await fetch(`${API_BASE}/verification/summary?days=${days}`);
  return res.json();
}

export async function getVerificationHistory(limit = 100) {
  const res = await fetch(`${API_BASE}/verification/history?limit=${limit}`);
  return res.json();
}

export async function runVerificationJob(date = null) {
  let url = `${API_BASE}/verification/run`;
  if (date) url += `?date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

// --- Historical Walk-Forward Simulation Replay ---
export async function startSimulation(payload) {
  const res = await fetch(`${API_BASE}/simulation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return res.json();
}

export async function getSimulationStatus() {
  const res = await fetch(`${API_BASE}/simulation/status`);
  return res.json();
}

export async function getSimulationSummary() {
  const res = await fetch(`${API_BASE}/simulation/summary`);
  if (!res.ok) throw new Error('尚未有完成的歷史回放報告');
  return res.json();
}

export async function cancelSimulation() {
  const res = await fetch(`${API_BASE}/simulation/cancel`, { method: 'POST' });
  return res.json();
}

