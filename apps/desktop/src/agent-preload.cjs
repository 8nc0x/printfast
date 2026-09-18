const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printflowAgent', {
  state: () => ipcRenderer.invoke('agent:state'),
  pair: (baseUrl, pairingToken) => ipcRenderer.invoke('agent:pair', { baseUrl, pairingToken }),
  unpair: () => ipcRenderer.invoke('agent:unpair'),
  setPrinter: (printer) => ipcRenderer.invoke('agent:setPrinter', { printer }),
  setAutoPrint: (autoPrint) => ipcRenderer.invoke('agent:setAutoPrint', { autoPrint }),
  listPrinters: () => ipcRenderer.invoke('agent:listPrinters'),
  testPage: (printer) => ipcRenderer.invoke('agent:testPage', { printer }),
  printOrder: (orderId) => ipcRenderer.invoke('agent:printOrder', { orderId }),
  refresh: () => ipcRenderer.invoke('agent:refresh'),
});
