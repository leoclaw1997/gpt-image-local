import { app, BrowserWindow, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import net from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

let win = null;

function waitForPort(port = 8787, timeout = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = net.createConnection(port, '127.0.0.1');
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) resolve(false);
        else setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'GPT Image Studio',
    backgroundColor: '#0f0b1f',
    webPreferences: {
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadURL('http://localhost:8787');
  }

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    dialog.showErrorBox('页面加载失败', `错误码: ${errorCode}\n${errorDescription}`);
  });

  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  if (!isDev) {
    // 直接在主进程中启动后端服务
    try {
      await import('file://' + path.join(process.resourcesPath, 'app.asar', 'server', 'index.js'));
    } catch (err) {
      dialog.showErrorBox('后端启动失败', err.message);
      app.quit();
      return;
    }
    const ok = await waitForPort();
    if (!ok) {
      dialog.showErrorBox('后端启动超时', '后端服务在 15 秒内未响应。');
    }
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
