const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('setupSheets', {
  selectDataFolder: () => invoke('select-data-folder'),
  getDataFolder: () => invoke('get-data-folder'),
  listJobs: () => invoke('list-jobs'),
  loadJob: (id) => invoke('load-job', id),
  saveJob: (job) => invoke('save-job', job),
  deleteJob: (id) => invoke('delete-job', id),
  loadLibraries: () => invoke('load-libraries'),
  saveLibrary: (libraryOrName, records) => invoke('save-library', libraryOrName, records),
  deleteLibrary: (name) => invoke('delete-library', name),
  loadTemplates: () => invoke('load-templates'),
  saveTemplate: (template) => invoke('save-template', template),
  deleteTemplate: (id) => invoke('delete-template', id),
  importFusionSetupSheets: () => invoke('import-fusion-setup-sheets'),
  copyStepImage: (jobId, sourcePath) => invoke('copy-step-image', jobId, sourcePath),
  chooseStepImages: (jobId) => invoke('choose-step-images', jobId),
  exportJobPdf: (jobId, destinationPath) => invoke('export-job-pdf', jobId, destinationPath),
  assetUrl: (relativePath) => `setup-sheet://local/${String(relativePath || '').replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')}`
});
