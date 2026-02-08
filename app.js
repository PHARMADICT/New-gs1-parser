/**
 * PharmaTrack - Pharmacy Stock Scanner
 * Modern offline-capable GS1 barcode parser PWA
 * Features: Smart inventory, PIN lock, haptic feedback, custom exports
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  PIN: '9633',
  EXPIRY_SOON_DAYS: 90, // 3 months
  EXPIRY_OK_DAYS: 120,  // 4+ months
  DEBOUNCE_MS: 2000
};

// ============================================
// APP STATE
// ============================================
const State = {
  scanning: false,
  videoStream: null,
  detector: null,
  lastScan: { code: '', time: 0 },
  currentPage: 'scan',
  
  // Data
  masterData: new Map(),
  masterIndex: { exact: new Map(), last8: new Map() },
  history: [],
  filteredHistory: [],
  
  // UI State
  searchQuery: '',
  activeFilter: 'all',
  
  // PIN
  pinCallback: null,
  pinInput: '',
  
  // Edit
  editingEntry: null
};

// ============================================
// DATABASE (IndexedDB)
// ============================================
const DB = {
  name: 'pharmatrack-db',
  version: 1,
  instance: null,
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.instance = request.result;
        resolve(this.instance);
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          store.createIndex('gtin14', 'gtin14', { unique: false });
          store.createIndex('gtinBatch', ['gtin14', 'batch'], { unique: false });
        }
        
        if (!db.objectStoreNames.contains('master')) {
          db.createObjectStore('master', { keyPath: 'gtin' });
        }
      };
    });
  },
  
  async put(store, data) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  
  async get(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      const req = s.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  
  async getAll(store) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  
  async delete(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  
  async clear(store) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  
  async findByGtinBatch(gtin14, batch) {
    return new Promise((resolve, reject) => {
      const tx = this.instance.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('gtinBatch');
      const req = index.get([gtin14, batch]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
};

// ============================================
// HAPTIC FEEDBACK
// ============================================
const Haptic = {
  light() {
    if (navigator.vibrate) navigator.vibrate(10);
  },
  medium() {
    if (navigator.vibrate) navigator.vibrate(30);
  },
  heavy() {
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
  },
  success() {
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  },
  error() {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }
};

// ============================================
// GS1 PARSING
// ============================================
function parseGS1(raw) {
  const result = {
    valid: false,
    raw: raw,
    gtin14: '',
    gtin13: '',
    expiry: null,
    expiryDDMMYY: '',
    expiryFormatted: '',
    expiryStatus: 'missing',
    batch: '',
    serial: '',
    qty: 1,
    rms: ''
  };
  
  if (!raw || typeof raw !== 'string') return result;
  
  let code = raw.trim().replace(/\x1d/g, '|');
  
  // Convert raw to parenthesized format
  if (!code.includes('(') && /^\d{2}/.test(code)) {
    code = convertToParenthesized(code);
  }
  
  // Extract fields
  const patterns = {
    gtin: /\(01\)(\d{12,14})/,
    expiry: /\(17\)(\d{6})/,
    batch: /\(10\)([^\(|\x1d]+)/,
    serial: /\(21\)([^\(|\x1d]+)/,
    qty: /\(30\)(\d+)/
  };
  
  // GTIN
  const gtinMatch = code.match(patterns.gtin);
  if (gtinMatch) {
    result.gtin14 = gtinMatch[1].padStart(14, '0');
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.substring(1) : result.gtin14;
    result.valid = true;
  }
  
  // Expiry
  const expiryMatch = code.match(patterns.expiry);
  if (expiryMatch) {
    const parsed = parseExpiryDate(expiryMatch[1]);
    result.expiry = parsed.iso;
    result.expiryDDMMYY = parsed.ddmmyy;
    result.expiryFormatted = parsed.formatted;
    result.expiryStatus = calculateExpiryStatus(parsed.iso);
  }
  
  // Batch
  const batchMatch = code.match(patterns.batch);
  if (batchMatch) {
    result.batch = batchMatch[1].replace(/\|/g, '').trim();
  }
  
  // Serial
  const serialMatch = code.match(patterns.serial);
  if (serialMatch) {
    result.serial = serialMatch[1].replace(/\|/g, '').trim();
  }
  
  // Quantity
  const qtyMatch = code.match(patterns.qty);
  if (qtyMatch) {
    result.qty = parseInt(qtyMatch[1]) || 1;
  }
  
  return result;
}

function convertToParenthesized(code) {
  const aiLengths = {
    '01': 14, '02': 14,
    '10': -1, '21': -1, '22': -1,
    '11': 6, '13': 6, '15': 6, '17': 6,
    '30': -1, '37': -1,
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
      let value = '';
      while (pos < code.length) {
        const char = code[pos];
        if (char === '|' || char === '\x1d') { pos++; break; }
        const p2 = code.substring(pos, pos + 2);
        const p3 = code.substring(pos, pos + 3);
        if ((aiLengths[p2] !== undefined || aiLengths[p3] !== undefined) && value.length > 0) break;
        value += char;
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
  
  if (day === 0) day = new Date(year, month, 0).getDate();
  
  const date = new Date(year, month - 1, day);
  
  return {
    iso: date.toISOString().split('T')[0],
    ddmmyy: `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}${yymmdd.substring(0, 2)}`,
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
  if (diffDays <= CONFIG.EXPIRY_SOON_DAYS) return 'soon';
  return 'ok';
}

// ============================================
// PRODUCT MATCHING
// ============================================
function matchProduct(gtin14, gtin13) {
  const idx = State.masterIndex;
  
  // Exact match
  if (idx.exact.has(gtin14)) return { name: idx.exact.get(gtin14), type: 'EXACT' };
  if (idx.exact.has(gtin13)) return { name: idx.exact.get(gtin13), type: 'EXACT' };
  
  // Last-8 match
  const last8 = gtin14.slice(-8);
  if (idx.last8.has(last8)) {
    const matches = idx.last8.get(last8);
    if (matches.length === 1) return { name: matches[0].name, type: 'LAST8' };
    if (matches.length > 1) return { name: matches[0].name, type: 'AMBIG' };
  }
  
  return { name: '', type: 'NONE' };
}

function buildMasterIndex() {
  const exact = new Map();
  const last8 = new Map();
  
  State.masterData.forEach((name, gtin) => {
    const g14 = gtin.padStart(14, '0');
    const g13 = g14.startsWith('0') ? g14.substring(1) : g14;
    
    exact.set(gtin, name);
    exact.set(g14, name);
    exact.set(g13, name);
    
    const key = g14.slice(-8);
    if (!last8.has(key)) last8.set(key, []);
    last8.get(key).push({ gtin, name });
  });
  
  State.masterIndex = { exact, last8 };
}

// ============================================
// SCANNING
// ============================================
async function startScanning() {
  try {
    if (!('BarcodeDetector' in window)) {
      showToast('Barcode scanning not supported', 'error');
      return;
    }
    
    State.detector = new BarcodeDetector({
      formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
    });
    
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    
    State.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const video = document.getElementById('video-preview');
    video.srcObject = State.videoStream;
    await video.play();
    
    State.scanning = true;
    updateScannerUI();
    detectLoop();
    
    Haptic.medium();
    showToast('Scanner started', 'success');
  } catch (err) {
    console.error('Scanner error:', err);
    showToast('Camera access denied', 'error');
  }
}

function stopScanning() {
  State.scanning = false;
  
  if (State.videoStream) {
    State.videoStream.getTracks().forEach(t => t.stop());
    State.videoStream = null;
  }
  
  document.getElementById('video-preview').srcObject = null;
  updateScannerUI();
}

async function detectLoop() {
  if (!State.scanning || !State.detector) return;
  
  const video = document.getElementById('video-preview');
  
  try {
    const barcodes = await State.detector.detect(video);
    
    for (const bc of barcodes) {
      const code = bc.rawValue;
      const now = Date.now();
      
      if (code === State.lastScan.code && now - State.lastScan.time < CONFIG.DEBOUNCE_MS) continue;
      
      State.lastScan = { code, time: now };
      await processScan(code);
    }
  } catch (err) {
    console.error('Detection error:', err);
  }
  
  if (State.scanning) requestAnimationFrame(detectLoop);
}

function updateScannerUI() {
  const fab = document.getElementById('scanFab');
  const container = document.getElementById('scannerContainer');
  const hint = document.getElementById('scannerHint');
  const icon = document.getElementById('scanFabIcon');
  
  if (State.scanning) {
    fab.classList.add('scanning');
    container.classList.add('scanning');
    hint.textContent = 'Scanning...';
    icon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
  } else {
    fab.classList.remove('scanning');
    container.classList.remove('scanning');
    hint.textContent = 'Tap scan to start';
    icon.innerHTML = '<path d="M23 19a2 2 0 0 1-2 2h-3v-2h3V5h-3V3h3a2 2 0 0 1 2 2z"/><path d="M1 5a2 2 0 0 1 2-2h3v2H3v14h3v2H3a2 2 0 0 1-2-2z"/><line x1="7" y1="12" x2="17" y2="12"/>';
  }
}

// ============================================
// PROCESS SCAN (Smart Inventory)
// ============================================
async function processScan(rawCode) {
  const parsed = parseGS1(rawCode);
  
  if (!parsed.valid) {
    Haptic.error();
    showToast('Invalid barcode', 'warning');
    return;
  }
  
  // Match product
  const match = matchProduct(parsed.gtin14, parsed.gtin13);
  
  // Check for existing entry with same GTIN + Batch (smart inventory)
  let existingEntry = null;
  if (parsed.batch) {
    existingEntry = await DB.findByGtinBatch(parsed.gtin14, parsed.batch);
  }
  
  if (existingEntry) {
    // Increment quantity
    existingEntry.qty = (existingEntry.qty || 1) + parsed.qty;
    existingEntry.scanTime = new Date().toISOString();
    
    await DB.put('history', existingEntry);
    
    // Update in-memory
    const idx = State.history.findIndex(h => h.id === existingEntry.id);
    if (idx !== -1) State.history[idx] = existingEntry;
    
    Haptic.success();
    showToast(`+${parsed.qty} quantity (total: ${existingEntry.qty})`, 'success');
  } else {
    // Create new entry
    const entry = {
      scanTime: new Date().toISOString(),
      raw: rawCode,
      gtin14: parsed.gtin14,
      gtin13: parsed.gtin13,
      expiry: parsed.expiry,
      expiryDDMMYY: parsed.expiryDDMMYY,
      expiryFormatted: parsed.expiryFormatted,
      expiryStatus: parsed.expiryStatus,
      batch: parsed.batch,
      serial: parsed.serial,
      qty: parsed.qty,
      productName: match.name,
      matchType: match.type,
      rms: ''
    };
    
    const id = await DB.put('history', entry);
    entry.id = id;
    
    State.history.unshift(entry);
    
    Haptic.success();
    showToast(`Scanned: ${parsed.gtin13}`, 'success');
  }
  
  filterHistory();
  updateStats();
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
async function loadHistory() {
  const data = await DB.getAll('history');
  State.history = data.sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));
  filterHistory();
  updateStats();
}

function filterHistory() {
  let filtered = [...State.history];
  
  // Status filter
  if (State.activeFilter !== 'all') {
    filtered = filtered.filter(h => h.expiryStatus === State.activeFilter);
  }
  
  // Search
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    filtered = filtered.filter(h =>
      (h.gtin14 && h.gtin14.includes(q)) ||
      (h.gtin13 && h.gtin13.includes(q)) ||
      (h.productName && h.productName.toLowerCase().includes(q)) ||
      (h.batch && h.batch.toLowerCase().includes(q)) ||
      (h.rms && h.rms.toLowerCase().includes(q))
    );
  }
  
  State.filteredHistory = filtered;
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('historyList');
  const empty = document.getElementById('emptyHistory');
  
  // Remove existing cards
  container.querySelectorAll('.history-card').forEach(c => c.remove());
  
  if (State.filteredHistory.length === 0) {
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  
  const html = State.filteredHistory.slice(0, 100).map(item => `
    <div class="history-card status-${item.expiryStatus}" data-id="${item.id}">
      <button class="edit-btn" data-id="${item.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <div class="card-header">
        <span class="product-name">${item.productName || 'Unknown Product'}</span>
        <span class="qty-badge">×${item.qty || 1}</span>
      </div>
      <div class="card-grid">
        <div class="card-field">
          <div class="field-label">GTIN</div>
          <div class="history-value">${item.gtin13 || '-'}</div>
        </div>
        <div class="card-field">
          <div class="field-label">Expiry</div>
          <div class="history-value">${item.expiryFormatted || '-'}</div>
        </div>
        <div class="card-field">
          <div class="field-label">Batch</div>
          <div class="history-value">${item.batch || '-'}</div>
        </div>
      </div>
    </div>
  `).join('');
  
  container.insertAdjacentHTML('afterbegin', html);
  
  // Add edit button listeners
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      requestPinThen(() => openEditModal(id));
    });
  });
}

// ============================================
// MASTER DATA
// ============================================
async function loadMasterData() {
  const data = await DB.getAll('master');
  State.masterData = new Map(data.map(d => [d.gtin, d.name]));
  buildMasterIndex();
  updateStats();
}

function parseMasterFile(content, filename) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) throw new Error('Empty file');
  
  let delimiter = ',';
  if (lines[0].includes('\t')) delimiter = '\t';
  else if (lines[0].includes(';')) delimiter = ';';
  
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  const barcodeCol = headers.findIndex(h => ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku'].some(p => h.includes(p)));
  const nameCol = headers.findIndex(h => ['name', 'product', 'description', 'item', 'title'].some(p => h.includes(p)));
  
  if (barcodeCol === -1 || nameCol === -1) throw new Error('Missing Barcode or Name column');
  
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
    if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) {
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
    await DB.clear('master');
    State.masterData.clear();
  }
  
  for (const p of products) {
    await DB.put('master', p);
    State.masterData.set(p.gtin, p.name);
  }
  
  buildMasterIndex();
  updateStats();
}

// Update master when editing product name
async function updateMasterFromEdit(gtin, name) {
  if (gtin && name) {
    await DB.put('master', { gtin, name });
    State.masterData.set(gtin, name);
    buildMasterIndex();
  }
}

// ============================================
// EXPORT (Custom Format)
// ============================================
// Header: RMS | BARCODE (GTIN) | DESCRIPTION | EXPIRY (DDMMYY) | BATCH | QUANTITY

function exportTSV() {
  if (State.history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  const headers = ['RMS', 'BARCODE (GTIN)', 'DESCRIPTION', 'EXPIRY (DDMMYY)', 'BATCH', 'QUANTITY'];
  const rows = State.history.map(h => [
    h.rms || '',
    h.gtin14 || h.gtin13 || '',
    h.productName || '',
    h.expiryDDMMYY || '',
    h.batch || '',
    h.qty || 1
  ]);
  
  const content = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  downloadFile(content, `pharmatrack-export-${formatDateForFile()}.tsv`, 'text/tab-separated-values');
  
  Haptic.success();
  showToast('TSV exported', 'success');
}

function exportCSV() {
  if (State.history.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }
  
  const headers = ['RMS', 'BARCODE (GTIN)', 'DESCRIPTION', 'EXPIRY (DDMMYY)', 'BATCH', 'QUANTITY'];
  const rows = State.history.map(h => [
    h.rms || '',
    h.gtin14 || h.gtin13 || '',
    h.productName || '',
    h.expiryDDMMYY || '',
    h.batch || '',
    h.qty || 1
  ]);
  
  const content = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadFile(content, `pharmatrack-export-${formatDateForFile()}.csv`, 'text/csv');
  
  Haptic.success();
  showToast('CSV exported', 'success');
}

async function downloadBackup() {
  const backup = {
    version: 1,
    app: 'PharmaTrack',
    exportDate: new Date().toISOString(),
    history: State.history,
    master: Array.from(State.masterData.entries()).map(([gtin, name]) => ({ gtin, name }))
  };
  
  downloadFile(JSON.stringify(backup, null, 2), `pharmatrack-backup-${formatDateForFile()}.json`, 'application/json');
  
  Haptic.success();
  showToast('Backup downloaded', 'success');
}

async function restoreBackup(file) {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);
    
    if (!backup.history && !backup.master) throw new Error('Invalid backup');
    
    if (backup.history) {
      await DB.clear('history');
      for (const h of backup.history) {
        await DB.put('history', h);
      }
      State.history = backup.history;
    }
    
    if (backup.master) {
      await DB.clear('master');
      State.masterData.clear();
      for (const m of backup.master) {
        await DB.put('master', m);
        State.masterData.set(m.gtin, m.name);
      }
      buildMasterIndex();
    }
    
    filterHistory();
    updateStats();
    
    Haptic.success();
    showToast('Backup restored', 'success');
  } catch (err) {
    Haptic.error();
    showToast('Invalid backup file', 'error');
  }
}

// ============================================
// PASTE/BULK PROCESSING
// ============================================
async function processPaste() {
  const textarea = document.getElementById('pasteTextarea');
  const lines = textarea.value.split('\n').filter(l => l.trim());
  
  if (lines.length === 0) {
    showToast('No data to process', 'warning');
    return;
  }
  
  let total = 0, valid = 0, invalid = 0, merged = 0;
  
  for (const line of lines) {
    total++;
    const parsed = parseGS1(line.trim());
    
    if (!parsed.valid) {
      invalid++;
      continue;
    }
    
    valid++;
    
    const match = matchProduct(parsed.gtin14, parsed.gtin13);
    
    // Check for existing
    let existing = null;
    if (parsed.batch) {
      existing = await DB.findByGtinBatch(parsed.gtin14, parsed.batch);
    }
    
    if (existing) {
      existing.qty = (existing.qty || 1) + parsed.qty;
      existing.scanTime = new Date().toISOString();
      await DB.put('history', existing);
      
      const idx = State.history.findIndex(h => h.id === existing.id);
      if (idx !== -1) State.history[idx] = existing;
      
      merged++;
    } else {
      const entry = {
        scanTime: new Date().toISOString(),
        raw: line.trim(),
        gtin14: parsed.gtin14,
        gtin13: parsed.gtin13,
        expiry: parsed.expiry,
        expiryDDMMYY: parsed.expiryDDMMYY,
        expiryFormatted: parsed.expiryFormatted,
        expiryStatus: parsed.expiryStatus,
        batch: parsed.batch,
        serial: parsed.serial,
        qty: parsed.qty,
        productName: match.name,
        matchType: match.type,
        rms: ''
      };
      
      const id = await DB.put('history', entry);
      entry.id = id;
      State.history.unshift(entry);
    }
  }
  
  // Show stats
  const stats = document.getElementById('pasteStats');
  stats.classList.add('visible');
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statValid').textContent = valid;
  document.getElementById('statInvalid').textContent = invalid;
  document.getElementById('statMerged').textContent = merged;
  
  filterHistory();
  updateStats();
  
  Haptic.success();
  showToast(`Processed ${valid}/${total} barcodes`, 'success');
}

// ============================================
// PIN LOCK
// ============================================
function requestPinThen(callback) {
  State.pinCallback = callback;
  State.pinInput = '';
  updatePinDisplay();
  document.getElementById('pinModal').classList.add('active');
  Haptic.light();
}

function closePinModal() {
  document.getElementById('pinModal').classList.remove('active');
  State.pinCallback = null;
  State.pinInput = '';
}

function handlePinKey(key) {
  Haptic.light();
  
  if (key === 'cancel') {
    closePinModal();
    return;
  }
  
  if (key === 'delete') {
    State.pinInput = State.pinInput.slice(0, -1);
    updatePinDisplay();
    return;
  }
  
  if (State.pinInput.length < 4) {
    State.pinInput += key;
    updatePinDisplay();
    
    if (State.pinInput.length === 4) {
      setTimeout(() => {
        if (State.pinInput === CONFIG.PIN) {
          Haptic.success();
          const cb = State.pinCallback;
          closePinModal();
          if (cb) cb();
        } else {
          Haptic.error();
          showPinError();
          State.pinInput = '';
          updatePinDisplay();
        }
      }, 200);
    }
  }
}

function updatePinDisplay() {
  const dots = document.querySelectorAll('#pinDisplay .pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < State.pinInput.length);
    dot.classList.remove('error');
  });
}

function showPinError() {
  const dots = document.querySelectorAll('#pinDisplay .pin-dot');
  dots.forEach(dot => dot.classList.add('error'));
  setTimeout(() => dots.forEach(dot => dot.classList.remove('error')), 300);
}

// ============================================
// EDIT MODAL
// ============================================
function openEditModal(id) {
  const entry = State.history.find(h => h.id === id);
  if (!entry) return;
  
  State.editingEntry = entry;
  
  document.getElementById('editName').value = entry.productName || '';
  document.getElementById('editQty').value = entry.qty || 1;
  document.getElementById('editRms').value = entry.rms || '';
  
  document.getElementById('editModal').classList.add('active');
  Haptic.light();
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  State.editingEntry = null;
}

async function saveEdit() {
  if (!State.editingEntry) return;
  
  const entry = State.editingEntry;
  entry.productName = document.getElementById('editName').value.trim();
  entry.qty = parseInt(document.getElementById('editQty').value) || 1;
  entry.rms = document.getElementById('editRms').value.trim();
  
  await DB.put('history', entry);
  
  // Update master data with new product name
  if (entry.productName && entry.gtin14) {
    await updateMasterFromEdit(entry.gtin14, entry.productName);
  }
  
  const idx = State.history.findIndex(h => h.id === entry.id);
  if (idx !== -1) State.history[idx] = entry;
  
  filterHistory();
  closeEditModal();
  
  Haptic.success();
  showToast('Entry updated', 'success');
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
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type] || icons.info}</svg>
    <span class="toast-text">${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function switchPage(pageName) {
  Haptic.light();
  
  const pages = document.querySelectorAll('.page');
  const navItems = document.querySelectorAll('.nav-item');
  
  // Determine animation direction
  const pageOrder = ['scan', 'history', 'paste'];
  const currentIdx = pageOrder.indexOf(State.currentPage);
  const newIdx = pageOrder.indexOf(pageName);
  const direction = newIdx > currentIdx ? 'left' : 'right';
  
  // Animate out current
  const currentPage = document.getElementById(`page-${State.currentPage}`);
  if (currentPage) {
    currentPage.classList.add(direction === 'left' ? 'slide-left' : 'slide-right');
    setTimeout(() => {
      currentPage.classList.remove('active', 'slide-left', 'slide-right');
    }, 400);
  }
  
  // Animate in new
  const newPage = document.getElementById(`page-${pageName}`);
  if (newPage) {
    newPage.classList.add('active');
    newPage.classList.add(direction === 'left' ? 'slide-right' : 'slide-left');
    setTimeout(() => {
      newPage.classList.remove('slide-left', 'slide-right');
    }, 50);
  }
  
  // Update nav
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });
  
  State.currentPage = pageName;
  
  // Stop scanning when leaving scan page
  if (pageName !== 'scan' && State.scanning) {
    stopScanning();
  }
}

function openMenu() {
  document.getElementById('menuOverlay').classList.add('open');
  document.getElementById('sideMenu').classList.add('open');
  Haptic.light();
}

function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('open');
  document.getElementById('sideMenu').classList.remove('open');
}

function updateStats() {
  document.getElementById('menuMasterCount').textContent = State.masterData.size.toLocaleString();
  document.getElementById('menuHistoryCount').textContent = State.history.length.toLocaleString();
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

function formatDateForFile() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });
  
  // Scan FAB
  document.getElementById('scanFab').addEventListener('click', () => {
    if (State.scanning) {
      stopScanning();
    } else {
      startScanning();
    }
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
    if (e.key === 'Enter') document.getElementById('btnManualAdd').click();
  });
  
  // Upload image
  document.getElementById('btnUploadImg').addEventListener('click', () => {
    document.getElementById('imageFileInput').click();
  });
  
  document.getElementById('imageFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const img = new Image();
    img.onload = async () => {
      if (State.detector) {
        try {
          const barcodes = await State.detector.detect(img);
          for (const bc of barcodes) {
            await processScan(bc.rawValue);
          }
          if (barcodes.length === 0) {
            showToast('No barcode found', 'warning');
          }
        } catch (err) {
          showToast('Scan failed', 'error');
        }
      }
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  });
  
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    State.searchQuery = e.target.value;
    filterHistory();
  });
  
  // Filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      Haptic.light();
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      State.activeFilter = chip.dataset.filter;
      filterHistory();
    });
  });
  
  // Paste
  document.getElementById('btnProcessPaste').addEventListener('click', processPaste);
  document.getElementById('btnClearPaste').addEventListener('click', () => {
    document.getElementById('pasteTextarea').value = '';
    document.getElementById('pasteStats').classList.remove('visible');
  });
  
  // Menu
  document.getElementById('menuBtn').addEventListener('click', openMenu);
  document.getElementById('menuOverlay').addEventListener('click', closeMenu);
  document.getElementById('menuClose').addEventListener('click', closeMenu);
  
  // Menu actions
  document.getElementById('menuUploadMaster').addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      document.getElementById('masterFileInput').click();
    });
  });
  
  document.getElementById('menuAppendMaster').addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      document.getElementById('appendFileInput').click();
    });
  });
  
  document.getElementById('masterFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const content = await file.text();
      const products = parseMasterFile(content, file.name);
      await saveMasterData(products, false);
      showToast(`Loaded ${products.length} products`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    e.target.value = '';
  });
  
  document.getElementById('appendFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const content = await file.text();
      const products = parseMasterFile(content, file.name);
      await saveMasterData(products, true);
      showToast(`Added ${products.length} products`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    e.target.value = '';
  });
  
  document.getElementById('menuExportTSV').addEventListener('click', () => {
    closeMenu();
    exportTSV();
  });
  
  document.getElementById('menuExportCSV').addEventListener('click', () => {
    closeMenu();
    exportCSV();
  });
  
  document.getElementById('menuBackup').addEventListener('click', () => {
    closeMenu();
    downloadBackup();
  });
  
  document.getElementById('menuRestore').addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      document.getElementById('restoreFileInput').click();
    });
  });
  
  document.getElementById('restoreFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await restoreBackup(file);
    e.target.value = '';
  });
  
  document.getElementById('menuClearHistory').addEventListener('click', () => {
    closeMenu();
    requestPinThen(async () => {
      await DB.clear('history');
      State.history = [];
      filterHistory();
      updateStats();
      Haptic.heavy();
      showToast('History cleared', 'success');
    });
  });
  
  // PIN pad
  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', () => handlePinKey(key.dataset.key));
  });
  
  // Edit modal
  document.getElementById('editCancel').addEventListener('click', closeEditModal);
  document.getElementById('editSave').addEventListener('click', saveEdit);
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    await DB.init();
    await loadMasterData();
    await loadHistory();
    initEventListeners();
    
    // Service Worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (err) {
        console.error('SW registration failed:', err);
      }
    }
    
    // Initialize detector
    if ('BarcodeDetector' in window) {
      State.detector = new BarcodeDetector({
        formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      });
    }
    
    console.log('PharmaTrack initialized');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Initialization failed', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
