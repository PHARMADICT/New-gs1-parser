# COMPLETE SPECIFICATION: GS1 BARCODE SCANNER PWA
## Personal Offline-First Expiry Tracker Application

**Version:** 2.0 Final  
**Type:** Progressive Web Application (PWA)  
**Platforms:** Android, iOS, Windows, macOS, Linux (via any modern browser)  
**Dependencies:** None (fully self-contained, no server required)  
**License:** Personal Use / Open Source

---

# TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Application Structure](#3-application-structure)
4. [GS1 Barcode Parsing Specification](#4-gs1-barcode-parsing-specification)
5. [Product Matching Logic](#5-product-matching-logic)
6. [Master Data Management](#6-master-data-management)
7. [API Lookup Integration](#7-api-lookup-integration)
8. [User Interface Design](#8-user-interface-design)
9. [Data Storage Specification](#9-data-storage-specification)
10. [Export Formats](#10-export-formats)
11. [Security Features](#11-security-features)
12. [Offline Functionality](#12-offline-functionality)
13. [Complete Feature List](#13-complete-feature-list)
14. [File Structure](#14-file-structure)
15. [CSS Design System](#15-css-design-system)
16. [JavaScript Implementation](#16-javascript-implementation)
17. [Testing Scenarios](#17-testing-scenarios)
18. [Deployment Instructions](#18-deployment-instructions)

---

# 1. PROJECT OVERVIEW

## 1.1 Purpose
Build a completely independent, offline-first Progressive Web Application (PWA) for scanning and parsing GS1 barcodes, tracking product expiry dates, and managing pharmaceutical/retail inventory. The application must work without any internet connection after initial installation and must not be bound to any URL, brand, or external service.

## 1.2 Target Users
- Pharmacists and pharmacy staff
- Retail inventory managers
- Healthcare professionals
- Personal medication tracking
- Small business stock management

## 1.3 Core Requirements
- **100% Offline Capable** - All features work without internet after first load
- **Cross-Platform** - Single codebase works on Android, iOS, Windows, macOS, Linux
- **No Backend Server** - Entirely client-side, no APIs required for core functionality
- **No Subscription/Payment** - Completely free, no hidden costs
- **Privacy First** - All data stays on device, nothing sent to external servers
- **Self-Contained** - Can be hosted anywhere (GitHub Pages, local file server, USB drive)
- **No Brand Binding** - Independent app, not affiliated with any company

## 1.4 What This App Replaces
- Orca Scan (commercial, cloud-dependent)
- GS1 Official Apps (require internet for lookup)
- Tatmeen/Regional Systems (closed, government-specific)
- Paid inventory management software

---

# 2. TECHNICAL ARCHITECTURE

## 2.1 Technology Stack
```
Frontend:        Pure HTML5, CSS3, JavaScript (ES6+)
Barcode Library: html5-qrcode (CDN: unpkg.com/html5-qrcode@2.3.8)
Storage:         IndexedDB (primary), localStorage (fallback)
PWA:             Service Worker + Web App Manifest
Fonts:           Google Fonts - Outfit (UI), JetBrains Mono (data)
Icons:           Inline SVG (no external dependencies)
```

## 2.2 Browser Compatibility
| Browser | Camera Scan | Image Scan | Manual Entry | PWA Install |
|---------|-------------|------------|--------------|-------------|
| Chrome (Android) | ✅ | ✅ | ✅ | ✅ |
| Safari (iOS 14.3+) | ✅ | ✅ | ✅ | ✅ |
| Chrome (Desktop) | ✅ | ✅ | ✅ | ✅ |
| Firefox | ✅ | ✅ | ✅ | ❌ |
| Edge | ✅ | ✅ | ✅ | ✅ |
| Samsung Internet | ✅ | ✅ | ✅ | ✅ |

## 2.3 Supported Barcode Formats
- GS1 DataMatrix (2D) - Primary for pharmaceuticals
- GS1-128 / Code 128 (1D)
- EAN-13 / EAN-8
- UPC-A / UPC-E
- QR Code (GS1 Digital Link)
- Code 39 / Code 93
- ITF (Interleaved 2 of 5)

---

# 3. APPLICATION STRUCTURE

## 3.1 File Structure
```
/app-root/
├── index.html          # Main application (single HTML file)
├── app.js              # Application logic (single JS file)
├── sw.js               # Service Worker for offline
├── manifest.json       # PWA manifest
├── sample-master.csv   # Example master data file
├── README.md           # Documentation
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    └── icon-512.png
```

## 3.2 Application Pages/Tabs
1. **Home** - Hero section, quick actions, recent scans summary
2. **Scan** - Camera scanner, image upload, manual entry
3. **History** - Complete scan history with search/filter
4. **Paste** - Bulk barcode paste processing
5. **Settings/Master** - Master data upload, export, backup, settings

## 3.3 Navigation Structure
- **Bottom Navigation Bar** (mobile-first): Home, Scan, History, Paste, Settings
- **Floating Action Button (FAB)**: Quick scan access from any page
- **Side Menu (hamburger)**: Advanced settings, export, backup, danger zone

---

# 4. GS1 BARCODE PARSING SPECIFICATION

## 4.1 Supported Application Identifiers (AIs)
| AI Code | Field Name | Length | Format | Required |
|---------|------------|--------|--------|----------|
| (01) | GTIN | 14 digits | Numeric | YES |
| (17) | Expiry Date | 6 digits | YYMMDD | NO |
| (10) | Batch/Lot Number | Variable | Alphanumeric | NO |
| (21) | Serial Number | Variable | Alphanumeric | NO |
| (30) | Quantity | Variable | Numeric | NO |

## 4.2 Parsing Rules

### 4.2.1 Raw Input Formats Accepted
```
Format 1 (Parenthesized - Human Readable):
(01)09504000012345(17)240531(10)ABC123(21)SN001(30)5

Format 2 (Raw with FNC1 separators):
0109504000012345172405311ABC123<FNC1>21SN001305

Format 3 (Plain GTIN only):
9504000012345
09504000012345
```

### 4.2.2 GTIN Processing
```javascript
Input GTIN: Any length from 8-14 digits
Process:
1. Remove all non-numeric characters
2. Pad with leading zeros to 14 digits → GTIN-14
3. If starts with '0', also store GTIN-13 (remove first '0')
4. Calculate "GTIN-8" = digits 5-12 (for matching purposes)

Example:
Input: "9504000012345" (13 digits)
GTIN-14: "09504000012345"
GTIN-13: "9504000012345"
GTIN-8:  "40000123" (positions 5-12 of GTIN-14)
```

### 4.2.3 Expiry Date Processing
```javascript
Input: YYMMDD from AI (17)
Rules:
- Year: 20YY (always 2000s)
- Month: MM (01-12)
- Day: DD (01-31, or 00 = last day of month)

Special Case - Day 00:
If DD = 00, use last day of that month
Example: 251100 → November 2025 → 2025-11-30

Output Formats:
- ISO: "YYYY-MM-DD" (for calculations)
- DDMMYY: "301125" (for export)
- Display: "30/11/2025" (for UI)
```

### 4.2.4 Expiry Status Calculation
```javascript
const today = new Date();
const expiryDate = new Date(isoDateString);
const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

if (diffDays < 0) return 'EXPIRED';      // Past expiry
if (diffDays <= 90) return 'EXPIRING';   // Within 3 months (orange)
return 'OK';                              // More than 3 months (green)
```

### 4.2.5 Batch Number Extraction
```javascript
AI (10) is variable length
Terminates at:
- Next AI indicator '('
- FNC1 separator character
- End of string

Characters allowed: A-Z, a-z, 0-9, -, /, ., space
Max length: 20 characters (GS1 standard)
```

### 4.2.6 Serial Number Extraction
```javascript
AI (21) is variable length
Same termination rules as batch
Max length: 20 characters
```

### 4.2.7 Quantity Extraction
```javascript
AI (30) contains count of items
Variable length, numeric only
Default value if not present: 1
```

## 4.3 Parsing Function Output
```javascript
{
  valid: true,                    // Boolean: parsing successful
  raw: "(01)095040...",          // Original input string
  gtin14: "09504000012345",      // 14-digit GTIN
  gtin13: "9504000012345",       // 13-digit GTIN
  gtin8: "40000123",             // 8-digit extract (pos 5-12)
  expiry: "2024-05-31",          // ISO date
  expiryDDMMYY: "310524",        // DDMMYY format
  expiryFormatted: "31/05/2024", // Display format
  expiryStatus: "OK",            // EXPIRED | EXPIRING | OK | MISSING
  batch: "ABC123",               // Batch/Lot number
  serial: "SN001",               // Serial number
  qty: 5,                        // Quantity (default 1)
  productName: "",               // Filled after matching
  matchType: "NONE",             // EXACT | LAST8 | SEQ6 | API | AMBIGUOUS | NONE
  rms: ""                        // User-editable RMS code
}
```

## 4.4 Validation Rules
```
VALID barcode must have:
- At least (01) with valid 12-14 digit GTIN
- OR plain 8-14 digit numeric string

INVALID if:
- No recognizable GTIN pattern
- GTIN contains non-numeric after cleanup
- GTIN length < 8 after cleanup
```

---

# 5. PRODUCT MATCHING LOGIC

## 5.1 Matching Priority Order
The system attempts to match scanned GTINs against the master data in this order:

### Priority 1: EXACT Match
```javascript
// Try matching full GTIN-14
if (masterData.has(scannedGTIN14)) {
  return { name: masterData.get(scannedGTIN14), type: 'EXACT' };
}

// Try matching GTIN-13
if (masterData.has(scannedGTIN13)) {
  return { name: masterData.get(scannedGTIN13), type: 'EXACT' };
}
```

### Priority 2: LAST-8 Match
```javascript
// Extract last 8 digits of scanned GTIN-14
const last8 = scannedGTIN14.slice(-8);

// Find master entries with matching last 8 digits
const matches = masterEntries.filter(entry => 
  entry.gtin.slice(-8) === last8
);

if (matches.length === 1) {
  return { name: matches[0].name, type: 'LAST8' };
}
if (matches.length > 1) {
  return { name: '', type: 'AMBIGUOUS-LAST8' };
}
```

### Priority 3: SEQUENTIAL-6 Match (Fuzzy)
```javascript
// Take last 10 digits of GTIN-14
const last10 = scannedGTIN14.slice(-10);

// Generate all possible 6-digit sequences
for (let i = 0; i <= 4; i++) {
  const seq6 = last10.substring(i, i + 6);
  
  // Check if any master barcode contains this sequence
  const matches = masterEntries.filter(entry =>
    entry.gtin.includes(seq6)
  );
  
  if (matches.length === 1) {
    return { name: matches[0].name, type: 'SEQ6' };
  }
  if (matches.length > 1) {
    return { name: '', type: 'AMBIGUOUS-SEQ6' };
  }
}
```

### Priority 4: API Lookup (Optional, requires internet)
```javascript
if (navigator.onLine && apiLookupEnabled) {
  const result = await lookupProductAPI(scannedGTIN14);
  if (result) {
    return { name: result.name, type: 'API' };
  }
}
```

### Priority 5: No Match
```javascript
return { name: '', type: 'NONE' };
```

## 5.2 Match Type Definitions
| Match Type | Description | Confidence |
|------------|-------------|------------|
| EXACT | Full GTIN matched in master | 100% |
| LAST8 | Last 8 digits matched | 95% |
| SEQ6 | 6-digit sequence found | 70% |
| API | Found via online database | 90% |
| AMBIGUOUS | Multiple possible matches | 0% (needs review) |
| NONE | No match found | 0% |

## 5.3 Master Data Index Structure
```javascript
// Build indexes on master data load
const masterIndex = {
  exact: new Map(),    // Full GTIN → product name
  last8: new Map(),    // Last 8 digits → array of {gtin, name}
  all: []              // Full array for seq6 search
};

// Population example
masterData.forEach((name, gtin) => {
  const g14 = gtin.padStart(14, '0');
  const g13 = g14.startsWith('0') ? g14.slice(1) : g14;
  const l8 = g14.slice(-8);
  
  masterIndex.exact.set(gtin, name);
  masterIndex.exact.set(g14, name);
  masterIndex.exact.set(g13, name);
  
  if (!masterIndex.last8.has(l8)) {
    masterIndex.last8.set(l8, []);
  }
  masterIndex.last8.get(l8).push({ gtin, name });
  
  masterIndex.all.push({ gtin, name });
});
```

---

# 6. MASTER DATA MANAGEMENT

## 6.1 Master File Format
```
Accepted formats: CSV, TSV, TXT, XLSX, XLS

Required columns (auto-detected):
- Barcode column: GTIN, Barcode, EAN, UPC, Code, SKU, Item
- Name column: Name, Product, Description, Item, Title, Desc

Example CSV:
Barcode,Product Name
09504000012345,Vitamin D3 1000 IU Tablets 60s
07704500123456,Paracetamol 500mg Capsules 24s
```

## 6.2 Master Data Operations

### 6.2.1 Upload (Replace)
- Clears existing master data
- Parses new file
- Builds fresh indexes
- Requires PIN confirmation

### 6.2.2 Append
- Keeps existing master data
- Adds new entries from file
- Updates existing GTINs with new names
- Rebuilds indexes
- Requires PIN confirmation

### 6.2.3 Edit from Scan
- When user edits product name in history
- Also updates master data with new name
- Persists for future scans of same GTIN

## 6.3 Master Data Storage
```javascript
// IndexedDB Store: 'master'
{
  gtin: "09504000012345",  // Primary key
  name: "Vitamin D3 1000 IU Tablets 60s"
}
```

---

# 7. API LOOKUP INTEGRATION

## 7.1 Supported APIs (Free, No Key Required)
| API | URL | Rate Limit | Data Quality |
|-----|-----|------------|--------------|
| Open Food Facts | world.openfoodfacts.org | None | Good (food/pharma) |
| UPC Database | api.upcitemdb.com | 100/day | Good (retail) |
| Brocade.io | brocade.io/api | None | Moderate |

## 7.2 API Lookup Flow
```javascript
async function lookupProductAPI(gtin) {
  if (!navigator.onLine) return null;
  if (!settings.apiLookupEnabled) return null;
  
  // Try Open Food Facts first
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${gtin}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json();
    if (data.status === 1 && data.product?.product_name) {
      return {
        name: data.product.product_name,
        brand: data.product.brands || '',
        source: 'OpenFoodFacts'
      };
    }
  } catch (e) { /* continue to next API */ }
  
  // Try UPC Database
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${gtin}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json();
    if (data.code === 'OK' && data.items?.length > 0) {
      return {
        name: data.items[0].title,
        brand: data.items[0].brand || '',
        source: 'UPCDatabase'
      };
    }
  } catch (e) { /* no match */ }
  
  return null;
}
```

## 7.3 API Settings
```javascript
// Toggle in UI
☑️ Auto-lookup unknown products online (API)
   Uses external databases when product not found in master.
   Requires internet connection.

// Storage
localStorage.setItem('apiLookupEnabled', 'true');
```

---

# 8. USER INTERFACE DESIGN

## 8.1 Design System

### 8.1.1 Color Palette
```css
/* Deep Blue Theme */
--bg-deepest: #050a12;
--bg-deep: #0a1628;
--bg-dark: #0f2140;
--bg-surface: #132744;
--bg-elevated: #1a3a5c;
--bg-hover: #1f4470;

/* Accent Colors */
--accent-primary: #3b82f6;
--accent-secondary: #06b6d4;
--accent-glow: rgba(59, 130, 246, 0.3);

/* Status Colors */
--success: #10b981;        /* Green - OK, 4+ months */
--warning: #f59e0b;        /* Orange - Expiring, 2-3 months */
--danger: #ef4444;         /* Red - Expired */
--info: #8b5cf6;           /* Purple - API match */

/* Text Colors */
--text-primary: #f0f6ff;
--text-secondary: #94b8e0;
--text-muted: #5a7da8;
```

### 8.1.2 Typography
```css
/* UI Text */
font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;

/* Data/Codes */
font-family: 'JetBrains Mono', monospace;

/* Scale */
--text-xs: 0.625rem;   /* 10px */
--text-sm: 0.75rem;    /* 12px */
--text-base: 0.875rem; /* 14px */
--text-lg: 1rem;       /* 16px */
--text-xl: 1.125rem;   /* 18px */
--text-2xl: 1.5rem;    /* 24px */
```

### 8.1.3 Spacing System
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

### 8.1.4 Border Radius
```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;
```

## 8.2 Component Specifications

### 8.2.1 Header
```
Height: 64px
Position: Sticky top
Background: Semi-transparent with blur (glassmorphism)
Contents:
  - Logo icon (40x40px, gradient background)
  - App name and branch label
  - Connection status pill (Online/Offline)
  - Menu button (hamburger icon)
```

### 8.2.2 Bottom Navigation
```
Height: 72px + safe-area-inset-bottom
Position: Fixed bottom
Background: Semi-transparent with blur
Contents:
  - 5 nav items (Home, Scan, History, Paste, Settings)
  - Each item: icon (22px) + label (10px)
  - Active indicator: 3px bar at top
  - Badge for history count (red circle)
```

### 8.2.3 Floating Action Button (FAB)
```
Size: 56x56px
Shape: Circle
Position: 16px above bottom nav, centered
Background: Gradient (primary → secondary)
Shadow: Blue glow effect
Icon: Barcode scanner (changes to stop icon when scanning)
Animation: Pulse effect when scanning
```

### 8.2.4 History Cards
```
Layout: Full-width card with left border accent
Border Color: Based on expiry status (red/orange/green)
Contents:
  - Product name (with strikethrough if expired)
  - Quantity badge
  - GTIN display
  - Expiry date
  - Batch number
  - Edit/Delete action buttons
```

### 8.2.5 Scanner View
```
Container: Square aspect ratio, max 400px
Video: Full coverage with rounded corners
Overlay:
  - Semi-transparent mask (darker outside viewfinder)
  - Viewfinder: 70% size, corner brackets
  - Scan line: Animated horizontal line
  - Hint text: Status message at bottom
Controls:
  - Start/Stop button (prominent)
  - Flip camera button
  - Upload image button
```

## 8.3 Expiry Color Coding
| Status | Background | Text Color | Border | Additional |
|--------|------------|------------|--------|------------|
| Expired | Red 15% | Red #ef4444 | Red solid | Strikethrough text |
| Expiring (≤90 days) | Orange 15% | Orange #f59e0b | Orange solid | - |
| OK (>90 days) | Green 15% | Green #10b981 | Green solid | - |
| Missing | Gray 15% | Gray #5a7da8 | Gray dashed | - |

## 8.4 Responsive Breakpoints
```css
/* Mobile First */
Default: 0-479px (single column)
@media (min-width: 480px) { /* Large phones */ }
@media (min-width: 768px) { /* Tablets, centered max-width: 600px */ }
@media (min-width: 1024px) { /* Desktop */ }
```

---

# 9. DATA STORAGE SPECIFICATION

## 9.1 IndexedDB Schema
```javascript
Database Name: 'pharmacy-scanner-db'
Version: 2

Object Stores:

1. 'history' (scan records)
   - keyPath: 'id' (auto-increment)
   - Indexes:
     - 'gtin14' (non-unique)
     - ['gtin14', 'batch'] (compound, for deduplication)
     - 'scanTime' (for sorting)
     - 'expiryStatus' (for filtering)

2. 'master' (product database)
   - keyPath: 'gtin'
   - No additional indexes needed

3. 'settings' (app configuration)
   - keyPath: 'key'
   - Values stored as {key, value} pairs
```

## 9.2 History Entry Schema
```javascript
{
  id: 1,                              // Auto-generated
  scanTime: "2024-05-15T10:30:00Z",  // ISO timestamp
  raw: "(01)09504000012345...",      // Original barcode string
  gtin14: "09504000012345",
  gtin13: "9504000012345",
  expiry: "2024-12-31",              // ISO date
  expiryDDMMYY: "311224",
  expiryFormatted: "31/12/2024",
  expiryStatus: "OK",                // EXPIRED | EXPIRING | OK | MISSING
  batch: "ABC123",
  serial: "SN001",
  qty: 1,
  productName: "Vitamin D3 Tablets",
  matchType: "EXACT",                // EXACT | LAST8 | SEQ6 | API | NONE
  rms: ""                            // User-editable field
}
```

## 9.3 Smart Inventory (Quantity Merge)
```javascript
// Before creating new entry, check for existing
const existing = await db.findByGtinBatch(gtin14, batch);

if (existing) {
  // Same product + same batch = increment quantity
  existing.qty += parsedQty;
  existing.scanTime = new Date().toISOString();
  await db.put('history', existing);
  showToast(`+${parsedQty} qty (total: ${existing.qty})`);
} else {
  // New entry
  await db.put('history', newEntry);
}
```

## 9.4 Backup Format
```javascript
{
  version: 2,
  app: "PharmacyScanner",
  exportDate: "2024-05-15T10:30:00Z",
  history: [ /* array of history entries */ ],
  master: [ /* array of {gtin, name} */ ],
  settings: {
    apiLookupEnabled: true,
    pinCode: "9633"
  }
}
```

---

# 10. EXPORT FORMATS

## 10.1 Custom Export Header Order
```
RMS | BARCODE (GTIN) | DESCRIPTION | EXPIRY (DDMMYY) | BATCH | QUANTITY
```

## 10.2 TSV Export
```javascript
function exportTSV() {
  const headers = ['RMS', 'BARCODE (GTIN)', 'DESCRIPTION', 
                   'EXPIRY (DDMMYY)', 'BATCH', 'QUANTITY'];
  
  const rows = history.map(h => [
    h.rms || '',
    h.gtin14,
    h.productName || '',
    h.expiryDDMMYY || '',
    h.batch || '',
    h.qty
  ]);
  
  const content = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  downloadFile(content, `export-${dateString}.tsv`, 'text/tab-separated-values');
}
```

## 10.3 CSV Export
```javascript
function exportCSV() {
  const headers = ['RMS', 'BARCODE (GTIN)', 'DESCRIPTION', 
                   'EXPIRY (DDMMYY)', 'BATCH', 'QUANTITY'];
  
  const rows = history.map(h => [
    h.rms || '',
    h.gtin14,
    h.productName || '',
    h.expiryDDMMYY || '',
    h.batch || '',
    h.qty
  ]);
  
  // Escape and quote fields
  const content = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  downloadFile(content, `export-${dateString}.csv`, 'text/csv');
}
```

## 10.4 Merge Mode Output
When processing a second file against master:
```
Barcode | Description | EXPIRY | QTY | BATCH | SUPPLIER

Matching rules:
- Match minimum 6 digits from any position
- If match found: copy Description from master
- If no match: leave Description blank
- Keep ALL rows from second file (don't remove unmatched)
- Don't reorder rows
```

---

# 11. SECURITY FEATURES

## 11.1 PIN Lock System
```
Default PIN: 9633 (4 digits)
Storage: CONFIG constant in app.js

Protected Operations:
- Edit history entries
- Upload master data
- Append to master data
- Restore backup
- Clear all history
```

## 11.2 PIN Modal UI
```
- 4 dots display (filled as digits entered)
- Numeric keypad (0-9)
- Cancel and delete buttons
- Error shake animation on wrong PIN
- Auto-validates after 4 digits
```

## 11.3 PIN Implementation
```javascript
function requestPinThen(callback) {
  State.pinCallback = callback;
  State.pinInput = '';
  updatePinDisplay();
  showPinModal();
}

function handlePinKey(key) {
  haptic.light();
  
  if (key === 'cancel') { closePinModal(); return; }
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
          haptic.success();
          const callback = State.pinCallback;
          closePinModal();
          callback();
        } else {
          haptic.error();
          showPinError();
          State.pinInput = '';
          updatePinDisplay();
        }
      }, 200);
    }
  }
}
```

---

# 12. OFFLINE FUNCTIONALITY

## 12.1 Service Worker Strategy
```javascript
// Cache-first for app shell
// Network-first for API calls
// Stale-while-revalidate for updates

const CACHE_NAME = 'pharmacy-scanner-v2.1.0';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  // ... other icons
];

const EXTERNAL_CACHE = [
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];
```

## 12.2 Offline Capabilities
| Feature | Offline | Notes |
|---------|---------|-------|
| Camera scanning | ✅ | Uses local html5-qrcode |
| Image scanning | ✅ | Same library |
| Manual entry | ✅ | Pure JavaScript |
| History view/search | ✅ | IndexedDB |
| Master data matching | ✅ | In-memory index |
| API lookup | ❌ | Requires internet |
| Export TSV/CSV | ✅ | Generates file locally |
| Backup/Restore | ✅ | JSON files |

## 12.3 Connection Status Indicator
```javascript
function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  const statusEl = document.getElementById('connectionStatus');
  
  statusEl.classList.toggle('online', isOnline);
  statusEl.classList.toggle('offline', !isOnline);
  statusEl.textContent = isOnline ? 'Online' : 'Offline';
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
```

---

# 13. COMPLETE FEATURE LIST

## 13.1 Scanning Features
- [ ] Camera barcode scanning (all supported formats)
- [ ] Image upload scanning
- [ ] Manual barcode entry
- [ ] Camera flip (front/back)
- [ ] Continuous scanning mode
- [ ] Scan debouncing (prevent duplicate scans)
- [ ] Haptic feedback on scan
- [ ] Audio beep on scan (optional)

## 13.2 Parsing Features
- [ ] GS1 AI parsing ((01), (17), (10), (21), (30))
- [ ] Plain barcode parsing (EAN-13, UPC)
- [ ] Expiry date interpretation (including day 00)
- [ ] Multiple input format support
- [ ] Validation and error handling

## 13.3 Matching Features
- [ ] Exact GTIN matching
- [ ] Last-8 digit matching
- [ ] Sequential 6-digit fuzzy matching
- [ ] Ambiguity detection
- [ ] API lookup for unknown products
- [ ] Auto-save API results to master

## 13.4 Inventory Features
- [ ] Smart quantity merge (same GTIN + batch)
- [ ] Quantity editing
- [ ] RMS code field
- [ ] Expiry status tracking
- [ ] Color-coded cards

## 13.5 History Features
- [ ] Full scan history log
- [ ] Search by any field
- [ ] Filter by status (Expired/Expiring/OK)
- [ ] Sort by date/expiry
- [ ] Edit entries (with PIN)
- [ ] Delete entries (with PIN)
- [ ] Recent scans on home page

## 13.6 Master Data Features
- [ ] CSV/TSV/Excel file upload
- [ ] Auto-detect columns
- [ ] Replace or append mode
- [ ] View product count
- [ ] Edit updates master
- [ ] PIN protection

## 13.7 Bulk Paste Features
- [ ] Multi-line paste input
- [ ] Parse all lines at once
- [ ] Show processing stats
- [ ] Merge with existing entries

## 13.8 Export Features
- [ ] TSV export (Excel-ready)
- [ ] CSV export
- [ ] Custom header order
- [ ] DDMMYY date format
- [ ] Full backup (JSON)
- [ ] Restore from backup

## 13.9 UI Features
- [ ] Bottom navigation
- [ ] Floating action button
- [ ] Side menu (settings)
- [ ] Toast notifications
- [ ] Modal dialogs
- [ ] PIN keypad
- [ ] Loading states
- [ ] Empty states

## 13.10 PWA Features
- [ ] Installable on all platforms
- [ ] Offline functionality
- [ ] App icons (all sizes)
- [ ] Theme color
- [ ] Splash screen
- [ ] Service worker caching
- [ ] Update notifications

---

# 14. FILE STRUCTURE

## 14.1 index.html Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Meta tags -->
  <!-- PWA meta tags -->
  <!-- Manifest link -->
  <!-- Fonts -->
  <!-- Barcode library -->
  <style>
    /* All CSS inline for single-file deployment */
  </style>
</head>
<body>
  <!-- Background (curved gradients) -->
  <div class="app-background">...</div>
  
  <!-- App container -->
  <div class="app">
    <!-- Header -->
    <header class="app-header">...</header>
    
    <!-- Main content -->
    <main class="main-content">
      <!-- Home page -->
      <div class="page" id="page-home">...</div>
      
      <!-- Scan page -->
      <div class="page" id="page-scan">...</div>
      
      <!-- History page -->
      <div class="page" id="page-history">...</div>
      
      <!-- Paste page -->
      <div class="page" id="page-paste">...</div>
      
      <!-- Master/Settings page -->
      <div class="page" id="page-master">...</div>
      
      <!-- Footer -->
      <footer class="app-footer">...</footer>
    </main>
    
    <!-- Floating action button -->
    <button class="scan-fab">...</button>
    
    <!-- Bottom navigation -->
    <nav class="bottom-nav">...</nav>
  </div>
  
  <!-- Toast container -->
  <div class="toast-container">...</div>
  
  <!-- Side menu -->
  <div class="menu-overlay">...</div>
  <div class="side-menu">...</div>
  
  <!-- PIN modal -->
  <div class="modal-overlay" id="pinModal">...</div>
  
  <!-- Edit modal -->
  <div class="modal-overlay" id="editModal">...</div>
  
  <!-- Hidden inputs -->
  <input type="file" id="masterFileInput" hidden>
  <input type="file" id="restoreFileInput" hidden>
  <input type="file" id="imageFileInput" hidden>
  
  <!-- Temp scanner for image scanning -->
  <div id="temp-scanner" hidden></div>
  
  <script src="app.js"></script>
</body>
</html>
```

## 14.2 app.js Structure
```javascript
/**
 * Application modules in order:
 */

// 1. Configuration
const CONFIG = { PIN, EXPIRY_DAYS, DEBOUNCE_MS, API_URLS };

// 2. Application State
const State = { scanning, history, masterData, currentPage, ... };

// 3. Database (IndexedDB)
const DB = { init, put, get, getAll, delete, clear, findByGtinBatch };

// 4. Haptic Feedback
const Haptic = { light, medium, heavy, success, error };

// 5. GS1 Parsing Functions
function parseGS1(raw) { ... }
function parseExpiryDate(yymmdd) { ... }
function calculateExpiryStatus(isoDate) { ... }

// 6. Product Matching Functions
function matchProduct(gtin14, gtin13) { ... }
function buildMasterIndex() { ... }

// 7. API Lookup Functions
async function lookupProductAPI(gtin) { ... }

// 8. Camera Scanning Functions
async function startScanning() { ... }
async function stopScanning() { ... }
function switchCamera() { ... }
async function scanImageFile(file) { ... }

// 9. Scan Processing
async function processScan(rawCode) { ... }

// 10. History Management
async function loadHistory() { ... }
function filterHistory() { ... }
function renderHistory() { ... }
function renderRecentScans() { ... }

// 11. Master Data Management
async function loadMasterData() { ... }
function parseMasterFile(content, filename) { ... }
async function saveMasterData(products, append) { ... }

// 12. Export Functions
function exportTSV() { ... }
function exportCSV() { ... }
async function downloadBackup() { ... }
async function restoreBackup(file) { ... }

// 13. Bulk Paste Processing
async function processPaste() { ... }

// 14. PIN Lock System
function requestPinThen(callback) { ... }
function handlePinKey(key) { ... }

// 15. Edit Modal
function openEditModal(id) { ... }
async function saveEdit() { ... }

// 16. UI Helpers
function showToast(message, type) { ... }
function switchPage(pageName) { ... }
function openMenu() { ... }
function closeMenu() { ... }
function updateStats() { ... }

// 17. Event Listeners
function initEventListeners() { ... }

// 18. Initialization
async function init() { ... }
document.addEventListener('DOMContentLoaded', init);
```

## 14.3 sw.js Structure
```javascript
const CACHE_VERSION = 'v2.1.0';
const CACHE_NAME = `pharmacy-scanner-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [...];
const EXTERNAL_CACHE = [...];

self.addEventListener('install', ...);
self.addEventListener('activate', ...);
self.addEventListener('fetch', ...);
```

## 14.4 manifest.json
```json
{
  "name": "Pharmacy Scanner - Expiry Tracker",
  "short_name": "PharmaScan",
  "description": "Offline GS1 barcode scanner and expiry tracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#050a12",
  "theme_color": "#0a1628",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

# 15. CSS DESIGN SYSTEM

## 15.1 Background (Curved Blue Gradients)
```css
.app-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: #050a12;
  overflow: hidden;
}

.bg-curve {
  position: absolute;
  width: 200%;
  height: 100%;
  left: -50%;
  border-radius: 50%;
}

.bg-curve-1 {
  bottom: -60%;
  background: radial-gradient(ellipse at center, #0d1f3c 0%, transparent 70%);
}

.bg-curve-2 {
  bottom: -70%;
  background: radial-gradient(ellipse at center, #102a4c 0%, transparent 60%);
}

.bg-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%);
  filter: blur(80px);
}
```

## 15.2 Glassmorphism Effects
```css
.glass-effect {
  background: rgba(15, 20, 25, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.15);
}
```

## 15.3 Button Styles
```css
.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
}

.btn-secondary {
  background: #1a3a5c;
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #f0f6ff;
}

.btn-danger {
  background: #ef4444;
  color: white;
}
```

## 15.4 Card Styles
```css
.card {
  background: #132744;
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 16px;
}

.history-item.expired {
  border-left: 3px solid #ef4444;
}

.history-item.expired .item-name {
  color: #ef4444;
  text-decoration: line-through;
}
```

---

# 16. JAVASCRIPT IMPLEMENTATION

## 16.1 Key Algorithms

### 16.1.1 GS1 Parser
```javascript
function parseGS1(raw) {
  const result = {
    valid: false, raw, gtin14: '', gtin13: '', expiry: null,
    expiryDDMMYY: '', expiryFormatted: '', expiryStatus: 'MISSING',
    batch: '', serial: '', qty: 1, productName: '', matchType: 'NONE', rms: ''
  };
  
  if (!raw || typeof raw !== 'string') return result;
  
  let code = raw.trim().replace(/\x1d/g, '|');
  
  // Plain barcode (no AIs)
  if (/^\d{8,14}$/.test(code)) {
    result.gtin14 = code.padStart(14, '0');
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    result.valid = true;
    return result;
  }
  
  // Convert raw to parenthesized if needed
  if (!code.includes('(')) {
    code = convertToParenthesized(code);
  }
  
  // Extract AIs
  const gtinMatch = code.match(/\(01\)(\d{12,14})/);
  if (gtinMatch) {
    result.gtin14 = gtinMatch[1].padStart(14, '0');
    result.gtin13 = result.gtin14.startsWith('0') ? result.gtin14.slice(1) : result.gtin14;
    result.valid = true;
  }
  
  const expiryMatch = code.match(/\(17\)(\d{6})/);
  if (expiryMatch) {
    const parsed = parseExpiryDate(expiryMatch[1]);
    result.expiry = parsed.iso;
    result.expiryDDMMYY = parsed.ddmmyy;
    result.expiryFormatted = parsed.formatted;
    result.expiryStatus = calculateExpiryStatus(parsed.iso);
  }
  
  const batchMatch = code.match(/\(10\)([^\(|\x1d]+)/);
  if (batchMatch) result.batch = batchMatch[1].replace(/\|/g, '').trim();
  
  const serialMatch = code.match(/\(21\)([^\(|\x1d]+)/);
  if (serialMatch) result.serial = serialMatch[1].replace(/\|/g, '').trim();
  
  const qtyMatch = code.match(/\(30\)(\d+)/);
  if (qtyMatch) result.qty = parseInt(qtyMatch[1]) || 1;
  
  return result;
}
```

### 16.1.2 Expiry Date Parser
```javascript
function parseExpiryDate(yymmdd) {
  const year = parseInt('20' + yymmdd.substring(0, 2));
  const month = parseInt(yymmdd.substring(2, 4));
  let day = parseInt(yymmdd.substring(4, 6));
  
  // Day 00 = last day of month
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
```

### 16.1.3 Master File Parser
```javascript
function parseMasterFile(content, filename) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) throw new Error('File is empty');
  
  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  
  // Find columns
  const headers = firstLine.split(delimiter).map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  
  const barcodeCol = headers.findIndex(h => 
    ['barcode', 'gtin', 'ean', 'upc', 'code', 'sku', 'item'].some(p => h.includes(p))
  );
  const nameCol = headers.findIndex(h => 
    ['name', 'product', 'description', 'title', 'desc'].some(p => h.includes(p))
  );
  
  if (barcodeCol === -1) throw new Error('No barcode column found');
  if (nameCol === -1) throw new Error('No product name column found');
  
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
  
  if (products.length === 0) throw new Error('No valid products found');
  return products;
}
```

---

# 17. TESTING SCENARIOS

## 17.1 Barcode Parsing Tests
```javascript
// Test 1: Full GS1 barcode
Input: "(01)09504000012345(17)240531(10)ABC123(21)SN001(30)5"
Expected:
  gtin14: "09504000012345"
  expiry: "2024-05-31"
  batch: "ABC123"
  serial: "SN001"
  qty: 5

// Test 2: Expiry with day 00
Input: "(01)07704500123456(17)251100(10)XYZ"
Expected:
  expiry: "2025-11-30" (last day of November)

// Test 3: Plain EAN-13
Input: "9504000012345"
Expected:
  gtin14: "09504000012345"
  gtin13: "9504000012345"

// Test 4: Invalid barcode
Input: "ABC123"
Expected:
  valid: false
```

## 17.2 Matching Tests
```javascript
// Master data:
// "09504000012345" → "Product A"
// "07704500123456" → "Product B"

// Test 1: Exact match
Scan: "09504000012345"
Expected: matchType: "EXACT", productName: "Product A"

// Test 2: Last-8 match
Scan: "12340001234500012345"
Expected: matchType: "LAST8", productName: "Product A"

// Test 3: No match
Scan: "99999999999999"
Expected: matchType: "NONE", productName: ""
```

## 17.3 UI Tests
```
- [ ] Scan page loads with camera prompt
- [ ] Scan button starts/stops camera
- [ ] Scanned barcode appears in history
- [ ] Filter chips filter correctly
- [ ] Search finds partial matches
- [ ] PIN modal appears for protected actions
- [ ] Export downloads file
- [ ] Master upload populates count
```

---

# 18. DEPLOYMENT INSTRUCTIONS

## 18.1 GitHub Pages Deployment
```bash
1. Create new GitHub repository
2. Upload all files (index.html, app.js, sw.js, manifest.json, icons/)
3. Go to Settings → Pages
4. Select "Deploy from branch" → main → / (root)
5. Wait 2-3 minutes
6. Access at https://[username].github.io/[repo-name]/
```

## 18.2 Local Deployment
```bash
# Option 1: Python
python -m http.server 8000
# Access at http://localhost:8000

# Option 2: Node.js
npx serve .
# Access at http://localhost:3000

# Option 3: Direct file (limited features)
Open index.html in browser
# Note: Camera won't work without HTTPS
```

## 18.3 Mobile Installation
```
iOS Safari:
1. Open app URL
2. Tap Share button
3. Tap "Add to Home Screen"
4. Confirm

Android Chrome:
1. Open app URL
2. Tap menu (3 dots)
3. Tap "Install app" or "Add to Home Screen"
4. Confirm
```

## 18.4 Updating the App
```
1. Increment CACHE_VERSION in sw.js
2. Upload new files
3. Users will see "Update available" toast
4. Refresh to get new version
```

---

# APPENDIX A: SAMPLE MASTER DATA

```csv
Barcode,Product Name
09504000012345,Vitamin D3 1000 IU Tablets 60s
09504000023456,Vitamin D3 50000 IU Tablets 15s
09504000034567,Omega-3 Fish Oil 1000mg Capsules 90s
09504000045678,Calcium + Vitamin D3 Tablets 100s
09504000056789,Multivitamin Complete Daily Tablets 30s
06297000012340,Paracetamol 500mg Tablets 24s
06297000023451,Ibuprofen 400mg Tablets 20s
06297000034562,Aspirin 100mg Tablets 30s
05000112628999,Nurofen 200mg Capsules 16s
05000158100497,Strepsils Original Lozenges 36s
```

---

# APPENDIX B: GS1 APPLICATION IDENTIFIER REFERENCE

| AI | Description | Format | Length |
|----|-------------|--------|--------|
| 01 | GTIN | N14 | Fixed 14 |
| 10 | Batch/Lot | X..20 | Variable |
| 11 | Production Date | N6 (YYMMDD) | Fixed 6 |
| 13 | Packaging Date | N6 (YYMMDD) | Fixed 6 |
| 15 | Best Before Date | N6 (YYMMDD) | Fixed 6 |
| 17 | Expiry Date | N6 (YYMMDD) | Fixed 6 |
| 21 | Serial Number | X..20 | Variable |
| 30 | Quantity | N..8 | Variable |
| 37 | Count of Units | N..8 | Variable |

---

# APPENDIX C: ERROR MESSAGES

| Code | Message | Action |
|------|---------|--------|
| E001 | "Camera permission denied" | Guide user to browser settings |
| E002 | "No camera found" | Suggest image upload or manual entry |
| E003 | "Invalid barcode format" | Show what was scanned, suggest re-scan |
| E004 | "No barcode column found" | Show expected column names |
| E005 | "File is empty" | Ask user to check file |
| E006 | "Wrong PIN" | Shake animation, allow retry |
| E007 | "No match found" | Show GTIN, allow manual name entry |
| E008 | "Scanner library not loaded" | Refresh page, check internet |

---

# END OF SPECIFICATION

**Document Version:** 2.0 Final  
**Last Updated:** 2024  
**Total Pages:** ~50  
**Completeness:** 100% - No further questions required

---

This specification is complete and self-contained. An AI assistant or developer can implement the entire application using only this document without any additional clarification needed.
