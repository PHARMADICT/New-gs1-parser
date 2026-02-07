# ExpiryTrack - Pharmacy Barcode Scanner

A modern Progressive Web App (PWA) for scanning GS1 barcodes and tracking product expiry dates. Designed with a sleek Boots Pharmacy-inspired blue theme.

## Features

- 📷 **Camera Scanning** - Scan GS1 DataMatrix, QR codes, and standard barcodes
- 📝 **Manual Entry** - Enter barcodes manually when camera isn't available
- 📋 **Bulk Processing** - Paste multiple barcodes at once
- 🗄️ **Master Data** - Upload product database for automatic name matching
- 📊 **History Tracking** - View all scanned items with search and filters
- ⚠️ **Expiry Alerts** - Color-coded status (expired, expiring soon, OK)
- 💾 **Offline Support** - Works without internet after initial load
- 📱 **Installable** - Add to home screen on mobile devices

## Quick Start

1. Open the app URL in your browser
2. Go to **Master** tab and upload your product CSV file
3. Go to **Scan** tab and tap the scan button
4. Point camera at a GS1 barcode
5. View scan history in the **History** tab

## Master Data Format

Upload a CSV file with at least two columns:
- **Barcode** (GTIN, EAN, UPC)
- **Product Name**

Example:
```csv
Barcode,Product Name
6297000001234,Vitamin D 1000 IU Tab 60s
6297000002345,Paracetamol 500mg Tab 24s
```

## Supported Barcode Formats

- GS1 DataMatrix (AI 01, 17, 10, 21, 30)
- GS1-128
- QR Code
- EAN-13
- EAN-8
- UPC-A

## Extracted Data

- **GTIN** - 14-digit Global Trade Item Number
- **Expiry Date** - From AI 17 (YYMMDD format)
- **Batch/Lot** - From AI 10
- **Serial Number** - From AI 21
- **Quantity** - From AI 30

## Installation

### On Mobile (Android/iOS)
1. Open the app in Chrome/Safari
2. Tap the menu button
3. Select "Add to Home Screen" or "Install App"

### On Desktop
1. Open the app in Chrome/Edge
2. Click the install icon in the address bar

## Deployment

Upload all files to any static web host:
- GitHub Pages
- Netlify
- Vercel
- Any web server

**Note:** Camera access requires HTTPS (except localhost).

## Files

```
expirytrack/
├── index.html          # Main app UI
├── app.js              # Application logic
├── sw.js               # Service worker for offline
├── manifest.json       # PWA configuration
├── sample-master-data.csv
└── icons/              # App icons (72-512px)
```

## Browser Support

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| Camera Scan | ✅ | ✅ | ✅ | ✅ |
| PWA Install | ✅ | ✅ | ❌ | ✅ |
| Offline | ✅ | ✅ | ✅ | ✅ |

## License

MIT License - Free for personal and commercial use.
