const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');

let mainWindow;
let ptyProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1500, height: 950,
        minWidth: 900, minHeight: 600,
        backgroundColor: '#0a0a0f',
        title: 'NyxIDE',
        icon: path.join(__dirname, 'assets', 'logo.png'),
                                   frame: false,
                                   titleBarStyle: 'hidden',
                                   webPreferences: {
                                       preload: path.join(__dirname, 'preload.js'),
                                   contextIsolation: true,
                                   nodeIntegration: false
                                   }
    });
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (ptyProcess) { try { ptyProcess.kill(); } catch(e){} }
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ===== Управление окном =====
ipcMain.handle('window:minimize', () => { mainWindow.minimize(); });
ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.handle('window:close', () => { mainWindow.close(); });
ipcMain.handle('window:fullscreen', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

// ===== Диалоги =====
ipcMain.handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:message', async (e, opts) => {
    const r = await dialog.showMessageBox(mainWindow, opts);
    return r.response;
});

// ===== Файлы =====
ipcMain.handle('fs:readDir', async (e, dirPath) => {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.map(x => ({
            name: x.name,
            path: path.join(dirPath, x.name),
                                 isDirectory: x.isDirectory()
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:readFile', async (e, p) => {
    try { return { content: fs.readFileSync(p, 'utf-8') }; }
    catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:writeFile', async (e, p, c) => {
    try { fs.writeFileSync(p, c, 'utf-8'); return { ok: true }; }
    catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:createFile', async (e, p) => {
    try { fs.writeFileSync(p, '', 'utf-8'); return { ok: true }; }
    catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:createDir', async (e, p) => {
    try { fs.mkdirSync(p); return { ok: true }; }
    catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:delete', async (e, p) => {
    try {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
        return { ok: true };
    } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:rename', async (e, oldPath, newPath) => {
    try { fs.renameSync(oldPath, newPath); return { ok: true }; }
    catch (err) { return { error: err.message }; }
});

ipcMain.handle('path:join', async (e, ...parts) => path.join(...parts));
ipcMain.handle('path:dirname', async (e, p) => path.dirname(p));
ipcMain.handle('path:basename', async (e, p) => path.basename(p));
ipcMain.handle('os:homedir', async () => os.homedir());

// ===== Терминал =====
ipcMain.handle('terminal:start', async (e, cwd) => {
    if (ptyProcess) {
        try { ptyProcess.kill(); } catch(e){}
        ptyProcess = null;
    }

    const shell = process.env.SHELL || '/bin/bash';
    let cwdPath = cwd || os.homedir();
    try {
        if (!fs.existsSync(cwdPath)) cwdPath = os.homedir();
    } catch (e) {
        cwdPath = os.homedir();
    }

    try {
        ptyProcess = pty.spawn(shell, ['-i', '-l'], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd: cwdPath,
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                LANG: process.env.LANG || 'ru_UA.UTF-8',
                LC_ALL: process.env.LC_ALL || 'ru_UA.UTF-8'
            }
        });
    } catch (err) {
        console.error('pty spawn failed:', err);
        return { error: err.message };
    }

    ptyProcess.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', data);
        }
    });

    ptyProcess.onExit(({ exitCode }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', exitCode);
        }
    });

    return { ok: true };
});

ipcMain.handle('terminal:write', async (e, data) => {
    if (ptyProcess) ptyProcess.write(data);
    return { ok: true };
});

ipcMain.handle('terminal:resize', async (e, cols, rows) => {
    if (ptyProcess) { try { ptyProcess.resize(cols, rows); } catch(e){} }
    return { ok: true };
});

ipcMain.handle('terminal:kill', async () => {
    if (ptyProcess) { try { ptyProcess.kill(); } catch(e){} ptyProcess = null; }
    return { ok: true };
});
