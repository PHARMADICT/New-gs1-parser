# GS1 Barcode Parser PWA

A fully offline-capable Progressive Web App for scanning and parsing GS1 barcodes, with product matching from your master data.

![GS1 Parser](https://img.shields.io/badge/PWA-Ready-blue) ![Offline](https://img.shields.io/badge/Offline-First-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

### 🔍 Barcode Scanning
- **Camera Scanner**: Real-time barcode scanning using device camera
- **Image Upload**: Scan barcodes from uploaded images
- **Supported Formats**: GS1 DataMatrix, GS1-128, QR Code, EAN-13, UPC-A

### 📋 GS1 Data Parsing
Extracts Application Identifiers (AIs):
- **(01) GTIN**: 14-digit Global Trade Item Number
- **(17) Expiry Date**: Product expiration date (YYMMDD format)
- **(10) Batch/Lot**: Batch or lot number
- **(21) Serial**: Unique serial number
- **(30) Quantity**: Item count

### 🗄️ Product Matching
Multi-tier matching strategy:
1. **Exact Match**: Direct GTIN lookup
2. **Last-8 Match**: Item reference matching
3. **Sequence Match**: 6-digit sequence fallback
4. **Ambiguity Detection**: Flags multiple possible matches

### 📊 History Management
- Searchable scan history
- Expiry highlighting (Expired/Soon/OK)
- Filter by status
- Sort by date or expiry
- Export to CSV/TSV

### 💾 Data Management
- Upload master product CSV/TSV files
- Backup entire database to JSON
- Restore from backup
- Works completely offline

## Installation

### Option 1: Host Locally
```bash
# Clone or download the files
cd gs1-parser-pwa

# Serve with any static file server
npx serve .
# or
python -m http.server 8080
```

### Option 2: Deploy to GitHub Pages
1. Create a new GitHub repository
2. Upload all files to the repository
3. Enable GitHub Pages in repository settings
4. Access at `https://yourusername.github.io/repository-name`

### Option 3: Install as PWA
1. Open the app in Chrome, Edge, or Safari
2. Click the install prompt or use browser menu
3. Add to Home Screen (mobile) or Install (desktop)

## Usage

### Quick Start
1. **Load Master Data**: Go to "Master Data" tab and upload your product CSV
2. **Start Scanning**: Go to "Scan" tab and click "Start Scanning"
3. **View Results**: Check "History" tab for all scanned items

### Master Data Format
Your CSV/TSV should have at minimum:
```csv
Barcode,Product Name
6297000001234,Vitamin D 1000 IU Tab 60s
6297000002345,Vitamin D 50000 IU Tab 15s
```

Supported column names:
- Barcode: `barcode`, `gtin`, `ean`, `upc`, `code`
- Name: `name`, `product`, `description`, `item`

### Bulk Paste
Paste multiple GS1 strings (one per line):
```
(01)06297000001234(17)250630(10)ABC001(21)SN123
(01)06297000002345(17)250115(10)XYZ789
(01)06297000003456(17)241231(10)LOT001(30)100
```

### Keyboard Shortcuts
- `Ctrl/Cmd + S`: Start camera scanner
- `Ctrl/Cmd + B`: Download backup

## File Structure
```
gs1-parser-pwa/
├── index.html          # Main application
├── app.js              # Application logic
├── sw.js               # Service worker for offline
├── manifest.json       # PWA manifest
├── icons/              # App icons
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
├── sample-master-data.csv  # Example product list
└── README.md           # This file
```

## Browser Support

| Browser | Camera | Install | Offline |
|---------|--------|---------|---------|
| Chrome 88+ | ✅ | ✅ | ✅ |
| Edge 88+ | ✅ | ✅ | ✅ |
| Firefox 79+ | ✅ | ❌ | ✅ |
| Safari 14.1+ | ✅ | ✅ | ✅ |
| Chrome Android | ✅ | ✅ | ✅ |
| Safari iOS 14.5+ | ✅ | ✅ | ✅ |

**Note**: The BarcodeDetector API is used for scanning. For browsers without native support, you may need to upload images instead.

## Privacy & Security

- **100% Client-Side**: All processing happens in your browser
- **No Server**: No data is ever sent to any server
- **No Tracking**: No analytics or tracking code
- **Your Data**: Stored only in your browser's IndexedDB

## Troubleshooting

### Camera not working
1. Ensure the page is served over HTTPS
2. Grant camera permission when prompted
3. Check if another app is using the camera

### Barcodes not scanning
1. Ensure good lighting
2. Hold the barcode steady
3. Try the image upload feature
4. Check barcode is in a supported format

### Data not persisting
1. Don't use private/incognito mode
2. Don't clear browser data
3. Use the backup feature regularly

## License

MIT License - Free for personal and commercial use.

## Credits

- Built with vanilla JavaScript
- Uses browser's native BarcodeDetector API
- Font: Outfit & JetBrains Mono (Google Fonts)
- Inspired by Orca Scan and GS1 standards

---

Made with ❤️ for healthcare and inventory professionals who need reliable offline barcode scanning.
