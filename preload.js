const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electron',
  {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = ['start-listing', 'stop-listing', 'resume-listing', 'fetch-and-save-artifacts', 'get-paginated-artifacts', 'get-repositories'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = ['listing-update', 'get-paginated-artifacts-response', 'fetch-and-save-artifacts-response', 'get-repositories-response'];
      if (validChannels.includes(channel)) {
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
      }
      return () => {}; // Return a no-op function for invalid channels
    },
    removeListener: (channel, func) => {
      let validChannels = ['listing-update', 'get-paginated-artifacts-response', 'fetch-and-save-artifacts-response', 'get-repositories-response'];
      if (validChannels.includes(channel)) {
        // The func passed here must be the same reference as the one used in `receive`
        // This is handled by the `receive` method now returning a cleanup function
        // So, this `removeListener` might not be directly used by the renderer process anymore
        // but it's good to keep it consistent with the exposed API.
        ipcRenderer.removeListener(channel, func);
      }
    }
  }
);
