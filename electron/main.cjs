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
let pendingDeepLink = null;

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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
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
      sandbox: false
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
  });
}

app.whenReady().then(async () => {
  registerDeepLinkProtocol();
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
  ipcMain.handle("choose-brand-icon", () => backend.chooseBrandIcon(mainWindow));
  ipcMain.handle("save-preferences", async (_event, preferences) => {
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

  ipcMain.handle("list-jobs", () => backend.listJobSummaries());
  ipcMain.handle("list-kanban-cards", () => backend.listKanbanCards());
  ipcMain.handle("load-kanban-card", (_event, id, options) => backend.loadKanbanCard(id, options || {}));
  ipcMain.handle("save-kanban-card", (_event, card) => backend.saveKanbanCard(card));
  ipcMain.handle("archive-kanban-card", (_event, id) => backend.archiveKanbanCard(id));
  ipcMain.handle("unarchive-kanban-card", (_event, id) => backend.unarchiveKanbanCard(id));
  ipcMain.handle("delete-kanban-card", (_event, id) => backend.deleteKanbanCard(id));
  ipcMain.handle("choose-kanban-photo", (_event, cardId) => backend.chooseKanbanPhoto(cardId, mainWindow));
  ipcMain.handle("import-kanban-from-url", (_event, url) => backend.importKanbanFromUrl(url));
ipcMain.handle("ai-fill-kanban-card", (_event, card) => backend.aiFillKanbanCard(card));
ipcMain.handle("generate-kanban-image", (_event, card) => backend.generateKanbanImage(card));
ipcMain.handle("export-kanban-pdf", (_event, cardId, destinationPath, sizeId, options) => backend.exportKanbanPdf(cardId, destinationPath, sizeId, options));
  ipcMain.handle("export-material-pdf", (_event, materialId, destinationPath, sizeId, options) => backend.exportMaterialPdf(materialId, destinationPath, sizeId, options));
  ipcMain.handle("generate-next-job-number", () => backend.generateNextJobNumber());
  ipcMain.handle("generate-next-kanban-inventory-number", () => backend.generateNextKanbanInventoryNumber());
  ipcMain.handle("list-customers", () => backend.listCustomers());
  ipcMain.handle("save-customer", (_event, customer) => backend.saveCustomer(customer));
  ipcMain.handle("load-job", (_event, id, options) => backend.loadJob(id, options || {}));
  ipcMain.handle("save-job", (_event, job) => backend.saveJob(job));
  ipcMain.handle("archive-job", (_event, id) => backend.archiveJob(id));
  ipcMain.handle("unarchive-job", (_event, id) => backend.unarchiveJob(id));
  ipcMain.handle("delete-job", (_event, id) => backend.deleteJob(id));
  ipcMain.handle("create-job-from-fusion", () => backend.createJobFromFusionImport(mainWindow));
  ipcMain.handle("import-subtract-purchase-orders", (_event, filePaths) => backend.importSubtractPurchaseOrders(filePaths || null, mainWindow));
  ipcMain.handle("import-xometry-purchase-orders", (_event, filePaths) => backend.importXometryPurchaseOrders(filePaths || null, mainWindow));
  ipcMain.handle("import-xometry-travelers", (_event, jobId, filePaths) => backend.importXometryTravelers(jobId, filePaths || null, mainWindow));
ipcMain.handle("choose-job-documents", (_event, jobId) => backend.chooseJobDocuments(jobId, mainWindow));
ipcMain.handle("choose-part-documents", (_event, jobId, partId) => backend.choosePartDocuments(jobId, partId, mainWindow));
ipcMain.handle("open-job-document", (_event, jobId, documentId) => backend.openJobDocument(jobId, documentId));
ipcMain.handle("open-part-document", (_event, jobId, partId, documentId) => backend.openPartDocument(jobId, partId, documentId));
ipcMain.handle("open-job-document-revision", (_event, jobId, documentId, revisionIndex) => backend.openJobDocumentRevision(jobId, documentId, revisionIndex));
ipcMain.handle("open-part-document-revision", (_event, jobId, partId, documentId, revisionIndex) => backend.openPartDocumentRevision(jobId, partId, documentId, revisionIndex));
ipcMain.handle("archive-job-document", (_event, jobId, documentId) => backend.archiveJobDocument(jobId, documentId));
ipcMain.handle("archive-part-document", (_event, jobId, partId, documentId) => backend.archivePartDocument(jobId, partId, documentId));
ipcMain.handle("unarchive-job-document", (_event, jobId, documentId) => backend.unarchiveJobDocument(jobId, documentId));
ipcMain.handle("unarchive-part-document", (_event, jobId, partId, documentId) => backend.unarchivePartDocument(jobId, partId, documentId));
ipcMain.handle("delete-job-document", (_event, jobId, documentId) => backend.deleteJobDocument(jobId, documentId));
ipcMain.handle("delete-part-document", (_event, jobId, partId, documentId) => backend.deletePartDocument(jobId, partId, documentId));
ipcMain.handle("revise-job-document", (_event, jobId, documentId) => backend.reviseJobDocument(jobId, documentId, mainWindow));
ipcMain.handle("revise-part-document", (_event, jobId, partId, documentId) => backend.revisePartDocument(jobId, partId, documentId, mainWindow));
ipcMain.handle("choose-operation-images", (_event, jobId, partId, operationId) => backend.chooseOperationImages(jobId, partId, operationId, mainWindow));
  ipcMain.handle("export-job-pdf", (_event, jobId, destinationPath) => backend.exportJobPdf(jobId, destinationPath));

  ipcMain.handle("list-materials", () => backend.listMaterials());
  ipcMain.handle("load-material", (_event, id, options) => backend.loadMaterial(id, options || {}));
  ipcMain.handle("save-material", (_event, material) => backend.saveMaterial(material));
  ipcMain.handle("archive-material", (_event, id) => backend.archiveMaterial(id));
  ipcMain.handle("generate-material-serial", () => backend.generateMaterialSerial());
  ipcMain.handle("choose-material-attachments", (_event, materialId) => backend.chooseMaterialAttachments(materialId, mainWindow));
  ipcMain.handle("open-material-attachment", (_event, materialId, attachmentId) => backend.openMaterialAttachment(materialId, attachmentId));
  ipcMain.handle("open-material-attachment-revision", (_event, materialId, attachmentId, revisionIndex) => backend.openMaterialAttachmentRevision(materialId, attachmentId, revisionIndex));
  ipcMain.handle("archive-material-attachment", (_event, materialId, attachmentId) => backend.archiveMaterialAttachment(materialId, attachmentId));
  ipcMain.handle("unarchive-material-attachment", (_event, materialId, attachmentId) => backend.unarchiveMaterialAttachment(materialId, attachmentId));
  ipcMain.handle("revise-material-attachment", (_event, materialId, attachmentId) => backend.reviseMaterialAttachment(materialId, attachmentId, mainWindow));
  ipcMain.handle("delete-material-attachment", (_event, materialId, attachmentId) => backend.deleteMaterialAttachment(materialId, attachmentId));

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
  const preferences = await backend.loadPreferences();
  createWindow(
    String(preferences.windowTitle || preferences.appTitle || "AMERP"),
    String(preferences.appIconPath || "")
  );
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
