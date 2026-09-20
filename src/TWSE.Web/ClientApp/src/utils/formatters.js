/**
 * Fintech formatting utilities for TWSE
 */

export function fmtCurrency(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Number(num).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtVolume(vol) {
  if (!vol || isNaN(vol)) return '-';
  const num = Number(vol);
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(2)} 億`;
  }
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)} 萬`;
  }
  return num.toLocaleString('zh-TW');
}

export function fmtPercent(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  const val = Number(num);
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function fmtDate(dateStr, includeTime = false) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  
  if (includeTime) {
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
