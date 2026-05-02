const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("amerp", {
  selectDataFolder: () => invoke("select-data-folder"),
  getDataFolder: () => invoke("get-data-folder"),
  loadWorkspace: () => invoke("load-workspace"),
  savePreferences: (preferences) => invoke("save-preferences", preferences),

  listJobs: () => invoke("list-jobs"),
  loadJob: (id, options) => invoke("load-job", id, options),
  saveJob: (job) => invoke("save-job", job),
  archiveJob: (id) => invoke("archive-job", id),
  createJobFromFusion: () => invoke("create-job-from-fusion"),
  chooseOperationImages: (jobId, partId, operationId) => invoke("choose-operation-images", jobId, partId, operationId),
  exportJobPdf: (jobId, destinationPath) => invoke("export-job-pdf", jobId, destinationPath),

  listMaterials: () => invoke("list-materials"),
  loadMaterial: (id, options) => invoke("load-material", id, options),
  saveMaterial: (material) => invoke("save-material", material),
  archiveMaterial: (id) => invoke("archive-material", id),
  generateMaterialSerial: () => invoke("generate-material-serial"),
  chooseMaterialAttachments: (materialId) => invoke("choose-material-attachments", materialId),
  openMaterialAttachment: (materialId, attachmentId) => invoke("open-material-attachment", materialId, attachmentId),

  listInstruments: () => invoke("list-instruments"),
  loadInstrument: (id, options) => invoke("load-instrument", id, options),
  saveInstrument: (payload) => invoke("save-instrument", payload),
  archiveInstrument: (id) => invoke("archive-instrument", id),
  listStandards: () => invoke("list-standards"),
  saveStandard: (standard) => invoke("save-standard", standard),

  loadLibraries: () => invoke("load-libraries"),
  saveLibrary: (library) => invoke("save-library", library),
  deleteLibrary: (name) => invoke("delete-library", name),
  loadTemplates: () => invoke("load-templates"),
  saveTemplate: (template) => invoke("save-template", template),
  deleteTemplate: (id) => invoke("delete-template", id),

  importLegacySetup: () => invoke("import-legacy-setup"),
  importLegacyMaterials: () => invoke("import-legacy-materials"),
  importLegacyMetrology: () => invoke("import-legacy-metrology"),

  acquireLock: (kind, id, recordPath) => invoke("acquire-lock", kind, id, recordPath),
  releaseLock: (kind, id) => invoke("release-lock", kind, id),
  releaseAllLocks: () => invoke("release-all-locks"),
  rebuildIndex: () => invoke("rebuild-index"),
  readAuditLog: (limit) => invoke("read-audit-log", limit),

  assetUrl: (relativePath) => `amerp://local/${String(relativePath || "").replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`
});
