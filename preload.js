const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
                                messageBox: (opts) => ipcRenderer.invoke('dialog:message', opts),

                                readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
                                readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
                                writeFile: (p, c) => ipcRenderer.invoke('fs:writeFile', p, c),
                                createFile: (p) => ipcRenderer.invoke('fs:createFile', p),
                                createDir: (p) => ipcRenderer.invoke('fs:createDir', p),
                                delete: (p) => ipcRenderer.invoke('fs:delete', p),
                                rename: (a, b) => ipcRenderer.invoke('fs:rename', a, b),

                                pathJoin: (...parts) => ipcRenderer.invoke('path:join', ...parts),
                                pathDirname: (p) => ipcRenderer.invoke('path:dirname', p),
                                pathBasename: (p) => ipcRenderer.invoke('path:basename', p),
                                homedir: () => ipcRenderer.invoke('os:homedir'),

                                window: {
                                    minimize: () => ipcRenderer.invoke('window:minimize'),
                                maximize: () => ipcRenderer.invoke('window:maximize'),
                                close: () => ipcRenderer.invoke('window:close'),
                                fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
                                onMaximized: (cb) => ipcRenderer.on('window:maximized', (e, val) => cb(val))
                                },

                                terminal: {
                                    start: (cwd) => ipcRenderer.invoke('terminal:start', cwd),
                                write: (data) => ipcRenderer.invoke('terminal:write', data),
                                resize: (cols, rows) => ipcRenderer.invoke('terminal:resize', cols, rows),
                                kill: () => ipcRenderer.invoke('terminal:kill'),
                                onData: (cb) => ipcRenderer.on('terminal:data', (e, data) => cb(data)),
                                onExit: (cb) => ipcRenderer.on('terminal:exit', (e, code) => cb(code))
                                }
});
