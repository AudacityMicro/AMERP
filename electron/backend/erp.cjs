"use strict";

const { BrowserWindow, dialog } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const {
  DEFAULT_LIBRARY_DEFINITIONS,
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

const CONFIG_FILE = "amerp-config.json";
const LOCK_TTL_MS = 8 * 60 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

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
      "jobs",
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

    for (const library of DEFAULT_LIBRARY_DEFINITIONS) {
      const filePath = path.join(root, "libraries", `${safeFileName(library.name)}.json`);
      if (!(await pathExists(filePath))) {
        await writeJson(filePath, library);
      }
    }

    for (const template of DEFAULT_TEMPLATES) {
      const filePath = path.join(root, "templates", "operations", `${safeFileName(template.id)}.json`);
      if (!(await pathExists(filePath))) {
        await writeJson(filePath, template);
      }
    }

    const standardsPath = path.join(root, "metrology", "standards", "standards.json");
    if (!(await pathExists(standardsPath))) {
      await writeJson(standardsPath, []);
    }

    const preferencesPath = path.join(root, "config", "preferences.json");
    if (!(await pathExists(preferencesPath))) {
      await writeJson(preferencesPath, {
        dueSoonDays: 14,
        resultsColumns: ["serialCode", "materialType", "supplier", "traceabilityLevel", "status"],
        lastInitializedAt: nowIso()
      });
    }

    const indexPath = this.getIndexPath(root);
    if (!(await pathExists(indexPath))) {
      await writeJson(indexPath, {
        generatedAt: nowIso(),
        jobs: [],
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
        && existing.owner?.username === owner.username
        && existing.owner?.pid === owner.pid;
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
        && lock.owner?.username === owner.username
        && lock.owner?.pid === owner.pid;
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
      const library = await readJson(path.join(folder, entry), null);
      if (!library?.name) {
        continue;
      }
      libraries[library.name] = {
        ...library,
        order: Number(library.order || 1000),
        records: Array.isArray(library.records) ? library.records : []
      };
    }
    return Object.fromEntries(
      Object.values(libraries)
        .sort((a, b) => Number(a.order || 1000) - Number(b.order || 1000) || String(a.label).localeCompare(String(b.label)))
        .map((library) => [library.name, library])
    );
  }

  async saveLibrary(library) {
    const dataRoot = await this.requireDataFolder();
    const normalized = {
      name: safeFileName(library?.name || randomId("library")),
      label: String(library?.label || library?.name || "Library").trim(),
      order: Number(library?.order || 1000),
      records: Array.isArray(library?.records) ? library.records : []
    };
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
        libraryNames: toDisplayList(template.libraryNames),
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
      libraryNames: toDisplayList(template?.libraryNames),
      defaultParameters: Array.isArray(template?.defaultParameters) ? template.defaultParameters : [],
      defaultSteps: Array.isArray(template?.defaultSteps) ? template.defaultSteps : []
    };
    await writeJson(path.join(dataRoot, "templates", "operations", `${safeFileName(normalized.id)}.json`), normalized);
    await this.appendAudit("template_saved", normalized.id, `Saved template ${normalized.name}.`);
    return normalized;
  }

  async deleteTemplate(id) {
    const dataRoot = await this.requireDataFolder();
    await fs.rm(path.join(dataRoot, "templates", "operations", `${safeFileName(id)}.json`), { force: true });
    await this.appendAudit("template_deleted", id, `Deleted template ${id}.`);
    return true;
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

  async buildJobSummaryFromHeader(header) {
    return {
      id: header.id,
      jobNumber: header.jobNumber || "",
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

  getMaterialRoot(dataRoot, materialId) {
    return path.join(dataRoot, "materials", safeFileName(materialId));
  }

  getInstrumentRoot(dataRoot, instrumentId) {
    return path.join(dataRoot, "metrology", "instruments", safeFileName(instrumentId));
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
        operation.setupInstructions = operation.setupInstructions || "";
        operation.parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
        operation.stepImages = Array.isArray(operation.stepImages) ? operation.stepImages : [];
        operation.requiredMaterialLots = toDisplayList(operation.requiredMaterialLots);
        operation.requiredInstruments = toDisplayList(operation.requiredInstruments);
        operation.setupTemplateRefs = toDisplayList(operation.setupTemplateRefs);
        operation.jobToolRefs = toDisplayList(operation.jobToolRefs);
        operations.push(operation);
      }
      operations.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
      parts.push({
        ...part,
        operations
      });
    }
    parts.sort((a, b) => String(a.partNumber || a.partName || "").localeCompare(String(b.partNumber || b.partName || "")));
    return {
      ...header,
      parts
    };
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

  normalizeOperation(operation, index = 0) {
    const sequence = Number(operation?.sequence || index + 1) || index + 1;
    return {
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
      notes: String(operation?.notes || "").trim(),
      parameters: (Array.isArray(operation?.parameters) ? operation.parameters : []).map((item) => this.normalizeParameter(item)),
      stepImages: (Array.isArray(operation?.stepImages) ? operation.stepImages : []).map((item) => this.normalizeStepImage(item)),
      setupTemplateRefs: toDisplayList(operation?.setupTemplateRefs),
      jobToolRefs: toDisplayList(operation?.jobToolRefs),
      requiredMaterialLots: toDisplayList(operation?.requiredMaterialLots),
      requiredInstruments: toDisplayList(operation?.requiredInstruments),
      inspectionPlan: {
        feature: String(operation?.inspectionPlan?.feature || "").trim(),
        method: String(operation?.inspectionPlan?.method || "").trim(),
        sampleSize: String(operation?.inspectionPlan?.sampleSize || "").trim(),
        frequency: String(operation?.inspectionPlan?.frequency || "").trim(),
        resultPlaceholderRefs: toDisplayList(operation?.inspectionPlan?.resultPlaceholderRefs)
      }
    };
  }

  normalizePart(part) {
    const operations = (Array.isArray(part?.operations) ? part.operations : []).map((operation, index) => this.normalizeOperation(operation, index));
    return {
      id: part?.id || randomId("part"),
      partNumber: String(part?.partNumber || "").trim(),
      partName: String(part?.partName || "").trim(),
      description: String(part?.description || "").trim(),
      quantity: String(part?.quantity || "").trim(),
      materialSpec: String(part?.materialSpec || "").trim(),
      revision: {
        number: String(part?.revision?.number || "").trim(),
        date: String(part?.revision?.date || "").trim(),
        notes: String(part?.revision?.notes || "").trim()
      },
      notes: String(part?.notes || "").trim(),
      active: part?.active !== false,
      operations
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
      tools: Array.isArray(job?.tools) ? job.tools : [],
      parts,
      createdAt: job?.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (!normalized.jobNumber && !normalized.customer) {
      throw new Error("A job number or customer is required.");
    }
    if (!normalized.parts.length) {
      throw new Error("Add at least one part before saving.");
    }

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
    await writeText(path.join(jobRoot, "history.md"), this.jobHistoryMarkdown(normalized));
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

  jobHistoryMarkdown(job) {
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
      lines.push(`- Revision: ${part.revision?.number || "-"}`);
      lines.push("");
      for (const operation of part.operations) {
        lines.push(`### ${operation.sequence}. ${operation.title}`, "");
        lines.push(`- Type: ${operation.type || "-"}`);
        lines.push(`- Work Center: ${operation.workCenter || "-"}`);
        lines.push(`- Material Lots: ${operation.requiredMaterialLots.join(", ") || "-"}`);
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
    return {
      id: material.id,
      serialCode: material.serialCode,
      materialType: material.materialType,
      supplier: material.supplier,
      traceabilityLevel: material.traceabilityLevel,
      dateReceived: material.dateReceived,
      status: material.status || "active",
      updatedAt: material.updatedAt || material.createdAt || "",
      attachmentCount: Array.isArray(material.attachments) ? material.attachments.length : 0,
      usageCount: Array.isArray(material.usageRefs) ? material.usageRefs.length : 0
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
    return material;
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
    return {
      id: material?.id || randomId("material"),
      serialCode: String(material?.serialCode || "").trim(),
      materialType: String(material?.materialType || "").trim(),
      form: String(material?.form || "").trim(),
      supplier: String(material?.supplier || "").trim(),
      dateReceived: String(material?.dateReceived || todayIso()).trim(),
      purchaseOrder: String(material?.purchaseOrder || "").trim(),
      heatNumber: String(material?.heatNumber || "").trim(),
      lotNumber: String(material?.lotNumber || "").trim(),
      materialSpec: String(material?.materialSpec || "").trim(),
      dimensions: String(material?.dimensions || "").trim(),
      traceabilityLevel: String(material?.traceabilityLevel || "").trim(),
      originalStockIdentifier: String(material?.originalStockIdentifier || "").trim(),
      customerName: String(material?.customerName || "").trim(),
      storageLocation: String(material?.storageLocation || "").trim(),
      status: String(material?.status || "active").trim(),
      notes: String(material?.notes || "").trim(),
      attachments: Array.isArray(material?.attachments) ? material.attachments : [],
      jobs: Array.isArray(material?.jobs) ? material.jobs : [],
      changeLog: Array.isArray(material?.changeLog) ? material.changeLog : [],
      usageRefs: Array.isArray(material?.usageRefs) ? material.usageRefs : []
    };
  }

  async saveMaterial(material) {
    const dataRoot = await this.requireDataFolder();
    const normalized = this.normalizeMaterial(material);
    if (!normalized.serialCode) {
      normalized.serialCode = await this.generateMaterialSerial();
    }
    if (!normalized.materialType || !normalized.supplier) {
      throw new Error("Material type and supplier are required.");
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
      `- Material Type: ${material.materialType || "-"}`,
      `- Form: ${material.form || "-"}`,
      `- Supplier: ${material.supplier || "-"}`,
      `- Traceability: ${material.traceabilityLevel || "-"}`,
      `- Status: ${material.status || "-"}`,
      "",
      "## Notes",
      "",
      material.notes || "No notes.",
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
        lines.push(`- ${attachment.originalFilename} (${attachment.attachmentCategory || "Other"})`);
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

  async copyMaterialAttachment(materialId, sourcePath) {
    const dataRoot = await this.requireDataFolder();
    const root = this.getMaterialRoot(dataRoot, materialId);
    await ensureDir(path.join(root, "attachments"));
    const destination = await copyFileUnique(sourcePath, path.join(root, "attachments"), "");
    return {
      id: randomId("attachment"),
      originalFilename: path.basename(sourcePath),
      storedFilename: path.basename(destination),
      storedPath: path.relative(dataRoot, destination).replaceAll("\\", "/"),
      originalPath: sourcePath,
      fileType: path.extname(sourcePath).slice(1).toUpperCase(),
      attachmentCategory: "Other",
      description: "",
      attachedAt: nowIso()
    };
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
        for (const operation of part.operations) {
          for (const materialId of operation.requiredMaterialLots || []) {
            const material = materialsMap.get(materialId);
            if (material) {
              material.usageRefs.push({
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
    const [jobs, materials, instruments] = await Promise.all([
      this.listJobSummaries(),
      this.listMaterials(),
      this.listInstruments()
    ]);
    const index = {
      generatedAt: nowIso(),
      jobs: jobs.map((job) => ({
        id: job.id,
        label: `${job.jobNumber || job.id} ${job.customer || ""}`.trim(),
        searchText: `${job.jobNumber} ${job.customer} ${job.routeSummary}`.toLowerCase()
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
    const [dashboard, jobs, materials, instruments, templates, libraries, standards] = await Promise.all([
      this.getDashboardState(),
      this.listJobSummaries(),
      this.listMaterials(),
      this.listInstruments(),
      this.loadTemplates(),
      this.loadLibraries(),
      this.listStandards()
    ]);
    return {
      dataFolder,
      dashboard,
      jobs,
      materials,
      instruments,
      templates,
      libraries,
      standards,
      constants: {
        material: MATERIAL_CONSTANTS,
        jobStatuses: ["Open", "In Process", "On Hold", "Complete", "Archived"],
        priorities: ["Low", "Normal", "High", "Hot"],
        instrumentStatuses: ["In service", "Due for calibration", "Overdue", "Retired"]
      }
    };
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
      tools: imported.tools || [],
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
            jobToolRefs: toDisplayList(sheet.operation.jobToolRefs || sheet.operation.toolIds || []),
            requiredMaterialLots: [],
            requiredInstruments: [],
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
    const sheets = [];
    let jobTools = [];
    for (const filePath of result.filePaths) {
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
    return { sheets, tools: jobTools };
  }

  async exportJobPdf(jobId, destinationPath) {
    const dataRoot = await this.requireDataFolder();
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error("Job not found.");
    }
    let outputPath = destinationPath;
    if (!outputPath) {
      const result = await dialog.showSaveDialog({
        title: "Export Job Packet PDF",
        defaultPath: path.join(dataRoot, `${safeFileName(job.jobNumber || job.id)}-traveler.pdf`),
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      outputPath = result.filePath;
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
    await new Promise((resolve) => setTimeout(resolve, 500));
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "Letter",
      printBackground: true,
      margins: {
        marginType: "custom",
        top: 0.35,
        bottom: 0.35,
        left: 0.35,
        right: 0.35
      }
    });
    await fs.writeFile(outputPath, pdf);
    printWindow.close();
    return outputPath;
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
  const length = readField(object, ["stickout", "toolstickout", "length", "toollength", "overalllength", "flutelength"], ["stickout", "length", "flute"]);
  const holder = readField(object, ["holder", "holderdescription", "holdername", "holdertype", "toolholder"], ["holder"]);
  const baseName = description || type || toolValue;
  if (!baseName && !toolNumber) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    name: `${toolNumber ? `T${toolNumber} - ` : ""}${baseName || "Fusion Tool"}`,
    description: [type, diameter ? `Dia ${diameter}` : ""].filter(Boolean).join(" | "),
    diameter,
    length,
    holder,
    source: "Fusion 360",
    fusionToolNumber: toolNumber,
    details: [`Imported from: ${sourceFile}`].join("\n")
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
  const rows = rowsFromSetupSheet(filePath, raw);
  const objects = objectsFromRows(rows);
  return dedupeImportedTools(
    objects
      .map((object) => toolRecordFromObject(object, path.basename(filePath)))
      .filter(Boolean)
  );
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
  if (hours) seconds += Number(hours[1]) * 3600;
  if (minutes) seconds += Number(minutes[1]) * 60;
  if (secondMatch) seconds += Number(secondMatch[1]);
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
      operationLabel: cleanCell(rowHtml.match(/Operation\s+\d+\/\d+/i)?.[0] || ""),
      description: fields.Description || "",
      strategy: fields.Strategy || "",
      coolant: fields.Coolant || "",
      cycleTime: fields["Estimated Cycle Time"] || "",
      toolNumber
    });
  }
  return operations;
}

function buildSetupSheetImport(filePath, raw) {
  const header = extractFusionHeader(raw);
  const tools = parseFusionTools(filePath, raw);
  const operationSummaries = parseFusionOperationSummaries(raw);
  const cycleTime = formatCycleTime(operationSummaries.reduce((sum, item) => sum + parseCycleTimeSeconds(item.cycleTime), 0));
  const source = path.basename(filePath);
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
      workInstructions: operationSummaries.map((item) => [item.operationLabel, item.description, item.strategy && `Strategy: ${item.strategy}`, item.toolNumber && `T${item.toolNumber}`].filter(Boolean).join(" | ")).join("\n"),
      parameters: [
        header.program ? { id: crypto.randomUUID(), label: "Program", value: header.program } : null,
        cycleTime ? { id: crypto.randomUUID(), label: "Cycle Time", value: cycleTime } : null
      ].filter(Boolean),
      stepImages: [],
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

module.exports = {
  ERPBackend
};
