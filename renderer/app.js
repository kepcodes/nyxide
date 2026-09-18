// ============================================================
// NyxIDE — логика
// ============================================================

let editor = null;
let currentFolder = null;
let openFiles = {};
let activeFile = null;

// ===== Monaco =====
require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });

require(['vs/editor/editor.main'], function () {
    const savedFontSize = parseInt(localStorage.getItem('editor_fontSize') || '14');
    const savedWordWrap = localStorage.getItem('editor_wordWrap') || 'off';
    const savedMinimap = localStorage.getItem('editor_minimap') === 'true';

    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '// NyxIDE\n// Открой папку слева и выбери файл.\n// Настройки — Ctrl+,\n',
        language: 'javascript',
        theme: 'vs-dark',
        fontSize: savedFontSize,
        fontFamily: 'ui-monospace, "JetBrains Mono", "Fira Code", Consolas, monospace',
        fontLigatures: true,
        minimap: { enabled: savedMinimap },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 4,
        wordWrap: savedWordWrap,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        padding: { top: 16 }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActiveFile);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, saveAllFiles);

    editor.onDidChangeCursorPosition((e) => {
        const pos = e.position;
        const el = document.getElementById('statusPos');
        if (el) el.textContent = `Стр ${pos.lineNumber}, Стлб ${pos.column}`;
    });

    editor.onDidChangeModelContent(() => {
        if (activeFile && openFiles[activeFile]) {
            openFiles[activeFile].dirty = true;
            openFiles[activeFile].content = editor.getValue();
            renderTabs();
            updateStatus();
        }
    });

    applySavedTheme();
    updateStatus();
});

function applySavedTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (editor) monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
}

function detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        js: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'typescript', py: 'python',
        c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cxx: 'cpp',
        rs: 'rust', go: 'go', java: 'java',
        html: 'html', htm: 'html', css: 'css', scss: 'scss',
        json: 'json', md: 'markdown',
        sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
        xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml', toml: 'ini',
        sql: 'sql', php: 'php', rb: 'ruby', lua: 'lua',
        asm: 'asm', s: 'asm', ini: 'ini', txt: 'plaintext'
    };
    return map[ext] || 'plaintext';
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        js: '🟨', ts: '🔷', py: '🐍', c: '🇨', cpp: '🇨', h: '📄',
        html: '🌐', css: '🎨', json: '📋', md: '📖', sh: '⚙️',
        rs: '🦀', go: '🐹', java: '☕', php: '🐘', rb: '💎',
        svg: '🖼️', png: '🖼️', jpg: '🖼️', gif: '🖼️',
        txt: '📄', yml: '📋', yaml: '📋', toml: '📋'
    };
    return icons[ext] || '📄';
}

// ===== Sidebar =====
document.getElementById('openFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.openFolder();
    if (!folder) return;
    currentFolder = folder;
    await renderFileTree();
    if (terminalStarted) {
        await window.api.terminal.kill();
        terminalStarted = false;
        await initTerminal();
    }
});
document.getElementById('refreshBtn').addEventListener('click', async () => {
    if (currentFolder) await renderFileTree();
});
document.getElementById('newFileBtn').addEventListener('click', async () => {
    if (!currentFolder) return alert('Сначала открой папку');
    const name = prompt('Имя файла:');
    if (!name) return;
    const p = await window.api.pathJoin(currentFolder, name);
    const r = await window.api.createFile(p);
    if (r.error) return alert('Ошибка: ' + r.error);
    await renderFileTree();
});
document.getElementById('newFolderBtn').addEventListener('click', async () => {
    if (!currentFolder) return alert('Сначала открой папку');
    const name = prompt('Имя папки:');
    if (!name) return;
    const p = await window.api.pathJoin(currentFolder, name);
    const r = await window.api.createDir(p);
    if (r.error) return alert('Ошибка: ' + r.error);
    await renderFileTree();
});
document.getElementById('fileSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.tree-item').forEach(el => {
        const nameEl = el.querySelector('.name');
        if (!nameEl) return;
        const name = nameEl.textContent.toLowerCase();
        el.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
});

async function renderFileTree() {
    const treeEl = document.getElementById('fileTree');
    if (!treeEl) return;
    treeEl.innerHTML = '';
    if (!currentFolder) {
        treeEl.innerHTML = '<div class="empty-hint">Папка не открыта<br><br>Нажми 📂</div>';
        return;
    }
    await renderDir(currentFolder, treeEl);
}

async function renderDir(dirPath, container) {
    const entries = await window.api.readDir(dirPath);
    if (entries.error) {
        container.innerHTML = `<div class="empty-hint">Ошибка: ${entries.error}</div>`;
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (entry.name === 'node_modules') continue;
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.path = entry.path;
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = entry.isDirectory ? '📁' : getFileIcon(entry.name);
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = entry.name;
        item.appendChild(icon);
        item.appendChild(name);
        if (entry.isDirectory) {
            const children = document.createElement('div');
            children.className = 'tree-children';
            children.style.display = 'none';
            item.appendChild(children);
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (children.style.display === 'none') {
                    if (!children.dataset.loaded) {
                        await renderDir(entry.path, children);
                        children.dataset.loaded = '1';
                    }
                    children.style.display = 'block';
                    icon.textContent = '📂';
                } else {
                    children.style.display = 'none';
                    icon.textContent = '📁';
                }
            });
        } else {
            item.addEventListener('click', () => openFile(entry.path, entry.name));
        }
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, entry);
        });
        container.appendChild(item);
    }
}

function showContextMenu(x, y, entry) {
    document.querySelectorAll('.context-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.background = 'var(--card)';
    menu.style.border = '1px solid var(--border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '4px';
    menu.style.zIndex = '2000';
    menu.style.minWidth = '180px';
    const actions = [
        { label: '📝 Переименовать', fn: () => renameEntry(entry) },
        { label: '🗑 Удалить', fn: () => deleteEntry(entry), danger: true }
    ];
    if (entry.isDirectory) {
        actions.unshift(
            { label: '📄 Новый файл', fn: () => newInsideDir(entry.path, 'file') },
                        { label: '📁 Новая папка', fn: () => newInsideDir(entry.path, 'dir') }
        );
    }
    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.textContent = a.label;
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.padding = '8px 12px';
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.color = a.danger ? 'var(--red)' : 'var(--text)';
        btn.style.textAlign = 'left';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '5px';
        btn.style.fontSize = '13px';
        btn.style.fontFamily = 'inherit';
        btn.addEventListener('mouseenter', () => btn.style.background = 'var(--bg2)');
        btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
        btn.addEventListener('click', () => { menu.remove(); a.fn(); });
        menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    const close = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
}

async function renameEntry(entry) {
    const newName = prompt('Новое имя:', entry.name);
    if (!newName || newName === entry.name) return;
    const dir = await window.api.pathDirname(entry.path);
    const newPath = await window.api.pathJoin(dir, newName);
    const r = await window.api.rename(entry.path, newPath);
    if (r.error) return alert('Ошибка: ' + r.error);
    await renderFileTree();
}

async function deleteEntry(entry) {
    const choice = await window.api.messageBox({
        type: 'warning',
        buttons: ['Удалить', 'Отмена'],
        defaultId: 1,
            title: 'Удаление',
            message: `Удалить "${entry.name}"?`
    });
    if (choice !== 0) return;
    const r = await window.api.delete(entry.path);
    if (r.error) return alert('Ошибка: ' + r.error);
    if (activeFile && activeFile.startsWith(entry.path)) closeFile(activeFile);
    await renderFileTree();
}

async function newInsideDir(dirPath, type) {
    const name = prompt(type === 'file' ? 'Имя файла:' : 'Имя папки:');
    if (!name) return;
    const p = await window.api.pathJoin(dirPath, name);
    const r = type === 'file' ? await window.api.createFile(p) : await window.api.createDir(p);
    if (r.error) return alert('Ошибка: ' + r.error);
    await renderFileTree();
}

// ===== Файлы =====
async function openFile(filePath, fileName) {
    if (openFiles[filePath]) { setActiveFile(filePath); return; }
    const result = await window.api.readFile(filePath);
    if (result.error) return alert('Ошибка чтения: ' + result.error);
    const language = detectLanguage(fileName);
    const model = monaco.editor.createModel(result.content, language);
    model.onDidChangeContent(() => {
        if (openFiles[filePath]) {
            openFiles[filePath].dirty = true;
            openFiles[filePath].content = model.getValue();
            renderTabs();
        }
    });
    openFiles[filePath] = { name: fileName, model, content: result.content, dirty: false };
    setActiveFile(filePath);
}

function setActiveFile(filePath) {
    activeFile = filePath;
    editor.setModel(openFiles[filePath].model);
    renderTabs();
    highlightActiveInTree();
    updateStatus();
}

function renderTabs() {
    const tabsEl = document.getElementById('tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';
    for (const [path, file] of Object.entries(openFiles)) {
        const tab = document.createElement('div');
        tab.className = 'tab' + (path === activeFile ? ' active' : '');
        tab.innerHTML = `<span>${file.name}${file.dirty ? ' •' : ''}</span><span class="close">✕</span>`;
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('close')) closeFile(path);
            else setActiveFile(path);
        });
            tabsEl.appendChild(tab);
    }
}

function closeFile(filePath) {
    if (openFiles[filePath]?.dirty) {
        if (!confirm('Файл не сохранён. Закрыть?')) return;
    }
    openFiles[filePath]?.model.dispose();
    delete openFiles[filePath];
    if (activeFile === filePath) {
        const remaining = Object.keys(openFiles);
        activeFile = remaining.length ? remaining[0] : null;
        editor.setModel(activeFile ? openFiles[activeFile].model : null);
    }
    renderTabs();
    updateStatus();
}

function highlightActiveInTree() {
    document.querySelectorAll('.tree-item').forEach(el => {
        el.classList.toggle('active', el.dataset.path === activeFile);
    });
}

async function saveActiveFile() {
    if (!activeFile) return;
    const result = await window.api.writeFile(activeFile, editor.getValue());
    if (result.error) return alert('Ошибка сохранения: ' + result.error);
    openFiles[activeFile].dirty = false;
    openFiles[activeFile].content = editor.getValue();
    renderTabs();
    updateStatus();
    flashStatus('✓ Сохранено');
}

async function saveAllFiles() {
    for (const path of Object.keys(openFiles)) {
        if (openFiles[path].dirty) {
            await window.api.writeFile(path, openFiles[path].model.getValue());
            openFiles[path].dirty = false;
        }
    }
    renderTabs();
    flashStatus('✓ Все файлы сохранены');
}

function updateStatus() {
    const sf = document.getElementById('statusFile');
    const sl = document.getElementById('statusLang');
    if (!sf || !sl) return;
    if (!activeFile) {
        sf.textContent = '—';
        sl.textContent = '';
        return;
    }
    const f = openFiles[activeFile];
    sf.textContent = f.name;
    sl.textContent = detectLanguage(f.name);
}

function flashStatus(text) {
    const el = document.getElementById('statusSaved');
    if (!el) return;
    el.textContent = text;
    setTimeout(() => el.textContent = '', 2000);
}

// ===== Меню =====
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
}

document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.menu;
        const isOpen = !document.getElementById('dropdown-' + name).classList.contains('hidden');
        closeAllDropdowns();
        if (!isOpen) {
            document.getElementById('dropdown-' + name).classList.remove('hidden');
            btn.classList.add('active');
        }
    });
});

document.addEventListener('click', closeAllDropdowns);

document.querySelectorAll('.dropdown button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        closeAllDropdowns();
        handleMenuAction(action);
    });
});

function handleMenuAction(action) {
    switch (action) {
        case 'openFolder': document.getElementById('openFolderBtn').click(); break;
        case 'newFile': document.getElementById('newFileBtn').click(); break;
        case 'newFolder': document.getElementById('newFolderBtn').click(); break;
        case 'save': saveActiveFile(); break;
        case 'saveAll': saveAllFiles(); break;
        case 'quit': window.api.window.close(); break;
        case 'undo': if (editor) editor.trigger('menu', 'undo', null); break;
        case 'redo': if (editor) editor.trigger('menu', 'redo', null); break;
        case 'find': if (editor) editor.getAction('actions.find').run(); break;
        case 'replace': if (editor) editor.getAction('editor.action.startFindReplaceAction').run(); break;
        case 'toggleSidebar': document.getElementById('app').classList.toggle('hide-left'); if (editor) setTimeout(() => editor.layout(), 100); break;
        case 'toggleTerminal': toggleTerminal(); break;
        case 'settings': openEditorSettings(); break;
        case 'theme-dark': setTheme('dark'); break;
        case 'theme-light': setTheme('light'); break;
        case 'theme-high': setTheme('high-contrast'); break;
        case 'fullscreen': window.api.window.fullscreen(); break;
        case 'minimize': window.api.window.minimize(); break;
        case 'zoomIn': if (editor) { const fs = editor.getOption(monaco.editor.EditorOption.fontSize); editor.updateOptions({ fontSize: fs + 1 }); } break;
        case 'zoomOut': if (editor) { const fs = editor.getOption(monaco.editor.EditorOption.fontSize); editor.updateOptions({ fontSize: Math.max(10, fs - 1) }); } break;
        case 'zoomReset': if (editor) editor.updateOptions({ fontSize: 14 }); break;
        case 'about': document.getElementById('aboutModal').classList.remove('hidden'); break;
    }
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (editor) monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
}

// ===== Кнопки окна =====
document.getElementById('winMin').addEventListener('click', () => window.api.window.minimize());
document.getElementById('winMax').addEventListener('click', () => window.api.window.maximize());
document.getElementById('winClose').addEventListener('click', () => window.api.window.close());

// ===== Модалки =====
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById(btn.dataset.close).classList.add('hidden');
    });
});

// ===== Настройки редактора =====
function openEditorSettings() {
    document.getElementById('fontSizeRange').value = editor.getOption(monaco.editor.EditorOption.fontSize);
    document.getElementById('fontSizeVal').textContent = editor.getOption(monaco.editor.EditorOption.fontSize);
    document.getElementById('wordWrapSelect').value = editor.getOption(monaco.editor.EditorOption.wordWrap);
    document.getElementById('minimapSelect').value = String(editor.getOption(monaco.editor.EditorOption.minimap).enabled);
    document.getElementById('themeSelect').value = localStorage.getItem('theme') || 'dark';
    document.getElementById('editorSettingsModal').classList.remove('hidden');
}

document.getElementById('fontSizeRange').addEventListener('input', (e) => {
    document.getElementById('fontSizeVal').textContent = e.target.value;
    if (editor) editor.updateOptions({ fontSize: parseInt(e.target.value) });
});

document.getElementById('saveEditorSettingsBtn').addEventListener('click', () => {
    const fontSize = parseInt(document.getElementById('fontSizeRange').value);
    const wordWrap = document.getElementById('wordWrapSelect').value;
    const minimap = document.getElementById('minimapSelect').value === 'true';
    const theme = document.getElementById('themeSelect').value;
    localStorage.setItem('editor_fontSize', fontSize);
    localStorage.setItem('editor_wordWrap', wordWrap);
    localStorage.setItem('editor_minimap', minimap);
    if (editor) editor.updateOptions({ wordWrap, minimap: { enabled: minimap } });
    setTheme(theme);
    document.getElementById('editorSettingsModal').classList.add('hidden');
});

document.getElementById('closeEditorSettingsBtn').addEventListener('click', () => {
    document.getElementById('editorSettingsModal').classList.add('hidden');
});

// Ctrl+, — настройки
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openEditorSettings();
    }
});

// ===== Терминал =====
let terminal = null;
let fitAddon = null;
let terminalStarted = false;
let terminalVisible = true;

async function initTerminal() {
    if (terminalStarted) {
        setTimeout(() => { if (fitAddon) { try { fitAddon.fit(); } catch(e){} } }, 100);
        return;
    }

    const container = document.getElementById('terminal-container');
    if (!container) return;

    const TerminalClass = window.Terminal || (window.xterm && window.xterm.Terminal);
    if (!TerminalClass) {
        container.innerHTML = '<div style="padding:20px;color:#ff6b6b;">Ошибка: xterm.js не загрузился</div>';
        return;
    }

    terminal = new TerminalClass({
        fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
        fontSize: 13,
        theme: {
            background: '#0a0a0f',
            foreground: '#e8e8ee',
                cursor: '#7c5cff',
                black: '#0a0a0f', red: '#ff6b6b', green: '#4ade80', yellow: '#fbbf24',
                blue: '#4a9eff', magenta: '#7c5cff', cyan: '#22d3ee', white: '#e8e8ee'
        },
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        convertEol: true
    });

    const FitAddonClass = window.FitAddon && window.FitAddon.FitAddon;
    if (FitAddonClass) {
        fitAddon = new FitAddonClass();
        terminal.loadAddon(fitAddon);
    }

    terminal.open(container);
    setTimeout(() => { if (fitAddon) { try { fitAddon.fit(); } catch(e){} } }, 200);

    terminal.writeln('\x1b[38;2;124;92;255m  NyxIDE Terminal\x1b[0m');
    terminal.writeln('');

    const cwd = currentFolder || await window.api.homedir();
    await window.api.terminal.start(cwd);

    window.api.terminal.onData((data) => { if (terminal) terminal.write(data); });
    window.api.terminal.onExit((code) => {
        if (terminal) terminal.writeln(`\r\n\x1b[38;2;255;107;107m[Процесс завершён: ${code}]\x1b[0m`);
        terminalStarted = false;
    });

    terminal.onData((data) => window.api.terminal.write(data));
    terminal.onResize(({ cols, rows }) => window.api.terminal.resize(cols, rows));

    terminalStarted = true;
}

function toggleTerminal() {
    const panel = document.getElementById('terminal-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    terminalVisible = !panel.classList.contains('hidden');
    document.getElementById('app').style.height = terminalVisible
    ? 'calc(100vh - var(--titlebar-height) - var(--terminal-height))'
    : 'calc(100vh - var(--titlebar-height))';
    if (terminalVisible) {
        initTerminal();
        setTimeout(() => { if (fitAddon) { try { fitAddon.fit(); } catch(e){} } }, 150);
    }
    if (editor) setTimeout(() => editor.layout(), 100);
}

document.getElementById('terminalClearBtn').addEventListener('click', () => {
    if (terminal) terminal.clear();
});

document.getElementById('terminalRestartBtn').addEventListener('click', async () => {
    if (terminal) terminal.clear();
    await window.api.terminal.kill();
    terminalStarted = false;
    await initTerminal();
});

document.getElementById('terminalCloseBtn').addEventListener('click', toggleTerminal);

window.addEventListener('resize', () => {
    if (fitAddon && terminal && terminalVisible) {
        try { fitAddon.fit(); window.api.terminal.resize(terminal.cols, terminal.rows); } catch(e){}
    }
});

// Ctrl+` — терминал
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
    }
});

// ===== Старт =====
window.addEventListener('load', () => {
    setTimeout(() => initTerminal(), 300);
});
