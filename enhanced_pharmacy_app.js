/**
 * Enhanced Pharmacy PWA with Unified Barcode Support
 * Supports: GS1 GTIN-14, Legacy 12-digit, EAN-13, and Full GS1 tracking
 */

class UnifiedBarcodeParser {
  constructor() {
    this.aiPatterns = {
      '01': { name: 'GTIN', length: 14 },
      '17': { name: 'EXPIRY', length: 6 },
      '10': { name: 'BATCH', variable: true },
      '21': { name: 'SERIAL', variable: true },
      '11': { name: 'PROD_DATE', length: 6 },
      '310': { name: 'NET_WEIGHT', length: 6 },
      '37': { name: 'COUNT', variable: true }
    };
  }

  /**
   * Detect barcode format based on structure
   */
  detectFormat(barcode) {
    const cleaned = barcode.replace(/[^0-9]/g, '');
    
    // GS1 with parentheses
    if (barcode.includes('(01)')) {
      return 'GS1_PARENTHESIZED';
    }
    
    // GS1 without parentheses (starts with 01 and has tracking data)
    if (barcode.startsWith('01') && barcode.length > 16) {
      if (barcode.includes('17') || barcode.includes('21') || barcode.includes('10')) {
        return 'GS1_FULL';
      }
    }
    
    // Standard formats
    if (cleaned.length === 14) return 'GTIN14';
    if (cleaned.length === 13) return 'EAN13';
    if (cleaned.length === 12) return 'LEGACY12';
    if (cleaned.length === 8) return 'EAN8';
    
    return 'UNKNOWN';
  }

  /**
   * Parse GS1 barcode with parentheses: (01)GTIN(17)EXPIRY(10)BATCH(21)SERIAL
   */
  parseParenthesized(barcode) {
    const data = {
      format: 'GS1_PARENTHESIZED',
      raw: barcode
    };

    // Extract GTIN
    const gtinMatch = barcode.match(/\(01\)(\d{14})/);
    if (gtinMatch) data.gtin = gtinMatch[1];

    // Extract Expiry Date
    const expiryMatch = barcode.match(/\(17\)(\d{6})/);
    if (expiryMatch) {
      data.expiryRaw = expiryMatch[1];
      data.expiry = this.formatExpiry(expiryMatch[1]);
    }

    // Extract Batch Number
    const batchMatch = barcode.match(/\(10\)([^(]+)/);
    if (batchMatch) data.batch = batchMatch[1].trim();

    // Extract Serial Number
    const serialMatch = barcode.match(/\(21\)([^(]+)/);
    if (serialMatch) data.serial = serialMatch[1].trim();

    // Extract Production Date
    const prodDateMatch = barcode.match(/\(11\)(\d{6})/);
    if (prodDateMatch) {
      data.productionDateRaw = prodDateMatch[1];
      data.productionDate = this.formatExpiry(prodDateMatch[1]);
    }

    return data;
  }

  /**
   * Parse GS1 barcode without parentheses: 01GTIN17EXPIRY10BATCH21SERIAL
   */
  parseNonParenthesized(barcode) {
    const data = {
      format: 'GS1_FULL',
      raw: barcode
    };

    // Extract GTIN (always first 16 chars: 01 + 14 digits)
    if (barcode.startsWith('01')) {
      data.gtin = barcode.substring(2, 16);
    }

    const remaining = barcode.substring(16);

    // Extract Expiry (17YYMMDD)
    const expiryMatch = remaining.match(/17(\d{6})/);
    if (expiryMatch) {
      data.expiryRaw = expiryMatch[1];
      data.expiry = this.formatExpiry(expiryMatch[1]);
    }

    // Extract Batch (10BATCH - variable length until next AI)
    const batchMatch = remaining.match(/10([A-Z0-9\-_/]+?)(?:17|21|11|24|01|$)/);
    if (batchMatch) data.batch = batchMatch[1];

    // Extract Serial (21SERIAL - variable length until next AI)
    const serialMatch = remaining.match(/21([A-Z0-9]+?)(?:17|10|11|24|01|$)/);
    if (serialMatch) data.serial = serialMatch[1];

    // Extract Production Date (11YYMMDD)
    const prodDateMatch = remaining.match(/11(\d{6})/);
    if (prodDateMatch) {
      data.productionDateRaw = prodDateMatch[1];
      data.productionDate = this.formatExpiry(prodDateMatch[1]);
    }

    return data;
  }

  /**
   * Parse simple barcode formats (GTIN14, EAN13, Legacy12)
   */
  parseSimple(barcode, format) {
    const cleaned = barcode.replace(/[^0-9]/g, '');
    
    return {
      format: format,
      raw: barcode,
      code: cleaned,
      gtin: format === 'GTIN14' ? cleaned : null,
      ean13: format === 'EAN13' ? cleaned : null,
      legacy: format === 'LEGACY12' ? cleaned : null
    };
  }

  /**
   * Main parse function - handles all formats
   */
  parse(barcode) {
    if (!barcode || barcode.trim().length === 0) {
      return { error: 'Empty barcode' };
    }

    const format = this.detectFormat(barcode);

    try {
      switch (format) {
        case 'GS1_PARENTHESIZED':
          return this.parseParenthesized(barcode);
        
        case 'GS1_FULL':
          return this.parseNonParenthesized(barcode);
        
        case 'GTIN14':
        case 'EAN13':
        case 'LEGACY12':
        case 'EAN8':
          return this.parseSimple(barcode, format);
        
        default:
          return {
            format: 'UNKNOWN',
            raw: barcode,
            error: 'Unrecognized barcode format'
          };
      }
    } catch (error) {
      return {
        format: 'ERROR',
        raw: barcode,
        error: error.message
      };
    }
  }

  /**
   * Format expiry date from YYMMDD to YYYY-MM-DD
   */
  formatExpiry(yymmdd) {
    if (!yymmdd || yymmdd.length !== 6) return null;
    
    const yy = yymmdd.substring(0, 2);
    const mm = yymmdd.substring(2, 4);
    const dd = yymmdd.substring(4, 6);
    
    // Assume 20XX for years
    const year = `20${yy}`;
    
    return `${year}-${mm}-${dd}`;
  }

  /**
   * Get product identifier from parsed data
   */
  getProductId(parsedData) {
    if (parsedData.gtin) return parsedData.gtin;
    if (parsedData.code) return parsedData.code;
    if (parsedData.ean13) return parsedData.ean13;
    if (parsedData.legacy) return parsedData.legacy;
    return null;
  }
}

class PharmacyDatabase {
  constructor() {
    this.dbName = 'PharmacyDB';
    this.version = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Products table
        if (!db.objectStoreNames.contains('products')) {
          const productsStore = db.createObjectStore('products', { keyPath: 'product_id' });
          productsStore.createIndex('gtin', 'gtin_14', { unique: false });
          productsStore.createIndex('legacy', 'legacy_code', { unique: false });
          productsStore.createIndex('ean13', 'ean_13', { unique: false });
          productsStore.createIndex('name', 'product_name', { unique: false });
        }

        // Inventory units table
        if (!db.objectStoreNames.contains('inventory_units')) {
          const unitsStore = db.createObjectStore('inventory_units', { keyPath: 'unit_id', autoIncrement: true });
          unitsStore.createIndex('product_id', 'product_id', { unique: false });
          unitsStore.createIndex('serial', 'serial_number', { unique: false });
          unitsStore.createIndex('batch', 'batch_number', { unique: false });
          unitsStore.createIndex('expiry', 'expiry_date', { unique: false });
          unitsStore.createIndex('status', 'status', { unique: false });
        }

        // Barcode lookup table
        if (!db.objectStoreNames.contains('barcode_lookup')) {
          const lookupStore = db.createObjectStore('barcode_lookup', { keyPath: 'barcode_value' });
          lookupStore.createIndex('product_id', 'product_id', { unique: false });
        }
      };
    });
  }

  async lookupProduct(barcode) {
    const parser = new UnifiedBarcodeParser();
    const parsed = parser.parse(barcode);
    const productId = parser.getProductId(parsed);

    if (!productId) return null;

    // Try barcode lookup table first
    const lookupResult = await this.getByIndex('barcode_lookup', 'barcode_value', barcode);
    if (lookupResult) {
      const product = await this.get('products', lookupResult.product_id);
      return { product, parsed };
    }

    // Try direct GTIN lookup
    if (parsed.gtin) {
      const byGtin = await this.getByIndex('products', 'gtin', parsed.gtin);
      if (byGtin) return { product: byGtin, parsed };
    }

    // Try legacy code lookup
    if (parsed.legacy) {
      const byLegacy = await this.getByIndex('products', 'legacy', parsed.legacy);
      if (byLegacy) return { product: byLegacy, parsed };
    }

    // Try EAN13 lookup
    if (parsed.ean13) {
      const byEan = await this.getByIndex('products', 'ean13', parsed.ean13);
      if (byEan) return { product: byEan, parsed };
    }

    return null;
  }

  async saveScannedUnit(productId, parsedData) {
    const unit = {
      product_id: productId,
      serial_number: parsedData.serial || null,
      batch_number: parsedData.batch || null,
      expiry_date: parsedData.expiry || null,
      production_date: parsedData.productionDate || null,
      raw_barcode: parsedData.raw,
      barcode_format: parsedData.format,
      scan_timestamp: new Date().toISOString(),
      status: 'IN_STOCK'
    };

    return await this.add('inventory_units', unit);
  }

  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.get(value);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

class EnhancedPharmacyUI {
  constructor() {
    this.parser = new UnifiedBarcodeParser();
    this.database = new PharmacyDatabase();
    this.currentScan = null;
    this.init();
  }

  async init() {
    await this.database.init();
    this.setupEventListeners();
    this.setupAnimations();
    this.loadHistory();
  }

  setupEventListeners() {
    // Manual barcode input
    const barcodeInput = document.getElementById('barcode-input');
    if (barcodeInput) {
      barcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleManualScan(barcodeInput.value);
          barcodeInput.value = '';
        }
      });
    }

    // Scan button
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.startCameraScan());
    }

    // Save button
    const saveBtn = document.getElementById('save-unit-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCurrentUnit());
    }
  }

  async handleManualScan(barcode) {
    try {
      this.showLoading();
      
      // Parse barcode
      const parsed = this.parser.parse(barcode);
      
      // Lookup product
      const result = await this.database.lookupProduct(barcode);
      
      if (result && result.product) {
        this.displayProductInfo(result.product, parsed);
        this.currentScan = { product: result.product, parsed };
      } else {
        this.showNewProductForm(parsed);
        this.currentScan = { product: null, parsed };
      }
      
      this.hideLoading();
    } catch (error) {
      console.error('Scan error:', error);
      this.showError('Error processing barcode: ' + error.message);
      this.hideLoading();
    }
  }

  displayProductInfo(product, parsed) {
    const infoDiv = document.getElementById('product-info');
    if (!infoDiv) return;

    const expiryStatus = this.calculateExpiryStatus(parsed.expiry);
    const expiryClass = expiryStatus.class;
    const expiryText = expiryStatus.text;

    infoDiv.innerHTML = `
      <div class="product-card animate-slide-in">
        <div class="product-header">
          <h3>${product.product_name}</h3>
          <span class="format-badge ${parsed.format.toLowerCase()}">${parsed.format}</span>
        </div>
        
        <div class="product-details">
          <div class="detail-row">
            <span class="label">Product ID:</span>
            <span class="value">${product.product_id}</span>
          </div>
          
          ${parsed.gtin ? `
            <div class="detail-row">
              <span class="label">GTIN:</span>
              <span class="value code">${parsed.gtin}</span>
            </div>
          ` : ''}
          
          ${parsed.batch ? `
            <div class="detail-row">
              <span class="label">Batch:</span>
              <span class="value">${parsed.batch}</span>
            </div>
          ` : ''}
          
          ${parsed.serial ? `
            <div class="detail-row">
              <span class="label">Serial:</span>
              <span class="value code">${parsed.serial}</span>
            </div>
          ` : ''}
          
          ${parsed.expiry ? `
            <div class="detail-row">
              <span class="label">Expiry:</span>
              <span class="value ${expiryClass}">${parsed.expiry} <span class="expiry-status">${expiryText}</span></span>
            </div>
          ` : ''}
          
          ${parsed.productionDate ? `
            <div class="detail-row">
              <span class="label">Manufactured:</span>
              <span class="value">${parsed.productionDate}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="product-actions">
          <button id="save-unit-btn" class="btn-primary" data-haptic>
            <span class="icon">💾</span> Save to Inventory
          </button>
          <button class="btn-secondary" data-haptic onclick="this.closest('.product-card').remove()">
            <span class="icon">✕</span> Cancel
          </button>
        </div>
      </div>
    `;

    this.triggerHaptic();
  }

  showNewProductForm(parsed) {
    const infoDiv = document.getElementById('product-info');
    if (!infoDiv) return;

    infoDiv.innerHTML = `
      <div class="product-card new-product animate-slide-in">
        <div class="alert alert-warning">
          <span class="icon">⚠️</span>
          <span>Product not found in database</span>
        </div>
        
        <h3>Add New Product</h3>
        
        <div class="form-group">
          <label>Product Name:</label>
          <input type="text" id="new-product-name" class="form-control" placeholder="Enter product name">
        </div>
        
        <div class="form-group">
          <label>Category:</label>
          <select id="new-product-category" class="form-control">
            <option value="">Select category</option>
            <option value="pain-relief">Pain Relief</option>
            <option value="antibiotics">Antibiotics</option>
            <option value="vitamins">Vitamins & Supplements</option>
            <option value="cold-flu">Cold & Flu</option>
            <option value="digestive">Digestive Health</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div class="detected-info">
          <h4>Detected from Barcode:</h4>
          <div class="detail-row">
            <span class="label">Format:</span>
            <span class="value">${parsed.format}</span>
          </div>
          ${parsed.gtin ? `
            <div class="detail-row">
              <span class="label">GTIN:</span>
              <span class="value code">${parsed.gtin}</span>
            </div>
          ` : ''}
          ${parsed.code ? `
            <div class="detail-row">
              <span class="label">Code:</span>
              <span class="value code">${parsed.code}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="product-actions">
          <button id="create-product-btn" class="btn-primary" data-haptic>
            <span class="icon">➕</span> Create Product
          </button>
          <button class="btn-secondary" data-haptic onclick="this.closest('.product-card').remove()">
            <span class="icon">✕</span> Cancel
          </button>
        </div>
      </div>
    `;

    document.getElementById('create-product-btn').addEventListener('click', () => {
      this.createNewProduct(parsed);
    });
  }

  async createNewProduct(parsed) {
    const name = document.getElementById('new-product-name').value;
    const category = document.getElementById('new-product-category').value;

    if (!name) {
      this.showError('Please enter a product name');
      return;
    }

    const productId = `PROD_${parsed.gtin || parsed.code || Date.now()}`;
    
    const product = {
      product_id: productId,
      product_name: name,
      gtin_14: parsed.gtin || null,
      legacy_code: parsed.legacy || null,
      ean_13: parsed.ean13 || null,
      category: category,
      barcode_type: parsed.format,
      active: true,
      created_date: new Date().toISOString()
    };

    try {
      await this.database.add('products', product);
      
      // Add to barcode lookup
      await this.database.add('barcode_lookup', {
        barcode_value: parsed.raw,
        product_id: productId,
        barcode_format: parsed.format,
        is_primary: true
      });

      this.showSuccess('Product created successfully!');
      this.displayProductInfo(product, parsed);
      this.currentScan = { product, parsed };
    } catch (error) {
      this.showError('Error creating product: ' + error.message);
    }
  }

  async saveCurrentUnit() {
    if (!this.currentScan) {
      this.showError('No scan data to save');
      return;
    }

    try {
      const unitId = await this.database.saveScannedUnit(
        this.currentScan.product.product_id,
        this.currentScan.parsed
      );

      this.showSuccess('Unit saved to inventory!');
      this.loadHistory();
      this.currentScan = null;
      
      // Clear display
      const infoDiv = document.getElementById('product-info');
      if (infoDiv) infoDiv.innerHTML = '';
      
      this.triggerHaptic();
    } catch (error) {
      this.showError('Error saving unit: ' + error.message);
    }
  }

  calculateExpiryStatus(expiryDate) {
    if (!expiryDate) {
      return { class: '', text: '' };
    }

    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { class: 'expired', text: '⚠️ Expired' };
    } else if (daysUntilExpiry <= 30) {
      return { class: 'short-expiry', text: `⏰ ${daysUntilExpiry} days left` };
    } else if (daysUntilExpiry <= 90) {
      return { class: 'medium-expiry', text: `📅 ${Math.ceil(daysUntilExpiry / 30)} months left` };
    } else {
      return { class: 'normal-expiry', text: '✓ Good' };
    }
  }

  async loadHistory() {
    try {
      const units = await this.database.getAll('inventory_units');
      this.renderHistoryTable(units);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }

  renderHistoryTable(units) {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;

    if (units.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No scanned items yet</td></tr>';
      return;
    }

    // Sort by scan timestamp (newest first)
    units.sort((a, b) => new Date(b.scan_timestamp) - new Date(a.scan_timestamp));

    tableBody.innerHTML = units.map(unit => {
      const expiryStatus = this.calculateExpiryStatus(unit.expiry_date);
      const scanDate = new Date(unit.scan_timestamp).toLocaleString();

      return `
        <tr class="product-row ${expiryStatus.class}" data-expiry="${unit.expiry_date || ''}">
          <td>${unit.product_id}</td>
          <td class="code">${unit.serial_number || '-'}</td>
          <td>${unit.batch_number || '-'}</td>
          <td class="${expiryStatus.class}">
            ${unit.expiry_date || '-'}
            ${expiryStatus.text ? `<span class="status-badge">${expiryStatus.text}</span>` : ''}
          </td>
          <td><span class="format-badge ${unit.barcode_format.toLowerCase()}">${unit.barcode_format}</span></td>
          <td class="timestamp">${scanDate}</td>
        </tr>
      `;
    }).join('');

    this.applyColorCoding();
  }

  applyColorCoding() {
    document.querySelectorAll('.product-row').forEach(row => {
      const classes = row.className;
      
      if (classes.includes('expired')) {
        row.style.background = 'linear-gradient(90deg, rgba(255,107,107,0.15) 0%, rgba(255,107,107,0.05) 100%)';
      } else if (classes.includes('short-expiry')) {
        row.style.background = 'linear-gradient(90deg, rgba(255,169,77,0.15) 0%, rgba(255,169,77,0.05) 100%)';
      } else if (classes.includes('medium-expiry')) {
        row.style.background = 'linear-gradient(90deg, rgba(255,206,84,0.1) 0%, rgba(255,206,84,0.05) 100%)';
      } else {
        row.style.background = 'linear-gradient(90deg, rgba(81,207,102,0.1) 0%, rgba(81,207,102,0.05) 100%)';
      }
    });
  }

  setupAnimations() {
    // Page flip animation (from original code)
    document.querySelectorAll('[data-page-flip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.flipPage(btn.dataset.target);
      });
    });

    // Haptic feedback elements
    document.querySelectorAll('[data-haptic]').forEach(element => {
      element.addEventListener('click', () => {
        this.triggerHaptic();
      });
    });
  }

  flipPage(target) {
    const currentPage = document.querySelector('.page.active');
    const nextPage = document.querySelector(target);
    
    if (!currentPage || !nextPage) return;

    currentPage.style.transform = 'rotateY(-180deg)';
    nextPage.style.transform = 'rotateY(0deg)';

    setTimeout(() => {
      currentPage.classList.remove('active');
      nextPage.classList.add('active');
    }, 500);
  }

  triggerHaptic() {
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  }

  showLoading() {
    // Add loading indicator
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'block';
  }

  hideLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'none';
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-in`;
    toast.innerHTML = `
      <span class="icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span class="message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  startCameraScan() {
    // Implement camera scanning using html5-qrcode or similar library
    console.log('Camera scan not yet implemented');
    this.showError('Camera scanning coming soon! Use manual input for now.');
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  const app = new EnhancedPharmacyUI();
  window.pharmacyApp = app; // Make accessible globally for debugging
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UnifiedBarcodeParser, PharmacyDatabase, EnhancedPharmacyUI };
}
