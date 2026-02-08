A modern, offline-capable GS1 barcode parser PWA for pharmacy stock tracking.

## ✨ Features

### 🎨 Visual Design
- Deep purple-to-black gradient palette
- Medicine-themed iconography (pills, pharmacy)
- Sleek, minimal mobile-first UI
- Page-flip animations and smooth transitions

### 📱 Smart Inventory
- **Auto quantity increment**: Same GTIN + Batch = quantity adds up
- **Color-coded history**:
  - 🔴 Expired: Red text + strikethrough
  - 🟠 Expiring (2-3 months): Orange
  - 🟢 Good (4+ months): Green
- Edit product names directly in history
- Edits persist to master data

### 🔐 Security
- 4-digit PIN lock (default: `9633`)
- Required for editing data and master operations
- Personal-use security for shared devices

### 📊 Export Format
Custom header order for your workflow:
```
RMS | BARCODE (GTIN) | DESCRIPTION | EXPIRY (DDMMYY) | BATCH | QUANTITY
```

### 📴 Offline Support
- Works without internet after installation
- All data stored locally in IndexedDB
- Installable as PWA on mobile

### 👆 Haptic Feedback
- Light tap on navigation
- Success vibration on scan
- Error feedback on invalid PIN

## 🚀 Quick Start

1. Open the app and tap the **purple scan button**
2. Point camera at GS1 barcode
3. View history in the **History** tab
4. Export via **☰ Menu → Export TSV/CSV**

## 📂 Menu Features

Access via hamburger menu (☰):

- **Upload Master CSV** - Replace product database
- **Append to Master** - Add products without replacing
- **Export TSV/CSV** - Download scan history
- **Download/Restore Backup** - Full data backup
- **Clear History** - Remove all scans (PIN required)

## 📋 Master Data Format

Upload CSV with columns:
- `Barcode` (or GTIN, EAN, UPC)
- `Product Name` (or Name, Description)

```csv
Barcode,Product Name
6297000001234,Vitamin D 1000 IU Tab 60s
6297000002345,Paracetamol 500mg Tab 24s
```

## 🔑 PIN Code

Default PIN: **9633**

Required for:
- Editing history entries
- Uploading/appending master data
- Restoring backups
- Clearing history

## 📱 Installation

### Mobile (Android/iOS)
1. Open app in Chrome/Safari
2. Tap menu → "Add to Home Screen"

### Desktop
1. Open in Chrome/Edge
2. Click install icon in address bar

## 📁 Files

```
pharmatrack/
├── index.html          # App UI
├── app.js              # Logic & features
├── sw.js               # Service worker
├── manifest.json       # PWA config
├── sample-master-data.csv
└── icons/              # App icons
```

## 🔧 Supported Barcodes

- GS1 DataMatrix (primary)
- GS1-128
- QR Code
- EAN-13/EAN-8
- UPC-A/UPC-E

## 📜 License

MIT License - Free for personal and commercial use.
