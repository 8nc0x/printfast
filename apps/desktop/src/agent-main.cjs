// PrintFlow Shop Agent — agent-mode main process (Phase 5).
// Pairing → long-lived token → heartbeat (printer caps) → claim → group printing.
// This file is additive: the legacy token login (main.cjs) still works. The
// renderer picks agent mode after pairing.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

let ptp = null;
try {
  ptp = require('pdf-to-printer');
} catch {
  ptp = null; // non-Windows dev
}

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'printflow-agent-config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(next, null, 2));
  return next;
}

// ---------- HTTP ----------
function apiFetch(pathname, { method = 'GET', body, token, baseUrl } = {}) {
  const base = baseUrl || readConfig().baseUrl || 'http://localhost:3000';
  const url = new URL(pathname, base);
  const lib = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method,
        headers: {
          'content-type': 'application/json',
          'x-agent-version': '2.0.0',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = {};
          try {
            json = data ? JSON.parse(data) : {};
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(json.error || `HTTP ${res.statusCode}`));
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function downloadTo(fileUrl, destPath) {
  const url = new URL(fileUrl);
  const base = readConfig().baseUrl || 'http://localhost:3000';
  // Signed URLs are server-relative; resolve against the configured base.
  const full = url.origin === 'null' ? new URL(fileUrl, base) : url;
  const lib = full.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    lib
      .get(full, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`download failed HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(destPath)));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

// ---------- printer capability probing ----------
const PAPER_NAMES = ['A4', 'A3', 'LETTER', 'LEGAL'];

function probePrinterCaps(p) {
  const name = String(p.name || '');
  const lower = name.toLowerCase();
  const caps = {
    color: !/(laserjet (10|p1[0-4]|m1[0-4]|1[0-9])[0-9]{2}|1020|1040|p100|p110)/.test(lower),
    duplex: /(duplex|double|two-sided|dupleks)/.test(lower) || !/(1020|1040|p100|p110|laserjet 1)/.test(lower),
    paperSizes: PAPER_NAMES.filter((s) => {
      if (s === 'A3') return /(a3|11x17|ledger)/.test(lower);
      return true;
    }),
    trays: [],
    collate: true,
  };
  return { name, isDefault: Boolean(p.isDefault), status: 'online', caps };
}

async function getPrinterCaps() {
  if (!ptp) return [];
  try {
    const printers = await ptp.getPrinters();
    return printers.map(probePrinterCaps);
  } catch {
    return [];
  }
}

// ---------- group printing ----------
// SumatraPDF flags: -print-settings "paper=A4,gray,duplex,copies=2"
function buildPrintSettings(group, mapping) {
  const parts = [];
  if (mapping.flags.grayscale) parts.push('gray');
  if (mapping.flags.duplex) parts.push('duplex');
  if (mapping.flags.copies > 1) parts.push(`copies=${mapping.flags.copies}`);
  if (mapping.flags.paper) parts.push(`paper=${mapping.flags.paper}`);
  if (mapping.flags.quality === 'draft') parts.push('fit'); // soft mapping; extend as needed
  return parts.join(',');
}

async function printGroup(pdfPath, group, printerName) {
  const printer = { name: printerName, isDefault: false, status: 'online', caps: { color: true, duplex: true, paperSizes: ['A4', 'A3', 'LETTER', 'LEGAL'], trays: [], collate: true } };
  const capsList = await getPrinterCaps();
  const found = capsList.find((p) => p.name === printerName);
  const mapping = mapGroupToPrinter(group, found || printer);

  if (!mapping.ok) {
    const err = new Error(`Cannot print: ${mapping.blockers.join('; ')}`);
    err.blockers = mapping.blockers;
    throw err;
  }

  const settings = buildPrintSettings(group, mapping);
  await ptp.print(pdfPath, {
    printer: printerName,
    ...({ printSettings: settings }),
  });

  return mapping.warnings;
}

// mapGroupToPrinter is shared logic; inline a copy (agent ships standalone).
function mapGroupToPrinter(group, printer) {
  const warnings = [];
  const blockers = [];

  const paperWanted = group.paperSize;
  const sizes = printer.caps.paperSizes || [];
  let paper = paperWanted;
  if (sizes.length > 0 && !sizes.includes(paperWanted)) {
    if (sizes.includes('A4')) {
      paper = 'A4';
      warnings.push(`${paperWanted} not supported → printed as A4`);
    } else {
      blockers.push(`Printer does not support ${paperWanted} paper`);
    }
  }

  let grayscale = group.color === 'BW';
  if (group.color === 'COLOR' && !printer.caps.color) {
    grayscale = true;
    warnings.push('No color support → printed in grayscale');
  }

  let duplex = group.sides === 'DUPLEX';
  if (duplex && !printer.caps.duplex) {
    duplex = false;
    warnings.push('No duplex support → printed single-sided');
  }

  return {
    ok: blockers.length === 0,
    flags: { grayscale, duplex, paper, copies: group.copies, quality: group.quality },
    warnings,
    blockers,
  };
}

// ---------- window ----------
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'PrintFlow Shop Agent',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'agent-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'agent.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- heartbeat ----------
let heartbeatTimer = null;
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    const c = readConfig();
    if (!c.agentToken) return;
    try {
      const printers = await getPrinterCaps();
      await apiFetch('/api/agent/heartbeat', {
        method: 'POST',
        token: c.agentToken,
        body: { v: 1, printers },
      });
    } catch {
      /* offline — retry on next tick */
    }
  }, 60 * 1000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ---------- poll loop (claims + prints paid jobs) ----------
let pollTimer = null;
let printing = new Set();

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const c = readConfig();
    if (!c.agentToken || !c.autoPrint) return;
    try {
      const res = await apiFetch('/api/agent/orders', { token: c.agentToken });
      for (const order of res.orders || []) {
        if (printing.has(order.orderId)) continue;
        if (order.status !== 'shop_received' && order.status !== 'paid') continue;
        printing.add(order.orderId);
        claimAndPrint(order.orderId).finally(() => printing.delete(order.orderId));
      }
    } catch {
      /* retry next tick */
    }
  }, 10 * 1000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function claimAndPrint(orderId) {
  const c = readConfig();
  const claim = await apiFetch(`/api/agent/orders/${orderId}/claim`, { method: 'POST', token: c.agentToken });
  const printer = c.printer;
  if (!printer) throw new Error('Select a printer first');

  await apiFetch('/api/agent/print-events', {
    method: 'POST',
    token: c.agentToken,
    body: { printJobId: orderId, status: 'PRINTING', printerName: printer },
  });

  const pdfPath = path.join(os.tmpdir(), `printflow-agent-${orderId}.pdf`);
  await downloadTo(claim.pdfUrl, pdfPath);

  const allWarnings = [];
  for (const group of claim.groups || []) {
    try {
      const warnings = await printGroup(pdfPath, group, printer);
      allWarnings.push(...(warnings || []));
      await apiFetch('/api/agent/print-events', {
        method: 'POST',
        token: c.agentToken,
        body: { printJobId: orderId, groupId: group.id, status: 'PRINTED', printerName: printer },
      });
    } catch (e) {
      await apiFetch('/api/agent/print-events', {
        method: 'POST',
        token: c.agentToken,
        body: { printJobId: orderId, groupId: group.id, status: 'PRINT_FAILED', printerName: printer, error: String(e.message).slice(0, 500) },
      });
      throw e;
    }
  }

  try {
    fs.unlinkSync(pdfPath);
  } catch {
    /* ignore */
  }
  return { warnings: allWarnings };
}

// ---------- IPC ----------
ipcMain.handle('agent:state', () => {
  const c = readConfig();
  return {
    paired: Boolean(c.agentToken),
    shopId: c.shopId ?? null,
    printer: c.printer ?? null,
    autoPrint: Boolean(c.autoPrint),
    baseUrl: c.baseUrl || 'http://localhost:3000',
  };
});

ipcMain.handle('agent:pair', async (_e, { baseUrl, pairingToken }) => {
  const caps = await getPrinterCaps();
  const res = await apiFetch('/api/agent/pair', {
    method: 'POST',
    baseUrl,
    body: {
      pairingToken,
      hello: {
        v: 1,
        deviceName: os.hostname(),
        agentVersion: '2.0.0',
        printers: caps,
      },
    },
  });
  writeConfig({ baseUrl, agentToken: res.agentToken, shopId: res.shopId });
  startHeartbeat();
  startPolling();
  return { shopId: res.shopId };
});

ipcMain.handle('agent:unpair', () => {
  stopHeartbeat();
  stopPolling();
  writeConfig({ agentToken: null, shopId: null });
  return { ok: true };
});

ipcMain.handle('agent:setPrinter', (_e, { printer }) => {
  writeConfig({ printer });
  return { ok: true };
});

ipcMain.handle('agent:setAutoPrint', (_e, { autoPrint }) => {
  writeConfig({ autoPrint: !!autoPrint });
  if (autoPrint) startPolling();
  return { ok: true };
});

ipcMain.handle('agent:listPrinters', async () => {
  const caps = await getPrinterCaps();
  return { supported: Boolean(ptp), printers: caps, selected: readConfig().printer || null };
});

ipcMain.handle('agent:testPage', async (_e, { printer }) => {
  if (!ptp) throw new Error('Printing is only supported on Windows');
  const pdfPath = path.join(os.tmpdir(), `printflow-agent-test-${Date.now()}.pdf`);
  await makeTestPdf(pdfPath);
  await ptp.print(pdfPath, { printer });
  return { ok: true };
});

ipcMain.handle('agent:printOrder', async (_e, { orderId }) => {
  return claimAndPrint(orderId);
});

ipcMain.handle('agent:refresh', async () => {
  const c = readConfig();
  if (!c.agentToken) return { orders: [] };
  return apiFetch('/api/agent/orders', { token: c.agentToken });
});

async function makeTestPdf(dest) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('PrintFlow Shop Agent — test page', { x: 60, y: 760, size: 22, font, color: rgb(0.06, 0.32, 0.19) });
  page.drawText('If you can read this, agent printing works.', { x: 60, y: 720, size: 14, font });
  const bytes = await doc.save();
  fs.writeFileSync(dest, bytes);
}

module.exports = { claimAndPrint, startHeartbeat, startPolling };
