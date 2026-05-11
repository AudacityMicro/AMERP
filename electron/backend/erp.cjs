"use strict";

const { BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const {
  DEFAULT_LIBRARY_DEFINITIONS,
  DOCUMENT_CATEGORIES,
  DEFAULT_TEMPLATES,
  MATERIAL_CONSTANTS
} = require("./defaults.cjs");
const {
  appendJsonLine,
  copyFileUnique,
  daysUntil,
  ensureDir,
  getLockOwner,
  normalizeText,
  nowIso,
  pathExists,
  randomId,
  readJson,
  readText,
  safeFileName,
  slugify,
  todayIso,
  toDisplayList,
  writeJson,
  writeText
} = require("./utils.cjs");
const {
  extractProductData,
  inferVendorName
} = require("./kanban-vendors.cjs");
const {
  enrichKanbanCardDraft,
  generateKanbanReferenceImage
} = require("./kanban-ai.cjs");
const {
  extractInspectionFromDrawing
} = require("./inspection-ai.cjs");

const CONFIG_FILE = "amerp-config.json";
const LOCK_TTL_MS = 15 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const KANBAN_DEEP_LINK_PREFIX = "amerp://open/kanban/";
const MATERIAL_DEEP_LINK_PREFIX = "amerp://open/material/";
const KANBAN_VENDOR_SKU_PREFIX = "Vendor SKU / Part #:";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const KANBAN_DEPARTMENT_COLORS = ["#2563eb", "#f59e0b", "#0f766e", "#7c3aed", "#dc2626", "#475569"];
const DEFAULT_KANBAN_CATEGORIES = [
  "Cutting Tools",
  "Shop Supplies",
  "Maintenance",
  "PPE",
  "Packaging",
  "Inspection",
  "Office",
  "Hardware"
];
const DEFAULT_KANBAN_DEPARTMENTS = [
  { id: "kanban-dept-machining", name: "Machining", color: "#2563eb" },
  { id: "kanban-dept-quality", name: "Quality", color: "#0f766e" },
  { id: "kanban-dept-maintenance", name: "Maintenance", color: "#f59e0b" },
  { id: "kanban-dept-shop-supplies", name: "Shop Supplies", color: "#7c3aed" }
];
const DEFAULT_KANBAN_PRINT_SIZES = [
  { id: "kanban-size-2x4", name: '2" x 4"', widthIn: 2, heightIn: 4 },
  { id: "kanban-size-2x3", name: '2" x 3"', widthIn: 2, heightIn: 3 },
  { id: "kanban-size-3x5", name: '3" x 5"', widthIn: 3, heightIn: 5 },
  { id: "kanban-size-4x6", name: '4" x 6"', widthIn: 4, heightIn: 6 }
];
const NONCONFORMANCE_STATUS_OPTIONS = [
  "Open",
  "Contained",
  "Awaiting Disposition",
  "Awaiting Corrective Action",
  "Awaiting Verification",
  "Closed",
  "Cancelled"
];
const NONCONFORMANCE_SEVERITY_OPTIONS = ["Minor", "Major", "Critical"];
const NONCONFORMANCE_SOURCE_OPTIONS = [
  "Internal Inspection",
  "Final Inspection",
  "In-Process Inspection",
  "Customer Complaint",
  "Supplier Issue",
  "Receiving Inspection",
  "Other"
];
const NONCONFORMANCE_DETECTION_METHOD_OPTIONS = [
  "Caliper",
  "Micrometer",
  "CMM",
  "Pin Gage",
  "Thread Gage",
  "Visual",
  "Functional Test",
  "Customer Report",
  "Other"
];
const NONCONFORMANCE_REINSPECTION_RESULT_OPTIONS = ["Pass", "Fail", "Not Required"];
const NONCONFORMANCE_ROOT_CAUSE_CATEGORY_OPTIONS = [
  "Programming",
  "Setup",
  "Tooling",
  "Machine",
  "Material",
  "Inspection",
  "Documentation",
  "Supplier",
  "Training",
  "Communication",
  "Process Not Followed",
  "Process Missing",
  "Other"
];
const NONCONFORMANCE_EFFECTIVENESS_METHOD_OPTIONS = [
  "Follow-up inspection",
  "Audit",
  "Next-job review",
  "Training record review",
  "Process/document update review",
  "Supplier performance review",
  "Other"
];
const NONCONFORMANCE_EFFECTIVENESS_RESULT_OPTIONS = ["Effective", "Not Effective", "Pending", "Not Required"];
const NONCONFORMANCE_ATTACHMENT_TYPE_OPTIONS = [
  "Photo",
  "Drawing",
  "Inspection Report",
  "Customer Email",
  "Supplier Email",
  "Material Cert",
  "Rework Instructions",
  "Other"
];
const NONCONFORMANCE_ATTACHMENT_STATUS_OPTIONS = ["Current", "Superseded", "Archived"];
const DEFAULT_NONCONFORMANCE_DISPOSITIONS = ["Scrap", "Rework", "Remake", "Use As-Is", "Return to Supplier", "Sort / 100% Inspect", "Other"];
const DEFAULT_ENABLED_MODULES = {
  jobs: true,
  inspections: true,
  nonconformance: true,
  kanban: true,
  materials: true,
  metrology: true
};
const DEFAULT_INSPECTION_REPORT_EXPORT_OPTIONS = {
  includeBalloonedDrawing: true,
  includeReportControl: true,
  includeTraceability: true,
  includeCharacteristics: true,
  includeMeasuredInstances: true,
  includeReleaseSummary: true,
  includeNcrLinks: true,
  includeMaterialCerts: true,
  includeXBarCharts: true,
  includeToolCertificationHistory: true
};

function mergeKanbanOrderingNotes(notes, vendorPartNumber) {
  const trimmedNotes = String(notes || "").trim();
  const trimmedPartNumber = String(vendorPartNumber || "").trim();
  if (!trimmedPartNumber) {
    return trimmedNotes;
  }
  if (trimmedNotes.toLowerCase().includes(trimmedPartNumber.toLowerCase())) {
    return trimmedNotes;
  }
  const line = `${KANBAN_VENDOR_SKU_PREFIX} ${trimmedPartNumber}`;
  return trimmedNotes ? `${trimmedNotes}\n${line}` : line;
}

function pdfTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

async function uniquePdfPath(folder, filenameStem) {
  await ensureDir(folder);
  const stem = safeFileName(filenameStem, "document");
  let candidate = `${stem}.pdf`;
  let counter = 2;
  while (await pathExists(path.join(folder, candidate))) {
    candidate = `${stem}-${counter}.pdf`;
    counter += 1;
  }
  return path.join(folder, candidate);
}

class ERPBackend {
  constructor({ app, devServerUrl, pythonPath }) {
    this.app = app;
    this.devServerUrl = devServerUrl || "";
    this.pythonPath = pythonPath || "python";
    this.configPath = path.join(app.getPath("userData"), CONFIG_FILE);
    this.wordlistDir = path.join(__dirname, "..", "assets", "wordlists");
  }

  async readConfig() {
    return readJson(this.configPath, {});
  }

  async writeConfig(config) {
    await writeJson(this.configPath, config);
  }

  getDataFolderArg() {
    const arg = process.argv.find((value) => value.startsWith("--data-folder="));
    if (!arg) {
      return null;
    }
    return arg.slice("--data-folder=".length).replace(/^"|"$/g, "");
  }

  async getDataFolder() {
    const argFolder = this.getDataFolderArg();
    if (argFolder) {
      return path.resolve(argFolder);
    }
    if (process.env.AMERP_DATA_FOLDER) {
      return path.resolve(process.env.AMERP_DATA_FOLDER);
    }
    const config = await this.readConfig();
    return config.dataFolder || null;
  }

  async initializeDataFolder(folder) {
    const root = path.resolve(folder);
    const directories = [
      "config",
      "customers",
      "jobs",
      "nonconformances",
      "kanban",
      "materials",
      "metrology/instruments",
      "metrology/standards",
      "templates/operations",
      "libraries",
      "audit",
      "cache",
      "locks"
    ];
    for (const relative of directories) {
      await ensureDir(path.join(root, relative));
    }

    const librariesRoot = path.join(root, "libraries");
    const existingLibraryFiles = (await fs.readdir(librariesRoot)).filter((name) => name.endsWith(".json"));
    if (!existingLibraryFiles.length) {
      for (const library of DEFAULT_LIBRARY_DEFINITIONS) {
        const filePath = path.join(librariesRoot, `${safeFileName(library.name)}.json`);
        await writeJson(filePath, library);
      }
    }

    const templatesRoot = path.join(root, "templates", "operations");
    const existingTemplateFiles = (await fs.readdir(templatesRoot)).filter((name) => name.endsWith(".json"));
    if (!existingTemplateFiles.length) {
      for (const template of DEFAULT_TEMPLATES) {
        const filePath = path.join(templatesRoot, `${safeFileName(template.id)}.json`);
        await writeJson(filePath, template);
      }
    }

    const standardsPath = path.join(root, "metrology", "standards", "standards.json");
    if (!(await pathExists(standardsPath))) {
      await writeJson(standardsPath, []);
    }

    const preferencesPath = this.getPreferencesPath(root);
    const existingPreferences = await readJson(preferencesPath, null);
    const normalizedPreferences = this.normalizePreferences(existingPreferences || {});
    if (!existingPreferences || JSON.stringify(existingPreferences) !== JSON.stringify(normalizedPreferences)) {
      await writeJson(preferencesPath, normalizedPreferences);
    }

    const indexPath = this.getIndexPath(root);
    if (!(await pathExists(indexPath))) {
      await writeJson(indexPath, {
        generatedAt: nowIso(),
      jobs: [],
      nonconformances: [],
      kanbanCards: [],
      materials: [],
      instruments: []
      });
    }
  }

  async requireDataFolder() {
    const folder = await this.getDataFolder();
    if (!folder) {
      throw new Error("Choose an ERP data folder before using the application.");
    }
    await this.initializeDataFolder(folder);
    return folder;
  }

  async selectDataFolder(mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose AMERP Data Folder",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return this.getDataFolder();
    }
    const folder = path.resolve(result.filePaths[0]);
    await this.initializeDataFolder(folder);
    await this.writeConfig({ ...(await this.readConfig()), dataFolder: folder });
    return folder;
  }

  async ensureDataFolderAtStartup(mainWindow) {
    const folder = await this.getDataFolder();
    if (folder) {
      try {
        await this.initializeDataFolder(folder);
        return folder;
      } catch {
        await this.writeConfig({ ...(await this.readConfig()), dataFolder: null });
      }
    }
    return this.selectDataFolder(mainWindow);
  }

  getIndexPath(dataRoot) {
    return path.join(dataRoot, "cache", "search-index.json");
  }

  getPreferencesPath(dataRoot) {
    return path.join(dataRoot, "config", "preferences.json");
  }

  normalizeMaterialFamilies(materialFamilies) {
    return (Array.isArray(materialFamilies) ? materialFamilies : [])
      .map((family, index) => ({
        id: safeFileName(family?.id || family?.name || `material-family-${index + 1}`),
        name: String(family?.name || "").trim(),
        alloys: Array.from(new Set((Array.isArray(family?.alloys) ? family.alloys : [])
          .map((alloy) => String(alloy || "").trim())
          .filter(Boolean)))
      }))
      .filter((family) => family.name);
  }

  normalizePreferences(preferences) {
    const sourceFamilies = Array.isArray(preferences?.materialFamilies)
      ? preferences.materialFamilies
      : MATERIAL_CONSTANTS.materialFamilies;
    const resultsColumns = Array.isArray(preferences?.resultsColumns) && preferences.resultsColumns.length
      ? preferences.resultsColumns.map((column) => String(column || "").trim()).filter(Boolean)
      : ["serialCode", "materialType", "supplier", "traceabilityLevel", "status"];
    const listPreference = (value, fallback) => {
      const items = Array.isArray(value) ? value : fallback;
      return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
    };
    const normalizeLocationList = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean)));
    const normalizeKanbanDepartments = (value, legacyLocations = []) => {
      const items = Array.isArray(value) && value.length ? value : DEFAULT_KANBAN_DEPARTMENTS;
      const normalized = items
        .map((item, index) => {
          if (typeof item === "string") {
            const name = String(item || "").trim();
            return name ? {
              id: `kanban-dept-${slugify(name) || index + 1}`,
              name,
              color: KANBAN_DEPARTMENT_COLORS[index % KANBAN_DEPARTMENT_COLORS.length],
              locations: []
            } : null;
          }
          const name = String(item?.name || "").trim();
          if (!name) {
            return null;
          }
          const color = String(item?.color || KANBAN_DEPARTMENT_COLORS[index % KANBAN_DEPARTMENT_COLORS.length]).trim() || KANBAN_DEPARTMENT_COLORS[index % KANBAN_DEPARTMENT_COLORS.length];
          return {
            id: String(item?.id || `kanban-dept-${slugify(name) || index + 1}`).trim(),
            name,
            color,
            locations: normalizeLocationList(item?.locations)
          };
        })
        .filter(Boolean);
      if (!normalized.some((item) => item.locations?.length) && legacyLocations.length && normalized.length) {
        normalized[0] = {
          ...normalized[0],
          locations: normalizeLocationList([...(normalized[0].locations || []), ...legacyLocations])
        };
      }
      return normalized;
    };
    const normalizeKanbanPrintSizes = (value) => {
      const items = Array.isArray(value) && value.length ? value : DEFAULT_KANBAN_PRINT_SIZES;
      return items
        .map((item, index) => {
          const name = String(item?.name || "").trim();
          const widthIn = Number(item?.widthIn);
          const heightIn = Number(item?.heightIn);
          if (!name || !Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
            return null;
          }
          return {
            id: String(item?.id || `kanban-size-${slugify(name) || index + 1}`).trim(),
            name,
            widthIn,
            heightIn
          };
        })
        .filter(Boolean);
    };
    const legacyKanbanStorageLocations = listPreference(preferences?.kanbanStorageLocations, ["Stock Room", "Tool Crib", "Receiving", "Maintenance Bench"]);
    const kanbanDepartments = normalizeKanbanDepartments(preferences?.kanbanDepartments, legacyKanbanStorageLocations);
    const kanbanPrintSizes = normalizeKanbanPrintSizes(preferences?.kanbanPrintSizes);
    const enabledModules = Object.fromEntries(Object.entries(DEFAULT_ENABLED_MODULES).map(([key, fallback]) => [
      key,
      preferences?.enabledModules && Object.prototype.hasOwnProperty.call(preferences.enabledModules, key)
        ? Boolean(preferences.enabledModules[key])
        : fallback
    ]));
    const inspectionReportExportOptions = Object.fromEntries(Object.entries(DEFAULT_INSPECTION_REPORT_EXPORT_OPTIONS).map(([key, fallback]) => [
      key,
      preferences?.inspectionReportExportOptions && Object.prototype.hasOwnProperty.call(preferences.inspectionReportExportOptions, key)
        ? Boolean(preferences.inspectionReportExportOptions[key])
        : fallback
    ]));
    const defaultKanbanPrintSizeId = kanbanPrintSizes.some((item) => item.id === preferences?.defaultKanbanPrintSizeId)
      ? preferences.defaultKanbanPrintSizeId
      : (kanbanPrintSizes[0]?.id || DEFAULT_KANBAN_PRINT_SIZES[0].id);
    return {
      appTitle: String(preferences?.appTitle || "AMERP").trim() || "AMERP",
      appTagline: String(preferences?.appTagline || "Operator ERP").trim() || "Operator ERP",
      windowTitle: String(preferences?.windowTitle || "AMERP").trim() || "AMERP",
      appIconPath: String(preferences?.appIconPath || "").trim(),
      enabledModules,
      dueSoonDays: Number.isFinite(Number(preferences?.dueSoonDays)) ? Number(preferences.dueSoonDays) : 14,
      jobPrefix: String(preferences?.jobPrefix || "J03C").trim(),
      startingJobNumber: Number.isFinite(Number(preferences?.startingJobNumber)) ? Number(preferences.startingJobNumber) : 600,
      inspectionReportPrefix: String(preferences?.inspectionReportPrefix || "IR").trim(),
      startingInspectionReportNumber: Number.isFinite(Number(preferences?.startingInspectionReportNumber)) ? Number(preferences.startingInspectionReportNumber) : 1,
      inspectionReportExportOptions,
      nonconformancePrefix: String(preferences?.nonconformancePrefix || "NCR").trim(),
      startingNonconformanceNumber: Number.isFinite(Number(preferences?.startingNonconformanceNumber)) ? Number(preferences.startingNonconformanceNumber) : 1,
      kanbanInventoryPrefix: String(preferences?.kanbanInventoryPrefix || "J03C").trim(),
      kanbanStartingInventoryNumber: Number.isFinite(Number(preferences?.kanbanStartingInventoryNumber)) ? Number(preferences.kanbanStartingInventoryNumber) : 600,
      resultsColumns: Array.from(new Set(resultsColumns)),
      materialFamilies: this.normalizeMaterialFamilies(sourceFamilies),
      metrologyToolTypes: listPreference(preferences?.metrologyToolTypes, ["Micrometer", "Caliper", "Indicator", "Pin Gage", "Thread Plug Gage", "Height Gage"]),
      metrologyManufacturers: listPreference(preferences?.metrologyManufacturers, ["Mitutoyo", "Starrett", "Mahr", "Fowler", "SPI"]),
      metrologyResolutions: listPreference(preferences?.metrologyResolutions, ['0.0001"', '0.0005"', '0.001"', '0.01 mm']),
      metrologyLocations: listPreference(preferences?.metrologyLocations, ["QC", "Inspection Bench", "Machine Shop", "Tool Crib"]),
      metrologyDepartments: listPreference(preferences?.metrologyDepartments, ["Quality", "Machining", "Assembly"]),
      metrologyStatuses: listPreference(preferences?.metrologyStatuses, ["In service", "Due for calibration", "Overdue", "Retired"]),
      kanbanDepartments,
      kanbanStorageLocations: Array.from(new Set(kanbanDepartments.flatMap((item) => item.locations || []).filter(Boolean))),
      kanbanVendors: listPreference(preferences?.kanbanVendors, ["McMaster-Carr", "MSC", "Amazon"]),
      kanbanCategories: listPreference(preferences?.kanbanCategories, DEFAULT_KANBAN_CATEGORIES),
      nonconformanceDispositions: listPreference(preferences?.nonconformanceDispositions, DEFAULT_NONCONFORMANCE_DISPOSITIONS),
      kanbanPrintSizes,
      defaultKanbanPrintSizeId,
      openaiApiKey: String(preferences?.openaiApiKey || "").trim(),
      lastInitializedAt: String(preferences?.lastInitializedAt || nowIso()).trim() || nowIso()
    };
  }

  async loadPreferences(dataRoot = null) {
    const root = dataRoot || await this.requireDataFolder();
    return this.normalizePreferences(await readJson(this.getPreferencesPath(root), {}));
  }

  async savePreferences(preferences) {
    const dataRoot = await this.requireDataFolder();
    const current = await this.loadPreferences(dataRoot);
    const next = this.normalizePreferences({ ...current, ...(preferences || {}) });
    await writeJson(this.getPreferencesPath(dataRoot), next);
    await this.appendAudit("preferences_saved", "preferences", "Saved application settings.");
    return next;
  }

  async chooseBrandIcon(mainWindow = null) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Branding Icon",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "ico", "jpg", "jpeg", "bmp", "gif", "webp"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return path.resolve(result.filePaths[0]);
  }

  async syncDesktopShortcut(preferences = {}) {
    if (process.platform !== "win32") {
      return false;
    }
    const desktopPath = this.app.getPath("desktop");
    const targetPath = path.join(this.app.getAppPath(), "Start-App.cmd");
    const appTitle = String(preferences?.appTitle || "AMERP").trim() || "AMERP";
    const iconLocation = String(preferences?.appIconPath || "").trim() || "C:\\Windows\\System32\\SHELL32.dll,13";
    const psString = (value) => `'${String(value || "").replace(/'/g, "''")}'`;
    const script = [
      `$desktop = ${psString(desktopPath)}`,
      `$target = ${psString(targetPath)}`,
      `$icon = ${psString(iconLocation)}`,
      `$names = @('AMERP.lnk', ${psString(`${appTitle}.lnk`)})`,
      `$shell = New-Object -ComObject WScript.Shell`,
      `Get-ChildItem -Path $desktop -Filter *.lnk | ForEach-Object {`,
      `  $shortcut = $shell.CreateShortcut($_.FullName)`,
      `  if ($shortcut.TargetPath -ieq $target -or $names -contains $_.Name) {`,
      `    $shortcut.IconLocation = $icon`,
      `    $shortcut.Save()`,
      `  }`,
      `}`
    ].join("; ");
    await this.runPowerShell(script);
    return true;
  }

  buildKanbanDeepLink(cardId) {
    return `${KANBAN_DEEP_LINK_PREFIX}${encodeURIComponent(cardId)}`;
  }

  buildMaterialDeepLink(materialId) {
    return `${MATERIAL_DEEP_LINK_PREFIX}${encodeURIComponent(materialId)}`;
  }

  isGenericKanbanItemName(url, itemName) {
    const normalized = String(itemName || "").trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      const hostTokens = hostname.split(".").filter(Boolean);
      return normalized === hostname
        || hostTokens.includes(normalized)
        || normalized === "mcmaster-carr"
        || normalized === "mscdirect.com"
        || normalized === "mscdirect";
    } catch {
      return false;
    }
  }

  isGenericKanbanDescription(description) {
    const normalized = String(description || "").trim().toLowerCase();
    return !normalized
      || normalized.includes("complete source for your plant")
      || normalized.includes("products ordered ship from stock")
      || normalized.includes("pardon our interruption");
  }

  isBotChallengeHtml(html) {
    const normalized = String(html || "").toLowerCase();
    return normalized.includes("pardon our interruption")
      || normalized.includes("imperva")
      || normalized.includes("window.onprotectioninitialized")
      || normalized.includes("cookieisset")
      || normalized.includes("showblockpage");
  }

  kanbanImportConfidenceScore(url, imported, html) {
    let score = 0;
    if (imported?.itemName && !this.isGenericKanbanItemName(url, imported.itemName)) {
      score += 3;
    }
    if (imported?.description && !this.isGenericKanbanDescription(imported.description)) {
      score += 2;
    }
    if (imported?.imageUrl && !String(imported.imageUrl).toLowerCase().includes("favicon")) {
      score += 2;
    }
    if (imported?.vendorPartNumber) {
      score += 1;
    }
    if (imported?.packSize) {
      score += 1;
    }
    if (this.isBotChallengeHtml(html)) {
      score -= 4;
    }
    return score;
  }

  shouldUseRenderedKanbanFallback(url, html, imported) {
    if (this.isBotChallengeHtml(html)) {
      return true;
    }
    return this.kanbanImportConfidenceScore(url, imported, html) < 3;
  }

  mergeKanbanImportedData(url, primary, fallback) {
    const firstUseful = (...values) => values.find((value) => String(value || "").trim());
    const preferredItemName = !this.isGenericKanbanItemName(url, fallback?.itemName) ? fallback?.itemName : primary?.itemName;
    const preferredDescription = !this.isGenericKanbanDescription(fallback?.description) ? fallback?.description : primary?.description;
    const preferredImage = (fallback?.imageUrl && !String(fallback.imageUrl).toLowerCase().includes("favicon")) ? fallback.imageUrl : primary?.imageUrl;
    return {
      vendor: firstUseful(fallback?.vendor, primary?.vendor),
      itemName: firstUseful(preferredItemName, fallback?.itemName, primary?.itemName),
      vendorPartNumber: firstUseful(fallback?.vendorPartNumber, primary?.vendorPartNumber),
      description: firstUseful(preferredDescription, fallback?.description, primary?.description),
      purchaseUrl: firstUseful(fallback?.purchaseUrl, primary?.purchaseUrl),
      imageUrl: firstUseful(preferredImage, fallback?.imageUrl, primary?.imageUrl),
      packSize: firstUseful(fallback?.packSize, primary?.packSize),
      warnings: [...new Set([...(primary?.warnings || []), ...(fallback?.warnings || [])])]
    };
  }

  async fetchHtml(url) {
    const response = await fetch(url, {
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Vendor page returned ${response.status} ${response.statusText}`.trim());
    }
    return response.text();
  }

  async fetchRenderedHtml(url, waitMs = 2500) {
    const window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        javascript: true
      }
    });
    try {
      const loadPromise = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (handler) => (value) => {
          if (settled) return;
          settled = true;
          handler(value);
        };
        const resolveOnce = finish(resolve);
        const rejectOnce = finish(reject);
        const timer = setTimeout(() => rejectOnce(new Error("Timed out waiting for rendered page content.")), 20000);
        window.webContents.once("did-fail-load", (_event, _code, description) => {
          clearTimeout(timer);
          rejectOnce(new Error(description || "Failed to load rendered page."));
        });
        window.webContents.once("did-finish-load", () => {
          setTimeout(() => {
            clearTimeout(timer);
            resolveOnce();
          }, waitMs);
        });
      });
      await window.loadURL(url, { userAgent: BROWSER_USER_AGENT });
      await loadPromise;
      return await window.webContents.executeJavaScript("document.documentElement.outerHTML", true);
    } finally {
      window.destroy();
    }
  }

  async loadKanbanProductContext(url) {
    const html = await this.fetchHtml(url);
    let imported = extractProductData(url, html);
    let finalHtml = html;
    let usedRenderedFallback = false;
    if (this.shouldUseRenderedKanbanFallback(url, html, imported)) {
      try {
        const renderedHtml = await this.fetchRenderedHtml(url);
        const renderedImported = extractProductData(url, renderedHtml);
        imported = this.mergeKanbanImportedData(url, imported, renderedImported);
        finalHtml = renderedHtml;
        usedRenderedFallback = true;
      } catch (error) {
        imported = {
          ...imported,
          warnings: [...(imported.warnings || []), `Rendered page fallback did not improve extraction: ${error.message}`]
        };
      }
    }
    return { html: finalHtml, imported, usedRenderedFallback };
  }

  async downloadRemoteFile(url, destinationFolder, preferredBaseName = "image") {
    const response = await fetch(url, {
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`Image download returned ${response.status} ${response.statusText}`.trim());
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const extension = contentType.includes("png")
      ? ".png"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? ".jpg"
        : contentType.includes("webp")
          ? ".webp"
          : contentType.includes("gif")
            ? ".gif"
            : contentType.includes("bmp")
              ? ".bmp"
              : path.extname(new URL(response.url || url).pathname) || ".png";
    const baseName = safeFileName(preferredBaseName, "image");
    await ensureDir(destinationFolder);
    let fileName = `${baseName}${extension}`;
    let counter = 1;
    while (await pathExists(path.join(destinationFolder, fileName))) {
      fileName = `${baseName}-${counter}${extension}`;
      counter += 1;
    }
    const destination = path.join(destinationFolder, fileName);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, buffer);
    return destination;
  }

  getLockPath(dataRoot, kind, id) {
    return path.join(dataRoot, "locks", `${safeFileName(kind)}-${safeFileName(id)}.json`);
  }

  async acquireLock(kind, id, recordPath) {
    const dataRoot = await this.requireDataFolder();
    const lockPath = this.getLockPath(dataRoot, kind, id);
    const owner = getLockOwner();
    const existing = await readJson(lockPath, null);
    if (existing) {
      const sameOwner = existing.owner?.hostname === owner.hostname
        && existing.owner?.username === owner.username;
      const fresh = existing.acquiredAt && (Date.now() - new Date(existing.acquiredAt).getTime()) < LOCK_TTL_MS;
      if (!sameOwner && fresh) {
        throw new Error(`${kind} ${id} is currently locked by ${existing.owner?.username || "another user"} on ${existing.owner?.hostname || "another machine"}.`);
      }
    }
    const payload = {
      kind,
      id,
      recordPath,
      acquiredAt: nowIso(),
      owner
    };
    await writeJson(lockPath, payload);
    return payload;
  }

  async releaseLock(kind, id) {
    const dataRoot = await this.requireDataFolder();
    const lockPath = this.getLockPath(dataRoot, kind, id);
    await fs.rm(lockPath, { force: true });
    return true;
  }

  async releaseAllLocksForCurrentOwner() {
    const dataRoot = await this.requireDataFolder();
    const locksDir = path.join(dataRoot, "locks");
    const owner = getLockOwner();
    const entries = await fs.readdir(locksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const lock = await readJson(path.join(locksDir, entry.name), null);
      if (!lock) {
        continue;
      }
      const sameOwner = lock.owner?.hostname === owner.hostname
        && lock.owner?.username === owner.username;
      if (sameOwner) {
        await fs.rm(path.join(locksDir, entry.name), { force: true });
      }
    }
  }

  async loadLibraries() {
    const dataRoot = await this.requireDataFolder();
    const folder = path.join(dataRoot, "libraries");
    const entries = await fs.readdir(folder);
    const libraries = {};
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const filePath = path.join(folder, entry);
      const library = await readJson(filePath, null);
      if (!library?.name && !library?.label) {
        continue;
      }
      const normalized = this.normalizeLibrary(library);
      libraries[normalized.name] = normalized;
      if (JSON.stringify(library) !== JSON.stringify(normalized)) {
        await writeJson(filePath, normalized);
      }
    }
    return Object.fromEntries(
      Object.values(libraries)
        .sort((a, b) => Number(a.order || 1000) - Number(b.order || 1000) || String(a.label).localeCompare(String(b.label)))
        .map((library) => [library.name, library])
    );
  }

  async saveLibrary(library) {
    const dataRoot = await this.requireDataFolder();
    const normalized = this.normalizeLibrary(library);
    await writeJson(path.join(dataRoot, "libraries", `${normalized.name}.json`), normalized);
    await this.appendAudit("library_saved", normalized.name, `Saved library ${normalized.label}.`);
    return normalized;
  }

  async deleteLibrary(name) {
    const dataRoot = await this.requireDataFolder();
    await fs.rm(path.join(dataRoot, "libraries", `${safeFileName(name)}.json`), { force: true });
    await this.appendAudit("library_deleted", name, `Deleted library ${name}.`);
    return true;
  }

  async loadTemplates() {
    const dataRoot = await this.requireDataFolder();
    const folder = path.join(dataRoot, "templates", "operations");
    const entries = await fs.readdir(folder);
    const templates = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const template = await readJson(path.join(folder, entry), null);
      if (!template?.id) {
        continue;
      }
      templates.push({
        ...template,
        libraryNames: this.normalizeTemplateLibraryNames(template.libraryNames),
        defaultParameters: Array.isArray(template.defaultParameters) ? template.defaultParameters : [],
        defaultSteps: Array.isArray(template.defaultSteps) ? template.defaultSteps : []
      });
    }
    return templates.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async saveTemplate(template) {
    const dataRoot = await this.requireDataFolder();
    const normalized = {
      id: template?.id || randomId("template"),
      name: String(template?.name || "New Template").trim(),
      category: String(template?.category || "General").trim(),
      libraryNames: this.normalizeTemplateLibraryNames(template?.libraryNames),
      defaultParameters: Array.isArray(template?.defaultParameters) ? template.defaultParameters : [],
      defaultSteps: Array.isArray(template?.defaultSteps) ? template.defaultSteps : []
    };
    await writeJson(path.join(dataRoot, "templates", "operations", `${safeFileName(normalized.id)}.json`), normalized);
    await this.appendAudit("template_saved", normalized.id, `Saved template ${normalized.name}.`);
    return normalized;
  }

  normalizeTemplateLibraryNames(libraryNames) {
    return toDisplayList(libraryNames).filter((name) => name !== "cuttingTools");
  }

  normalizeCustomer(customer) {
    return {
      id: customer?.id || randomId("customer"),
      name: String(customer?.name || "").trim(),
      shippingAddress1: String(customer?.shippingAddress1 || "").trim(),
      shippingAddress2: String(customer?.shippingAddress2 || "").trim(),
      city: String(customer?.city || "").trim(),
      state: String(customer?.state || "").trim(),
      postalCode: String(customer?.postalCode || "").trim(),
      country: String(customer?.country || "").trim(),
      contactName: String(customer?.contactName || "").trim(),
      email: String(customer?.email || "").trim(),
      phone: String(customer?.phone || "").trim(),
      notes: String(customer?.notes || "").trim(),
      active: customer?.active !== false,
      createdAt: String(customer?.createdAt || nowIso()).trim() || nowIso(),
      updatedAt: String(customer?.updatedAt || nowIso()).trim() || nowIso()
    };
  }

  async listCustomers() {
    const dataRoot = await this.requireDataFolder();
    const customerDir = path.join(dataRoot, "customers");
    const entries = await fs.readdir(customerDir, { withFileTypes: true });
    const customers = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const customer = await readJson(path.join(customerDir, entry.name), null);
      if (!customer?.id) {
        continue;
      }
      customers.push(this.normalizeCustomer(customer));
    }

    const jobsRoot = path.join(dataRoot, "jobs");
    const jobEntries = (await pathExists(jobsRoot)) ? await fs.readdir(jobsRoot, { withFileTypes: true }) : [];
    const jobRefsByCustomerId = new Map();
    for (const entry of jobEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const header = await readJson(path.join(jobsRoot, entry.name, "job.json"), null);
      if (!header?.id) {
        continue;
      }
      const customerId = String(header.customerId || "").trim();
      if (!customerId) {
        continue;
      }
      if (!jobRefsByCustomerId.has(customerId)) {
        jobRefsByCustomerId.set(customerId, []);
      }
      jobRefsByCustomerId.get(customerId).push({
        jobId: header.id,
        jobNumber: header.jobNumber || "",
        status: header.status || "Open",
        updatedAt: header.updatedAt || header.createdAt || ""
      });
    }

    return customers
      .map((customer) => ({
        ...customer,
        jobRefs: (jobRefsByCustomerId.get(customer.id) || [])
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async saveCustomer(customer) {
    const dataRoot = await this.requireDataFolder();
    const existing = customer?.id ? await readJson(this.getCustomerRoot(dataRoot, customer.id), null) : null;
    const timestamp = nowIso();
    const normalized = this.normalizeCustomer({
      ...existing,
      ...(customer || {}),
      createdAt: existing?.createdAt || customer?.createdAt || timestamp,
      updatedAt: timestamp
    });
    if (!normalized.name) {
      throw new Error("Customer name is required.");
    }
    await writeJson(this.getCustomerRoot(dataRoot, normalized.id), normalized);
    await this.appendAudit("customer_saved", normalized.id, `Saved customer ${normalized.name}.`);
    const customers = await this.listCustomers();
    return customers.find((item) => item.id === normalized.id) || { ...normalized, jobRefs: [] };
  }

  async upsertNamedCustomer(seed) {
    const customers = await this.listCustomers();
    const targetName = normalizeText(seed?.name || "");
    const existing = customers.find((customer) => normalizeText(customer.name) === targetName) || null;
    return this.saveCustomer({
      ...(existing || {}),
      ...seed,
      id: existing?.id || seed?.id || randomId("customer")
    });
  }

  async deleteTemplate(id) {
    const dataRoot = await this.requireDataFolder();
    await fs.rm(path.join(dataRoot, "templates", "operations", `${safeFileName(id)}.json`), { force: true });
    await this.appendAudit("template_deleted", id, `Deleted template ${id}.`);
    return true;
  }

  async listKanbanCards() {
    const dataRoot = await this.requireDataFolder();
    const root = path.join(dataRoot, "kanban");
    const entries = await fs.readdir(root, { withFileTypes: true });
    const cards = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const card = await readJson(path.join(root, entry.name, "card.json"), null);
      if (!card?.id) {
        continue;
      }
      const normalized = this.normalizeKanbanCard(card);
      cards.push({
        id: normalized.id,
        itemName: normalized.itemName,
        internalInventoryNumber: normalized.internalInventoryNumber,
        vendor: normalized.vendor,
        category: normalized.category,
        department: normalized.department,
        storageLocation: normalized.storageLocation,
        orderingNotes: normalized.orderingNotes,
        active: normalized.active,
        archivedAt: normalized.archivedAt,
        updatedAt: normalized.updatedAt
      });
    }
    return cards.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async loadKanbanCard(cardId, options = {}) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getKanbanRoot(dataRoot, cardId);
    const card = await readJson(path.join(root, "card.json"), null);
    if (!card) {
      return null;
    }
    if (options.acquireLock) {
      await this.acquireLock("kanban", cardId, path.join(root, "card.json"));
    }
    return this.normalizeKanbanCard(card);
  }

  async saveKanbanCard(card) {
    const dataRoot = await this.requireDataFolder();
    const timestamp = nowIso();
    const normalized = this.normalizeKanbanCard({
      ...card,
      createdAt: card?.createdAt || timestamp,
      updatedAt: timestamp
    });
    const nextInventoryNumber = normalizeText(normalized.internalInventoryNumber);
    if (nextInventoryNumber) {
      const existingCards = await this.listKanbanCards();
      const duplicate = existingCards.find((item) => item.id !== normalized.id && normalizeText(item.internalInventoryNumber) === nextInventoryNumber);
      if (duplicate) {
        throw new Error(`Kanban inventory number already exists: ${normalized.internalInventoryNumber}`);
      }
    }
    const root = this.getKanbanRoot(dataRoot, normalized.id);
    await ensureDir(path.join(root, "assets"));
    await writeJson(path.join(root, "card.json"), normalized);
    await writeText(path.join(root, "history.md"), this.kanbanHistoryMarkdown(normalized));
    await this.appendAudit("kanban_saved", normalized.id, `Saved kanban card ${normalized.itemName || normalized.internalInventoryNumber || normalized.id}.`);
    await this.rebuildIndex();
    return this.loadKanbanCard(normalized.id);
  }

  async archiveKanbanCard(cardId) {
    const card = await this.loadKanbanCard(cardId);
    if (!card) {
      throw new Error(`Kanban card not found: ${cardId}`);
    }
    const saved = await this.saveKanbanCard({
      ...card,
      active: false,
      archivedAt: nowIso()
    });
    await this.appendAudit("kanban_archived", cardId, `Archived kanban card ${card.itemName || card.internalInventoryNumber || card.id}.`);
    return saved;
  }

  async unarchiveKanbanCard(cardId) {
    const card = await this.loadKanbanCard(cardId);
    if (!card) {
      throw new Error(`Kanban card not found: ${cardId}`);
    }
    const saved = await this.saveKanbanCard({
      ...card,
      active: true,
      archivedAt: ""
    });
    await this.appendAudit("kanban_unarchived", cardId, `Unarchived kanban card ${card.itemName || card.internalInventoryNumber || card.id}.`);
    return saved;
  }

  async deleteKanbanCard(cardId) {
    const card = await this.loadKanbanCard(cardId);
    if (!card) {
      throw new Error(`Kanban card not found: ${cardId}`);
    }
    if (card.active !== false) {
      throw new Error("Only archived Kanban cards can be deleted.");
    }
    const root = this.kanbanRoot(cardId);
    await removePath(root);
    await this.appendAudit("kanban_deleted", cardId, `Deleted archived kanban card ${card.itemName || card.internalInventoryNumber || card.id}.`);
    await this.rebuildIndex();
    return { ok: true };
  }

  async chooseKanbanPhoto(cardId, mainWindow = null) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Kanban Photo",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    const sourcePath = path.resolve(result.filePaths[0]);
    const extension = path.extname(sourcePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      throw new Error("Only image files can be used as Kanban photos.");
    }
    const dataRoot = await this.requireDataFolder();
    const root = this.getKanbanRoot(dataRoot, cardId || randomId("kanban"));
    const destination = await copyFileUnique(sourcePath, path.join(root, "assets"), "photo-");
    return this.normalizeKanbanPhoto({
      id: randomId("photo"),
      originalFilename: path.basename(sourcePath),
      storedFilename: path.basename(destination),
      relativePath: path.relative(dataRoot, destination).replaceAll("\\", "/"),
      attachedAt: nowIso()
    });
  }

  async importKanbanFromUrl(url) {
    const purchaseUrl = String(url || "").trim();
    if (!purchaseUrl) {
      throw new Error("Enter a product URL to import.");
    }
    let validatedUrl = "";
    try {
      const parsed = new URL(purchaseUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http and https URLs are supported.");
      }
      validatedUrl = parsed.toString();
    } catch (error) {
      throw new Error(`Invalid product URL: ${error.message}`);
    }

    const dataRoot = await this.requireDataFolder();
    const preferences = await this.loadPreferences(dataRoot);
    const cardId = randomId("kanban");
    const inferredVendor = inferVendorName(validatedUrl);
    const warnings = [];
    let draft = this.normalizeKanbanCard({
      id: cardId,
      purchaseUrl: validatedUrl,
      vendor: inferredVendor
    });

    try {
      const { html, imported, usedRenderedFallback } = await this.loadKanbanProductContext(validatedUrl);
      warnings.push(...(imported.warnings || []));
      if (usedRenderedFallback) {
        warnings.push("Used browser-rendered page fallback for better product extraction.");
      }
      const baseDraft = this.normalizeKanbanCard({
        ...draft,
        itemName: imported.itemName || draft.itemName,
        vendor: imported.vendor || draft.vendor,
        purchaseUrl: imported.purchaseUrl || draft.purchaseUrl,
        packSize: imported.packSize || draft.packSize,
        description: imported.description || draft.description,
        orderingNotes: mergeKanbanOrderingNotes(draft.orderingNotes, imported.vendorPartNumber)
      });
      draft = baseDraft;
      const imagePromise = imported.imageUrl
        ? this.downloadRemoteFile(imported.imageUrl, path.join(this.getKanbanRoot(dataRoot, cardId), "assets"), "vendor-photo")
        : null;
      const aiPromise = preferences.openaiApiKey
        ? enrichKanbanCardDraft({
          apiKey: preferences.openaiApiKey,
          card: draft,
          categories: preferences.kanbanCategories || [],
          vendorContext: { html, scraped: imported }
        })
        : null;

      if (!preferences.openaiApiKey) {
        warnings.push("No OpenAI API key is set. Imported basic page metadata only.");
      }

      const [imageResult, aiResult] = await Promise.allSettled([
        imagePromise || Promise.resolve(null),
        aiPromise || Promise.resolve(null)
      ]);

      if (imageResult.status === "fulfilled" && imageResult.value) {
        draft.photo = this.normalizeKanbanPhoto({
          id: randomId("photo"),
          originalFilename: path.basename(new URL(imported.imageUrl).pathname) || "vendor-photo",
          storedFilename: path.basename(imageResult.value),
          relativePath: path.relative(dataRoot, imageResult.value).replaceAll("\\", "/"),
          sourceUrl: imported.imageUrl,
          attachedAt: nowIso()
        });
      } else if (imageResult.status === "rejected") {
        warnings.push(`Could not download product thumbnail: ${imageResult.reason.message}`);
      }

      if (aiResult.status === "fulfilled" && aiResult.value) {
        const enriched = aiResult.value;
        draft = this.normalizeKanbanCard({
          ...draft,
          itemName: enriched.itemName || draft.itemName,
          description: enriched.description || draft.description,
          orderingNotes: enriched.orderingNotes || draft.orderingNotes,
          category: enriched.category || draft.category,
          vendor: enriched.vendor || draft.vendor,
          minimumLevel: enriched.minimumLevel || draft.minimumLevel,
          orderQuantity: enriched.orderQuantity || draft.orderQuantity,
          packSize: enriched.packSize || draft.packSize
        });
      } else if (aiResult.status === "rejected") {
        warnings.push(`Could not enrich the card with AI: ${aiResult.reason.message}`);
      }
    } catch (error) {
      warnings.push(`Could not import product details automatically: ${error.message}`);
    }

    await this.appendAudit("kanban_url_import_prepared", cardId, `Prepared kanban card draft from ${validatedUrl}.`);
    return { card: draft, warnings };
  }

  async aiFillKanbanCard(card) {
    const preferences = await this.loadPreferences();
    const normalizedCard = this.normalizeKanbanCard(card);
    const warnings = [];
    let vendorContext = null;

    if (normalizedCard.purchaseUrl) {
      try {
        const { html, imported: scraped, usedRenderedFallback } = await this.loadKanbanProductContext(normalizedCard.purchaseUrl);
        warnings.push(...(scraped.warnings || []));
        if (usedRenderedFallback) {
          warnings.push("Used browser-rendered page fallback for better product extraction.");
        }
        vendorContext = { html, scraped };
      } catch (error) {
        warnings.push(`Could not refresh vendor page details: ${error.message}`);
      }
    }

    const baseCard = this.normalizeKanbanCard({
      ...normalizedCard,
      vendor: vendorContext?.scraped?.vendor || normalizedCard.vendor,
      purchaseUrl: vendorContext?.scraped?.purchaseUrl || normalizedCard.purchaseUrl,
      packSize: vendorContext?.scraped?.packSize || normalizedCard.packSize,
      orderingNotes: mergeKanbanOrderingNotes(normalizedCard.orderingNotes, vendorContext?.scraped?.vendorPartNumber)
    });

    const enriched = await enrichKanbanCardDraft({
      apiKey: preferences.openaiApiKey,
      card: baseCard,
      categories: preferences.kanbanCategories || [],
      vendorContext
    });

    const updatedCard = this.normalizeKanbanCard({
      ...baseCard,
      itemName: enriched.itemName || baseCard.itemName,
      description: enriched.description || baseCard.description,
      orderingNotes: enriched.orderingNotes || baseCard.orderingNotes,
      category: enriched.category || baseCard.category,
      vendor: enriched.vendor || baseCard.vendor,
      minimumLevel: enriched.minimumLevel || baseCard.minimumLevel,
      orderQuantity: enriched.orderQuantity || baseCard.orderQuantity,
      packSize: enriched.packSize || baseCard.packSize
    });
    await this.appendAudit("kanban_ai_fill_prepared", updatedCard.id, `Prepared AI enrichment for kanban card ${updatedCard.itemName || updatedCard.internalInventoryNumber || updatedCard.id}.`);
    return {
      card: updatedCard,
      warnings
    };
  }

  async generateKanbanImage(card) {
    const dataRoot = await this.requireDataFolder();
    const preferences = await this.loadPreferences(dataRoot);
    const normalizedCard = this.normalizeKanbanCard(card);
    const generated = await generateKanbanReferenceImage({
      apiKey: preferences.openaiApiKey,
      card: normalizedCard
    });
    const assetsRoot = path.join(this.getKanbanRoot(dataRoot, normalizedCard.id), "assets");
    await ensureDir(assetsRoot);
    const filename = `ai-generated-${Date.now()}${generated.extension || ".png"}`;
    const destination = path.join(assetsRoot, filename);
    await fs.writeFile(destination, generated.buffer);
    const updatedCard = this.normalizeKanbanCard({
      ...normalizedCard,
      photo: {
        id: randomId("photo"),
        originalFilename: filename,
        storedFilename: filename,
        relativePath: path.relative(dataRoot, destination).replaceAll("\\", "/"),
        sourceUrl: "ai-generated",
        attachedAt: nowIso()
      }
    });
    await this.appendAudit("kanban_ai_image_generated", updatedCard.id, `Generated AI image for kanban card ${updatedCard.itemName || updatedCard.internalInventoryNumber || updatedCard.id}.`);
    return updatedCard;
  }

  async waitForPrintSelector(printWindow, selector, timeoutMs = 15000) {
    if (!printWindow?.webContents) {
      return;
    }
    await printWindow.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const selector = ${JSON.stringify(selector)};
        const timeoutMs = ${Number(timeoutMs)};
        const startedAt = Date.now();
        const finish = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        const check = () => {
          const fatal = document.querySelector(".fatal");
          if (fatal) {
            reject(new Error(fatal.innerText || "Print route failed to render."));
            return;
          }
          if (document.querySelector(selector)) {
            finish();
            return;
          }
          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(\`Timed out waiting for print layout: \${selector}\`));
            return;
          }
          setTimeout(check, 50);
        };
        check();
      });
    `, true);
  }

  async exportKanbanPdf(cardId, destinationPath, sizeId = "", options = {}) {
    const dataRoot = await this.requireDataFolder();
    const card = await this.loadKanbanCard(cardId);
    const preferences = await this.loadPreferences(dataRoot);
    if (!card) {
      throw new Error("Kanban card not found.");
    }
    const selectedSize = (preferences.kanbanPrintSizes || []).find((item) => item.id === sizeId)
      || (preferences.kanbanPrintSizes || []).find((item) => item.id === preferences.defaultKanbanPrintSizeId)
      || DEFAULT_KANBAN_PRINT_SIZES[0];
    const monochrome = options?.monochrome === true;
    const effectiveWidth = Number(selectedSize.widthIn || 2) * 0.93;
    const effectiveHeight = Number(selectedSize.heightIn || 4) * 0.93;
    let outputPath = destinationPath;
    if (!outputPath) {
      const exportFolder = path.join(this.getKanbanRoot(dataRoot, card.id), "print");
      const sizeSuffix = safeFileName(selectedSize.name || `${selectedSize.widthIn}x${selectedSize.heightIn}`);
      outputPath = await uniquePdfPath(
        exportFolder,
        `${safeFileName(card.internalInventoryNumber || card.itemName || card.id)}-${sizeSuffix}-kanban-card-${pdfTimestamp()}`
      );
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1000,
      height: 1400,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    if (this.devServerUrl) {
      await printWindow.loadURL(`${this.devServerUrl}#/print/kanban/${encodeURIComponent(cardId)}?size=${encodeURIComponent(selectedSize.id)}${monochrome ? "&bw=1" : ""}`);
    } else {
      await printWindow.loadFile(path.join(this.app.getAppPath(), "dist", "index.html"), {
        hash: `/print/kanban/${encodeURIComponent(cardId)}?size=${encodeURIComponent(selectedSize.id)}${monochrome ? "&bw=1" : ""}`
      });
    }
    await this.waitForPrintSelector(printWindow, ".kanban-label-card-back");
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: {
        width: effectiveWidth,
        height: effectiveHeight
      },
      printBackground: true,
      margins: {
        marginType: "custom",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported Kanban PDF: ${openError}`);
    }
    await this.appendAudit("kanban_pdf_exported", cardId, `Exported kanban card PDF to ${outputPath}.`);
    return outputPath;
  }

  async exportMaterialPdf(materialId, destinationPath, sizeId = "", options = {}) {
    const dataRoot = await this.requireDataFolder();
    const material = await this.loadMaterial(materialId);
    const preferences = await this.loadPreferences(dataRoot);
    if (!material) {
      throw new Error("Material not found.");
    }
    const selectedSize = (preferences.kanbanPrintSizes || []).find((item) => item.id === sizeId)
      || (preferences.kanbanPrintSizes || []).find((item) => item.id === preferences.defaultKanbanPrintSizeId)
      || DEFAULT_KANBAN_PRINT_SIZES[0];
    const monochrome = options?.monochrome === true;
    const effectiveWidth = Number(selectedSize.widthIn || 2) * 0.93;
    const effectiveHeight = Number(selectedSize.heightIn || 4) * 0.93;
    let outputPath = destinationPath;
    if (!outputPath) {
      const exportFolder = path.join(this.getMaterialRoot(dataRoot, material.id), "print");
      const sizeSuffix = safeFileName(selectedSize.name || `${selectedSize.widthIn}x${selectedSize.heightIn}`);
      outputPath = await uniquePdfPath(
        exportFolder,
        `${safeFileName(material.serialCode || material.materialType || material.id)}-${sizeSuffix}-material-label-${pdfTimestamp()}`
      );
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1000,
      height: 1400,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    if (this.devServerUrl) {
      await printWindow.loadURL(`${this.devServerUrl}#/print/material/${encodeURIComponent(materialId)}?size=${encodeURIComponent(selectedSize.id)}${monochrome ? "&bw=1" : ""}`);
    } else {
      await printWindow.loadFile(path.join(this.app.getAppPath(), "dist", "index.html"), {
        hash: `/print/material/${encodeURIComponent(materialId)}?size=${encodeURIComponent(selectedSize.id)}${monochrome ? "&bw=1" : ""}`
      });
    }
    await this.waitForPrintSelector(printWindow, ".material-label-card");
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: {
        width: effectiveWidth,
        height: effectiveHeight
      },
      printBackground: true,
      margins: {
        marginType: "custom",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported material label PDF: ${openError}`);
    }
    await this.appendAudit("material_pdf_exported", materialId, `Exported material label PDF to ${outputPath}.`);
    return outputPath;
  }

  async listJobSummaries() {
    const dataRoot = await this.requireDataFolder();
    const jobsRoot = path.join(dataRoot, "jobs");
    const entries = await fs.readdir(jobsRoot, { withFileTypes: true });
    const jobs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const header = await readJson(path.join(jobsRoot, entry.name, "job.json"), null);
      if (!header?.id) {
        continue;
      }
      jobs.push(await this.buildJobSummaryFromHeader(header));
    }
    return jobs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async generateNextJobNumber() {
    const jobs = await this.listJobSummaries();
    const preferences = await this.loadPreferences();
    const configuredPrefix = String(preferences.jobPrefix || "").trim();
    const startingNumber = Number.isFinite(Number(preferences.startingJobNumber)) ? Number(preferences.startingJobNumber) : 1;
    const candidates = jobs
      .map((job) => {
        const value = String(job.jobNumber || "").trim();
        const match = value.match(/^(.*?)(\d+)$/);
        if (!match) {
          return null;
        }
        return {
          prefix: match[1],
          digits: match[2],
          number: Number(match[2]),
          updatedAt: String(job.updatedAt || "")
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.number - a.number || String(b.updatedAt).localeCompare(String(a.updatedAt)));

    const preferredCandidates = configuredPrefix
      ? candidates.filter((candidate) => candidate.prefix === configuredPrefix)
      : candidates;

    if (!preferredCandidates.length) {
      const digits = Math.max(String(startingNumber).length, 4);
      return `${configuredPrefix}${String(startingNumber).padStart(digits, "0")}`;
    }

    const next = preferredCandidates[0];
    return `${next.prefix}${String(next.number + 1).padStart(next.digits.length, "0")}`;
  }

  async generateNextKanbanInventoryNumber() {
    const cards = await this.listKanbanCards();
    const preferences = await this.loadPreferences();
    const configuredPrefix = String(preferences.kanbanInventoryPrefix || "").trim();
    const startingNumber = Number.isFinite(Number(preferences.kanbanStartingInventoryNumber)) ? Number(preferences.kanbanStartingInventoryNumber) : 1;
    const candidates = cards
      .map((card) => {
        const value = String(card.internalInventoryNumber || "").trim();
        const match = value.match(/^(.*?)(\d+)$/);
        if (!match) {
          return null;
        }
        return {
          prefix: match[1],
          digits: match[2],
          number: Number(match[2]),
          updatedAt: String(card.updatedAt || "")
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.number - a.number || String(b.updatedAt).localeCompare(String(a.updatedAt)));

    const preferredCandidates = configuredPrefix
      ? candidates.filter((candidate) => candidate.prefix === configuredPrefix)
      : candidates;

    if (!preferredCandidates.length) {
      const digits = Math.max(String(startingNumber).length, 4);
      return `${configuredPrefix}${String(startingNumber).padStart(digits, "0")}`;
    }

    const next = preferredCandidates[0];
    return `${next.prefix}${String(next.number + 1).padStart(next.digits.length, "0")}`;
  }

  async buildJobSummaryFromHeader(header) {
    return {
      id: header.id,
      jobNumber: header.jobNumber || "",
      customerId: header.customerId || "",
      customer: header.customer || "",
      status: header.status || "Open",
      priority: header.priority || "Normal",
      dueDate: header.dueDate || "",
      revision: header.revision?.number || "",
      partCount: Number(header.partCount || 0),
      operationCount: Number(header.operationCount || 0),
      updatedAt: header.updatedAt || header.createdAt || "",
      routeSummary: header.routeSummary || "",
      active: header.active !== false
    };
  }

  getJobRoot(dataRoot, jobId) {
    return path.join(dataRoot, "jobs", safeFileName(jobId));
  }

  getNonconformanceRoot(dataRoot, ncrId) {
    return path.join(dataRoot, "nonconformances", safeFileName(ncrId));
  }

  getNonconformanceAttachmentsRoot(dataRoot, ncrId) {
    return path.join(this.getNonconformanceRoot(dataRoot, ncrId), "attachments");
  }

  getKanbanRoot(dataRoot, cardId) {
    return path.join(dataRoot, "kanban", safeFileName(cardId));
  }

  getMaterialRoot(dataRoot, materialId) {
    return path.join(dataRoot, "materials", safeFileName(materialId));
  }

  getInstrumentRoot(dataRoot, instrumentId) {
    return path.join(dataRoot, "metrology", "instruments", safeFileName(instrumentId));
  }

  getCustomerRoot(dataRoot, customerId) {
    return path.join(dataRoot, "customers", `${safeFileName(customerId)}.json`);
  }

  getPartRoot(dataRoot, jobId, partId) {
    return path.join(this.getJobRoot(dataRoot, jobId), "parts", safeFileName(partId));
  }

  getJobDocumentsRoot(dataRoot, jobId) {
    return path.join(this.getJobRoot(dataRoot, jobId), "documents");
  }

  getPartDocumentsRoot(dataRoot, jobId, partId) {
    return path.join(this.getPartRoot(dataRoot, jobId, partId), "documents");
  }

  async loadJob(jobId, options = {}) {
    const dataRoot = await this.requireDataFolder();
    const jobRoot = this.getJobRoot(dataRoot, jobId);
    const header = await readJson(path.join(jobRoot, "job.json"), null);
    if (!header) {
      return null;
    }
    if (options.acquireLock) {
      await this.acquireLock("job", jobId, path.join(jobRoot, "job.json"));
    }
    const partsRoot = path.join(jobRoot, "parts");
    const partEntries = (await pathExists(partsRoot)) ? await fs.readdir(partsRoot, { withFileTypes: true }) : [];
    const parts = [];
    const legacyJobTools = Array.isArray(header.tools) ? header.tools : [];
    for (const entry of partEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const partRoot = path.join(partsRoot, entry.name);
      const part = await readJson(path.join(partRoot, "part.json"), null);
      if (!part?.id) {
        continue;
      }
      const opsRoot = path.join(partRoot, "operations");
      const opEntries = (await pathExists(opsRoot)) ? await fs.readdir(opsRoot, { withFileTypes: true }) : [];
      const operations = [];
      for (const opEntry of opEntries) {
        if (!opEntry.isDirectory()) {
          continue;
        }
        const opRoot = path.join(opsRoot, opEntry.name);
        const operation = await readJson(path.join(opRoot, "operation.json"), null);
        if (!operation?.id) {
          continue;
        }
        operation.workInstructions = await readText(path.join(opRoot, "work-instructions.md"), operation.workInstructions || "");
        operations.push(this.normalizeOperation(operation, operations.length));
      }
      operations.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
      parts.push(this.normalizePart({
        ...part,
        documents: (Array.isArray(part.documents) ? part.documents : []).map((document) => this.normalizeDocument(document)),
        operations
      }));
    }
    parts.sort((a, b) => String(a.partNumber || a.partName || "").localeCompare(String(b.partNumber || b.partName || "")));
    const totalOperations = parts.reduce((sum, part) => sum + part.operations.length, 0);
    for (const part of parts) {
      for (const operation of part.operations) {
        if (!operation.tools.length && legacyJobTools.length) {
          if (operation.jobToolRefs.length) {
            operation.tools = operation.jobToolRefs
              .map((toolId) => legacyJobTools.find((tool) => tool.id === toolId))
              .filter(Boolean)
              .map((tool) => this.normalizeTool(tool));
          } else if (totalOperations === 1) {
            operation.tools = legacyJobTools.map((tool) => this.normalizeTool(tool));
          }
        }
      }
    }
    return {
      ...header,
      documents: (Array.isArray(header.documents) ? header.documents : []).map((document) => this.normalizeDocument(document)),
      tools: undefined,
      parts
    };
  }

  normalizeDocument(document, categoryFallback = "Other") {
    const originalFilename = String(document?.originalFilename || document?.storedFilename || document?.displayName || "Document").trim();
    const storedFilename = String(document?.storedFilename || originalFilename).trim();
    const fileType = String(document?.fileType || path.extname(storedFilename).slice(1)).trim().toUpperCase();
    return {
      id: document?.id || randomId("document"),
      originalFilename,
      storedFilename,
      storedPath: String(document?.storedPath || "").replaceAll("\\", "/"),
      originalPath: String(document?.originalPath || "").trim(),
      fileType,
      category: String(document?.category || categoryFallback || "Other").trim() || "Other",
      description: String(document?.description || "").trim(),
      displayName: String(document?.displayName || originalFilename).trim() || originalFilename,
      attachedAt: String(document?.attachedAt || nowIso()).trim() || nowIso(),
      active: document?.active !== false,
      archivedAt: String(document?.archivedAt || "").trim(),
      revisedAt: String(document?.revisedAt || "").trim(),
      revisionNumber: Number(document?.revisionNumber || 1) || 1,
      revisions: (Array.isArray(document?.revisions) ? document.revisions : []).map((revision) => ({
        originalFilename: String(revision?.originalFilename || "").trim(),
        storedFilename: String(revision?.storedFilename || "").trim(),
        storedPath: String(revision?.storedPath || "").replaceAll("\\", "/"),
        originalPath: String(revision?.originalPath || "").trim(),
        fileType: String(revision?.fileType || "").trim().toUpperCase(),
        attachedAt: String(revision?.attachedAt || "").trim(),
        revisedAt: String(revision?.revisedAt || "").trim(),
        revisionNumber: Number(revision?.revisionNumber || 1) || 1
      }))
      };
    }

  normalizeKanbanPhoto(photo) {
    if (!photo?.relativePath && !photo?.storedPath && !photo?.path) {
      return null;
    }
    const originalFilename = String(photo?.originalFilename || photo?.storedFilename || photo?.name || "Photo").trim();
    const storedFilename = String(photo?.storedFilename || originalFilename).trim();
    return {
      id: photo?.id || randomId("photo"),
      originalFilename,
      storedFilename,
      relativePath: String(photo?.relativePath || photo?.storedPath || photo?.path || "").replaceAll("\\", "/"),
      sourceUrl: String(photo?.sourceUrl || "").trim(),
      attachedAt: String(photo?.attachedAt || nowIso()).trim() || nowIso()
    };
  }

  normalizeKanbanCard(card) {
    const orderingNotes = mergeKanbanOrderingNotes(card?.orderingNotes, card?.vendorPartNumber);
    return {
      id: card?.id || randomId("kanban"),
      itemName: String(card?.itemName || "").trim(),
      internalInventoryNumber: String(card?.internalInventoryNumber || "").trim(),
      minimumLevel: String(card?.minimumLevel || "").trim(),
      maximumLevel: String(card?.maximumLevel || "").trim(),
      orderQuantity: String(card?.orderQuantity || "").trim(),
      storageLocation: String(card?.storageLocation || "").trim(),
      department: String(card?.department || "").trim(),
      category: String(card?.category || "").trim(),
      vendor: String(card?.vendor || "").trim(),
      purchaseUrl: String(card?.purchaseUrl || "").trim(),
      orderingNotes,
      packSize: String(card?.packSize || "").trim(),
      description: String(card?.description || "").trim(),
      photo: this.normalizeKanbanPhoto(card?.photo),
      active: card?.active !== false,
      archivedAt: String(card?.archivedAt || "").trim(),
      createdAt: String(card?.createdAt || nowIso()).trim() || nowIso(),
      updatedAt: String(card?.updatedAt || nowIso()).trim() || nowIso()
    };
  }

  kanbanHistoryMarkdown(card) {
    return [
      `# Kanban Card: ${card.itemName || card.internalInventoryNumber || card.id}`,
      "",
      `Generated: ${nowIso()}`,
      "",
      `- Inventory Number: ${card.internalInventoryNumber || "-"}`,
      `- Vendor: ${card.vendor || "-"}`,
      `- Category: ${card.category || "-"}`,
      `- Department: ${card.department || "-"}`,
      `- Storage Location: ${card.storageLocation || "-"}`,
      `- Minimum Level: ${card.minimumLevel || "-"}`,
      `- Order Quantity: ${card.orderQuantity || "-"}`,
      `- Pack Size: ${card.packSize || "-"}`,
      `- Purchase URL: ${card.purchaseUrl || "-"}`,
      `- Active: ${card.active !== false ? "Yes" : "No"}`,
      "",
      "## Description",
      "",
      card.description || "No description.",
      "",
      "## Ordering Notes",
      "",
      card.orderingNotes || "No ordering notes."
    ].join("\n");
  }

  normalizeNonconformance(record) {
    const text = (value) => String(value || "").trim();
    const optionValue = (value, options, fallback = "") => {
      const normalized = text(value);
      return options.includes(normalized) ? normalized : fallback;
    };
    const yesNo = (value, fallback = "No") => {
      const normalized = text(value);
      return normalized === "Yes" || normalized === "No" ? normalized : fallback;
    };
    const legacyDescription = text(record?.nonconformanceDescription || record?.issueDescription || record?.issue || record?.issueSummary);
    const legacyRequirement = text(record?.requirementViolated || record?.requirementSpecificationViolated);
    const legacyActual = text(record?.actualConditionFound || "");
    const legacyRootCause = text(record?.rootCause || record?.rootCauseNotes);
    const legacyClosureNotes = text(record?.closureNotes);
    const legacyContainment = text(record?.containmentAction);
    const legacyDisposition = text(record?.disposition);
    const legacyInspectionReference = text(record?.inspectionRecordReference || record?.inspectionContextReference);
    const active = record?.active !== false;
    const disposition = legacyDisposition;
    const customerApprovalRequired = (() => {
      const explicit = text(record?.customerApprovalRequired);
      if (explicit === "Yes" || explicit === "No") {
        return explicit;
      }
      if (disposition === "Use As-Is") {
        return "Yes";
      }
      return "No";
    })();
    const normalizeAttachment = (attachment) => {
      const normalized = this.normalizeDocument(attachment);
      return {
        ...normalized,
        attachmentType: optionValue(attachment?.attachmentType || attachment?.category, NONCONFORMANCE_ATTACHMENT_TYPE_OPTIONS, "Other"),
        attachmentStatus: optionValue(attachment?.attachmentStatus || attachment?.status, NONCONFORMANCE_ATTACHMENT_STATUS_OPTIONS, normalized.active === false ? "Archived" : "Current"),
        uploadedBy: text(attachment?.uploadedBy || attachment?.reportedBy || ""),
        uploadedDate: text(attachment?.uploadedDate || attachment?.attachedAt || normalized.attachedAt),
        description: text(attachment?.description || ""),
        category: optionValue(attachment?.attachmentType || attachment?.category, NONCONFORMANCE_ATTACHMENT_TYPE_OPTIONS, "Other"),
        status: optionValue(attachment?.attachmentStatus || attachment?.status, NONCONFORMANCE_ATTACHMENT_STATUS_OPTIONS, normalized.active === false ? "Archived" : "Current")
      };
    };
    const auditLog = Array.isArray(record?.auditLog) ? record.auditLog : [];
    return {
      id: record?.id || randomId("ncr"),
      ncrNumber: text(record?.ncrNumber),
      status: optionValue(record?.status, NONCONFORMANCE_STATUS_OPTIONS, "Open"),
      severity: optionValue(record?.severity, NONCONFORMANCE_SEVERITY_OPTIONS, "Minor"),
      source: optionValue(record?.source, NONCONFORMANCE_SOURCE_OPTIONS, ""),
      jobId: text(record?.jobId),
      jobNumber: text(record?.jobNumber || record?.internalJobNumber),
      customer: text(record?.customer),
      customerPoNumber: text(record?.customerPoNumber),
      internalJobNumber: text(record?.internalJobNumber || record?.jobNumber),
      salesOrderQuoteNumber: text(record?.salesOrderQuoteNumber),
      partId: text(record?.partId),
      partNumber: text(record?.partNumber),
      partName: text(record?.partName),
      partRevision: text(record?.partRevision),
      drawingRevision: text(record?.drawingRevision),
      modelRevision: text(record?.modelRevision),
      operationNumber: text(record?.operationNumber || record?.operation || record?.opNumber),
      supplierResponsible: text(record?.supplierResponsible || record?.vendorResponsible),
      lotBatchSerialNumber: text(record?.lotBatchSerialNumber),
      quantityMade: text(record?.quantityMade),
      quantityInspected: text(record?.quantityInspected),
      quantityAccepted: text(record?.quantityAccepted),
      quantityRejected: text(record?.quantityRejected),
      inspectionCharacteristicId: text(record?.inspectionCharacteristicId),
      inspectionInstanceId: text(record?.inspectionInstanceId),
      reportedAt: text(record?.reportedAt || record?.dateReported || nowIso()) || nowIso(),
      reportedBy: text(record?.reportedBy),
      owner: text(record?.owner),
      dueDate: text(record?.dueDate),
      closureDate: text(record?.closureDate),
      closedBy: text(record?.closedBy),
      quantityAffected: text(record?.quantityAffected),
      issueSummary: text(record?.issueSummary),
      issueDescription: text(record?.issueDescription || legacyDescription),
      requirementViolated: legacyRequirement,
      actualConditionFound: legacyActual,
      detectionMethod: optionValue(record?.detectionMethod, NONCONFORMANCE_DETECTION_METHOD_OPTIONS, ""),
      inspectionEquipmentId: text(record?.inspectionEquipmentGageId || record?.inspectionEquipmentId),
      inspectionRecordReference: legacyInspectionReference,
      relatedCharacteristicNumber: text(record?.relatedCharacteristicNumber),
      units: text(record?.units),
      nonconformanceDescription: legacyDescription,
      immediateRisk: text(record?.immediateRisk),
      productShipped: yesNo(record?.productShipped),
      customerNotificationRequired: yesNo(record?.customerNotificationRequired),
      customerApprovalRequired,
      customerNotificationDate: text(record?.customerNotificationDate),
      customerApprovalReference: text(record?.customerApprovalReference),
      customerApprovalOverrideReason: text(record?.customerApprovalOverrideReason),
      containmentAction: legacyContainment,
      containmentDate: text(record?.containmentDate),
      containmentBy: text(record?.containmentBy),
      containmentVerifiedBy: text(record?.containmentVerifiedBy),
      containmentNotes: text(record?.containmentNotes),
      disposition,
      correctionTaken: text(record?.correctionTaken),
      dispositionApprovedBy: text(record?.dispositionApprovedBy),
      dispositionDate: text(record?.dispositionDate),
      reworkInstructions: text(record?.reworkInstructions),
      reinspectionRequired: yesNo(record?.reinspectionRequired),
      reinspectionResult: optionValue(record?.reinspectionResult, NONCONFORMANCE_REINSPECTION_RESULT_OPTIONS, "Not Required"),
      rootCauseRequired: yesNo(record?.rootCauseRequired, "Yes"),
      rootCause: legacyRootCause,
      rootCauseCategory: optionValue(record?.rootCauseCategory, NONCONFORMANCE_ROOT_CAUSE_CATEGORY_OPTIONS, ""),
      rootCauseJustification: text(record?.rootCauseJustification),
      correctiveActionRequired: yesNo(record?.correctiveActionRequired, "Yes"),
      correctiveActionTaken: text(record?.correctiveActionTaken),
      correctiveActionOwner: text(record?.correctiveActionOwner),
      correctiveActionDueDate: text(record?.correctiveActionDueDate),
      correctiveActionCompletedDate: text(record?.correctiveActionCompletedDate),
      correctiveActionVerifiedBy: text(record?.correctiveActionVerifiedBy),
      correctiveActionJustification: text(record?.correctiveActionJustification),
      effectivenessVerificationMethod: optionValue(record?.effectivenessVerificationMethod, NONCONFORMANCE_EFFECTIVENESS_METHOD_OPTIONS, ""),
      effectivenessVerificationResult: optionValue(record?.effectivenessVerificationResult, NONCONFORMANCE_EFFECTIVENESS_RESULT_OPTIONS, "Pending"),
      effectivenessVerificationDate: text(record?.effectivenessVerificationDate),
      closureNotes: legacyClosureNotes,
      closureApproval: text(record?.closureApproval),
      cancellationReason: text(record?.cancellationReason),
      reopenReason: text(record?.reopenReason),
      active,
      archivedAt: text(record?.archivedAt),
      createdAt: text(record?.createdAt || nowIso()) || nowIso(),
      createdBy: text(record?.createdBy || record?.reportedBy),
      updatedAt: text(record?.updatedAt || nowIso()) || nowIso(),
      auditLog: auditLog.map((entry) => ({
        id: entry?.id || randomId("ncr-audit"),
        eventType: text(entry?.eventType || entry?.type),
        field: text(entry?.field),
        oldValue: entry?.oldValue ?? "",
        newValue: entry?.newValue ?? "",
        changedBy: text(entry?.changedBy || entry?.user),
        changedAt: text(entry?.changedAt || entry?.timestamp || nowIso()),
        message: text(entry?.message)
      })),
      attachments: (Array.isArray(record?.attachments) ? record.attachments : []).map((attachment) => normalizeAttachment(attachment))
    };
  }

  nonconformanceHistoryMarkdown(record) {
    const recentAudit = [...(record.auditLog || [])]
      .sort((a, b) => String(b.changedAt || "").localeCompare(String(a.changedAt || "")))
      .slice(0, 12);
    return [
      `# Nonconformance Report: ${record.ncrNumber || record.id}`,
      "",
      `Generated: ${nowIso()}`,
      "",
      `- Status: ${record.status || "-"}`,
      `- Severity: ${record.severity || "-"}`,
      `- Source: ${record.source || "-"}`,
      `- Job: ${record.jobNumber || record.jobId || "-"}`,
      `- Part: ${record.partNumber || record.partName || record.partId || "-"}`,
      `- Reported At: ${record.reportedAt || "-"}`,
      `- Reported By: ${record.reportedBy || "-"}`,
      `- Quantity Affected: ${record.quantityAffected || "-"}`,
      `- Disposition: ${record.disposition || "-"}`,
      `- Owner: ${record.owner || "-"}`,
      `- Due Date: ${record.dueDate || "-"}`,
      `- Active: ${record.active !== false ? "Yes" : "No"}`,
      "",
      "## Nonconformance Summary",
      "",
      record.issueSummary || record.nonconformanceDescription || "No issue summary.",
      "",
      "## Requirement Violated",
      "",
      record.requirementViolated || "No requirement listed.",
      "",
      "## Actual Condition Found",
      "",
      record.actualConditionFound || record.issueDescription || "No actual condition recorded.",
      "",
      "## Containment Action",
      "",
      record.containmentAction || "No containment action.",
      "",
      "## Root Cause",
      "",
      record.rootCause || "No root cause notes.",
      "",
      "## Corrective Action",
      "",
      record.correctiveActionTaken || "No corrective action recorded.",
      "",
      "## Closure Notes",
      "",
      record.closureNotes || "No closure notes.",
      "",
      "## Audit Summary",
      "",
      ...(recentAudit.length
        ? recentAudit.map((entry) => `- ${entry.changedAt || "-"} | ${entry.eventType || "change"} | ${entry.message || `${entry.field || "field"} updated`}`)
        : ["- No audit entries recorded."])
    ].join("\n");
  }

  async buildNonconformanceInspectionContext(record) {
    if (!record?.jobId || !record?.partId) {
      return null;
    }
    const job = await this.loadJob(record.jobId);
    const part = job?.parts?.find((item) => item.id === record.partId);
    if (!part) {
      return null;
    }
    const inspection = this.normalizeInspection(part.inspection);
    const characteristic = inspection.characteristics.find((item) => item.id === record.inspectionCharacteristicId) || null;
    const instance = inspection.instances.find((item) => item.id === record.inspectionInstanceId) || null;
    return {
      characteristic: characteristic ? {
        id: characteristic.id,
        number: characteristic.number,
        type: characteristic.type,
        nominal: characteristic.nominal,
        plusTolerance: characteristic.plusTolerance,
        minusTolerance: characteristic.minusTolerance,
        lowerLimit: characteristic.lowerLimit,
        upperLimit: characteristic.upperLimit,
        gageId: characteristic.gageId
      } : null,
      instance: instance ? {
        id: instance.id,
        label: instance.label,
        inspector: instance.inspector,
        inspectedAt: instance.inspectedAt
      } : null
    };
  }

  buildNonconformanceSummary(record) {
    return {
      id: record.id,
      ncrNumber: record.ncrNumber,
      status: record.status,
      severity: record.severity,
      source: record.source,
      disposition: record.disposition,
      jobId: record.jobId,
      jobNumber: record.jobNumber,
      customer: record.customer,
      customerPoNumber: record.customerPoNumber,
      internalJobNumber: record.internalJobNumber,
      partId: record.partId,
      partNumber: record.partNumber,
      partName: record.partName,
      supplierResponsible: record.supplierResponsible,
      rootCauseCategory: record.rootCauseCategory,
      reportedAt: record.reportedAt,
      reportedBy: record.reportedBy,
      quantityAffected: record.quantityAffected,
      issueSummary: record.issueSummary,
      nonconformanceDescription: record.nonconformanceDescription,
      owner: record.owner,
      dueDate: record.dueDate,
      closedBy: record.closedBy,
      closureDate: record.closureDate,
      active: record.active !== false,
      archivedAt: record.archivedAt,
      updatedAt: record.updatedAt
    };
  }

  getNonconformanceChangedBy(record) {
    return String(record?.closedBy || record?.owner || record?.reportedBy || record?.createdBy || "Local User").trim() || "Local User";
  }

  normalizeNonconformanceAttachmentsForAudit(attachments = []) {
    return (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.originalFilename,
      revisionNumber: attachment.revisionNumber || 1,
      active: attachment.active !== false,
      attachmentType: attachment.attachmentType || attachment.category || "Other",
      status: attachment.attachmentStatus || attachment.status || (attachment.active === false ? "Archived" : "Current")
    }));
  }

  buildNonconformanceAuditEntries(previousRecord, nextRecord) {
    const changedAt = String(nextRecord?.updatedAt || nowIso());
    const changedBy = this.getNonconformanceChangedBy(nextRecord);
    const entries = [];
    const pushEntry = (eventType, message, extra = {}) => {
      entries.push({
        id: randomId("ncr-audit"),
        eventType,
        field: String(extra.field || "").trim(),
        oldValue: extra.oldValue ?? "",
        newValue: extra.newValue ?? "",
        changedBy,
        changedAt,
        message
      });
    };
    if (!previousRecord) {
      pushEntry("created", `Created NCR ${nextRecord.ncrNumber || nextRecord.id}.`, {
        newValue: nextRecord.ncrNumber || nextRecord.id
      });
      return entries;
    }
    const trackedFields = [
      "ncrNumber",
      "status",
      "severity",
      "source",
      "customer",
      "customerPoNumber",
      "internalJobNumber",
      "salesOrderQuoteNumber",
      "partNumber",
      "partName",
      "partRevision",
      "drawingRevision",
      "modelRevision",
      "operationNumber",
      "supplierResponsible",
      "lotBatchSerialNumber",
      "quantityMade",
      "quantityInspected",
      "quantityAccepted",
      "quantityRejected",
      "quantityAffected",
      "requirementViolated",
      "actualConditionFound",
      "detectionMethod",
      "inspectionEquipmentId",
      "inspectionRecordReference",
      "relatedCharacteristicNumber",
      "units",
      "issueSummary",
      "nonconformanceDescription",
      "immediateRisk",
      "productShipped",
      "customerNotificationRequired",
      "customerApprovalRequired",
      "customerNotificationDate",
      "customerApprovalReference",
      "containmentAction",
      "containmentDate",
      "containmentBy",
      "containmentVerifiedBy",
      "containmentNotes",
      "disposition",
      "correctionTaken",
      "dispositionApprovedBy",
      "dispositionDate",
      "reworkInstructions",
      "reinspectionRequired",
      "reinspectionResult",
      "rootCauseRequired",
      "rootCause",
      "rootCauseCategory",
      "correctiveActionRequired",
      "correctiveActionTaken",
      "correctiveActionOwner",
      "correctiveActionDueDate",
      "correctiveActionCompletedDate",
      "correctiveActionVerifiedBy",
      "effectivenessVerificationMethod",
      "effectivenessVerificationResult",
      "effectivenessVerificationDate",
      "closureNotes",
      "closureApproval",
      "closedBy",
      "closureDate",
      "cancellationReason",
      "reopenReason",
      "owner",
      "dueDate"
    ];
    for (const field of trackedFields) {
      const oldValue = previousRecord?.[field] ?? "";
      const newValue = nextRecord?.[field] ?? "";
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        pushEntry("field_changed", `${field} changed.`, { field, oldValue, newValue });
      }
    }
    if (previousRecord.status !== nextRecord.status) {
      pushEntry("status_changed", `Status changed from ${previousRecord.status || "-"} to ${nextRecord.status || "-"}.`, {
        field: "status",
        oldValue: previousRecord.status,
        newValue: nextRecord.status
      });
      if (previousRecord.status === "Closed" && nextRecord.status !== "Closed") {
        pushEntry("reopened", `Reopened NCR with reason: ${nextRecord.reopenReason || "No reason provided."}`, {
          field: "reopenReason",
          newValue: nextRecord.reopenReason
        });
      }
      if (nextRecord.status === "Cancelled") {
        pushEntry("cancelled", `Cancelled NCR. Reason: ${nextRecord.cancellationReason || "No reason provided."}`, {
          field: "cancellationReason",
          newValue: nextRecord.cancellationReason
        });
      }
      if (nextRecord.status === "Closed") {
        pushEntry("closed", `Closed NCR ${nextRecord.ncrNumber || nextRecord.id}.`, {
          field: "closureDate",
          newValue: nextRecord.closureDate
        });
      }
    }
    const previousAttachments = this.normalizeNonconformanceAttachmentsForAudit(previousRecord.attachments);
    const nextAttachments = this.normalizeNonconformanceAttachmentsForAudit(nextRecord.attachments);
    const previousById = new Map(previousAttachments.map((attachment) => [attachment.id, attachment]));
    const nextById = new Map(nextAttachments.map((attachment) => [attachment.id, attachment]));
    for (const attachment of nextAttachments) {
      if (!previousById.has(attachment.id)) {
        pushEntry("attachment_added", `Added attachment ${attachment.filename || attachment.id}.`, {
          field: "attachments",
          newValue: attachment.filename || attachment.id
        });
        continue;
      }
      const prior = previousById.get(attachment.id);
      if (prior.revisionNumber !== attachment.revisionNumber) {
        pushEntry("attachment_revised", `Revised attachment ${attachment.filename || attachment.id} to rev ${attachment.revisionNumber}.`, {
          field: "attachments",
          oldValue: prior.revisionNumber,
          newValue: attachment.revisionNumber
        });
      }
      if (prior.active !== attachment.active || prior.status !== attachment.status) {
        pushEntry("attachment_status_changed", `Updated attachment ${attachment.filename || attachment.id} status to ${attachment.status}.`, {
          field: "attachments",
          oldValue: prior.status,
          newValue: attachment.status
        });
      }
    }
    for (const attachment of previousAttachments) {
      if (!nextById.has(attachment.id)) {
        pushEntry("attachment_removed", `Removed attachment ${attachment.filename || attachment.id}.`, {
          field: "attachments",
          oldValue: attachment.filename || attachment.id
        });
      }
    }
    return entries;
  }

  validateNonconformance(record, previousRecord = null) {
    const errors = [];
    const requireField = (condition, value, message) => {
      if (!condition) {
        return;
      }
      if (!String(value || "").trim()) {
        errors.push(message);
      }
    };
    const status = record.status || "Open";
    const quantityAffected = Number(record.quantityAffected || 0);
    requireField(true, record.ncrNumber, "NCR Number is required.");
    requireField(true, record.status, "Status is required.");
    requireField(true, record.reportedBy, "Reported By is required.");
    requireField(true, record.reportedAt, "Date Reported is required.");
    requireField(status !== "Closed" && status !== "Cancelled", record.owner, "Owner is required while the NCR is open.");
    if (status !== "Cancelled") {
      if (!String(record.quantityAffected || "").trim()) {
        errors.push("Quantity Affected is required.");
      } else if (!Number.isFinite(quantityAffected) || quantityAffected <= 0) {
        errors.push("Quantity Affected must be greater than zero.");
      }
    }
    requireField(true, record.nonconformanceDescription || record.issueDescription, "Nonconformance Description is required.");
    if (["Contained", "Awaiting Disposition", "Awaiting Corrective Action", "Awaiting Verification", "Closed"].includes(status)) {
      requireField(true, record.containmentAction, "Containment Action is required before status can move past Open.");
    }
    if (String(record.containmentAction || "").trim() && status !== "Open") {
      requireField(true, record.containmentDate, "Containment Date is required when containment is entered.");
      requireField(true, record.containmentBy, "Containment By is required when containment is entered.");
    }
    if (["Awaiting Disposition", "Awaiting Corrective Action", "Awaiting Verification", "Closed"].includes(status)) {
      requireField(true, record.requirementViolated, "Requirement / Specification Violated is required before disposition.");
      requireField(true, record.actualConditionFound, "Actual Condition Found is required before disposition.");
    }
    if (record.customerNotificationRequired === "Yes" && status === "Closed") {
      requireField(true, record.customerNotificationDate, "Customer Notification Date is required before closure.");
    }
    if (record.customerApprovalRequired === "Yes" && status === "Closed") {
      requireField(true, record.customerApprovalReference, "Customer Approval Reference is required before closure.");
    }
    if (record.disposition === "Use As-Is" && record.customerApprovalRequired === "No") {
      requireField(true, record.customerApprovalOverrideReason, "Use As-Is disposition requires a reason if customer approval is overridden.");
    }
    if (record.reinspectionRequired === "Yes" && status === "Closed") {
      if (!["Pass", "Fail"].includes(record.reinspectionResult || "")) {
        errors.push("Reinspection Result is required before closure.");
      }
    }
    if (record.rootCauseRequired === "No" && ["Awaiting Verification", "Closed"].includes(status)) {
      requireField(true, record.rootCauseJustification, "Root Cause justification is required when root cause is marked not required.");
    }
    if (record.correctiveActionRequired === "No" && ["Awaiting Verification", "Closed"].includes(status)) {
      requireField(true, record.correctiveActionJustification, "Corrective Action justification is required when corrective action is marked not required.");
    }
    if (record.correctiveActionRequired === "Yes" && ["Awaiting Verification", "Closed"].includes(status)) {
      requireField(true, record.rootCause, "Root Cause is required when corrective action is required.");
      requireField(true, record.correctiveActionTaken, "Corrective Action Taken is required when corrective action is required.");
      requireField(true, record.correctiveActionOwner, "Corrective Action Owner is required when corrective action is required.");
      if (status === "Closed") {
        requireField(true, record.correctiveActionCompletedDate, "Corrective Action Completed Date is required before closure.");
        requireField(true, record.effectivenessVerificationMethod, "Effectiveness Verification Method is required before closure.");
        if (record.effectivenessVerificationResult !== "Effective") {
          errors.push("Effectiveness Verification Result must be Effective before closure.");
        }
      }
    }
    if (status === "Closed") {
      requireField(true, record.disposition, "Disposition is required before status can be Closed.");
      requireField(true, record.correctionTaken, "Correction Taken is required before status can be Closed.");
      requireField(true, record.closureApproval, "Closure Approval is required before status can be Closed.");
    }
    const transitionMap = {
      Open: ["Open", "Contained", "Cancelled"],
      Contained: ["Contained", "Awaiting Disposition", "Cancelled"],
      "Awaiting Disposition": [
        "Awaiting Disposition",
        record.correctiveActionRequired === "Yes" ? "Awaiting Corrective Action" : "Awaiting Verification",
        "Cancelled"
      ],
      "Awaiting Corrective Action": ["Awaiting Corrective Action", "Awaiting Verification", "Cancelled"],
      "Awaiting Verification": ["Awaiting Verification", "Closed", "Cancelled"],
      Closed: ["Closed"],
      Cancelled: ["Cancelled"]
    };
    if (previousRecord) {
      if (previousRecord.status === "Closed" && status !== "Closed") {
        requireField(true, record.reopenReason, "Reopening an NCR requires a reason.");
      } else if (previousRecord.status !== status) {
        const allowedTransitions = transitionMap[previousRecord.status] || [previousRecord.status];
        if (!allowedTransitions.includes(status)) {
          errors.push(`Invalid status transition from ${previousRecord.status} to ${status}.`);
        }
      }
    }
    if (status === "Cancelled") {
      requireField(true, record.cancellationReason, "Cancellation reason is required.");
    }
    return errors;
  }

  async listNonconformances(filters = {}) {
    const dataRoot = await this.requireDataFolder();
    const root = path.join(dataRoot, "nonconformances");
    const entries = await fs.readdir(root, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const record = await readJson(path.join(root, entry.name, "ncr.json"), null);
      if (!record?.id) {
        continue;
      }
      const normalized = this.normalizeNonconformance(record);
      records.push(this.buildNonconformanceSummary(normalized));
    }
    const filtered = records.filter((record) => {
      if (filters?.active === true && record.active === false) return false;
      if (filters?.active === false && record.active !== false) return false;
      if (filters?.jobId && record.jobId !== filters.jobId) return false;
      if (filters?.partId && record.partId !== filters.partId) return false;
      if (filters?.status && record.status !== filters.status) return false;
      if (filters?.disposition && record.disposition !== filters.disposition) return false;
      if (filters?.severity && record.severity !== filters.severity) return false;
      if (filters?.customer && record.customer !== filters.customer) return false;
      if (filters?.jobNumber && record.jobNumber !== filters.jobNumber) return false;
      if (filters?.partNumber && record.partNumber !== filters.partNumber) return false;
      if (filters?.supplier && record.supplierResponsible !== filters.supplier) return false;
      if (filters?.rootCauseCategory && record.rootCauseCategory !== filters.rootCauseCategory) return false;
      if (filters?.dateFrom && String(record.reportedAt || "").slice(0, 10) < String(filters.dateFrom)) return false;
      if (filters?.dateTo && String(record.reportedAt || "").slice(0, 10) > String(filters.dateTo)) return false;
      if (filters?.query) {
        const haystack = [
          record.ncrNumber,
          record.jobNumber,
          record.partNumber,
          record.partName,
          record.customer,
          record.issueSummary,
          record.nonconformanceDescription,
          record.owner,
          record.disposition,
          record.supplierResponsible,
          record.rootCauseCategory
        ].join(" ").toLowerCase();
        if (!haystack.includes(String(filters.query || "").trim().toLowerCase())) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async loadNonconformance(ncrId, options = {}) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getNonconformanceRoot(dataRoot, ncrId);
    const record = await readJson(path.join(root, "ncr.json"), null);
    if (!record) {
      return null;
    }
    if (options.acquireLock) {
      await this.acquireLock("nonconformance", ncrId, path.join(root, "ncr.json"));
    }
    const normalized = this.normalizeNonconformance(record);
    return {
      ...normalized,
      inspectionContext: await this.buildNonconformanceInspectionContext(normalized)
    };
  }

  async saveNonconformance(record) {
    const dataRoot = await this.requireDataFolder();
    const timestamp = nowIso();
    const previousRecord = record?.id ? await this.loadNonconformance(record.id).catch(() => null) : null;
    const normalized = this.normalizeNonconformance({
      ...record,
      createdAt: record?.createdAt || previousRecord?.createdAt || timestamp,
      createdBy: record?.createdBy || previousRecord?.createdBy || record?.reportedBy || "",
      updatedAt: timestamp
    });
    if (previousRecord?.status === "Closed" && normalized.status === "Closed") {
      normalized.closedBy = previousRecord.closedBy;
      normalized.closureDate = previousRecord.closureDate;
    }
    if (normalized.status === "Closed" && previousRecord?.status !== "Closed") {
      normalized.closureDate = normalized.closureDate || timestamp;
      normalized.closedBy = normalized.closedBy || normalized.owner || normalized.reportedBy || "Local User";
    }
    const nextNumber = normalizeText(normalized.ncrNumber);
    if (nextNumber) {
      const existingRecords = await this.listNonconformances();
      const duplicate = existingRecords.find((item) => item.id !== normalized.id && normalizeText(item.ncrNumber) === nextNumber);
      if (duplicate) {
        throw new Error(`NCR number already exists: ${normalized.ncrNumber}`);
      }
    }
    const validationErrors = this.validateNonconformance(normalized, previousRecord);
    if (validationErrors.length) {
      throw new Error(validationErrors[0]);
    }
    normalized.auditLog = [
      ...(previousRecord?.auditLog || []),
      ...this.buildNonconformanceAuditEntries(previousRecord, normalized)
    ];
    const root = this.getNonconformanceRoot(dataRoot, normalized.id);
    await ensureDir(path.join(root, "attachments"));
    await writeJson(path.join(root, "ncr.json"), normalized);
    await writeText(path.join(root, "history.md"), this.nonconformanceHistoryMarkdown(normalized));
    const latestAudit = normalized.auditLog[normalized.auditLog.length - 1] || null;
    await this.appendAudit(
      latestAudit?.eventType === "reopened" ? "nonconformance_reopened"
        : latestAudit?.eventType === "closed" ? "nonconformance_closed"
          : latestAudit?.eventType === "cancelled" ? "nonconformance_cancelled"
            : "nonconformance_saved",
      normalized.id,
      `Saved NCR ${normalized.ncrNumber || normalized.id}.`,
      latestAudit ? { latestAuditEvent: latestAudit.eventType, latestAuditMessage: latestAudit.message } : {}
    );
    await this.rebuildIndex();
    return this.loadNonconformance(normalized.id);
  }

  async archiveNonconformance(ncrId) {
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error(`Nonconformance record not found: ${ncrId}`);
    }
    const saved = await this.saveNonconformance({
      ...record,
      active: false,
      archivedAt: nowIso()
    });
    await this.appendAudit("nonconformance_archived", ncrId, `Archived NCR ${record.ncrNumber || ncrId}.`);
    return saved;
  }

  async unarchiveNonconformance(ncrId) {
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error(`Nonconformance record not found: ${ncrId}`);
    }
    const saved = await this.saveNonconformance({
      ...record,
      active: true,
      archivedAt: ""
    });
    await this.appendAudit("nonconformance_unarchived", ncrId, `Unarchived NCR ${record.ncrNumber || ncrId}.`);
    return saved;
  }

  async removeNonconformanceInspectionReferences(ncrNumber) {
    const normalizedNumber = normalizeText(ncrNumber);
    if (!normalizedNumber) {
      return;
    }
    const summaries = await this.listJobSummaries();
    for (const summary of summaries) {
      const job = await this.loadJob(summary.id).catch(() => null);
      if (!job) {
        continue;
      }
      let changed = false;
      for (const part of job.parts || []) {
        const inspection = this.normalizeInspection(part?.inspection);
        const reports = (inspection.reports || []).map((report) => {
          const current = Array.isArray(report.relatedNcrNumbers) ? report.relatedNcrNumbers : [];
          const nextNumbers = current.filter((value) => normalizeText(value) !== normalizedNumber);
          if (nextNumbers.length !== current.length) {
            changed = true;
            return {
              ...report,
              relatedNcrNumbers: nextNumbers,
              updatedAt: nowIso()
            };
          }
          return report;
        });
        if (changed) {
          part.inspection = { ...inspection, reports };
        }
      }
      if (changed) {
        await this.saveJob(job);
      }
    }
  }

  async deleteNonconformance(ncrId) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error(`Nonconformance record not found: ${ncrId}`);
    }
    if (record.active !== false) {
      throw new Error("Only archived NCRs can be deleted.");
    }
    await this.releaseLock("nonconformance", ncrId).catch(() => {});
    await fs.rm(this.getNonconformanceRoot(dataRoot, ncrId), { recursive: true, force: true });
    await this.removeNonconformanceInspectionReferences(record.ncrNumber || ncrId);
    await this.appendAudit("nonconformance_deleted", ncrId, `Deleted archived NCR ${record.ncrNumber || ncrId}.`);
    await this.rebuildIndex();
    return { ok: true };
  }

  async copyNonconformanceAttachment(ncrId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error("Nonconformance record not found.");
    }
    const destination = await copyFileUnique(sourcePath, this.getNonconformanceAttachmentsRoot(dataRoot, ncrId), "");
    const extension = path.extname(sourcePath).toLowerCase();
    const attachmentType = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(extension)
      ? "Photo"
      : extension === ".pdf"
        ? "Drawing"
        : "Other";
    return this.normalizeNonconformance({
      attachments: [{
        ...this.normalizeDocument({
          originalFilename: path.basename(sourcePath),
          storedFilename: path.basename(destination),
          storedPath: path.relative(dataRoot, destination).replaceAll("\\", "/"),
          originalPath: sourcePath,
          fileType: path.extname(sourcePath).slice(1).toUpperCase()
        }),
        attachmentType,
        attachmentStatus: "Current",
        uploadedDate: nowIso()
      }]
    }).attachments[0];
  }

  async chooseNonconformanceAttachments(ncrId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose NCR Attachments",
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) {
      return [];
    }
    const copied = [];
    for (const sourcePath of result.filePaths) {
      copied.push(await this.copyNonconformanceAttachment(ncrId, sourcePath));
    }
    return copied;
  }

  async openNonconformanceAttachment(ncrId, attachmentId) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    const attachment = (record?.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const targetPath = attachment.storedPath ? path.join(dataRoot, attachment.storedPath) : attachment.originalPath;
    if (!targetPath || !(await pathExists(targetPath))) {
      throw new Error("Attachment file could not be found.");
    }
    const openError = await shell.openPath(targetPath);
    if (openError) {
      throw new Error(openError);
    }
    return true;
  }

  async openNonconformanceAttachmentRevision(ncrId, attachmentId, revisionIndex) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    const attachment = (record?.attachments || []).find((item) => item.id === attachmentId);
    const revision = Array.isArray(attachment?.revisions) ? attachment.revisions[Number(revisionIndex)] : null;
    if (!revision) {
      throw new Error("Revision not found.");
    }
    const targetPath = revision.storedPath ? path.join(dataRoot, revision.storedPath) : revision.originalPath;
    if (!targetPath || !(await pathExists(targetPath))) {
      throw new Error("Revision file could not be found.");
    }
    const openError = await shell.openPath(targetPath);
    if (openError) {
      throw new Error(openError);
    }
    return true;
  }

  async updateNonconformanceAttachmentState(ncrId, attachmentId, patch) {
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error("Nonconformance record not found.");
    }
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];
    const index = attachments.findIndex((item) => item.id === attachmentId);
    if (index < 0) {
      throw new Error("Attachment not found.");
    }
    attachments[index] = this.normalizeNonconformance({ attachments: [{ ...attachments[index], ...patch }] }).attachments[0];
    record.attachments = attachments;
    return this.saveNonconformance(record);
  }

  async archiveNonconformanceAttachment(ncrId, attachmentId) {
    return this.updateNonconformanceAttachmentState(ncrId, attachmentId, { active: false, archivedAt: nowIso(), attachmentStatus: "Archived", status: "Archived" });
  }

  async unarchiveNonconformanceAttachment(ncrId, attachmentId) {
    return this.updateNonconformanceAttachmentState(ncrId, attachmentId, { active: true, archivedAt: "", attachmentStatus: "Current", status: "Current" });
  }

  async reviseNonconformanceAttachment(ncrId, attachmentId, mainWindow = null) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose New NCR Attachment Revision",
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error("Nonconformance record not found.");
    }
    const attachment = (record.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const destination = await copyFileUnique(result.filePaths[0], this.getNonconformanceAttachmentsRoot(dataRoot, ncrId), "");
    const revisionTimestamp = nowIso();
    attachment.revisions = [
      ...(attachment.revisions || []),
      {
        originalFilename: attachment.originalFilename,
        storedFilename: attachment.storedFilename,
        storedPath: attachment.storedPath,
        originalPath: attachment.originalPath,
        fileType: attachment.fileType,
        attachedAt: attachment.attachedAt,
        revisedAt: revisionTimestamp,
        revisionNumber: attachment.revisionNumber || 1
      }
    ];
    attachment.originalFilename = path.basename(result.filePaths[0]);
    attachment.storedFilename = path.basename(destination);
    attachment.storedPath = path.relative(dataRoot, destination).replaceAll("\\", "/");
    attachment.originalPath = result.filePaths[0];
    attachment.fileType = path.extname(result.filePaths[0]).slice(1).toUpperCase();
    attachment.displayName = attachment.originalFilename;
    attachment.active = true;
    attachment.archivedAt = "";
    attachment.attachmentStatus = "Current";
    attachment.status = "Current";
    attachment.revisedAt = revisionTimestamp;
    attachment.revisionNumber = Number(attachment.revisionNumber || 1) + 1;
    return this.saveNonconformance(record);
  }

  async deleteNonconformanceAttachment(ncrId, attachmentId) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error("Nonconformance record not found.");
    }
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];
    const attachmentIndex = attachments.findIndex((item) => item.id === attachmentId);
    if (attachmentIndex < 0) {
      throw new Error("Attachment not found.");
    }
    const attachment = attachments[attachmentIndex];
    if (attachment.active !== false) {
      throw new Error("Only archived attachments can be deleted.");
    }
    await this.deleteDocumentFiles(dataRoot, attachment);
    attachments.splice(attachmentIndex, 1);
    record.attachments = attachments;
    return this.saveNonconformance(record);
  }

  async generateNextNonconformanceNumber() {
    const records = await this.listNonconformances();
    const preferences = await this.loadPreferences();
    const configuredPrefix = String(preferences.nonconformancePrefix || "").trim();
    const startingNumber = Number.isFinite(Number(preferences.startingNonconformanceNumber))
      ? Number(preferences.startingNonconformanceNumber)
      : 1;
    const candidates = records
      .map((record) => {
        const value = String(record.ncrNumber || "").trim();
        const match = value.match(/^(.*?)(\d+)$/);
        if (!match) {
          return null;
        }
        return {
          prefix: match[1],
          digits: match[2],
          number: Number(match[2]),
          updatedAt: String(record.updatedAt || "")
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.number - a.number || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const preferredCandidates = configuredPrefix
      ? candidates.filter((candidate) => candidate.prefix === configuredPrefix)
      : candidates;
    if (!preferredCandidates.length) {
      const digits = Math.max(String(startingNumber).length, 4);
      return `${configuredPrefix}${String(startingNumber).padStart(digits, "0")}`;
    }
    const next = preferredCandidates[0];
    return `${next.prefix}${String(next.number + 1).padStart(next.digits.length, "0")}`;
  }

  async generateNextInspectionReportNumber() {
    const preferences = await this.loadPreferences();
    const configuredPrefix = String(preferences.inspectionReportPrefix || "").trim();
    const startingNumber = Number.isFinite(Number(preferences.startingInspectionReportNumber))
      ? Number(preferences.startingInspectionReportNumber)
      : 1;
    const candidates = [];
    for (const summary of await this.listJobSummaries()) {
      const job = await this.loadJob(summary.id);
      for (const part of job?.parts || []) {
        const inspection = this.normalizeInspection(part?.inspection);
        for (const report of inspection.reports || []) {
          const value = String(report.reportId || "").trim();
          const match = value.match(/^(.*?)(\d+)$/);
          if (!match) {
            continue;
          }
          candidates.push({
            prefix: match[1],
            digits: match[2],
            number: Number(match[2]),
            updatedAt: String(report.updatedAt || report.generatedAt || "")
          });
        }
      }
    }
    candidates.sort((a, b) => b.number - a.number || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const preferredCandidates = configuredPrefix
      ? candidates.filter((candidate) => candidate.prefix === configuredPrefix)
      : candidates;
    if (!preferredCandidates.length) {
      const digits = Math.max(String(startingNumber).length, 4);
      return `${configuredPrefix}${String(startingNumber).padStart(digits, "0")}`;
    }
    const next = preferredCandidates[0];
    return `${next.prefix}${String(next.number + 1).padStart(next.digits.length, "0")}`;
  }

  escapeCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replaceAll("\"", "\"\"")}"`;
    }
    return text;
  }

  async exportNonconformancesCsv(filters = {}, destinationPath = "") {
    const dataRoot = await this.requireDataFolder();
    const records = await this.listNonconformances(filters);
    let outputPath = destinationPath;
    if (!outputPath) {
      const result = await dialog.showSaveDialog({
        title: "Export NCR Summary CSV",
        defaultPath: path.join(dataRoot, `nonconformances-${nowIso().slice(0, 10)}.csv`),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      outputPath = result.filePath;
    }
    const statusCounts = NONCONFORMANCE_STATUS_OPTIONS.map((status) => [status, records.filter((record) => record.status === status).length]);
    const severityCounts = NONCONFORMANCE_SEVERITY_OPTIONS.map((severity) => [severity, records.filter((record) => record.severity === severity).length]);
    const rows = [
      ["Generated At", nowIso()],
      [],
      ["Status Counts"],
      ["Status", "Count"],
      ...statusCounts,
      [],
      ["Severity Counts"],
      ["Severity", "Count"],
      ...severityCounts,
      [],
      [
        "NCR Number",
        "Status",
        "Severity",
        "Source",
        "Date Reported",
        "Reported By",
        "Owner",
        "Customer",
        "Customer PO Number",
        "Internal Job Number",
        "Part Number",
        "Part Name",
        "Supplier / Vendor Responsible",
        "Quantity Affected",
        "Disposition",
        "Root Cause Category",
        "Due Date",
        "Closed By",
        "Closure Date",
        "Summary"
      ],
      ...records.map((record) => [
        record.ncrNumber,
        record.status,
        record.severity,
        record.source,
        record.reportedAt,
        record.reportedBy,
        record.owner,
        record.customer,
        record.customerPoNumber,
        record.internalJobNumber || record.jobNumber,
        record.partNumber,
        record.partName,
        record.supplierResponsible,
        record.quantityAffected,
        record.disposition,
        record.rootCauseCategory,
        record.dueDate,
        record.closedBy,
        record.closureDate,
        record.issueSummary || record.nonconformanceDescription
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(",")).join("\r\n");
    await fs.writeFile(outputPath, csv, "utf8");
    await this.appendAudit("nonconformance_csv_exported", "nonconformance", `Exported NCR CSV to ${outputPath}.`, {
      count: records.length
    });
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported CSV: ${openError}`);
    }
    return outputPath;
  }

  normalizeParameter(parameter) {
    return {
      id: parameter?.id || randomId("parameter"),
      label: String(parameter?.label || "").trim(),
      value: String(parameter?.value || "").trim()
    };
  }

  normalizeStepImage(image) {
    return {
      id: image?.id || randomId("image"),
      name: String(image?.name || "Image").trim(),
      relativePath: String(image?.relativePath || "").replaceAll("\\", "/")
    };
  }

  normalizeInstructionStep(step) {
    return {
      id: step?.id || randomId("step"),
      text: String(step?.text || "").trim(),
      images: (Array.isArray(step?.images) ? step.images : []).map((image) => this.normalizeStepImage(image))
    };
  }

  normalizeTool(tool) {
    return {
      id: tool?.id || randomId("tool"),
      name: String(tool?.name || "").trim(),
      diameter: String(tool?.diameter || "").trim(),
      length: String(tool?.length || "").trim(),
      holder: String(tool?.holder || "").trim(),
      details: String(tool?.details || "").trim(),
      fusionToolNumber: String(tool?.fusionToolNumber || "").trim(),
      source: String(tool?.source || "").trim()
    };
  }

  normalizeLibraryRecord(record, index = 0) {
    if (typeof record === "string") {
      return {
        id: randomId("library-record"),
        name: String(record).trim(),
        active: true
      };
    }
    return {
      id: record?.id || randomId("library-record"),
      name: String(record?.name || "").trim(),
      active: record?.active !== false
    };
  }

  normalizeLibrary(library) {
    const normalizedName = safeFileName(library?.name || library?.label || randomId("library"));
    const normalizedRecords = (Array.isArray(library?.records) ? library.records : [])
      .map((record, index) => this.normalizeLibraryRecord(record, index))
      .filter((record) => record.name);
    return {
      name: normalizedName,
      label: String(library?.label || library?.name || "Library").trim(),
      order: Number(library?.order || 1000),
      records: normalizedRecords
    };
  }

  normalizeLibrarySelections(librarySelections) {
    const output = {};
    for (const [libraryName, selectedIds] of Object.entries(librarySelections || {})) {
      const normalizedName = safeFileName(libraryName);
      if (!normalizedName) {
        continue;
      }
      output[normalizedName] = toDisplayList(selectedIds);
    }
    return output;
  }

  normalizeOperation(operation, index = 0) {
    const sequence = Number(operation?.sequence || index + 1) || index + 1;
    const normalized = {
      id: operation?.id || randomId("operation"),
      sequence,
      folderName: operation?.folderName || `${String(sequence).padStart(3, "0")}-${slugify(operation?.title || operation?.type || "operation")}`,
      operationCode: String(operation?.operationCode || `OP${String(sequence).padStart(3, "0")}`).trim(),
      title: String(operation?.title || operation?.type || "Operation").trim(),
      type: String(operation?.type || "General").trim(),
      workCenter: String(operation?.workCenter || "").trim(),
      status: String(operation?.status || "Ready").trim(),
      setupInstructions: String(operation?.setupInstructions || "").trim(),
      workInstructions: String(operation?.workInstructions || "").trim(),
      instructionSteps: (Array.isArray(operation?.instructionSteps) ? operation.instructionSteps : [])
        .map((item) => this.normalizeInstructionStep(item)),
      notes: String(operation?.notes || "").trim(),
      parameters: (Array.isArray(operation?.parameters) ? operation.parameters : []).map((item) => this.normalizeParameter(item)),
      stepImages: (Array.isArray(operation?.stepImages) ? operation.stepImages : []).map((item) => this.normalizeStepImage(item)),
      tools: (Array.isArray(operation?.tools) ? operation.tools : []).map((item) => this.normalizeTool(item)),
      setupTemplateRefs: toDisplayList(operation?.setupTemplateRefs),
      jobToolRefs: toDisplayList(operation?.jobToolRefs),
      librarySelections: this.normalizeLibrarySelections(operation?.librarySelections),
      requiredMaterialLots: toDisplayList(operation?.requiredMaterialLots),
      requiredInstruments: toDisplayList(operation?.requiredInstruments),
      customMaterialText: String(operation?.customMaterialText || "").trim(),
      inspectionPlan: {
        feature: String(operation?.inspectionPlan?.feature || "").trim(),
        method: String(operation?.inspectionPlan?.method || "").trim(),
        sampleSize: String(operation?.inspectionPlan?.sampleSize || "").trim(),
        frequency: String(operation?.inspectionPlan?.frequency || "").trim(),
        resultPlaceholderRefs: toDisplayList(operation?.inspectionPlan?.resultPlaceholderRefs)
      }
    };
    if (!normalized.instructionSteps.length && normalized.workInstructions) {
      normalized.instructionSteps = normalized.workInstructions
        .split(/\r?\n/)
        .map((line) => String(line || "").trim())
        .filter(Boolean)
        .map((text) => this.normalizeInstructionStep({ text, images: [] }));
    }
    normalized.stepImages = normalized.instructionSteps.length
      ? normalized.instructionSteps.flatMap((step) => step.images || [])
      : normalized.stepImages;
    normalized.workInstructions = normalized.instructionSteps.length
      ? normalized.instructionSteps.map((step) => step.text).filter(Boolean).join("\n")
      : normalized.workInstructions;
    return normalized;
  }

  normalizePart(part) {
    const operations = (Array.isArray(part?.operations) ? part.operations : []).map((operation, index) => this.normalizeOperation(operation, index));
    const inheritedMaterialLots = Array.from(new Set(operations.flatMap((operation) => operation.requiredMaterialLots || [])));
    const inheritedCustomMaterial = operations.map((operation) => String(operation.customMaterialText || "").trim()).find(Boolean) || "";
    return {
      id: part?.id || randomId("part"),
      partNumber: String(part?.partNumber || "").trim(),
      partName: String(part?.partName || "").trim(),
      description: String(part?.description || "").trim(),
      quantity: String(part?.quantity || "").trim(),
      materialSpec: String(part?.materialSpec || "").trim(),
      requiredMaterialLots: toDisplayList(part?.requiredMaterialLots?.length ? part.requiredMaterialLots : inheritedMaterialLots),
      customMaterialText: String(part?.customMaterialText || inheritedCustomMaterial || "").trim(),
      revision: {
        number: String(part?.revision?.number || "").trim(),
        date: String(part?.revision?.date || "").trim(),
        notes: String(part?.revision?.notes || "").trim()
      },
      notes: String(part?.notes || "").trim(),
      active: part?.active !== false,
      documents: (Array.isArray(part?.documents) ? part.documents : []).map((document) => this.normalizeDocument(document)),
      inspection: this.normalizeInspection(part?.inspection),
      operations
    };
  }

  normalizeInspection(inspection) {
    const normalizedCoordinate = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0.5;
    };
    const normalizeCharacteristic = (item, index) => ({
      id: item?.id || randomId("characteristic"),
      number: String(item?.number || index + 1).trim(),
      type: String(item?.type || "Dimension").trim(),
      units: String(item?.units || inspection?.units || "in").trim(),
      nominal: String(item?.nominal || "").trim(),
      toleranceType: String(item?.toleranceType || "plusMinus").trim(),
      plusTolerance: String(item?.plusTolerance || "").trim(),
      minusTolerance: String(item?.minusTolerance || "").trim(),
      lowerLimit: String(item?.lowerLimit || "").trim(),
      upperLimit: String(item?.upperLimit || "").trim(),
      gdTolerance: String(item?.gdTolerance || "").trim(),
      gageId: String(item?.gageId || "").trim(),
      description: String(item?.description || "").trim(),
      requirementDescription: String(item?.requirementDescription || item?.description || item?.type || "").trim(),
      inspectionMethod: String(item?.inspectionMethod || "").trim(),
      calibrationDueDate: String(item?.calibrationDueDate || "").trim(),
      criticalCharacteristic: item?.criticalCharacteristic === true || String(item?.criticalCharacteristic || "").trim() === "Yes",
      gageText: String(item?.gageText || "").trim(),
      notes: String(item?.notes || "").trim(),
      sourceDrawingDocumentId: String(item?.sourceDrawingDocumentId || "").trim(),
      confidence: String(item?.confidence || "").trim(),
      active: item?.active !== false
    });
    const normalizeInstance = (item, index) => ({
      id: item?.id || randomId("inspection-instance"),
      label: String(item?.label || `Part ${index + 1}`).trim(),
      serialNumber: String(item?.serialNumber || "").trim(),
      inspector: String(item?.inspector || "").trim(),
      inspectedAt: String(item?.inspectedAt || nowIso()).trim(),
      inspectedTime: String(item?.inspectedTime || "").trim(),
      status: String(item?.status || "Open").trim(),
      measurementNotes: String(item?.measurementNotes || "").trim(),
      results: Object.fromEntries(Object.entries(item?.results || {}).map(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return [key, {
            value: String(value?.value || "").trim(),
            passFail: String(value?.passFail || "").trim(),
            gageId: String(value?.gageId || "").trim(),
            notes: String(value?.notes || "").trim()
          }];
        }
        return [key, {
          value: String(value || "").trim(),
          passFail: "",
          gageId: "",
          notes: ""
        }];
      }))
    });
    const normalizeReportAuditEntry = (item) => ({
      id: item?.id || randomId("inspection-report-audit"),
      eventType: String(item?.eventType || "updated").trim(),
      message: String(item?.message || "").trim(),
      changedBy: String(item?.changedBy || "").trim(),
      changedAt: String(item?.changedAt || nowIso()).trim(),
      changedFields: Array.isArray(item?.changedFields) ? item.changedFields.map((field) => String(field || "").trim()).filter(Boolean) : [],
      oldValue: item?.oldValue ?? null,
      newValue: item?.newValue ?? null
    });
    const normalizeInspectionReport = (item, index) => ({
      id: item?.id || randomId("inspection-report"),
      reportId: String(item?.reportId || "").trim(),
      status: String(item?.status || "Draft").trim() || "Draft",
      finalResult: String(item?.finalResult || "Pending").trim() || "Pending",
      generatedAt: String(item?.generatedAt || nowIso()).trim(),
      generatedBy: String(item?.generatedBy || "").trim(),
      releasedBy: String(item?.releasedBy || "").trim(),
      releasedAt: String(item?.releasedAt || "").trim(),
      voidedBy: String(item?.voidedBy || "").trim(),
      voidedAt: String(item?.voidedAt || "").trim(),
      voidReason: String(item?.voidReason || "").trim(),
      traceability: {
        customer: String(item?.traceability?.customer || "").trim(),
        customerPoNumber: String(item?.traceability?.customerPoNumber || "").trim(),
        internalJobNumber: String(item?.traceability?.internalJobNumber || "").trim(),
        salesOrderQuoteNumber: String(item?.traceability?.salesOrderQuoteNumber || "").trim(),
        partNumber: String(item?.traceability?.partNumber || "").trim(),
        partName: String(item?.traceability?.partName || "").trim(),
        partRevision: String(item?.traceability?.partRevision || "").trim(),
        drawingNumber: String(item?.traceability?.drawingNumber || "").trim(),
        drawingRevision: String(item?.traceability?.drawingRevision || "").trim(),
        drawingFileName: String(item?.traceability?.drawingFileName || "").trim(),
        modelFileName: String(item?.traceability?.modelFileName || "").trim(),
        modelRevision: String(item?.traceability?.modelRevision || "").trim(),
        material: String(item?.traceability?.material || "").trim(),
        lotBatchSerialNumber: String(item?.traceability?.lotBatchSerialNumber || "").trim()
      },
      inspectionContext: {
        inspectionType: String(item?.inspectionContext?.inspectionType || "In-Process").trim(),
        samplingPlan: String(item?.inspectionContext?.samplingPlan || "100% Inspection").trim(),
        inspectionPlanRevision: String(item?.inspectionContext?.inspectionPlanRevision || "").trim(),
        notes: String(item?.inspectionContext?.notes || "").trim(),
        deviations: String(item?.inspectionContext?.deviations || "").trim(),
        exceptions: String(item?.inspectionContext?.exceptions || "").trim()
      },
      quantitySummary: {
        quantityOrdered: String(item?.quantitySummary?.quantityOrdered || "").trim(),
        quantityInspected: String(item?.quantitySummary?.quantityInspected || "").trim(),
        quantityAccepted: String(item?.quantitySummary?.quantityAccepted || "").trim(),
        quantityRejected: String(item?.quantitySummary?.quantityRejected || "").trim()
      },
      relatedNcrNumbers: Array.isArray(item?.relatedNcrNumbers) ? item.relatedNcrNumbers.map((value) => String(value || "").trim()).filter(Boolean) : [],
      ncrRequired: String(item?.ncrRequired || "No").trim() || "No",
      ncrJustification: String(item?.ncrJustification || "").trim(),
      gageExceptionNote: String(item?.gageExceptionNote || "").trim(),
      snapshot: {
        units: String(item?.snapshot?.units || inspection?.units || "in").trim() || "in",
        balloonedDocumentId: String(item?.snapshot?.balloonedDocumentId || "").trim(),
        characteristics: (Array.isArray(item?.snapshot?.characteristics) ? item.snapshot.characteristics : []).map(normalizeCharacteristic),
        instances: (Array.isArray(item?.snapshot?.instances) ? item.snapshot.instances : []).map(normalizeInstance)
      },
      auditLog: (Array.isArray(item?.auditLog) ? item.auditLog : []).map(normalizeReportAuditEntry),
      createdAt: String(item?.createdAt || item?.generatedAt || nowIso()).trim(),
      updatedAt: String(item?.updatedAt || item?.generatedAt || nowIso()).trim(),
      versionNumber: Number(item?.versionNumber || index + 1) || index + 1
    });
    const reports = (Array.isArray(inspection?.reports) ? inspection.reports : []).map(normalizeInspectionReport);
    const activeReportId = reports.some((item) => item.id === inspection?.activeReportId)
      ? String(inspection.activeReportId || "").trim()
      : (reports[0]?.id || "");
    return {
      units: String(inspection?.units || "in").trim() || "in",
      characteristics: (Array.isArray(inspection?.characteristics) ? inspection.characteristics : []).map(normalizeCharacteristic),
      instances: (Array.isArray(inspection?.instances) ? inspection.instances : []).map(normalizeInstance),
      balloons: (Array.isArray(inspection?.balloons) ? inspection.balloons : []).map((item) => ({
        id: item?.id || randomId("balloon"),
        characteristicId: String(item?.characteristicId || "").trim(),
        sourceDrawingDocumentId: String(item?.sourceDrawingDocumentId || "").trim(),
        pageNumber: Number(item?.pageNumber || 1) || 1,
        x: normalizedCoordinate(item?.x),
        y: normalizedCoordinate(item?.y),
        labelText: String(item?.labelText || "").trim(),
        confidence: String(item?.confidence || "").trim(),
        placementSource: String(item?.placementSource || "manual").trim()
      })).filter((item) => item.characteristicId),
      extractionRuns: (Array.isArray(inspection?.extractionRuns) ? inspection.extractionRuns : []).map((item) => ({
        id: item?.id || randomId("inspection-extraction"),
        sourceDrawingDocumentId: String(item?.sourceDrawingDocumentId || "").trim(),
        sourceFilename: String(item?.sourceFilename || "").trim(),
        extractedAt: String(item?.extractedAt || nowIso()).trim(),
        acceptedCount: Number(item?.acceptedCount || 0) || 0,
        queuedCount: Number(item?.queuedCount || 0) || 0,
        rejectedCount: Number(item?.rejectedCount || 0) || 0,
        balloonedCount: Number(item?.balloonedCount || 0) || 0,
        warnings: toDisplayList(item?.warnings),
        errors: toDisplayList(item?.errors)
      })),
      reviewQueue: (Array.isArray(inspection?.reviewQueue) ? inspection.reviewQueue : []).map(normalizeCharacteristic),
      reports,
      activeReportId
    };
  }

  summarizeJob(job) {
    const partCount = job.parts.length;
    const operationCount = job.parts.reduce((sum, part) => sum + part.operations.length, 0);
    const routeSummary = job.parts
      .map((part) => `${part.partNumber || part.partName || "Part"}: ${part.operations.length} op${part.operations.length === 1 ? "" : "s"}`)
      .join(" | ");
    return { partCount, operationCount, routeSummary };
  }

  async saveJob(job) {
    const dataRoot = await this.requireDataFolder();
    const timestamp = nowIso();
    const parts = (Array.isArray(job?.parts) ? job.parts : []).map((part) => this.normalizePart(part));
    const normalized = {
      id: job?.id || randomId("job"),
      jobNumber: String(job?.jobNumber || "").trim(),
      customerId: String(job?.customerId || "").trim(),
      customer: String(job?.customer || "").trim(),
      status: String(job?.status || "Open").trim(),
      priority: String(job?.priority || "Normal").trim(),
      dueDate: String(job?.dueDate || "").trim(),
      notes: String(job?.notes || "").trim(),
      revision: {
        number: String(job?.revision?.number || "").trim(),
        date: String(job?.revision?.date || todayIso()).trim(),
        author: String(job?.revision?.author || "").trim(),
        notes: String(job?.revision?.notes || "").trim()
      },
      active: job?.active !== false,
      documents: (Array.isArray(job?.documents) ? job.documents : []).map((document) => this.normalizeDocument(document)),
      parts,
      createdAt: job?.createdAt || timestamp,
      updatedAt: timestamp
    };
    const summary = this.summarizeJob(normalized);
    const jobRoot = this.getJobRoot(dataRoot, normalized.id);
    await ensureDir(path.join(jobRoot, "parts"));
    await ensureDir(path.join(jobRoot, "documents"));
    const existingParts = (await pathExists(path.join(jobRoot, "parts")))
      ? await fs.readdir(path.join(jobRoot, "parts"), { withFileTypes: true })
      : [];
    const keepPartDirs = new Set(parts.map((part) => safeFileName(part.id)));
    for (const entry of existingParts) {
      if (entry.isDirectory() && !keepPartDirs.has(entry.name)) {
        await fs.rm(path.join(jobRoot, "parts", entry.name), { recursive: true, force: true });
      }
    }

    for (const part of parts) {
      const partRoot = path.join(jobRoot, "parts", safeFileName(part.id));
      const existingPart = await readJson(path.join(partRoot, "part.json"), null);
      await ensureDir(path.join(partRoot, "operations"));
      await ensureDir(path.join(partRoot, "documents"));
      await writeJson(path.join(partRoot, "part.json"), {
        ...part,
        operations: undefined,
        createdAt: existingPart?.createdAt || timestamp,
        updatedAt: timestamp
      });

      const existingOps = (await pathExists(path.join(partRoot, "operations")))
        ? await fs.readdir(path.join(partRoot, "operations"), { withFileTypes: true })
        : [];
      const keepOpDirs = new Set(part.operations.map((operation) => safeFileName(operation.folderName)));
      for (const opEntry of existingOps) {
        if (opEntry.isDirectory() && !keepOpDirs.has(opEntry.name)) {
          await fs.rm(path.join(partRoot, "operations", opEntry.name), { recursive: true, force: true });
        }
      }

      for (const operation of part.operations) {
        const opRoot = path.join(partRoot, "operations", safeFileName(operation.folderName));
        await ensureDir(path.join(opRoot, "assets"));
        await writeJson(path.join(opRoot, "operation.json"), {
          ...operation,
          createdAt: operation.createdAt || existingPart?.createdAt || timestamp,
          updatedAt: timestamp
        });
        await writeText(path.join(opRoot, "work-instructions.md"), `${operation.workInstructions || ""}\n`);
      }
    }

    const header = {
      ...normalized,
      parts: undefined,
      partCount: summary.partCount,
      operationCount: summary.operationCount,
      routeSummary: summary.routeSummary
    };
    await writeJson(path.join(jobRoot, "job.json"), header);
    await writeText(path.join(jobRoot, "history.md"), await this.jobHistoryMarkdown(normalized));
    await this.appendAudit("job_saved", normalized.id, `Saved job ${normalized.jobNumber || normalized.id}.`);
    await this.rebuildCrossReferences();
    return this.loadJob(normalized.id);
  }

  async archiveJob(jobId) {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    job.active = false;
    job.status = "Archived";
    const saved = await this.saveJob(job);
    await this.appendAudit("job_archived", jobId, `Archived job ${job.jobNumber || jobId}.`);
    return saved;
  }

  async unarchiveJob(jobId) {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    job.active = true;
    if (String(job.status || "").trim() === "Archived") {
      job.status = "Open";
    }
    const saved = await this.saveJob(job);
    await this.appendAudit("job_unarchived", jobId, `Unarchived job ${job.jobNumber || jobId}.`);
    return saved;
  }

  async deleteJob(jobId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (job.active !== false) {
      throw new Error("Only archived jobs can be deleted.");
    }
    await this.releaseLock("job", jobId).catch(() => {});
    await fs.rm(this.getJobRoot(dataRoot, jobId), { recursive: true, force: true });
    await this.appendAudit("job_deleted", jobId, `Deleted archived job ${job.jobNumber || jobId}.`);
    await this.rebuildCrossReferences();
    return true;
  }

  async chooseOperationImages(jobId, partId, operationId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Operation Images",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }]
    });
    if (result.canceled) {
      return [];
    }
    const output = [];
    for (const filePath of result.filePaths) {
      output.push(await this.copyOperationImage(jobId, partId, operationId, filePath));
    }
    return output;
  }

  async copyOperationImage(jobId, partId, operationId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const extension = path.extname(sourcePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      throw new Error("Only image files can be attached to operations.");
    }
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    const operation = part?.operations?.find((item) => item.id === operationId);
    if (!job || !part || !operation) {
      throw new Error("The selected operation no longer exists.");
    }
    const opRoot = path.join(this.getJobRoot(dataRoot, jobId), "parts", safeFileName(partId), "operations", safeFileName(operation.folderName));
    const destination = await copyFileUnique(sourcePath, path.join(opRoot, "assets"), `${safeFileName(operation.id)}-`);
    return {
      id: randomId("image"),
      name: path.basename(sourcePath),
      relativePath: path.relative(dataRoot, destination).replaceAll("\\", "/")
    };
  }

  async chooseJobDocuments(jobId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Job Documents",
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) {
      return [];
    }
    const copied = [];
    for (const sourcePath of result.filePaths) {
      copied.push(await this.copyJobDocument(jobId, sourcePath));
    }
    return copied;
  }

  async choosePartDocuments(jobId, partId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Part Documents",
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) {
      return [];
    }
    const copied = [];
    for (const sourcePath of result.filePaths) {
      copied.push(await this.copyPartDocument(jobId, partId, sourcePath));
    }
    return copied;
  }

  async chooseInspectionDrawing(jobId, partId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Inspection Drawing PDF",
      properties: ["openFile"],
      filters: [{ name: "PDF Drawings", extensions: ["pdf"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return this.copyPartDocument(jobId, partId, result.filePaths[0], "Drawing", "Inspection drawing");
  }

  async copyJobDocument(jobId, sourcePath, category = "Other", description = "") {
    const dataRoot = await this.requireDataFolder();
    const destination = await copyFileUnique(sourcePath, this.getJobDocumentsRoot(dataRoot, jobId), "");
    return this.normalizeDocument({
      originalFilename: path.basename(sourcePath),
      storedFilename: path.basename(destination),
      storedPath: path.relative(dataRoot, destination),
      originalPath: sourcePath,
      fileType: path.extname(sourcePath).slice(1).toUpperCase(),
      category,
      description,
      displayName: path.basename(sourcePath)
    }, category);
  }

  async copyPartDocument(jobId, partId, sourcePath, category = "Other", description = "") {
    const dataRoot = await this.requireDataFolder();
    const destination = await copyFileUnique(sourcePath, this.getPartDocumentsRoot(dataRoot, jobId, partId), "");
    return this.normalizeDocument({
      originalFilename: path.basename(sourcePath),
      storedFilename: path.basename(destination),
      storedPath: path.relative(dataRoot, destination),
      originalPath: sourcePath,
      fileType: path.extname(sourcePath).slice(1).toUpperCase(),
      category,
      description,
      displayName: path.basename(sourcePath)
    }, category);
  }

  getStoredDocumentPath(dataRoot, document) {
    const storedPath = String(document?.storedPath || "").replaceAll("\\", "/");
    return storedPath ? path.join(dataRoot, storedPath) : "";
  }

  async openDocumentByStoredPath(targetPath) {
    if (!targetPath || !(await pathExists(targetPath))) {
      throw new Error("Document file could not be found.");
    }
    const openError = await shell.openPath(targetPath);
    if (openError) {
      throw new Error(openError);
    }
    return true;
  }

  async openJobDocument(jobId, documentId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const document = (job.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const targetPath = document.storedPath
      ? path.join(dataRoot, document.storedPath)
      : document.originalPath;
    return this.openDocumentByStoredPath(targetPath);
  }

  async openPartDocument(jobId, partId, documentId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const targetPath = document.storedPath
      ? path.join(dataRoot, document.storedPath)
      : document.originalPath;
    return this.openDocumentByStoredPath(targetPath);
  }

  async openJobDocumentRevision(jobId, documentId, revisionIndex) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const document = (job.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const revisions = Array.isArray(document.revisions) ? document.revisions : [];
    const revision = revisions[Number(revisionIndex)];
    if (!revision) {
      throw new Error("Document revision not found.");
    }
    const targetPath = revision.storedPath
      ? path.join(dataRoot, revision.storedPath)
      : revision.originalPath;
    return this.openDocumentByStoredPath(targetPath);
  }

  async openPartDocumentRevision(jobId, partId, documentId, revisionIndex) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const revisions = Array.isArray(document.revisions) ? document.revisions : [];
    const revision = revisions[Number(revisionIndex)];
    if (!revision) {
      throw new Error("Document revision not found.");
    }
    const targetPath = revision.storedPath
      ? path.join(dataRoot, revision.storedPath)
      : revision.originalPath;
    return this.openDocumentByStoredPath(targetPath);
  }

  async archiveJobDocument(jobId, documentId) {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const document = (job.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    document.active = false;
    document.archivedAt = nowIso();
    const saved = await this.saveJob(job);
    await this.appendAudit("job_document_archived", jobId, `Archived job attachment ${document.originalFilename}.`);
    return saved;
  }

  async archivePartDocument(jobId, partId, documentId) {
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    document.active = false;
    document.archivedAt = nowIso();
    const saved = await this.saveJob(job);
    await this.appendAudit("part_document_archived", partId, `Archived part attachment ${document.originalFilename}.`);
    return saved;
  }

  async unarchiveJobDocument(jobId, documentId) {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const document = (job.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    document.active = true;
    document.archivedAt = "";
    const saved = await this.saveJob(job);
    await this.appendAudit("job_document_unarchived", jobId, `Unarchived job attachment ${document.originalFilename}.`);
    return saved;
  }

  async unarchivePartDocument(jobId, partId, documentId) {
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    document.active = true;
    document.archivedAt = "";
    const saved = await this.saveJob(job);
    await this.appendAudit("part_document_unarchived", partId, `Unarchived part attachment ${document.originalFilename}.`);
    return saved;
  }

  async reviseJobDocument(jobId, documentId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose New Job Attachment Revision",
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return this.replaceJobDocument(jobId, documentId, result.filePaths[0]);
  }

  async revisePartDocument(jobId, partId, documentId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose New Part Attachment Revision",
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return this.replacePartDocument(jobId, partId, documentId, result.filePaths[0]);
  }

  async replaceJobDocument(jobId, documentId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const document = (job.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const destination = await copyFileUnique(sourcePath, this.getJobDocumentsRoot(dataRoot, jobId), "");
    const revisionTimestamp = nowIso();
    document.revisions = [
      ...(document.revisions || []),
      {
        originalFilename: document.originalFilename,
        storedFilename: document.storedFilename,
        storedPath: document.storedPath,
        originalPath: document.originalPath,
        fileType: document.fileType,
        attachedAt: document.attachedAt,
        revisedAt: revisionTimestamp,
        revisionNumber: document.revisionNumber || 1
      }
    ];
    document.originalFilename = path.basename(sourcePath);
    document.storedFilename = path.basename(destination);
    document.storedPath = path.relative(dataRoot, destination).replaceAll("\\", "/");
    document.originalPath = sourcePath;
    document.fileType = path.extname(sourcePath).slice(1).toUpperCase();
    document.displayName = document.originalFilename;
    document.active = true;
    document.archivedAt = "";
    document.revisedAt = revisionTimestamp;
    document.revisionNumber = Number(document.revisionNumber || 1) + 1;
    const saved = await this.saveJob(job);
    await this.appendAudit("job_document_revised", jobId, `Revised job attachment ${document.originalFilename}.`);
    return saved;
  }

  async replacePartDocument(jobId, partId, documentId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === documentId);
    if (!document) {
      throw new Error("Document not found.");
    }
    const destination = await copyFileUnique(sourcePath, this.getPartDocumentsRoot(dataRoot, jobId, partId), "");
    const revisionTimestamp = nowIso();
    document.revisions = [
      ...(document.revisions || []),
      {
        originalFilename: document.originalFilename,
        storedFilename: document.storedFilename,
        storedPath: document.storedPath,
        originalPath: document.originalPath,
        fileType: document.fileType,
        attachedAt: document.attachedAt,
        revisedAt: revisionTimestamp,
        revisionNumber: document.revisionNumber || 1
      }
    ];
    document.originalFilename = path.basename(sourcePath);
    document.storedFilename = path.basename(destination);
    document.storedPath = path.relative(dataRoot, destination).replaceAll("\\", "/");
    document.originalPath = sourcePath;
    document.fileType = path.extname(sourcePath).slice(1).toUpperCase();
    document.displayName = document.originalFilename;
    document.active = true;
    document.archivedAt = "";
    document.revisedAt = revisionTimestamp;
    document.revisionNumber = Number(document.revisionNumber || 1) + 1;
    const saved = await this.saveJob(job);
    await this.appendAudit("part_document_revised", partId, `Revised part attachment ${document.originalFilename}.`);
    return saved;
  }

  async deleteJobDocument(jobId, documentId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const documents = Array.isArray(job.documents) ? job.documents : [];
    const documentIndex = documents.findIndex((item) => item.id === documentId);
    if (documentIndex < 0) {
      throw new Error("Document not found.");
    }
    const document = documents[documentIndex];
    if (document.active !== false) {
      throw new Error("Only archived attachments can be deleted.");
    }
    await this.deleteDocumentFiles(dataRoot, document);
    documents.splice(documentIndex, 1);
    job.documents = documents;
    const saved = await this.saveJob(job);
    await this.appendAudit("job_document_deleted", jobId, `Deleted archived job attachment ${document.originalFilename}.`);
    return saved;
  }

  async deletePartDocument(jobId, partId, documentId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const documents = Array.isArray(part.documents) ? part.documents : [];
    const documentIndex = documents.findIndex((item) => item.id === documentId);
    if (documentIndex < 0) {
      throw new Error("Document not found.");
    }
    const document = documents[documentIndex];
    if (document.active !== false) {
      throw new Error("Only archived attachments can be deleted.");
    }
    await this.deleteDocumentFiles(dataRoot, document);
    documents.splice(documentIndex, 1);
    part.documents = documents;
    const saved = await this.saveJob(job);
    await this.appendAudit("part_document_deleted", partId, `Deleted archived part attachment ${document.originalFilename}.`);
    return saved;
  }

  async savePartInspection(jobId, partId, inspection) {
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    part.inspection = this.normalizeInspection(inspection);
    const saved = await this.saveJob(job);
    await this.appendAudit("part_inspection_saved", partId, `Saved inspection data for ${part.partNumber || part.partName || partId}.`);
    return saved;
  }

  async extractPartInspectionFromDrawing(jobId, partId, source = {}, mainWindow = null) {
    const dataRoot = await this.requireDataFolder();
    const preferences = await this.loadPreferences(dataRoot);
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    let document = null;
    if (source?.upload) {
      document = await this.chooseInspectionDrawing(jobId, partId, mainWindow);
      if (!document) {
        return null;
      }
      part.documents = [...(part.documents || []), document];
    } else {
      document = (part.documents || []).find((item) => item.id === source?.documentId);
    }
    if (!document) {
      throw new Error("Choose a PDF drawing before extracting inspection dimensions.");
    }
    if (String(document.fileType || "").toUpperCase() !== "PDF") {
      throw new Error("Inspection drawing extraction currently supports PDF drawings only.");
    }
    const drawingPath = this.getStoredDocumentPath(dataRoot, document);
    if (!drawingPath || !(await pathExists(drawingPath))) {
      throw new Error("Drawing PDF file could not be found.");
    }
    const extraction = await extractInspectionFromDrawing({
      apiKey: preferences.openaiApiKey,
      filePath: drawingPath,
      filename: document.originalFilename || document.storedFilename
    });
    const inspection = this.normalizeInspection(part.inspection);
    const existingNumbers = new Set(inspection.characteristics.map((item) => String(item.number || "").toLowerCase()));
    const accepted = [];
    const queued = [];
    const balloons = [];
    for (const extracted of extraction.characteristics || []) {
      const characteristic = this.normalizeInspection({ characteristics: [{ ...extracted, sourceDrawingDocumentId: document.id }] }).characteristics[0];
      const highConfidence = characteristic.confidence === "high"
        && characteristic.nominal
        && characteristic.units
        && (characteristic.gdTolerance || characteristic.plusTolerance || characteristic.minusTolerance || characteristic.lowerLimit || characteristic.upperLimit);
      if (highConfidence && !existingNumbers.has(String(characteristic.number || "").toLowerCase())) {
        accepted.push(characteristic);
        existingNumbers.add(String(characteristic.number || "").toLowerCase());
        balloons.push({
          id: randomId("balloon"),
          characteristicId: characteristic.id,
          sourceDrawingDocumentId: document.id,
          pageNumber: extracted.balloon?.pageNumber || 1,
          x: extracted.balloon?.x ?? 0.5,
          y: extracted.balloon?.y ?? 0.5,
          labelText: characteristic.number,
          confidence: characteristic.confidence,
          placementSource: "ai"
        });
      } else {
        queued.push(characteristic);
      }
    }
    inspection.characteristics = [...inspection.characteristics, ...accepted];
    inspection.reviewQueue = [...(inspection.reviewQueue || []), ...queued];
    inspection.balloons = [...inspection.balloons, ...this.normalizeInspection({ balloons }).balloons];
    inspection.extractionRuns = [
      ...(inspection.extractionRuns || []),
      {
        id: randomId("inspection-extraction"),
        sourceDrawingDocumentId: document.id,
        sourceFilename: document.originalFilename || document.storedFilename,
        extractedAt: nowIso(),
        acceptedCount: accepted.length,
        queuedCount: queued.length,
        rejectedCount: 0,
        balloonedCount: balloons.length,
        warnings: extraction.warnings || [],
        errors: []
      }
    ];
    part.inspection = this.normalizeInspection(inspection);
    const saved = await this.saveJob(job);
    return { job: saved, accepted, queued, warnings: extraction.warnings || [], document };
  }

  async deleteDocumentFiles(dataRoot, document) {
    const pathsToRemove = [
      document?.storedPath ? path.join(dataRoot, document.storedPath) : "",
      ...((document?.revisions || []).map((revision) => revision?.storedPath ? path.join(dataRoot, revision.storedPath) : ""))
    ].filter(Boolean);
    for (const targetPath of pathsToRemove) {
      if (await pathExists(targetPath)) {
        await fs.rm(targetPath, { force: true });
      }
    }
  }

  formatOperationLibrarySelections(operation, libraries) {
    const lines = [];
    for (const [libraryName, selectedIds] of Object.entries(operation?.librarySelections || {})) {
      if (!selectedIds?.length) {
        continue;
      }
      const library = libraries?.[libraryName] || null;
      const recordMap = new Map((library?.records || []).map((record) => [record.id, record.name]));
      const selectedNames = selectedIds.map((recordId) => recordMap.get(recordId) || `[Missing] ${recordId}`);
      lines.push(`${library?.label || libraryName}: ${selectedNames.join(", ")}`);
    }
    return lines;
  }

  async jobHistoryMarkdown(job) {
    const libraries = await this.loadLibraries().catch(() => ({}));
    const lines = [
      `# Job History: ${job.jobNumber || job.id}`,
      "",
      `Generated: ${nowIso()}`,
      "",
      `- Customer: ${job.customer || "-"}`,
      `- Status: ${job.status || "-"}`,
      `- Priority: ${job.priority || "-"}`,
      `- Due Date: ${job.dueDate || "-"}`,
      `- Revision: ${job.revision?.number || "-"}`,
      `- Job Documents: ${job.documents?.length || 0}`,
      "",
      "## Notes",
      "",
      job.notes || "No notes.",
      ""
    ];
    for (const part of job.parts) {
      lines.push(`## Part: ${part.partNumber || part.partName || part.id}`, "");
      lines.push(`- Description: ${part.description || "-"}`);
      lines.push(`- Quantity: ${part.quantity || "-"}`);
      lines.push(`- Material Spec: ${part.materialSpec || "-"}`);
      lines.push(`- Material Lots: ${part.requiredMaterialLots.join(", ") || "-"}`);
      lines.push(`- Other Material: ${part.customMaterialText || "-"}`);
      lines.push(`- Revision: ${part.revision?.number || "-"}`);
      lines.push(`- Part Documents: ${part.documents?.length || 0}`);
      lines.push("");
      for (const operation of part.operations) {
        lines.push(`### ${operation.sequence}. ${operation.title}`, "");
        lines.push(`- Type: ${operation.type || "-"}`);
        lines.push(`- Work Center: ${operation.workCenter || "-"}`);
        lines.push(`- Tools: ${operation.tools.map((tool) => tool.name || tool.fusionToolNumber || tool.id).join(", ") || "-"}`);
        const librarySelections = this.formatOperationLibrarySelections(operation, libraries);
        lines.push(`- Libraries: ${librarySelections.join(" | ") || "-"}`);
        lines.push(`- Instruments: ${operation.requiredInstruments.join(", ") || "-"}`);
        lines.push(`- Status: ${operation.status || "-"}`);
        lines.push("");
        if (operation.setupInstructions) {
          lines.push("Setup Instructions:", "", operation.setupInstructions, "");
        }
        if (operation.workInstructions) {
          lines.push("Work Instructions:", "", operation.workInstructions, "");
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  async listMaterials() {
    const dataRoot = await this.requireDataFolder();
    const root = path.join(dataRoot, "materials");
    const entries = await fs.readdir(root, { withFileTypes: true });
    const materials = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const material = await readJson(path.join(root, entry.name, "material.json"), null);
      if (!material?.id) {
        continue;
      }
      materials.push(this.buildMaterialSummary(material));
    }
    return materials.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  buildMaterialSummary(material) {
    const normalized = this.normalizeMaterial(material);
    return {
      id: normalized.id,
      serialCode: normalized.serialCode,
      materialType: normalized.materialType,
      materialFamily: normalized.materialFamily,
      materialAlloy: normalized.materialAlloy,
      form: normalized.form,
      dimensions: normalized.dimensions,
      supplier: normalized.supplier,
      traceabilityLevel: normalized.traceabilityLevel,
      dateReceived: normalized.dateReceived,
      status: normalized.status || "active",
      updatedAt: normalized.updatedAt || normalized.createdAt || "",
      attachmentCount: Array.isArray(normalized.attachments) ? normalized.attachments.length : 0,
      usageCount: Array.isArray(normalized.usageRefs) ? normalized.usageRefs.length : 0
    };
  }

  async loadMaterial(materialId, options = {}) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getMaterialRoot(dataRoot, materialId);
    const material = await readJson(path.join(root, "material.json"), null);
    if (!material) {
      return null;
    }
    if (options.acquireLock) {
      await this.acquireLock("material", materialId, path.join(root, "material.json"));
    }
    return this.normalizeMaterial(material);
  }

  async readSerialWordList(filename) {
    const raw = await readText(path.join(this.wordlistDir, filename), "");
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  async generateMaterialSerial() {
    const [adjectives, colors, animals, materials] = await Promise.all([
      this.readSerialWordList("adjectives.txt"),
      this.readSerialWordList("colors.txt"),
      this.readSerialWordList("animals.txt"),
      this.listMaterials()
    ]);
    const used = new Set(materials.map((item) => normalizeText(item.serialCode)));
    for (let attempts = 0; attempts < 1000; attempts += 1) {
      const serial = `${pick(adjectives).replace(/\b\w/g, (char) => char.toUpperCase())} ${pick(colors).replace(/\b\w/g, (char) => char.toUpperCase())} ${pick(animals).replace(/\b\w/g, (char) => char.toUpperCase())}`;
      if (!used.has(normalizeText(serial))) {
        return serial;
      }
    }
    throw new Error("Unable to generate a unique material serial code.");
  }

  normalizeMaterial(material) {
    const shapeDimensions = normalizeShapeDimensions(material?.shapeDimensions);
    const materialFamily = String(material?.materialFamily || "").trim();
    const materialAlloy = String(material?.materialAlloy || "").trim();
    const legacyMaterialType = String(material?.materialType || "").trim();
    return {
      id: material?.id || randomId("material"),
      serialCode: String(material?.serialCode || "").trim(),
      materialType: materialAlloy || materialFamily || legacyMaterialType,
      materialFamily,
      materialAlloy,
      form: String(material?.form || "").trim(),
      supplier: String(material?.supplier || "").trim(),
      dateReceived: String(material?.dateReceived || todayIso()).trim(),
      purchaseOrder: String(material?.purchaseOrder || "").trim(),
      heatNumber: String(material?.heatNumber || "").trim(),
      lotNumber: String(material?.lotNumber || "").trim(),
      materialSpec: String(material?.materialSpec || "").trim(),
      shapeDimensions,
      dimensions: materialDimensionsSummary(String(material?.form || "").trim(), shapeDimensions, String(material?.dimensions || "").trim()),
      traceabilityLevel: String(material?.traceabilityLevel || "").trim(),
      originalStockIdentifier: String(material?.originalStockIdentifier || "").trim(),
      customerName: String(material?.customerName || "").trim(),
      storageLocation: String(material?.storageLocation || "").trim(),
      status: String(material?.status || "active").trim(),
      notes: String(material?.notes || "").trim(),
      attachments: (Array.isArray(material?.attachments) ? material.attachments : []).map((attachment) => this.normalizeMaterialAttachment(attachment)),
      jobs: Array.isArray(material?.jobs) ? material.jobs : [],
      changeLog: Array.isArray(material?.changeLog) ? material.changeLog : [],
      usageRefs: Array.isArray(material?.usageRefs) ? material.usageRefs : [],
      createdAt: String(material?.createdAt || "").trim(),
      updatedAt: String(material?.updatedAt || "").trim()
    };
  }

  normalizeMaterialAttachment(attachment) {
    const normalized = this.normalizeDocument({
      ...attachment,
      id: attachment?.id || randomId("attachment"),
      category: attachment?.attachmentCategory || attachment?.category || "Other",
      description: attachment?.description || ""
    }, "Other");
    return {
      ...normalized,
      attachmentCategory: attachment?.attachmentCategory || normalized.category || "Other",
      description: attachment?.description || normalized.description || ""
    };
  }

  async saveMaterial(material) {
    const dataRoot = await this.requireDataFolder();
    const normalized = this.normalizeMaterial(material);
    if (!normalized.serialCode) {
      normalized.serialCode = await this.generateMaterialSerial();
    }
    if (!normalized.materialType || !normalized.supplier) {
      throw new Error("Material selection and supplier are required.");
    }
    const timestamp = nowIso();
    const existing = await this.loadMaterial(normalized.id);
    normalized.createdAt = existing?.createdAt || timestamp;
    normalized.updatedAt = timestamp;
    if (!existing) {
      normalized.changeLog = [
        { id: randomId("change"), changeType: "record_created", message: "Material record created.", createdAt: timestamp },
        ...normalized.changeLog
      ];
    } else {
      normalized.changeLog = [
        { id: randomId("change"), changeType: "record_updated", message: "Material record updated.", createdAt: timestamp },
        ...normalized.changeLog.filter((entry) => entry?.id)
      ];
    }
    const root = this.getMaterialRoot(dataRoot, normalized.id);
    await ensureDir(path.join(root, "attachments"));
    await writeJson(path.join(root, "material.json"), normalized);
    await writeText(path.join(root, "history.md"), this.materialHistoryMarkdown(normalized));
    await this.appendAudit("material_saved", normalized.id, `Saved material ${normalized.serialCode}.`);
    await this.rebuildCrossReferences();
    return this.loadMaterial(normalized.id);
  }

  materialHistoryMarkdown(material) {
    const lines = [
      `# Material History: ${material.serialCode || material.id}`,
      "",
      `Generated: ${nowIso()}`,
      "",
      `- Material: ${material.materialFamily || "-"}`,
      `- Alloy: ${material.materialAlloy || material.materialType || "-"}`,
      `- Form: ${material.form || "-"}`,
      `- Supplier: ${material.supplier || "-"}`,
      `- Traceability: ${material.traceabilityLevel || "-"}`,
      `- Status: ${material.status || "-"}`,
      "",
      "## Notes",
      "",
      material.notes || "No notes.",
      "",
      "## Shape",
      "",
      `- Shape: ${material.form || "-"}`,
      `- Dimensions: ${material.dimensions || "-"}`,
      "",
      "## Usage",
      ""
    ];
    if (material.usageRefs?.length) {
      for (const ref of material.usageRefs) {
        lines.push(`- ${ref.jobNumber || ref.jobId} / ${ref.partNumber || ref.partId} / ${ref.operationCode || ref.operationId}`);
      }
    } else {
      lines.push("No job usage recorded.");
    }
    lines.push("", "## Attachments", "");
    if (material.attachments?.length) {
      for (const attachment of material.attachments) {
        lines.push(`- ${attachment.originalFilename}`);
      }
    } else {
      lines.push("No attachments.");
    }
    return `${lines.join("\n")}\n`;
  }

  async archiveMaterial(materialId) {
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    material.status = "archived";
    return this.saveMaterial(material);
  }

  async chooseMaterialAttachments(materialId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Material Attachments",
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) {
      return [];
    }
    const copied = [];
    for (const sourcePath of result.filePaths) {
      copied.push(await this.copyMaterialAttachment(materialId, sourcePath));
    }
    return copied;
  }

  async openMaterialAttachment(materialId, attachmentId) {
    const dataRoot = await this.requireDataFolder();
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachment = (material.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const targetPath = attachment.storedPath
      ? path.join(dataRoot, attachment.storedPath)
      : attachment.originalPath;
    if (!targetPath || !(await pathExists(targetPath))) {
      throw new Error("Attachment file could not be found.");
    }
    const openError = await shell.openPath(targetPath);
    if (openError) {
      throw new Error(openError);
    }
    return true;
  }

  async openMaterialAttachmentRevision(materialId, attachmentId, revisionIndex) {
    const dataRoot = await this.requireDataFolder();
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachment = (material.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const revisions = Array.isArray(attachment.revisions) ? attachment.revisions : [];
    const revision = revisions[Number(revisionIndex)];
    if (!revision) {
      throw new Error("Attachment revision not found.");
    }
    const targetPath = revision.storedPath
      ? path.join(dataRoot, revision.storedPath)
      : revision.originalPath;
    return this.openDocumentByStoredPath(targetPath);
  }

  async copyMaterialAttachment(materialId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getMaterialRoot(dataRoot, materialId);
    await ensureDir(path.join(root, "attachments"));
    const destination = await copyFileUnique(sourcePath, path.join(root, "attachments"), "");
    return this.normalizeMaterialAttachment({
      id: randomId("attachment"),
      originalFilename: path.basename(sourcePath),
      storedFilename: path.basename(destination),
      storedPath: path.relative(dataRoot, destination).replaceAll("\\", "/"),
      originalPath: sourcePath,
      fileType: path.extname(sourcePath).slice(1).toUpperCase(),
      attachmentCategory: "Other",
      description: "",
      attachedAt: nowIso()
    });
  }

  async archiveMaterialAttachment(materialId, attachmentId) {
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachment = (material.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    attachment.active = false;
    attachment.archivedAt = nowIso();
    const saved = await this.saveMaterial(material);
    await this.appendAudit("material_attachment_archived", materialId, `Archived material attachment ${attachment.originalFilename}.`);
    return saved;
  }

  async unarchiveMaterialAttachment(materialId, attachmentId) {
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachment = (material.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    attachment.active = true;
    attachment.archivedAt = "";
    const saved = await this.saveMaterial(material);
    await this.appendAudit("material_attachment_unarchived", materialId, `Unarchived material attachment ${attachment.originalFilename}.`);
    return saved;
  }

  async reviseMaterialAttachment(materialId, attachmentId, mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose New Material Attachment Revision",
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return null;
    }
    return this.replaceMaterialAttachment(materialId, attachmentId, result.filePaths[0]);
  }

  async replaceMaterialAttachment(materialId, attachmentId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachment = (material.attachments || []).find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    const destination = await copyFileUnique(sourcePath, path.join(this.getMaterialRoot(dataRoot, materialId), "attachments"), "");
    const revisionTimestamp = nowIso();
    attachment.revisions = [
      ...(attachment.revisions || []),
      {
        originalFilename: attachment.originalFilename,
        storedFilename: attachment.storedFilename,
        storedPath: attachment.storedPath,
        originalPath: attachment.originalPath,
        fileType: attachment.fileType,
        attachedAt: attachment.attachedAt,
        revisedAt: revisionTimestamp,
        revisionNumber: attachment.revisionNumber || 1
      }
    ];
    attachment.originalFilename = path.basename(sourcePath);
    attachment.storedFilename = path.basename(destination);
    attachment.storedPath = path.relative(dataRoot, destination).replaceAll("\\", "/");
    attachment.originalPath = sourcePath;
    attachment.fileType = path.extname(sourcePath).slice(1).toUpperCase();
    attachment.active = true;
    attachment.archivedAt = "";
    attachment.revisedAt = revisionTimestamp;
    attachment.revisionNumber = Number(attachment.revisionNumber || 1) + 1;
    const saved = await this.saveMaterial(material);
    await this.appendAudit("material_attachment_revised", materialId, `Revised material attachment ${attachment.originalFilename}.`);
    return saved;
  }

  async deleteMaterialAttachment(materialId, attachmentId) {
    const dataRoot = await this.requireDataFolder();
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    const attachments = Array.isArray(material.attachments) ? material.attachments : [];
    const attachmentIndex = attachments.findIndex((item) => item.id === attachmentId);
    if (attachmentIndex < 0) {
      throw new Error("Attachment not found.");
    }
    const attachment = attachments[attachmentIndex];
    if (attachment.active !== false) {
      throw new Error("Only archived attachments can be deleted.");
    }
    await this.deleteDocumentFiles(dataRoot, attachment);
    attachments.splice(attachmentIndex, 1);
    material.attachments = attachments;
    const saved = await this.saveMaterial(material);
    await this.appendAudit("material_attachment_deleted", materialId, `Deleted archived material attachment ${attachment.originalFilename}.`);
    return saved;
  }

  async listStandards() {
    const dataRoot = await this.requireDataFolder();
    return readJson(path.join(dataRoot, "metrology", "standards", "standards.json"), []);
  }

  async saveStandard(standard) {
    const dataRoot = await this.requireDataFolder();
    const standards = await this.listStandards();
    const normalized = {
      standard_id: standard?.standard_id || randomId("STD"),
      name: String(standard?.name || "").trim(),
      identifier: String(standard?.identifier || "").trim(),
      description: String(standard?.description || "").trim(),
      traceability_reference: String(standard?.traceability_reference || "").trim(),
      notes: String(standard?.notes || "").trim(),
      active: standard?.active !== false,
      updated_at: nowIso()
    };
    const next = standards.filter((item) => item.standard_id !== normalized.standard_id);
    next.push(normalized);
    next.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    await writeJson(path.join(dataRoot, "metrology", "standards", "standards.json"), next);
    await this.appendAudit("standard_saved", normalized.standard_id, `Saved standard ${normalized.name || normalized.standard_id}.`);
    return normalized;
  }

  async listInstruments() {
    const dataRoot = await this.requireDataFolder();
    const root = path.join(dataRoot, "metrology", "instruments");
    const entries = await fs.readdir(root, { withFileTypes: true });
    const instruments = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const instrument = await readJson(path.join(root, entry.name, "instrument.json"), null);
      if (!instrument?.instrument_id) {
        continue;
      }
      instruments.push(await this.buildInstrumentBundle(instrument.instrument_id));
    }
    return instruments
      .filter(Boolean)
      .map((bundle) => ({
        instrumentId: bundle.instrument.instrument_id,
        toolName: bundle.instrument.tool_name,
        toolType: bundle.instrument.tool_type,
        status: bundle.effective_status,
        dueState: bundle.due_state,
        nextDueDate: bundle.latest_calibration?.next_due_date || "",
        updatedAt: bundle.instrument.updated_at || bundle.instrument.created_at || "",
        active: bundle.instrument.active !== false
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async buildInstrumentBundle(instrumentId) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getInstrumentRoot(dataRoot, instrumentId);
    const instrument = await readJson(path.join(root, "instrument.json"), null);
    if (!instrument) {
      return null;
    }
    const calibrationDir = path.join(root, "calibrations");
    const entries = (await pathExists(calibrationDir)) ? await fs.readdir(calibrationDir, { withFileTypes: true }) : [];
    const calibrations = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const calibration = await readJson(path.join(calibrationDir, entry.name), null);
        if (calibration?.calibration_id) {
          calibrations.push(calibration);
        }
      }
    }
    calibrations.sort((a, b) => String(b.calibration_date || "").localeCompare(String(a.calibration_date || "")));
    const latest = calibrations[0] || null;
    const dueDays = latest?.next_due_date ? daysUntil(latest.next_due_date) : null;
    let dueState = "No calibration record";
    if (instrument.active === false) {
      dueState = "Inactive";
    } else if (!latest) {
      dueState = "No calibration record";
    } else if (!latest.next_due_date) {
      dueState = "No due date";
    } else if (dueDays == null) {
      dueState = "Invalid due date";
    } else if (dueDays < 0) {
      dueState = "Overdue";
    } else if (dueDays <= 14) {
      dueState = "Due soon";
    } else {
      dueState = "Current";
    }
    let effectiveStatus = instrument.status || "In service";
    if (instrument.active === false) {
      effectiveStatus = "Inactive";
    } else if (dueState === "Overdue") {
      effectiveStatus = "Overdue";
    } else if (dueState === "Due soon" && effectiveStatus === "In service") {
      effectiveStatus = "Due for calibration";
    }
    return {
      instrument,
      calibrations,
      latest_calibration: latest,
      due_state: dueState,
      effective_status: effectiveStatus
    };
  }

  async loadInstrument(instrumentId, options = {}) {
    const bundle = await this.buildInstrumentBundle(instrumentId);
    if (!bundle) {
      return null;
    }
    if (options.acquireLock) {
      const dataRoot = await this.requireDataFolder();
      await this.acquireLock("instrument", instrumentId, path.join(this.getInstrumentRoot(dataRoot, instrumentId), "instrument.json"));
    }
    return bundle;
  }

  normalizeCalibration(calibration) {
    return {
      calibration_id: calibration?.calibration_id || randomId("CAL"),
      calibration_date: String(calibration?.calibration_date || todayIso()).trim(),
      next_due_date: String(calibration?.next_due_date || "").trim(),
      performed_by: String(calibration?.performed_by || "").trim(),
      calibration_vendor: String(calibration?.calibration_vendor || "").trim(),
      standard_id: String(calibration?.standard_id || "").trim(),
      standard_name: String(calibration?.standard_name || "").trim(),
      standard_identifier: String(calibration?.standard_identifier || "").trim(),
      standard_description: String(calibration?.standard_description || "").trim(),
      traceability_reference: String(calibration?.traceability_reference || "").trim(),
      result: String(calibration?.result || "").trim(),
      measurement_notes: String(calibration?.measurement_notes || "").trim(),
      environmental_notes: String(calibration?.environmental_notes || "").trim(),
      certificate_number: String(calibration?.certificate_number || "").trim(),
      attachment_path: String(calibration?.attachment_path || "").trim(),
      notes: String(calibration?.notes || "").trim(),
      created_at: calibration?.created_at || nowIso(),
      updated_at: nowIso()
    };
  }

  async saveInstrument(payload) {
    const dataRoot = await this.requireDataFolder();
    const timestamp = nowIso();
    const instrument = {
      instrument_id: payload?.instrument?.instrument_id || payload?.instrument_id || randomId("INS"),
      tool_name: String(payload?.instrument?.tool_name || payload?.tool_name || "").trim(),
      tool_type: String(payload?.instrument?.tool_type || payload?.tool_type || "").trim(),
      manufacturer: String(payload?.instrument?.manufacturer || "").trim(),
      model: String(payload?.instrument?.model || "").trim(),
      serial_number: String(payload?.instrument?.serial_number || "").trim(),
      measuring_range: String(payload?.instrument?.measuring_range || "").trim(),
      resolution: String(payload?.instrument?.resolution || "").trim(),
      accuracy: String(payload?.instrument?.accuracy || "").trim(),
      location: String(payload?.instrument?.location || "").trim(),
      owner_department: String(payload?.instrument?.owner_department || "").trim(),
      status: String(payload?.instrument?.status || "In service").trim(),
      notes: String(payload?.instrument?.notes || "").trim(),
      date_added: String(payload?.instrument?.date_added || todayIso()).trim(),
      active: payload?.instrument?.active !== false,
      service_date: String(payload?.instrument?.service_date || "").trim(),
      retired_date: String(payload?.instrument?.retired_date || "").trim(),
      created_at: payload?.instrument?.created_at || timestamp,
      updated_at: timestamp
    };
    if (!instrument.tool_name) {
      throw new Error("Instrument tool name is required.");
    }
    const root = this.getInstrumentRoot(dataRoot, instrument.instrument_id);
    await ensureDir(path.join(root, "calibrations"));
    await ensureDir(path.join(root, "attachments"));
    await writeJson(path.join(root, "instrument.json"), instrument);
    const calibrations = (Array.isArray(payload?.calibrations) ? payload.calibrations : []).map((item) => this.normalizeCalibration(item));
    const existingCalibrations = (await pathExists(path.join(root, "calibrations")))
      ? await fs.readdir(path.join(root, "calibrations"), { withFileTypes: true })
      : [];
    const keepFiles = new Set(calibrations.map((item) => `${safeFileName(item.calibration_id)}.json`));
    for (const entry of existingCalibrations) {
      if (entry.isFile() && entry.name.endsWith(".json") && !keepFiles.has(entry.name)) {
        await fs.rm(path.join(root, "calibrations", entry.name), { force: true });
      }
    }
    for (const calibration of calibrations) {
      await writeJson(path.join(root, "calibrations", `${safeFileName(calibration.calibration_id)}.json`), {
        ...calibration,
        instrument_id: instrument.instrument_id
      });
      await writeText(path.join(root, "calibrations", `${safeFileName(calibration.calibration_id)}.md`), this.calibrationMarkdown(instrument, calibration));
    }
    await writeText(path.join(root, "instrument.md"), this.instrumentSummaryMarkdown(instrument, calibrations));
    await writeText(path.join(root, "history.md"), this.instrumentHistoryMarkdown(instrument, calibrations));
    await this.appendAudit("instrument_saved", instrument.instrument_id, `Saved instrument ${instrument.tool_name}.`);
    await this.rebuildCrossReferences();
    return this.loadInstrument(instrument.instrument_id);
  }

  instrumentSummaryMarkdown(instrument, calibrations) {
    const latest = calibrations[0];
    return [
      `# Instrument Summary: ${instrument.instrument_id}`,
      "",
      `- Tool Name: ${instrument.tool_name || "-"}`,
      `- Tool Type: ${instrument.tool_type || "-"}`,
      `- Serial Number: ${instrument.serial_number || "-"}`,
      `- Location: ${instrument.location || "-"}`,
      `- Status: ${instrument.status || "-"}`,
      "",
      "## Latest Calibration",
      "",
      latest ? `- Date: ${latest.calibration_date || "-"}\n- Due: ${latest.next_due_date || "-"}\n- Result: ${latest.result || "-"}` : "No calibrations recorded.",
      ""
    ].join("\n");
  }

  instrumentHistoryMarkdown(instrument, calibrations) {
    const lines = [
      `# Instrument History: ${instrument.instrument_id}`,
      "",
      `Generated: ${nowIso()}`,
      "",
      `- Tool Name: ${instrument.tool_name || "-"}`,
      `- Status: ${instrument.status || "-"}`,
      `- Active: ${instrument.active !== false ? "Yes" : "No"}`,
      "",
      "## Notes",
      "",
      instrument.notes || "No notes.",
      "",
      "## Calibrations",
      ""
    ];
    if (calibrations.length) {
      for (const calibration of calibrations) {
        lines.push(`### ${calibration.calibration_date || "-"} - ${calibration.result || "-"}`, "");
        lines.push(`- Next Due: ${calibration.next_due_date || "-"}`);
        lines.push(`- Performed By: ${calibration.performed_by || "-"}`);
        lines.push(`- Standard: ${calibration.standard_name || "-"}`);
        lines.push("");
      }
    } else {
      lines.push("No calibrations recorded.");
    }
    return `${lines.join("\n")}\n`;
  }

  calibrationMarkdown(instrument, calibration) {
    return [
      `# Calibration Record: ${calibration.calibration_id}`,
      "",
      `- Instrument ID: ${instrument.instrument_id}`,
      `- Tool Name: ${instrument.tool_name || "-"}`,
      `- Calibration Date: ${calibration.calibration_date || "-"}`,
      `- Next Due Date: ${calibration.next_due_date || "-"}`,
      `- Performed By: ${calibration.performed_by || "-"}`,
      `- Result: ${calibration.result || "-"}`,
      `- Standard: ${calibration.standard_name || "-"}`,
      "",
      "## Notes",
      "",
      calibration.notes || "No notes.",
      ""
    ].join("\n");
  }

  async archiveInstrument(instrumentId) {
    const bundle = await this.loadInstrument(instrumentId);
    if (!bundle) {
      throw new Error(`Instrument not found: ${instrumentId}`);
    }
    bundle.instrument.active = false;
    bundle.instrument.status = "Retired";
    bundle.instrument.retired_date = bundle.instrument.retired_date || todayIso();
    return this.saveInstrument(bundle);
  }

  async appendAudit(eventType, entityId, message, extra = {}) {
    const dataRoot = await this.requireDataFolder();
    await appendJsonLine(path.join(dataRoot, "audit", "audit-log.jsonl"), {
      timestamp: nowIso(),
      eventType,
      entityId,
      message,
      ...extra
    });
  }

  async readAuditLog(limit = 200) {
    const dataRoot = await this.requireDataFolder();
    const raw = await readText(path.join(dataRoot, "audit", "audit-log.jsonl"), "");
    const rows = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return rows.slice(-limit).reverse();
  }

  async rebuildCrossReferences() {
    const dataRoot = await this.requireDataFolder();
    const jobs = [];
    const materialsMap = new Map();
    const instrumentsMap = new Map();

    for (const materialSummary of await this.listMaterials()) {
      const material = await this.loadMaterial(materialSummary.id);
      if (material) {
        material.usageRefs = [];
        materialsMap.set(material.id, material);
      }
    }

    const instrumentSummaries = await this.listInstruments();
    for (const summary of instrumentSummaries) {
      const bundle = await this.loadInstrument(summary.instrumentId);
      if (bundle) {
        bundle.instrument.usageRefs = [];
        instrumentsMap.set(bundle.instrument.instrument_id, bundle);
      }
    }

    for (const summary of await this.listJobSummaries()) {
      const job = await this.loadJob(summary.id);
      if (!job) {
        continue;
      }
      jobs.push(job);
      for (const part of job.parts) {
        for (const materialId of part.requiredMaterialLots || []) {
          const material = materialsMap.get(materialId);
          if (material) {
            material.usageRefs.push({
              jobId: job.id,
              jobNumber: job.jobNumber,
              partId: part.id,
              partNumber: part.partNumber,
              operationId: "",
              operationCode: "",
              operationTitle: ""
            });
          }
        }
        for (const operation of part.operations) {
          for (const instrumentId of operation.requiredInstruments || []) {
            const bundle = instrumentsMap.get(instrumentId);
            if (bundle) {
              bundle.instrument.usageRefs.push({
                jobId: job.id,
                jobNumber: job.jobNumber,
                partId: part.id,
                partNumber: part.partNumber,
                operationId: operation.id,
                operationCode: operation.operationCode,
                operationTitle: operation.title
              });
            }
          }
        }
      }
    }

    for (const material of materialsMap.values()) {
      const root = this.getMaterialRoot(dataRoot, material.id);
      await writeJson(path.join(root, "material.json"), material);
      await writeText(path.join(root, "history.md"), this.materialHistoryMarkdown(material));
    }
    for (const bundle of instrumentsMap.values()) {
      const root = this.getInstrumentRoot(dataRoot, bundle.instrument.instrument_id);
      await writeJson(path.join(root, "instrument.json"), bundle.instrument);
      await writeText(path.join(root, "history.md"), this.instrumentHistoryMarkdown(bundle.instrument, bundle.calibrations));
    }

    await this.rebuildIndex();
    return true;
  }

  async rebuildIndex() {
    const dataRoot = await this.requireDataFolder();
    const [jobSummaries, nonconformances, kanbanCards, materials, instruments] = await Promise.all([
      this.listJobSummaries(),
      this.listNonconformances(),
      this.listKanbanCards(),
      this.listMaterials(),
      this.listInstruments()
    ]);
    const jobs = await Promise.all(jobSummaries.map((summary) => this.loadJob(summary.id)));
    const index = {
      generatedAt: nowIso(),
      jobs: jobs.filter(Boolean).map((job) => {
        const inspectionText = (job.parts || []).flatMap((part) => {
          const inspection = this.normalizeInspection(part?.inspection);
          return (inspection.reports || []).map((report) => [
            report.reportId,
            report.status,
            report.finalResult,
            report.traceability?.customer,
            report.traceability?.internalJobNumber,
            report.traceability?.partNumber,
            report.traceability?.drawingRevision,
            report.quantitySummary?.quantityInspected,
            report.quantitySummary?.quantityAccepted,
            report.quantitySummary?.quantityRejected,
            report.inspectionContext?.inspectionType,
            report.inspectionContext?.samplingPlan,
            ...this.relatedInspectionNcrNumbers(job, part, nonconformances, report),
            report.releasedAt
          ].join(" "));
        }).join(" ");
        return ({
        id: job.id,
        label: `${job.jobNumber || job.id} ${job.customer || ""}`.trim(),
        searchText: `${job.jobNumber} ${job.customer} ${job.routeSummary} ${inspectionText}`.toLowerCase()
      });
      }),
      nonconformances: nonconformances.map((record) => ({
        id: record.id,
        label: `${record.ncrNumber || record.id} ${record.jobNumber || ""} ${record.partNumber || record.partName || ""}`.trim(),
        searchText: `${record.ncrNumber} ${record.jobNumber} ${record.partNumber} ${record.partName} ${record.issueSummary || ""} ${record.owner || ""} ${record.disposition || ""}`.toLowerCase()
      })),
      kanbanCards: kanbanCards.map((card) => ({
        id: card.id,
        label: `${card.itemName || card.internalInventoryNumber || card.id} ${card.vendor || ""}`.trim(),
        searchText: `${card.itemName} ${card.internalInventoryNumber} ${card.vendor} ${card.category || ""} ${card.department} ${card.storageLocation} ${card.orderingNotes || ""}`.toLowerCase()
      })),
      materials: materials.map((material) => ({
        id: material.id,
        label: `${material.serialCode} ${material.materialType}`.trim(),
        searchText: `${material.serialCode} ${material.materialType} ${material.supplier} ${material.traceabilityLevel}`.toLowerCase()
      })),
      instruments: instruments.map((instrument) => ({
        id: instrument.instrumentId,
        label: `${instrument.toolName} ${instrument.instrumentId}`.trim(),
        searchText: `${instrument.instrumentId} ${instrument.toolName} ${instrument.toolType} ${instrument.status}`.toLowerCase()
      }))
    };
    await writeJson(this.getIndexPath(dataRoot), index);
    return index;
  }

  relatedInspectionNcrNumbers(job, part, nonconformances = [], report = {}) {
    const numbers = [
      ...(Array.isArray(report?.relatedNcrNumbers) ? report.relatedNcrNumbers : [])
    ];
    for (const record of nonconformances || []) {
      const matchesStableId = record?.partId && record.partId === part?.id;
      const matchesLegacyIdentity = !record?.partId
        && record?.partNumber
        && record.partNumber === part?.partNumber
        && (!record?.jobId || record.jobId === job?.id || record.jobNumber === job?.jobNumber);
      if (matchesStableId || matchesLegacyIdentity) {
        numbers.push(record.ncrNumber || record.id);
      }
    }
    return Array.from(new Set(numbers.map((value) => String(value || "").trim()).filter(Boolean)));
  }

  async listInspectionReports() {
    const [jobs, nonconformances] = await Promise.all([
      Promise.all((await this.listJobSummaries()).map((summary) => this.loadJob(summary.id).catch(() => null))),
      this.listNonconformances().catch(() => [])
    ]);
    const reports = [];
    for (const job of jobs.filter(Boolean)) {
      for (const part of job.parts || []) {
        const inspection = this.normalizeInspection(part?.inspection);
        const sourceReports = inspection.reports?.length
          ? inspection.reports
          : [{
            id: inspection.activeReportId || "",
            reportId: "",
            status: "Draft",
            finalResult: "Pending",
            generatedAt: "",
            releasedAt: "",
            traceability: {},
            inspectionContext: {},
            quantitySummary: {}
          }];
        for (const report of sourceReports) {
          const characteristicCount = report.snapshot?.characteristics?.length || inspection.characteristics?.length || 0;
          const instanceCount = report.snapshot?.instances?.length || inspection.instances?.length || 0;
          reports.push({
            id: report.id || `${job.id}:${part.id}:draft`,
            reportId: report.reportId || "Draft Inspection",
            status: report.status || "Draft",
            finalResult: report.finalResult || "Pending",
            jobId: job.id,
            jobNumber: job.jobNumber || "",
            partId: part.id,
            partNumber: part.partNumber || "",
            partName: part.partName || "",
            customer: report.traceability?.customer || job.customer || "",
            drawingRevision: report.traceability?.drawingRevision || part.revision?.number || "",
            inspectionType: report.inspectionContext?.inspectionType || "",
            samplingPlan: report.inspectionContext?.samplingPlan || "",
            quantityInspected: report.quantitySummary?.quantityInspected || "",
            quantityAccepted: report.quantitySummary?.quantityAccepted || "",
            quantityRejected: report.quantitySummary?.quantityRejected || "",
            relatedNcrNumbers: this.relatedInspectionNcrNumbers(job, part, nonconformances, report),
            generatedAt: report.generatedAt || "",
            releasedAt: report.releasedAt || "",
            characteristicCount,
            instanceCount,
            active: part.active !== false && job.active !== false
          });
        }
      }
    }
    reports.sort((left, right) => String(right.generatedAt || right.releasedAt || "").localeCompare(String(left.generatedAt || left.releasedAt || "")));
    return reports;
  }

  async getDashboardState() {
    const [jobs, materials, instruments, audit] = await Promise.all([
      this.listJobSummaries(),
      this.listMaterials(),
      this.listInstruments(),
      this.readAuditLog(20)
    ]);
    return {
      counts: {
        openJobs: jobs.filter((job) => job.active).length,
        materials: materials.filter((item) => item.status !== "archived").length,
        instruments: instruments.filter((item) => item.active).length,
        overdueInstruments: instruments.filter((item) => item.dueState === "Overdue").length
      },
      recentAudit: audit,
      overdueInstruments: instruments.filter((item) => item.dueState === "Overdue" || item.dueState === "Due soon").slice(0, 10)
    };
  }

  async loadWorkspace() {
    const dataFolder = await this.requireDataFolder();
    const [dashboard, jobs, inspections, nonconformances, kanbanCards, customers, materials, instruments, templates, libraries, standards, preferences] = await Promise.all([
      this.getDashboardState(),
      this.listJobSummaries(),
      this.listInspectionReports(),
      this.listNonconformances(),
      this.listKanbanCards(),
      this.listCustomers(),
      this.listMaterials(),
      this.listInstruments(),
      this.loadTemplates(),
      this.loadLibraries(),
      this.listStandards(),
      this.loadPreferences(dataFolder)
    ]);
    return {
      dataFolder,
      dashboard,
      jobs,
      inspections,
      nonconformances,
      kanbanCards,
      customers,
      materials,
      instruments,
      templates,
      libraries,
      standards,
      preferences,
        constants: {
          material: MATERIAL_CONSTANTS,
          documentCategories: DOCUMENT_CATEGORIES,
          jobStatuses: ["Open", "In Process", "On Hold", "Complete", "Archived"],
          priorities: ["Low", "Normal", "High", "Hot"],
          instrumentStatuses: ["In service", "Due for calibration", "Overdue", "Retired"],
          nonconformanceStatuses: NONCONFORMANCE_STATUS_OPTIONS,
          nonconformanceSeverities: NONCONFORMANCE_SEVERITY_OPTIONS,
          nonconformanceSources: NONCONFORMANCE_SOURCE_OPTIONS,
          nonconformanceDetectionMethods: NONCONFORMANCE_DETECTION_METHOD_OPTIONS,
          nonconformanceRootCauseCategories: NONCONFORMANCE_ROOT_CAUSE_CATEGORY_OPTIONS,
          nonconformanceEffectivenessMethods: NONCONFORMANCE_EFFECTIVENESS_METHOD_OPTIONS,
          nonconformanceEffectivenessResults: NONCONFORMANCE_EFFECTIVENESS_RESULT_OPTIONS,
          nonconformanceAttachmentTypes: NONCONFORMANCE_ATTACHMENT_TYPE_OPTIONS,
          nonconformanceAttachmentStatuses: NONCONFORMANCE_ATTACHMENT_STATUS_OPTIONS,
          kanbanDeepLinkPrefix: KANBAN_DEEP_LINK_PREFIX,
          materialDeepLinkPrefix: MATERIAL_DEEP_LINK_PREFIX
        }
      };
    }

  buildXometryTravelerNotes(traveler) {
    const lines = [
      "Imported from Xometry traveler.",
      "",
      `Dimensions: ${traveler.dimensions || "-"}`,
      `Process: ${traveler.process || "-"}`,
      `Preferred Subprocess: ${traveler.preferred_subprocess || "-"}`,
      `Material: ${traveler.material || "-"}`,
      `Finish: ${traveler.finish || "-"}`,
      `Threads / Tapped Holes: ${traveler.threads || "-"}`,
      `Inserts: ${traveler.inserts || "-"}`,
      `Precision Tolerance: ${traveler.precision_tolerance || "-"}`,
      `Surface Roughness: ${traveler.surface_roughness || "-"}`,
      `Inspection: ${traveler.inspection || "-"}`,
      `Certificates / Supplier Qualifications: ${traveler.certificates || "-"}`,
      `Purchase Order: ${traveler.purchase_order || "-"}`,
      `Due Date: ${traveler.due_date || "-"}`,
      `Expedited: ${traveler.expedited ? "Yes" : "No"}`,
      `Contact: ${traveler.contact || "-"}`,
      `Traveler Job ID: ${traveler.traveler_job_id || "-"}`,
      `Last Revised: ${traveler.last_revised || "-"}`,
      `Report Generated: ${traveler.report_generated || "-"}`,
      `Traveler Notes: ${traveler.notes || "-"}`
    ];
    if (Array.isArray(traveler.additional_notes) && traveler.additional_notes.length) {
      lines.push(`Additional Requirements: ${traveler.additional_notes.join(" ")}`);
    }
    if (Array.isArray(traveler.warnings) && traveler.warnings.length) {
      lines.push("");
      lines.push("Import Warnings:");
      for (const warning of traveler.warnings) {
        lines.push(`- ${warning}`);
      }
    }
    return `${lines.join("\n")}\n`;
  }

  buildSubtractPurchaseOrderNotes(purchaseOrder) {
    return [
      "Imported from Subtract purchase order.",
      "",
      `PO Number: ${purchaseOrder.purchase_order || "-"}`,
      `Issue Date: ${purchaseOrder.issue_date || "-"}`,
      `Ship Date: ${purchaseOrder.ship_date || "-"}`,
      `Issuer: ${purchaseOrder.issuer_name || "-"}`,
      `Issuer Contact: ${[purchaseOrder.issuer_email, purchaseOrder.issuer_phone].filter(Boolean).join(" | ") || "-"}`,
      `Issuer Address: ${(purchaseOrder.issuer_address || []).join(", ") || "-"}`,
      `Deliver To: ${purchaseOrder.deliver_to_name || "-"}`,
      `Deliver To Contact: ${purchaseOrder.deliver_to_contact || "-"}`,
      `Deliver To Email: ${purchaseOrder.deliver_to_email || "-"}`,
      `Deliver To Phone: ${purchaseOrder.deliver_to_phone || "-"}`,
      `Deliver To Address: ${(purchaseOrder.deliver_to_address || []).join(", ") || "-"}`,
      `Total Amount: ${purchaseOrder.total_amount ? `$${purchaseOrder.total_amount}` : "-"}`,
      `PO Notes: ${purchaseOrder.notes || "-"}`
    ].join("\n");
  }

  buildSubtractPartNotes(partRow, purchaseOrder) {
    return [
      "Imported from Subtract purchase order part row.",
      "",
      `Tolerance: ${partRow.tolerance || "-"}`,
      `Finishing: ${partRow.finishing || "-"}`,
      `Print Required: ${partRow.print_required || "-"}`,
      `PO Notes: ${purchaseOrder.notes || "-"}`
    ].join("\n");
  }

  deriveSubtractPartNumber(partName, index) {
    const base = safeFileName(String(partName || "").toUpperCase().replace(/\s+/g, "-"), "");
    return base || `PART-${String(index + 1).padStart(3, "0")}`;
  }

  buildXometryPurchaseOrderNotes(purchaseOrder) {
    return [
      "Imported from Xometry purchase order.",
      "",
      `PO Number: ${purchaseOrder.purchase_order || "-"}`,
      `Issue Date: ${purchaseOrder.issue_date || "-"}`,
      `Ship Date: ${purchaseOrder.ship_date || "-"}`,
      `Expedited: ${purchaseOrder.expedited ? "Yes" : "No"}`,
      `Shipping Method: ${purchaseOrder.shipping_method || "-"}`,
      `Partner Quote ID: ${purchaseOrder.partner_quote_id || "-"}`,
      `Vendor: ${purchaseOrder.vendor_name || "-"}`,
      `Vendor Address: ${(purchaseOrder.vendor_address || []).join(", ") || "-"}`,
      `Ship To: ${purchaseOrder.ship_to_name || "-"}`,
      `Ship To Address: ${(purchaseOrder.ship_to_address || []).join(", ") || "-"}`,
      `Process: ${purchaseOrder.summary?.process || "-"}`,
      `Preferred Subprocess: ${purchaseOrder.summary?.preferred_subprocess || "-"}`,
      `Material: ${purchaseOrder.summary?.material || "-"}`,
      `Color: ${purchaseOrder.summary?.color || "-"}`,
      `Finish: ${purchaseOrder.summary?.finish || "-"}`,
      `Threads / Tapped Holes: ${purchaseOrder.summary?.threads || "-"}`,
      `Inserts: ${purchaseOrder.summary?.inserts || "-"}`,
      `Precision Tolerance: ${purchaseOrder.summary?.precision_tolerance || "-"}`,
      `Surface Roughness: ${purchaseOrder.summary?.surface_roughness || "-"}`,
      `Inspection: ${purchaseOrder.summary?.inspection || "-"}`,
      `Certificates / Supplier Qualifications: ${purchaseOrder.summary?.certificates || "-"}`,
      `Requirements Notes: ${purchaseOrder.summary?.notes || "-"}`,
      `Total Amount: ${purchaseOrder.total_amount ? `$${purchaseOrder.total_amount}` : "-"}`
    ].join("\n");
  }

  buildXometryPurchaseOrderPartNotes(partRow, purchaseOrder) {
    return [
      "Imported from Xometry purchase order part row.",
      "",
      `Item Number: ${partRow.item_number || "-"}`,
      `Item Code: ${partRow.item_code || "-"}`,
      `Part ID: ${partRow.part_id || "-"}`,
      `Order ID: ${partRow.order_id || "-"}`,
      `Description: ${partRow.description || "-"}`,
      `Process: ${partRow.process || purchaseOrder.summary?.process || "-"}`,
      `Preferred Subprocess: ${partRow.preferred_subprocess || purchaseOrder.summary?.preferred_subprocess || "-"}`,
      `Material: ${partRow.material || purchaseOrder.summary?.material || "-"}`,
      `Color: ${partRow.color || purchaseOrder.summary?.color || "-"}`,
      `Finish: ${partRow.finish || purchaseOrder.summary?.finish || "-"}`,
      `Threads / Tapped Holes: ${partRow.threads || purchaseOrder.summary?.threads || "-"}`,
      `Inserts: ${partRow.inserts || purchaseOrder.summary?.inserts || "-"}`,
      `Precision Tolerance: ${partRow.precision_tolerance || purchaseOrder.summary?.precision_tolerance || "-"}`,
      `Surface Roughness: ${partRow.surface_roughness || purchaseOrder.summary?.surface_roughness || "-"}`,
      `Inspection: ${partRow.inspection || purchaseOrder.summary?.inspection || "-"}`,
      `Certificates / Supplier Qualifications: ${partRow.certificates || purchaseOrder.summary?.certificates || "-"}`,
      `Requirements Notes: ${partRow.notes || purchaseOrder.summary?.notes || "-"}`
    ].join("\n");
  }

  deriveXometryPurchaseOrderPartNumber(partRow, index) {
    const candidate = String(partRow.part_id || "").trim() || String(partRow.description || "").trim();
    const base = safeFileName(candidate.toUpperCase().replace(/\s+/g, "-"), "");
    return base || `PART-${String(index + 1).padStart(3, "0")}`;
  }

  async importXometryTravelers(jobId, filePaths = null, mainWindow = null) {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error("Open an existing job before importing Xometry travelers.");
    }
    let selectedPaths = Array.isArray(filePaths) ? filePaths : null;
    if (!selectedPaths?.length) {
      const result = await dialog.showOpenDialog(mainWindow || null, {
        title: "Import Xometry Travelers",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "All files", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePaths.length) {
        return null;
      }
      selectedPaths = result.filePaths;
    }

    const uniqueFilePaths = [...new Map(
      selectedPaths.map((filePath) => {
        const resolved = path.resolve(filePath);
        return [resolved.toLowerCase(), resolved];
      })
    ).values()];
    if (!uniqueFilePaths.length) {
      return { parts: [], warnings: [], errors: [] };
    }

    const parserScript = path.join(this.app.getAppPath(), "scripts", "parse_xometry_travelers.py");
    const payload = await this.runPythonJson(parserScript, uniqueFilePaths);
    const parts = [];
    const warnings = [];
    const errors = [];
    let suggestedJobNumber = "";

    for (const traveler of payload.travelers || []) {
      const sourcePath = String(traveler.source_path || "").trim();
      const sourceLabel = traveler.source_filename || path.basename(sourcePath || "traveler.pdf");
      if (traveler.error) {
        errors.push({ sourcePath, message: traveler.error });
        continue;
      }
      if (!suggestedJobNumber && traveler.purchase_order) {
        suggestedJobNumber = String(traveler.purchase_order || "").trim();
      }
      if (!traveler.part_number) {
        errors.push({ sourcePath, message: `Missing Customer Part ID in ${sourceLabel}.` });
        continue;
      }

      const partId = randomId("part");
      const documents = [];
      try {
        documents.push(await this.copyPartDocument(jobId, partId, sourcePath, "Traveler", "Imported Xometry traveler"));
      } catch (error) {
        warnings.push({ sourcePath, message: `Imported part data but could not copy traveler PDF: ${error.message}` });
      }

      parts.push(this.normalizePart({
        id: partId,
        partNumber: traveler.part_number,
        partName: traveler.part_name || traveler.part_number,
        description: "",
        quantity: String(traveler.quantity || "").trim(),
        materialSpec: traveler.material || "",
        revision: {
          number: String(traveler.revision || "").trim(),
          date: traveler.last_revised_iso || todayIso(),
          notes: ""
        },
        notes: this.buildXometryTravelerNotes(traveler),
        documents,
        operations: []
      }));

      if (Array.isArray(traveler.warnings)) {
        for (const warning of traveler.warnings) {
          warnings.push({ sourcePath, message: warning });
        }
      }
      if (Number(traveler.part_total || 0) > 1) {
        warnings.push({
          sourcePath,
          message: `${sourceLabel} references Part ${traveler.part_index || "?"} of ${traveler.part_total}; only the parsed part was imported.`
        });
      }
    }

    if (parts.length) {
      await this.appendAudit("xometry_travelers_prepared", jobId, `Prepared ${parts.length} Xometry traveler import${parts.length === 1 ? "" : "s"} for job ${job.jobNumber || job.id}.`);
    }

    return { parts, warnings, errors, suggestedJobNumber, suggestedCustomerName: "Xometry" };
  }

  async importSubtractPurchaseOrders(filePaths = null, mainWindow = null) {
    let selectedPaths = Array.isArray(filePaths) ? filePaths : null;
    if (!selectedPaths?.length) {
      const result = await dialog.showOpenDialog(mainWindow || null, {
        title: "Import Subtract Purchase Orders",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "All files", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePaths.length) {
        return null;
      }
      selectedPaths = result.filePaths;
    }

    const uniqueFilePaths = [...new Map(
      selectedPaths.map((filePath) => {
        const resolved = path.resolve(filePath);
        return [resolved.toLowerCase(), resolved];
      })
    ).values()];
    if (!uniqueFilePaths.length) {
      return { jobs: [], warnings: [], errors: [] };
    }

    const parserScript = path.join(this.app.getAppPath(), "scripts", "parse_subtract_purchase_orders.py");
    const payload = await this.runPythonJson(parserScript, uniqueFilePaths);
    const existingJobs = await this.listJobSummaries();
    const usedJobNumbers = new Set(existingJobs.map((job) => normalizeText(job.jobNumber)));
    const warnings = [];
    const errors = [];
    const jobs = [];

    const subtractCustomer = await this.upsertNamedCustomer({
      name: "Subtract Manufacturing",
      shippingAddress1: "7301 S County Road 400W",
      city: "Muncie",
      state: "IN",
      postalCode: "47302",
      contactName: "Subtract Manufacturing",
      email: "contact@subtractmanufacturing.com",
      phone: "+1 (317) 224-4251",
      notes: "Auto-created from Subtract purchase order imports."
    });

    for (const purchaseOrder of payload.purchase_orders || []) {
      const sourcePath = String(purchaseOrder.source_path || "").trim();
      const sourceLabel = purchaseOrder.source_filename || path.basename(sourcePath || "purchase-order.pdf");
      if (purchaseOrder.error) {
        errors.push({ sourcePath, message: purchaseOrder.error });
        continue;
      }
      const jobNumber = String(purchaseOrder.purchase_order || "").trim();
      if (!jobNumber) {
        errors.push({ sourcePath, message: `Missing PO NUMBER in ${sourceLabel}.` });
        continue;
      }
      const normalizedJobNumber = normalizeText(jobNumber);
      if (usedJobNumbers.has(normalizedJobNumber)) {
        errors.push({ sourcePath, message: `Job number ${jobNumber} already exists.` });
        continue;
      }

      const jobId = randomId("job");
      const documents = [];
      try {
        documents.push(await this.copyJobDocument(jobId, sourcePath, "PO / Customer", "Imported Subtract purchase order"));
      } catch (error) {
        warnings.push({ sourcePath, message: `Imported job data but could not copy PO PDF: ${error.message}` });
      }

      const parts = (purchaseOrder.parts || []).map((partRow, index) => this.normalizePart({
        id: randomId("part"),
        partNumber: this.deriveSubtractPartNumber(partRow.part_name, index),
        partName: partRow.part_name || `Part ${index + 1}`,
        description: "",
        quantity: String(partRow.quantity || "").trim(),
        materialSpec: partRow.material || "",
        revision: {
          number: "",
          date: "",
          notes: ""
        },
        notes: this.buildSubtractPartNotes(partRow, purchaseOrder),
        documents: [],
        operations: []
      }));

      const savedJob = await this.saveJob({
        id: jobId,
        jobNumber,
        customerId: subtractCustomer.id,
        customer: subtractCustomer.name,
        status: "Open",
        priority: "Normal",
        dueDate: purchaseOrder.ship_date_iso || "",
        notes: this.buildSubtractPurchaseOrderNotes(purchaseOrder),
        documents,
        parts
      });
      usedJobNumbers.add(normalizedJobNumber);
      jobs.push(await this.buildJobSummaryFromHeader(savedJob));

      for (const warning of purchaseOrder.warnings || []) {
        warnings.push({ sourcePath, message: warning });
      }
    }

    if (jobs.length) {
      await this.appendAudit("subtract_purchase_orders_imported", jobs[0].id, `Imported ${jobs.length} Subtract purchase order job${jobs.length === 1 ? "" : "s"}.`);
    }

    return { jobs, warnings, errors };
  }

  async importXometryPurchaseOrders(filePaths = null, mainWindow = null) {
    let selectedPaths = Array.isArray(filePaths) ? filePaths : null;
    if (!selectedPaths?.length) {
      const result = await dialog.showOpenDialog(mainWindow || null, {
        title: "Import Xometry Purchase Orders",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "PDF", extensions: ["pdf"] },
          { name: "All files", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePaths.length) {
        return null;
      }
      selectedPaths = result.filePaths;
    }

    const uniqueFilePaths = [...new Map(
      selectedPaths.map((filePath) => {
        const resolved = path.resolve(filePath);
        return [resolved.toLowerCase(), resolved];
      })
    ).values()];
    if (!uniqueFilePaths.length) {
      return { jobs: [], warnings: [], errors: [] };
    }

    const parserScript = path.join(this.app.getAppPath(), "scripts", "parse_xometry_purchase_orders.py");
    const payload = await this.runPythonJson(parserScript, uniqueFilePaths);
    const existingJobs = await this.listJobSummaries();
    const usedJobNumbers = new Set(existingJobs.map((job) => normalizeText(job.jobNumber)));
    const warnings = [];
    const errors = [];
    const jobs = [];

    const xometryCustomer = await this.upsertNamedCustomer({
      name: "Xometry",
      shippingAddress1: "7951 Cessna Avenue",
      city: "Gaithersburg",
      state: "MD",
      postalCode: "20879",
      contactName: "Xometry",
      phone: "240-252-1138",
      notes: "Auto-created from Xometry purchase order imports."
    });

    for (const purchaseOrder of payload.purchase_orders || []) {
      const sourcePath = String(purchaseOrder.source_path || "").trim();
      const sourceLabel = purchaseOrder.source_filename || path.basename(sourcePath || "purchase-order.pdf");
      if (purchaseOrder.error) {
        errors.push({ sourcePath, message: purchaseOrder.error });
        continue;
      }
      const jobNumber = String(purchaseOrder.purchase_order || "").trim();
      if (!jobNumber) {
        errors.push({ sourcePath, message: `Missing P.O. No. in ${sourceLabel}.` });
        continue;
      }
      const normalizedJobNumber = normalizeText(jobNumber);
      if (usedJobNumbers.has(normalizedJobNumber)) {
        errors.push({ sourcePath, message: `Job number ${jobNumber} already exists.` });
        continue;
      }

      const jobId = randomId("job");
      const documents = [];
      try {
        documents.push(await this.copyJobDocument(jobId, sourcePath, "PO / Customer", "Imported Xometry purchase order"));
      } catch (error) {
        warnings.push({ sourcePath, message: `Imported job data but could not copy PO PDF: ${error.message}` });
      }

      const parts = (purchaseOrder.parts || []).map((partRow, index) => this.normalizePart({
        id: randomId("part"),
        partNumber: this.deriveXometryPurchaseOrderPartNumber(partRow, index),
        partName: partRow.description || partRow.part_id || `Part ${index + 1}`,
        description: "",
        quantity: String(partRow.quantity || "").trim(),
        materialSpec: partRow.material || purchaseOrder.summary?.material || "",
        revision: {
          number: "",
          date: "",
          notes: ""
        },
        notes: this.buildXometryPurchaseOrderPartNotes(partRow, purchaseOrder),
        documents: [],
        operations: []
      }));

      const savedJob = await this.saveJob({
        id: jobId,
        jobNumber,
        customerId: xometryCustomer.id,
        customer: xometryCustomer.name,
        status: "Open",
        priority: purchaseOrder.expedited ? "High" : "Normal",
        dueDate: purchaseOrder.ship_date_iso || "",
        notes: this.buildXometryPurchaseOrderNotes(purchaseOrder),
        documents,
        parts
      });
      usedJobNumbers.add(normalizedJobNumber);
      jobs.push(await this.buildJobSummaryFromHeader(savedJob));

      for (const warning of purchaseOrder.warnings || []) {
        warnings.push({ sourcePath, message: warning });
      }
    }

    if (jobs.length) {
      await this.appendAudit("xometry_purchase_orders_imported", jobs[0].id, `Imported ${jobs.length} Xometry purchase order job${jobs.length === 1 ? "" : "s"}.`);
    }

    return { jobs, warnings, errors };
  }

  async createJobFromFusionImport(mainWindow) {
    const imported = await this.importFusionSetupSheets(mainWindow);
    if (!imported?.sheets?.length) {
      return null;
    }
    const first = imported.sheets[0];
    const job = {
      id: randomId("job"),
      jobNumber: first.header.program || "",
      customer: "",
      status: "Open",
      priority: "Normal",
      dueDate: "",
      notes: "",
      revision: {
        number: "A",
        date: todayIso(),
        author: "",
        notes: ""
      },
      parts: [
        {
          id: randomId("part"),
          partNumber: "",
          partName: first.header.documentPath || first.header.jobDescription || "Imported Part",
          description: first.header.title || "",
          quantity: "",
          materialSpec: "",
          revision: {
            number: "A",
            date: todayIso(),
            notes: ""
          },
          notes: "",
          operations: imported.sheets.map((sheet, index) => ({
            ...sheet.operation,
            id: sheet.operation.id || randomId("operation"),
            sequence: index + 1,
            folderName: `${String(index + 1).padStart(3, "0")}-${slugify(sheet.operation.title || "operation")}`,
            setupTemplateRefs: toDisplayList(sheet.operation.setupTemplateRefs || ["milling"]),
            tools: (sheet.operation.tools || []).map((tool) => this.normalizeTool(tool)),
            jobToolRefs: [],
            requiredMaterialLots: [],
            requiredInstruments: [],
            customMaterialText: "",
            inspectionPlan: sheet.operation.inspectionPlan || {
              feature: "",
              method: "",
              sampleSize: "",
              frequency: "",
              resultPlaceholderRefs: []
            },
            stepImages: sheet.operation.stepImages || []
          }))
        }
      ],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    return job;
  }

  async importLegacySetupSheetData(mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Legacy Setup Sheet Data Folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const sourceRoot = path.resolve(result.filePaths[0]);
    const jobsDir = path.join(sourceRoot, "jobs");
    const templatesDir = path.join(sourceRoot, "templates");
    const librariesDir = path.join(sourceRoot, "libraries");
    let importedJobs = 0;
    let importedTemplates = 0;
    let importedLibraries = 0;

    if (await pathExists(librariesDir)) {
      const entries = await fs.readdir(librariesDir);
      for (const entry of entries.filter((item) => item.endsWith(".json"))) {
        const library = await readJson(path.join(librariesDir, entry), null);
        if (library?.name) {
          await this.saveLibrary(library);
          importedLibraries += 1;
        }
      }
    }

    if (await pathExists(templatesDir)) {
      const entries = await fs.readdir(templatesDir);
      for (const entry of entries.filter((item) => item.endsWith(".json"))) {
        const template = await readJson(path.join(templatesDir, entry), null);
        if (template?.id) {
          await this.saveTemplate(template);
          importedTemplates += 1;
        }
      }
    }

    if (await pathExists(jobsDir)) {
      const entries = await fs.readdir(jobsDir);
      for (const entry of entries.filter((item) => item.endsWith(".json"))) {
        const legacyJob = await readJson(path.join(jobsDir, entry), null);
        if (!legacyJob?.id) {
          continue;
        }
        const part = {
          id: randomId("part"),
          partNumber: legacyJob.partNumber || "",
          partName: legacyJob.partName || legacyJob.jobName || "Imported Part",
          description: legacyJob.jobName || "",
          quantity: legacyJob.quantity || "",
          materialSpec: legacyJob.material || "",
          revision: legacyJob.revision || { number: "A", date: todayIso(), notes: "" },
          notes: "",
          operations: (Array.isArray(legacyJob.operations) ? legacyJob.operations : []).map((operation, index) => ({
            id: operation.id || randomId("operation"),
            sequence: index + 1,
            folderName: `${String(index + 1).padStart(3, "0")}-${slugify(operation.title || operation.type || "operation")}`,
            operationCode: operation.operationCode || `OP${String(index + 1).padStart(3, "0")}`,
            title: operation.title || operation.type || "Operation",
            type: operation.type || "General",
            workCenter: operation.machineId || "",
            status: "Ready",
            setupInstructions: "",
            workInstructions: [operation.notes, ...(operation.steps || []).map((step) => step.instruction || "")].filter(Boolean).join("\n\n"),
            notes: "",
            parameters: Array.isArray(operation.parameters) ? operation.parameters : [],
            stepImages: Array.isArray(operation.steps)
              ? operation.steps.flatMap((step) => Array.isArray(step.images) ? step.images : [])
              : [],
            setupTemplateRefs: toDisplayList([operation.templateId].filter(Boolean)),
            jobToolRefs: toDisplayList(operation.toolIds),
            requiredMaterialLots: [],
            requiredInstruments: [],
            inspectionPlan: {
              feature: "",
              method: "",
              sampleSize: "",
              frequency: "",
              resultPlaceholderRefs: []
            }
          }))
        };
        await this.saveJob({
          id: legacyJob.id,
          jobNumber: legacyJob.jobNumber || "",
          customer: legacyJob.customer || "",
          status: "Open",
          priority: "Normal",
          dueDate: "",
          notes: legacyJob.jobName || "",
          revision: {
            number: legacyJob.revision?.number || legacyJob.revision || "A",
            date: legacyJob.revision?.date || todayIso(),
            author: legacyJob.revision?.author || "",
            notes: legacyJob.revision?.notes || ""
          },
          tools: Array.isArray(legacyJob.tools) ? legacyJob.tools : [],
          parts: [part],
          createdAt: legacyJob.createdAt || nowIso()
        });
        importedJobs += 1;
      }
    }
    await this.appendAudit("legacy_setup_import", sourceRoot, `Imported legacy setup data from ${sourceRoot}.`);
    return { sourceRoot, importedJobs, importedTemplates, importedLibraries };
  }

  async importLegacyMetrologyData(mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Legacy Metrology Data Folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const sourceRoot = path.resolve(result.filePaths[0]);
    const standardsPath = (await pathExists(path.join(sourceRoot, "data", "standards", "standards.json")))
      ? path.join(sourceRoot, "data", "standards", "standards.json")
      : path.join(sourceRoot, "standards", "standards.json");
    const instrumentsRoot = (await pathExists(path.join(sourceRoot, "data", "instruments")))
      ? path.join(sourceRoot, "data", "instruments")
      : path.join(sourceRoot, "instruments");

    let importedStandards = 0;
    let importedInstruments = 0;
    if (await pathExists(standardsPath)) {
      const standards = await readJson(standardsPath, []);
      for (const standard of standards) {
        await this.saveStandard(standard);
        importedStandards += 1;
      }
    }

    if (await pathExists(instrumentsRoot)) {
      const entries = await fs.readdir(instrumentsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const instrumentRoot = path.join(instrumentsRoot, entry.name);
        const instrument = await readJson(path.join(instrumentRoot, "instrument.json"), null);
        if (!instrument?.instrument_id) {
          continue;
        }
        const calibrationDir = path.join(instrumentRoot, "calibrations");
        const calibrations = [];
        if (await pathExists(calibrationDir)) {
          const calibrationEntries = await fs.readdir(calibrationDir);
          for (const calibrationFile of calibrationEntries.filter((name) => name.endsWith(".json"))) {
            const calibration = await readJson(path.join(calibrationDir, calibrationFile), null);
            if (calibration?.calibration_id) {
              calibrations.push(calibration);
            }
          }
        }
        await this.saveInstrument({ instrument, calibrations });
        importedInstruments += 1;
      }
    }
    await this.appendAudit("legacy_metrology_import", sourceRoot, `Imported legacy metrology data from ${sourceRoot}.`);
    return { sourceRoot, importedStandards, importedInstruments };
  }

  async runPythonJson(scriptPath, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonPath, [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `Python exited with status ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Unable to parse Python output: ${error.message}`));
        }
      });
    });
  }

  async runPowerShell(script) {
    return new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with status ${code}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async importLegacyMaterialsData(mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Choose Legacy Materials Data Folder",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const sourceRoot = path.resolve(result.filePaths[0]);
    const dbPath = path.join(sourceRoot, "database", "materials.db");
    if (!(await pathExists(dbPath))) {
      throw new Error("The selected folder does not contain database/materials.db.");
    }
    const exportScript = path.join(this.app.getAppPath(), "scripts", "import_materials_sqlite.py");
    const payload = await this.runPythonJson(exportScript, [dbPath]);
    let importedMaterials = 0;
    for (const row of payload.materials || []) {
      const material = row.material;
      const next = {
        id: `material-${safeFileName(material.serial_code || material.id)}`,
        serialCode: material.serial_code,
        materialType: material.material_type || "",
        form: material.form || "",
        supplier: material.supplier || "",
        dateReceived: material.date_received || "",
        purchaseOrder: material.purchase_order || "",
        heatNumber: material.heat_number || "",
        lotNumber: material.lot_number || "",
        materialSpec: material.material_spec || "",
        dimensions: material.dimensions || "",
        traceabilityLevel: material.traceability_level || "",
        originalStockIdentifier: material.original_stock_identifier || "",
        customerName: material.customer_name || "",
        storageLocation: material.storage_location || "",
        status: material.status || "active",
        notes: material.notes || "",
        attachments: [],
        jobs: (row.jobs || []).map((job) => ({
          id: `jobuse-${job.id}`,
          jobNumber: job.job_number || "",
          customerName: job.customer_name || "",
          partNumber: job.part_number || "",
          dateUsed: job.date_used || "",
          notes: job.notes || ""
        })),
        changeLog: (row.change_log || []).map((entry) => ({
          id: `change-${entry.id}`,
          changeType: entry.change_type || "",
          message: entry.message || "",
          createdAt: entry.created_at || nowIso()
        })),
        createdAt: material.created_at || nowIso(),
        updatedAt: material.updated_at || nowIso()
      };
      for (const attachment of row.attachments || []) {
        const attachmentSource = attachment.original_path && await pathExists(attachment.original_path)
          ? attachment.original_path
          : path.join(sourceRoot, attachment.stored_path || "");
        if (attachmentSource && await pathExists(attachmentSource)) {
          const copied = await this.copyMaterialAttachment(next.id, attachmentSource);
          copied.attachmentCategory = attachment.attachment_category || "Other";
          copied.description = attachment.description || "";
          copied.attachedAt = attachment.attached_at || nowIso();
          next.attachments.push(copied);
        }
      }
      await this.saveMaterial(next);
      importedMaterials += 1;
    }
    await this.appendAudit("legacy_materials_import", sourceRoot, `Imported legacy materials data from ${sourceRoot}.`);
    return { sourceRoot, importedMaterials };
  }

  async importFusionSetupSheets(mainWindow) {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: "Import Fusion 360 Setup Sheets",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Fusion setup sheets", extensions: ["html", "htm", "csv", "txt"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    const uniqueFilePaths = [...new Map(
      result.filePaths.map((filePath) => {
        const resolved = path.resolve(filePath);
        return [resolved.toLowerCase(), resolved];
      })
    ).values()];
    const sheets = [];
    let jobTools = [];
    for (const filePath of uniqueFilePaths) {
      const raw = await fs.readFile(filePath, "utf8");
      const sheet = buildSetupSheetImport(filePath, raw);
      const merged = mergeJobTools(jobTools, sheet.tools);
      jobTools = merged.tools;
      sheet.operation.jobToolRefs = (sheet.operation.jobToolRefs || []).map((id) => merged.idMap.get(id) || id);
      sheets.push({
        source: sheet.source,
        header: sheet.header,
        operation: sheet.operation
      });
    }
    return { sheets: dedupeImportedSheets(sheets), tools: jobTools };
  }

  async exportJobPdf(jobId, destinationPath) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error("Job not found.");
    }
    let outputPath = destinationPath;
    if (!outputPath) {
      outputPath = await uniquePdfPath(
        path.join(this.getJobRoot(dataRoot, jobId), "print"),
        `${safeFileName(job.jobNumber || job.id)}-traveler-${pdfTimestamp()}`
      );
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1500,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    if (this.devServerUrl) {
      await printWindow.loadURL(`${this.devServerUrl}#/print/${encodeURIComponent(jobId)}`);
    } else {
      await printWindow.loadFile(path.join(this.app.getAppPath(), "dist", "index.html"), {
        hash: `/print/${encodeURIComponent(jobId)}`
      });
    }
    await this.waitForPrintSelector(printWindow, ".traveler-header");
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "Letter",
      printBackground: true,
      margins: {
        marginType: "custom",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported PDF: ${openError}`);
    }
    return outputPath;
  }

  async exportPartInspectionPdf(jobId, partId, destinationPath, reportId = "", options = {}) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    let outputPath = destinationPath;
    if (!outputPath) {
      outputPath = await uniquePdfPath(
        path.join(this.getPartRoot(dataRoot, jobId, partId), "inspection", "reports"),
        `${safeFileName(job.jobNumber || job.id)}-${safeFileName(part.partNumber || part.partName || part.id)}-inspection-${pdfTimestamp()}`
      );
    }
    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1500,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    const params = new URLSearchParams();
    if (reportId) {
      params.set("reportId", reportId);
    }
    for (const [key, fallback] of Object.entries(DEFAULT_INSPECTION_REPORT_EXPORT_OPTIONS)) {
      const enabled = Object.prototype.hasOwnProperty.call(options || {}, key) ? Boolean(options[key]) : fallback;
      if (!enabled) {
        params.set(key, "0");
      }
    }
    const query = params.toString();
    const inspectionRoute = `/print/inspection/${encodeURIComponent(jobId)}/${encodeURIComponent(partId)}${query ? `?${query}` : ""}`;
    if (this.devServerUrl) {
      await printWindow.loadURL(`${this.devServerUrl}#${inspectionRoute}`);
    } else {
      await printWindow.loadFile(path.join(this.app.getAppPath(), "dist", "index.html"), {
        hash: inspectionRoute
      });
    }
    await this.waitForPrintSelector(printWindow, ".inspection-print-ready");
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "Letter",
      printBackground: true,
      margins: { marginType: "default" }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported PDF: ${openError}`);
    }
    return outputPath;
  }

  async exportNonconformancePdf(ncrId, destinationPath) {
    const dataRoot = await this.requireDataFolder();
    const record = await this.loadNonconformance(ncrId);
    if (!record) {
      throw new Error("Nonconformance record not found.");
    }
    let outputPath = destinationPath;
    if (!outputPath) {
      outputPath = await uniquePdfPath(
        path.join(this.getNonconformanceRoot(dataRoot, ncrId), "print"),
        `${safeFileName(record.ncrNumber || record.id)}-nonconformance-${pdfTimestamp()}`
      );
    }
    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1500,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    if (this.devServerUrl) {
      await printWindow.loadURL(`${this.devServerUrl}#/print/nonconformance/${encodeURIComponent(ncrId)}`);
    } else {
      await printWindow.loadFile(path.join(this.app.getAppPath(), "dist", "index.html"), {
        hash: `/print/nonconformance/${encodeURIComponent(ncrId)}`
      });
    }
    await this.waitForPrintSelector(printWindow, ".nonconformance-print-ready");
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "Letter",
      printBackground: true,
      margins: { marginType: "default" }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open exported PDF: ${openError}`);
    }
    return outputPath;
  }

  async generatePartBalloonedDrawingPdf(jobId, partId, drawingDocumentId) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    const part = job?.parts?.find((item) => item.id === partId);
    if (!part) {
      throw new Error("Part not found.");
    }
    const document = (part.documents || []).find((item) => item.id === drawingDocumentId);
    if (!document) {
      throw new Error("Drawing document not found.");
    }
    const sourcePath = this.getStoredDocumentPath(dataRoot, document);
    if (!sourcePath || !(await pathExists(sourcePath))) {
      throw new Error("Source drawing PDF could not be found.");
    }
    const outputFilename = `${safeFileName(part.partNumber || part.partName || part.id)}-ballooned-${safeFileName(document.originalFilename || document.storedFilename || "drawing.pdf").replace(/\.pdf$/i, "")}-${pdfTimestamp()}.pdf`;
    const outputPath = path.join(this.getPartDocumentsRoot(dataRoot, jobId, partId), outputFilename);
    const sourceBytes = await fs.readFile(sourcePath);
    const pdfDoc = await PDFDocument.load(sourceBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const inspection = this.normalizeInspection(part.inspection);
    const balloons = inspection.balloons.filter((item) => item.sourceDrawingDocumentId === drawingDocumentId);
    const pages = pdfDoc.getPages();
    for (const balloon of balloons) {
      const pageIndex = Math.max(0, Math.min(pages.length - 1, Number(balloon.pageNumber || 1) - 1));
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const centerX = Number(balloon.x || 0.5) * width;
      const centerY = (1 - Number(balloon.y || 0.5)) * height;
      const label = String(balloon.labelText || "?").trim() || "?";
      const radius = Math.max(14, Math.min(width, height) * 0.018);
      const borderColor = balloon.placementSource === "manual" ? rgb(0.96, 0.62, 0.04) : rgb(0.15, 0.39, 0.92);
      page.drawCircle({
        x: centerX,
        y: centerY,
        size: radius,
        borderColor,
        borderWidth: 3,
        color: rgb(1, 1, 1),
        opacity: 1
      });
      const fontSize = Math.max(10, radius * 0.9);
      const textWidth = font.widthOfTextAtSize(label, fontSize);
      page.drawText(label, {
        x: centerX - (textWidth / 2),
        y: centerY - (fontSize * 0.33),
        size: fontSize,
        font,
        color: rgb(0.07, 0.09, 0.13)
      });
    }
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);
    const attachment = this.normalizeDocument({
      originalFilename: outputFilename,
      storedFilename: outputFilename,
      storedPath: path.relative(dataRoot, outputPath),
      originalPath: "",
      fileType: "PDF",
      category: "Drawing",
      description: `Ballooned drawing generated from ${document.originalFilename || document.storedFilename}`,
      displayName: outputFilename
    }, "Drawing");
    part.documents = [...(part.documents || []), attachment];
    const updatedInspection = this.normalizeInspection(part.inspection);
    updatedInspection.extractionRuns = [
      ...(updatedInspection.extractionRuns || []),
      {
        id: randomId("inspection-extraction"),
        sourceDrawingDocumentId: drawingDocumentId,
        sourceFilename: document.originalFilename || document.storedFilename,
        extractedAt: nowIso(),
        acceptedCount: 0,
        queuedCount: 0,
        rejectedCount: 0,
        balloonedCount: updatedInspection.balloons.filter((item) => item.sourceDrawingDocumentId === drawingDocumentId).length,
        warnings: [`Generated ballooned drawing attachment: ${outputFilename}`],
        errors: []
      }
    ];
    part.inspection = updatedInspection;
    const saved = await this.saveJob(job);
    const openError = await shell.openPath(outputPath);
    if (openError) {
      console.warn(`Unable to open ballooned PDF: ${openError}`);
    }
    return { job: saved, document: attachment, outputPath };
  }
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&deg;/gi, "deg")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanCell(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvRows(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }
  return rows;
}

function extractHtmlRows(raw) {
  const rows = [];
  const rowMatches = raw.matchAll(/<tr\b[\s\S]*?<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = rowMatch[0].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const cellMatch of cellMatches) {
      cells.push(cleanCell(cellMatch[2]));
    }
    if (cells.some(Boolean)) {
      rows.push(cells);
    }
  }
  return rows;
}

function rowsFromSetupSheet(filePath, raw) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") {
    return parseCsvRows(raw);
  }
  const htmlRows = extractHtmlRows(raw);
  if (htmlRows.length) {
    return htmlRows;
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.split(/\t| {2,}/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length);
}

function headerScore(headers) {
  const joined = headers.join(" ");
  let score = 0;
  if (headers.some((header) => header === "tool" || header === "toolno" || header === "toolnumber" || header === "t")) {
    score += 2;
  }
  if (joined.includes("description") || joined.includes("comment") || joined.includes("type")) {
    score += 1;
  }
  if (joined.includes("diameter") || joined.includes("length") || joined.includes("stickout") || joined.includes("flute")) {
    score += 1;
  }
  return score;
}

function objectsFromRows(rows) {
  const objects = [];
  let headers = null;
  for (const row of rows) {
    const normalized = row.map(normalizeHeader);
    if (headerScore(normalized) >= 2) {
      headers = normalized;
      continue;
    }
    if (headers && row.length >= 2) {
      const object = {};
      headers.forEach((header, index) => {
        if (header && row[index]) {
          object[header] = row[index];
        }
      });
      objects.push(object);
    }
  }
  return objects;
}

function readField(object, exactHeaders, containsHeaders = []) {
  for (const header of exactHeaders) {
    if (object[header]) {
      return object[header];
    }
  }
  const entry = Object.entries(object).find(([key, value]) => value && containsHeaders.some((fragment) => key.includes(fragment)));
  return entry?.[1] || "";
}

function toolRecordFromObject(object, sourceFile) {
  const toolValue = readField(object, ["tool", "toolno", "toolnumber", "t", "number"], ["tool"]);
  const toolNumber = String(toolValue || "").match(/(?:^|\b)T?\s*(\d+)(?:\b|$)/i)?.[1] || "";
  const description = readField(object, ["description", "tooldescription", "comment", "comments", "name"], ["description", "comment"]);
  const type = readField(object, ["type", "tooltype"], ["type"]);
  const diameter = readField(object, ["diameter", "tooldiameter", "dia"], ["diameter"]);
  const length = readField(object, ["stickout", "toolstickout", "length", "toollength", "overalllength", "flutelength", "shoulderlength"], ["stickout", "length", "flute"]);
  const holder = readField(object, ["holder", "holderdescription", "holdername", "holdertype", "holderproduct", "holderid", "toolholder"], ["holder"]);
  const vendor = readField(object, ["vendor", "manufacturer"], ["vendor", "manufacturer"]);
  const product = readField(object, ["product", "productid", "partnumber"], ["product", "part"]);
  const baseName = description || type || toolValue;
  if (!baseName && !toolNumber) {
    return null;
  }
  const detailLines = [
    vendor ? `Vendor: ${vendor}` : "",
    product ? `Product: ${product}` : ""
  ].filter(Boolean);
  return {
    id: crypto.randomUUID(),
    name: `${toolNumber ? `T${toolNumber} - ` : ""}${baseName || "Fusion Tool"}`,
    description: [type, diameter ? `Dia ${diameter}` : ""].filter(Boolean).join(" | "),
    diameter,
    length,
    holder,
    source: "Fusion 360",
    fusionToolNumber: toolNumber,
    details: detailLines.join("\n"),
    importedFrom: sourceFile
  };
}

function dedupeImportedTools(tools) {
  const byKey = new Map();
  for (const tool of tools) {
    const key = tool.fusionToolNumber ? `t:${tool.fusionToolNumber}` : `n:${tool.name.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, tool);
    }
  }
  return [...byKey.values()];
}

function parseFusionTools(filePath, raw) {
  const fusionHtmlTools = parseFusionHtmlTools(filePath, raw);
  if (fusionHtmlTools.length) {
    return fusionHtmlTools;
  }
  const rows = rowsFromSetupSheet(filePath, raw);
  const objects = objectsFromRows(rows);
  return dedupeImportedTools(
    objects
      .map((object) => toolRecordFromObject(object, path.basename(filePath)))
      .filter(Boolean)
  );
}

function parseFusionHtmlTools(filePath, raw) {
  const tools = [];
  const toolRows = raw.matchAll(/<tr\b[^>]*class=["']?info["']?[^>]*>([\s\S]*?)(?=<tr\b[^>]*class=["']?space["']?)/gi);
  for (const rowMatch of toolRows) {
    const rowHtml = rowMatch[1];
    const toolNumber = rowHtml.match(/<table\b[^>]*class=["']?info["']?[^>]*>\s*<tr><td><b>\s*T\s*(\d+)\s*<\/b>/i)?.[1];
    if (!toolNumber) {
      continue;
    }
    const fields = { tool: `T${toolNumber}` };
    const pairMatches = rowHtml.matchAll(/<div\b[^>]*class=["']?description["']?[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/gi);
    for (const pairMatch of pairMatches) {
      const key = normalizeHeader(cleanCell(pairMatch[1]).replace(/:$/, ""));
      const value = cleanCell(pairMatch[2]);
      if (key && value) {
        fields[key] = value;
      }
    }
    const tool = toolRecordFromObject(fields, path.basename(filePath));
    if (tool) {
      tools.push(tool);
    }
  }
  return dedupeImportedTools(tools);
}

function extractFusionHeader(raw) {
  const title = cleanCell(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const program = title.match(/Program\s+([^\s<]+)/i)?.[1] || "";
  const jobDescription = cleanCell(raw.match(/Job Description:\s*<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const documentPath = cleanCell(raw.match(/Document Path:\s*<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  return { program, jobDescription, documentPath, title };
}

function parseCycleTimeSeconds(value) {
  const text = String(value || "").replace(/\([^)]*\)/g, "").trim();
  let seconds = 0;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/i);
  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*s/i);
  const colon = text.match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/) || text.match(/(\d+):(\d+(?:\.\d+)?)/);
  if (hours) seconds += Number(hours[1]) * 3600;
  if (minutes) seconds += Number(minutes[1]) * 60;
  if (secondMatch) seconds += Number(secondMatch[1]);
  if (!seconds && colon) {
    if (colon.length === 4) {
      seconds += Number(colon[1] || 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
    } else {
      seconds += Number(colon[1]) * 60 + Number(colon[2]);
    }
  }
  return seconds;
}

function formatCycleTime(seconds) {
  if (!seconds) {
    return "";
  }
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;
  if (hours) {
    return `${hours}h ${minutes}m ${remaining}s`;
  }
  if (minutes) {
    return `${minutes}m ${remaining}s`;
  }
  return `${remaining}s`;
}

function parseFusionOperationSummaries(raw) {
  const operations = [];
  const rowMatches = raw.matchAll(/<tr\b[^>]*class=["']?info["']?[^>]*>([\s\S]*?)(?=<tr\b[^>]*class=["']?space["']?)/gi);
  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    if (!/<div\b[^>]*class=["']?value["']?[^>]*>\s*Operation\s+\d+\/\d+/i.test(rowHtml)) {
      continue;
    }
    const fields = {};
    const pairMatches = rowHtml.matchAll(/<div\b[^>]*class=["']?description["']?[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/gi);
    for (const pairMatch of pairMatches) {
      const key = cleanCell(pairMatch[1]).replace(/:$/, "");
      fields[key] = cleanCell(pairMatch[2]);
    }
    const toolNumber = rowHtml.match(/<b>\s*T\s*(\d+)\s*<\/b>/i)?.[1] || "";
    operations.push({
      operationLabel: cleanCell(rowHtml.match(/<div\b[^>]*class=["']?value["']?[^>]*>\s*(Operation\s+\d+\/\d+)\s*<\/div>/i)?.[1] || rowHtml.match(/Operation\s+\d+\/\d+/i)?.[0] || ""),
      description: fields.Description || "",
      strategy: fields.Strategy || "",
      wcs: fields.WCS || "",
      coolant: fields.Coolant || "",
      maxSpindleSpeed: fields["Maximum Spindle Speed"] || "",
      maxFeedrate: fields["Maximum Feedrate"] || "",
      cycleTime: fields["Estimated Cycle Time"] || "",
      toolNumber
    });
  }
  return operations;
}

function buildFusionSummaryTool(summary, sourceFile) {
  const toolNumber = String(summary?.toolNumber || "").trim();
  const baseName = summary?.description || summary?.operationLabel || "";
  if (!toolNumber && !baseName) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    name: `${toolNumber ? `T${toolNumber} - ` : ""}${baseName || "Fusion Tool"}`,
    description: summary?.strategy || "",
    diameter: "",
    length: "",
    holder: "",
    source: "Fusion 360",
    fusionToolNumber: toolNumber,
    details: "",
    importedFrom: sourceFile
  };
}

function buildSetupSheetImport(filePath, raw) {
  const header = extractFusionHeader(raw);
  const operationSummaries = parseFusionOperationSummaries(raw);
  const source = path.basename(filePath);
  const parsedTools = parseFusionTools(filePath, raw);
  const tools = parsedTools.length
    ? parsedTools
    : dedupeImportedTools(operationSummaries.map((item) => buildFusionSummaryTool(item, source)).filter(Boolean));
  const cycleTime = formatCycleTime(operationSummaries.reduce((sum, item) => sum + parseCycleTimeSeconds(item.cycleTime), 0));
  const toolIds = tools.map((tool) => tool.id);
  return {
    source,
    header,
    tools,
    operation: {
      id: crypto.randomUUID(),
      operationCode: "OP001",
      title: header.jobDescription || header.documentPath || source,
      type: "Milling",
      workCenter: "",
      status: "Ready",
      setupInstructions: "",
      workInstructions: "",
      parameters: [
        header.program ? { id: crypto.randomUUID(), label: "Program", value: header.program } : null,
        cycleTime ? { id: crypto.randomUUID(), label: "Cycle Time", value: cycleTime } : null
      ].filter(Boolean),
      stepImages: [],
      tools: tools.map((tool) => ({
        id: crypto.randomUUID(),
        name: tool.name,
        diameter: tool.diameter,
        length: tool.length,
        holder: tool.holder,
        details: tool.details,
        fusionToolNumber: tool.fusionToolNumber,
        source: tool.source,
        importedFrom: tool.importedFrom || source
      })),
      setupTemplateRefs: ["milling"],
      jobToolRefs: toolIds,
      requiredMaterialLots: [],
      requiredInstruments: [],
      inspectionPlan: {
        feature: "",
        method: "",
        sampleSize: "",
        frequency: "",
        resultPlaceholderRefs: []
      }
    }
  };
}

function mergeJobTools(existingTools, importedTools) {
  const tools = [...existingTools];
  const idMap = new Map();
  for (const imported of importedTools) {
    const existing = tools.find((tool) => (imported.fusionToolNumber && tool.fusionToolNumber === imported.fusionToolNumber) || normalizeText(tool.name) === normalizeText(imported.name));
    if (existing) {
      Object.assign(existing, { ...imported, id: existing.id });
      idMap.set(imported.id, existing.id);
    } else {
      tools.push(imported);
      idMap.set(imported.id, imported.id);
    }
  }
  return { tools, idMap };
}

function importedSheetFingerprint(sheet) {
  const toolSignature = (sheet?.operation?.tools || [])
    .map((tool) => [normalizeText(tool.fusionToolNumber), normalizeText(tool.name)].join(":"))
    .sort()
    .join("|");
  return [
    normalizeText(sheet?.header?.program),
    normalizeText(sheet?.header?.documentPath),
    normalizeText(sheet?.header?.jobDescription),
    normalizeText(sheet?.source),
    normalizeText(sheet?.operation?.title),
    normalizeText(sheet?.operation?.workInstructions),
    toolSignature
  ].join("||");
}

function dedupeImportedSheets(sheets) {
  const seen = new Set();
  const deduped = [];
  for (const sheet of sheets) {
    const key = importedSheetFingerprint(sheet);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(sheet);
  }
  return deduped;
}

function normalizeShapeDimensions(shapeDimensions) {
  const entries = Object.entries(shapeDimensions || {})
    .map(([key, value]) => [key, String(value || "").trim()])
    .filter(([, value]) => value);
  return Object.fromEntries(entries);
}

function materialDimensionsSummary(form, shapeDimensions, fallback = "") {
  const dimensions = normalizeShapeDimensions(shapeDimensions);
  const join = (...values) => values.filter(Boolean).join(" x ");
  const prefixed = (label, value) => value ? `${label} ${value}` : "";
  switch (form) {
    case "Round bar":
      return prefixed("Dia", dimensions.diameter) || fallback;
    case "Round Tube":
      return join(prefixed("OD", dimensions.outerDiameter), prefixed("Wall", dimensions.wallThickness)) || fallback;
    case "Sheet":
      return prefixed("Thickness", dimensions.thickness) || fallback;
    case "Rectangle bar":
      return join(prefixed("Width", dimensions.width), prefixed("Thickness", dimensions.thickness)) || fallback;
    case "Rectangle Tube":
      return join(prefixed("Width", dimensions.width), prefixed("Height", dimensions.height), prefixed("Wall", dimensions.wallThickness)) || fallback;
    case "Angle":
      return join(prefixed("Leg A", dimensions.legA), prefixed("Leg B", dimensions.legB), prefixed("Thickness", dimensions.thickness)) || fallback;
    case "Other":
      return dimensions.custom || fallback;
    default:
      return fallback;
  }
}

module.exports = {
  ERPBackend
};
