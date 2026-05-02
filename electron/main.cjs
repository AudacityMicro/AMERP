const { app, BrowserWindow, dialog, ipcMain, protocol, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'setup-sheet',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const CONFIG_FILE = 'config.json';
const DEFAULT_LIBRARY_DEFINITIONS = [
  { name: 'machines', label: 'Machines', order: 10 },
  { name: 'fixtures', label: 'Fixtures', order: 20 },
  { name: 'sawBlades', label: 'Saw Blades', order: 30 },
  { name: 'blastMedia', label: 'Blast Media', order: 40 },
  { name: 'tumblingMedia', label: 'Tumbling Media', order: 50 }
];

const DEFAULT_LIBRARY_LABELS = Object.fromEntries(
  DEFAULT_LIBRARY_DEFINITIONS.map((library) => [library.name, library.label])
);

const TEMPLATE_SEED_MARKER = '.seeded-defaults';

const DEFAULT_TEMPLATES = [
  {
    id: 'sawing',
    name: 'Sawing',
    category: 'Cutoff',
    libraryNames: ['machines', 'sawBlades'],
    defaultParameters: [
      { id: 'blade', label: 'Blade', value: '' },
      { id: 'feed-rate', label: 'Feed rate', value: '' },
      { id: 'coolant', label: 'Coolant', value: '' },
      { id: 'cut-length', label: 'Cut length', value: '' }
    ],
    defaultSteps: ['Verify material and cut length.', 'Set stop or mark material.', 'Saw parts and deburr sharp edges.']
  },
  {
    id: 'milling',
    name: 'Milling',
    category: 'Machining',
    libraryNames: ['machines', 'fixtures'],
    defaultParameters: [
      { id: 'work-offset', label: 'Work offset', value: 'G54' },
      { id: 'tooling', label: 'Primary tooling', value: '' },
      { id: 'stickout', label: 'Tool stickout', value: '' },
      { id: 'fixture', label: 'Fixture', value: '' },
      { id: 'coolant', label: 'Coolant', value: '' }
    ],
    defaultSteps: ['Load fixture and indicate as required.', 'Load tools and verify stickout.', 'Run first article and inspect critical features.']
  },
  {
    id: 'turning',
    name: 'Turning',
    category: 'Machining',
    libraryNames: ['machines', 'fixtures'],
    defaultParameters: [
      { id: 'chuck', label: 'Chuck/collet', value: '' },
      { id: 'stickout', label: 'Part stickout', value: '' },
      { id: 'work-offset', label: 'Work offset', value: 'G54' },
      { id: 'coolant', label: 'Coolant', value: '' }
    ],
    defaultSteps: ['Load stock and set stickout.', 'Set tools and offsets.', 'Run first piece and verify dimensions.']
  },
  {
    id: 'drilling-tapping',
    name: 'Drilling / Tapping',
    category: 'Machining',
    libraryNames: ['machines'],
    defaultParameters: [
      { id: 'drill-size', label: 'Drill size', value: '' },
      { id: 'tap-size', label: 'Tap size', value: '' },
      { id: 'thread-depth', label: 'Thread depth', value: '' },
      { id: 'lubricant', label: 'Lubricant', value: '' }
    ],
    defaultSteps: ['Spot and drill holes.', 'Tap or thread mill as specified.', 'Verify thread depth and fit.']
  },
  {
    id: 'blasting',
    name: 'Blasting',
    category: 'Finishing',
    libraryNames: ['machines', 'blastMedia'],
    defaultParameters: [
      { id: 'media', label: 'Media', value: '' },
      { id: 'pressure', label: 'Pressure', value: '' },
      { id: 'nozzle-distance', label: 'Nozzle distance', value: '' },
      { id: 'masking', label: 'Masking required', value: '' }
    ],
    defaultSteps: ['Mask protected features as required.', 'Blast evenly to required finish.', 'Clean residual media from part.']
  },
  {
    id: 'tumbling',
    name: 'Tumbling',
    category: 'Finishing',
    libraryNames: ['machines', 'tumblingMedia'],
    defaultParameters: [
      { id: 'media', label: 'Media', value: '' },
      { id: 'compound', label: 'Compound', value: '' },
      { id: 'time', label: 'Time', value: '' },
      { id: 'load-size', label: 'Load size', value: '' }
    ],
    defaultSteps: ['Load parts and media.', 'Run tumble cycle.', 'Rinse, dry, and inspect edges.']
  },
  {
    id: 'deburr',
    name: 'Deburr',
    category: 'Finishing',
    libraryNames: [],
    defaultParameters: [
      { id: 'method', label: 'Method', value: '' },
      { id: 'tools', label: 'Hand tools', value: '' },
      { id: 'critical-edges', label: 'Critical edges', value: '' }
    ],
    defaultSteps: ['Break sharp edges.', 'Protect controlled edges and surfaces.', 'Inspect for burrs under light.']
  },
  {
    id: 'inspection',
    name: 'Inspection',
    category: 'Quality',
    libraryNames: [],
    defaultParameters: [
      { id: 'inspection-tools', label: 'Inspection tools', value: '' },
      { id: 'critical-features', label: 'Critical features', value: '' },
      { id: 'sample-size', label: 'Sample size', value: '' }
    ],
    defaultSteps: ['Inspect critical features.', 'Record required dimensions.', 'Segregate nonconforming parts.']
  },
  {
    id: 'generic',
    name: 'Generic Operation',
    category: 'General',
    libraryNames: [],
    defaultParameters: [
      { id: 'parameter', label: 'Parameter', value: '' }
    ],
    defaultSteps: ['Document operation instructions.']
  }
];

let mainWindow;

function getDataFolderArg() {
  const arg = process.argv.find((value) => value.startsWith('--data-folder='));
  if (!arg) return null;
  return arg.slice('--data-folder='.length).replace(/^"|"$/g, '');
}

const getConfigPath = () => path.join(app.getPath('userData'), CONFIG_FILE);

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Unable to read JSON at ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function safeFileName(value, fallback = 'record') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || fallback;
}

const defaultLibraryDefinition = (name) => (
  DEFAULT_LIBRARY_DEFINITIONS.find((library) => library.name === name) || null
);

const libraryPath = (folder, name) => path.join(folder, 'libraries', `${safeFileName(name, 'library')}.json`);

function normalizeLibrary(library, fallbackName) {
  const defaultDefinition = defaultLibraryDefinition(library?.name || fallbackName);
  const name = safeFileName(library?.name || fallbackName || `library-${crypto.randomUUID()}`, 'library');
  const order = Number.isFinite(Number(library?.order))
    ? Number(library.order)
    : (defaultDefinition?.order || 1000);

  return {
    name,
    label: String(library?.label || defaultDefinition?.label || name).trim() || name,
    order,
    records: Array.isArray(library?.records) ? library.records : []
  };
}

function defaultTemplateLibraryNames(template) {
  const text = `${template?.name || ''} ${template?.category || ''} ${template?.id || ''}`.toLowerCase();
  if (text.includes('saw')) return ['machines', 'sawBlades'];
  if (text.includes('mill') || text.includes('turn')) return ['machines', 'fixtures'];
  if (text.includes('drill') || text.includes('tap')) return ['machines'];
  if (text.includes('blast')) return ['machines', 'blastMedia'];
  if (text.includes('tumbl')) return ['machines', 'tumblingMedia'];
  return [];
}

function normalizeTemplate(template) {
  const hasLibraryNames = Object.prototype.hasOwnProperty.call(template || {}, 'libraryNames');
  return {
    ...template,
    id: template?.id || crypto.randomUUID(),
    libraryNames: hasLibraryNames
      ? [...new Set((Array.isArray(template.libraryNames) ? template.libraryNames : []).filter(Boolean))]
      : defaultTemplateLibraryNames(template)
  };
}

async function readConfig() {
  return readJson(getConfigPath(), {});
}

async function writeConfig(config) {
  await writeJson(getConfigPath(), config);
}

async function getDataFolder() {
  const argFolder = getDataFolderArg();
  if (argFolder) {
    return path.resolve(argFolder);
  }

  if (process.env.SETUP_SHEET_DATA_FOLDER) {
    return path.resolve(process.env.SETUP_SHEET_DATA_FOLDER);
  }

  const config = await readConfig();
  return config.dataFolder || null;
}

async function requireDataFolder() {
  const folder = await getDataFolder();
  if (!folder) {
    throw new Error('Choose a data folder before saving shop documentation.');
  }
  await initializeDataFolder(folder);
  return folder;
}

async function initializeDataFolder(folder) {
  await fs.mkdir(path.join(folder, 'jobs'), { recursive: true });
  await fs.mkdir(path.join(folder, 'libraries'), { recursive: true });
  await fs.mkdir(path.join(folder, 'templates'), { recursive: true });
  await fs.mkdir(path.join(folder, 'assets'), { recursive: true });

  await Promise.all(DEFAULT_LIBRARY_DEFINITIONS.map(async (definition) => {
    const defaultPath = libraryPath(folder, definition.name);
    try {
      await fs.access(defaultPath);
    } catch {
      await writeJson(defaultPath, normalizeLibrary(definition, definition.name));
    }
  }));

  const seedMarkerPath = path.join(folder, 'templates', TEMPLATE_SEED_MARKER);
  try {
    await fs.access(seedMarkerPath);
  } catch {
    await Promise.all(DEFAULT_TEMPLATES.map(async (template) => {
      const templatePath = path.join(folder, 'templates', `${safeFileName(template.id)}.json`);
      try {
        await fs.access(templatePath);
      } catch {
        await writeJson(templatePath, normalizeTemplate(template));
      }
    }));
    await fs.writeFile(seedMarkerPath, `${new Date().toISOString()}\n`, 'utf8');
  }
}

async function selectDataFolder() {
  const options = {
    title: 'Choose Setup Sheet Generator Data Folder',
    properties: ['openDirectory', 'createDirectory']
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths[0]) {
    return getDataFolder();
  }

  const dataFolder = result.filePaths[0];
  await initializeDataFolder(dataFolder);
  await writeConfig({ ...(await readConfig()), dataFolder });
  return dataFolder;
}

async function ensureDataFolderAtStartup() {
  const current = await getDataFolder();
  if (current) {
    try {
      await initializeDataFolder(current);
      return;
    } catch {
      await writeConfig({ ...(await readConfig()), dataFolder: null });
    }
  }

  await selectDataFolder();
}

function resolveInside(baseFolder, relativePath) {
  const resolved = path.resolve(baseFolder, relativePath);
  const normalizedBase = path.resolve(baseFolder);
  if (resolved !== normalizedBase && !resolved.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new Error('Path is outside the selected data folder.');
  }
  return resolved;
}

async function listJobs() {
  const folder = await requireDataFolder();
  const jobsFolder = path.join(folder, 'jobs');
  const files = await fs.readdir(jobsFolder);
  const jobs = [];

  for (const file of files.filter((item) => item.endsWith('.json'))) {
    const job = await readJson(path.join(jobsFolder, file), null);
    if (!job) continue;
    jobs.push({
      id: job.id,
      jobNumber: job.jobNumber || '',
      jobName: job.jobName || '',
      customer: job.customer || '',
      partNumber: job.partNumber || '',
      partName: job.partName || '',
      revision: job.revision?.number || '',
      updatedAt: job.updatedAt || job.createdAt || ''
    });
  }

  return jobs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function loadJob(_event, id) {
  const folder = await requireDataFolder();
  const fileName = `${safeFileName(id)}.json`;
  return readJson(path.join(folder, 'jobs', fileName), null);
}

async function saveJob(_event, job) {
  const folder = await requireDataFolder();
  const now = new Date().toISOString();
  const nextJob = {
    ...job,
    id: job.id || crypto.randomUUID(),
    createdAt: job.createdAt || now,
    updatedAt: now
  };
  const fileName = `${safeFileName(nextJob.id)}.json`;
  await writeJson(path.join(folder, 'jobs', fileName), nextJob);
  return nextJob;
}

async function deleteJob(_event, id) {
  const folder = await requireDataFolder();
  const fileName = `${safeFileName(id)}.json`;
  await fs.rm(path.join(folder, 'jobs', fileName), { force: true });
  await fs.rm(path.join(folder, 'assets', safeFileName(id)), { recursive: true, force: true });
  return true;
}

async function loadLibraries() {
  const folder = await requireDataFolder();
  const librariesFolder = path.join(folder, 'libraries');
  const files = await fs.readdir(librariesFolder);
  const libraries = {};

  for (const file of files.filter((item) => item.endsWith('.json'))) {
    const fallbackName = path.basename(file, '.json');
    const library = normalizeLibrary(await readJson(path.join(librariesFolder, file), null), fallbackName);
    libraries[library.name] = library;
  }

  return Object.fromEntries(
    Object.values(libraries)
      .sort((a, b) => (Number(a.order || 1000) - Number(b.order || 1000)) || String(a.label).localeCompare(String(b.label)))
      .map((library) => [library.name, library])
  );
}

async function saveLibrary(_event, libraryOrName, records) {
  const folder = await requireDataFolder();
  const input = typeof libraryOrName === 'string'
    ? { name: libraryOrName, label: DEFAULT_LIBRARY_LABELS[libraryOrName] || libraryOrName, records }
    : libraryOrName;
  const library = normalizeLibrary(input, input?.name);
  await writeJson(libraryPath(folder, library.name), library);
  return library;
}

async function deleteLibrary(_event, name) {
  const folder = await requireDataFolder();
  if (!name) throw new Error('No library id was provided.');
  await fs.rm(libraryPath(folder, name), { force: true });
  return true;
}

async function loadTemplates() {
  const folder = await requireDataFolder();
  const templatesFolder = path.join(folder, 'templates');
  const files = await fs.readdir(templatesFolder);
  const templates = [];

  for (const file of files.filter((item) => item.endsWith('.json'))) {
    const template = await readJson(path.join(templatesFolder, file), null);
    if (template?.id) templates.push(normalizeTemplate(template));
  }

  return templates.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function saveTemplate(_event, template) {
  const folder = await requireDataFolder();
  const nextTemplate = normalizeTemplate(template);
  await writeJson(path.join(folder, 'templates', `${safeFileName(nextTemplate.id)}.json`), nextTemplate);
  return nextTemplate;
}

async function deleteTemplate(_event, id) {
  const folder = await requireDataFolder();
  if (!id) throw new Error('No template id was provided.');
  await fs.rm(path.join(folder, 'templates', `${safeFileName(id)}.json`), { force: true });
  return true;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/gi, 'deg')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanCell(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsvRows(raw) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
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
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function rowsFromSetupSheet(filePath, raw) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.csv') return parseCsvRows(raw);

  const htmlRows = extractHtmlRows(raw);
  if (htmlRows.length) return htmlRows;

  return raw
    .split(/\r?\n/)
    .map((line) => line.split(/\t| {2,}/).map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length);
}

function headerScore(headers) {
  const joined = headers.join(' ');
  let score = 0;
  if (headers.some((header) => header === 'tool' || header === 'toolno' || header === 'toolnumber' || header === 't')) score += 2;
  if (joined.includes('description') || joined.includes('comment') || joined.includes('type')) score += 1;
  if (joined.includes('diameter') || joined.includes('length') || joined.includes('stickout') || joined.includes('flute')) score += 1;
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
        if (header && row[index]) object[header] = row[index];
      });
      objects.push(object);
    }

    if (row.length >= 4) {
      const object = {};
      for (let index = 0; index < row.length - 1; index += 2) {
        const key = normalizeHeader(row[index]);
        if (key && row[index + 1]) object[key] = row[index + 1];
      }
      if (Object.keys(object).length) objects.push(object);
    }
  }

  return objects;
}

function readField(object, exactHeaders, containsHeaders = []) {
  for (const header of exactHeaders) {
    if (object[header]) return object[header];
  }

  const entry = Object.entries(object).find(([key, value]) => (
    value && containsHeaders.some((fragment) => key.includes(fragment))
  ));
  return entry?.[1] || '';
}

function toolRecordFromObject(object, sourceFile) {
  const toolValue = readField(object, ['tool', 'toolno', 'toolnumber', 't', 'number'], ['tool']);
  const toolNumber = String(toolValue || '').match(/(?:^|\b)T?\s*(\d+)(?:\b|$)/i)?.[1] || '';
  const description = readField(object, ['description', 'tooldescription', 'comment', 'comments', 'name'], ['description', 'comment']);
  const type = readField(object, ['type', 'tooltype'], ['type']);
  const diameter = readField(object, ['diameter', 'tooldiameter', 'dia'], ['diameter']);
  const length = readField(
    object,
    ['stickout', 'toolstickout', 'length', 'toollength', 'overalllength', 'flutelength', 'shoulderlength'],
    ['stickout', 'length', 'flute']
  );
  const holder = readField(
    object,
    ['holder', 'holderdescription', 'holdername', 'holdertype', 'holderproduct', 'holderid', 'toolholder'],
    ['holder']
  );
  const vendor = readField(object, ['vendor', 'manufacturer'], ['vendor', 'manufacturer']);
  const product = readField(object, ['product', 'productid', 'partnumber'], ['product', 'part']);

  const baseName = description || type || toolValue;
  if (!baseName && !toolNumber) return null;

  const detailLines = [
    toolNumber ? `Fusion tool: T${toolNumber}` : '',
    diameter ? `Diameter: ${diameter}` : '',
    length ? `Tool length/stickout: ${length}` : '',
    holder ? `Holder: ${holder}` : '',
    vendor ? `Vendor: ${vendor}` : '',
    product ? `Product: ${product}` : '',
    `Imported from: ${sourceFile}`
  ].filter(Boolean);

  return {
    id: crypto.randomUUID(),
    name: `${toolNumber ? `T${toolNumber} - ` : ''}${baseName || 'Fusion Tool'}`,
    description: [type, diameter ? `Dia ${diameter}` : ''].filter(Boolean).join(' | '),
    type,
    diameter,
    length,
    holder,
    vendor,
    product,
    details: detailLines.join('\n'),
    source: 'Fusion 360',
    fusionToolNumber: toolNumber,
    importedAt: new Date().toISOString()
  };
}

function dedupeImportedTools(tools) {
  const byKey = new Map();
  for (const tool of tools) {
    const key = tool.fusionToolNumber ? `t:${tool.fusionToolNumber}` : `n:${tool.name.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, tool);
  }
  return [...byKey.values()];
}

function mergeToolRecords(existingRecords, importedTools) {
  const records = [...existingRecords];
  let added = 0;
  let updated = 0;
  const importedIds = [];

  for (const imported of importedTools) {
    const existingIndex = records.findIndex((record) => {
      const sameFusionNumber = imported.fusionToolNumber && record.fusionToolNumber === imported.fusionToolNumber;
      const sameName = String(record.name || '').trim().toLowerCase() === imported.name.trim().toLowerCase();
      return sameFusionNumber || sameName;
    });

    if (existingIndex >= 0) {
      records[existingIndex] = {
        ...records[existingIndex],
        ...imported,
        id: records[existingIndex].id
      };
      importedIds.push(records[existingIndex].id);
      updated += 1;
    } else {
      records.push(imported);
      importedIds.push(imported.id);
      added += 1;
    }
  }

  return { records, added, updated, importedIds };
}

function parseFusionTools(filePath, raw) {
  const fusionHtmlTools = parseFusionHtmlTools(filePath, raw);
  if (fusionHtmlTools.length) return fusionHtmlTools;

  const rows = rowsFromSetupSheet(filePath, raw);
  const objects = objectsFromRows(rows);
  const tools = objects
    .map((object) => toolRecordFromObject(object, path.basename(filePath)))
    .filter(Boolean);
  return dedupeImportedTools(tools);
}

function parseFusionHtmlTools(filePath, raw) {
  const tools = [];
  const toolRows = raw.matchAll(/<tr\b[^>]*class=["']?info["']?[^>]*>([\s\S]*?)(?=<tr\b[^>]*class=["']?space["']?)/gi);

  for (const rowMatch of toolRows) {
    const rowHtml = rowMatch[1];
    const toolNumber = rowHtml.match(/<table\b[^>]*class=["']?info["']?[^>]*>\s*<tr><td><b>\s*T\s*(\d+)\s*<\/b>/i)?.[1];
    if (!toolNumber) continue;

    const fields = { tool: `T${toolNumber}` };
    const pairMatches = rowHtml.matchAll(/<div\b[^>]*class=["']?description["']?[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/gi);

    for (const pairMatch of pairMatches) {
      const key = normalizeHeader(cleanCell(pairMatch[1]).replace(/:$/, ''));
      const value = cleanCell(pairMatch[2]);
      if (key && value) fields[key] = value;
    }

    const tool = toolRecordFromObject(fields, path.basename(filePath));
    if (tool) tools.push(tool);
  }

  return dedupeImportedTools(tools);
}

function extractFusionHeader(raw) {
  const title = cleanCell(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
  const program = title.match(/Program\s+([^\s<]+)/i)?.[1] || '';
  const jobDescription = cleanCell(raw.match(/Job Description:\s*<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
  const documentPath = cleanCell(raw.match(/Document Path:\s*<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');

  return {
    program,
    jobDescription,
    documentPath,
    title
  };
}

function extractSetupParameters(raw) {
  const setupTable = raw.match(/<table\b[^>]*class=["']?job["']?[^>]*>[\s\S]*?<th[^>]*>Setup<\/th>[\s\S]*?<\/table>\s*<\/td>/i)?.[0] || '';
  const text = cleanCell(setupTable);
  const parameters = [];

  for (const label of ['WCS', 'Stock', 'Part']) {
    const normalized = label.toLowerCase();
    const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[: ]+([^A-Z]+)`, 'i'));
    const outputLabel = label === 'Part' ? 'Fixture' : label;
    if (match?.[1]) {
      parameters.push({ id: crypto.randomUUID(), label: outputLabel, value: match[1].trim() });
    } else if (text.toLowerCase().includes(normalized)) {
      parameters.push({ id: crypto.randomUUID(), label: outputLabel, value: 'See setup sheet' });
    }
  }

  return parameters;
}

function parseFusionOperationSummaries(raw) {
  const operations = [];
  const rowMatches = raw.matchAll(/<tr\b[^>]*class=["']?info["']?[^>]*>([\s\S]*?)(?=<tr\b[^>]*class=["']?space["']?)/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    if (!/<div\b[^>]*class=["']?value["']?[^>]*>\s*Operation\s+\d+\/\d+/i.test(rowHtml)) continue;

    const fields = {};
    const pairMatches = rowHtml.matchAll(/<div\b[^>]*class=["']?description["']?[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["']?value["']?[^>]*>([\s\S]*?)<\/div>/gi);
    for (const pairMatch of pairMatches) {
      const key = cleanCell(pairMatch[1]).replace(/:$/, '');
      const value = cleanCell(pairMatch[2]);
      if (key && value) fields[key] = value;
    }

    const operationLabel = cleanCell(rowHtml.match(/<div\b[^>]*class=["']?value["']?[^>]*>\s*(Operation\s+\d+\/\d+)\s*<\/div>/i)?.[1] || '');
    const toolNumber = rowHtml.match(/<b>\s*T\s*(\d+)\s*<\/b>/i)?.[1] || '';
    operations.push({
      operationLabel,
      description: fields.Description || '',
      strategy: fields.Strategy || '',
      wcs: fields.WCS || '',
      coolant: fields.Coolant || '',
      maxSpindleSpeed: fields['Maximum Spindle Speed'] || '',
      maxFeedrate: fields['Maximum Feedrate'] || '',
      cycleTime: fields['Estimated Cycle Time'] || '',
      toolNumber
    });
  }

  return operations;
}

function parseCycleTimeSeconds(value) {
  const text = String(value || '').replace(/\([^)]*\)/g, '').trim();
  let seconds = 0;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/i);
  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*s/i);
  const colon = text.match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/) || text.match(/(\d+):(\d+(?:\.\d+)?)/);

  if (hours) seconds += Number(hours[1]) * 3600;
  if (minutes) seconds += Number(minutes[1]) * 60;
  if (secondMatch) seconds += Number(secondMatch[1]);
  if (!seconds && colon) {
    if (colon.length === 4) seconds += Number(colon[1] || 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
    else seconds += Number(colon[1]) * 60 + Number(colon[2]);
  }

  return seconds;
}

function formatCycleTime(seconds) {
  if (!seconds) return '';
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function buildSetupSheetImport(filePath, raw) {
  const header = extractFusionHeader(raw);
  const tools = parseFusionTools(filePath, raw);
  const operationSummaries = parseFusionOperationSummaries(raw);
  const source = path.basename(filePath);
  const title = header.jobDescription || header.documentPath || source;
  const toolIds = new Set(tools.map((tool) => tool.id));
  const cycleTime = formatCycleTime(operationSummaries.reduce((total, operation) => (
    total + parseCycleTimeSeconds(operation.cycleTime)
  ), 0));
  const parameters = [
    header.program ? { id: crypto.randomUUID(), label: 'Program Name', value: header.program } : null,
    { id: crypto.randomUUID(), label: 'WCS Location', value: '' },
    cycleTime ? { id: crypto.randomUUID(), label: 'Cycle Time', value: cycleTime } : null,
    ...extractSetupParameters(raw)
  ].filter(Boolean);

  const operationLines = operationSummaries.map((operation) => (
    [
      operation.operationLabel,
      operation.description,
      operation.strategy ? `Strategy: ${operation.strategy}` : '',
      operation.toolNumber ? `T${operation.toolNumber}` : '',
      operation.maxSpindleSpeed ? `Spindle: ${operation.maxSpindleSpeed}` : '',
      operation.maxFeedrate ? `Feed: ${operation.maxFeedrate}` : '',
      operation.cycleTime ? `Cycle: ${operation.cycleTime}` : ''
    ].filter(Boolean).join(' | ')
  ));

  return {
    source,
    header,
    tools,
    operation: {
      id: crypto.randomUUID(),
      templateId: 'fusion-setup-sheet',
      type: 'Milling',
      title,
      libraryNames: ['machines', 'fixtures'],
      librarySelections: {},
      machineId: '',
      fixtureIds: [],
      toolIds: [...toolIds],
      parameters,
      notes: '',
      steps: [
        {
          id: crypto.randomUUID(),
          instruction: '',
          images: []
        }
      ]
    }
  };
}

function mergeJobTools(existingTools, importedTools) {
  const tools = [...existingTools];
  const idMap = new Map();

  for (const imported of importedTools) {
    const existing = tools.find((tool) => (
      (imported.fusionToolNumber && tool.fusionToolNumber === imported.fusionToolNumber)
      || String(tool.name || '').trim().toLowerCase() === imported.name.trim().toLowerCase()
    ));

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

async function importFusionSetupSheets() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Fusion 360 Setup Sheets',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Fusion setup sheets', extensions: ['html', 'htm', 'csv', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) return null;

  const sheets = [];
  let jobTools = [];

  for (const filePath of result.filePaths) {
    const raw = await fs.readFile(filePath, 'utf8');
    const sheet = buildSetupSheetImport(filePath, raw);
    const merged = mergeJobTools(jobTools, sheet.tools);
    jobTools = merged.tools;
    sheet.operation.toolIds = sheet.operation.toolIds.map((id) => merged.idMap.get(id) || id);
    sheets.push({
      source: sheet.source,
      header: sheet.header,
      operation: sheet.operation
    });
  }

  if (!sheets.length) {
    throw new Error('No setup sheets were imported.');
  }

  return {
    sheets,
    tools: jobTools
  };
}

async function copyStepImage(_event, jobId, sourcePath) {
  const folder = await requireDataFolder();
  if (!sourcePath) throw new Error('No image path was provided.');

  const extension = path.extname(sourcePath).toLowerCase();
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
  if (!allowed.has(extension)) {
    throw new Error('Step images must be PNG, JPG, WEBP, GIF, or BMP files.');
  }

  const safeJobId = safeFileName(jobId || 'unassigned-job');
  const assetFolder = path.join(folder, 'assets', safeJobId);
  await fs.mkdir(assetFolder, { recursive: true });

  const imageId = crypto.randomUUID();
  const destinationName = `${imageId}${extension}`;
  const destinationPath = path.join(assetFolder, destinationName);
  await fs.copyFile(sourcePath, destinationPath);

  return {
    id: imageId,
    name: path.basename(sourcePath),
    relativePath: path.posix.join('assets', safeJobId, destinationName)
  };
}

async function chooseStepImages(_event, jobId) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Step Images',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
    ]
  });

  if (result.canceled) return [];
  const copied = [];
  for (const sourcePath of result.filePaths) {
    copied.push(await copyStepImage(_event, jobId, sourcePath));
  }
  return copied;
}

async function exportJobPdf(_event, jobId, destinationPath) {
  const folder = await requireDataFolder();
  const job = await loadJob(_event, jobId);
  if (!job) throw new Error('Job not found.');

  let outputPath = destinationPath;
  if (!outputPath) {
    const defaultName = `${safeFileName(job.jobNumber || job.jobName || job.id)}-setup-sheet.pdf`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Job Packet PDF',
      defaultPath: path.join(folder, defaultName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return null;
    outputPath = result.filePath;
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 1100,
    height: 1400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await printWindow.loadURL(`${devServerUrl}#/print/${encodeURIComponent(jobId)}`);
  } else {
    await printWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: `/print/${encodeURIComponent(jobId)}`
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 400));
  const pdf = await printWindow.webContents.printToPDF({
    pageSize: 'Letter',
    printBackground: true,
    margins: {
      marginType: 'custom',
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 650,
    title: 'Setup Sheet Generator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  protocol.handle('setup-sheet', async (request) => {
    const folder = await requireDataFolder();
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const assetPath = resolveInside(folder, relativePath);
    return net.fetch(pathToFileURL(assetPath).toString());
  });

  ipcMain.handle('select-data-folder', selectDataFolder);
  ipcMain.handle('get-data-folder', getDataFolder);
  ipcMain.handle('list-jobs', listJobs);
  ipcMain.handle('load-job', loadJob);
  ipcMain.handle('save-job', saveJob);
  ipcMain.handle('delete-job', deleteJob);
  ipcMain.handle('load-libraries', loadLibraries);
  ipcMain.handle('save-library', saveLibrary);
  ipcMain.handle('delete-library', deleteLibrary);
  ipcMain.handle('load-templates', loadTemplates);
  ipcMain.handle('save-template', saveTemplate);
  ipcMain.handle('delete-template', deleteTemplate);
  ipcMain.handle('import-fusion-setup-sheets', importFusionSetupSheets);
  ipcMain.handle('copy-step-image', copyStepImage);
  ipcMain.handle('choose-step-images', chooseStepImages);
  ipcMain.handle('export-job-pdf', exportJobPdf);

  await ensureDataFolderAtStartup();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
