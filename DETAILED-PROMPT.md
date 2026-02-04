# GS1 BARCODE PARSER PWA — COMPLETE DEVELOPMENT PROMPT

## PROJECT OVERVIEW

Build a **fully offline-capable Progressive Web App (PWA)** for parsing GS1 barcodes and matching scanned products against a user-provided master data file. The app must work on Android, iOS, and desktop browsers with zero server dependencies. All data stays on-device using browser storage (IndexedDB).

**Target Users:** Healthcare professionals, pharmacists, warehouse staff, inventory managers who need to scan and track products with GS1 barcodes (especially pharmaceuticals with expiry dates).

**Inspiration:** Orca Scan, Tatmeen (UAE pharmaceutical app), barValid — but fully offline and free for personal use.

---

## TECHNOLOGY STACK

```
Frontend:     HTML5 + CSS3 + Vanilla JavaScript (no frameworks required)
Storage:      IndexedDB (primary), localStorage (fallback)
Scanner:      Native BarcodeDetector API (Chrome 88+, Safari 14.5+)
PWA:          Service Worker + Web App Manifest
Hosting:      Any static file server (GitHub Pages, Netlify, local)
```

**No backend. No authentication. No paid APIs. No build tools required.**

---

## CORE FEATURES

### 1. GS1 BARCODE PARSING

Parse GS1 DataMatrix and GS1-128 barcode strings to extract Application Identifiers (AIs):

| AI Code | Field | Format | Length | Notes |
|---------|-------|--------|--------|-------|
| (01) | GTIN | Numeric | 14 digits | Global Trade Item Number |
| (17) | Expiry Date | YYMMDD | 6 digits | Day=00 means last day of month |
| (10) | Batch/Lot | Alphanumeric | Variable (up to 20) | Ends at next AI or string end |
| (21) | Serial | Alphanumeric | Variable (up to 20) | Unique item identifier |
| (30) | Quantity | Numeric | Variable (up to 8) | Default to 1 if absent |

**Input Formats to Support:**
```
# Parenthesized format (human-readable)
(01)09504000012345(17)240531(10)ABC123(21)SN001

# Raw DataMatrix format (with FNC1 separator = ASCII 29 / \x1d)
01095040000123451724053110ABC123\x1d21SN001

# Mixed formats with missing fields
(01)06297000001234(17)250630(10)BATCH001
```

**GTIN Derivation Rules:**
- GTIN-14: The full 14-digit code from AI (01)
- GTIN-13: Remove leading zero if GTIN-14 starts with "0"
- GTIN-12: Further derive UPC-A if applicable
- Always pad shorter codes to 14 digits for consistency

**Expiry Date Parsing (AI 17):**
```javascript
// Input: "250630" → June 30, 2025
// Input: "251100" → November 30, 2025 (day 00 = last day of month)
// Output: ISO format "YYYY-MM-DD" for storage
// Display: "DD/MM/YYYY" for user interface
```

**Expiry Status Classification:**
- `expired`: Expiry date is in the past
- `soon`: Expiry within 30 days from today
- `ok`: Expiry more than 30 days away
- `missing`: No expiry date in barcode

---

### 2. MASTER DATA MANAGEMENT

Allow users to upload a CSV/TSV file containing product information for GTIN-to-name matching.

**Required Columns:**
- Barcode/GTIN (auto-detect column names: "barcode", "gtin", "ean", "upc", "code")
- Product Name (auto-detect: "name", "product", "description", "item")

**Optional Columns:**
- Supplier/Manufacturer
- Category

**Sample Master Data:**
```csv
Barcode,Product Name,Supplier,Category
6297000001234,Vitamin D 1000 IU Tab 60s,PharmaCorp,Supplements
6297000002345,Vitamin D 50000 IU Tab 15s,PharmaCorp,Supplements
5901234123457,Hand Sanitizer Gel 500ml,CleanCare,Hygiene
```

**File Handling:**
- Support CSV (comma), TSV (tab), and semicolon delimiters
- Auto-detect delimiter from first line
- Handle quoted fields with embedded delimiters
- Skip empty lines and trim whitespace
- Build in-memory index for fast lookups

---

### 3. PRODUCT MATCHING LOGIC

Implement a **tiered matching strategy** with fallbacks:

```
TIER 1: EXACT MATCH
├── Compare scanned GTIN-14 against master GTINs
├── Compare scanned GTIN-13 against master GTINs
└── If found → Match Type: "EXACT"

TIER 2: LAST-8 DIGITS MATCH
├── Extract last 8 digits of scanned GTIN (item reference portion)
├── Search master for any GTIN ending in those 8 digits
├── If exactly 1 match → Match Type: "LAST8"
└── If multiple matches → Match Type: "AMBIGUOUS-LAST8"

TIER 3: 6-DIGIT SEQUENCE MATCH (Fuzzy Fallback)
├── Extract last 10 digits of scanned GTIN
├── For each 6-digit sequence in those 10 digits:
│   └── Search master for any GTIN containing that sequence
├── If exactly 1 unique match → Match Type: "SEQ6"
└── If multiple matches → Match Type: "AMBIGUOUS-SEQ6"

NO MATCH:
└── Match Type: "NONE" (product name left blank)

INVALID BARCODE:
└── Match Type: "INVALID" (parsing failed)
```

**Index Structure for Fast Lookups:**
```javascript
masterIndex = {
  exact: Map<string, string>,    // GTIN → Product Name
  last8: Map<string, Array>      // Last 8 digits → [{gtin, name}, ...]
}
```

---

### 4. SCAN HISTORY TABLE

Display all scanned entries in a data table with these **exact columns in order**:

| Column | Content | Format |
|--------|---------|--------|
| Scan Time | Timestamp | DD/MM/YYYY HH:MM |
| Raw | Original barcode string | Truncated with tooltip |
| GTIN14 | 14-digit GTIN | Monospace |
| GTIN13 | 13-digit GTIN | Monospace |
| Expiry | Expiration date | DD/MM/YYYY with status badge |
| Batch | Batch/Lot number | Monospace |
| Serial | Serial number | Monospace |
| Qty | Quantity | Numeric, default "1" |
| Product Name | Matched product | Truncated with tooltip |
| Match Type | How match was found | Color-coded badge |

**Expiry Badges (Color-Coded):**
```css
.expired { background: rgba(239,68,68,0.12); color: #ef4444; }   /* Red */
.soon    { background: rgba(245,158,11,0.12); color: #f59e0b; }  /* Amber */
.ok      { background: rgba(16,185,129,0.12); color: #10b981; }  /* Green */
.missing { background: rgba(107,114,128,0.12); color: #6b7280; } /* Grey */
```

**Match Type Badges:**
```css
.exact        { background: green; }
.last8        { background: blue; }
.seq6         { background: amber; }
.api          { background: purple; }
.none         { background: red; }
.invalid      { background: red; }
.ambiguous-*  { background: amber; }
```

---

### 5. SEARCH, FILTER & SORT

**Search Box:**
- Debounced input (300ms delay)
- Filter across: GTIN14, GTIN13, Product Name, Batch, Serial
- Case-insensitive partial matching

**Filter Chips (Toggle Buttons):**
```
[Expired]     → Show only expiryStatus === "expired"
[Soon (≤30d)] → Show only expiryStatus === "soon"
[No Expiry]   → Show only expiryStatus === "missing"
```
- Only one filter active at a time (or allow combinations)
- Active filter should be visually highlighted

**Sort Controls (Dropdown):**
```
- Newest First (scanTime DESC) [default]
- Oldest First (scanTime ASC)
- Expiry Soonest (expiry ASC, nulls last)
- Expiry Latest (expiry DESC, nulls last)
```

**Pagination:**
- 50 rows per page
- Show "Showing X-Y of Z entries"
- Previous/Next page buttons
- Handle large datasets (50,000+ rows) smoothly

---

### 6. USER INTERFACE LAYOUT

**Navigation Tabs:**
```
[Scan] [Bulk Paste] [History] [Master Data] [Backup]
```

**Tab 1: SCAN**
- Camera preview area (4:3 aspect ratio)
- Viewfinder overlay with scanning line animation
- Start/Stop Scanning buttons
- Switch Camera button (for devices with multiple cameras)
- Upload Image button (for barcode images)
- Manual Entry input field with Add button
- Recent scan preview card (shows last scanned item)

**Tab 2: BULK PASTE**
- Large textarea for pasting multiple barcode strings (one per line)
- Process All button
- Clear button
- Results summary: Total / Valid / Invalid / Matched

**Tab 3: HISTORY**
- Toolbar: Search bar, Filter chips, Sort dropdown
- Data table with sticky header
- Pagination controls
- Action buttons: Export TSV, Export CSV, Copy Last Row, Clear History

**Tab 4: MASTER DATA**
- Stats: Total Products, Unique GTINs, Last Updated
- Upload zone (drag & drop or click)
- Append to Master / Replace Master buttons
- Clear Master button
- Preview table (first 100 products with search)

**Tab 5: BACKUP**
- Stats: History entries, Master products, Estimated size
- Download Backup button (JSON)
- Restore zone (upload JSON)
- Warning about restore replacing current data
- Clear All Data button (with confirmation)

---

### 7. DATA PERSISTENCE

**IndexedDB Schema:**
```javascript
Database: "gs1-parser-db"
Version: 1

ObjectStore: "history"
  - keyPath: "id" (autoIncrement)
  - Indexes: "scanTime", "gtin14", "expiry"
  - Fields: id, scanTime, raw, gtin14, gtin13, expiry, expiryFormatted,
            expiryStatus, batch, serial, qty, productName, matchType

ObjectStore: "master"
  - keyPath: "gtin"
  - Indexes: "name"
  - Fields: gtin, name

ObjectStore: "settings"
  - keyPath: "key"
  - Fields: key, value
```

**Backup JSON Format:**
```json
{
  "version": 1,
  "exportDate": "2025-02-04T12:00:00.000Z",
  "history": [...],
  "master": [...],
  "masterLastUpdated": "2025-02-01T10:00:00.000Z"
}
```

---

### 8. EXPORT FUNCTIONS

**TSV Export:**
```
Scan Time\tRaw\tGTIN14\tGTIN13\tExpiry\tBatch\tSerial\tQty\tProduct Name\tMatch Type
04/02/2025 12:00\t(01)06297...\t06297000001234\t6297000001234\t30/06/2025\tABC001\tSN123\t1\tVitamin D...\tEXACT
```

**CSV Export:**
- Same columns, comma-delimited
- All fields wrapped in double quotes
- Escape internal quotes by doubling them

**Copy Last Row:**
- Copy most recent history entry as TSV to clipboard
- Show toast notification on success

---

### 9. PWA REQUIREMENTS

**manifest.json:**
```json
{
  "name": "GS1 Barcode Parser",
  "short_name": "GS1 Parser",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0e14",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service Worker (sw.js):**
- Cache-first strategy for app shell
- Cache all static assets on install
- Serve from cache when offline
- Update cache in background when online
- Handle fetch failures gracefully

**Required for PWA:**
- Served over HTTPS (or localhost for development)
- Valid manifest with icons
- Service worker registered
- Responsive design for mobile

---

### 10. UI DESIGN SPECIFICATIONS

**Color Palette (Dark Industrial Theme):**
```css
--bg-deep: #0a0e14;
--bg-surface: #0f1419;
--bg-elevated: #161d26;
--bg-hover: #1c2530;
--border-subtle: rgba(56, 68, 86, 0.5);
--border-default: rgba(56, 68, 86, 0.8);
--text-primary: #e8edf4;
--text-secondary: #8b9eb3;
--text-muted: #5d6f84;
--accent-primary: #3b82f6;
--success: #10b981;
--warning: #f59e0b;
--danger: #ef4444;
```

**Typography:**
```css
--font-display: 'Outfit', sans-serif;  /* Headers, UI text */
--font-mono: 'JetBrains Mono', monospace;  /* GTINs, codes, data */
```

**Component Styles:**
- Cards with subtle borders and rounded corners (16px)
- Buttons with hover states and transitions (150ms)
- Form inputs with focus glow effect
- Tables with sticky headers and zebra striping on hover
- Toast notifications sliding in from right
- Modal overlays with backdrop blur

---

### 11. BARCODE SCANNER IMPLEMENTATION

**Using Native BarcodeDetector API:**
```javascript
const detector = new BarcodeDetector({
  formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
});

// Continuous detection loop
async function detectFrame() {
  const barcodes = await detector.detect(videoElement);
  for (const barcode of barcodes) {
    // Debounce: ignore same code within 2 seconds
    if (barcode.rawValue !== lastCode || Date.now() - lastTime > 2000) {
      processScan(barcode.rawValue);
    }
  }
  requestAnimationFrame(detectFrame);
}
```

**Camera Constraints:**
```javascript
{
  video: {
    facingMode: { ideal: 'environment' },  // Prefer rear camera
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
}
```

**Image Upload Fallback:**
- Accept image files via file input
- Create Image element from uploaded file
- Run BarcodeDetector on the image
- Support multiple barcodes in one image

---

### 12. ERROR HANDLING

**Scanner Errors:**
- Camera permission denied → Show message with instructions
- No camera available → Suggest image upload
- BarcodeDetector not supported → Fallback message

**File Parsing Errors:**
- Invalid CSV format → Toast with error details
- No valid products found → Toast warning
- Missing required columns → Auto-detect or warn

**Storage Errors:**
- IndexedDB not available → Graceful degradation
- Quota exceeded → Warning to user

**Network Status:**
- Show online/offline indicator in header
- All features work offline after initial load

---

### 13. ACCESSIBILITY

- Semantic HTML (nav, main, button, table, etc.)
- ARIA labels on interactive elements
- Keyboard navigation support (Tab, Enter, Escape)
- Focus visible outlines
- Color contrast meets WCAG AA
- Screen reader friendly table structure

---

### 14. PERFORMANCE TARGETS

- Initial load: < 2 seconds on 3G
- Time to interactive: < 3 seconds
- Table rendering: Smooth with 50,000 rows (use virtualization or pagination)
- Search debounce: 300ms
- Camera detection: 30fps without jank
- Bundle size: < 100KB total (excluding fonts)

---

### 15. FILE STRUCTURE

```
gs1-parser-pwa/
├── index.html              # Complete app (HTML + CSS + inline critical styles)
├── app.js                  # All JavaScript (parsing, UI, storage)
├── sw.js                   # Service worker
├── manifest.json           # PWA manifest
├── icons/
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
├── sample-master-data.csv  # Example product list for testing
└── README.md               # Documentation
```

---

### 16. TESTING SCENARIOS

**GS1 Parsing Tests:**
```javascript
// Test 1: Complete barcode
"(01)06297000001234(17)250630(10)ABC001(21)SN123(30)5"
→ GTIN14: "06297000001234", Expiry: "2025-06-30", Batch: "ABC001", Serial: "SN123", Qty: "5"

// Test 2: Missing optional fields
"(01)06297000002345(17)251100"
→ GTIN14: "06297000002345", Expiry: "2025-11-30" (day 00 = last day), Batch: "", Serial: "", Qty: "1"

// Test 3: Invalid barcode
"INVALID_STRING"
→ valid: false, matchType: "INVALID"

// Test 4: Raw format with FNC1
"0106297000001234172506301021ABC123"
→ Should be converted to parenthesized format and parsed
```

**Matching Tests:**
```javascript
// Master: [{gtin: "6297000001234", name: "Product A"}]

// Exact match
scan "06297000001234" → matchType: "EXACT", name: "Product A"

// Last-8 match
scan "00006297001234" → matchType: "LAST8" (if last 8 digits match)

// No match
scan "09999999999999" → matchType: "NONE", name: ""
```

---

### 17. FUTURE ENHANCEMENTS (Optional)

1. **External API Lookup:**
   - Query Brocade.io or EAN-Search when GTIN not in master
   - Cache results locally for offline use
   - Mark with matchType: "API"

2. **Merge Mode:**
   - Upload secondary file with barcodes
   - Match against master and output combined report

3. **Sound/Vibration Feedback:**
   - Beep on successful scan
   - Haptic feedback on mobile

4. **Dark/Light Theme Toggle:**
   - User preference saved in settings

5. **Multi-language Support:**
   - i18n for UI strings

---

## DELIVERABLES

1. **index.html** — Complete single-file app with embedded CSS
2. **app.js** — All application logic
3. **sw.js** — Service worker for offline support
4. **manifest.json** — PWA configuration
5. **icons/** — App icons at all required sizes
6. **sample-master-data.csv** — Test data file
7. **README.md** — User documentation

---

## SUCCESS CRITERIA

- [ ] Camera scanning works on Android Chrome and iOS Safari
- [ ] All 5 GS1 AIs are correctly parsed
- [ ] Master data loads and product matching works
- [ ] History persists across browser sessions
- [ ] App installs as PWA on mobile devices
- [ ] App works fully offline after first load
- [ ] Export produces valid CSV/TSV files
- [ ] Backup/restore preserves all data
- [ ] UI is responsive on mobile and desktop
- [ ] Performance is smooth with large datasets

---

**END OF PROMPT**
