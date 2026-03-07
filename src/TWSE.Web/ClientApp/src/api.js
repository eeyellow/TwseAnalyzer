const API_BASE = '/api';

export async function fetchPortfolio() {
  const res = await fetch(`${API_BASE}/portfolio`);
  return res.json();
}

export async function addOrUpdatePortfolio(item) {
  const res = await fetch(`${API_BASE}/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function removePortfolio(stockCode) {
  await fetch(`${API_BASE}/portfolio/${stockCode}`, { method: 'DELETE' });
}

export async function fetchStrategies() {
  const res = await fetch(`${API_BASE}/analysis/strategies`);
  return res.json();
}

export async function scanPortfolio(strategyFileName) {
  const res = await fetch(`${API_BASE}/analysis/scan-portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategyFileName }),
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

export async function fetchTrackingList(search = '', status = '', page = 1, pageSize = 10) {
  const params = new URLSearchParams({ search, page, pageSize });
  if (status !== '') params.append('status', status);
  const res = await fetch(`${API_BASE}/tracking/list?${params.toString()}`);
  return res.json();
}

export async function addTracking(stockCode) {
  return await fetch(`${API_BASE}/tracking/${stockCode}`, { method: 'POST' });
}

export async function removeTracking(stockCode) {
  return await fetch(`${API_BASE}/tracking/${stockCode}`, { method: 'DELETE' });
}

