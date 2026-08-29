'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit bridge. The renderer has no Node access — only these calls.
contextBridge.exposeInMainWorld('printflow', {
  auth: {
    state: () => ipcRenderer.invoke('auth:state'),
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  jobs: {
    list: (status) => ipcRenderer.invoke('jobs:list', { status }),
    setStatus: (id, status) => ipcRenderer.invoke('jobs:status', { id, status }),
    openPreview: (id) => ipcRenderer.invoke('jobs:openPreview', { id }),
    print: (id) => ipcRenderer.invoke('jobs:print', { id }),
  },
  printers: {
    list: () => ipcRenderer.invoke('printers:list'),
    select: (printer) => ipcRenderer.invoke('printers:select', { printer }),
    test: (printer) => ipcRenderer.invoke('printers:test', { printer }),
  },
});
