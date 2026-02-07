/**
 * GS1 Parser PWA - Offline-first Progressive Web App
 * For parsing GS1 barcodes and matching products from master data
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const AppState = {
  masterLoaded: false,
  masterCount: 0,
  masterData: [],
  masterIndex: {
    exact: new Map(),
    last8: new Map(),
  },
  masterLastUpdated: null,
  historyRows: [],
  currentTab: 'scan',
  filters: {
    expired: false,
    soon: false,
    missing: false,
    search: ''
  },
  sorting: {
    field: 'time',
    direction: 'desc'
  },
  pagination: {
    page: 1,
    perPage: 50
  },
  scanning: false,
  cameraStream: null,
  scannerInstance: null,
  pendingMasterFile: null,
  pendingMasterData: null
};

// ============================================================================
// DATABASE (IndexedDB)
// ============================================================================

const DB_NAME = 'gs1-parser-db';
const DB_VERSION = 1;
let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains('history')) {
        const historyStore = database.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        historyStore.createIndex('scanTime', 'scanTime', { unique: false });
        historyStore.createIndex('gtin14', 'gtin14', { unique: false });
        historyStore.createIndex('expiry', 'expiry', { unique: false });
      }
      if (!database.objectStoreNames.contains('master')) {
        const masterStore = database.createObjectStore('master', { keyPath: 'gtin' });
        masterStore.createIndex('name', 'name', { unique: false });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

async function saveHistory(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    const request = store.add(entry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadAllHistory() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readonly');
    const store = tx.objectStore('history');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function clearHistory() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function saveMasterData(data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master', 'readwrite');
    const store = tx.objectStore('master');
    store.clear();
    data.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function appendMasterData(data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master', 'readwrite');
    const store = tx.objectStore('master');
    data.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadMasterData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master', 'readonly');
    const store = tx.objectStore('master');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function clearMasterData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master', 'readwrite');
    const store = tx.objectStore('master');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function saveSetting(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadSetting(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// GS1 PARSING
// ============================================================================

function parseGs1(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Empty or invalid input' };
  }

  let cleanedRaw = raw.trim();
  cleanedRaw = cleanedRaw.replace(/[\x1d\u001d]/g, '|');
  
  if (!cleanedRaw.includes('(')) {
    cleanedRaw = convertRawToParenthesized(cleanedRaw);
  }

  const result = {
    valid: true,
    raw: raw,
    gtin14: '',
    gtin13: '',
    expiry: '',
    expiryFormatted: '',
    expiryStatus: 'missing',
    batch: '',
    serial: '',
    qty: '1',
    productName: '',
    matchType: 'NONE'
  };

  const aiPatterns = {
    '01': /\(01\)(\d{14})/,
    '01short': /\(01\)(\d{12,13})/,
    '17': /\(17\)(\d{6})/,
    '10': /\(10\)([A-Za-z0-9\-\/\.\s]+?)(?=\([0-9]{2}\)|$)/,
    '21': /\(21\)([A-Za-z0-9\-\/\.\s]+?)(?=\([0-9]{2}\)|$)/,
    '30': /\(30\)(\d+)/
  };

  const gtinMatch = cleanedRaw.match(aiPatterns['01']);
  if (gtinMatch) {
    result.gtin14 = gtinMatch[1];
    if (result.gtin14.startsWith('0')) {
      result.gtin13 = result.gtin14.substring(1);
    } else {
      result.gtin13 = result.gtin14;
    }
  } else {
    const shortGtinMatch = cleanedRaw.match(aiPatterns['01short']);
    if (shortGtinMatch) {
      result.gtin13 = shortGtinMatch[1].padStart(13, '0');
      result.gtin14 = result.gtin13.padStart(14, '0');
    }
  }

  const expiryMatch = cleanedRaw.match(aiPatterns['17']);
  if (expiryMatch) {
    const parsed = parseGS1Date(expiryMatch[1]);
    result.expiry = parsed.iso;
    result.expiryFormatted = parsed.formatted;
    result.expiryStatus = getExpiryStatus(parsed.iso);
  }

  const batchMatch = cleanedRaw.match(aiPatterns['10']);
  if (batchMatch) {
    result.batch = batchMatch[1].trim();
  }

  const serialMatch = cleanedRaw.match(aiPatterns['21']);
  if (serialMatch) {
    result.serial = serialMatch[1].trim();
  }

  const qtyMatch = cleanedRaw.match(aiPatterns['30']);
  if (qtyMatch) {
    result.qty = qtyMatch[1];
  }

  if (!result.gtin14 && !result.gtin13) {
    result.valid = false;
    result.matchType = 'INVALID';
    result.error = 'No valid GTIN found';
  }

  return result;
}

function convertRawToParenthesized(raw) {
  const aiLengths = {
    '01': 14, '02': 14, '10': 0, '11': 6, '12': 6, '13': 6,
    '15': 6, '16': 6, '17': 6, '20': 2, '21': 0, '22': 0,
    '30': 0, '37': 0, '240': 0, '241': 0, '242': 0, '250': 0, '251': 0
  };

  let result = '';
  const parts = raw.split('|');

  for (const part of parts) {
    let i = 0;
    while (i < part.length) {
      let ai = null;
      let aiLen = 0;

      if (i + 3 <= part.length) {
        const ai3 = part.substring(i, i + 3);
        if (aiLengths[ai3] !== undefined) {
          ai = ai3;
          aiLen = aiLengths[ai3];
        }
      }

      if (!ai && i + 2 <= part.length) {
        const ai2 = part.substring(i, i + 2);
        if (aiLengths[ai2] !== undefined) {
          ai = ai2;
          aiLen = aiLengths[ai2];
        }
      }

      if (ai) {
        const valueStart = i + ai.length;
        let valueEnd;
        if (aiLen > 0) {
          valueEnd = Math.min(valueStart + aiLen, part.length);
        } else {
          valueEnd = part.length;
        }
        const value = part.substring(valueStart, valueEnd);
        result += `(${ai})${value}`;
        i = valueEnd;
      } else {
        i++;
      }
    }
  }

  return result || raw;
}

function parseGS1Date(dateStr) {
  if (!dateStr || dateStr.length !== 6) {
    return { iso: '', formatted: '' };
  }

  const yy = parseInt(dateStr.substring(0, 2), 10);
  const mm = parseInt(dateStr.substring(2, 4), 10);
  let dd = parseInt(dateStr.substring(4, 6), 10);

  const year = 2000 + yy;

  if (dd === 0) {
    dd = new Date(year, mm, 0).getDate();
  }

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { iso: '', formatted: '' };
  }

  const iso = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const formatted = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${year}`;

  return { iso, formatted };
}

function getExpiryStatus(isoDate) {
  if (!isoDate) return 'missing';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(isoDate);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'soon';
  return 'ok';
}

// ============================================================================
// MASTER DATA MATCHING
// ============================================================================

function buildMasterIndex(data) {
  const index = {
    exact: new Map(),
    last8: new Map()
  };

  for (const item of data) {
    const gtin = String(item.gtin).replace(/\D/g, '').padStart(14, '0');
    const name = item.name || '';

    index.exact.set(gtin, name);
    
    if (gtin.startsWith('0')) {
      index.exact.set(gtin.substring(1), name);
    }

    const last8 = gtin.slice(-8);
    if (!index.last8.has(last8)) {
      index.last8.set(last8, []);
    }
    index.last8.get(last8).push({ gtin, name });
  }

  return index;
}

function matchProduct(parsed, index) {
  if (!parsed.valid) {
    return { name: '', matchType: 'INVALID' };
  }

  if (!index || !index.exact || index.exact.size === 0) {
    return { name: '', matchType: 'NONE' };
  }

  const gtin14 = parsed.gtin14;
  const gtin13 = parsed.gtin13;

  if (index.exact.has(gtin14)) {
    return { name: index.exact.get(gtin14), matchType: 'EXACT' };
  }
  if (index.exact.has(gtin13)) {
    return { name: index.exact.get(gtin13), matchType: 'EXACT' };
  }

  const last8 = gtin14.slice(-8);
  if (index.last8.has(last8)) {
    const matches = index.last8.get(last8);
    if (matches.length === 1) {
      return { name: matches[0].name, matchType: 'LAST8' };
    } else if (matches.length > 1) {
      return { name: '', matchType: 'AMBIGUOUS-LAST8' };
    }
  }

  const last10 = gtin14.slice(-10);
  const seq6Matches = [];

  for (let i = 0; i <= last10.length - 6; i++) {
    const seq6 = last10.substring(i, i + 6);
    
    for (const [gtin, name] of index.exact) {
      if (gtin.includes(seq6)) {
        const existing = seq6Matches.find(m => m.gtin === gtin);
        if (!existing) {
          seq6Matches.push({ gtin, name });
        }
      }
    }
  }

  if (seq6Matches.length === 1) {
    return { name: seq6Matches[0].name, matchType: 'SEQ6' };
  } else if (seq6Matches.length > 1) {
    return { name: '', matchType: 'AMBIGUOUS-SEQ6' };
  }

  return { name: '', matchType: 'NONE' };
}

// ============================================================================
// CSV/TSV PARSING
// ============================================================================

function parseMasterFile(content, filename) {
  const firstLine = content.split('\n')[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = ';';

  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = parseCSVLine(headerLine, delimiter);
  
  let gtinCol = headers.findIndex(h => 
    h.includes('gtin') || h.includes('barcode') || h.includes('ean') || h.includes('upc') || h.includes('code')
  );
  let nameCol = headers.findIndex(h => 
    h.includes('name') || h.includes('description') || h.includes('product') || h.includes('item')
  );

  if (gtinCol === -1) gtinCol = 0;
  if (nameCol === -1) nameCol = 1;

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    if (cols.length > Math.max(gtinCol, nameCol)) {
      const gtin = cols[gtinCol].replace(/[^0-9]/g, '');
      const name = cols[nameCol].trim();
      if (gtin && gtin.length >= 8) {
        data.push({ gtin, name });
      }
    }
  }

  return data;
}

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

function exportTSV(rows) {
  const headers = ['Scan Time', 'Raw', 'GTIN14', 'GTIN13', 'Expiry', 'Batch', 'Serial', 'Qty', 'Product Name', 'Match Type'];
  const lines = [headers.join('\t')];
  
  for (const row of rows) {
    lines.push([
      row.scanTime || '',
      row.raw || '',
      row.gtin14 || '',
      row.gtin13 || '',
      row.expiryFormatted || '',
      row.batch || '',
      row.serial || '',
      row.qty || '1',
      row.productName || '',
      row.matchType || ''
    ].join('\t'));
  }
  
  return lines.join('\n');
}

function exportCSV(rows) {
  const headers = ['Scan Time', 'Raw', 'GTIN14', 'GTIN13', 'Expiry', 'Batch', 'Serial', 'Qty', 'Product Name', 'Match Type'];
  const lines = [headers.map(h => `"${h}"`).join(',')];
  
  for (const row of rows) {
    lines.push([
      row.scanTime || '',
      row.raw || '',
      row.gtin14 || '',
      row.gtin13 || '',
      row.expiryFormatted || '',
      row.batch || '',
      row.serial || '',
      row.qty || '1',
      row.productName || '',
      row.matchType || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  
  return lines.join('\n');
}

function backupJSON() {
  return JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    history: AppState.historyRows,
    master: AppState.masterData,
    masterLastUpdated: AppState.masterLastUpdated
  }, null, 2);
}

async function restoreJSON(json) {
  const data = JSON.parse(json);
  
  if (data.history && Array.isArray(data.history)) {
    await clearHistory();
    for (const entry of data.history) {
      await saveHistory(entry);
    }
    AppState.historyRows = data.history;
  }
  
  if (data.master && Array.isArray(data.master)) {
    await saveMasterData(data.master);
    AppState.masterData = data.master;
    AppState.masterIndex = buildMasterIndex(data.master);
    AppState.masterCount = data.master.length;
    AppState.masterLoaded = data.master.length > 0;
    AppState.masterLastUpdated = data.masterLastUpdated || new Date().toISOString();
  }
}

// ============================================================================
// UI UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="color: var(--${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'warning'})">
      ${type === 'success' ? '<polyline points="20 6 9 17 4 12"></polyline>' : 
        type === 'error' ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>' :
        '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDateTime(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.add('active');
  confirmCallback = callback;
}

function hideConfirm() {
  document.getElementById('confirmModal').classList.remove('active');
  confirmCallback = null;
}

// ============================================================================
// UI RENDERING
// ============================================================================

function updateUI() {
  document.getElementById('historyCount').textContent = AppState.historyRows.length;
  document.getElementById('masterCount').textContent = AppState.masterCount;
  document.getElementById('masterTotalProducts').textContent = AppState.masterCount;
  document.getElementById('masterUniqueGtins').textContent = AppState.masterIndex.exact.size;
  document.getElementById('masterLastUpdated').textContent = AppState.masterLastUpdated 
    ? formatDateTime(AppState.masterLastUpdated) 
    : 'Never';
  
  document.getElementById('backupHistoryCount').textContent = AppState.historyRows.length;
  document.getElementById('backupMasterCount').textContent = AppState.masterCount;
  
  const backupSize = new Blob([backupJSON()]).size;
  document.getElementById('backupSize').textContent = (backupSize / 1024).toFixed(1) + ' KB';
  
  const status = document.getElementById('connectionStatus');
  if (navigator.onLine) {
    status.className = 'status-badge online';
    status.innerHTML = '<span class="status-dot"></span><span>Online</span>';
  } else {
    status.className = 'status-badge offline';
    status.innerHTML = '<span class="status-dot"></span><span>Offline</span>';
  }
  
  renderHistoryTable();
  renderMasterPreview();
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyBody');
  const emptyState = document.getElementById('historyEmpty');
  const tableContainer = document.getElementById('tableContainer');
  
  let filtered = [...AppState.historyRows];
  
  if (AppState.filters.search) {
    const search = AppState.filters.search.toLowerCase();
    filtered = filtered.filter(row => 
      (row.gtin14 && row.gtin14.toLowerCase().includes(search)) ||
      (row.gtin13 && row.gtin13.toLowerCase().includes(search)) ||
      (row.productName && row.productName.toLowerCase().includes(search)) ||
      (row.batch && row.batch.toLowerCase().includes(search)) ||
      (row.serial && row.serial.toLowerCase().includes(search))
    );
  }
  
  if (AppState.filters.expired) {
    filtered = filtered.filter(row => row.expiryStatus === 'expired');
  }
  if (AppState.filters.soon) {
    filtered = filtered.filter(row => row.expiryStatus === 'soon');
  }
  if (AppState.filters.missing) {
    filtered = filtered.filter(row => row.expiryStatus === 'missing');
  }
  
  filtered.sort((a, b) => {
    let aVal, bVal;
    if (AppState.sorting.field === 'time') {
      aVal = new Date(a.scanTime || 0).getTime();
      bVal = new Date(b.scanTime || 0).getTime();
    } else if (AppState.sorting.field === 'expiry') {
      aVal = a.expiry ? new Date(a.expiry).getTime() : (AppState.sorting.direction === 'asc' ? Infinity : -Infinity);
      bVal = b.expiry ? new Date(b.expiry).getTime() : (AppState.sorting.direction === 'asc' ? Infinity : -Infinity);
    }
    return AppState.sorting.direction === 'asc' ? aVal - bVal : bVal - aVal;
  });
  
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / AppState.pagination.perPage));
  AppState.pagination.page = Math.min(AppState.pagination.page, totalPages);
  
  const startIdx = (AppState.pagination.page - 1) * AppState.pagination.perPage;
  const endIdx = Math.min(startIdx + AppState.pagination.perPage, totalItems);
  const pageItems = filtered.slice(startIdx, endIdx);
  
  if (AppState.historyRows.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    tableContainer.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';
    
    tbody.innerHTML = pageItems.map(row => `
      <tr>
        <td class="mono">${formatDateTime(row.scanTime)}</td>
        <td class="mono truncate" title="${escapeHtml(row.raw)}">${escapeHtml(row.raw).substring(0, 30)}${row.raw.length > 30 ? '...' : ''}</td>
        <td class="mono">${row.gtin14 || '-'}</td>
        <td class="mono">${row.gtin13 || '-'}</td>
        <td>
          <span class="expiry-badge ${row.expiryStatus}">
            ${row.expiryFormatted || '-'}
          </span>
        </td>
        <td class="mono">${row.batch || '-'}</td>
        <td class="mono">${row.serial || '-'}</td>
        <td class="mono">${row.qty || '1'}</td>
        <td class="truncate" title="${escapeHtml(row.productName)}">${escapeHtml(row.productName) || '-'}</td>
        <td><span class="match-badge ${row.matchType.toLowerCase().replace('-', '')}">${row.matchType}</span></td>
      </tr>
    `).join('');
  }
  
  document.getElementById('paginationInfo').textContent = 
    totalItems === 0 ? 'No entries' : `Showing ${startIdx + 1}-${endIdx} of ${totalItems}`;
  document.getElementById('pageIndicator').textContent = `Page ${AppState.pagination.page} of ${totalPages}`;
  document.getElementById('prevPageBtn').disabled = AppState.pagination.page <= 1;
  document.getElementById('nextPageBtn').disabled = AppState.pagination.page >= totalPages;
}

function renderMasterPreview() {
  const tbody = document.getElementById('masterPreviewBody');
  const emptyState = document.getElementById('masterEmpty');
  const searchInput = document.getElementById('masterSearchInput');
  
  if (AppState.masterData.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    tbody.parentElement.parentElement.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    tbody.parentElement.parentElement.style.display = 'block';
    
    let filtered = AppState.masterData;
    const search = searchInput.value.toLowerCase();
    if (search) {
      filtered = filtered.filter(item => 
        item.gtin.toLowerCase().includes(search) ||
        item.name.toLowerCase().includes(search)
      );
    }
    
    const preview = filtered.slice(0, 100);
    tbody.innerHTML = preview.map(item => `
      <tr>
        <td class="mono">${item.gtin}</td>
        <td>${escapeHtml(item.name)}</td>
      </tr>
    `).join('');
    
    if (filtered.length > 100) {
      tbody.innerHTML += `
        <tr>
          <td colspan="2" style="text-align: center; color: var(--text-muted);">
            ... and ${filtered.length - 100} more products
          </td>
        </tr>
      `;
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// SCAN PROCESSING
// ============================================================================

async function processScan(raw) {
  const parsed = parseGs1(raw);
  const match = matchProduct(parsed, AppState.masterIndex);
  
  const entry = {
    scanTime: new Date().toISOString(),
    raw: raw,
    gtin14: parsed.gtin14,
    gtin13: parsed.gtin13,
    expiry: parsed.expiry,
    expiryFormatted: parsed.expiryFormatted,
    expiryStatus: parsed.expiryStatus,
    batch: parsed.batch,
    serial: parsed.serial,
    qty: parsed.qty || '1',
    productName: match.name,
    matchType: parsed.valid ? match.matchType : 'INVALID'
  };
  
  await saveHistory(entry);
  AppState.historyRows.unshift(entry);
  
  updateRecentScan(entry);
  updateUI();
  
  return entry;
}

function updateRecentScan(entry) {
  const container = document.getElementById('recentScan');
  container.style.display = 'flex';
  document.getElementById('recentGtin').textContent = entry.gtin14 || entry.raw.substring(0, 20);
  document.getElementById('recentName').textContent = entry.productName || 'Unknown product';
  
  const expiryBadge = document.getElementById('recentExpiry');
  expiryBadge.textContent = entry.expiryFormatted || 'No expiry';
  expiryBadge.className = `expiry-badge ${entry.expiryStatus}`;
}

// ============================================================================
// BARCODE SCANNER
// ============================================================================

let codeReader = null;

async function initScanner() {
  try {
    if (!('BarcodeDetector' in window)) {
      const { BrowserMultiFormatReader } = await import('https://unpkg.com/@aspect-build/aspect-workflows-reporter@latest');
      codeReader = new BrowserMultiFormatReader();
    }
  } catch (e) {
    console.warn('ZXing library not available, using native BarcodeDetector if available');
  }
}

async function startScanning() {
  const video = document.getElementById('scannerVideo');
  const overlay = document.getElementById('scannerOverlay');
  const viewfinder = document.getElementById('viewfinder');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  const switchBtn = document.getElementById('switchCameraBtn');

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    AppState.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = AppState.cameraStream;
    await video.play();

    overlay.style.display = 'none';
    viewfinder.style.display = 'block';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    switchBtn.style.display = 'inline-flex';
    AppState.scanning = true;

    startBarcodeDetection(video);
    showToast('Camera started. Point at a barcode.', 'success');
  } catch (err) {
    console.error('Camera error:', err);
    showToast('Could not access camera: ' + err.message, 'error');
  }
}

function stopScanning() {
  const video = document.getElementById('scannerVideo');
  const overlay = document.getElementById('scannerOverlay');
  const viewfinder = document.getElementById('viewfinder');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  const switchBtn = document.getElementById('switchCameraBtn');

  if (AppState.cameraStream) {
    AppState.cameraStream.getTracks().forEach(track => track.stop());
    AppState.cameraStream = null;
  }

  video.srcObject = null;
  overlay.style.display = 'flex';
  viewfinder.style.display = 'none';
  startBtn.style.display = 'inline-flex';
  stopBtn.style.display = 'none';
  switchBtn.style.display = 'none';
  AppState.scanning = false;
}

let lastScannedCode = '';
let lastScanTime = 0;

async function startBarcodeDetection(video) {
  if ('BarcodeDetector' in window) {
    const detector = new BarcodeDetector({
      formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
    });

    const detectFrame = async () => {
      if (!AppState.scanning) return;

      try {
        const barcodes = await detector.detect(video);
        for (const barcode of barcodes) {
          const now = Date.now();
          if (barcode.rawValue !== lastScannedCode || now - lastScanTime > 2000) {
            lastScannedCode = barcode.rawValue;
            lastScanTime = now;
            await processScan(barcode.rawValue);
            showToast('Barcode scanned!', 'success');
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }

      if (AppState.scanning) {
        requestAnimationFrame(detectFrame);
      }
    };

    detectFrame();
  } else {
    showToast('BarcodeDetector not supported. Try uploading an image.', 'warning');
  }
}

async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          if ('BarcodeDetector' in window) {
            const detector = new BarcodeDetector({
              formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
            });
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              for (const barcode of barcodes) {
                await processScan(barcode.rawValue);
              }
              showToast(`Found ${barcodes.length} barcode(s)`, 'success');
              resolve(barcodes);
            } else {
              showToast('No barcode found in image', 'warning');
              resolve([]);
            }
          } else {
            showToast('BarcodeDetector not available', 'error');
            reject(new Error('BarcodeDetector not available'));
          }
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      switchTab(tabId);
    });
  });

  // Scanner controls
  document.getElementById('startScanBtn').addEventListener('click', startScanning);
  document.getElementById('stopScanBtn').addEventListener('click', stopScanning);
  
  // Image upload
  document.getElementById('imageUpload').addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await processImageFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Manual entry
  document.getElementById('manualAddBtn').addEventListener('click', async () => {
    const input = document.getElementById('manualInput');
    const raw = input.value.trim();
    if (raw) {
      await processScan(raw);
      input.value = '';
      showToast('Entry added to history', 'success');
    }
  });

  document.getElementById('manualInput').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      document.getElementById('manualAddBtn').click();
    }
  });

  // Bulk paste
  document.getElementById('processBulkBtn').addEventListener('click', async () => {
    const input = document.getElementById('bulkInput');
    const lines = input.value.split('\n').filter(line => line.trim());
    
    let valid = 0, invalid = 0, matched = 0;
    
    for (const line of lines) {
      const entry = await processScan(line.trim());
      if (entry.matchType !== 'INVALID') valid++;
      else invalid++;
      if (entry.productName) matched++;
    }
    
    document.getElementById('bulkTotal').textContent = lines.length;
    document.getElementById('bulkValid').textContent = valid;
    document.getElementById('bulkInvalid').textContent = invalid;
    document.getElementById('bulkMatched').textContent = matched;
    
    showToast(`Processed ${lines.length} entries`, 'success');
    switchTab('history');
  });

  document.getElementById('clearBulkBtn').addEventListener('click', () => {
    document.getElementById('bulkInput').value = '';
    document.getElementById('bulkTotal').textContent = '0';
    document.getElementById('bulkValid').textContent = '0';
    document.getElementById('bulkInvalid').textContent = '0';
    document.getElementById('bulkMatched').textContent = '0';
  });

  // History controls
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      AppState.filters.search = e.target.value;
      AppState.pagination.page = 1;
      renderHistoryTable();
    }, 300);
  });

  document.getElementById('filterExpired').addEventListener('click', (e) => {
    AppState.filters.expired = !AppState.filters.expired;
    AppState.filters.soon = false;
    AppState.filters.missing = false;
    e.target.classList.toggle('active', AppState.filters.expired);
    document.getElementById('filterSoon').classList.remove('active');
    document.getElementById('filterMissing').classList.remove('active');
    AppState.pagination.page = 1;
    renderHistoryTable();
  });

  document.getElementById('filterSoon').addEventListener('click', (e) => {
    AppState.filters.soon = !AppState.filters.soon;
    AppState.filters.expired = false;
    AppState.filters.missing = false;
    e.target.classList.toggle('active', AppState.filters.soon);
    document.getElementById('filterExpired').classList.remove('active');
    document.getElementById('filterMissing').classList.remove('active');
    AppState.pagination.page = 1;
    renderHistoryTable();
  });

  document.getElementById('filterMissing').addEventListener('click', (e) => {
    AppState.filters.missing = !AppState.filters.missing;
    AppState.filters.expired = false;
    AppState.filters.soon = false;
    e.target.classList.toggle('active', AppState.filters.missing);
    document.getElementById('filterExpired').classList.remove('active');
    document.getElementById('filterSoon').classList.remove('active');
    AppState.pagination.page = 1;
    renderHistoryTable();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    const [field, dir] = e.target.value.split('-');
    AppState.sorting.field = field;
    AppState.sorting.direction = dir;
    renderHistoryTable();
  });

  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (AppState.pagination.page > 1) {
      AppState.pagination.page--;
      renderHistoryTable();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    AppState.pagination.page++;
    renderHistoryTable();
  });

  document.getElementById('exportTsvBtn').addEventListener('click', () => {
    const content = exportTSV(AppState.historyRows);
    downloadFile(content, `gs1-history-${Date.now()}.tsv`, 'text/tab-separated-values');
    showToast('TSV exported', 'success');
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const content = exportCSV(AppState.historyRows);
    downloadFile(content, `gs1-history-${Date.now()}.csv`, 'text/csv');
    showToast('CSV exported', 'success');
  });

  document.getElementById('copyLastBtn').addEventListener('click', () => {
    if (AppState.historyRows.length > 0) {
      const last = AppState.historyRows[0];
      const tsv = [last.scanTime, last.raw, last.gtin14, last.gtin13, last.expiryFormatted, 
                   last.batch, last.serial, last.qty, last.productName, last.matchType].join('\t');
      navigator.clipboard.writeText(tsv);
      showToast('Copied to clipboard', 'success');
    }
  });

  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    showConfirm('Clear History', 'Are you sure you want to delete all scan history? This cannot be undone.', async () => {
      await clearHistory();
      AppState.historyRows = [];
      updateUI();
      showToast('History cleared', 'success');
    });
  });

  // Master data controls
  const masterUploadZone = document.getElementById('masterUploadZone');
  const masterFileInput = document.getElementById('masterFileInput');

  masterUploadZone.addEventListener('click', () => masterFileInput.click());
  
  masterUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    masterUploadZone.classList.add('dragover');
  });

  masterUploadZone.addEventListener('dragleave', () => {
    masterUploadZone.classList.remove('dragover');
  });

  masterUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    masterUploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleMasterFile(e.dataTransfer.files[0]);
    }
  });

  masterFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleMasterFile(e.target.files[0]);
    }
  });

  document.getElementById('appendMasterBtn').addEventListener('click', async () => {
    if (AppState.pendingMasterData) {
      await appendMasterData(AppState.pendingMasterData);
      AppState.masterData = [...AppState.masterData, ...AppState.pendingMasterData];
      AppState.masterIndex = buildMasterIndex(AppState.masterData);
      AppState.masterCount = AppState.masterData.length;
      AppState.masterLoaded = true;
      AppState.masterLastUpdated = new Date().toISOString();
      AppState.pendingMasterData = null;
      document.getElementById('appendMasterBtn').disabled = true;
      document.getElementById('replaceMasterBtn').disabled = true;
      updateUI();
      showToast('Master data appended', 'success');
    }
  });

  document.getElementById('replaceMasterBtn').addEventListener('click', async () => {
    if (AppState.pendingMasterData) {
      await saveMasterData(AppState.pendingMasterData);
      AppState.masterData = AppState.pendingMasterData;
      AppState.masterIndex = buildMasterIndex(AppState.masterData);
      AppState.masterCount = AppState.masterData.length;
      AppState.masterLoaded = true;
      AppState.masterLastUpdated = new Date().toISOString();
      AppState.pendingMasterData = null;
      document.getElementById('appendMasterBtn').disabled = true;
      document.getElementById('replaceMasterBtn').disabled = true;
      updateUI();
      showToast('Master data replaced', 'success');
    }
  });

  document.getElementById('clearMasterBtn').addEventListener('click', () => {
    showConfirm('Clear Master Data', 'Are you sure you want to delete all product data?', async () => {
      await clearMasterData();
      AppState.masterData = [];
      AppState.masterIndex = { exact: new Map(), last8: new Map() };
      AppState.masterCount = 0;
      AppState.masterLoaded = false;
      updateUI();
      showToast('Master data cleared', 'success');
    });
  });

  let masterSearchTimeout;
  document.getElementById('masterSearchInput').addEventListener('input', () => {
    clearTimeout(masterSearchTimeout);
    masterSearchTimeout = setTimeout(renderMasterPreview, 300);
  });

  // Backup controls
  document.getElementById('backupBtn').addEventListener('click', () => {
    const content = backupJSON();
    downloadFile(content, `gs1-backup-${Date.now()}.json`, 'application/json');
    showToast('Backup downloaded', 'success');
  });

  const restoreUploadZone = document.getElementById('restoreUploadZone');
  const restoreFileInput = document.getElementById('restoreFileInput');

  restoreUploadZone.addEventListener('click', () => restoreFileInput.click());
  
  restoreUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    restoreUploadZone.classList.add('dragover');
  });

  restoreUploadZone.addEventListener('dragleave', () => {
    restoreUploadZone.classList.remove('dragover');
  });

  restoreUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    restoreUploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleRestoreFile(e.dataTransfer.files[0]);
    }
  });

  restoreFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleRestoreFile(e.target.files[0]);
    }
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    showConfirm('Clear All Data', 'This will permanently delete ALL your data including scan history and master products. Are you sure?', async () => {
      await clearHistory();
      await clearMasterData();
      AppState.historyRows = [];
      AppState.masterData = [];
      AppState.masterIndex = { exact: new Map(), last8: new Map() };
      AppState.masterCount = 0;
      AppState.masterLoaded = false;
      AppState.masterLastUpdated = null;
      updateUI();
      showToast('All data cleared', 'success');
    });
  });

  // Modal controls
  document.getElementById('closeModalBtn').addEventListener('click', hideConfirm);
  document.getElementById('cancelConfirmBtn').addEventListener('click', hideConfirm);
  document.getElementById('confirmActionBtn').addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
    }
    hideConfirm();
  });

  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') {
      hideConfirm();
    }
  });

  // Network status
  window.addEventListener('online', updateUI);
  window.addEventListener('offline', updateUI);

  // PWA install
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBanner').classList.add('show');
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('App installed!', 'success');
      }
      deferredPrompt = null;
      document.getElementById('installBanner').classList.remove('show');
    }
  });

  document.getElementById('dismissInstall').addEventListener('click', () => {
    document.getElementById('installBanner').classList.remove('show');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          startScanning();
          break;
        case 'b':
          e.preventDefault();
          const content = backupJSON();
          downloadFile(content, `gs1-backup-${Date.now()}.json`, 'application/json');
          showToast('Backup downloaded', 'success');
          break;
      }
    }
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
    tab.setAttribute('aria-selected', tab.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });

  AppState.currentTab = tabId;

  if (tabId !== 'scan' && AppState.scanning) {
    stopScanning();
  }
}

function handleMasterFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = parseMasterFile(e.target.result, file.name);
      if (data.length > 0) {
        AppState.pendingMasterData = data;
        document.getElementById('appendMasterBtn').disabled = false;
        document.getElementById('replaceMasterBtn').disabled = false;
        showToast(`Parsed ${data.length} products from file. Click Replace or Append.`, 'success');
      } else {
        showToast('No valid products found in file', 'error');
      }
    } catch (err) {
      showToast('Error parsing file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function handleRestoreFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await restoreJSON(e.target.result);
      updateUI();
      showToast('Backup restored successfully', 'success');
    } catch (err) {
      showToast('Error restoring backup: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  try {
    await initDB();
    
    const history = await loadAllHistory();
    AppState.historyRows = history.sort((a, b) => 
      new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime()
    );
    
    const master = await loadMasterData();
    if (master.length > 0) {
      AppState.masterData = master;
      AppState.masterIndex = buildMasterIndex(master);
      AppState.masterCount = master.length;
      AppState.masterLoaded = true;
      AppState.masterLastUpdated = await loadSetting('masterLastUpdated');
    }
    
    setupEventListeners();
    updateUI();
    
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered');
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    }
    
    console.log('GS1 Parser PWA initialized');
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Error initializing app', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
