const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { createSetupWindow, isFirstRun, getConfig } = require('./setup-wizard-main.cjs');
const { getGitCredential, hasGitCredential } = require('./credential-store.cjs');

let mainWindow;
let serverProcess;
let setupCompleted = false;

// Check if setup is needed
async function checkAndRunSetup() {
  if (isFirstRun()) {
    console.log('First run detected, showing setup wizard...');
    const setupWindow = createSetupWindow();
    
    // Wait for setup to complete
    return new Promise((resolve) => {
      app.once('setup-complete', () => {
        console.log('Setup completed');
        setupCompleted = true;
        resolve();
      });
    });
  } else {
    setupCompleted = true;
  }
}

// Create the main window
async function createMainWindow() {
  console.log('createMainWindow called');
  const config = getConfig();

  console.log('Creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false
  });
  console.log('BrowserWindow created');

  // Load the app
  const serverPort = config.server.port || 3456;
  console.log('Loading URL: http://localhost:' + serverPort);
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Show dev tools for debugging
  console.log('Opening dev tools for debugging');
  mainWindow.webContents.openDevTools();

  // Show window immediately for debugging
  console.log('Showing window immediately for debugging');
  mainWindow.show();

  // Also listen to ready-to-show
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show event fired');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

// Start the Express server with configuration
function startServer() {
  const config = getConfig();
  const fs = require('fs');
  const debugLog = path.join(app.getPath('userData'), 'startup-debug.log');

  function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(debugLog, logMsg);
    // Don't call console.log here - causes infinite recursion
  }

  log('=== SERVER STARTUP DEBUG ===');
  log('__dirname: ' + __dirname);
  log('app.getPath(userData): ' + app.getPath('userData'));
  log('Config: ' + JSON.stringify(config, null, 2));

  // Server code stays in ASAR for proper module resolution
  const serverPath = path.join(__dirname, '../../dist/src/server/index.js');

  log('Calculated server path: ' + serverPath);
  log('Server file exists: ' + require('fs').existsSync(serverPath));

  if (!require('fs').existsSync(serverPath)) {
    log('ERROR: Server file does not exist!');
    log('Checking alternative paths...');
    const alt1 = path.join(__dirname, '../../dist/src/server/index.js');
    const alt2 = path.join(process.resourcesPath, 'app.asar.unpacked/dist/src/server/index.js');
    log('Alt 1: ' + alt1 + ' exists: ' + require('fs').existsSync(alt1));
    log('Alt 2: ' + alt2 + ' exists: ' + require('fs').existsSync(alt2));

    dialog.showErrorBox('Server Error', 'Server file not found!\n\nDebug log: ' + debugLog);
    app.quit();
    return;
  }

  // Set environment variables based on configuration
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: config.server.port,
    HOST: config.server.host,
    DB_PATH: config.database.location || app.getPath('userData'),
    DB_FILENAME: config.database.filename,
    DB_BACKUP_ENABLED: config.database.autoBackup,
    DB_BACKUP_INTERVAL: config.database.backupInterval,
    DB_BACKUP_RETENTION: config.database.backupRetention,
    LOG_LEVEL: config.advanced.logLevel || 'debug',
    LOG_DIRECTORY: app.getPath('userData'),  // Write logs to userData directory
    ENABLE_TEST_LOGS: 'true',  // Force console logging even in production
    MAX_DB_CONNECTIONS: config.advanced.maxConnections,
    ENABLE_CACHE: config.advanced.enableCache,
    COMPRESS_RESPONSES: config.advanced.compressResponses,
    REQUIRE_AUTH: config.server.requireAuth
  };

  log('Starting server with node: ' + process.execPath);
  log('Debug log location: ' + debugLog);

  log('Starting server in same process instead of spawning...');

  // Set environment variables for the server
  log('Setting environment variables...');
  Object.keys(env).forEach(key => {
    process.env[key] = env[key];
  });
  log('Environment variables set');

  // Intercept process.exit to prevent server from killing Electron
  log('Setting up process.exit intercept...');
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  let exitIntercepted = false;
  let lastErrors = [];

  // Capture console.error calls to log them
  console.error = function(...args) {
    const errorMsg = args.map(a => String(a)).join(' ');
    log('[CONSOLE.ERROR] ' + errorMsg);
    lastErrors.push(errorMsg);
    if (lastErrors.length > 20) lastErrors.shift();
    originalConsoleError.apply(console, args);
  };

  // Capture console.log calls too (Winston logger uses console.log for all levels!)
  let captureAllLogs = true;  // Capture everything for first 5 seconds
  setTimeout(() => { captureAllLogs = false; }, 5000);

  console.log = function(...args) {
    const logMsg = args.map(a => String(a)).join(' ');

    // During startup, capture everything
    if (captureAllLogs) {
      log('[CONSOLE.LOG] ' + logMsg);
      // Store error-related logs for the dialog
      if (logMsg.includes('❌') || logMsg.includes('ERROR') || logMsg.includes('Failed') || logMsg.includes('error')) {
        lastErrors.push(logMsg);
        if (lastErrors.length > 20) lastErrors.shift();
      }
    }
    originalConsoleLog.apply(console, args);
  };

  process.exit = function(code) {
    if (!exitIntercepted) {
      exitIntercepted = true;

      // Capture stack trace to see where exit was called from
      const stack = new Error().stack;
      log('Server attempted to call process.exit(' + code + ') - intercepted!');
      log('Call stack:');
      log(stack);
      log('');
      log('Recent errors before exit:');
      lastErrors.forEach(err => log('  ' + err));
      log('Check debug log for details: ' + debugLog);

      // Restore original console.error
      console.error = originalConsoleError;
      console.log = originalConsoleLog;

      // Show error dialog with captured errors
      const errorMsg = lastErrors.length > 0
        ? 'Server startup failed with errors:\n\n' + lastErrors.join('\n\n')
        : 'Server startup failed with exit code: ' + code + '\n\nNo console errors captured.\n\nCheck debug log:\n' + debugLog;

      dialog.showErrorBox('Server Startup Failed', errorMsg);

      // Restore original process.exit but DON'T call it - keep app running for debugging
      process.exit = originalExit;
      // Don't quit - let the app stay open so we can inspect
      // app.quit();
      return;
    }
    originalExit.call(process, code);
  };
  // Capture unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    log('[UNHANDLED REJECTION] ' + String(reason));
    if (reason && typeof reason === 'object' && reason.stack) {
      log('[UNHANDLED REJECTION STACK] ' + reason.stack);
    }
    lastErrors.push('Unhandled Promise Rejection: ' + String(reason));
  });

  // Capture uncaught exceptions
  process.on('uncaughtException', (error) => {
    log('[UNCAUGHT EXCEPTION] ' + error.message);
    log('[UNCAUGHT EXCEPTION STACK] ' + error.stack);
    lastErrors.push('Uncaught Exception: ' + error.message);
  });

  log('process.exit intercept configured');

  try {
    // Import and start the server in the same process
    log('About to require server module from: ' + serverPath);
    log('Calling require() now...');
    require(serverPath);
    log('require() returned successfully');
    log('Server module loaded successfully');

    // Restore original process.exit after server starts
    setTimeout(() => {
      if (!exitIntercepted) {
        process.exit = originalExit;
        log('Server started successfully, process.exit restored');
      }
    }, 3000);
  } catch (error) {
    log('Error loading server module: ' + error.message);
    log('Error stack: ' + error.stack);
    process.exit = originalExit;
    dialog.showErrorBox('Server Error', 'Failed to load server module.\n\n' + error.message + '\n\nDebug log: ' + debugLog);
    app.quit();
    return;
  }

  // Note: We're not using spawn anymore, so serverProcess is not needed
  serverProcess = null;
  log('Server module require completed');

  // Server is now running in the same process, no need for process event handlers
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const { createSettingsWindow } = require('./settings-window-main.cjs');
            createSettingsWindow(mainWindow);
          }
        },
        { type: 'separator' },
        {
          label: 'Import Excel',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.send('menu-import-excel');
          }
        },
        {
          label: 'Export to Excel',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-export-excel');
          }
        },
        { type: 'separator' },
        {
          label: 'Backup Database',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              defaultPath: `capacinator-backup-${new Date().toISOString().split('T')[0]}.db`,
              filters: [{ name: 'Database Files', extensions: ['db'] }]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('menu-backup-database', result.filePath);
            }
          }
        },
        {
          label: 'Restore Database',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'Database Files', extensions: ['db'] }],
              properties: ['openFile']
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu-restore-database', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            const config = getConfig();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Capacinator',
              message: 'Capacinator',
              detail: `Project Capacity Planning Tool\nVersion: 1.0.0\n\nServer Port: ${config.server.port}\nDatabase: ${config.database.filename}`,
              buttons: ['OK']
            });
          }
        },
        {
          label: 'User Guide',
          click: () => {
            shell.openExternal('https://github.com/steiner385/Capacinator/wiki');
          }
        },
        { type: 'separator' },
        {
          label: 'Reset Settings',
          click: async () => {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Reset Settings',
              message: 'Are you sure you want to reset all settings?',
              detail: 'This will close the application and show the setup wizard on next launch.',
              buttons: ['Cancel', 'Reset'],
              defaultId: 0,
              cancelId: 0
            });
            
            if (result.response === 1) {
              const { appStore } = require('./setup-wizard-main.cjs');
              appStore.clear();
              app.relaunch();
              app.quit();
            }
          }
        }
      ]
    }
  ];

  // Add dev tools option if enabled
  const config = getConfig();
  if (config.advanced.enableDevTools) {
    template[2].submenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools' }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
// Initialize Git repository on startup
// Task: T037
async function initializeGitRepository() {
  // Check if Git sync feature is enabled
  if (process.env.ENABLE_GIT_SYNC !== 'true') {
    console.log('Git sync disabled, skipping repository initialization');
    return;
  }

  console.log('Initializing Git repository...');

  try {
    // Check if credentials exist
    if (!hasGitCredential()) {
      console.log('No Git credentials found, skipping repository initialization');
      return;
    }

    const credentials = getGitCredential();
    const repoPath = process.env.GIT_REPO_PATH || path.join(os.homedir(), '.capacinator', 'git-repo');

    // Import GitRepositoryService (requires TypeScript compilation)
    // For now, we'll use a simpler approach via IPC to the server
    console.log('Git repository path:', repoPath);
    console.log('Repository URL:', credentials?.repositoryUrl);
    console.log('✅ Git repository initialization ready');
  } catch (error) {
    console.error('⚠️  Git repository initialization failed:', error.message);
    // Don't fail app startup on Git errors
  }
}

app.whenReady().then(async () => {
  // Run setup if needed
  await checkAndRunSetup();

  if (setupCompleted) {
    // Initialize Git repository (Feature: 001-git-sync-integration)
    await initializeGitRepository();

    // Start server with configuration
    startServer();

    console.log('Server startup completed, waiting 2 seconds before creating main window...');

    // Wait a moment for server to start
    setTimeout(() => {
      console.log('Creating main window now...');
      try {
        createMainWindow();
        console.log('Main window creation initiated');
      } catch (error) {
        console.error('Error creating main window:', error);
        dialog.showErrorBox('Window Error', 'Failed to create main window:\n\n' + error.message);
      }
    }, 2000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && setupCompleted) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  // Server runs in the same process now, so no cleanup needed
  console.log('Application quitting...');
});

// IPC handlers
ipcMain.handle('get-app-config', () => {
  return getConfig();
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Settings window IPC handlers
ipcMain.handle('save-config', async (event, config) => {
  const { appStore } = require('./setup-wizard-main.cjs');
  appStore.set(config);
  return true;
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result.response;
});

ipcMain.on('show-error-box', (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.on('restart-app', () => {
  app.relaunch();
  app.quit();
});

// Database operations
ipcMain.handle('get-database-size', async () => {
  const fs = require('fs');
  const config = getConfig();
  const dbPath = path.join(config.database.location, config.database.filename);
  try {
    const stats = await fs.promises.stat(dbPath);
    return stats.size;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('optimize-database', async () => {
  // This would be implemented with actual database optimization
  // For SQLite, this could be VACUUM command
  return true;
});

ipcMain.handle('backup-database', async () => {
  const fs = require('fs');
  const Database = require('better-sqlite3');
  const config = getConfig();
  // IP-08a 返工(2026-10-16): config.database.location / config.backup.location
  // 并不存在——旧 path.join(undefined, ...) 必炸 TypeError。服务端与主进程
  // 同进程运行,knexfile 的 getDataPath 在 production 下走 app.getPath('userData'),
  // 与服务端备份调度同规则:userData + filename,备份落 userData/backups
  const dbPath = path.join(app.getPath('userData'), config.database.filename);
  const backupPath = path.join(app.getPath('userData'), 'backups', `backup-${Date.now()}.db`);

  await fs.promises.mkdir(path.dirname(backupPath), { recursive: true });
  // IP-08a/S02: 在线一致性备份(VACUUM INTO)——直接 copyFile 会丢 WAL 中
  // 已提交未 checkpoint 的事务(前轮已复现)
  const src = new Database(dbPath, { readonly: true });
  try {
    src.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    src.close();
  }

  const { appStore } = require('./setup-wizard-main.cjs');
  appStore.set('lastBackupTime', Date.now());
  return true;
});

ipcMain.handle('get-last-backup-time', () => {
  const { appStore } = require('./setup-wizard-main.cjs');
  return appStore.get('lastBackupTime');
});

// Git Sync operations (Feature: 001-git-sync-integration, Task: T089)
ipcMain.handle('git-branch-switched', async (event, branchName) => {
  // This is called when the frontend switches branches
  // We need to rebuild the SQLite cache from the new branch's JSON files
  console.log(`Branch switched to: ${branchName}, requesting server restart to reload cache`);

  // Note: The server will automatically rebuild cache on startup if GIT_SYNC_AUTO_PULL_ON_STARTUP is true
  // For immediate effect, we restart the server process
  if (serverProcess) {
    serverProcess.kill();
    // Wait a moment for process to die
    await new Promise(resolve => setTimeout(resolve, 1000));
    startServer();
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return { success: true };
});

// File operations
ipcMain.handle('open-path', async (event, path) => {
  shell.openPath(path);
});

// Cache operations
ipcMain.handle('clear-cache', async () => {
  // Clear any application cache
  const session = mainWindow.webContents.session;
  await session.clearCache();
  return true;
});

// Settings operations
ipcMain.handle('reset-settings', async () => {
  const { appStore } = require('./setup-wizard-main.cjs');
  appStore.clear();
  app.relaunch();
  app.quit();
});