import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, screen, session } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { validateStartupRequirements } from '../lib/validate-startup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

loadEnv();

const SERVER_PORT = process.env.PORT || 3001;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const WINDOW_WIDTH = 200;
const WINDOW_HEIGHT = 120;
const MIN_CONTENT_WIDTH = 200;
const MIN_CONTENT_HEIGHT = 120;
const MAX_CONTENT_WIDTH = 720;

let mainWindow;
let serverProcess;

function startServer() {
  serverProcess = spawn('node', ['server.ts'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(SERVER_URL);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Express server failed to start');
}

/** Used in `capture-screen` IPC handler registered in `app.whenReady`. */
async function capturePrimaryScreen() {
  const windowWasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

  if (windowWasVisible) {
    mainWindow.hide();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    const source = sources.find((entry) => entry.display_id === String(primaryDisplay.id))
      ?? sources[0];

    if (!source) throw new Error('No screen sources found');

    return source.thumbnail.toDataURL();
  } finally {
    if (windowWasVisible && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'Fitting Room',
    useContentSize: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    backgroundColor: '#f4f4f5',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(SERVER_URL);
}

/** Used in `app.whenReady`. */
function quitWithStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('Fitting Room cannot start', message);
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  app.quit();
}

app.whenReady().then(async () => {
  try {
    validateStartupRequirements();
  } catch (error) {
    quitWithStartupError(error);
    return;
  }

  ipcMain.handle('capture-screen', capturePrimaryScreen);
  ipcMain.handle('resize-window', (_event, width, height) => {
    if (!mainWindow) return;

    const clampedWidth = Math.min(
      Math.max(Math.ceil(width), MIN_CONTENT_WIDTH),
      MAX_CONTENT_WIDTH,
    );
    const clampedHeight = Math.max(Math.ceil(height), MIN_CONTENT_HEIGHT);

    mainWindow.setContentSize(clampedWidth, clampedHeight);
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  startServer();
  try {
    await waitForServer();
  } catch (error) {
    quitWithStartupError(error);
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
