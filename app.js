(() => {
  const STORAGE_KEY = 'pharmacy-tracker-history-v1';
  const MASTER_KEY = 'pharmacy-tracker-master-v1';

  const state = {
    history: [],
    master: {},
    scannerRunning: false,
    scanner: null,
    lastScan: null,
    activeCamera: 'environment'
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    navItems: () => Array.from(document.querySelectorAll('.nav-item')),
    pages: () => Array.from(document.querySelectorAll('.page')),
    menuItems: () => Array.from(document.querySelectorAll('.side-menu-item[data-action]'))
  };

  function safeJSON(value, fallback) {
    try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
  }

  function loadState() {
    state.history = safeJSON(localStorage.getItem(STORAGE_KEY), []);
    state.master = safeJSON(localStorage.getItem(MASTER_KEY), {});
    updateMasterStatus();
  }

  function persistHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    renderHistory();
    renderRecent();
    updateHistoryBadge();
  }

  function persistMaster() {
    localStorage.setItem(MASTER_KEY, JSON.stringify(state.master));
    updateMasterStatus();
  }

  function showToast(message, type = 'success') {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-content"><span>${message}</span></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function switchPage(pageName) {
    els.pages().forEach((page) => {
      page.classList.toggle('active', page.id === `page-${pageName}`);
    });
    els.navItems().forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });
  }

  function formatExpiry(raw) {
    if (!raw || raw.length !== 6) return '-';
    const yy = Number(raw.slice(0, 2));
    const mm = Number(raw.slice(2, 4));
    const dd = Number(raw.slice(4, 6));
    const date = new Date(2000 + yy, Math.max(0, mm - 1), dd || 1);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString();
  }

  function parseGS1(input) {
    const cleaned = String(input || '').replace(/\s+/g, '');
    if (!cleaned) return null;

    const gtinMatch = cleaned.match(/01(\d{14})/);
    const expMatch = cleaned.match(/17(\d{6})/);
    const lotMatch = cleaned.match(/10([\w\-\.]{1,20})/);

    const barcode = gtinMatch ? gtinMatch[1] : cleaned;
    const expiryRaw = expMatch ? expMatch[1] : '';
    const lot = lotMatch ? lotMatch[1] : '';

    return {
      raw: cleaned,
      barcode,
      expiryRaw,
      expiryFormatted: formatExpiry(expiryRaw),
      lot,
      name: state.master[barcode] || 'Unknown Product'
    };
  }

  function openScanModal(scan) {
    state.lastScan = scan;
    $('resultName').textContent = scan.name;
    $('resultBarcode').textContent = scan.barcode;
    $('resultExpiryDate').textContent = scan.expiryFormatted;
    $('resultSubtitle').textContent = scan.name === 'Unknown Product' ? 'No master-data match' : 'Matched product';
    $('scanResultModal').classList.add('active');
  }

  function closeScanModal() {
    $('scanResultModal').classList.remove('active');
    state.lastScan = null;
  }

  function saveCurrentScan() {
    if (!state.lastScan) return;
    const qty = Math.max(1, Number($('resultQty').value || 1));
    state.history.unshift({
      ...state.lastScan,
      qty,
      savedAt: new Date().toISOString()
    });
    persistHistory();
    closeScanModal();
    showToast('Scan saved');
  }

  function renderRecent() {
    const list = $('recentScans');
    const empty = $('emptyRecent');
    if (!list || !empty) return;

    Array.from(list.querySelectorAll('.recent-item')).forEach((n) => n.remove());

    if (!state.history.length) {
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    state.history.slice(0, 5).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'recent-item';
      row.innerHTML = `
        <div class="recent-item-left">
          <div class="recent-item-title">${item.name}</div>
          <div class="recent-item-sub">${item.barcode}</div>
        </div>
        <div class="recent-item-right">x${item.qty}</div>`;
      list.appendChild(row);
    });
  }

  function renderHistory() {
    const list = $('historyList');
    if (!list) return;
    list.innerHTML = '';

    const term = ($('historySearch')?.value || '').trim().toLowerCase();
    const filtered = state.history.filter((item) => {
      const hay = `${item.name} ${item.barcode} ${item.lot || ''}`.toLowerCase();
      return hay.includes(term);
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">No scans yet.</div>';
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'history-item';
      const date = new Date(item.savedAt).toLocaleString();
      card.innerHTML = `
        <div class="history-main">
          <div class="history-title">${item.name}</div>
          <div class="history-meta">${item.barcode} • Qty ${item.qty}</div>
          <div class="history-meta">Expiry: ${item.expiryFormatted} • ${date}</div>
        </div>`;
      list.appendChild(card);
    });
  }

  function updateHistoryBadge() {
    const badge = $('historyBadge');
    if (!badge) return;
    badge.textContent = String(state.history.length);
    badge.style.display = state.history.length ? 'inline-flex' : 'none';
  }

  async function startScanner() {
    if (!window.Html5Qrcode) {
      showToast('Scanner library failed to load', 'error');
      return;
    }
    if (state.scannerRunning) return;

    try {
      state.scanner = state.scanner || new Html5Qrcode('reader');
      await state.scanner.start(
        { facingMode: state.activeCamera },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (!decodedText) return;
          const scan = parseGS1(decodedText);
          if (!scan) return;
          stopScanner();
          openScanModal(scan);
        }
      );
      state.scannerRunning = true;
      $('btnScannerText').textContent = 'Stop Scanner';
      $('scannerContainer').classList.add('scanning');
      $('scannerPlaceholder').style.display = 'none';
      showToast('Scanner started');
    } catch {
      showToast('Unable to access camera', 'error');
    }
  }

  async function stopScanner() {
    if (!state.scannerRunning || !state.scanner) return;
    try {
      await state.scanner.stop();
    } catch {}
    state.scannerRunning = false;
    $('btnScannerText').textContent = 'Start Scanner';
    $('scannerContainer').classList.remove('scanning');
    $('scannerPlaceholder').style.display = '';
  }

  function toggleScanner() {
    return state.scannerRunning ? stopScanner() : startScanner();
  }

  function submitManual() {
    const input = $('manualBarcode');
    const value = input?.value.trim();
    if (!value) return;
    const scan = parseGS1(value);
    openScanModal(scan);
    input.value = '';
  }

  function processPaste() {
    const text = $('pasteArea')?.value || '';
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let valid = 0;
    let matched = 0;
    let expired = 0;
    const now = new Date();

    lines.forEach((line) => {
      const parsed = parseGS1(line);
      if (!parsed) return;
      valid += 1;
      if (parsed.name !== 'Unknown Product') matched += 1;
      if (parsed.expiryRaw.length === 6) {
        const exp = new Date(2000 + Number(parsed.expiryRaw.slice(0, 2)), Number(parsed.expiryRaw.slice(2, 4)) - 1, Number(parsed.expiryRaw.slice(4, 6)) || 1);
        if (exp < now) expired += 1;
      }
    });

    $('statTotal').textContent = String(lines.length);
    $('statValid').textContent = String(valid);
    $('statMatched').textContent = String(matched);
    $('statExpired').textContent = String(expired);
    $('pasteStats').style.display = 'grid';
  }

  function updateMasterStatus() {
    const status = $('masterStatus');
    const details = $('masterDetails');
    if (!status || !details) return;
    const count = Object.keys(state.master).length;
    status.style.display = count ? 'flex' : 'none';
    details.textContent = `${count} products loaded`;
  }

  function parseMasterCSV(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const map = {};
    lines.slice(1).forEach((line) => {
      const cols = line.split(',').map((c) => c.trim());
      if (cols.length < 2) return;
      map[cols[0]] = cols[1];
    });
    return map;
  }

  function exportHistory() {
    if (!state.history.length) {
      showToast('No data to export', 'error');
      return;
    }
    const rows = [
      ['Saved At', 'Name', 'Barcode', 'Lot', 'Expiry', 'Qty'],
      ...state.history.map((i) => [i.savedAt, i.name, i.barcode, i.lot || '', i.expiryFormatted, i.qty])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pharmacy-scans-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    $('exportModal').classList.remove('active');
  }

  function clearHistory() {
    if (!confirm('Delete all scan history?')) return;
    state.history = [];
    persistHistory();
    showToast('History cleared');
  }

  function toggleSideMenu(open) {
    $('sideMenu')?.classList.toggle('active', open);
    $('sideMenuBackdrop')?.classList.toggle('active', open);
  }

  function bindEvents() {
    els.navItems().forEach((btn) => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
    $('viewAllHistory')?.addEventListener('click', () => switchPage('history'));
    $('historySearch')?.addEventListener('input', renderHistory);

    $('btnStartScanner')?.addEventListener('click', toggleScanner);
    $('btnSwitchCamera')?.addEventListener('click', async () => {
      state.activeCamera = state.activeCamera === 'environment' ? 'user' : 'environment';
      if (state.scannerRunning) {
        await stopScanner();
        await startScanner();
      }
    });

    $('btnManualSubmit')?.addEventListener('click', submitManual);
    $('manualBarcode')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitManual();
    });

    $('btnCancelScan')?.addEventListener('click', closeScanModal);
    $('btnSaveScan')?.addEventListener('click', saveCurrentScan);
    $('btnQtyMinus')?.addEventListener('click', () => {
      $('resultQty').value = String(Math.max(1, Number($('resultQty').value || 1) - 1));
    });
    $('btnQtyPlus')?.addEventListener('click', () => {
      $('resultQty').value = String(Math.max(1, Number($('resultQty').value || 1) + 1));
    });

    $('btnProcessPaste')?.addEventListener('click', processPaste);
    $('btnClearPaste')?.addEventListener('click', () => {
      $('pasteArea').value = '';
      $('pasteStats').style.display = 'none';
    });

    $('uploadZone')?.addEventListener('click', () => $('masterFileInput')?.click());
    $('masterFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      state.master = parseMasterCSV(text);
      persistMaster();
      showToast('Master data loaded');
    });

    $('btnExportData')?.addEventListener('click', () => $('exportModal').classList.add('active'));
    $('btnCloseExport')?.addEventListener('click', () => $('exportModal').classList.remove('active'));
    $('exportExcel')?.addEventListener('click', exportHistory);
    $('btnClearHistory')?.addEventListener('click', clearHistory);

    $('btnMenu')?.addEventListener('click', () => toggleSideMenu(true));
    $('sideMenuBackdrop')?.addEventListener('click', () => toggleSideMenu(false));
    els.menuItems().forEach((item) => {
      item.addEventListener('click', () => {
        toggleSideMenu(false);
        if (item.dataset.action === 'export') $('exportModal').classList.add('active');
        if (item.dataset.action === 'clear') clearHistory();
      });
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // intentionally ignored
    });
  }

  function init() {
    loadState();
    bindEvents();
    renderHistory();
    renderRecent();
    updateHistoryBadge();
    registerSW();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
