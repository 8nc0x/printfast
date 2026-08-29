'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// pdf-to-printer is Windows-only (bundles SumatraPDF). Load lazily so the app can
// still run on other platforms for development.
let ptp = null;
try {
  ptp = require('pdf-to-printer');
} catch {
  ptp = null;
}

// ---------- tiny JSON config store (userData) ----------
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'printflow-config.json');
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

// ---------- HTTP helper ----------
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
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    lib
      .get(url, (res) => {
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

// ---------- window ----------
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'PrintFlow Shop',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

// ---------- IPC: auth ----------
ipcMain.handle('auth:state', () => {
  const c = readConfig();
  return { loggedIn: Boolean(c.token), shop: c.shop || null, user: c.user || null, baseUrl: c.baseUrl || 'http://localhost:3000' };
});

ipcMain.handle('auth:login', async (_e, { baseUrl, email, password }) => {
  const res = await apiFetch('/api/shop/auth', { method: 'POST', body: { email, password }, baseUrl });
  writeConfig({ baseUrl, token: res.token, shop: res.shop, user: res.user });
  return { shop: res.shop, user: res.user };
});

ipcMain.handle('auth:logout', () => {
  writeConfig({ token: null, shop: null, user: null });
  return { ok: true };
});

// ---------- IPC: jobs ----------
ipcMain.handle('jobs:list', async (_e, { status } = {}) => {
  const c = readConfig();
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch(`/api/shop/jobs${qs}`, { token: c.token });
  return res.jobs || [];
});

ipcMain.handle('jobs:status', async (_e, { id, status }) => {
  const c = readConfig();
  return apiFetch(`/api/shop/jobs/${id}/status`, { method: 'POST', body: { status }, token: c.token });
});

ipcMain.handle('jobs:finalUrl', async (_e, { id }) => {
  const c = readConfig();
  const res = await apiFetch(`/api/shop/jobs/${id}/final-url`, { token: c.token });
  return res.url;
});

ipcMain.handle('jobs:openPreview', async (_e, { id }) => {
  const c = readConfig();
  const res = await apiFetch(`/api/shop/jobs/${id}/final-url`, { token: c.token });
  await shell.openExternal(res.url);
  return { ok: true };
});

// ---------- IPC: printers ----------
ipcMain.handle('printers:list', async () => {
  if (!ptp) return { supported: false, printers: [], selected: readConfig().printer || null };
  const printers = await ptp.getPrinters();
  let deflt = null;
  try {
    deflt = await ptp.getDefaultPrinter();
  } catch {
    deflt = null;
  }
  return {
    supported: true,
    printers: printers.map((p) => ({ name: p.name, deviceId: p.deviceId })),
    default: deflt ? deflt.name : null,
    selected: readConfig().printer || (deflt ? deflt.name : null),
  };
});

ipcMain.handle('printers:select', async (_e, { printer }) => {
  writeConfig({ printer });
  const c = readConfig();
  // Best-effort sync to server for the "printer health" view.
  try {
    await apiFetch('/api/shop/printers', { method: 'POST', body: { printerName: printer, isDefault: true, status: 'online' }, token: c.token });
  } catch {
    /* non-fatal */
  }
  return { ok: true };
});

ipcMain.handle('printers:test', async (_e, { printer }) => {
  if (!ptp) throw new Error('Printing is only supported on Windows');
  const pdfPath = path.join(os.tmpdir(), `printflow-test-${Date.now()}.pdf`);
  await makeTestPdf(pdfPath);
  await ptp.print(pdfPath, { printer });
  return { ok: true };
});

// ---------- IPC: print a job ----------
ipcMain.handle('jobs:print', async (_e, { id }) => {
  if (!ptp) throw new Error('Printing is only supported on Windows');
  const c = readConfig();
  const printer = c.printer;
  if (!printer) throw new Error('Select a printer first');

  // Fetch the job to know copies + status.
  const jobs = await apiFetch('/api/shop/jobs', { token: c.token }).then((r) => r.jobs || []);
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error('Job not found');

  // approved -> printing before sending to the device.
  if (job.status === 'approved') {
    await apiFetch(`/api/shop/jobs/${id}/status`, { method: 'POST', body: { status: 'printing' }, token: c.token });
  }

  const url = await apiFetch(`/api/shop/jobs/${id}/final-url`, { token: c.token }).then((r) => r.url);
  const pdfPath = path.join(os.tmpdir(), `printflow-${id}.pdf`);
  await downloadTo(url, pdfPath);

  await ptp.print(pdfPath, { printer, copies: job.copies || 1 });

  // printing -> printed on success.
  await apiFetch(`/api/shop/jobs/${id}/status`, { method: 'POST', body: { status: 'printed' }, token: c.token });
  try {
    fs.unlinkSync(pdfPath);
  } catch {
    /* ignore */
  }
  return { ok: true };
});

async function makeTestPdf(dest) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('PrintFlow — printer test page', { x: 60, y: 760, size: 22, font, color: rgb(0.06, 0.32, 0.19) });
  page.drawText('If you can read this, printing works.', { x: 60, y: 720, size: 14, font });
  page.drawRectangle({ x: 60, y: 80, width: 475, height: 600, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  const bytes = await doc.save();
  fs.writeFileSync(dest, bytes);
}
