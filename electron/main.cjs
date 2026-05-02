const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    title: "AMERP",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  backend = new ERPBackend({
    app,
    devServerUrl: process.env.VITE_DEV_SERVER_URL || "",
    pythonPath: process.env.CODEX_PYTHON || "C:\\Users\\AJ\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe"
  });

  protocol.handle("amerp", async (request) => {
    const dataRoot = await backend.requireDataFolder();
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const targetPath = resolveInside(dataRoot, relativePath);
    return net.fetch(pathToFileURL(targetPath).toString());
  });

  ipcMain.handle("select-data-folder", () => backend.selectDataFolder(mainWindow));
  ipcMain.handle("get-data-folder", () => backend.getDataFolder());
  ipcMain.handle("load-workspace", () => backend.loadWorkspace());

  ipcMain.handle("list-jobs", () => backend.listJobSummaries());
  ipcMain.handle("load-job", (_event, id, options) => backend.loadJob(id, options || {}));
  ipcMain.handle("save-job", (_event, job) => backend.saveJob(job));
  ipcMain.handle("archive-job", (_event, id) => backend.archiveJob(id));
  ipcMain.handle("create-job-from-fusion", () => backend.createJobFromFusionImport(mainWindow));
  ipcMain.handle("choose-operation-images", (_event, jobId, partId, operationId) => backend.chooseOperationImages(jobId, partId, operationId, mainWindow));
  ipcMain.handle("export-job-pdf", (_event, jobId, destinationPath) => backend.exportJobPdf(jobId, destinationPath));

  ipcMain.handle("list-materials", () => backend.listMaterials());
  ipcMain.handle("load-material", (_event, id, options) => backend.loadMaterial(id, options || {}));
  ipcMain.handle("save-material", (_event, material) => backend.saveMaterial(material));
  ipcMain.handle("archive-material", (_event, id) => backend.archiveMaterial(id));
  ipcMain.handle("generate-material-serial", () => backend.generateMaterialSerial());
  ipcMain.handle("choose-material-attachments", (_event, materialId) => backend.chooseMaterialAttachments(materialId, mainWindow));

  ipcMain.handle("list-instruments", () => backend.listInstruments());
  ipcMain.handle("load-instrument", (_event, id, options) => backend.loadInstrument(id, options || {}));
  ipcMain.handle("save-instrument", (_event, payload) => backend.saveInstrument(payload));
  ipcMain.handle("archive-instrument", (_event, id) => backend.archiveInstrument(id));
  ipcMain.handle("list-standards", () => backend.listStandards());
  ipcMain.handle("save-standard", (_event, standard) => backend.saveStandard(standard));

  ipcMain.handle("load-libraries", () => backend.loadLibraries());
  ipcMain.handle("save-library", (_event, library) => backend.saveLibrary(library));
  ipcMain.handle("delete-library", (_event, name) => backend.deleteLibrary(name));
  ipcMain.handle("load-templates", () => backend.loadTemplates());
  ipcMain.handle("save-template", (_event, template) => backend.saveTemplate(template));
  ipcMain.handle("delete-template", (_event, id) => backend.deleteTemplate(id));

  ipcMain.handle("import-legacy-setup", () => backend.importLegacySetupSheetData(mainWindow));
  ipcMain.handle("import-legacy-materials", () => backend.importLegacyMaterialsData(mainWindow));
  ipcMain.handle("import-legacy-metrology", () => backend.importLegacyMetrologyData(mainWindow));

  ipcMain.handle("acquire-lock", (_event, kind, id, recordPath) => backend.acquireLock(kind, id, recordPath));
  ipcMain.handle("release-lock", (_event, kind, id) => backend.releaseLock(kind, id));
  ipcMain.handle("release-all-locks", () => backend.releaseAllLocksForCurrentOwner());
  ipcMain.handle("rebuild-index", () => backend.rebuildIndex());
  ipcMain.handle("read-audit-log", (_event, limit) => backend.readAuditLog(limit || 200));

  await backend.ensureDataFolderAtStartup(mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
