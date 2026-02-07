/**
 * ExpiryTrack - Pharmacy Barcode Scanner
 * A modern PWA for scanning GS1 barcodes and tracking product expiry dates
 */

// ============================================
// APP STATE
// ============================================
const AppState = {
  scanning: false,
  videoStream: null,
  detector: null,
  lastScanTime: 0,
  lastScanCode: '',
  currentTab: 'scan',
  facingMode: 'environment',
  
  // Master data
  masterData: new Map(),
  masterIndex: { exact: new Map(), last8: new Map() },
  masterCount: 0,
  
  // History
  history: [],
  filteredHistory: [],
  searchQuery: '',
  activeFilter: 'all',
  
  // Pending file
  pendingMasterFile: null
};

// ============================================
// DATABASE (IndexedDB)
// ============================================
const DB_NAME = 'expirytrack-db';
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
    
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      
      if (!database.objectStoreNames.contains('history')) {
        const historyStore = database.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        historyStore.createIndex('scanTime', 'scanTime', { unique: false });
        historyStore.createIndex('gtin14', 'gtin14', { unique: false });
      }
      
      if (!database.objectStoreNames.contains('master')) {
        database.createObjectStore('master', { keyPath: 'gtin' });
      }
      
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

async function dbPut(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// GS1 BARCODE PARSING
// ============================================
function parseGS1(rawCode) {
  const result = {
    valid: false,
    raw: rawCode,
    gtin14: '',
    gtin13: '',
    expiry: null,
    expiryFormatted: '',
    expiryStatus: 'missing',
    batch: '',
    serial: '',
    qty: '1'
  };
  
  if (!rawCode || typeof rawCode !== 'string') {
    return result;
  }
  
  let code = rawCode.trim();
  
  // Replace FNC1 separator (ASCII 29) with delimiter
  code = code.replace(/\x1d/g, '|');
  
  // Convert raw format to parenthesized if needed
  if (!code.includes('(') && /^\d{2}/.test(code)) {
    code = convertToParenthesized(code);
  }
  
  // Extract Application Identifiers
  const patterns = {
    gtin: /\(01\)(\d{12,14})/,
    expiry: /\(17\)(\d{6})/,
    batch: /\(10\)([^\(|\x1d]+)/,
    serial: /\(21\)([^\(|\x1d]+)/,
    qty: /\(30\)(\d+)/
  };
  
  // Extract GTIN (AI 01)
  const gtinMatch = code.match(patterns.gtin);
  if (gtinMatch) {
    let gtin = gtinMatch[1];
    // Pad to 14 digits
    result.gtin14 = gtin.padStart(14, '0');
    // Derive GTIN-13
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.substring(1) : result.gtin14;
    result.valid = true;
  }
  
  // Extract Expiry Date (AI 17)
  const expiryMatch = code.match(patterns.expiry);
  if (expiryMatch) {
    const parsed = parseExpiryDate(expiryMatch[1]);
    result.expiry = parsed.iso;
    result.expiryFormatted = parsed.formatted;
    result.expiryStatus = calculateExpiryStatus(parsed.iso);
  }
  
  // Extract Batch (AI 10)
  const batchMatch = code.match(patterns.batch);
  if (batchMatch) {
    result.batch = batchMatch[1].replace(/\|/g, '').trim();
  }
  
  // Extract Serial (AI 21)
  const serialMatch = code.match(patterns.serial);
  if (serialMatch) {
    result.serial = serialMatch[1].replace(/\|/g, '').trim();
  }
  
  // Extract Quantity (AI 30)
  const qtyMatch = code.match(patterns.qty);
  if (qtyMatch) {
    result.qty = qtyMatch[1];
  }
  
  return result;
}

function convertToParenthesized(code) {
  // Common AI patterns and their lengths
  const aiLengths = {
    '01': 14, '02': 14, // GTIN
    '10': -1, '21': -1, '22': -1, // Variable length
    '11': 6, '13': 6, '15': 6, '17': 6, // Dates
    '30': -1, '37': -1, // Quantities
    '00': 18, '20': 2
  };
  
  let result = '';
  let pos = 0;
  
  while (pos < code.length) {
    const ai2 = code.substring(pos, pos + 2);
    const ai3 = code.substring(pos, pos + 3);
    
    let ai = '';
    let length = 0;
    
    if (aiLengths[ai2] !== undefined) {
      ai = ai2;
      length = aiLengths[ai2];
    } else if (aiLengths[ai3] !== undefined) {
      ai = ai3;
      length = aiLengths[ai3];
    } else {
      pos++;
      continue;
    }
    
    pos += ai.length;
    
    if (length > 0) {
      result += `(${ai})${code.substring(pos, pos + length)}`;
      pos += length;
    } else {
      // Variable length - read until next AI or separator
      let value = '';
      while (pos < code.length) {
        const nextChar = code[pos];
        if (nextChar === '|' || nextChar === '\x1d') {
          pos++;
          break;
        }
        // Check if this looks like a new AI
        const potential2 = code.substring(pos, pos + 2);
        const potential3 = code.substring(pos, pos + 3);
        if ((aiLengths[potential2] !== undefined || aiLengths[potential3] !== undefined) && value.length > 0) {
          break;
        }
        value += nextChar;
        pos++;
      }
      result += `(${ai})${value}`;
    }
  }
  
  return result || code;
}

function parseExpiryDate(yymmdd) {
  const year = parseInt('20' + yymmdd.substring(0, 2));
  const month = parseInt(yymmdd.substring(2, 4));
  let day = parseInt(yymmdd.substring(4, 6));
  
  // Day 00 means last day of month
  if (day === 0) {
    day = new Date(year, month, 0).getDate();
  }
  
  const date = new Date(year, month - 1, day);
  
  return {
    iso: date.toISOString().split('T')[0],
    formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  };
}

function calculateExpiryStatus(isoDate) {
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

// ============================================
// PRODUCT MATCHING
// ============================================
function matchProduct(gtin14, gtin13) {
  const index = AppState.masterIndex;
  
  // Exact match
  if (index.exact.has(gtin14)) {
    return { name: index.exact.get(gtin14), matchType: 'EXACT' };
  }
  if (index.exact.has(gtin13)) {
    return { name: index.exact.get(gtin13), matchType: 'EXACT' };
  }
  
  // Last-8 match
  const last8 = gtin14.slice(-8);
  if (index.last8.has(last8)) {
    const matches = index.last8.get(last8);
    if (matches.length === 1) {
      return { name: matches[0].name, matchType: 'LAST8' };
    } else if (matches.length > 1) {
      return { name: matches[0].name + ' (ambiguous)', matchType: 'AMBIGUOUS' };
    }
  }
  
  return { name: '', matchType: 'NONE' };
}

function buildMasterIndex() {
  const exact = new Map();
  const last8 = new Map();
  
  AppState.masterData.forEach((name, gtin) => {
    // Exact index
    exact.set(gtin, name);
    
    // Also add GTIN-14 and GTIN-13 variants
    const gtin14 = gtin.padStart(14, '0');
    const gtin13 = gtin14.startsWith('0') ? gtin14.substring(1) : gtin14;
    
    exact.set(gtin14, name);
    exact.set(gtin13, name);
    
    // Last-8 index
    const key = gtin14.slice(-8);
    if (!last8.has(key)) {
      last8.set(key, []);
    }
    last8.get(key).push({ gtin, name });
  });
  
  AppState.masterIndex = { exact, last8 };
}

// ============================================
// BARCODE SCANNER
// ============================================
async function startScanning() {
  try {
    // Check if BarcodeDetector is supported
    if (!('BarcodeDetector' in window)) {
      showToast('Barcode scanning not supported in this browser', 'error');
      return;
    }
    
    // Initialize detector
    AppState.detector = new BarcodeDetector({
      formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
    });
    
    // Get camera stream
    const constraints = {
      video: {
        facingMode: { ideal: AppState.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    
    AppState.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const video = document.getElementById('video-preview');
    video.srcObject = AppState.videoStream;
    await video.play();
    
    AppState.scanning = true;
    updateScanButton();
    
    // Start detection loop
    detectLoop();
    
    showToast('Scanner started', 'success');
  } catch (error) {
    console.error('Scanner error:', error);
    showToast('Failed to start scanner: ' + error.message, 'error');
  }
}

async function stopScanning() {
  AppState.scanning = false;
  
  if (AppState.videoStream) {
    AppState.videoStream.getTracks().forEach(track => track.stop());
    AppState.videoStream = null;
  }
  
  const video = document.getElementById('video-preview');
  video.srcObject = null;
  
  updateScanButton();
}

async function detectLoop() {
  if (!AppState.scanning || !AppState.detector) return;
  
  const video = document.getElementById('video-preview');
  
  try {
    const barcodes = await AppState.detector.detect(video);
    
    for (const barcode of barcodes) {
      const code = barcode.rawValue;
      const now = Date.now();
      
      // Debounce: same code within 2 seconds
      if (code === AppState.lastScanCode && now - AppState.lastScanTime < 2000) {
        continue;
      }
      
      AppState.lastScanCode = code;
      AppState.lastScanTime = now;
      
      // Process the scan
      await processScan(code);
    }
  } catch (error) {
    console.error('Detection error:', error);
  }
  
  // Continue loop
  if (AppState.scanning) {
    requestAnimationFrame(detectLoop);
  }
}

async function processScan(rawCode) {
  const parsed = parseGS1(rawCode);
  
  if (!parsed.valid) {
    showToast('Invalid barcode format', 'warning');
    return;
  }
  
  // Match product
  const match = matchProduct(parsed.gtin14, parsed.gtin13);
  
  // Create history entry
  const entry = {
    scanTime: new Date().toISOString(),
    raw: rawCode,
    gtin14: parsed.gtin14,
    gtin13: parsed.gtin13,
    expiry: parsed.expiry,
    expiryFormatted: parsed.expiryFormatted,
    expiryStatus: parsed.expiryStatus,
    batch: parsed.batch,
    serial: parsed.serial,
    qty: parsed.qty,
    productName: match.name,
    matchType: match.matchType
  };
  
  // Save to database
  await dbPut('history', entry);
  
  // Update state
  AppState.history.unshift(entry);
  updateHistoryList();
  updateStats();
  
  // Update recent scan card
  showRecentScan(entry);
  
  // Vibrate if supported
  if (navigator.vibrate) {
    navigator.vibrate(100);
  }
  
  showToast(`Scanned: ${entry.gtin13}`, 'success');
}

function updateScanButton() {
  const btn = document.getElementById('btnToggleScan');
  const icon = document.getElementById('scanIcon');
  
  if (AppState.scanning) {
    btn.classList.add('scanning');
    icon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="1"/>';
    document.getElementById('scanLine').style.display = 'block';
    document.getElementById('scannerHint').textContent = 'Scanning...';
  } else {
    btn.classList.remove('scanning');
    icon.innerHTML = '<path d="M23 19a2 2 0 0 1-2 2h-3v-2h3V5h-3V3h3a2 2 0 0 1 2 2zM1 5a2 2 0 0 1 2-2h3v2H3v14h3v2H3a2 2 0 0 1-2-2z"/><path d="M7 12h10M12 7v10"/>';
    document.getElementById('scanLine').style.display = 'none';
    document.getElementById('scannerHint').textContent = 'Point camera at barcode';
  }
}

function showRecentScan(entry) {
  const card = document.getElementById('recentScan');
  card.style.display = 'block';
  
  document.getElementById('recentProduct').textContent = entry.productName || 'Unknown Product';
  document.getElementById('recentGtin').textContent = entry.gtin13 || '-';
  document.getElementById('recentExpiry').textContent = entry.expiryFormatted || '-';
  document.getElementById('recentBatch').textContent = entry.batch || '-';
  document.getElementById('recentStatus').textContent = entry.expiryStatus.toUpperCase();
  document.getElementById('recentTime').textContent = 'Just now';
}

// ============================================
// MASTER DATA MANAGEMENT
// ============================================
async function loadMasterData() {
  try {
    const data = await dbGetAll('master');
    AppState.masterData = new Map(data.map(item => [item.gtin, item.name]));
    AppState.masterCount = AppState.masterData.size;
    buildMasterIndex();
    updateStats();
  } catch (error) {
    console.error('Error loading master data:', error);
  }
}

function parseMasterFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('File is empty');
  }
  
  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  
  // Parse header
  const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Find column indices
  const barcodeCol = headers.findIndex(h => 
    ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku'].some(p => h.includes(p))
  );
  const nameCol = headers.findIndex(h => 
    ['name', 'product', 'description', 'item', 'title'].some(p => h.includes(p))
  );
  
  if (barcodeCol === -1 || nameCol === -1) {
    throw new Error('Could not find Barcode and Product Name columns');
  }
  
  // Parse data rows
  const products = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    if (cols.length <= Math.max(barcodeCol, nameCol)) continue;
    
    const barcode = cols[barcodeCol].replace(/[^0-9]/g, '');
    const name = cols[nameCol].trim();
    
    if (barcode.length >= 8 && name) {
      products.push({ gtin: barcode, name });
    }
  }
  
  return products;
}

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

async function saveMasterData(products, append = false) {
  if (!append) {
    await dbClear('master');
    AppState.masterData.clear();
  }
  
  for (const product of products) {
    await dbPut('master', product);
    AppState.masterData.set(product.gtin, product.name);
  }
  
  AppState.masterCount = AppState.masterData.size;
  buildMasterIndex();
  updateStats();
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
async function loadHistory() {
  try {
    const data = await dbGetAll('history');
    AppState.history = data.sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));
    AppState.filteredHistory = [...AppState.history];
    updateHistoryList();
    updateStats();
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

function filterHistory() {
  let filtered = [...AppState.history];
  
  // Apply status filter
  if (AppState.activeFilter !== 'all') {
    filtered = filtered.filter(item => item.expiryStatus === AppState.activeFilter);
  }
  
  // Apply search
  if (AppState.searchQuery) {
    const query = AppState.searchQuery.toLowerCase();
    filtered = filtered.filter(item => 
      (item.gtin14 && item.gtin14.includes(query)) ||
      (item.gtin13 && item.gtin13.includes(query)) ||
      (item.productName && item.productName.toLowerCase().includes(query)) ||
      (item.batch && item.batch.toLowerCase().includes(query)) ||
      (item.serial && item.serial.toLowerCase().includes(query))
    );
  }
  
  AppState.filteredHistory = filtered;
  updateHistoryList();
}

function updateHistoryList() {
  const container = document.getElementById('historyList');
  const emptyState = document.getElementById('emptyHistory');
  
  if (AppState.filteredHistory.length === 0) {
    emptyState.style.display = 'block';
    // Remove existing cards
    container.querySelectorAll('.history-card').forEach(el => el.remove());
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Generate HTML for history cards
  const html = AppState.filteredHistory.slice(0, 50).map(item => `
    <div class="history-card">
      <div class="history-card-header">
        <div class="history-product-name">${item.productName || 'Unknown Product'}</div>
        <span class="expiry-badge ${item.expiryStatus}">${item.expiryStatus === 'missing' ? 'No Expiry' : item.expiryStatus}</span>
      </div>
      <div class="history-card-grid">
        <div class="history-field">
          <div class="history-field-label">GTIN</div>
          <div class="history-field-value">${item.gtin13 || '-'}</div>
        </div>
        <div class="history-field">
          <div class="history-field-label">Expiry</div>
          <div class="history-field-value">${item.expiryFormatted || '-'}</div>
        </div>
        <div class="history-field">
          <div class="history-field-label">Batch</div>
          <div class="history-field-value">${item.batch || '-'}</div>
        </div>
      </div>
    </div>
  `).join('');
  
  // Remove old cards and insert new ones
  container.querySelectorAll('.history-card').forEach(el => el.remove());
  container.insertAdjacentHTML('afterbegin', html);
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
function exportTSV() {
  if (AppState.history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  const headers = ['Scan Time', 'GTIN14', 'GTIN13', 'Expiry', 'Batch', 'Serial', 'Qty', 'Product Name', 'Match Type', 'Status'];
  const rows = AppState.history.map(item => [
    formatDateTime(item.scanTime),
    item.gtin14,
    item.gtin13,
    item.expiryFormatted || '',
    item.batch,
    item.serial,
    item.qty,
    item.productName,
    item.matchType,
    item.expiryStatus
  ]);
  
  const content = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  downloadFile(content, 'expirytrack-export.tsv', 'text/tab-separated-values');
  showToast('TSV exported', 'success');
}

function exportCSV() {
  if (AppState.history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  const headers = ['Scan Time', 'GTIN14', 'GTIN13', 'Expiry', 'Batch', 'Serial', 'Qty', 'Product Name', 'Match Type', 'Status'];
  const rows = AppState.history.map(item => [
    formatDateTime(item.scanTime),
    item.gtin14,
    item.gtin13,
    item.expiryFormatted || '',
    item.batch,
    item.serial,
    item.qty,
    item.productName,
    item.matchType,
    item.expiryStatus
  ]);
  
  const csvContent = [headers, ...rows].map(row => 
    row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadFile(csvContent, 'expirytrack-export.csv', 'text/csv');
  showToast('CSV exported', 'success');
}

async function downloadBackup() {
  const backup = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'ExpiryTrack',
    history: AppState.history,
    master: Array.from(AppState.masterData.entries()).map(([gtin, name]) => ({ gtin, name }))
  };
  
  const content = JSON.stringify(backup, null, 2);
  downloadFile(content, 'expirytrack-backup.json', 'application/json');
  showToast('Backup downloaded', 'success');
}

async function restoreBackup(file) {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);
    
    if (!backup.history && !backup.master) {
      throw new Error('Invalid backup file');
    }
    
    // Restore history
    if (backup.history) {
      await dbClear('history');
      for (const item of backup.history) {
        await dbPut('history', item);
      }
      AppState.history = backup.history;
      AppState.filteredHistory = [...backup.history];
    }
    
    // Restore master
    if (backup.master) {
      await dbClear('master');
      AppState.masterData.clear();
      for (const item of backup.master) {
        await dbPut('master', item);
        AppState.masterData.set(item.gtin, item.name);
      }
      AppState.masterCount = AppState.masterData.size;
      buildMasterIndex();
    }
    
    updateHistoryList();
    updateStats();
    showToast('Backup restored successfully', 'success');
  } catch (error) {
    console.error('Restore error:', error);
    showToast('Failed to restore backup: ' + error.message, 'error');
  }
}

// ============================================
// BULK PROCESSING
// ============================================
async function processBulk() {
  const textarea = document.getElementById('bulkTextarea');
  const lines = textarea.value.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    showToast('No data to process', 'warning');
    return;
  }
  
  let total = 0, valid = 0, invalid = 0, matched = 0;
  
  for (const line of lines) {
    total++;
    const parsed = parseGS1(line.trim());
    
    if (!parsed.valid) {
      invalid++;
      continue;
    }
    
    valid++;
    
    const match = matchProduct(parsed.gtin14, parsed.gtin13);
    if (match.name) matched++;
    
    const entry = {
      scanTime: new Date().toISOString(),
      raw: line.trim(),
      gtin14: parsed.gtin14,
      gtin13: parsed.gtin13,
      expiry: parsed.expiry,
      expiryFormatted: parsed.expiryFormatted,
      expiryStatus: parsed.expiryStatus,
      batch: parsed.batch,
      serial: parsed.serial,
      qty: parsed.qty,
      productName: match.name,
      matchType: match.matchType
    };
    
    await dbPut('history', entry);
    AppState.history.unshift(entry);
  }
  
  // Update stats display
  document.getElementById('bulkStats').style.display = 'grid';
  document.getElementById('bulkTotal').textContent = total;
  document.getElementById('bulkValid').textContent = valid;
  document.getElementById('bulkInvalid').textContent = invalid;
  document.getElementById('bulkMatched').textContent = matched;
  
  updateHistoryList();
  updateStats();
  
  showToast(`Processed ${valid} of ${total} barcodes`, 'success');
}

// ============================================
// UI HELPERS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  
  const icons = {
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${icons[type] || icons.info}
    </svg>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showConfirm(title, text) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    
    modal.classList.add('active');
    
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    
    const cleanup = () => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    };
    
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function switchTab(tabId) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabId);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });
  
  AppState.currentTab = tabId;
  
  // Stop scanning when leaving scan tab
  if (tabId !== 'scan' && AppState.scanning) {
    stopScanning();
  }
}

function updateStats() {
  document.getElementById('masterCount').textContent = AppState.masterCount.toLocaleString();
  document.getElementById('historyCount').textContent = AppState.history.length.toLocaleString();
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
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

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
  
  // Scanner controls
  document.getElementById('btnToggleScan').addEventListener('click', () => {
    if (AppState.scanning) {
      stopScanning();
    } else {
      startScanning();
    }
  });
  
  document.getElementById('btnSwitchCamera').addEventListener('click', async () => {
    AppState.facingMode = AppState.facingMode === 'environment' ? 'user' : 'environment';
    if (AppState.scanning) {
      await stopScanning();
      await startScanning();
    }
  });
  
  document.getElementById('btnUploadImage').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const img = new Image();
      img.onload = async () => {
        if (AppState.detector) {
          try {
            const barcodes = await AppState.detector.detect(img);
            for (const barcode of barcodes) {
              await processScan(barcode.rawValue);
            }
            if (barcodes.length === 0) {
              showToast('No barcode found in image', 'warning');
            }
          } catch (error) {
            showToast('Failed to scan image', 'error');
          }
        }
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
  
  // Manual entry
  document.getElementById('btnManualAdd').addEventListener('click', () => {
    const input = document.getElementById('manualInput');
    if (input.value.trim()) {
      processScan(input.value.trim());
      input.value = '';
    }
  });
  
  document.getElementById('manualInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btnManualAdd').click();
    }
  });
  
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value;
    filterHistory();
  });
  
  // Filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      AppState.activeFilter = chip.dataset.filter;
      filterHistory();
    });
  });
  
  // Master data upload
  const uploadZone = document.getElementById('uploadZone');
  const masterFileInput = document.getElementById('masterFileInput');
  
  uploadZone.addEventListener('click', () => masterFileInput.click());
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      AppState.pendingMasterFile = file;
      showToast(`File selected: ${file.name}`, 'info');
    }
  });
  
  masterFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      AppState.pendingMasterFile = file;
      showToast(`File selected: ${file.name}`, 'info');
    }
  });
  
  document.getElementById('btnReplaceMaster').addEventListener('click', async () => {
    if (!AppState.pendingMasterFile) {
      showToast('Please select a file first', 'warning');
      return;
    }
    
    try {
      const content = await AppState.pendingMasterFile.text();
      const products = parseMasterFile(content, AppState.pendingMasterFile.name);
      await saveMasterData(products, false);
      showToast(`Loaded ${products.length} products`, 'success');
      AppState.pendingMasterFile = null;
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  });
  
  document.getElementById('btnAppendMaster').addEventListener('click', async () => {
    if (!AppState.pendingMasterFile) {
      showToast('Please select a file first', 'warning');
      return;
    }
    
    try {
      const content = await AppState.pendingMasterFile.text();
      const products = parseMasterFile(content, AppState.pendingMasterFile.name);
      await saveMasterData(products, true);
      showToast(`Added ${products.length} products`, 'success');
      AppState.pendingMasterFile = null;
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
  });
  
  // Bulk processing
  document.getElementById('btnProcessBulk').addEventListener('click', processBulk);
  document.getElementById('btnClearBulk').addEventListener('click', () => {
    document.getElementById('bulkTextarea').value = '';
    document.getElementById('bulkStats').style.display = 'none';
  });
  
  // Export buttons
  document.getElementById('btnExportTSV').addEventListener('click', exportTSV);
  document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
  document.getElementById('btnDownloadBackup').addEventListener('click', downloadBackup);
  
  // Restore backup
  const restoreInput = document.getElementById('restoreFileInput');
  document.getElementById('btnRestoreBackup').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) restoreBackup(file);
  });
  
  // Clear history
  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    const confirmed = await showConfirm('Clear History', 'This will delete all scan records. This action cannot be undone.');
    if (confirmed) {
      await dbClear('history');
      AppState.history = [];
      AppState.filteredHistory = [];
      updateHistoryList();
      updateStats();
      showToast('History cleared', 'success');
    }
  });
  
  // Network status
  const updateNetworkStatus = () => {
    const btn = document.getElementById('networkStatus');
    btn.title = navigator.onLine ? 'Online' : 'Offline';
    btn.style.color = navigator.onLine ? 'var(--green)' : 'var(--red)';
  };
  
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}

// ============================================
// INITIALIZATION
// ============================================
async function initApp() {
  try {
    // Initialize database
    await initDB();
    
    // Load data
    await loadMasterData();
    await loadHistory();
    
    // Initialize event listeners
    initEventListeners();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
    
    // Initialize barcode detector
    if ('BarcodeDetector' in window) {
      AppState.detector = new BarcodeDetector({
        formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      });
    }
    
    console.log('ExpiryTrack initialized');
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Failed to initialize app', 'error');
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);
