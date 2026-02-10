/**
 * Oasis Pharmacy - Expiry Tracker
 * Complete GS1 Barcode Scanner PWA
 * 
 * Features:
 * - GS1 barcode scanning & parsing
 * - Smart inventory (auto quantity merge)
 * - API lookup for unknown products
 * - PIN-protected editing
 * - Custom export format
 * - Offline-first with IndexedDB
 * - Haptic feedback
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  PIN: '9633',
  EXPIRY_SOON_DAYS: 90,    // 3 months = orange
  EXPIRY_OK_DAYS: 120,     // 4+ months = green
  DEBOUNCE_MS: 2000,
  MAX_RECENT_SCANS: 5,
  
  // API Endpoints for product lookup (MEDICINE-FOCUSED)
  API: {
    // FDA OpenFDA - FREE, no key required, US drugs
    OPEN_FDA: 'https://api.fda.gov/drug/ndc.json',
    // DailyMed - FREE, FDA drug labels
    DAILYMED: 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json',
    // RxNorm - FREE, drug terminology from NLM
    RXNORM: 'https://rxnav.nlm.nih.gov/REST/rxcui.json',
    // Open Food Facts - fallback for OTC/supplements
    OPEN_FOOD_FACTS: 'https://world.openfoodfacts.org/api/v0/product/'
  }
};

// ============================================
// APPLICATION STATE
// ============================================
const State = {
  // Scanning
  scanning: false,
  lastScan: { code: '', time: 0 },
  
  // Data
  masterData: new Map(),
  masterIndex: { exact: new Map(), last8: new Map() },
  history: [],
  filteredHistory: [],
  
  // UI State
  currentPage: 'home',
  searchQuery: '',
  activeFilter: 'all',
  
  // PIN
  pinCallback: null,
  pinInput: '',
  
  // Edit
  editingEntry: null,
  
  // Settings
  apiLookupEnabled: true
};

// ============================================
// DATABASE (IndexedDB)
// ============================================
const DB = {
  name: 'oasis-pharmacy-db',
  version: 2,
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
        
        // History store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('gtin14', 'gtin14', { unique: false });
          historyStore.createIndex('gtinBatch', ['gtin14', 'batch'], { unique: false });
          historyStore.createIndex('scanTime', 'scanTime', { unique: false });
        }
        
        // Master data store
        if (!db.objectStoreNames.contains('master')) {
          db.createObjectStore('master', { keyPath: 'gtin' });
        }
        
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
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
      const req = index.get([gtin14, batch || '']);
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
// GS1 BARCODE PARSING
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
  
  // Handle plain EAN-13/GTIN without AI
  if (/^\d{8,14}$/.test(code) && !code.includes('(')) {
    result.gtin14 = code.padStart(14, '0');
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.substring(1) : result.gtin14;
    result.valid = true;
    return result;
  }
  
  // Convert raw to parenthesized format if needed
  if (!code.includes('(') && /^\d{2}/.test(code)) {
    code = convertToParenthesized(code);
  }
  
  // Extract GS1 Application Identifiers
  const patterns = {
    gtin: /\(01\)(\d{12,14})/,
    expiry: /\(17\)(\d{6})/,
    batch: /\(10\)([^\(|\x1d]+)/,
    serial: /\(21\)([^\(|\x1d]+)/,
    qty: /\(30\)(\d+)/
  };
  
  // GTIN (AI 01)
  const gtinMatch = code.match(patterns.gtin);
  if (gtinMatch) {
    result.gtin14 = gtinMatch[1].padStart(14, '0');
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.substring(1) : result.gtin14;
    result.valid = true;
  }
  
  // Expiry Date (AI 17)
  const expiryMatch = code.match(patterns.expiry);
  if (expiryMatch) {
    const parsed = parseExpiryDate(expiryMatch[1]);
    result.expiry = parsed.iso;
    result.expiryDDMMYY = parsed.ddmmyy;
    result.expiryFormatted = parsed.formatted;
    result.expiryStatus = calculateExpiryStatus(parsed.iso);
  }
  
  // Batch/Lot (AI 10)
  const batchMatch = code.match(patterns.batch);
  if (batchMatch) {
    result.batch = batchMatch[1].replace(/\|/g, '').trim();
  }
  
  // Serial Number (AI 21)
  const serialMatch = code.match(patterns.serial);
  if (serialMatch) {
    result.serial = serialMatch[1].replace(/\|/g, '').trim();
  }
  
  // Quantity (AI 30)
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
      // Variable length field
      let value = '';
      while (pos < code.length) {
        const char = code[pos];
        if (char === '|' || char === '\x1d') { pos++; break; }
        const peek2 = code.substring(pos, pos + 2);
        const peek3 = code.substring(pos, pos + 3);
        if ((aiLengths[peek2] !== undefined || aiLengths[peek3] !== undefined) && value.length > 0) break;
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
  
  // Day 00 means last day of month
  if (day === 0) {
    day = new Date(year, month, 0).getDate();
  }
  
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
// PRODUCT MATCHING (Local Master)
// ============================================
function matchProduct(gtin14, gtin13) {
  const idx = State.masterIndex;
  
  // Exact match on GTIN-14
  if (idx.exact.has(gtin14)) {
    return { name: idx.exact.get(gtin14), type: 'EXACT' };
  }
  
  // Exact match on GTIN-13
  if (idx.exact.has(gtin13)) {
    return { name: idx.exact.get(gtin13), type: 'EXACT' };
  }
  
  // Last-8 digits match
  const last8 = gtin14.slice(-8);
  if (idx.last8.has(last8)) {
    const matches = idx.last8.get(last8);
    if (matches.length === 1) {
      return { name: matches[0].name, type: 'LAST8' };
    }
    if (matches.length > 1) {
      return { name: matches[0].name, type: 'AMBIG' };
    }
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
// API PRODUCT LOOKUP (MEDICINE-FOCUSED)
// Priority: OpenFDA → DailyMed → RxNorm → OpenFoodFacts
// All APIs are FREE and reliable for pharmaceutical data
// ============================================
async function lookupProductAPI(gtin) {
  if (!State.apiLookupEnabled || !navigator.onLine) {
    return null;
  }
  
  // Prepare different barcode formats
  const gtin14 = gtin.padStart(14, '0');
  const gtin13 = gtin14.startsWith('0') ? gtin14.substring(1) : gtin14;
  const gtin12 = gtin13.startsWith('0') ? gtin13.substring(1) : gtin13;
  
  // Extract NDC from GTIN (US drugs)
  // NDC is typically: 5-4-2 or 5-3-2 format within the GTIN
  const ndc11 = extractNDCFromGTIN(gtin14);
  
  console.log(`🔍 API Lookup: GTIN=${gtin}, NDC=${ndc11}`);
  
  // 1. Try OpenFDA first (best for US prescription drugs)
  try {
    const fdaResult = await lookupOpenFDA(gtin14, ndc11);
    if (fdaResult) {
      console.log('✅ Found in OpenFDA:', fdaResult.name);
      return fdaResult;
    }
  } catch (e) {
    console.log('OpenFDA lookup failed:', e.message);
  }
  
  // 2. Try DailyMed (FDA drug labels)
  try {
    const dailymedResult = await lookupDailyMed(ndc11);
    if (dailymedResult) {
      console.log('✅ Found in DailyMed:', dailymedResult.name);
      return dailymedResult;
    }
  } catch (e) {
    console.log('DailyMed lookup failed:', e.message);
  }
  
  // 3. Try Open Food Facts (for OTC, supplements, healthcare products)
  try {
    const offResult = await lookupOpenFoodFacts(gtin13);
    if (offResult) {
      console.log('✅ Found in OpenFoodFacts:', offResult.name);
      return offResult;
    }
  } catch (e) {
    console.log('Open Food Facts lookup failed:', e.message);
  }
  
  console.log('❌ No API match found for:', gtin);
  return null;
}

// Extract NDC from GTIN-14
// US pharmaceutical GTINs typically encode NDC in positions 4-13
function extractNDCFromGTIN(gtin14) {
  // Remove leading zeros and indicator digit
  // GTIN-14: [1 indicator][13 UPC/EAN]
  // UPC-A: 0 + NDC-11 + check digit
  // So NDC is in positions 2-12 of GTIN-14
  
  if (!gtin14 || gtin14.length < 14) return null;
  
  // Try different NDC extractions
  const possible11 = gtin14.substring(2, 13); // positions 2-12
  const possible10 = gtin14.substring(3, 13); // positions 3-12
  
  // NDC-11 format: 5-4-2 (most common for US drugs)
  return possible11;
}

// OpenFDA Drug API - FREE, no API key required
// Best for US prescription drugs, OTC drugs
async function lookupOpenFDA(gtin14, ndc11) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  
  try {
    // Try searching by package NDC
    let searchTerm = '';
    if (ndc11) {
      // Format NDC for search (try different formats)
      const ndcDashed = formatNDC(ndc11);
      searchTerm = `packaging.package_ndc:"${ndcDashed}"`;
    }
    
    // Also try by GTIN directly (some entries have it)
    const gtinSearch = `openfda.package_ndc:"${gtin14}"`;
    
    const url = `${CONFIG.API.OPEN_FDA}?search=${encodeURIComponent(searchTerm)}&limit=1`;
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Try alternative search
      return await lookupOpenFDAByBrandName(gtin14);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const drug = data.results[0];
      
      // Build drug name from available fields
      let name = '';
      
      if (drug.brand_name) {
        name = drug.brand_name;
      } else if (drug.generic_name) {
        name = drug.generic_name;
      } else if (drug.openfda && drug.openfda.brand_name) {
        name = Array.isArray(drug.openfda.brand_name) 
          ? drug.openfda.brand_name[0] 
          : drug.openfda.brand_name;
      }
      
      // Add strength if available
      if (drug.active_ingredients && drug.active_ingredients.length > 0) {
        const strength = drug.active_ingredients[0].strength;
        if (strength && !name.includes(strength)) {
          name += ` ${strength}`;
        }
      }
      
      // Add dosage form
      if (drug.dosage_form && !name.toLowerCase().includes(drug.dosage_form.toLowerCase())) {
        name += ` ${drug.dosage_form}`;
      }
      
      if (name) {
        return {
          name: name.trim(),
          brand: drug.labeler_name || '',
          source: 'OpenFDA',
          ndc: drug.product_ndc || ndc11
        };
      }
    }
    
    return null;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name !== 'AbortError') throw e;
    return null;
  }
}

// Fallback OpenFDA search
async function lookupOpenFDAByBrandName(gtin) {
  // This is a fallback - not as reliable
  return null;
}

// Format NDC to dashed format (5-4-2 or 5-3-2)
function formatNDC(ndc11) {
  if (!ndc11 || ndc11.length < 10) return ndc11;
  
  // Standard 5-4-2 format
  if (ndc11.length === 11) {
    return `${ndc11.substring(0,5)}-${ndc11.substring(5,9)}-${ndc11.substring(9,11)}`;
  }
  
  // 10-digit NDC
  if (ndc11.length === 10) {
    return `${ndc11.substring(0,5)}-${ndc11.substring(5,8)}-${ndc11.substring(8,10)}`;
  }
  
  return ndc11;
}

// DailyMed API - FREE, FDA drug labels
async function lookupDailyMed(ndc) {
  if (!ndc) return null;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  
  try {
    // Search by NDC
    const url = `${CONFIG.API.DAILYMED}?ndc=${formatNDC(ndc)}`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const spl = data.data[0];
      
      let name = spl.title || spl.name || '';
      
      // Clean up the name (DailyMed titles can be verbose)
      if (name.length > 100) {
        name = name.substring(0, 100).trim();
      }
      
      if (name) {
        return {
          name: name,
          brand: spl.labeler || '',
          source: 'DailyMed',
          ndc: ndc
        };
      }
    }
    
    return null;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name !== 'AbortError') throw e;
    return null;
  }
}

// Open Food Facts - for OTC, supplements, healthcare products
async function lookupOpenFoodFacts(barcode) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  
  try {
    const response = await fetch(
      `${CONFIG.API.OPEN_FOOD_FACTS}${barcode}.json`,
      { 
        signal: controller.signal,
        headers: { 'User-Agent': 'OasisPharmacy/2.0' }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === 1 && data.product) {
      const product = data.product;
      
      // Check if it's a health/medicine product
      const categories = (product.categories || '').toLowerCase();
      const isHealthProduct = 
        categories.includes('health') ||
        categories.includes('medicine') ||
        categories.includes('pharmaceutical') ||
        categories.includes('supplement') ||
        categories.includes('vitamin') ||
        categories.includes('drug') ||
        categories.includes('otc');
      
      const name = product.product_name || 
                   product.product_name_en || 
                   product.generic_name ||
                   null;
      
      if (name) {
        return {
          name: name,
          brand: product.brands || '',
          source: 'OpenFoodFacts',
          isHealthProduct: isHealthProduct
        };
      }
    }
    
    return null;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name !== 'AbortError') throw e;
    return null;
  }
}

// ============================================
// CAMERA SCANNING (Cross-Browser Compatible)
// Using html5-qrcode library for maximum compatibility
// ============================================

let html5QrCode = null;
let availableCameras = [];
let currentCameraIndex = 0;

// Initialize scanner
async function initScanner() {
  // Check if library is loaded
  if (typeof Html5Qrcode === 'undefined') {
    console.error('Html5Qrcode library not loaded');
    document.getElementById('browserSupportInfo').style.display = 'block';
    return false;
  }
  
  try {
    // Get available cameras
    availableCameras = await Html5Qrcode.getCameras();
    console.log('Available cameras:', availableCameras);
    
    if (availableCameras.length === 0) {
      showToast('No cameras found on this device', 'warning');
      document.getElementById('browserSupportInfo').style.display = 'block';
      return false;
    }
    
    // Prefer back camera
    currentCameraIndex = 0;
    for (let i = 0; i < availableCameras.length; i++) {
      const label = availableCameras[i].label.toLowerCase();
      if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
        currentCameraIndex = i;
        break;
      }
    }
    
    return true;
  } catch (err) {
    console.error('Camera init error:', err);
    
    if (err.name === 'NotAllowedError') {
      showToast('Camera permission denied. Please allow camera access in browser settings.', 'error');
    } else {
      showToast('Could not access cameras: ' + (err.message || err), 'error');
    }
    
    document.getElementById('browserSupportInfo').style.display = 'block';
    return false;
  }
}

async function startScanning() {
  // Stop if already scanning
  if (State.scanning) {
    await stopScanning();
    return;
  }
  
  // Check library
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Scanner library not loaded. Try refreshing the page.', 'error');
    return;
  }
  
  try {
    // Initialize cameras if not done
    if (availableCameras.length === 0) {
      const success = await initScanner();
      if (!success) return;
    }
    
    // Create scanner instance
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader", { verbose: false });
    }
    
    // Scanner configuration
    const config = {
      fps: 10,
      qrbox: function(viewfinderWidth, viewfinderHeight) {
        const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.floor(minDimension * 0.7);
        return { width: size, height: size };
      },
      aspectRatio: 1.0,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF
      ],
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };
    
    const cameraId = availableCameras[currentCameraIndex].id;
    
    await html5QrCode.start(
      cameraId,
      config,
      onScanSuccess,
      onScanError
    );
    
    State.scanning = true;
    updateScannerUI();
    Haptic.medium();
    showToast('Scanner started', 'success');
    
  } catch (err) {
    console.error('Start scanning error:', err);
    State.scanning = false;
    updateScannerUI();
    
    let message = 'Failed to start scanner';
    
    if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
      message = 'Camera permission denied. Please allow camera access.';
    } else if (err.toString().includes('NotFoundError')) {
      message = 'No camera found on this device';
    } else if (err.toString().includes('NotReadableError')) {
      message = 'Camera is being used by another app';
    } else if (err.toString().includes('OverconstrainedError')) {
      message = 'Camera does not meet requirements';
    } else if (err.message) {
      message = err.message;
    }
    
    Haptic.error();
    showToast(message, 'error');
    document.getElementById('browserSupportInfo').style.display = 'block';
  }
}

async function stopScanning() {
  if (!html5QrCode) {
    State.scanning = false;
    updateScannerUI();
    return;
  }
  
  try {
    await html5QrCode.stop();
    console.log('Scanner stopped');
  } catch (err) {
    console.log('Stop scanner note:', err);
  }
  
  State.scanning = false;
  updateScannerUI();
}

// Scan success callback
async function onScanSuccess(decodedText, decodedResult) {
  const now = Date.now();
  
  // Debounce same barcode
  if (decodedText === State.lastScan.code && now - State.lastScan.time < CONFIG.DEBOUNCE_MS) {
    return;
  }
  
  State.lastScan = { code: decodedText, time: now };
  
  console.log('Scanned:', decodedText);
  await processScan(decodedText);
}

// Scan error callback (called every frame when no barcode)
function onScanError(errorMessage) {
  // Ignore - this is normal when no barcode in frame
}

// Switch camera
async function switchCamera() {
  Haptic.light();
  
  if (availableCameras.length <= 1) {
    showToast('Only one camera available', 'info');
    return;
  }
  
  // Cycle to next camera
  currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
  const cameraName = availableCameras[currentCameraIndex].label || `Camera ${currentCameraIndex + 1}`;
  
  if (State.scanning) {
    await stopScanning();
    setTimeout(async () => {
      await startScanning();
      showToast(`Switched to: ${cameraName}`, 'success');
    }, 300);
  } else {
    showToast(`Will use: ${cameraName}`, 'info');
  }
}

// Update scanner UI
function updateScannerUI() {
  const container = document.getElementById('scannerContainer');
  const hint = document.getElementById('scannerHint');
  const btnText = document.getElementById('btnScannerText');
  const fab = document.getElementById('scanFab');
  const fabIcon = document.getElementById('scanFabIcon');
  const overlay = document.getElementById('scannerOverlay');
  
  if (State.scanning) {
    container?.classList.add('scanning');
    fab?.classList.add('scanning');
    if (hint) hint.textContent = 'Scanning... Point at barcode';
    if (btnText) btnText.textContent = 'Stop Scanner';
    if (overlay) overlay.classList.remove('hidden');
    if (fabIcon) {
      fabIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
    }
  } else {
    container?.classList.remove('scanning');
    fab?.classList.remove('scanning');
    if (hint) hint.textContent = 'Tap button to start scanning';
    if (btnText) btnText.textContent = 'Start Scanner';
    if (overlay) overlay.classList.add('hidden');
    if (fabIcon) {
      fabIcon.innerHTML = '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>';
    }
  }
}

// Scan image file
async function scanImageFile(file) {
  if (!file) return;
  
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Scanner library not loaded', 'error');
    return;
  }
  
  showToast('Scanning image...', 'info');
  
  try {
    // Create temporary scanner for file scanning
    const tempScanner = new Html5Qrcode("temp-scanner");
    
    const result = await tempScanner.scanFile(file, /* showImage */ false);
    
    console.log('Image scan result:', result);
    await processScan(result);
    
    // Clean up
    tempScanner.clear();
    
  } catch (err) {
    console.log('Image scan error:', err);
    
    if (err.toString().includes('No MultiFormat Readers')) {
      showToast('No barcode found in image', 'warning');
    } else {
      showToast('Could not read barcode from image', 'warning');
    }
  }
}

// ============================================
// PROCESS SCANNED BARCODE
// ============================================
async function processScan(rawCode) {
  const parsed = parseGS1(rawCode);
  
  if (!parsed.valid) {
    Haptic.error();
    showToast('Invalid barcode format', 'warning');
    return;
  }
  
  // Try to match product from master data
  let match = matchProduct(parsed.gtin14, parsed.gtin13);
  
  // If not found and API lookup enabled, try online lookup
  if (match.type === 'NONE' && State.apiLookupEnabled && navigator.onLine) {
    showToast('Looking up product...', 'info');
    
    const apiResult = await lookupProductAPI(parsed.gtin14);
    
    if (apiResult && apiResult.name) {
      match = { 
        name: apiResult.brand ? `${apiResult.brand} ${apiResult.name}` : apiResult.name,
        type: 'API'
      };
      
      // Save to master data for future use
      await DB.put('master', { gtin: parsed.gtin14, name: match.name });
      State.masterData.set(parsed.gtin14, match.name);
      buildMasterIndex();
      
      showToast(`Found: ${match.name}`, 'success');
    }
  }
  
  // Check for existing entry with same GTIN + Batch (smart inventory merge)
  let existingEntry = null;
  if (parsed.batch) {
    existingEntry = await DB.findByGtinBatch(parsed.gtin14, parsed.batch);
  }
  
  if (existingEntry) {
    // Increment quantity on existing entry
    existingEntry.qty = (existingEntry.qty || 1) + parsed.qty;
    existingEntry.scanTime = new Date().toISOString();
    
    await DB.put('history', existingEntry);
    
    // Update in-memory state
    const idx = State.history.findIndex(h => h.id === existingEntry.id);
    if (idx !== -1) State.history[idx] = existingEntry;
    
    Haptic.success();
    showToast(`+${parsed.qty} qty (total: ${existingEntry.qty})`, 'success');
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
  
  // Update UI
  filterHistory();
  renderRecentScans();
  updateStats();
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
async function loadHistory() {
  const data = await DB.getAll('history');
  State.history = data.sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime));
  filterHistory();
  renderRecentScans();
  updateStats();
}

function filterHistory() {
  let filtered = [...State.history];
  
  // Apply status filter
  if (State.activeFilter !== 'all') {
    filtered = filtered.filter(h => h.expiryStatus === State.activeFilter);
  }
  
  // Apply search query
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
  const emptyState = document.getElementById('emptyHistory');
  
  if (!container) return;
  
  // Remove existing items
  container.querySelectorAll('.history-item').forEach(el => el.remove());
  
  if (State.filteredHistory.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
  const html = State.filteredHistory.slice(0, 100).map(item => `
    <div class="history-item ${item.expiryStatus}" data-id="${item.id}">
      <div class="item-content">
        <div class="item-header">
          <span class="item-name">${item.productName || 'Unknown Product'}</span>
          <span class="item-qty">×${item.qty || 1}</span>
        </div>
        <div class="item-details">
          <span class="item-detail">
            <span class="item-detail-label">GTIN:</span>
            <span class="item-detail-value">${item.gtin13 || '-'}</span>
          </span>
          <span class="item-detail">
            <span class="item-detail-label">Exp:</span>
            <span class="item-detail-value">${item.expiryFormatted || '-'}</span>
          </span>
          <span class="item-detail">
            <span class="item-detail-label">Batch:</span>
            <span class="item-detail-value">${item.batch || '-'}</span>
          </span>
        </div>
      </div>
      <div class="item-actions">
        <button class="item-action edit-btn" data-id="${item.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="item-action delete-btn" data-id="${item.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  container.insertAdjacentHTML('beforeend', html);
  
  // Add event listeners
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      requestPinThen(() => openEditModal(id));
    });
  });
  
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      requestPinThen(() => deleteHistoryEntry(id));
    });
  });
}

function renderRecentScans() {
  const container = document.getElementById('recentScans');
  const emptyState = document.getElementById('emptyRecent');
  
  if (!container) return;
  
  // Remove existing items
  container.querySelectorAll('.history-item').forEach(el => el.remove());
  
  const recent = State.history.slice(0, CONFIG.MAX_RECENT_SCANS);
  
  if (recent.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
  const html = recent.map(item => `
    <div class="history-item ${item.expiryStatus}" data-id="${item.id}">
      <div class="item-content">
        <div class="item-header">
          <span class="item-name">${item.productName || 'Unknown Product'}</span>
          <span class="item-qty">×${item.qty || 1}</span>
        </div>
        <div class="item-details">
          <span class="item-detail">
            <span class="item-detail-value">${item.gtin13 || '-'}</span>
          </span>
          <span class="item-detail">
            <span class="item-detail-value">${item.expiryFormatted || '-'}</span>
          </span>
        </div>
      </div>
    </div>
  `).join('');
  
  container.insertAdjacentHTML('beforeend', html);
}

async function deleteHistoryEntry(id) {
  await DB.delete('history', id);
  State.history = State.history.filter(h => h.id !== id);
  filterHistory();
  renderRecentScans();
  updateStats();
  Haptic.medium();
  showToast('Entry deleted', 'success');
}

// ============================================
// MASTER DATA MANAGEMENT
// ============================================
async function loadMasterData() {
  const data = await DB.getAll('master');
  State.masterData = new Map(data.map(d => [d.gtin, d.name]));
  buildMasterIndex();
  updateStats();
}

function parseMasterFile(content, filename) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length === 0) {
    throw new Error('File is empty');
  }
  
  // Detect delimiter
  let delimiter = ',';
  const firstLine = lines[0];
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  
  // Parse headers
  const headers = firstLine.split(delimiter).map(h => 
    h.trim().toLowerCase().replace(/['"]/g, '')
  );
  
  // Find barcode and name columns
  const barcodeCol = headers.findIndex(h => 
    ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku', 'item'].some(p => h.includes(p))
  );
  const nameCol = headers.findIndex(h => 
    ['name', 'product', 'description', 'item', 'title', 'desc'].some(p => h.includes(p))
  );
  
  if (barcodeCol === -1) {
    throw new Error('No barcode column found. Expected: Barcode, GTIN, EAN, UPC, or Code');
  }
  if (nameCol === -1) {
    throw new Error('No product name column found. Expected: Name, Product, or Description');
  }
  
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
  
  if (products.length === 0) {
    throw new Error('No valid products found in file');
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
    await DB.clear('master');
    State.masterData.clear();
  }
  
  for (const product of products) {
    await DB.put('master', product);
    State.masterData.set(product.gtin, product.name);
  }
  
  buildMasterIndex();
  updateStats();
}

async function updateMasterFromEdit(gtin, name) {
  if (gtin && name) {
    await DB.put('master', { gtin, name });
    State.masterData.set(gtin, name);
    buildMasterIndex();
  }
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
// Custom header order: RMS | BARCODE (GTIN) | DESCRIPTION | EXPIRY (DDMMYY) | BATCH | QUANTITY

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
  downloadFile(content, `oasis-export-${formatDateForFile()}.tsv`, 'text/tab-separated-values');
  
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
  
  downloadFile(content, `oasis-export-${formatDateForFile()}.csv`, 'text/csv');
  
  Haptic.success();
  showToast('CSV exported', 'success');
}

async function downloadBackup() {
  const backup = {
    version: 2,
    app: 'OasisPharmacy',
    exportDate: new Date().toISOString(),
    history: State.history,
    master: Array.from(State.masterData.entries()).map(([gtin, name]) => ({ gtin, name })),
    settings: {
      apiLookupEnabled: State.apiLookupEnabled
    }
  };
  
  downloadFile(
    JSON.stringify(backup, null, 2), 
    `oasis-backup-${formatDateForFile()}.json`, 
    'application/json'
  );
  
  Haptic.success();
  showToast('Backup downloaded', 'success');
}

async function restoreBackup(file) {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);
    
    if (!backup.history && !backup.master) {
      throw new Error('Invalid backup file format');
    }
    
    // Restore history
    if (backup.history) {
      await DB.clear('history');
      for (const h of backup.history) {
        await DB.put('history', h);
      }
      State.history = backup.history;
    }
    
    // Restore master
    if (backup.master) {
      await DB.clear('master');
      State.masterData.clear();
      for (const m of backup.master) {
        await DB.put('master', m);
        State.masterData.set(m.gtin, m.name);
      }
      buildMasterIndex();
    }
    
    // Restore settings
    if (backup.settings) {
      State.apiLookupEnabled = backup.settings.apiLookupEnabled ?? true;
      syncApiToggle();
    }
    
    filterHistory();
    renderRecentScans();
    updateStats();
    
    Haptic.success();
    showToast(`Restored ${backup.history?.length || 0} scans, ${backup.master?.length || 0} products`, 'success');
  } catch (err) {
    console.error('Restore error:', err);
    Haptic.error();
    showToast('Invalid backup file', 'error');
  }
}

// ============================================
// BULK PASTE PROCESSING
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
    
    // Match product
    let match = matchProduct(parsed.gtin14, parsed.gtin13);
    
    // API lookup for unknown products
    if (match.type === 'NONE' && State.apiLookupEnabled && navigator.onLine) {
      const apiResult = await lookupProductAPI(parsed.gtin14);
      if (apiResult && apiResult.name) {
        match = { name: apiResult.name, type: 'API' };
        await DB.put('master', { gtin: parsed.gtin14, name: match.name });
        State.masterData.set(parsed.gtin14, match.name);
      }
    }
    
    // Check for existing entry
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
  
  // Rebuild master index
  buildMasterIndex();
  
  // Show stats
  const statsEl = document.getElementById('pasteStats');
  if (statsEl) {
    statsEl.classList.add('visible');
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statInvalid').textContent = invalid;
    document.getElementById('statMerged').textContent = merged;
  }
  
  filterHistory();
  renderRecentScans();
  updateStats();
  
  Haptic.success();
  showToast(`Processed ${valid}/${total} barcodes`, 'success');
}

// ============================================
// PIN LOCK SYSTEM
// ============================================
function requestPinThen(callback) {
  State.pinCallback = callback;
  State.pinInput = '';
  updatePinDisplay();
  document.getElementById('pinModal')?.classList.add('active');
  Haptic.light();
}

function closePinModal() {
  document.getElementById('pinModal')?.classList.remove('active');
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
          const callback = State.pinCallback;
          closePinModal();
          if (callback) callback();
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
  setTimeout(() => {
    dots.forEach(dot => dot.classList.remove('error'));
  }, 300);
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
  
  document.getElementById('editModal')?.classList.add('active');
  Haptic.light();
}

function closeEditModal() {
  document.getElementById('editModal')?.classList.remove('active');
  State.editingEntry = null;
}

async function saveEdit() {
  if (!State.editingEntry) return;
  
  const entry = State.editingEntry;
  entry.productName = document.getElementById('editName').value.trim();
  entry.qty = parseInt(document.getElementById('editQty').value) || 1;
  entry.rms = document.getElementById('editRms').value.trim();
  
  await DB.put('history', entry);
  
  // Also update master data with product name
  if (entry.productName && entry.gtin14) {
    await updateMasterFromEdit(entry.gtin14, entry.productName);
  }
  
  // Update in-memory state
  const idx = State.history.findIndex(h => h.id === entry.id);
  if (idx !== -1) State.history[idx] = entry;
  
  filterHistory();
  renderRecentScans();
  closeEditModal();
  
  Haptic.success();
  showToast('Entry updated', 'success');
}

// ============================================
// UI HELPERS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
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
    <span class="toast-text">${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-16px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function switchPage(pageName) {
  Haptic.light();
  
  // Stop scanning when leaving scan page
  if (State.currentPage === 'scan' && pageName !== 'scan' && State.scanning) {
    stopScanning();
  }
  
  // Update pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });
  
  State.currentPage = pageName;
}

function openMenu() {
  document.getElementById('menuOverlay')?.classList.add('open');
  document.getElementById('sideMenu')?.classList.add('open');
  Haptic.light();
}

function closeMenu() {
  document.getElementById('menuOverlay')?.classList.remove('open');
  document.getElementById('sideMenu')?.classList.remove('open');
}

function updateStats() {
  const masterCount = State.masterData.size;
  const historyCount = State.history.length;
  
  // Update all stat displays
  const elements = {
    masterCount: ['masterCount', 'menuMasterCount'],
    historyCount: ['historyCount', 'menuHistoryCount', 'navHistoryBadge']
  };
  
  elements.masterCount.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = masterCount.toLocaleString();
  });
  
  elements.historyCount.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = historyCount.toLocaleString();
      if (id === 'navHistoryBadge') {
        el.style.display = historyCount > 0 ? 'flex' : 'none';
      }
    }
  });
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  const textEl = document.getElementById('connectionText');
  
  if (navigator.onLine) {
    statusEl?.classList.add('online');
    statusEl?.classList.remove('offline');
    if (textEl) textEl.textContent = 'Online';
  } else {
    statusEl?.classList.remove('online');
    statusEl?.classList.add('offline');
    if (textEl) textEl.textContent = 'Offline';
  }
}

function syncApiToggle() {
  const main = document.getElementById('enableApiLookupMain');
  const menu = document.getElementById('enableApiLookup');
  
  if (main) main.checked = State.apiLookupEnabled;
  if (menu) menu.checked = State.apiLookupEnabled;
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
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================
// SETTINGS PERSISTENCE
// ============================================
async function loadSettings() {
  try {
    const apiSetting = await DB.get('settings', 'apiLookupEnabled');
    State.apiLookupEnabled = apiSetting?.value ?? true;
    syncApiToggle();
  } catch (e) {
    console.log('Settings not found, using defaults');
  }
}

async function saveSetting(key, value) {
  await DB.put('settings', { key, value });
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchPage(item.dataset.page);
    });
  });
  
  // Quick actions
  document.querySelectorAll('.quick-action').forEach(action => {
    action.addEventListener('click', () => {
      const actionType = action.dataset.action;
      switch (actionType) {
        case 'scan':
          switchPage('scan');
          break;
        case 'paste':
          switchPage('paste');
          break;
        case 'history':
          switchPage('history');
          break;
        case 'export':
          openMenu();
          break;
      }
    });
  });
  
  // Hero buttons
  document.getElementById('heroScanBtn')?.addEventListener('click', () => {
    switchPage('scan');
    setTimeout(startScanning, 500);
  });
  
  document.getElementById('heroSearchBtn')?.addEventListener('click', () => {
    switchPage('history');
    setTimeout(() => {
      document.getElementById('searchInput')?.focus();
    }, 300);
  });
  
  // View all history link
  document.getElementById('viewAllHistory')?.addEventListener('click', () => {
    switchPage('history');
  });
  
  // Start/Stop Scanner button
  document.getElementById('btnStartScanner')?.addEventListener('click', async () => {
    if (State.scanning) {
      await stopScanning();
    } else {
      await startScanning();
    }
  });
  
  // Scan FAB button
  document.getElementById('scanFab')?.addEventListener('click', async () => {
    if (State.currentPage !== 'scan') {
      switchPage('scan');
      setTimeout(startScanning, 500);
    } else {
      if (State.scanning) {
        await stopScanning();
      } else {
        await startScanning();
      }
    }
  });
  
  // Manual entry
  document.getElementById('btnManualAdd')?.addEventListener('click', () => {
    const input = document.getElementById('manualInput');
    if (input && input.value.trim()) {
      processScan(input.value.trim());
      input.value = '';
    }
  });
  
  document.getElementById('manualInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btnManualAdd')?.click();
    }
  });
  
  // Image upload
  document.getElementById('btnUploadImage')?.addEventListener('click', () => {
    document.getElementById('imageFileInput')?.click();
  });
  
  document.getElementById('imageFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await scanImageFile(file);
    }
    e.target.value = '';
  });
  
  // Switch camera
  document.getElementById('btnSwitchCamera')?.addEventListener('click', switchCamera);
  
  // Search
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    State.searchQuery = e.target.value;
    filterHistory();
  });
  
  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      Haptic.light();
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      State.activeFilter = chip.dataset.filter;
      filterHistory();
    });
  });
  
  // Paste processing
  document.getElementById('btnProcessPaste')?.addEventListener('click', processPaste);
  
  document.getElementById('btnClearPaste')?.addEventListener('click', () => {
    const textarea = document.getElementById('pasteTextarea');
    if (textarea) textarea.value = '';
    document.getElementById('pasteStats')?.classList.remove('visible');
  });
  
  // Menu
  document.getElementById('menuBtn')?.addEventListener('click', openMenu);
  document.getElementById('menuOverlay')?.addEventListener('click', closeMenu);
  document.getElementById('menuClose')?.addEventListener('click', closeMenu);
  
  // Menu actions
  document.getElementById('menuUploadMaster')?.addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      const input = document.getElementById('masterFileInput');
      if (input) {
        input.dataset.mode = 'replace';
        input.click();
      }
    });
  });
  
  document.getElementById('menuAppendMaster')?.addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      document.getElementById('appendFileInput')?.click();
    });
  });
  
  // Master page buttons
  document.getElementById('btnReplaceMaster')?.addEventListener('click', () => {
    requestPinThen(() => {
      const input = document.getElementById('masterFileInput');
      if (input) {
        input.dataset.mode = 'replace';
        input.click();
      }
    });
  });
  
  document.getElementById('btnAppendMaster')?.addEventListener('click', () => {
    requestPinThen(() => {
      document.getElementById('appendFileInput')?.click();
    });
  });
  
  // Upload zone
  const uploadZone = document.getElementById('uploadZone');
  if (uploadZone) {
    uploadZone.addEventListener('click', () => {
      requestPinThen(() => {
        const input = document.getElementById('masterFileInput');
        if (input) {
          input.dataset.mode = 'replace';
          input.click();
        }
      });
    });
    
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
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        requestPinThen(() => handleMasterFile(file, false));
      }
    });
  }
  
  // Master file input
  document.getElementById('masterFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const mode = e.target.dataset.mode;
    if (file) {
      await handleMasterFile(file, mode === 'append');
    }
    e.target.value = '';
  });
  
  document.getElementById('appendFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleMasterFile(file, true);
    }
    e.target.value = '';
  });
  
  // Export
  document.getElementById('menuExportTSV')?.addEventListener('click', () => {
    closeMenu();
    exportTSV();
  });
  
  document.getElementById('menuExportCSV')?.addEventListener('click', () => {
    closeMenu();
    exportCSV();
  });
  
  // Backup
  document.getElementById('menuBackup')?.addEventListener('click', () => {
    closeMenu();
    downloadBackup();
  });
  
  document.getElementById('menuRestore')?.addEventListener('click', () => {
    closeMenu();
    requestPinThen(() => {
      document.getElementById('restoreFileInput')?.click();
    });
  });
  
  document.getElementById('restoreFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await restoreBackup(file);
    e.target.value = '';
  });
  
  // Clear history
  document.getElementById('menuClearHistory')?.addEventListener('click', () => {
    closeMenu();
    requestPinThen(async () => {
      await DB.clear('history');
      State.history = [];
      filterHistory();
      renderRecentScans();
      updateStats();
      Haptic.heavy();
      showToast('History cleared', 'success');
    });
  });
  
  // API Toggle - sync both checkboxes
  document.getElementById('enableApiLookup')?.addEventListener('change', (e) => {
    State.apiLookupEnabled = e.target.checked;
    syncApiToggle();
    saveSetting('apiLookupEnabled', State.apiLookupEnabled);
  });
  
  document.getElementById('enableApiLookupMain')?.addEventListener('change', (e) => {
    State.apiLookupEnabled = e.target.checked;
    syncApiToggle();
    saveSetting('apiLookupEnabled', State.apiLookupEnabled);
  });
  
  // PIN pad
  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', () => {
      handlePinKey(key.dataset.key);
    });
  });
  
  // Edit modal
  document.getElementById('editCancel')?.addEventListener('click', closeEditModal);
  document.getElementById('editSave')?.addEventListener('click', saveEdit);
  
  // Close modals on overlay click
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
  });
  
  document.getElementById('pinModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'pinModal') closePinModal();
  });
  
  // Network status
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
}

// Handle master file upload
async function handleMasterFile(file, append) {
  try {
    const content = await file.text();
    const products = parseMasterFile(content, file.name);
    await saveMasterData(products, append);
    
    Haptic.success();
    showToast(`${append ? 'Added' : 'Loaded'} ${products.length} products`, 'success');
  } catch (err) {
    Haptic.error();
    showToast(err.message || 'Failed to process file', 'error');
  }
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    // Initialize database
    await DB.init();
    
    // Load data
    await loadMasterData();
    await loadHistory();
    await loadSettings();
    
    // Initialize UI
    initEventListeners();
    updateConnectionStatus();
    
    // Check for scanner library
    if (typeof Html5Qrcode === 'undefined') {
      console.warn('Html5Qrcode library not loaded');
      document.getElementById('browserSupportInfo').style.display = 'block';
    } else {
      console.log('Html5Qrcode library loaded successfully');
      // Pre-initialize cameras
      initScanner().catch(err => {
        console.log('Camera pre-init skipped:', err);
      });
    }
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('Update available! Refresh to update.', 'info');
            }
          });
        });
      } catch (err) {
        console.error('Service Worker registration failed:', err);
      }
    }
    
    console.log('Oasis Pharmacy initialized successfully');
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to initialize app', 'error');
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
