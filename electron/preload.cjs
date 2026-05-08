const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("amerp", {
  selectDataFolder: () => invoke("select-data-folder"),
  getDataFolder: () => invoke("get-data-folder"),
  loadWorkspace: () => invoke("load-workspace"),
  chooseBrandIcon: () => invoke("choose-brand-icon"),
  savePreferences: (preferences) => invoke("save-preferences", preferences),
  onDeepLink: (handler) => {
    if (typeof handler !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("amerp-deep-link", listener);
    return () => ipcRenderer.removeListener("amerp-deep-link", listener);
  },

  listJobs: () => invoke("list-jobs"),
  listKanbanCards: () => invoke("list-kanban-cards"),
  loadKanbanCard: (id, options) => invoke("load-kanban-card", id, options),
  saveKanbanCard: (card) => invoke("save-kanban-card", card),
  archiveKanbanCard: (id) => invoke("archive-kanban-card", id),
  unarchiveKanbanCard: (id) => invoke("unarchive-kanban-card", id),
  deleteKanbanCard: (id) => invoke("delete-kanban-card", id),
  chooseKanbanPhoto: (cardId) => invoke("choose-kanban-photo", cardId),
  importKanbanFromUrl: (url) => invoke("import-kanban-from-url", url),
  aiFillKanbanCard: (card) => invoke("ai-fill-kanban-card", card),
  generateKanbanImage: (card) => invoke("generate-kanban-image", card),
  exportKanbanPdf: (cardId, destinationPath, sizeId, options) => invoke("export-kanban-pdf", cardId, destinationPath, sizeId, options),
  generateNextJobNumber: () => invoke("generate-next-job-number"),
  generateNextKanbanInventoryNumber: () => invoke("generate-next-kanban-inventory-number"),
  listCustomers: () => invoke("list-customers"),
  saveCustomer: (customer) => invoke("save-customer", customer),
  loadJob: (id, options) => invoke("load-job", id, options),
  saveJob: (job) => invoke("save-job", job),
  archiveJob: (id) => invoke("archive-job", id),
  unarchiveJob: (id) => invoke("unarchive-job", id),
  deleteJob: (id) => invoke("delete-job", id),
  createJobFromFusion: () => invoke("create-job-from-fusion"),
  importSubtractPurchaseOrders: (filePaths) => invoke("import-subtract-purchase-orders", filePaths),
  importXometryPurchaseOrders: (filePaths) => invoke("import-xometry-purchase-orders", filePaths),
  importXometryTravelers: (jobId, filePaths) => invoke("import-xometry-travelers", jobId, filePaths),
  chooseJobDocuments: (jobId) => invoke("choose-job-documents", jobId),
  choosePartDocuments: (jobId, partId) => invoke("choose-part-documents", jobId, partId),
  openJobDocument: (jobId, documentId) => invoke("open-job-document", jobId, documentId),
  openPartDocument: (jobId, partId, documentId) => invoke("open-part-document", jobId, partId, documentId),
  openJobDocumentRevision: (jobId, documentId, revisionIndex) => invoke("open-job-document-revision", jobId, documentId, revisionIndex),
  openPartDocumentRevision: (jobId, partId, documentId, revisionIndex) => invoke("open-part-document-revision", jobId, partId, documentId, revisionIndex),
  archiveJobDocument: (jobId, documentId) => invoke("archive-job-document", jobId, documentId),
  archivePartDocument: (jobId, partId, documentId) => invoke("archive-part-document", jobId, partId, documentId),
  unarchiveJobDocument: (jobId, documentId) => invoke("unarchive-job-document", jobId, documentId),
  unarchivePartDocument: (jobId, partId, documentId) => invoke("unarchive-part-document", jobId, partId, documentId),
  deleteJobDocument: (jobId, documentId) => invoke("delete-job-document", jobId, documentId),
  deletePartDocument: (jobId, partId, documentId) => invoke("delete-part-document", jobId, partId, documentId),
  reviseJobDocument: (jobId, documentId) => invoke("revise-job-document", jobId, documentId),
  revisePartDocument: (jobId, partId, documentId) => invoke("revise-part-document", jobId, partId, documentId),
  chooseOperationImages: (jobId, partId, operationId) => invoke("choose-operation-images", jobId, partId, operationId),
  exportJobPdf: (jobId, destinationPath) => invoke("export-job-pdf", jobId, destinationPath),
  savePartInspection: (jobId, partId, inspection) => invoke("save-part-inspection", jobId, partId, inspection),
  extractPartInspectionFromDrawing: (jobId, partId, source) => invoke("extract-part-inspection-from-drawing", jobId, partId, source),
  generatePartBalloonedDrawingPdf: (jobId, partId, drawingDocumentId) => invoke("generate-part-ballooned-drawing-pdf", jobId, partId, drawingDocumentId),
  exportPartInspectionPdf: (jobId, partId, destinationPath) => invoke("export-part-inspection-pdf", jobId, partId, destinationPath),

  listMaterials: () => invoke("list-materials"),
  loadMaterial: (id, options) => invoke("load-material", id, options),
  saveMaterial: (material) => invoke("save-material", material),
  archiveMaterial: (id) => invoke("archive-material", id),
  generateMaterialSerial: () => invoke("generate-material-serial"),
  chooseMaterialAttachments: (materialId) => invoke("choose-material-attachments", materialId),
  openMaterialAttachment: (materialId, attachmentId) => invoke("open-material-attachment", materialId, attachmentId),
  openMaterialAttachmentRevision: (materialId, attachmentId, revisionIndex) => invoke("open-material-attachment-revision", materialId, attachmentId, revisionIndex),
  archiveMaterialAttachment: (materialId, attachmentId) => invoke("archive-material-attachment", materialId, attachmentId),
  unarchiveMaterialAttachment: (materialId, attachmentId) => invoke("unarchive-material-attachment", materialId, attachmentId),
  reviseMaterialAttachment: (materialId, attachmentId) => invoke("revise-material-attachment", materialId, attachmentId),
  deleteMaterialAttachment: (materialId, attachmentId) => invoke("delete-material-attachment", materialId, attachmentId),
  exportMaterialPdf: (materialId, destinationPath, sizeId, options) => invoke("export-material-pdf", materialId, destinationPath, sizeId, options),

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
