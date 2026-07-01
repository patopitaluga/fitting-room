const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fittingRoom', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  resizeToContent: (width, height) => ipcRenderer.invoke('resize-window', width, height),
});
