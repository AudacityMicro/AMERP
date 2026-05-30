const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { autoUpdater } = require("electron-updater");

const { ERPBackend } = require("./backend/erp.cjs");
const { resolveInside } = require("./backend/utils.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "amerp",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let mainWindow = null;
let backend = null;
let pendingDeepLink = null;
let updateOperation = null;

const GITHUB_RELEASES_URL = "https://github.com/AudacityMicro/AMERP/releases";
const SMOKE_TEST_AUTO_EXIT_MS = Number.isInteger(Number(process.env.AMERP_SMOKE_TEST_EXIT_AFTER_MS))
  ? Math.max(0, Number(process.env.AMERP_SMOKE_TEST_EXIT_AFTER_MS))
  : 0;

if (process.platform === "win32") {
  app.setAppUserModelId("com.audacitymicro.amerp");
}

function parseDeepLink(value) {
  if (!value || typeof value !== "string" || !value.toLowerCase().startsWith("amerp://")) {
    return null;
  }
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    if (url.hostname === "open" && segments[0] === "kanban" && segments[1]) {
      return { entity: "kanban", id: segments[1], url: value };
    }
    if (url.hostname === "open" && segments[0] === "material" && segments[1]) {
      return { entity: "material", id: segments[1], url: value };
    }
    return null;
  } catch {
    return null;
  }
}

function extractDeepLink(argv = []) {
  for (const value of argv) {
    const parsed = parseDeepLink(value);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function deliverDeepLink(payload) {
  if (!payload) {
    return;
  }
  pendingDeepLink = payload;
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("amerp-deep-link", pendingDeepLink);
    pendingDeepLink = null;
  };
  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function registerDeepLinkProtocol() {
  if (process.platform === "win32" && process.defaultApp) {
    const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
    if (entry) {
      app.setAsDefaultProtocolClient("amerp", process.execPath, [entry]);
      return;
    }
  }
  app.setAsDefaultProtocolClient("amerp");
}

function resolvePythonPath() {
  if (process.env.CODEX_PYTHON) {
    return process.env.CODEX_PYTHON;
  }
  const codexPython = "C:\\Users\\AJ\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
  if (fs.existsSync(codexPython)) {
    return codexPython;
  }
  return "python";
}

function configureUserDataOverride() {
  if (!process.env.AMERP_USER_DATA_FOLDER) {
    return;
  }
  app.setPath("userData", path.resolve(process.env.AMERP_USER_DATA_FOLDER));
}

configureUserDataOverride();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function requireText(value, label, { maxLength = 250, allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  if (!allowEmpty && !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  if (value.includes("\0") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} contains invalid characters.`);
  }
  return value;
}

function requireId(value, label = "ID") {
  const text = requireText(value, label, { maxLength: 250 });
  if (text.includes("/") || text.includes("\\") || text.includes("..")) {
    throw new Error(`${label} is not a valid record identifier.`);
  }
  return text;
}

function requireOptionalPath(value, label = "path") {
  if (value == null || value === "") {
    return value;
  }
  return requireText(value, label, { maxLength: 2000 });
}

function requireOptionalFilePathArray(value, label = "file paths") {
  if (value == null) {
    return value;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list of file paths.`);
  }
  if (value.length > 100) {
    throw new Error(`${label} contains too many files.`);
  }
  for (const [index, filePath] of value.entries()) {
    requireOptionalPath(filePath, `${label}[${index}]`);
  }
  return value;
}

function requireOptionalObject(value, label = "options", { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (value == null) {
    return value;
  }
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
  if (jsonSize(value) > maxBytes) {
    throw new Error(`${label} is too large.`);
  }
  return value;
}

function requireRecord(value, label = "record") {
  return requireOptionalObject(value, label);
}

function requireUrl(value, label = "URL") {
  const text = requireText(value, label, { maxLength: 4000 });
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }
  return text;
}

function requireUrlArray(value, label = "URLs") {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list of URLs.`);
  }
  if (value.length > 50) {
    throw new Error(`${label} contains too many URLs.`);
  }
  return value.map((item, index) => requireUrl(item, `${label}[${index}]`));
}

function requireIdArray(value, label = "IDs") {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list of IDs.`);
  }
  if (value.length > 200) {
    throw new Error(`${label} contains too many IDs.`);
  }
  return value.map((item, index) => requireId(item, `${label}[${index}]`));
}

function requireNonNegativeInteger(value, label = "value") {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireBoolean(value, label = "value") {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be true or false.`);
  }
  return value;
}

const IPC_ARG_RULES = {
  "save-preferences": [requireRecord],
  "create-backup": [requireOptionalObject],
  "list-backups": [requireOptionalObject],
  "restore-backup": [requireOptionalPath],
  "run-automatic-backup-if-due": [requireOptionalObject],
  "list-employees": [requireOptionalObject],
  "load-employee": [requireId],
  "save-employee": [requireRecord],
  "archive-employee": [requireId],
  "unarchive-employee": [requireId],
  "clock-in-employee": [requireId],
  "clock-out-employee": [requireId],
  "list-time-clock-sessions": [requireOptionalObject],
  "correct-time-clock-session": [requireId, requireRecord, (value) => requireText(value, "correction reason", { maxLength: 1000 })],
  "mark-time-clock-sessions-paid": [requireIdArray, requireBoolean],
  "delete-time-clock-session": [requireId, (value) => requireText(value, "delete reason", { maxLength: 1000 })],
  "get-time-clock-dashboard": [requireOptionalObject],
  "list-nonconformances": [requireOptionalObject],
  "load-nonconformance": [requireId, requireOptionalObject],
  "save-nonconformance": [requireRecord],
  "archive-nonconformance": [requireId],
  "unarchive-nonconformance": [requireId],
  "delete-nonconformance": [requireId],
  "export-nonconformance-pdf": [requireId, requireOptionalPath],
  "export-nonconformances-csv": [requireOptionalObject, requireOptionalPath],
  "choose-nonconformance-attachments": [requireId],
  "open-nonconformance-attachment": [requireId, requireId],
  "open-nonconformance-attachment-revision": [requireId, requireId, requireNonNegativeInteger],
  "archive-nonconformance-attachment": [requireId, requireId],
  "unarchive-nonconformance-attachment": [requireId, requireId],
  "revise-nonconformance-attachment": [requireId, requireId],
  "delete-nonconformance-attachment": [requireId, requireId],
  "load-kanban-card": [requireId, requireOptionalObject],
  "save-kanban-card": [requireRecord],
  "archive-kanban-card": [requireId],
  "unarchive-kanban-card": [requireId],
  "delete-kanban-card": [requireId],
  "undo-kanban-import": [requireIdArray],
  "choose-kanban-photo": [(value) => (value == null || value === "" ? value : requireId(value, "card ID"))],
  "import-kanban-from-url": [requireUrl],
  "import-kanban-from-urls": [requireUrlArray],
  "import-kanban-urls-from-csv": [requireOptionalFilePathArray],
  "import-kanban-cards-from-csv": [requireOptionalFilePathArray],
  "import-kanban-fusion-tool-library": [requireOptionalFilePathArray],
  "ai-fill-kanban-card": [requireRecord],
  "generate-kanban-image": [requireRecord],
  "export-kanban-pdf": [requireId, requireOptionalPath, (value) => (value == null || value === "" ? value : requireId(value, "size ID")), requireOptionalObject],
  "export-material-pdf": [requireId, requireOptionalPath, (value) => (value == null || value === "" ? value : requireId(value, "size ID")), requireOptionalObject],
  "save-customer": [requireRecord],
  "load-job": [requireId, requireOptionalObject],
  "save-job": [requireRecord],
  "archive-job": [requireId],
  "unarchive-job": [requireId],
  "delete-job": [requireId],
  "import-subtract-purchase-orders": [requireOptionalFilePathArray],
  "import-xometry-purchase-orders": [requireOptionalFilePathArray],
  "import-xometry-travelers": [requireId, requireOptionalFilePathArray],
  "choose-job-documents": [requireId],
  "choose-part-documents": [requireId, requireId],
  "open-job-document": [requireId, requireId],
  "open-part-document": [requireId, requireId, requireId],
  "open-job-document-revision": [requireId, requireId, requireNonNegativeInteger],
  "open-part-document-revision": [requireId, requireId, requireId, requireNonNegativeInteger],
  "archive-job-document": [requireId, requireId],
  "archive-part-document": [requireId, requireId, requireId],
  "unarchive-job-document": [requireId, requireId],
  "unarchive-part-document": [requireId, requireId, requireId],
  "delete-job-document": [requireId, requireId],
  "delete-part-document": [requireId, requireId, requireId],
  "revise-job-document": [requireId, requireId],
  "revise-part-document": [requireId, requireId, requireId],
  "choose-operation-images": [requireId, requireId, requireId],
  "export-job-pdf": [requireId, requireOptionalPath],
  "save-part-inspection": [requireId, requireId, requireRecord],
  "extract-part-inspection-from-drawing": [requireId, requireId, requireOptionalObject],
  "generate-part-ballooned-drawing-pdf": [requireId, requireId, requireId],
  "export-part-inspection-pdf": [requireId, requireId, requireOptionalPath, (value) => (value == null || value === "" ? value : requireId(value, "report ID")), requireOptionalObject],
  "load-material": [requireId, requireOptionalObject],
  "save-material": [requireRecord],
  "archive-material": [requireId],
  "choose-material-attachments": [requireId],
  "open-material-attachment": [requireId, requireId],
  "open-material-attachment-revision": [requireId, requireId, requireNonNegativeInteger],
  "archive-material-attachment": [requireId, requireId],
  "unarchive-material-attachment": [requireId, requireId],
  "revise-material-attachment": [requireId, requireId],
  "delete-material-attachment": [requireId, requireId],
  "load-instrument": [requireId, requireOptionalObject],
  "save-instrument": [requireRecord],
  "archive-instrument": [requireId],
  "save-standard": [requireRecord],
  "save-library": [requireRecord],
  "delete-library": [requireId],
  "save-template": [requireRecord],
  "delete-template": [requireId],
  "acquire-lock": [requireId, requireId, requireOptionalPath],
  "release-lock": [requireId, requireId],
  "read-audit-log": [(value) => (value == null ? value : requireNonNegativeInteger(value, "audit log limit"))]
};

function validateIpcArgs(channel, args) {
  const rules = IPC_ARG_RULES[channel] || [];
  if (rules.length && args.length > rules.length) {
    throw new Error(`${channel} received too many arguments.`);
  }
  for (let index = 0; index < rules.length; index += 1) {
    if (rules[index]) {
      rules[index](args[index], `${channel} argument ${index + 1}`);
    }
  }
  for (const [index, arg] of args.entries()) {
    if (typeof arg === "string") {
      requireText(arg, `${channel} argument ${index + 1}`, { maxLength: 10000, allowEmpty: true });
    } else if (arg && typeof arg === "object" && jsonSize(arg) > 5 * 1024 * 1024) {
      throw new Error(`${channel} argument ${index + 1} is too large.`);
    }
  }
}

function registerIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    validateIpcArgs(channel, args);
    return handler(event, ...args);
  });
}

function showNativeMessage(options) {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  return dialog.showMessageBox(owner, options);
}

function truncateText(value, maxLength = 1800) {
  const text = Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" ? entry : entry?.note || entry?.version || "")).filter(Boolean).join("\n")
    : String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function updateSummary(updateInfo) {
  const releaseNotes = truncateText(updateInfo?.releaseNotes || updateInfo?.releaseName || "No release notes were provided.");
  return [
    `Current version: ${app.getVersion()}`,
    `Available version: ${updateInfo?.version || "Unknown"}`,
    "",
    releaseNotes
  ].join("\n");
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = true;
}

async function openReleaseDownloadPage() {
  await shell.openExternal(GITHUB_RELEASES_URL);
}

async function downloadAndInstallUpdate(updateInfo) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(2);
  }
  const progressHandler = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, Number(progress.percent || 0) / 100)));
    }
  };
  autoUpdater.on("download-progress", progressHandler);
  try {
    await autoUpdater.downloadUpdate();
  } finally {
    autoUpdater.off("download-progress", progressHandler);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
  }

  const result = await showNativeMessage({
    type: "info",
    buttons: ["Install and Restart", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "AMERP Update Downloaded",
    message: `AMERP ${updateInfo?.version || ""} is ready to install.`,
    detail: "Installation only starts if you choose Install and Restart."
  });
  if (result.response === 0) {
    autoUpdater.quitAndInstall(false, true);
  }
}

async function runUpdateCheck() {
  if (!app.isPackaged) {
    await showNativeMessage({
      type: "info",
      buttons: ["OK"],
      title: "AMERP Updates",
      message: "Packaged updates are only available in installed release builds.",
      detail: "Developer/source installs should update by pulling the repository and rebuilding with the existing install scripts."
    });
    return;
  }

  configureAutoUpdater();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setProgressBar(2);
  }

  let checkResult;
  try {
    checkResult = await autoUpdater.checkForUpdates();
  } finally {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
  }

  const updateInfo = checkResult?.updateInfo || {};
  if (!updateInfo.version || updateInfo.version === app.getVersion()) {
    await showNativeMessage({
      type: "info",
      buttons: ["OK"],
      title: "AMERP Updates",
      message: "AMERP is up to date.",
      detail: `Installed version: ${app.getVersion()}`
    });
    return;
  }

  if (process.platform === "darwin") {
    const result = await showNativeMessage({
      type: "info",
      buttons: ["Open Release Page", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      title: "AMERP Update Available",
      message: `AMERP ${updateInfo.version} is available.`,
      detail: [
        "This macOS beta is unsigned, so automatic installation is disabled.",
        "Open the GitHub release page to download the latest DMG/ZIP manually.",
        "",
        updateSummary(updateInfo)
      ].join("\n")
    });
    if (result.response === 0) {
      await openReleaseDownloadPage();
    }
    return;
  }

  const result = await showNativeMessage({
    type: "info",
    buttons: ["Download and Install", "Open Release Page", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "AMERP Update Available",
    message: `AMERP ${updateInfo.version} is available.`,
    detail: updateSummary(updateInfo)
  });

  if (result.response === 1) {
    await openReleaseDownloadPage();
    return;
  }
  if (result.response !== 0) {
    return;
  }

  try {
    await downloadAndInstallUpdate(updateInfo);
  } catch (error) {
    const fallback = await showNativeMessage({
      type: "error",
      buttons: ["Open Release Page", "OK"],
      defaultId: 0,
      cancelId: 1,
      title: "AMERP Update Failed",
      message: "The update could not be downloaded or installed automatically.",
      detail: `${error?.message || error}\n\nYou can still download the installer manually from GitHub.`
    });
    if (fallback.response === 0) {
      await openReleaseDownloadPage();
    }
  }
}

function checkForUpdatesFromMenu() {
  if (updateOperation) {
    showNativeMessage({
      type: "info",
      buttons: ["OK"],
      title: "AMERP Updates",
      message: "An update check is already running."
    }).catch(() => {});
    return;
  }
  updateOperation = runUpdateCheck()
    .catch((error) => showNativeMessage({
      type: "error",
      buttons: ["Open Release Page", "OK"],
      defaultId: 0,
      cancelId: 1,
      title: "AMERP Update Check Failed",
      message: "AMERP could not check for updates.",
      detail: `${error?.message || error}\n\nIf needed, open the GitHub release page and download the installer manually.`
    }).then((result) => {
      if (result.response === 0) {
        return openReleaseDownloadPage();
      }
      return null;
    }))
    .finally(() => {
      updateOperation = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
      }
    });
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : []),
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" }
        ] : [
          { role: "close" }
        ])
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates...",
          click: checkForUpdatesFromMenu
        },
        {
          label: "Open AMERP Releases",
          click: () => {
            openReleaseDownloadPage().catch(() => {});
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(windowTitle = "AMERP", iconPath = "") {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    title: windowTitle,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[browser] did-fail-load ${errorCode} ${errorDescription} ${validatedUrl || ""}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[browser] render-process-gone", details);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingDeepLink) {
      deliverDeepLink(pendingDeepLink);
    }
    if (SMOKE_TEST_AUTO_EXIT_MS > 0) {
      setTimeout(() => {
        if (!app.isQuitting) {
          app.quit();
        }
      }, SMOKE_TEST_AUTO_EXIT_MS).unref?.();
    }
  });
}

app.whenReady().then(async () => {
  registerDeepLinkProtocol();
  backend = new ERPBackend({
    app,
    devServerUrl: process.env.VITE_DEV_SERVER_URL || "",
    pythonPath: resolvePythonPath()
  });

  protocol.handle("amerp", async (request) => {
    const dataRoot = await backend.requireDataFolder();
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const targetPath = resolveInside(dataRoot, relativePath);
    return net.fetch(pathToFileURL(targetPath).toString());
  });

  registerIpc("select-data-folder", () => backend.selectDataFolder(mainWindow));
  registerIpc("get-data-folder", () => backend.getDataFolder());
  registerIpc("load-workspace", () => backend.loadWorkspace());
  registerIpc("choose-brand-icon", () => backend.chooseBrandIcon(mainWindow));
  registerIpc("choose-backup-folder", () => backend.chooseBackupFolder(mainWindow));
  registerIpc("list-backups", (_event, options) => backend.listBackups(options || {}));
  registerIpc("create-backup", (_event, options) => backend.createBackup(options || {}));
  registerIpc("restore-backup", (_event, backupPath) => backend.restoreBackup(backupPath));
  registerIpc("run-automatic-backup-if-due", (_event, options) => backend.runAutomaticBackupIfDue(options || {}));
  registerIpc("save-preferences", async (_event, preferences) => {
    const saved = await backend.savePreferences(preferences);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(String(saved.windowTitle || saved.appTitle || "AMERP"));
      if (saved.appIconPath) {
        mainWindow.setIcon(saved.appIconPath);
      }
    }
    try {
      await backend.syncDesktopShortcut(saved);
    } catch (error) {
      console.warn(`Unable to update desktop shortcut icon: ${error.message}`);
    }
    return saved;
  });

  registerIpc("list-jobs", () => backend.listJobSummaries());
  registerIpc("list-employees", (_event, options) => backend.listEmployees(options || {}));
  registerIpc("load-employee", (_event, id) => backend.loadEmployee(id));
  registerIpc("save-employee", (_event, employee) => backend.saveEmployee(employee));
  registerIpc("archive-employee", (_event, id) => backend.archiveEmployee(id));
  registerIpc("unarchive-employee", (_event, id) => backend.unarchiveEmployee(id));
  registerIpc("clock-in-employee", (_event, id) => backend.clockInEmployee(id));
  registerIpc("clock-out-employee", (_event, id) => backend.clockOutEmployee(id));
  registerIpc("list-time-clock-sessions", (_event, filters) => backend.listTimeClockSessions(filters || {}));
  registerIpc("correct-time-clock-session", (_event, sessionId, patch, reason) => backend.correctTimeClockSession(sessionId, patch || {}, reason));
  registerIpc("mark-time-clock-sessions-paid", (_event, sessionIds, paid) => backend.markTimeClockSessionsPaid(sessionIds, paid));
  registerIpc("delete-time-clock-session", (_event, sessionId, reason) => backend.deleteTimeClockSession(sessionId, reason));
  registerIpc("get-time-clock-dashboard", (_event, filters) => backend.getTimeClockDashboard(filters || {}));
  registerIpc("list-nonconformances", (_event, filters) => backend.listNonconformances(filters || {}));
  registerIpc("load-nonconformance", (_event, id, options) => backend.loadNonconformance(id, options || {}));
  registerIpc("save-nonconformance", (_event, record) => backend.saveNonconformance(record));
  registerIpc("archive-nonconformance", (_event, id) => backend.archiveNonconformance(id));
  registerIpc("unarchive-nonconformance", (_event, id) => backend.unarchiveNonconformance(id));
  registerIpc("delete-nonconformance", (_event, id) => backend.deleteNonconformance(id));
  registerIpc("export-nonconformance-pdf", (_event, id, destinationPath) => backend.exportNonconformancePdf(id, destinationPath));
  registerIpc("export-nonconformances-csv", (_event, filters, destinationPath) => backend.exportNonconformancesCsv(filters || {}, destinationPath));
  registerIpc("choose-nonconformance-attachments", (_event, id) => backend.chooseNonconformanceAttachments(id, mainWindow));
  registerIpc("open-nonconformance-attachment", (_event, id, attachmentId) => backend.openNonconformanceAttachment(id, attachmentId));
  registerIpc("open-nonconformance-attachment-revision", (_event, id, attachmentId, revisionIndex) => backend.openNonconformanceAttachmentRevision(id, attachmentId, revisionIndex));
  registerIpc("archive-nonconformance-attachment", (_event, id, attachmentId) => backend.archiveNonconformanceAttachment(id, attachmentId));
  registerIpc("unarchive-nonconformance-attachment", (_event, id, attachmentId) => backend.unarchiveNonconformanceAttachment(id, attachmentId));
  registerIpc("revise-nonconformance-attachment", (_event, id, attachmentId) => backend.reviseNonconformanceAttachment(id, attachmentId, mainWindow));
  registerIpc("delete-nonconformance-attachment", (_event, id, attachmentId) => backend.deleteNonconformanceAttachment(id, attachmentId));
  registerIpc("generate-next-nonconformance-number", () => backend.generateNextNonconformanceNumber());
  registerIpc("list-kanban-cards", () => backend.listKanbanCards());
  registerIpc("load-kanban-card", (_event, id, options) => backend.loadKanbanCard(id, options || {}));
  registerIpc("save-kanban-card", (_event, card) => backend.saveKanbanCard(card));
  registerIpc("archive-kanban-card", (_event, id) => backend.archiveKanbanCard(id));
  registerIpc("unarchive-kanban-card", (_event, id) => backend.unarchiveKanbanCard(id));
  registerIpc("delete-kanban-card", (_event, id) => backend.deleteKanbanCard(id));
  registerIpc("undo-kanban-import", (_event, cardIds) => backend.undoKanbanImport(cardIds));
  registerIpc("choose-kanban-photo", (_event, cardId) => backend.chooseKanbanPhoto(cardId, mainWindow));
  registerIpc("import-kanban-from-url", (_event, url) => backend.importKanbanFromUrl(url));
  registerIpc("import-kanban-from-urls", (_event, urls) => backend.importKanbanFromUrls(urls));
  registerIpc("import-kanban-urls-from-csv", (_event, filePaths) => backend.importKanbanUrlsFromCsv(filePaths || null, mainWindow));
  registerIpc("import-kanban-cards-from-csv", (_event, filePaths) => backend.importKanbanCardsFromCsv(filePaths || null, mainWindow));
  registerIpc("import-kanban-fusion-tool-library", (_event, filePaths) => backend.importKanbanFusionToolLibrary(filePaths || null, mainWindow));
  registerIpc("ai-fill-kanban-card", (_event, card) => backend.aiFillKanbanCard(card));
  registerIpc("generate-kanban-image", (_event, card) => backend.generateKanbanImage(card));
  registerIpc("export-kanban-pdf", (_event, cardId, destinationPath, sizeId, options) => backend.exportKanbanPdf(cardId, destinationPath, sizeId, options));
  registerIpc("export-material-pdf", (_event, materialId, destinationPath, sizeId, options) => backend.exportMaterialPdf(materialId, destinationPath, sizeId, options));
  registerIpc("generate-next-job-number", () => backend.generateNextJobNumber());
  registerIpc("generate-next-kanban-inventory-number", () => backend.generateNextKanbanInventoryNumber());
  registerIpc("list-customers", () => backend.listCustomers());
  registerIpc("save-customer", (_event, customer) => backend.saveCustomer(customer));
  registerIpc("load-job", (_event, id, options) => backend.loadJob(id, options || {}));
  registerIpc("save-job", (_event, job) => backend.saveJob(job));
  registerIpc("archive-job", (_event, id) => backend.archiveJob(id));
  registerIpc("unarchive-job", (_event, id) => backend.unarchiveJob(id));
  registerIpc("delete-job", (_event, id) => backend.deleteJob(id));
  registerIpc("create-job-from-fusion", () => backend.createJobFromFusionImport(mainWindow));
  registerIpc("import-subtract-purchase-orders", (_event, filePaths) => backend.importSubtractPurchaseOrders(filePaths || null, mainWindow));
  registerIpc("import-xometry-purchase-orders", (_event, filePaths) => backend.importXometryPurchaseOrders(filePaths || null, mainWindow));
  registerIpc("import-xometry-travelers", (_event, jobId, filePaths) => backend.importXometryTravelers(jobId, filePaths || null, mainWindow));
registerIpc("choose-job-documents", (_event, jobId) => backend.chooseJobDocuments(jobId, mainWindow));
registerIpc("choose-part-documents", (_event, jobId, partId) => backend.choosePartDocuments(jobId, partId, mainWindow));
registerIpc("open-job-document", (_event, jobId, documentId) => backend.openJobDocument(jobId, documentId));
registerIpc("open-part-document", (_event, jobId, partId, documentId) => backend.openPartDocument(jobId, partId, documentId));
registerIpc("open-job-document-revision", (_event, jobId, documentId, revisionIndex) => backend.openJobDocumentRevision(jobId, documentId, revisionIndex));
registerIpc("open-part-document-revision", (_event, jobId, partId, documentId, revisionIndex) => backend.openPartDocumentRevision(jobId, partId, documentId, revisionIndex));
registerIpc("archive-job-document", (_event, jobId, documentId) => backend.archiveJobDocument(jobId, documentId));
registerIpc("archive-part-document", (_event, jobId, partId, documentId) => backend.archivePartDocument(jobId, partId, documentId));
registerIpc("unarchive-job-document", (_event, jobId, documentId) => backend.unarchiveJobDocument(jobId, documentId));
registerIpc("unarchive-part-document", (_event, jobId, partId, documentId) => backend.unarchivePartDocument(jobId, partId, documentId));
registerIpc("delete-job-document", (_event, jobId, documentId) => backend.deleteJobDocument(jobId, documentId));
registerIpc("delete-part-document", (_event, jobId, partId, documentId) => backend.deletePartDocument(jobId, partId, documentId));
registerIpc("revise-job-document", (_event, jobId, documentId) => backend.reviseJobDocument(jobId, documentId, mainWindow));
registerIpc("revise-part-document", (_event, jobId, partId, documentId) => backend.revisePartDocument(jobId, partId, documentId, mainWindow));
  registerIpc("choose-operation-images", (_event, jobId, partId, operationId) => backend.chooseOperationImages(jobId, partId, operationId, mainWindow));
  registerIpc("export-job-pdf", (_event, jobId, destinationPath) => backend.exportJobPdf(jobId, destinationPath));
  registerIpc("generate-next-inspection-report-number", () => backend.generateNextInspectionReportNumber());
  registerIpc("save-part-inspection", (_event, jobId, partId, inspection) => backend.savePartInspection(jobId, partId, inspection));
  registerIpc("extract-part-inspection-from-drawing", (_event, jobId, partId, source) => backend.extractPartInspectionFromDrawing(jobId, partId, source || {}, mainWindow));
  registerIpc("generate-part-ballooned-drawing-pdf", (_event, jobId, partId, drawingDocumentId) => backend.generatePartBalloonedDrawingPdf(jobId, partId, drawingDocumentId));
  registerIpc("export-part-inspection-pdf", (_event, jobId, partId, destinationPath, reportId, options) => backend.exportPartInspectionPdf(jobId, partId, destinationPath, reportId, options || {}));

  registerIpc("list-materials", () => backend.listMaterials());
  registerIpc("load-material", (_event, id, options) => backend.loadMaterial(id, options || {}));
  registerIpc("save-material", (_event, material) => backend.saveMaterial(material));
  registerIpc("archive-material", (_event, id) => backend.archiveMaterial(id));
  registerIpc("generate-material-serial", () => backend.generateMaterialSerial());
  registerIpc("choose-material-attachments", (_event, materialId) => backend.chooseMaterialAttachments(materialId, mainWindow));
  registerIpc("open-material-attachment", (_event, materialId, attachmentId) => backend.openMaterialAttachment(materialId, attachmentId));
  registerIpc("open-material-attachment-revision", (_event, materialId, attachmentId, revisionIndex) => backend.openMaterialAttachmentRevision(materialId, attachmentId, revisionIndex));
  registerIpc("archive-material-attachment", (_event, materialId, attachmentId) => backend.archiveMaterialAttachment(materialId, attachmentId));
  registerIpc("unarchive-material-attachment", (_event, materialId, attachmentId) => backend.unarchiveMaterialAttachment(materialId, attachmentId));
  registerIpc("revise-material-attachment", (_event, materialId, attachmentId) => backend.reviseMaterialAttachment(materialId, attachmentId, mainWindow));
  registerIpc("delete-material-attachment", (_event, materialId, attachmentId) => backend.deleteMaterialAttachment(materialId, attachmentId));

  registerIpc("list-instruments", () => backend.listInstruments());
  registerIpc("load-instrument", (_event, id, options) => backend.loadInstrument(id, options || {}));
  registerIpc("save-instrument", (_event, payload) => backend.saveInstrument(payload));
  registerIpc("archive-instrument", (_event, id) => backend.archiveInstrument(id));
  registerIpc("list-standards", () => backend.listStandards());
  registerIpc("save-standard", (_event, standard) => backend.saveStandard(standard));

  registerIpc("load-libraries", () => backend.loadLibraries());
  registerIpc("save-library", (_event, library) => backend.saveLibrary(library));
  registerIpc("delete-library", (_event, name) => backend.deleteLibrary(name));
  registerIpc("load-templates", () => backend.loadTemplates());
  registerIpc("save-template", (_event, template) => backend.saveTemplate(template));
  registerIpc("delete-template", (_event, id) => backend.deleteTemplate(id));

  registerIpc("import-legacy-setup", () => backend.importLegacySetupSheetData(mainWindow));
  registerIpc("import-legacy-materials", () => backend.importLegacyMaterialsData(mainWindow));
  registerIpc("import-legacy-metrology", () => backend.importLegacyMetrologyData(mainWindow));

  registerIpc("acquire-lock", (_event, kind, id, recordPath) => backend.acquireLock(kind, id, recordPath));
  registerIpc("release-lock", (_event, kind, id) => backend.releaseLock(kind, id));
  registerIpc("release-all-locks", () => backend.releaseAllLocksForCurrentOwner());
  registerIpc("rebuild-index", () => backend.rebuildIndex());
  registerIpc("read-audit-log", (_event, limit) => backend.readAuditLog(limit || 200));

  await backend.ensureDataFolderAtStartup(mainWindow);
  const preferences = await backend.loadPreferences();
  createWindow(
    String(preferences.windowTitle || preferences.appTitle || "AMERP"),
    String(preferences.appIconPath || "")
  );
  createApplicationMenu();
  pendingDeepLink = extractDeepLink(process.argv);
  if (pendingDeepLink) {
    deliverDeepLink(pendingDeepLink);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("second-instance", (_event, argv) => {
  const payload = extractDeepLink(argv);
  if (payload) {
    deliverDeepLink(payload);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  const payload = parseDeepLink(url);
  if (payload) {
    deliverDeepLink(payload);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  if (backend) {
    try {
      await backend.releaseAllLocksForCurrentOwner();
    } catch {
      // Ignore lock cleanup failures on shutdown.
    }
  }
});
