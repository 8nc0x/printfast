// PrintFlow Shop Agent — renderer logic.
const $ = (id) => document.getElementById(id);

let state = { paired: false, printers: [], selected: null, autoPrint: false };

async function refreshState() {
  state = await window.printflowAgent.state();
  render();
}

function render() {
  $('pairCard').style.display = state.paired ? 'none' : 'block';
  $('mainCard').style.display = state.paired ? 'block' : 'none';
  $('queueCard').style.display = state.paired ? 'block' : 'none';
  $('status').textContent = state.paired ? '● Paired' : '○ Not paired';
  if (state.baseUrl) $('baseUrl').value = state.baseUrl;

  const sel = $('printerSelect');
  sel.innerHTML = '';
  for (const p of state.printers) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name + (p.isDefault ? ' (default)' : '');
    if (state.selected === p.name) opt.selected = true;
    sel.appendChild(opt);
  }
  $('autoPrint').checked = state.autoPrint;
}

async function loadPrinters() {
  if (!state.paired) return;
  const res = await window.printflowAgent.listPrinters();
  state.printers = res.printers || [];
  state.selected = res.selected;
  render();
}

async function loadOrders() {
  if (!state.paired) return;
  const res = await window.printflowAgent.refresh();
  const wrap = $('orders');
  wrap.innerHTML = '';
  for (const order of res.orders || []) {
    const div = document.createElement('div');
    div.className = 'order';
    const groups = (order.groups || [])
      .map((g) => `${g.pages.length}p ${g.color} ${g.sides.toLowerCase()} ×${g.copies} ${g.paperSize}`)
      .join(' · ');
    div.innerHTML = `
      <div class="row">
        <div>
          <strong>${order.orderNumber}</strong>
          <span class="badge">${order.status}</span>
          <div class="muted">${order.customerName} · ${groups || order.totalPages + ' pages'}</div>
        </div>
        <button data-print="${order.orderId}">Print</button>
      </div>`;
    wrap.appendChild(div);
  }
  wrap.querySelectorAll('button[data-print]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Printing…';
      try {
        const res = await window.printflowAgent.printOrder(btn.dataset.print);
        if (res.warnings && res.warnings.length) {
          alert('Printed with adjustments:\n' + res.warnings.join('\n'));
        }
        btn.textContent = 'Printed';
      } catch (e) {
        btn.textContent = 'Failed';
        alert('Print failed: ' + e.message);
        loadOrders();
      }
    });
  });
}

$('pairBtn').addEventListener('click', async () => {
  $('pairBtn').disabled = true;
  try {
    await window.printflowAgent.pair($('baseUrl').value.trim(), $('pairingToken').value.trim());
    state.paired = true;
    await loadPrinters();
    await loadOrders();
    render();
  } catch (e) {
    alert('Pairing failed: ' + e.message);
  } finally {
    $('pairBtn').disabled = false;
  }
});

$('unpairBtn').addEventListener('click', async () => {
  await window.printflowAgent.unpair();
  state.paired = false;
  render();
});

$('printerSelect').addEventListener('change', (e) => {
  window.printflowAgent.setPrinter(e.target.value);
});

$('autoPrint').addEventListener('change', (e) => {
  window.printflowAgent.setAutoPrint(e.target.checked);
});

$('testBtn').addEventListener('click', async () => {
  const printer = $('printerSelect').value;
  if (!printer) return alert('Select a printer first');
  try {
    await window.printflowAgent.testPage(printer);
  } catch (e) {
    alert('Test failed: ' + e.message);
  }
});

$('refreshBtn').addEventListener('click', loadOrders);

refreshState().then(() => {
  loadPrinters();
  loadOrders();
  // Poll the queue lightly; SSE could replace this later.
  setInterval(loadOrders, 20000);
});
