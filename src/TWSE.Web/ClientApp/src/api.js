import localforage from 'localforage';

const API_BASE = '/api';

// --- Local-First Portfolio Management ---
export async function getLocalPortfolio() {
  const p = await localforage.getItem('twse_portfolio');
  return p || [];
}

export async function saveLocalPortfolio(portfolio) {
  await localforage.setItem('twse_portfolio', portfolio);
}

// --- Local-First Tracking Management ---
export async function getLocalTracking() {
  const t = await localforage.getItem('twse_tracking');
  return t || [];
}

export async function saveLocalTracking(tracking) {
  await localforage.setItem('twse_tracking', tracking);
}

// --- Stateless Server APIs ---
export async function fetchStrategies() {
  const res = await fetch(`${API_BASE}/analysis/strategies`);
  return res.json();
}

export async function scanPortfolio(strategyFileName, myStocks) {
  const res = await fetch(`${API_BASE}/analysis/scan-portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyFileName, myStocks }),
  });
  return res.json();
}

export async function fetchStocks() {
  const res = await fetch(`${API_BASE}/stocks`);
  return res.json();
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
