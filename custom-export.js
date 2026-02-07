// Custom Export Module
// Exports scan data in specific format: Excel/CSV/Numbers

class CustomExporter {
constructor() {
this.locationId = ‘30762’;
this.locationName = ‘OASIS MALL’;
}

// Export scan history to custom CSV format
exportToCSV(scanHistory) {
// CSV Header
const headers = [
‘RMS’,
‘DESCRIPTION’,
‘BARCODE’,
‘QUANTITY’,
‘EXPIRY’,
‘BATCH’,
‘LOCATION ID’,
‘LOCATION NAME’,
‘BRAND’
];

```
// Build CSV rows
const rows = scanHistory.map(scan => {
  return [
    '', // RMS - blank
    scan.productData?.name || scan.parsedData?.find(p => p.ai === '01')?.value || 'Unknown Product',
    scan.gtin || this.extractGTIN(scan.parsedData),
    this.extractQuantity(scan.parsedData) || '1',
    this.extractExpiry(scan.parsedData) || '',
    this.extractBatch(scan.parsedData) || '',
    this.locationId,
    this.locationName,
    scan.productData?.brand || '' // BRAND - blank if not available
  ];
});

// Combine headers and rows
const csvContent = [
  headers.join(','),
  ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(','))
].join('\n');

return csvContent;
```

}

// Export to Excel format (CSV compatible with Excel)
exportToExcel(scanHistory) {
// Same as CSV but with Excel-specific formatting
const csv = this.exportToCSV(scanHistory);

```
// Add BOM for Excel UTF-8 compatibility
const BOM = '\uFEFF';
return BOM + csv;
```

}

// Export to Numbers format (CSV)
exportToNumbers(scanHistory) {
// Numbers uses same CSV format
return this.exportToCSV(scanHistory);
}

// Extract GTIN from parsed data
extractGTIN(parsedData) {
if (!parsedData) return ‘’;
const gtinItem = parsedData.find(item => item.ai === ‘01’);
return gtinItem ? gtinItem.value : ‘’;
}

// Extract Quantity from parsed data
extractQuantity(parsedData) {
if (!parsedData) return ‘’;
const qtyItem = parsedData.find(item => item.ai === ‘30’ || item.ai === ‘37’);
return qtyItem ? qtyItem.value : ‘’;
}

// Extract Expiry from parsed data
extractExpiry(parsedData) {
if (!parsedData) return ‘’;
const expiryItem = parsedData.find(item => [‘15’, ‘17’].includes(item.ai));
return expiryItem ? expiryItem.value : ‘’;
}

// Extract Batch from parsed data
extractBatch(parsedData) {
if (!parsedData) return ‘’;
const batchItem = parsedData.find(item => item.ai === ‘10’);
return batchItem ? batchItem.value : ‘’;
}

// Escape CSV special characters
escapeCSV(value) {
if (value === null || value === undefined) return ‘’;

```
const stringValue = String(value);

// If contains comma, quotes, or newline, wrap in quotes
if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
  return '"' + stringValue.replace(/"/g, '""') + '"';
}

return stringValue;
```

}

// Download file
downloadFile(content, filename, mimeType) {
const blob = new Blob([content], { type: mimeType });
const url = URL.createObjectURL(blob);
const link = document.createElement(‘a’);
link.href = url;
link.download = filename;
link.click();
URL.revokeObjectURL(url);
}

// Export and download as CSV
exportAsCSV(scanHistory) {
const content = this.exportToCSV(scanHistory);
const timestamp = new Date().toISOString().split(‘T’)[0];
const filename = `GS1_Export_${timestamp}.csv`;
this.downloadFile(content, filename, ‘text/csv;charset=utf-8;’);
return filename;
}

// Export and download as Excel
exportAsExcel(scanHistory) {
const content = this.exportToExcel(scanHistory);
const timestamp = new Date().toISOString().split(‘T’)[0];
const filename = `GS1_Export_${timestamp}.csv`;
this.downloadFile(content, filename, ‘application/vnd.ms-excel;charset=utf-8;’);
return filename;
}

// Export and download as Numbers format
exportAsNumbers(scanHistory) {
const content = this.exportToNumbers(scanHistory);
const timestamp = new Date().toISOString().split(‘T’)[0];
const filename = `GS1_Export_${timestamp}.csv`;
this.downloadFile(content, filename, ‘text/csv;charset=utf-8;’);
return filename;
}

// Generate preview table HTML
generatePreviewHTML(scanHistory) {
const headers = [
‘RMS’,
‘DESCRIPTION’,
‘BARCODE’,
‘QUANTITY’,
‘EXPIRY’,
‘BATCH’,
‘LOCATION ID’,
‘LOCATION NAME’,
‘BRAND’
];

```
let html = '<table class="export-preview-table">';

// Header row
html += '<thead><tr>';
headers.forEach(header => {
  html += `<th>${header}</th>`;
});
html += '</tr></thead>';

// Data rows
html += '<tbody>';
scanHistory.forEach(scan => {
  html += '<tr>';
  html += '<td></td>'; // RMS - blank
  html += `<td>${scan.productData?.name || 'Unknown Product'}</td>`;
  html += `<td>${scan.gtin || this.extractGTIN(scan.parsedData)}</td>`;
  html += `<td>${this.extractQuantity(scan.parsedData) || '1'}</td>`;
  html += `<td>${this.extractExpiry(scan.parsedData) || ''}</td>`;
  html += `<td>${this.extractBatch(scan.parsedData) || ''}</td>`;
  html += `<td>${this.locationId}</td>`;
  html += `<td>${this.locationName}</td>`;
  html += `<td>${scan.productData?.brand || ''}</td>`;
  html += '</tr>';
});
html += '</tbody>';

html += '</table>';
return html;
```

}

// Update location settings
setLocation(locationId, locationName) {
this.locationId = locationId;
this.locationName = locationName;
}
}

// Create export modal UI
function createExportModal() {
const modal = document.createElement(‘div’);
modal.id = ‘export-modal’;
modal.className = ‘modal’;
modal.innerHTML = `
<div class="modal-content export-modal-content">
<div class="modal-header">
<h2>📊 Export Scan Data</h2>
<button class="modal-close" id="close-export-modal">×</button>
</div>

```
  <div class="modal-body">
    <div class="export-options">
      <h3>Export Format</h3>
      <div class="format-buttons">
        <button class="btn btn-primary" id="export-csv">
          📄 Export as CSV
        </button>
        <button class="btn btn-primary" id="export-excel">
          📊 Export for Excel
        </button>
        <button class="btn btn-primary" id="export-numbers">
          🔢 Export for Numbers
        </button>
      </div>
    </div>

    <div class="location-settings">
      <h3>Location Settings</h3>
      <div class="form-row">
        <div class="form-group">
          <label for="location-id">Location ID</label>
          <input type="text" id="location-id" value="30762">
        </div>
        <div class="form-group">
          <label for="location-name">Location Name</label>
          <input type="text" id="location-name" value="OASIS MALL">
        </div>
      </div>
    </div>

    <div class="export-preview">
      <h3>Preview (First 5 rows)</h3>
      <div id="preview-container" class="preview-scroll">
        <p class="placeholder">Preview will appear here...</p>
      </div>
    </div>

    <div class="export-info">
      <h4>Export Format:</h4>
      <p><strong>Columns:</strong> RMS | DESCRIPTION | BARCODE | QUANTITY | EXPIRY | BATCH | LOCATION ID | LOCATION NAME | BRAND</p>
      <p><strong>Total Scans:</strong> <span id="total-scans">0</span></p>
    </div>
  </div>
</div>
```

`;

return modal;
}

// Initialize export functionality
function initCustomExport() {
const exporter = new CustomExporter();

// Add export modal to page
const modal = createExportModal();
document.body.appendChild(modal);

// Get export history button (add to main page)
const exportHistoryBtn = document.getElementById(‘export-history-btn’);
if (!exportHistoryBtn) {
// Create button if it doesn’t exist
const historySection = document.querySelector(’.history-section’);
if (historySection) {
const btn = document.createElement(‘button’);
btn.id = ‘export-history-btn’;
btn.className = ‘btn btn-success’;
btn.textContent = ‘📊 Export to Excel/CSV’;

```
  const clearBtn = document.getElementById('clear-history');
  if (clearBtn) {
    clearBtn.parentNode.insertBefore(btn, clearBtn);
  } else {
    historySection.appendChild(btn);
  }
}
```

}

// Event listeners
document.getElementById(‘export-history-btn’)?.addEventListener(‘click’, () => {
openExportModal(exporter);
});

document.getElementById(‘close-export-modal’)?.addEventListener(‘click’, () => {
document.getElementById(‘export-modal’).style.display = ‘none’;
});

document.getElementById(‘export-csv’)?.addEventListener(‘click’, () => {
exportData(exporter, ‘csv’);
});

document.getElementById(‘export-excel’)?.addEventListener(‘click’, () => {
exportData(exporter, ‘excel’);
});

document.getElementById(‘export-numbers’)?.addEventListener(‘click’, () => {
exportData(exporter, ‘numbers’);
});

// Location settings
document.getElementById(‘location-id’)?.addEventListener(‘change’, (e) => {
exporter.setLocation(e.target.value, document.getElementById(‘location-name’).value);
updatePreview(exporter);
});

document.getElementById(‘location-name’)?.addEventListener(‘change’, (e) => {
exporter.setLocation(document.getElementById(‘location-id’).value, e.target.value);
updatePreview(exporter);
});
}

function openExportModal(exporter) {
const modal = document.getElementById(‘export-modal’);
modal.style.display = ‘flex’;

// Update location from inputs
const locationId = document.getElementById(‘location-id’).value;
const locationName = document.getElementById(‘location-name’).value;
exporter.setLocation(locationId, locationName);

// Load and show preview
updatePreview(exporter);
}

function updatePreview(exporter) {
const history = JSON.parse(localStorage.getItem(‘scan_history’) || ‘[]’);
const previewContainer = document.getElementById(‘preview-container’);
const totalScansSpan = document.getElementById(‘total-scans’);

if (history.length === 0) {
previewContainer.innerHTML = ‘<p class="placeholder">No scan data to export. Start scanning!</p>’;
totalScansSpan.textContent = ‘0’;
return;
}

// Show first 5 rows as preview
const previewData = history.slice(0, 5);
const previewHTML = exporter.generatePreviewHTML(previewData);
previewContainer.innerHTML = previewHTML;
totalScansSpan.textContent = history.length;
}

function exportData(exporter, format) {
const history = JSON.parse(localStorage.getItem(‘scan_history’) || ‘[]’);

if (history.length === 0) {
alert(‘No scan data to export. Please scan some barcodes first.’);
return;
}

let filename;

try {
switch(format) {
case ‘csv’:
filename = exporter.exportAsCSV(history);
break;
case ‘excel’:
filename = exporter.exportAsExcel(history);
break;
case ‘numbers’:
filename = exporter.exportAsNumbers(history);
break;
}

```
// Show success message
showExportSuccess(filename, history.length);

// Close modal
setTimeout(() => {
  document.getElementById('export-modal').style.display = 'none';
}, 2000);
```

} catch (error) {
console.error(‘Export error:’, error);
alert(’Export failed: ’ + error.message);
}
}

function showExportSuccess(filename, count) {
const message = document.createElement(‘div’);
message.className = ‘export-success-message’;
message.innerHTML = `<div class="success-icon">✅</div> <div class="success-text"> <strong>Export Successful!</strong> <p>${count} scans exported to ${filename}</p> </div>`;

document.body.appendChild(message);

setTimeout(() => {
message.classList.add(‘show’);
}, 10);

setTimeout(() => {
message.classList.remove(‘show’);
setTimeout(() => message.remove(), 300);
}, 3000);
}

// Initialize on page load
if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, initCustomExport);
} else {
initCustomExport();
}

export { CustomExporter, initCustomExport };