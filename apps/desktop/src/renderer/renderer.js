'use strict';

const pf = window.printflow;

const TABS = [
  { key: 'new', label: 'New orders', statuses: ['shop_received'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'printing', label: 'Printing', statuses: ['printing', 'printed'] },
  { key: 'ready', label: 'Ready for pickup', statuses: ['ready_for_pickup'] },
  { key: 'completed', label: 'Completed', statuses: ['completed', 'rejected'] },
];

const STATUS_LABEL = {
  shop_received: 'At shop',
  approved: 'Approved',
  printing: 'Printing',
  printed: 'Printed',
  ready_for_pickup: 'Ready',
  completed: 'Completed',
  rejected: 'Rejected',
};

const NEXT_ACTIONS = {
  shop_received: [
    { to: 'approved', label: 'Approve', cls: 'btn-primary' },
    { to: 'rejected', label: 'Reject', cls: 'btn-danger' },
  ],
  approved: [{ print: true, label: 'Print', cls: 'btn-primary' }],
  printing: [{ to: 'printed', label: 'Mark printed', cls: 'btn-outline' }],
  printed: [{ to: 'ready_for_pickup', label: 'Ready for pickup', cls: 'btn-primary' }],
  ready_for_pickup: [{ to: 'completed', label: 'Complete', cls: 'btn-primary' }],
};

let state = { tab: 'new', jobs: [] };

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
function toast(msg, isError) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  setTimeout(() => t.classList.add('hidden'), 3200);
}
function fmtMoney(n) {
  if (n == null) return '—';
  return '₹' + Number(n).toFixed(2);
}
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------- auth / boot ----------
async function boot() {
  const s = await pf.auth.state();
  $('baseUrl').value = s.baseUrl || 'http://localhost:3000';
  if (s.loggedIn) {
    showApp(s);
  } else {
    show('login');
  }
}

function show(which) {
  $('login').classList.toggle('hidden', which !== 'login');
  $('app').classList.toggle('hidden', which !== 'app');
}

async function login() {
  const btn = $('loginBtn');
  btn.disabled = true;
  $('loginError').textContent = '';
  try {
    const res = await pf.auth.login({
      baseUrl: $('baseUrl').value.trim(),
      email: $('email').value.trim(),
      password: $('password').value,
    });
    showApp({ shop: res.shop, user: res.user });
  } catch (e) {
    $('loginError').textContent = e.message || 'Login failed';
  } finally {
    btn.disabled = false;
  }
}

async function showApp(s) {
  show('app');
  $('shopName').textContent = s.shop ? s.shop.name : '';
  renderTabs();
  await loadPrinters();
  await refresh();
}

// ---------- printers ----------
async function loadPrinters() {
  const sel = $('printerSelect');
  const dot = $('printerStatus');
  try {
    const info = await pf.printers.list();
    if (!info.supported) {
      sel.innerHTML = '<option>Printing unavailable (Windows only)</option>';
      sel.disabled = true;
      $('testBtn').disabled = true;
      dot.className = 'dot offline';
      return;
    }
    sel.disabled = false;
    $('testBtn').disabled = false;
    sel.innerHTML = '';
    info.printers.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      if (p.name === info.selected) opt.selected = true;
      sel.appendChild(opt);
    });
    dot.className = 'dot ' + (info.printers.length ? 'online' : 'offline');
    if (info.selected) await pf.printers.select(info.selected);
  } catch (e) {
    dot.className = 'dot offline';
    toast('Could not list printers: ' + e.message, true);
  }
}

// ---------- tabs + board ----------
function renderTabs() {
  const nav = $('tabs');
  nav.innerHTML = '';
  TABS.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.key === state.tab ? ' active' : '');
    const count = state.jobs.filter((j) => t.statuses.includes(j.status)).length;
    btn.innerHTML = `${t.label}<span class="count">${count}</span>`;
    btn.onclick = () => {
      state.tab = t.key;
      renderTabs();
      renderBoard();
    };
    nav.appendChild(btn);
  });
}

function renderBoard() {
  const board = $('board');
  const tab = TABS.find((t) => t.key === state.tab);
  const items = state.jobs.filter((j) => tab.statuses.includes(j.status));
  board.innerHTML = '';
  if (items.length === 0) {
    board.innerHTML = '<div class="empty">No orders in this column.</div>';
    return;
  }
  items.forEach((job) => board.appendChild(orderCard(job)));
}

function orderCard(job) {
  const el = document.createElement('article');
  el.className = 'order';
  const badgeCls =
    job.status === 'printing' ? 'printing' : job.status === 'ready_for_pickup' ? 'ready' : 'paid';
  el.innerHTML = `
    <div class="order-head">
      <span class="order-num">${job.orderNumber}</span>
      <span class="badge ${badgeCls}">${STATUS_LABEL[job.status] || job.status}</span>
    </div>
    <div class="order-meta">${escapeHtml(job.studentName)}</div>
    <div class="order-meta">${job.totalPages}p (${job.colorPages} color) · ${job.copies}× · ${job.paperSize} · ${job.binding}</div>
    <div class="order-meta">${fmtMoney(job.amount)}${job.paymentReference ? ' · ' + escapeHtml(job.paymentReference) : ''}</div>
    <div class="order-meta">${fmtTime(job.createdAt)}</div>
    <div class="order-actions"></div>
  `;
  const actions = el.querySelector('.order-actions');

  const preview = document.createElement('button');
  preview.className = 'btn btn-outline btn-sm';
  preview.textContent = 'Preview';
  preview.onclick = () => withBusy(preview, () => pf.jobs.openPreview(job.id));
  actions.appendChild(preview);

  (NEXT_ACTIONS[job.status] || []).forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm ' + a.cls;
    b.textContent = a.label;
    b.onclick = () =>
      withBusy(b, async () => {
        if (a.print) {
          await pf.jobs.print(job.id);
          toast('Sent to printer: ' + job.orderNumber);
        } else {
          await pf.jobs.setStatus(job.id, a.to);
        }
        await refresh();
      });
    actions.appendChild(b);
  });

  return el;
}

async function withBusy(btn, fn) {
  const prev = btn.textContent;
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(e.message || 'Action failed', true);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

async function refresh() {
  try {
    state.jobs = await pf.jobs.list();
    renderTabs();
    renderBoard();
  } catch (e) {
    toast('Could not load orders: ' + e.message, true);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- events ----------
$('loginBtn').onclick = login;
$('password').addEventListener('keydown', (e) => e.key === 'Enter' && login());
$('logoutBtn').onclick = async () => {
  await pf.auth.logout();
  show('login');
};
$('printerSelect').onchange = (e) => pf.printers.select(e.target.value);
$('testBtn').onclick = () =>
  withBusy($('testBtn'), async () => {
    await pf.printers.test($('printerSelect').value);
    toast('Test page sent');
  });

// Auto-refresh the queue every 15s (simple polling; realtime can replace later).
setInterval(() => {
  if (!$('app').classList.contains('hidden')) refresh();
}, 15000);

boot();
