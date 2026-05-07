import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import {
  Archive,
  ArchiveRestore,
  ClipboardList,
  Database,
  FileDown,
  FolderOpen,
  Gauge,
  Hammer,
  Import,
  Library,
  Package,
  Plus,
  Settings,
  Trash2,
  X
} from "lucide-react";
import "./styles.css";

const api = window.amerp;

const PRIMARY_MODULES = [
  { id: "jobs", label: "Jobs", icon: Package },
  { id: "kanban", label: "Kanban", icon: ClipboardList },
  { id: "materials", label: "Materials", icon: Database },
  { id: "metrology", label: "Gages", icon: Gauge }
];
const normalizeEnabledModules = (value = {}) => Object.fromEntries(PRIMARY_MODULES.map((module) => [
  module.id,
  Object.prototype.hasOwnProperty.call(value || {}, module.id) ? Boolean(value[module.id]) : true
]));
const firstEnabledModuleId = (enabledModules) => PRIMARY_MODULES.find((module) => enabledModules[module.id])?.id || "settings";

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const blankJob = () => ({
  id: uid("job"),
  jobNumber: "",
  customerId: "",
  customer: "",
  status: "Open",
  priority: "Normal",
  dueDate: "",
  notes: "",
  revision: {
    number: "A",
    date: today(),
    author: "",
    notes: ""
  },
  documents: [],
  parts: [],
  createdAt: nowIso(),
  updatedAt: nowIso()
});

const blankJobTool = () => ({
  id: uid("tool"),
  name: "",
  description: "",
  diameter: "",
  length: "",
  holder: "",
  source: "",
  fusionToolNumber: "",
  details: ""
});

const blankPart = () => ({
  id: uid("part"),
  partNumber: "",
  partName: "",
  description: "",
  quantity: "",
  materialSpec: "",
  requiredMaterialLots: [],
  customMaterialText: "",
  revision: {
    number: "A",
    date: today(),
    notes: ""
  },
  notes: "",
  documents: [],
  operations: []
});

const blankOperation = (sequence = 1) => ({
  id: uid("operation"),
  sequence,
  folderName: `${String(sequence).padStart(3, "0")}-operation`,
  operationCode: `OP${String(sequence).padStart(3, "0")}`,
  title: `Operation ${sequence}`,
  type: "General",
  workCenter: "",
  status: "Ready",
  setupInstructions: "",
  workInstructions: "",
  instructionSteps: [],
  notes: "",
  parameters: [blankParameter()],
  stepImages: [],
  tools: [],
  setupTemplateRefs: [],
  jobToolRefs: [],
  librarySelections: {},
  requiredMaterialLots: [],
  requiredInstruments: [],
  customMaterialText: "",
  inspectionPlan: {
    feature: "",
    method: "",
    sampleSize: "",
    frequency: "",
    resultPlaceholderRefs: []
  }
});

const blankParameter = () => ({ id: uid("parameter"), label: "", value: "" });
const blankInstructionStep = (text = "") => ({ id: uid("step"), text, images: [] });
const OPERATION_TYPE_OPTIONS = ["General", "Machining", "Inspection", "Cutoff", "Finishing", "Deburr", "Assembly"];
const OPERATION_STATUS_OPTIONS = ["Ready", "In Process", "Complete", "Hold"];
const blankOperationTool = () => ({
  id: uid("tool"),
  name: "",
  diameter: "",
  length: "",
  holder: "",
  details: "",
  fusionToolNumber: "",
  source: ""
});

const blankMaterial = () => ({
  id: uid("material"),
  serialCode: "",
  materialFamily: "",
  materialAlloy: "",
  materialType: "",
  form: "",
  shapeDimensions: {},
  supplier: "",
  dateReceived: today(),
  purchaseOrder: "",
  heatNumber: "",
  lotNumber: "",
  dimensions: "",
  traceabilityLevel: "Standard material certs",
  storageLocation: "",
  status: "active",
  notes: "",
  attachments: [],
  jobs: [],
  changeLog: [],
  usageRefs: []
});

const blankKanbanCard = (defaults = {}) => ({
  id: uid("kanban"),
  itemName: "",
  internalInventoryNumber: "",
  minimumLevel: "",
  orderQuantity: "",
  storageLocation: defaults.storageLocation || "",
  department: defaults.department || "",
  category: defaults.category || "",
  photo: null,
  vendor: defaults.vendor || "",
  purchaseUrl: "",
  orderingNotes: "",
  packSize: "",
  description: "",
  active: true,
  archivedAt: "",
  createdAt: nowIso(),
  updatedAt: nowIso()
});

const blankInstrumentPayload = () => ({
  instrument: {
    instrument_id: uid("INS"),
    tool_name: "",
    tool_type: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    measuring_range: "",
    resolution: "",
    accuracy: "",
    location: "",
    owner_department: "",
    status: "In service",
    notes: "",
    date_added: today(),
    active: true,
    service_date: "",
    retired_date: ""
  },
  calibrations: []
});

const blankCalibration = () => ({
  calibration_id: uid("CAL"),
  calibration_date: today(),
  next_due_date: "",
  performed_by: "",
  calibration_vendor: "",
  standard_id: "",
  standard_name: "",
  standard_identifier: "",
  standard_description: "",
  traceability_reference: "",
  result: "",
  measurement_notes: "",
  environmental_notes: "",
  certificate_number: "",
  attachment_path: "",
  notes: ""
});

const blankTemplate = () => ({
  id: uid("template"),
  name: "New Template",
  category: "General",
  libraryNames: [],
  defaultParameters: [blankParameter()],
  defaultSteps: ["Document operation instructions."]
});

const blankMaterialFamily = () => ({
  id: uid("material-family"),
  name: "",
  alloys: [""]
});

const blankLibraryRecord = () => ({
  id: uid("library-record"),
  name: "New Record",
  active: true
});

const blankLibraryDefinition = (order = 1000) => ({
  name: uid("library").toLowerCase(),
  label: "New Library",
  order,
  records: []
});

const blankCustomer = (name = "") => ({
  id: uid("customer"),
  name,
  shippingAddress1: "",
  shippingAddress2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  contactName: "",
  email: "",
  phone: "",
  notes: "",
  active: true
});

const blankKanbanDepartment = () => ({
  id: uid("kanban-dept"),
  name: "New Department",
  color: "#2563eb",
  locations: []
});

const blankKanbanPrintSize = () => ({
  id: uid("kanban-size"),
  name: "New Size",
  widthIn: "2",
  heightIn: "4"
});

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const customerDisplayName = (customer) => customer?.name || "Unnamed Customer";

const MATERIAL_RESULT_COLUMNS = [
  { key: "serialCode", label: "Serial Code" },
  { key: "materialType", label: "Alloy" },
  { key: "materialFamily", label: "Material" },
  { key: "form", label: "Shape" },
  { key: "dimensions", label: "Dimensions" },
  { key: "supplier", label: "Supplier" },
  { key: "status", label: "Status" }
];

const MATERIAL_STATUS_FILTERS = ["Active", "Archived", "All"];
const MATERIAL_SHAPE_FIELDS = {
  "Round bar": [{ key: "diameter", label: "Diameter" }],
  "Round Tube": [{ key: "outerDiameter", label: "OD" }, { key: "wallThickness", label: "Wall" }],
  "Sheet": [{ key: "thickness", label: "Thickness" }],
  "Rectangle bar": [{ key: "width", label: "Width" }, { key: "thickness", label: "Thickness" }],
  "Rectangle Tube": [{ key: "width", label: "Width" }, { key: "height", label: "Height" }, { key: "wallThickness", label: "Wall" }],
  "Angle": [{ key: "legA", label: "Leg A" }, { key: "legB", label: "Leg B" }, { key: "thickness", label: "Thickness" }],
  Other: [{ key: "custom", label: "Shape Details" }]
};

function materialCellValue(material, key) {
  if (key === "materialType") {
    return materialDisplayType(material) || "-";
  }
  if (key === "materialFamily") {
    return material?.materialFamily || "-";
  }
  const value = material?.[key];
  return value ? String(value) : "-";
}

function materialFamilyList(preferences) {
  return Array.isArray(preferences?.materialFamilies) ? preferences.materialFamilies : [];
}

function materialFamilyOptions(preferences) {
  return materialFamilyList(preferences).map((family) => family.name).filter(Boolean);
}

function materialAlloyOptions(preferences, familyName) {
  return materialFamilyList(preferences).find((family) => family.name === familyName)?.alloys || [];
}

function kanbanDepartmentList(preferences) {
  return Array.isArray(preferences?.kanbanDepartments) ? preferences.kanbanDepartments : [];
}

function kanbanDepartmentOptions(preferences) {
  return kanbanDepartmentList(preferences).map((item) => String(item?.name || "").trim()).filter(Boolean);
}

function kanbanDepartmentColor(preferences, departmentName) {
  return kanbanDepartmentList(preferences).find((item) => String(item?.name || "") === String(departmentName || ""))?.color || "#2563eb";
}

function kanbanLocationOptions(preferences, departmentName) {
  const department = kanbanDepartmentList(preferences).find((item) => String(item?.name || "") === String(departmentName || ""));
  return Array.from(new Set((department?.locations || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function kanbanPrintSizes(preferences) {
  return Array.isArray(preferences?.kanbanPrintSizes) ? preferences.kanbanPrintSizes : [];
}

function defaultKanbanPrintSizeId(preferences) {
  const sizes = kanbanPrintSizes(preferences);
  return sizes.some((item) => item.id === preferences?.defaultKanbanPrintSizeId)
    ? preferences.defaultKanbanPrintSizeId
    : (sizes[0]?.id || "");
}

function inferMaterialClassification(materialType, preferences) {
  const normalized = String(materialType || "").trim().toLowerCase();
  if (!normalized) {
    return { materialFamily: "", materialAlloy: "" };
  }
  for (const family of materialFamilyList(preferences)) {
    if (String(family.name || "").trim().toLowerCase() === normalized) {
      return { materialFamily: family.name, materialAlloy: "" };
    }
    const alloy = (family.alloys || []).find((item) => String(item || "").trim().toLowerCase() === normalized);
    if (alloy) {
      return { materialFamily: family.name, materialAlloy: alloy };
    }
  }
  return { materialFamily: "", materialAlloy: "" };
}

function syncMaterialClassification(material, preferences) {
  const inferred = (!material?.materialFamily && !material?.materialAlloy)
    ? inferMaterialClassification(material?.materialType, preferences)
    : { materialFamily: material?.materialFamily || "", materialAlloy: material?.materialAlloy || "" };
  const materialFamily = String(inferred.materialFamily || "").trim();
  const materialAlloy = String(inferred.materialAlloy || "").trim();
  return {
    ...material,
    materialFamily,
    materialAlloy,
    materialType: materialAlloy || materialFamily || String(material?.materialType || "").trim()
  };
}

function updateMaterialRecord(material, patch, preferences) {
  return syncMaterialClassification(updateMaterialWithShape(material, patch), preferences);
}

function localFileUrl(filePath) {
  const normalized = String(filePath || "").trim().replaceAll("\\", "/");
  if (!normalized) {
    return "";
  }
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeadingSlash}`);
}

function kanbanDeepLink(cardId, workspace) {
  const prefix = workspace?.constants?.kanbanDeepLinkPrefix || "amerp://open/kanban/";
  return `${prefix}${encodeURIComponent(cardId)}`;
}

function materialDeepLink(materialId, workspace) {
  const prefix = workspace?.constants?.materialDeepLinkPrefix || "amerp://open/material/";
  return `${prefix}${encodeURIComponent(materialId)}`;
}

function kanbanPhotoSrc(card) {
  if (!card?.photo?.relativePath) {
    return "";
  }
  return api.assetUrl(card.photo.relativePath);
}

function materialLabelPhotoSrc(material) {
  const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
  const attachment = (material?.attachments || []).find((item) => {
    const filename = String(item?.storedFilename || item?.originalFilename || "").toLowerCase();
    const extension = filename.includes(".") ? filename.split(".").pop() : "";
    return item?.active !== false && item?.relativePath && imageExtensions.has(extension);
  });
  return attachment?.relativePath ? api.assetUrl(attachment.relativePath) : "";
}

function materialDisplayType(material) {
  return material?.materialAlloy || material?.materialType || material?.materialFamily || "";
}

function normalizeShapeDimensions(shapeDimensions) {
  return Object.fromEntries(
    Object.entries(shapeDimensions || {})
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value)
  );
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

function updateMaterialWithShape(material, patch) {
  const next = { ...material, ...patch };
  const shapeDimensions = normalizeShapeDimensions(next.shapeDimensions || {});
  return {
    ...next,
    shapeDimensions,
    dimensions: materialDimensionsSummary(next.form, shapeDimensions, next.dimensions || "")
  };
}

function shapeFieldsForForm(form) {
  return MATERIAL_SHAPE_FIELDS[form] || MATERIAL_SHAPE_FIELDS.Other;
}

function materialMatchesFilters(material, filters) {
  if (filters.status === "Active" && material.status === "archived") {
    return false;
  }
  if (filters.status === "Archived" && material.status !== "archived") {
    return false;
  }
  if (filters.traceabilityLevel !== "All" && material.traceabilityLevel !== filters.traceabilityLevel) {
    return false;
  }
  if (filters.form !== "All" && material.form !== filters.form) {
    return false;
  }
  if (filters.materialFamily !== "All" && material.materialFamily !== filters.materialFamily) {
    return false;
  }
  if (filters.materialAlloy !== "All" && materialDisplayType(material) !== filters.materialAlloy) {
    return false;
  }
  if (filters.supplier.trim() && !String(material.supplier || "").toLowerCase().includes(filters.supplier.trim().toLowerCase())) {
    return false;
  }
  if (!filters.query.trim()) {
    return true;
  }
  const haystack = [
    material.serialCode,
    material.materialFamily,
    material.materialAlloy,
    material.materialType,
    material.form,
    material.supplier,
    material.traceabilityLevel,
    material.purchaseOrder,
    material.heatNumber,
    material.lotNumber,
    material.dimensions,
    material.storageLocation,
    material.notes
  ].join(" ").toLowerCase();
  return haystack.includes(filters.query.trim().toLowerCase());
}

function usageRefKey(ref) {
  return [ref.jobId, ref.partId, ref.operationId].filter(Boolean).join(":");
}

function normalizeToolKey(tool) {
  if (tool?.fusionToolNumber) {
    return `fusion:${String(tool.fusionToolNumber).trim()}`;
  }
  return `name:${String(tool?.name || "").trim().toLowerCase()}`;
}

function summarizeJobTool(tool) {
  const number = tool?.fusionToolNumber ? `T${tool.fusionToolNumber}` : "";
  const name = tool?.name || tool?.description || "Tool";
  const diameter = tool?.diameter ? `Dia ${tool.diameter}` : "";
  return [number, name, diameter].filter(Boolean).join(" - ");
}

function libraryList(libraries) {
  return Object.values(libraries || {}).sort((a, b) => Number(a.order || 1000) - Number(b.order || 1000) || String(a.label || "").localeCompare(String(b.label || "")));
}

function selectedLibraryNamesForOperation(operation, templates) {
  const templateLibraryNames = (templates || [])
    .filter((template) => (operation?.setupTemplateRefs || []).includes(template.id))
    .flatMap((template) => template.libraryNames || []);
  const savedLibraryNames = Object.entries(operation?.librarySelections || {})
    .filter(([, selectedIds]) => Array.isArray(selectedIds) && selectedIds.length)
    .map(([libraryName]) => libraryName);
  return Array.from(new Set([...templateLibraryNames, ...savedLibraryNames]));
}

function summarizeOperationLibraries(operation, libraries, templates) {
  return selectedLibraryNamesForOperation(operation, templates)
    .map((libraryName) => {
      const library = libraries?.[libraryName] || null;
      const selectedIds = operation?.librarySelections?.[libraryName] || [];
      if (!selectedIds.length) {
        return "";
      }
      const recordMap = new Map((library?.records || []).map((record) => [record.id, record.name]));
      const selectedNames = selectedIds.map((recordId) => recordMap.get(recordId) || `[Missing] ${recordId}`);
      return `${library?.label || libraryName}: ${selectedNames.join(", ")}`;
    })
    .filter(Boolean);
}

function operationLibraryRows(operation, libraries, templates) {
  return selectedLibraryNamesForOperation(operation, templates)
    .map((libraryName) => {
      const library = libraries?.[libraryName] || null;
      const selectedIds = operation?.librarySelections?.[libraryName] || [];
      if (!selectedIds.length) {
        return null;
      }
      const recordMap = new Map((library?.records || []).map((record) => [record.id, record.name]));
      const selectedNames = selectedIds.map((recordId) => recordMap.get(recordId) || `[Missing] ${recordId}`);
      return {
        label: library?.label || libraryName,
        value: selectedNames.join(", ")
      };
    })
    .filter(Boolean);
}

function supportsDetailedTooling(type) {
  return ["milling", "turning"].includes(String(type || "").trim().toLowerCase());
}

function toolHeading(tool, index) {
  const toolNumber = tool?.fusionToolNumber ? `T${tool.fusionToolNumber}` : `Tool ${index + 1}`;
  const toolName = tool?.name || tool?.description || "";
  return toolName ? `${toolNumber} - ${toolName}` : toolNumber;
}

function instructionStepsFromOperation(operation) {
  if (Array.isArray(operation?.instructionSteps) && operation.instructionSteps.length) {
    return operation.instructionSteps;
  }
  const lines = String(operation?.workInstructions || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => blankInstructionStep(line));
}

function serializeInstructionSteps(steps) {
  return (steps || []).map((step) => String(step.text || "").trim()).filter(Boolean).join("\n");
}

function normalizeImportText(value) {
  return String(value || "").trim().toLowerCase();
}

function operationImportFingerprint(operation) {
  const toolSignature = (operation?.tools || [])
    .map((tool) => normalizeToolKey(tool))
    .sort()
    .join("|");
  return [
    normalizeImportText(operation?.operationCode),
    normalizeImportText(operation?.title),
    normalizeImportText(operation?.type),
    normalizeImportText(operation?.folderName),
    normalizeImportText(operation?.workInstructions),
    toolSignature
  ].join("||");
}

function dedupeImportedOperations(operations) {
  const seen = new Set();
  const deduped = [];
  for (const operation of operations || []) {
    const key = operationImportFingerprint(operation);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(operation);
  }
  return deduped;
}

function useAutoSave({
  value,
  resetKey,
  enabled = true,
  delay = 1000,
  isReady = () => true,
  save,
  onSaved,
  onError,
  onStateChange
}) {
  const timerRef = useRef(null);
  const lastSavedRef = useRef(JSON.stringify(value ?? null));
  const latestValueRef = useRef(value);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  const isReadyRef = useRef(isReady);
  const enabledRef = useRef(enabled);
  const delayRef = useRef(delay);

  latestValueRef.current = value;
  saveRef.current = save;
  onSavedRef.current = onSaved;
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;
  isReadyRef.current = isReady;
  enabledRef.current = enabled;
  delayRef.current = delay;

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const serialize = (input) => JSON.stringify(input ?? null);

  const runSave = async () => {
    clearTimer();
    const currentValue = latestValueRef.current;
    if (!enabledRef.current || !currentValue || !isReadyRef.current(currentValue)) {
      return;
    }
    const currentHash = serialize(currentValue);
    if (currentHash === lastSavedRef.current || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    onStateChangeRef.current?.("saving");
    const generation = generationRef.current;
    try {
      const savedValue = await saveRef.current(currentValue);
      if (generation !== generationRef.current) {
        return;
      }
      const savedHash = serialize(savedValue ?? currentValue);
      lastSavedRef.current = savedHash;
      latestValueRef.current = savedValue ?? currentValue;
      await onSavedRef.current?.(savedValue ?? currentValue);
      onStateChangeRef.current?.("saved");
    } catch (error) {
      if (generation === generationRef.current) {
        onStateChangeRef.current?.("error");
        onErrorRef.current?.(error);
      }
    } finally {
      inFlightRef.current = false;
      const latestValue = latestValueRef.current;
      if (!enabledRef.current || generation !== generationRef.current || !latestValue || !isReadyRef.current(latestValue)) {
        return;
      }
      if (serialize(latestValue) !== lastSavedRef.current) {
        timerRef.current = window.setTimeout(() => {
          void runSave();
        }, delayRef.current);
      }
    }
  };

  useEffect(() => {
    generationRef.current += 1;
    clearTimer();
    latestValueRef.current = value;
    lastSavedRef.current = serialize(value ?? null);
  }, [resetKey]);

  useEffect(() => {
    latestValueRef.current = value;
    if (!enabled || !value || !isReady(value)) {
      clearTimer();
      return;
    }
    const currentHash = serialize(value);
    if (currentHash === lastSavedRef.current) {
      clearTimer();
      return;
    }
    clearTimer();
    onStateChangeRef.current?.("saving");
    timerRef.current = window.setTimeout(() => {
      void runSave();
    }, delay);
    return clearTimer;
  }, [delay, enabled, resetKey, value]);

  useEffect(() => () => {
    if (timerRef.current && enabledRef.current && latestValueRef.current && isReadyRef.current(latestValueRef.current) && serialize(latestValueRef.current) !== lastSavedRef.current) {
      void runSave();
    }
    clearTimer();
  }, []);
}

function App() {
  const route = window.location.hash.replace(/^#/, "") || "/";
  if (!api) {
    return <Fatal title="AMERP" message="Run the app inside Electron so the secure local file APIs are available." />;
  }
  if (route.startsWith("/print/kanban/")) {
    const [pathPart, queryPart = ""] = route.replace("/print/kanban/", "").split("?");
    const cardId = decodeURIComponent(pathPart);
    const params = new URLSearchParams(queryPart);
    return <PrintKanbanCard cardId={cardId} sizeId={params.get("size") || ""} monochrome={params.get("bw") === "1"} />;
  }
  if (route.startsWith("/print/material/")) {
    const [pathPart, queryPart = ""] = route.replace("/print/material/", "").split("?");
    const materialId = decodeURIComponent(pathPart);
    const params = new URLSearchParams(queryPart);
    return <PrintMaterialLabel materialId={materialId} sizeId={params.get("size") || ""} monochrome={params.get("bw") === "1"} />;
  }
  if (route.startsWith("/print/")) {
    const jobId = decodeURIComponent(route.replace("/print/", "").split("?")[0]);
    return <TravelerPrintPacket jobId={jobId} />;
  }
  return (
    <RenderBoundary>
      <Workspace />
    </RenderBoundary>
  );
}

class RenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("AMERP render error", error, info);
  }

  render() {
    if (this.state.error) {
      return <Fatal title="AMERP Error" message={this.state.error.message || String(this.state.error)} />;
    }
    return this.props.children;
  }
}

function Workspace() {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState("jobs");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [startupError, setStartupError] = useState("");
  const [confirmDeleteJobOpen, setConfirmDeleteJobOpen] = useState(false);
  const [confirmDeleteKanbanOpen, setConfirmDeleteKanbanOpen] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const fusionImportInFlight = useRef(false);
  const refreshWorkspaceRef = useRef(null);
  const openKanbanCardRef = useRef(null);
  const openMaterialRef = useRef(null);

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [jobScreen, setJobScreen] = useState("list");
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [selectedOperationId, setSelectedOperationId] = useState(null);

  const [selectedKanbanId, setSelectedKanbanId] = useState(null);
  const [kanbanCard, setKanbanCard] = useState(null);
  const [kanbanScreen, setKanbanScreen] = useState("list");
  const [kanbanAiState, setKanbanAiState] = useState("idle");
  const [kanbanPrintDialogOpen, setKanbanPrintDialogOpen] = useState(false);
  const [selectedKanbanPrintSizeId, setSelectedKanbanPrintSizeId] = useState("");
  const [selectedKanbanPrintMonochrome, setSelectedKanbanPrintMonochrome] = useState(false);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [material, setMaterial] = useState(null);
  const [materialScreen, setMaterialScreen] = useState("list");
  const [materialPrintDialogOpen, setMaterialPrintDialogOpen] = useState(false);
  const [selectedMaterialPrintSizeId, setSelectedMaterialPrintSizeId] = useState("");
  const [selectedMaterialPrintMonochrome, setSelectedMaterialPrintMonochrome] = useState(false);

  const [selectedInstrumentId, setSelectedInstrumentId] = useState(null);
  const [instrumentPayload, setInstrumentPayload] = useState(null);
  const [metrologyScreen, setMetrologyScreen] = useState("list");

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [lastIndexMaintenance, setLastIndexMaintenance] = useState(0);
  const enabledModules = normalizeEnabledModules(workspace?.preferences?.enabledModules);
  const moduleIsEnabled = (moduleId) => moduleId === "settings" || enabledModules[moduleId] !== false;
  const firstAvailableView = firstEnabledModuleId(enabledModules);

  const showStatus = (message) => {
    setStatus(message);
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => setStatus(""), 5000);
  };

  const refreshWorkspace = async (preserveSelection = true) => {
    setBusy(true);
    try {
      const loaded = await api.loadWorkspace();
      const next = {
        ...loaded,
        materials: (loaded.materials || []).map((item) => syncMaterialClassification(item, loaded.preferences))
      };
      setWorkspace(next);
      setStartupError("");
      if (!preserveSelection) {
        setSelectedJobId(null);
        setJob(null);
        setJobScreen("list");
        setSelectedPartId(null);
        setSelectedOperationId(null);
        setSelectedKanbanId(null);
        setKanbanCard(null);
        setKanbanScreen("list");
        setKanbanAiState("idle");
        setSelectedMaterialId(null);
        setMaterial(null);
        setMaterialScreen("list");
        setSelectedInstrumentId(null);
        setInstrumentPayload(null);
        setMetrologyScreen("list");
      }
      setMaterial((current) => current ? syncMaterialClassification(current, next.preferences) : current);
      if (!selectedTemplateId && next.templates?.[0]) {
        setSelectedTemplateId(next.templates[0].id);
      }
    } catch (error) {
      setStartupError(error.message || String(error));
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  refreshWorkspaceRef.current = refreshWorkspace;

  useEffect(() => {
    refreshWorkspace(false);
    const release = () => {
      api.releaseAllLocks().catch(() => {});
    };
    const handleFocus = () => {
      refreshWorkspaceRef.current?.();
    };
    window.addEventListener("beforeunload", release);
    window.addEventListener("focus", handleFocus);
    return () => {
      release();
      window.removeEventListener("beforeunload", release);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

useEffect(() => api.onDeepLink?.((payload) => {
    if (payload?.entity === "kanban" && payload.id) {
      openKanbanCardRef.current?.(payload.id);
      return;
    }
    if (payload?.entity === "material" && payload.id) {
      openMaterialRef.current?.(payload.id);
    }
  }), []);

  useEffect(() => {
    if (!workspace) return;
    const runIndexMaintenance = async () => {
      try {
        await api.rebuildIndex();
        setLastIndexMaintenance(Date.now());
      } catch {
      }
    };
    if (!lastIndexMaintenance) {
      runIndexMaintenance();
    }
    const timer = window.setInterval(runIndexMaintenance, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [workspace?.dataFolder]);

  useEffect(() => {
    document.title = String(workspace?.preferences?.windowTitle || workspace?.preferences?.appTitle || "AMERP");
  }, [workspace?.preferences?.windowTitle, workspace?.preferences?.appTitle]);

  useEffect(() => {
    if (!workspace || moduleIsEnabled(view)) {
      return;
    }
    setView(firstAvailableView);
  }, [workspace?.preferences?.enabledModules, view]);

  useEffect(() => {
    if ((view === "jobs" && jobScreen === "list")
      || (view === "kanban" && kanbanScreen === "list")
      || (view === "materials" && materialScreen === "list")
      || (view === "metrology" && metrologyScreen === "list")
      || view === "settings") {
      setSaveState("saved");
    }
  }, [view, jobScreen, kanbanScreen, materialScreen, metrologyScreen]);

  useEffect(() => {
    const activeLocks = [];
    if (selectedJobId && jobScreen !== "list") {
      activeLocks.push({ kind: "job", id: selectedJobId });
    }
    if (selectedKanbanId && kanbanScreen === "detail") {
      activeLocks.push({ kind: "kanban", id: selectedKanbanId });
    }
    if (selectedMaterialId && materialScreen === "detail") {
      activeLocks.push({ kind: "material", id: selectedMaterialId });
    }
    if (selectedInstrumentId && metrologyScreen === "detail") {
      activeLocks.push({ kind: "instrument", id: selectedInstrumentId });
    }
    if (!activeLocks.length) {
      return undefined;
    }
    const renewLocks = () => {
      activeLocks.forEach(({ kind, id }) => {
        api.acquireLock(kind, id, "").catch(() => {});
      });
    };
    renewLocks();
    const timer = window.setInterval(renewLocks, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [selectedJobId, jobScreen, selectedKanbanId, kanbanScreen, selectedMaterialId, materialScreen, selectedInstrumentId, metrologyScreen]);

  const openJob = async (jobId) => {
    setBusy(true);
    try {
      if (selectedJobId && selectedJobId !== jobId) {
        await api.releaseLock("job", selectedJobId);
      }
      const loaded = await api.loadJob(jobId, { acquireLock: true });
      setSelectedJobId(jobId);
      setJob(loaded);
      setSelectedPartId(null);
      setSelectedOperationId(null);
      setJobScreen("job");
      setView("jobs");
      setSaveState("saved");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openKanbanCard = async (cardId) => {
    setBusy(true);
    try {
      if (selectedKanbanId && selectedKanbanId !== cardId) {
        await api.releaseLock("kanban", selectedKanbanId);
      }
      const loaded = await api.loadKanbanCard(cardId, { acquireLock: true });
      setSelectedKanbanId(cardId);
    setKanbanCard(loaded);
    setKanbanScreen("detail");
    setKanbanAiState("idle");
    setView("kanban");
      setSaveState("saved");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };
  openKanbanCardRef.current = openKanbanCard;

  const openMaterial = async (materialId) => {
    setBusy(true);
    try {
      if (selectedMaterialId && selectedMaterialId !== materialId) {
        await api.releaseLock("material", selectedMaterialId);
      }
      const loaded = await api.loadMaterial(materialId, { acquireLock: true });
      setSelectedMaterialId(materialId);
      setMaterial(syncMaterialClassification(loaded, workspace?.preferences));
      setMaterialScreen("detail");
      setView("materials");
      setSaveState("saved");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };
  openMaterialRef.current = openMaterial;

  const openInstrument = async (instrumentId) => {
    setBusy(true);
    try {
      if (selectedInstrumentId && selectedInstrumentId !== instrumentId) {
        await api.releaseLock("instrument", selectedInstrumentId);
      }
      const loaded = await api.loadInstrument(instrumentId, { acquireLock: true });
      setSelectedInstrumentId(instrumentId);
      setInstrumentPayload(loaded);
      setMetrologyScreen("detail");
      setView("metrology");
      setSaveState("saved");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const createNewJob = () => {
    if (selectedJobId) api.releaseLock("job", selectedJobId).catch(() => {});
    setSelectedJobId(null);
    setJob(blankJob());
    setSelectedPartId(null);
    setSelectedOperationId(null);
    setJobScreen("job");
    setView("jobs");
    setSaveState("saved");
  };

  const createNewKanbanCard = (draft = null) => {
    if (selectedKanbanId) api.releaseLock("kanban", selectedKanbanId).catch(() => {});
    setSelectedKanbanId(null);
    setKanbanCard(draft || blankKanbanCard());
    setKanbanScreen("detail");
    setKanbanAiState("idle");
    setView("kanban");
    setSaveState("saved");
  };

  const showJobList = () => {
    if (selectedJobId) {
      api.releaseLock("job", selectedJobId).catch(() => {});
    }
    setSelectedJobId(null);
    setJob(null);
    setView("jobs");
    setJobScreen("list");
    setSelectedPartId(null);
    setSelectedOperationId(null);
    setSaveState("saved");
  };

  const showKanbanList = () => {
    if (selectedKanbanId) {
      api.releaseLock("kanban", selectedKanbanId).catch(() => {});
    }
    setSelectedKanbanId(null);
    setKanbanCard(null);
    setView("kanban");
    setKanbanScreen("list");
    setKanbanAiState("idle");
    setSaveState("saved");
  };

  const openPart = (partId) => {
    setSelectedPartId(partId);
    setSelectedOperationId(null);
    setJobScreen("part");
    setSaveState("saved");
  };

  const openOperation = (partId, operationId) => {
    setSelectedPartId(partId);
    setSelectedOperationId(operationId);
    setJobScreen("operation");
    setSaveState("saved");
  };

  const backToJob = () => {
    setSelectedPartId(null);
    setSelectedOperationId(null);
    setJobScreen("job");
    setSaveState("saved");
  };

  const backToPart = () => {
    setSelectedOperationId(null);
    setJobScreen("part");
    setSaveState("saved");
  };

  const importFusionIntoPart = async (partId) => {
    if (!job || fusionImportInFlight.current) return;
    fusionImportInFlight.current = true;
    setBusy(true);
    try {
      const imported = await api.createJobFromFusion();
      if (!imported) return;
      const importedOperations = dedupeImportedOperations((imported.parts || []).flatMap((part) => part.operations || []));
      const importedTools = imported.tools || [];
      if (!importedOperations.length) {
        showStatus("No operations found in the Fusion import.");
        return;
      }
      updateJobPartOperations(partId, importedOperations, importedTools);
      showStatus(`Imported ${importedOperations.length} operation${importedOperations.length === 1 ? "" : "s"} from Fusion.`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      fusionImportInFlight.current = false;
      setBusy(false);
    }
  };

  const importXometryIntoJob = async () => {
    if (!job) {
      return;
    }
    setBusy(true);
    try {
      const savedJob = await api.saveJob(job);
      await applySavedJob(savedJob);
      const imported = await api.importXometryTravelers(savedJob.id);
      if (!imported) return;
      const importedParts = imported.parts || [];
      if (!importedParts.length) {
        const firstError = imported.errors?.[0]?.message;
        showStatus(firstError || "No Xometry travelers were imported.");
        return;
      }
      setJob((current) => current ? ({
        ...current,
        jobNumber: current.jobNumber || imported.suggestedJobNumber || "",
        customerId: current.customerId || ((workspace?.customers || []).find((customer) => customer.name === (imported.suggestedCustomerName || ""))?.id || ""),
        customer: current.customer || imported.suggestedCustomerName || "",
        parts: [...current.parts, ...importedParts]
      }) : current);
      setSelectedPartId(importedParts[0].id);
      setSelectedOperationId(null);
      setJobScreen("part");
      const messageParts = [`Imported ${importedParts.length} Xometry traveler part${importedParts.length === 1 ? "" : "s"}.`];
      if (imported.warnings?.length) {
        const warningLines = [...new Set(imported.warnings.map((warning) => warning.message).filter(Boolean))];
        messageParts.push(`Warnings:\n- ${warningLines.join("\n- ")}`);
      }
      if (imported.errors?.length) {
        const errorLines = [...new Set(imported.errors.map((item) => item.message).filter(Boolean))];
        messageParts.push(`Skipped:\n- ${errorLines.join("\n- ")}`);
      }
      showStatus(messageParts.join("\n"));
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const importSubtractPurchaseOrders = async () => {
    setBusy(true);
    try {
      const imported = await api.importSubtractPurchaseOrders();
      if (!imported) return;
      const importedJobs = imported.jobs || [];
      if (!importedJobs.length) {
        const firstError = imported.errors?.[0]?.message;
        showStatus(firstError || "No Subtract purchase orders were imported.");
        await refreshWorkspace();
        return;
      }
      await refreshWorkspace();
      await openJob(importedJobs[0].id);
      const messageParts = [`Imported ${importedJobs.length} Subtract purchase order job${importedJobs.length === 1 ? "" : "s"}.`];
      if (imported.warnings?.length) {
        const warningLines = [...new Set(imported.warnings.map((warning) => warning.message).filter(Boolean))];
        messageParts.push(`Warnings:\n- ${warningLines.join("\n- ")}`);
      }
      if (imported.errors?.length) {
        const errorLines = [...new Set(imported.errors.map((item) => item.message).filter(Boolean))];
        messageParts.push(`Skipped:\n- ${errorLines.join("\n- ")}`);
      }
      showStatus(messageParts.join("\n"));
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const importXometryPurchaseOrders = async () => {
    setBusy(true);
    try {
      const imported = await api.importXometryPurchaseOrders();
      if (!imported) return;
      const importedJobs = imported.jobs || [];
      if (!importedJobs.length) {
        const firstError = imported.errors?.[0]?.message;
        showStatus(firstError || "No Xometry purchase orders were imported.");
        await refreshWorkspace();
        return;
      }
      await refreshWorkspace();
      await openJob(importedJobs[0].id);
      const messageParts = [`Imported ${importedJobs.length} Xometry purchase order job${importedJobs.length === 1 ? "" : "s"}.`];
      if (imported.warnings?.length) {
        const warningLines = [...new Set(imported.warnings.map((warning) => warning.message).filter(Boolean))];
        messageParts.push(`Warnings:\n- ${warningLines.join("\n- ")}`);
      }
      if (imported.errors?.length) {
        const errorLines = [...new Set(imported.errors.map((item) => item.message).filter(Boolean))];
        messageParts.push(`Skipped:\n- ${errorLines.join("\n- ")}`);
      }
      showStatus(messageParts.join("\n"));
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateJobPartOperations = (partId, importedOperations, importedTools = []) => {
    setJob((current) => ({
      ...current,
      parts: current.parts.map((part) => {
        if (part.id !== partId) {
          return part;
        }
        const start = part.operations.length;
        const appended = importedOperations.map((operation, index) => {
          const sequence = start + index + 1;
          return {
            ...blankOperation(sequence),
            ...operation,
            id: uid("operation"),
            sequence,
            folderName: `${String(sequence).padStart(3, "0")}-${(operation.folderName || operation.title || "operation").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "operation"}`,
            operationCode: operation.operationCode || `OP${String(sequence).padStart(3, "0")}`,
            parameters: (operation.parameters || []).map((parameter) => ({ ...blankParameter(), ...parameter, id: uid("parameter") })),
            instructionSteps: Array.isArray(operation.instructionSteps)
              ? operation.instructionSteps.map((step) => ({
                id: step.id || uid("step"),
                text: step.text || "",
                images: Array.isArray(step.images) ? step.images : []
              }))
              : [],
            stepImages: [],
            tools: ((operation.tools && operation.tools.length) ? operation.tools : importedTools).map((tool) => ({ ...blankOperationTool(), ...tool, id: uid("tool") })),
            setupTemplateRefs: [...(operation.setupTemplateRefs || [])],
            jobToolRefs: [],
            requiredMaterialLots: [...(operation.requiredMaterialLots || [])],
            requiredInstruments: [...(operation.requiredInstruments || [])],
            customMaterialText: operation.customMaterialText || "",
            inspectionPlan: {
              feature: "",
              method: "",
              sampleSize: "",
              frequency: "",
              resultPlaceholderRefs: [],
              ...(operation.inspectionPlan || {})
            }
          };
        });
        return { ...part, operations: [...part.operations, ...appended] };
      })
    }));
  };

  const addJobDocuments = async () => {
    if (!job?.id) {
      showStatus("Open or create a job before adding documents.");
      return;
    }
    setBusy(true);
    try {
      const documents = await api.chooseJobDocuments(job.id);
      if (!documents.length) {
        return;
      }
      setJob((current) => ({
        ...current,
        documents: [...(current.documents || []), ...documents]
      }));
      showStatus(`Added ${documents.length} job attachment${documents.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const addPartDocuments = async (partId) => {
    if (!job?.id) {
      showStatus("Save the job header before adding part documents.");
      return;
    }
    setBusy(true);
    try {
      const documents = await api.choosePartDocuments(job.id, partId);
      if (!documents.length) {
        return;
      }
      setJob((current) => ({
        ...current,
        parts: current.parts.map((part) => part.id === partId
          ? { ...part, documents: [...(part.documents || []), ...documents] }
          : part)
      }));
      showStatus(`Added ${documents.length} part attachment${documents.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openJobDocument = async (jobId, documentId) => {
    try {
      await api.openJobDocument(jobId, documentId);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const openPartDocument = async (jobId, partId, documentId) => {
    try {
      await api.openPartDocument(jobId, partId, documentId);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const openJobDocumentRevision = async (jobId, documentId, revisionIndex) => {
    try {
      await api.openJobDocumentRevision(jobId, documentId, revisionIndex);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const openPartDocumentRevision = async (jobId, partId, documentId, revisionIndex) => {
    try {
      await api.openPartDocumentRevision(jobId, partId, documentId, revisionIndex);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const archiveJobDocument = async (documentId) => {
    if (!job?.id || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.archiveJobDocument(job.id, documentId);
      await applySavedJob(saved);
      showStatus("Job attachment archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const archivePartDocument = async (partId, documentId) => {
    if (!job?.id || !partId || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.archivePartDocument(job.id, partId, documentId);
      await applySavedJob(saved);
      showStatus("Part attachment archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const unarchiveJobDocument = async (documentId) => {
    if (!job?.id || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.unarchiveJobDocument(job.id, documentId);
      await applySavedJob(saved);
      showStatus("Job attachment unarchived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const unarchivePartDocument = async (partId, documentId) => {
    if (!job?.id || !partId || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.unarchivePartDocument(job.id, partId, documentId);
      await applySavedJob(saved);
      showStatus("Part attachment unarchived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const reviseJobDocument = async (documentId) => {
    if (!job?.id || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.reviseJobDocument(job.id, documentId);
      if (!saved) return;
      await applySavedJob(saved);
      showStatus("Job attachment revised.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const revisePartDocument = async (partId, documentId) => {
    if (!job?.id || !partId || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.revisePartDocument(job.id, partId, documentId);
      if (!saved) return;
      await applySavedJob(saved);
      showStatus("Part attachment revised.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteJobDocument = async (documentId) => {
    if (!job?.id || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.deleteJobDocument(job.id, documentId);
      await applySavedJob(saved);
      showStatus("Archived job attachment deleted.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const deletePartDocument = async (partId, documentId) => {
    if (!job?.id || !partId || !documentId) return;
    setBusy(true);
    try {
      const saved = await api.deletePartDocument(job.id, partId, documentId);
      await applySavedJob(saved);
      showStatus("Archived part attachment deleted.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const assignNextJobNumber = async () => {
    try {
      const next = await api.generateNextJobNumber();
      if (!next) {
        return;
      }
      setJob((current) => current ? { ...current, jobNumber: next } : current);
      showStatus(`Assigned job number ${next}.`);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const assignNextKanbanInventoryNumber = async () => {
    try {
      const next = await api.generateNextKanbanInventoryNumber();
      if (!next) {
        return;
      }
      setKanbanCard((current) => current ? { ...current, internalInventoryNumber: next } : current);
      showStatus(`Assigned inventory number ${next}.`);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const applySavedJob = async (saved) => {
    setJob(saved);
    setSelectedJobId(saved.id);
    setSelectedPartId((current) => saved.parts.some((part) => part.id === current) ? current : null);
    setSelectedOperationId((current) => saved.parts.some((part) => part.operations.some((operation) => operation.id === current)) ? current : null);
    await refreshWorkspace();
  };

  const applySavedKanbanCard = async (saved) => {
    setKanbanCard(saved);
    setSelectedKanbanId(saved.id);
    await refreshWorkspace();
  };

  const generateCurrentKanbanImage = async () => {
    if (!kanbanCard) return;
    setKanbanAiState("imaging");
    setBusy(true);
    try {
      const updated = await api.generateKanbanImage(kanbanCard);
      if (updated) {
        setKanbanCard(updated);
        showStatus("AI product image generated.");
      }
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setKanbanAiState("idle");
      setBusy(false);
    }
  };

  const exportCurrentJobPdf = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const saved = await api.saveJob(job);
      await applySavedJob(saved);
      await api.exportJobPdf(saved.id);
      showStatus("Traveler PDF created.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const exportCurrentKanbanPdf = async () => {
    if (!kanbanCard) return;
    setBusy(true);
    try {
      const saved = await api.saveKanbanCard(kanbanCard);
      await applySavedKanbanCard(saved);
      await api.exportKanbanPdf(
        saved.id,
        undefined,
        selectedKanbanPrintSizeId || defaultKanbanPrintSizeId(workspace?.preferences),
        { monochrome: selectedKanbanPrintMonochrome }
      );
      showStatus("Kanban card PDF created.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const exportCurrentMaterialPdf = async () => {
    if (!material) return;
    setBusy(true);
    try {
      const saved = await api.saveMaterial(material);
      await applySavedMaterial(saved);
      await api.exportMaterialPdf(
        saved.id,
        undefined,
        selectedMaterialPrintSizeId || defaultKanbanPrintSizeId(workspace?.preferences),
        { monochrome: selectedMaterialPrintMonochrome }
      );
      showStatus("Material label PDF created.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openKanbanPrintDialog = () => {
    if (!kanbanCard || busy) {
      return;
    }
    setSelectedKanbanPrintSizeId(defaultKanbanPrintSizeId(workspace?.preferences));
    setSelectedKanbanPrintMonochrome(false);
    setKanbanPrintDialogOpen(true);
  };

  const openMaterialPrintDialog = () => {
    if (!material || busy) {
      return;
    }
    setSelectedMaterialPrintSizeId(defaultKanbanPrintSizeId(workspace?.preferences));
    setSelectedMaterialPrintMonochrome(false);
    setMaterialPrintDialogOpen(true);
  };

  const archiveCurrentJob = async () => {
    if (!selectedJobId) return;
    setBusy(true);
    try {
      const saved = await api.archiveJob(selectedJobId);
      setJob(saved);
      await refreshWorkspace();
      showStatus("Job archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const archiveCurrentKanbanCard = async () => {
    if (!selectedKanbanId) return;
    setBusy(true);
    try {
      const saved = await api.archiveKanbanCard(selectedKanbanId);
      setKanbanCard(saved);
      await refreshWorkspace();
      showStatus("Kanban card archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const unarchiveCurrentKanbanCard = async () => {
    if (!selectedKanbanId) return;
    setBusy(true);
    try {
      const saved = await api.unarchiveKanbanCard(selectedKanbanId);
      setKanbanCard(saved);
      await refreshWorkspace();
      showStatus("Kanban card unarchived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentKanbanCard = async () => {
    if (!selectedKanbanId) return;
    setBusy(true);
    try {
      await api.deleteKanbanCard(selectedKanbanId);
      await api.releaseLock("kanban", selectedKanbanId).catch(() => {});
      setSelectedKanbanId(null);
      setKanbanCard(null);
      setKanbanScreen("list");
      setKanbanAiState("idle");
      setView("kanban");
      await refreshWorkspace();
      showStatus("Archived Kanban card deleted.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openDeleteKanbanConfirm = () => {
    if (!selectedKanbanId || busy) {
      return;
    }
    setConfirmDeleteKanbanOpen(true);
  };

  const unarchiveCurrentJob = async () => {
    if (!selectedJobId) return;
    setBusy(true);
    try {
      const saved = await api.unarchiveJob(selectedJobId);
      setJob(saved);
      await refreshWorkspace();
      showStatus("Job unarchived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentJob = async () => {
    if (!selectedJobId) return;
    setBusy(true);
    try {
      await api.deleteJob(selectedJobId);
      await api.releaseLock("job", selectedJobId).catch(() => {});
      setSelectedJobId(null);
      setJob(null);
      setSelectedPartId(null);
      setSelectedOperationId(null);
      setJobScreen("list");
      setView("jobs");
      await refreshWorkspace();
      showStatus("Archived job deleted.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openDeleteJobConfirm = () => {
    if (!selectedJobId || busy) {
      return;
    }
    setConfirmDeleteJobOpen(true);
  };

  const createNewMaterial = async () => {
    if (selectedMaterialId) api.releaseLock("material", selectedMaterialId).catch(() => {});
    const serial = await api.generateMaterialSerial().catch(() => "");
    setSelectedMaterialId(null);
    setMaterial(syncMaterialClassification(
      updateMaterialWithShape({ ...blankMaterial(), serialCode: serial }, { form: workspace?.constants?.material?.forms?.[0] || "" }),
      workspace?.preferences
    ));
    setMaterialScreen("detail");
    setView("materials");
    setSaveState("saved");
  };

  const applySavedMaterial = async (saved) => {
    setMaterial(syncMaterialClassification(saved, workspace?.preferences));
    setSelectedMaterialId(saved.id);
    await refreshWorkspace();
  };

  const addMaterialAttachments = async () => {
    if (!selectedMaterialId) {
      showStatus("Wait for the material to autosave before adding attachments.");
      return;
    }
    setBusy(true);
    try {
      const attachments = await api.chooseMaterialAttachments(material.id);
      setMaterial((current) => ({
        ...current,
        attachments: [...(current.attachments || []), ...attachments]
      }));
      showStatus(`Added ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openMaterialAttachment = async (attachmentId) => {
    if (!material?.id || !attachmentId) return;
    try {
      await api.openMaterialAttachment(material.id, attachmentId);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const openMaterialAttachmentRevision = async (attachmentId, revisionIndex) => {
    if (!material?.id || !attachmentId) return;
    try {
      await api.openMaterialAttachmentRevision(material.id, attachmentId, revisionIndex);
    } catch (error) {
      showStatus(error.message || String(error));
    }
  };

  const archiveMaterialAttachment = async (attachmentId) => {
    if (!material?.id || !attachmentId) return;
    setBusy(true);
    try {
      const saved = await api.archiveMaterialAttachment(material.id, attachmentId);
      await applySavedMaterial(saved);
      showStatus("Material attachment archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const unarchiveMaterialAttachment = async (attachmentId) => {
    if (!material?.id || !attachmentId) return;
    setBusy(true);
    try {
      const saved = await api.unarchiveMaterialAttachment(material.id, attachmentId);
      await applySavedMaterial(saved);
      showStatus("Material attachment unarchived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const reviseMaterialAttachment = async (attachmentId) => {
    if (!material?.id || !attachmentId) return;
    setBusy(true);
    try {
      const saved = await api.reviseMaterialAttachment(material.id, attachmentId);
      if (!saved) return;
      await applySavedMaterial(saved);
      showStatus("Material attachment revised.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteMaterialAttachment = async (attachmentId) => {
    if (!material?.id || !attachmentId) return;
    setBusy(true);
    try {
      const saved = await api.deleteMaterialAttachment(material.id, attachmentId);
      await applySavedMaterial(saved);
      showStatus("Archived material attachment deleted.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const archiveCurrentMaterial = async () => {
    if (!selectedMaterialId) return;
    setBusy(true);
    try {
      const saved = await api.archiveMaterial(selectedMaterialId);
      setMaterial(syncMaterialClassification(saved, workspace?.preferences));
      await refreshWorkspace();
      showStatus("Material archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const createNewInstrument = () => {
    if (selectedInstrumentId) api.releaseLock("instrument", selectedInstrumentId).catch(() => {});
    setSelectedInstrumentId(null);
    const draft = blankInstrumentPayload();
    draft.instrument.tool_type = workspace?.preferences?.metrologyToolTypes?.[0] || "";
    draft.instrument.manufacturer = workspace?.preferences?.metrologyManufacturers?.[0] || "";
    draft.instrument.resolution = workspace?.preferences?.metrologyResolutions?.[0] || "";
    draft.instrument.location = workspace?.preferences?.metrologyLocations?.[0] || "";
    draft.instrument.owner_department = workspace?.preferences?.metrologyDepartments?.[0] || "";
    draft.instrument.status = workspace?.preferences?.metrologyStatuses?.[0] || draft.instrument.status;
    setInstrumentPayload(draft);
    setMetrologyScreen("detail");
    setView("metrology");
    setSaveState("saved");
  };

  const applySavedInstrument = async (saved) => {
    setInstrumentPayload(saved);
    setSelectedInstrumentId(saved.instrument.instrument_id);
    await refreshWorkspace();
  };

  const archiveCurrentInstrument = async () => {
    if (!selectedInstrumentId) return;
    setBusy(true);
    try {
      const saved = await api.archiveInstrument(selectedInstrumentId);
      setInstrumentPayload(saved);
      await refreshWorkspace();
      showStatus("Instrument archived.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (type) => {
    setBusy(true);
    try {
      const result = type === "setup"
        ? await api.importLegacySetup()
        : type === "materials"
          ? await api.importLegacyMaterials()
          : await api.importLegacyMetrology();
      if (!result) return;
      await refreshWorkspace();
      const importedCount = result.importedCount ?? result.count ?? result.records ?? null;
      const label = type === "setup" ? "setup records" : type === "materials" ? "material records" : "gages";
      showStatus(importedCount ? `Imported ${importedCount} ${label}.` : "Import complete.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const createInlineMaterial = async (draft) => {
    const saved = await api.saveMaterial(draft);
    await refreshWorkspace();
    return saved;
  };

  const showMaterialsList = () => {
    if (selectedMaterialId) {
      api.releaseLock("material", selectedMaterialId).catch(() => {});
    }
    setSelectedMaterialId(null);
    setMaterial(null);
    setView("materials");
    setMaterialScreen("list");
    setSaveState("saved");
  };

  const showMetrologyList = () => {
    if (selectedInstrumentId) {
      api.releaseLock("instrument", selectedInstrumentId).catch(() => {});
    }
    setSelectedInstrumentId(null);
    setInstrumentPayload(null);
    setView("metrology");
    setMetrologyScreen("list");
    setSaveState("saved");
  };

  const importKanbanFromUrl = async (url) => {
    setKanbanAiState("filling");
    setBusy(true);
    try {
      const imported = await api.importKanbanFromUrl(url);
      if (!imported?.card) {
        return;
      }
      createNewKanbanCard(imported.card);
      if (imported.warnings?.length) {
        showStatus(`Imported product draft with warnings:\n- ${[...new Set(imported.warnings)].join("\n- ")}`);
      } else {
        showStatus("Imported product details from URL.");
      }
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setKanbanAiState("idle");
      setBusy(false);
    }
  };

  const refreshCurrentKanbanFromUrl = async () => {
    if (!kanbanCard?.purchaseUrl) {
      showStatus("Enter a purchase URL before refreshing from URL.");
      return;
    }
    setKanbanAiState("filling");
    setBusy(true);
    try {
      const imported = await api.importKanbanFromUrl(kanbanCard.purchaseUrl);
      if (!imported?.card) {
        return;
      }
      setKanbanCard((current) => {
        if (!current) {
          return current;
        }
        const next = imported.card;
        return {
          ...current,
          itemName: next.itemName || current.itemName,
          minimumLevel: next.minimumLevel || current.minimumLevel,
          orderQuantity: next.orderQuantity || current.orderQuantity,
          category: next.category || current.category,
          photo: next.photo || current.photo,
          vendor: next.vendor || current.vendor,
          purchaseUrl: next.purchaseUrl || current.purchaseUrl,
          orderingNotes: next.orderingNotes || current.orderingNotes,
          packSize: next.packSize || current.packSize,
          description: next.description || current.description
        };
      });
      if (imported.warnings?.length) {
        showStatus(`Refreshed product details with warnings:\n- ${[...new Set(imported.warnings)].join("\n- ")}`);
      } else {
        showStatus("Refreshed product details from URL.");
      }
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setKanbanAiState("idle");
      setBusy(false);
    }
  };

  const chooseKanbanPhoto = async () => {
    if (!kanbanCard?.id) {
      return;
    }
    setBusy(true);
    try {
      const photo = await api.chooseKanbanPhoto(kanbanCard.id);
      if (!photo) {
        return;
      }
      setKanbanCard((current) => current ? { ...current, photo } : current);
      showStatus("Kanban photo selected.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveCustomer = async (customer) => {
    const saved = await api.saveCustomer(customer);
    await refreshWorkspace();
    return saved;
  };

  const savePreferences = async (preferences, { silent = false } = {}) => {
    setBusy(true);
    try {
      await api.savePreferences(preferences);
      await refreshWorkspace();
      if (!silent) {
        showStatus("Settings saved.");
      }
    } catch (error) {
      showStatus(error.message || String(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const addMaterialFamilyOption = async (name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw new Error("Enter a material name.");
    }
    const existing = workspace?.preferences?.materialFamilies || [];
    if (existing.some((family) => String(family.name || "").toLowerCase() === trimmed.toLowerCase())) {
      return trimmed;
    }
    await savePreferences({
      materialFamilies: [...existing, { id: uid("material-family"), name: trimmed, alloys: [] }]
    }, { silent: true });
    return trimmed;
  };

  const addMaterialAlloyOption = async (familyName, alloyName) => {
    const nextFamily = String(familyName || "").trim();
    const nextAlloy = String(alloyName || "").trim();
    if (!nextFamily) {
      throw new Error("Choose a material before adding an alloy.");
    }
    if (!nextAlloy) {
      throw new Error("Enter an alloy name.");
    }
    const existing = workspace?.preferences?.materialFamilies || [];
    const updated = existing.map((family) => {
      if (String(family.name || "") !== nextFamily) {
        return family;
      }
      const alloys = Array.from(new Set([...(family.alloys || []), nextAlloy]));
      return { ...family, alloys };
    });
    await savePreferences({ materialFamilies: updated }, { silent: true });
    return nextAlloy;
  };

  const addPreferenceListOption = async (key, value, missingMessage) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      throw new Error(missingMessage);
    }
    const existing = Array.isArray(workspace?.preferences?.[key]) ? workspace.preferences[key] : [];
    const match = existing.find((item) => String(item || "").trim().toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return match;
    }
    await savePreferences({ [key]: [...existing, trimmed] }, { silent: true });
    return trimmed;
  };

  const addKanbanVendorOption = async (value) => addPreferenceListOption("kanbanVendors", value, "Enter a vendor.");
  const addKanbanLocationOption = async (departmentName, value) => {
    const trimmedDepartment = String(departmentName || "").trim();
    const trimmedLocation = String(value || "").trim();
    if (!trimmedDepartment) {
      throw new Error("Choose a department before adding a storage location.");
    }
    if (!trimmedLocation) {
      throw new Error("Enter a location.");
    }
    const existing = workspace?.preferences?.kanbanDepartments || [];
    let matchedName = trimmedDepartment;
    let found = false;
    const next = existing.map((item) => {
      if (String(item?.name || "").trim() !== trimmedDepartment) {
        return item;
      }
      found = true;
      matchedName = item.name;
      const locations = Array.from(new Set([...(item.locations || []), trimmedLocation]));
      return { ...item, locations };
    });
    if (!found) {
      throw new Error("Choose a valid department before adding a storage location.");
    }
    await savePreferences({ kanbanDepartments: next, kanbanStorageLocations: [] }, { silent: true });
    return trimmedLocation;
  };
  const addKanbanCategoryOption = async (value) => addPreferenceListOption("kanbanCategories", value, "Enter a category.");
  const addKanbanDepartmentOption = async (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      throw new Error("Enter a department.");
    }
    const existing = workspace?.preferences?.kanbanDepartments || [];
    const match = existing.find((item) => String(item?.name || "").trim().toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return match.name;
    }
    const colors = ["#2563eb", "#f59e0b", "#0f766e", "#7c3aed", "#dc2626", "#475569"];
    const next = [...existing, { id: uid("kanban-dept"), name: trimmed, color: colors[existing.length % colors.length], locations: [] }];
    await savePreferences({ kanbanDepartments: next }, { silent: true });
    return trimmed;
  };

  useAutoSave({
    value: job,
    resetKey: `job:${job?.id || "none"}`,
    enabled: Boolean(job),
    isReady: (current) => Boolean(current?.jobNumber || current?.customer),
    save: (current) => api.saveJob(current),
    onSaved: applySavedJob,
    onError: (error) => showStatus(error.message || String(error)),
    onStateChange: (next) => {
      if (view === "jobs" && jobScreen !== "list") {
        setSaveState(next);
      }
    }
  });

  useAutoSave({
    value: kanbanCard,
    resetKey: `kanban:${kanbanCard?.id || "none"}`,
    enabled: Boolean(kanbanCard),
    isReady: (current) => Boolean(current?.itemName || current?.internalInventoryNumber || current?.purchaseUrl || current?.vendor || current?.category),
    save: (current) => api.saveKanbanCard(current),
    onSaved: applySavedKanbanCard,
    onError: (error) => showStatus(error.message || String(error)),
    onStateChange: (next) => {
      if (view === "kanban" && kanbanScreen === "detail") {
        setSaveState(next);
      }
    }
  });

  useAutoSave({
    value: material,
    resetKey: `material:${material?.id || "none"}`,
    enabled: Boolean(material),
    isReady: (current) => Boolean(current?.supplier && materialDisplayType(current)),
    save: (current) => api.saveMaterial(current),
    onSaved: applySavedMaterial,
    onError: (error) => showStatus(error.message || String(error)),
    onStateChange: (next) => {
      if (view === "materials" && materialScreen === "detail") {
        setSaveState(next);
      }
    }
  });

  useAutoSave({
    value: instrumentPayload,
    resetKey: `instrument:${instrumentPayload?.instrument?.instrument_id || "none"}`,
    enabled: Boolean(instrumentPayload),
    isReady: (current) => Boolean(current?.instrument?.tool_name),
    save: (current) => api.saveInstrument(current),
    onSaved: applySavedInstrument,
    onError: (error) => showStatus(error.message || String(error)),
    onStateChange: (next) => {
      if (view === "metrology" && metrologyScreen === "detail") {
        setSaveState(next);
      }
    }
  });

  if (!workspace) {
    if (startupError) {
      return <Fatal title="Workspace Load Failed" message={startupError} />;
    }
    return <LoadingScreen message="Loading AMERP workspace..." />;
  }

  const selectedTemplate = workspace.templates.find((item) => item.id === selectedTemplateId) || workspace.templates[0] || null;
  const selectedPart = job?.parts.find((item) => item.id === selectedPartId) || null;
  const selectedOperation = selectedPart?.operations.find((item) => item.id === selectedOperationId) || null;
  const topbarMeta = (() => {
    if (view === "jobs") {
      const crumbs = [{ label: "Jobs", onClick: showJobList, active: jobScreen === "list" }];
      if (jobScreen !== "list" && job) {
        crumbs.push({ label: job.jobNumber || "New Job", onClick: backToJob, active: jobScreen === "job" });
      }
      if (jobScreen === "part" || jobScreen === "operation") {
        crumbs.push({ label: selectedPart?.partNumber || selectedPart?.partName || "Part", onClick: backToPart, active: jobScreen === "part" });
      }
      if (jobScreen === "operation") {
        crumbs.push({ label: selectedOperation?.title || `Operation ${selectedOperation?.sequence || ""}`.trim(), onClick: null, active: true });
      }
      return {
        breadcrumbs: crumbs,
        title: jobScreen === "list"
          ? "Jobs"
          : jobScreen === "job"
            ? (job?.jobNumber || "New Job")
            : jobScreen === "part"
              ? (selectedPart?.partNumber || selectedPart?.partName || "Part")
              : (selectedOperation?.title || "Operation"),
        subtitle: jobScreen === "list"
          ? "Build and run jobs from part to operation."
          : jobScreen === "job"
            ? `${job?.parts?.length || 0} parts`
            : jobScreen === "part"
              ? `${selectedPart?.operations?.length || 0} operations`
              : `${job?.jobNumber || ""}${selectedPart ? ` / ${selectedPart.partNumber || selectedPart.partName || "Part"}` : ""}`,
        primaryActions: [
          jobScreen === "list" ? <button key="new-job" onClick={createNewJob}><Plus size={15} /> New Job</button> : null,
          jobScreen !== "list" ? <button key="pdf" onClick={exportCurrentJobPdf} disabled={!job || busy}><FileDown size={16} /> PDF</button> : null
        ].filter(Boolean),
        dangerActions: [
          jobScreen !== "list" && job?.active !== false
            ? <button key="archive-job" className="danger" onClick={archiveCurrentJob} disabled={!selectedJobId || busy}><Archive size={16} /> Archive</button>
            : null,
          jobScreen !== "list" && job?.active === false
            ? <button key="unarchive-job" onClick={unarchiveCurrentJob} disabled={!selectedJobId || busy}><ArchiveRestore size={16} /> Unarchive</button>
            : null,
          jobScreen !== "list" && job?.active === false
            ? <button key="delete-job" className="danger" onClick={openDeleteJobConfirm} disabled={!selectedJobId || busy}><Trash2 size={16} /> Delete</button>
            : null
        ].filter(Boolean)
      };
    }
    if (view === "kanban") {
      return {
        breadcrumbs: [
          { label: "Kanban", onClick: showKanbanList, active: kanbanScreen === "list" },
          ...(kanbanScreen === "detail" && kanbanCard ? [{ label: kanbanCard.itemName || kanbanCard.internalInventoryNumber || "New Card", onClick: null, active: true }] : [])
        ],
        title: kanbanScreen === "detail" ? (kanbanCard?.itemName || kanbanCard?.internalInventoryNumber || "New Card") : "Kanban",
        subtitle: kanbanScreen === "detail"
          ? [kanbanCard?.vendor, kanbanCard?.category, kanbanCard?.internalInventoryNumber].filter(Boolean).join(" / ")
          : "Purchasing cards for replenishment and reorder points.",
        primaryActions: [
          kanbanScreen === "list" ? <button key="new-kanban" onClick={() => createNewKanbanCard()}><Plus size={15} /> New Card</button> : null,
          kanbanScreen === "detail" ? <button key="kanban-ai-image" onClick={generateCurrentKanbanImage} disabled={!kanbanCard || busy}>{kanbanAiState === "imaging" ? "Generating Image..." : "Generate Image"}</button> : null,
          kanbanScreen === "detail" ? <button key="kanban-pdf" onClick={openKanbanPrintDialog} disabled={!kanbanCard || busy}><FileDown size={16} /> PDF</button> : null
        ].filter(Boolean),
        dangerActions: [
          kanbanScreen === "detail" && kanbanCard?.active !== false
            ? <button key="archive-kanban" className="danger" onClick={archiveCurrentKanbanCard} disabled={!selectedKanbanId || busy}><Archive size={16} /> Archive</button>
            : null,
          kanbanScreen === "detail" && kanbanCard?.active === false
            ? <button key="unarchive-kanban" onClick={unarchiveCurrentKanbanCard} disabled={!selectedKanbanId || busy}><ArchiveRestore size={16} /> Unarchive</button>
            : null,
          kanbanScreen === "detail" && kanbanCard?.active === false
            ? <button key="delete-kanban" className="danger" onClick={openDeleteKanbanConfirm} disabled={!selectedKanbanId || busy}><Trash2 size={16} /> Delete</button>
            : null
        ].filter(Boolean)
      };
    }
    if (view === "materials") {
      return {
        breadcrumbs: [
          { label: "Materials", onClick: showMaterialsList, active: materialScreen === "list" },
          ...(materialScreen === "detail" && material ? [{ label: material.serialCode || "New Material", onClick: null, active: true }] : [])
        ],
        title: materialScreen === "detail" ? (material?.serialCode || "New Material") : "Materials",
        subtitle: materialScreen === "detail"
          ? [material?.materialFamily, materialDisplayType(material)].filter(Boolean).join(" / ")
          : "Traceable material records with fast search and filters.",
        primaryActions: [
          materialScreen === "list" ? <button key="new-material" onClick={createNewMaterial}><Plus size={15} /> New Material</button> : null,
          materialScreen === "detail" ? <button key="material-pdf" onClick={openMaterialPrintDialog} disabled={!material || busy}><FileDown size={16} /> PDF</button> : null
        ].filter(Boolean),
        dangerActions: [
          materialScreen === "detail" ? <button key="archive-material" className="danger" onClick={archiveCurrentMaterial} disabled={!selectedMaterialId || busy}><Archive size={16} /> Archive</button> : null
        ].filter(Boolean)
      };
    }
    if (view === "metrology") {
      return {
        breadcrumbs: [
          { label: "Gages", onClick: showMetrologyList, active: metrologyScreen === "list" },
          ...(metrologyScreen === "detail" && instrumentPayload ? [{ label: instrumentPayload.instrument?.tool_name || "New Gage", onClick: null, active: true }] : [])
        ],
        title: metrologyScreen === "detail" ? (instrumentPayload?.instrument?.tool_name || "New Gage") : "Gages",
        subtitle: metrologyScreen === "detail"
          ? (instrumentPayload?.instrument?.instrument_id || "")
          : "Inspection equipment and calibration records.",
        primaryActions: [
          metrologyScreen === "list" ? <button key="new-gage" onClick={createNewInstrument}><Plus size={15} /> New Gage</button> : null
        ].filter(Boolean),
        dangerActions: [
          metrologyScreen === "detail" ? <button key="archive-gage" className="danger" onClick={archiveCurrentInstrument} disabled={!selectedInstrumentId || busy}><Archive size={16} /> Archive</button> : null
        ].filter(Boolean)
      };
    }
    return {
      breadcrumbs: [{ label: "Settings", onClick: null, active: true }],
      title: "Settings",
      subtitle: "System configuration, controlled lists, and reusable templates.",
      primaryActions: [],
      dangerActions: []
    };
  })();
  const appTitle = workspace?.preferences?.appTitle || "AMERP";
  const appTagline = workspace?.preferences?.appTagline || "Operator ERP";
  const appIconPath = workspace?.preferences?.appIconPath || "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          {appIconPath ? (
            <img className="brand-icon-image" src={localFileUrl(appIconPath)} alt={`${appTitle} icon`} />
          ) : (
            <Hammer size={26} />
          )}
          <div>
            <h1>{appTitle}</h1>
            <span>{appTagline}</span>
          </div>
        </div>

        <nav className="nav-tabs">
          {PRIMARY_MODULES.filter((module) => moduleIsEnabled(module.id)).map((module) => {
            const handlers = {
              jobs: showJobList,
              kanban: showKanbanList,
              materials: showMaterialsList,
              metrology: showMetrologyList
            };
            return (
              <NavButton
                key={module.id}
                icon={module.icon}
                active={view === module.id}
                label={module.label}
                onClick={handlers[module.id]}
              />
            );
          })}
          <NavButton icon={Settings} active={view === "settings"} label="Settings" onClick={() => setView("settings")} />
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-main">
            <div className="breadcrumb-row">
              {topbarMeta.breadcrumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  <button className={`breadcrumb-button ${index === 0 ? "root-crumb" : ""} ${crumb.active ? "active" : ""}`} onClick={crumb.onClick} disabled={!crumb.onClick || crumb.active}>
                    {crumb.label}
                  </button>
                  {index < topbarMeta.breadcrumbs.length - 1 && <span className="breadcrumb-separator">/</span>}
                </React.Fragment>
              ))}
            </div>
            {topbarMeta.subtitle ? <p className="topbar-subtitle">{topbarMeta.subtitle}</p> : null}
          </div>
          <div className="topbar-actions">
            <SaveStatePill state={saveState} />
            <div className="toolbar topbar-actions-main">
              {topbarMeta.primaryActions}
            </div>
            <div className="toolbar topbar-actions-danger">
              {topbarMeta.dangerActions}
            </div>
          </div>
        </header>

        {status && <div className="status-banner">{status}</div>}
        {view === "jobs" && moduleIsEnabled("jobs") && (
          <JobsView
            busy={busy}
            jobScreen={jobScreen}
            job={job}
            setJob={setJob}
            selectedPartId={selectedPartId}
            selectedOperationId={selectedOperationId}
            workspace={workspace}
            onOpenJob={openJob}
            onCreateJob={createNewJob}
            onOpenPart={openPart}
            onOpenOperation={openOperation}
            onBackToJobList={showJobList}
            onBackToJob={backToJob}
            onBackToPart={backToPart}
            onImportSubtractPurchaseOrders={importSubtractPurchaseOrders}
            onImportXometryPurchaseOrders={importXometryPurchaseOrders}
            onImportXometryIntoJob={importXometryIntoJob}
            onAssignNextJobNumber={assignNextJobNumber}
            onImportFusionToPart={importFusionIntoPart}
        onAddJobDocuments={addJobDocuments}
        onAddPartDocuments={addPartDocuments}
        onOpenJobDocument={openJobDocument}
        onOpenPartDocument={openPartDocument}
        onOpenJobDocumentRevision={openJobDocumentRevision}
        onOpenPartDocumentRevision={openPartDocumentRevision}
        onArchiveJobDocument={archiveJobDocument}
        onArchivePartDocument={archivePartDocument}
        onUnarchiveJobDocument={unarchiveJobDocument}
        onUnarchivePartDocument={unarchivePartDocument}
        onReviseJobDocument={reviseJobDocument}
        onRevisePartDocument={revisePartDocument}
        onDeleteJobDocument={deleteJobDocument}
        onDeletePartDocument={deletePartDocument}
        onSaveCustomer={saveCustomer}
            onChooseOperationImages={async (jobId, partId, operationId) => api.chooseOperationImages(jobId, partId, operationId)}
            onCreateInlineMaterial={createInlineMaterial}
            onAddMaterialFamily={addMaterialFamilyOption}
            onAddMaterialAlloy={addMaterialAlloyOption}
          />
        )}
        {view === "kanban" && moduleIsEnabled("kanban") && (
          <KanbanView
            workspace={workspace}
            screen={kanbanScreen}
            card={kanbanCard}
            setCard={setKanbanCard}
            onOpenCard={openKanbanCard}
            onShowList={showKanbanList}
            onCreateNew={() => createNewKanbanCard()}
            onImportFromUrl={importKanbanFromUrl}
            onRefreshFromUrl={refreshCurrentKanbanFromUrl}
            onChoosePhoto={chooseKanbanPhoto}
            onAssignInventoryNumber={assignNextKanbanInventoryNumber}
            onAddVendor={addKanbanVendorOption}
            onAddDepartment={addKanbanDepartmentOption}
            onAddLocation={addKanbanLocationOption}
            onAddCategory={addKanbanCategoryOption}
            aiState={kanbanAiState}
          />
        )}
        {view === "materials" && moduleIsEnabled("materials") && (
          <MaterialsView
            workspace={workspace}
            materialScreen={materialScreen}
            material={material}
            setMaterial={setMaterial}
            onOpenMaterial={openMaterial}
            onShowList={showMaterialsList}
            onCreateNew={createNewMaterial}
            onAddAttachments={addMaterialAttachments}
            canAddAttachments={Boolean(selectedMaterialId)}
            onOpenAttachment={openMaterialAttachment}
            onOpenAttachmentRevision={openMaterialAttachmentRevision}
            onArchiveAttachment={archiveMaterialAttachment}
            onUnarchiveAttachment={unarchiveMaterialAttachment}
            onReviseAttachment={reviseMaterialAttachment}
            onDeleteAttachment={deleteMaterialAttachment}
            onAddMaterialFamily={addMaterialFamilyOption}
            onAddMaterialAlloy={addMaterialAlloyOption}
          />
        )}
        {view === "metrology" && moduleIsEnabled("metrology") && (
          <MetrologyView
            workspace={workspace}
            screen={metrologyScreen}
            payload={instrumentPayload}
            setPayload={setInstrumentPayload}
            onOpenInstrument={openInstrument}
            onCreateNew={createNewInstrument}
            onShowList={showMetrologyList}
          />
        )}
        {view === "settings" && (
          <SettingsView
            onChooseDataFolder={() => api.selectDataFolder().then(() => refreshWorkspace(false))}
            onSavePreferences={savePreferences}
            workspace={workspace}
            selectedTemplate={selectedTemplate}
            setSelectedTemplateId={setSelectedTemplateId}
            onStatus={showStatus}
            onRefresh={refreshWorkspace}
          />
        )}
      </main>

      <ConfirmDialog
        open={confirmDeleteJobOpen}
        title="Delete Archived Job?"
        message={`Delete ${job?.jobNumber || "this archived job"}? This cannot be undone.`}
        confirmLabel="Delete Job"
        onCancel={() => setConfirmDeleteJobOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteJobOpen(false);
          await deleteCurrentJob();
        }}
      />

      <ConfirmDialog
        open={confirmDeleteKanbanOpen}
        title="Delete Archived Kanban Card?"
        message={`Delete ${kanbanCard?.itemName || kanbanCard?.internalInventoryNumber || "this archived Kanban card"}? This cannot be undone.`}
        confirmLabel="Delete Card"
        onCancel={() => setConfirmDeleteKanbanOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteKanbanOpen(false);
          await deleteCurrentKanbanCard();
        }}
      />

      <KanbanPrintDialog
        open={kanbanPrintDialogOpen}
        sizes={kanbanPrintSizes(workspace?.preferences)}
        selectedSizeId={selectedKanbanPrintSizeId}
        monochrome={selectedKanbanPrintMonochrome}
        onChange={setSelectedKanbanPrintSizeId}
        onToggleMonochrome={setSelectedKanbanPrintMonochrome}
        onCancel={() => setKanbanPrintDialogOpen(false)}
        onConfirm={async () => {
          setKanbanPrintDialogOpen(false);
          await exportCurrentKanbanPdf();
        }}
      />
      <KanbanPrintDialog
        open={materialPrintDialogOpen}
        title="Material Label Size"
        description="Choose the label size and print mode for this material label."
        sizes={kanbanPrintSizes(workspace?.preferences)}
        selectedSizeId={selectedMaterialPrintSizeId}
        monochrome={selectedMaterialPrintMonochrome}
        onChange={setSelectedMaterialPrintSizeId}
        onToggleMonochrome={setSelectedMaterialPrintMonochrome}
        onCancel={() => setMaterialPrintDialogOpen(false)}
        onConfirm={async () => {
          setMaterialPrintDialogOpen(false);
          await exportCurrentMaterialPdf();
        }}
      />
    </div>
  );
}

function NavButton({ icon: Icon, active, label, onClick }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <Icon size={16} />
      {label}
    </button>
  );
}

function DashboardView({ workspace }) {
  const counts = workspace.dashboard?.counts || {};
  return (
    <div className="dashboard-grid">
      <StatCard label="Open Jobs" value={counts.openJobs || 0} />
      <StatCard label="Active Materials" value={counts.materials || 0} />
      <StatCard label="Active Gages" value={counts.instruments || 0} />
      <StatCard label="Gages Due" value={counts.overdueInstruments || 0} accent />
    </div>
  );
}

function LegacyJobsView({ job, setJob, workspace, onChooseOperationImages, onImportFusionToPart }) {
  if (!job) {
    return <EmptyState icon={Package} title="No job selected" text="Pick a job or create a new one." />;
  }
  const materials = workspace.materials || [];
  const instruments = workspace.instruments || [];
  const templates = workspace.templates || [];
  const jobTools = job.tools || [];

  const updateJob = (patch) => setJob((current) => ({ ...current, ...patch }));
  const updateRevision = (patch) => setJob((current) => ({ ...current, revision: { ...current.revision, ...patch } }));
  const updateTool = (toolId, patch) => setJob((current) => ({
    ...current,
    tools: (current.tools || []).map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool)
  }));
  const addTool = () => setJob((current) => ({ ...current, tools: [...(current.tools || []), blankJobTool()] }));
  const removeTool = (toolId) => setJob((current) => ({
    ...current,
    tools: (current.tools || []).filter((tool) => tool.id !== toolId),
    parts: current.parts.map((part) => ({
      ...part,
      operations: part.operations.map((operation) => ({
        ...operation,
        jobToolRefs: (operation.jobToolRefs || []).filter((id) => id !== toolId)
      }))
    }))
  }));

  const updatePart = (partId, updater) => setJob((current) => ({
    ...current,
    parts: current.parts.map((part) => part.id === partId ? (typeof updater === "function" ? updater(part) : { ...part, ...updater }) : part)
  }));

  const addPart = () => setJob((current) => ({ ...current, parts: [...current.parts, blankPart()] }));
  const removePart = (partId) => setJob((current) => ({ ...current, parts: current.parts.filter((part) => part.id !== partId) }));

  const addOperation = (partId, templateId = "") => {
    const template = templates.find((item) => item.id === templateId);
    updatePart(partId, (part) => {
      const sequence = part.operations.length + 1;
      const operation = blankOperation(sequence);
      if (template) {
        operation.title = template.name;
        operation.type = template.category;
        operation.setupTemplateRefs = [template.id];
        operation.librarySelections = Object.fromEntries((template.libraryNames || []).map((libraryName) => [libraryName, []]));
        operation.parameters = (template.defaultParameters || []).map((item) => ({ ...blankParameter(), label: item.label || "", value: item.value || "" }));
        operation.instructionSteps = (template.defaultSteps || []).map((step) => blankInstructionStep(step));
        operation.workInstructions = (template.defaultSteps || []).join("\n");
      }
      return { ...part, operations: [...part.operations, operation] };
    });
  };

  return (
    <div className="workspace-columns">
      <section className="panel">
        <div className="panel-heading">
          <h3>Job Header</h3>
        </div>
        <div className="form-grid">
          <TextField label="Job Number" value={job.jobNumber} onChange={(value) => updateJob({ jobNumber: value })} />
          <TextField label="Customer" value={job.customer} onChange={(value) => updateJob({ customer: value })} />
          <SelectField label="Status" value={job.status} options={workspace.constants.jobStatuses} onChange={(value) => updateJob({ status: value })} />
          <SelectField label="Priority" value={job.priority} options={workspace.constants.priorities} onChange={(value) => updateJob({ priority: value })} />
          <TextField label="Due Date" type="date" value={job.dueDate} onChange={(value) => updateJob({ dueDate: value })} />
          <TextField label="Revision" value={job.revision?.number || ""} onChange={(value) => updateRevision({ number: value })} />
          <TextField label="Revision Date" type="date" value={job.revision?.date || ""} onChange={(value) => updateRevision({ date: value })} />
          <TextField label="Author" value={job.revision?.author || ""} onChange={(value) => updateRevision({ author: value })} />
        </div>
        <TextArea label="Revision Notes" value={job.revision?.notes || ""} onChange={(value) => updateRevision({ notes: value })} rows={3} />
        <TextArea label="Job Notes" value={job.notes || ""} onChange={(value) => updateJob({ notes: value })} rows={4} />
        <div className="subpanel top-gap">
          <div className="subpanel-header">
            <div>
              <h4>Job Tools</h4>
              <span>{jobTools.length} tool{jobTools.length === 1 ? "" : "s"} saved with this job</span>
            </div>
            <button onClick={addTool}><Plus size={14} /> Tool</button>
          </div>
          <div className="job-tools-grid">
            {jobTools.map((tool) => (
              <div key={tool.id} className="tool-card">
                <div className="form-grid compact">
                  <TextField label="Tool" value={tool.name || ""} onChange={(value) => updateTool(tool.id, { name: value })} />
                  <TextField label="Diameter" value={tool.diameter || ""} onChange={(value) => updateTool(tool.id, { diameter: value })} />
                  <TextField label="Stickout" value={tool.length || ""} onChange={(value) => updateTool(tool.id, { length: value })} />
                  <TextField label="Holder" value={tool.holder || ""} onChange={(value) => updateTool(tool.id, { holder: value })} />
                </div>
                <TextArea label="Details" value={tool.details || ""} onChange={(value) => updateTool(tool.id, { details: value })} rows={4} />
                <div className="tool-card-actions">
                  <button className="danger subtle" onClick={() => removeTool(tool.id)}><X size={14} /> Remove</button>
                </div>
              </div>
            ))}
            {!jobTools.length && <div className="empty-inline">Import Fusion operations or add tools manually for this job.</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Parts And Operations</h3>
          </div>
          <button onClick={addPart}><Plus size={15} /> Part</button>
        </div>

        <div className="stack-list">
          {job.parts.map((part) => (
            <PartEditor
              key={part.id}
              part={part}
              templates={templates}
              materials={materials}
              instruments={instruments}
              jobTools={jobTools}
              onUpdate={(updater) => updatePart(part.id, updater)}
              onRemove={() => removePart(part.id)}
              onAddOperation={addOperation}
              onImportFusion={onImportFusionToPart}
              onChooseOperationImages={onChooseOperationImages}
              jobId={job.id}
            />
          ))}
          {!job.parts.length && <div className="empty-inline">No parts yet. Add a part when you are ready. Job changes save automatically.</div>}
        </div>
      </section>
    </div>
  );
}

function PartEditor({ part, templates, materials, instruments, jobTools, onUpdate, onRemove, onAddOperation, onImportFusion, onChooseOperationImages, jobId }) {
  const updateField = (patch) => onUpdate((current) => ({ ...current, ...patch }));
  const updateRevision = (patch) => onUpdate((current) => ({ ...current, revision: { ...current.revision, ...patch } }));
  const updateOperation = (operationId, updater) => onUpdate((current) => ({
    ...current,
    operations: current.operations.map((operation) => operation.id === operationId ? (typeof updater === "function" ? updater(operation) : { ...operation, ...updater }) : operation)
  }));
  const removeOperation = (operationId) => onUpdate((current) => ({
    ...current,
    operations: current.operations.filter((operation) => operation.id !== operationId).map((operation, index) => ({ ...operation, sequence: index + 1 }))
  }));

  return (
    <div className="subpanel">
      <div className="subpanel-header">
        <div>
          <h4>{part.partNumber || part.partName || "New Part"}</h4>
          <span>{part.operations.length} operations</span>
        </div>
        <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove Part</button>
      </div>
      <div className="form-grid">
        <TextField label="Part Number" value={part.partNumber} onChange={(value) => updateField({ partNumber: value })} />
        <TextField label="Part Name" value={part.partName} onChange={(value) => updateField({ partName: value })} />
        <TextField label="Quantity" value={part.quantity} onChange={(value) => updateField({ quantity: value })} />
        <TextField label="Material Spec" value={part.materialSpec} onChange={(value) => updateField({ materialSpec: value })} />
        <TextField label="Part Revision" value={part.revision?.number || ""} onChange={(value) => updateRevision({ number: value })} />
        <TextField label="Revision Date" type="date" value={part.revision?.date || ""} onChange={(value) => updateRevision({ date: value })} />
      </div>
      <TextArea label="Description" value={part.description || ""} onChange={(value) => updateField({ description: value })} rows={2} />
      <TextArea label="Part Notes" value={part.notes || ""} onChange={(value) => updateField({ notes: value })} rows={2} />

      <div className="subpanel-header">
        <div>
          <h4>Operations</h4>
        </div>
        <div className="toolbar">
          <button onClick={() => onImportFusion(part.id)}><Import size={14} /> From Fusion</button>
          <select className="compact-select" defaultValue="" onChange={(event) => event.target.value && onAddOperation(part.id, event.target.value)}>
            <option value="">Add From Template</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <button onClick={() => onAddOperation(part.id, "")}><Plus size={14} /> Blank Operation</button>
        </div>
      </div>

      <div className="stack-list">
        {part.operations.map((operation) => (
          <OperationEditor
            key={operation.id}
            operation={operation}
            materials={materials}
            instruments={instruments}
            jobTools={jobTools}
            onUpdate={(updater) => updateOperation(operation.id, updater)}
            onRemove={() => removeOperation(operation.id)}
            onAddImages={async () => {
              const images = await onChooseOperationImages(jobId, part.id, operation.id);
              updateOperation(operation.id, (current) => ({ ...current, stepImages: [...current.stepImages, ...images] }));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OperationEditor({ operation, materials, instruments, jobTools, onUpdate, onRemove, onAddImages }) {
  const updateField = (patch) => onUpdate((current) => ({ ...current, ...patch }));
  const toggleRef = (field, id) => onUpdate((current) => ({
    ...current,
    [field]: current[field].includes(id) ? current[field].filter((item) => item !== id) : [...current[field], id]
  }));
  const updateParameter = (parameterId, patch) => onUpdate((current) => ({
    ...current,
    parameters: current.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...patch } : parameter)
  }));
  const addParameter = () => onUpdate((current) => ({ ...current, parameters: [...current.parameters, blankParameter()] }));
  const removeParameter = (parameterId) => onUpdate((current) => ({ ...current, parameters: current.parameters.filter((parameter) => parameter.id !== parameterId) }));

  return (
    <div className="operation-card">
      <div className="subpanel-header">
        <div>
          <h4>{operation.sequence}. {operation.title || "Operation"}</h4>
          <span>{operation.operationCode} • {operation.type || "General"}</span>
        </div>
        <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove</button>
      </div>

      <div className="form-grid">
        <TextField label="Sequence" value={String(operation.sequence || "")} onChange={(value) => updateField({ sequence: Number(value || 0) || 1 })} />
        <TextField label="Op Code" value={operation.operationCode || ""} onChange={(value) => updateField({ operationCode: value })} />
        <TextField label="Title" value={operation.title || ""} onChange={(value) => updateField({ title: value })} />
        <TextField label="Type" value={operation.type || ""} onChange={(value) => updateField({ type: value })} />
        <TextField label="Work Center" value={operation.workCenter || ""} onChange={(value) => updateField({ workCenter: value })} />
        <TextField label="Status" value={operation.status || ""} onChange={(value) => updateField({ status: value })} />
      </div>

      <TextArea label="Setup Instructions" value={operation.setupInstructions || ""} onChange={(value) => updateField({ setupInstructions: value })} rows={3} />
      <TextArea label="Work Instructions" value={operation.workInstructions || ""} onChange={(value) => updateField({ workInstructions: value })} rows={4} />
      <TextArea label="Operation Notes" value={operation.notes || ""} onChange={(value) => updateField({ notes: value })} rows={2} />

      <div className="subpanel-header">
        <div>
          <h4>Parameters</h4>
        </div>
        <button onClick={addParameter}><Plus size={14} /> Parameter</button>
      </div>
      <div className="parameter-list">
        {operation.parameters.map((parameter) => (
          <div className="parameter-row" key={parameter.id}>
            <input value={parameter.label} placeholder="Label" onChange={(event) => updateParameter(parameter.id, { label: event.target.value })} />
            <input value={parameter.value} placeholder="Value" onChange={(event) => updateParameter(parameter.id, { value: event.target.value })} />
            <button className="danger subtle square" onClick={() => removeParameter(parameter.id)}><X size={13} /></button>
          </div>
        ))}
      </div>

      <div className="link-grid">
        <RecordChecklist
          title="Material Lots"
          items={materials.map((item) => ({ id: item.id, label: `${item.serialCode} • ${item.materialType}` }))}
          selected={operation.requiredMaterialLots || []}
          onToggle={(id) => toggleRef("requiredMaterialLots", id)}
        />
        <RecordChecklist
          title="Job Tools"
          items={(jobTools || []).map((tool) => ({ id: tool.id, label: summarizeJobTool(tool) }))}
          selected={operation.jobToolRefs || []}
          onToggle={(id) => toggleRef("jobToolRefs", id)}
        />
        <RecordChecklist
          title="Inspection Instruments"
          items={instruments.map((item) => ({ id: item.instrumentId, label: `${item.toolName} • ${item.dueState}` }))}
          selected={operation.requiredInstruments || []}
          onToggle={(id) => toggleRef("requiredInstruments", id)}
        />
      </div>

      <div className="subpanel-header">
        <div>
          <h4>Step Images</h4>
          <span>{operation.stepImages?.length || 0} images</span>
        </div>
        <button onClick={onAddImages}><FolderOpen size={14} /> Add Images</button>
      </div>
      <div className="image-strip">
        {(operation.stepImages || []).map((image) => (
          <figure key={image.id} className="image-chip">
            <img src={api.assetUrl(image.relativePath)} alt={image.name || "Operation image"} />
            <figcaption>{image.name}</figcaption>
          </figure>
        ))}
        {!operation.stepImages?.length && <div className="empty-inline">No images attached.</div>}
      </div>
    </div>
  );
}

function DocumentsPanel({
  title,
  documents,
  onAddDocuments,
  onOpenDocument,
  onOpenRevision,
  onArchiveDocument,
  onDeleteDocument,
  onReviseDocument,
  emptyText
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [expandedDocumentId, setExpandedDocumentId] = useState("");
  const activeDocuments = (documents || []).filter((document) => document.active !== false);
  const archivedDocuments = (documents || []).filter((document) => document.active === false);
  const visibleDocuments = showArchived ? [...activeDocuments, ...archivedDocuments] : activeDocuments;

  return (
    <section className="panel">
      <div className="panel-heading inline">
        <div>
          <h3>{title}</h3>
          <span>
            {activeDocuments.length} current file{activeDocuments.length === 1 ? "" : "s"}
            {archivedDocuments.length ? ` | ${archivedDocuments.length} archived` : ""}
          </span>
        </div>
        <div className="toolbar">
          {archivedDocuments.length ? (
            <button onClick={() => setShowArchived((current) => !current)}>
              {showArchived ? "Hide Archived" : `Show Archived (${archivedDocuments.length})`}
            </button>
          ) : null}
          <button onClick={onAddDocuments}><FolderOpen size={14} /> Add Attachment</button>
        </div>
      </div>
      <div className="document-list">
        {visibleDocuments.map((document) => {
          const revisions = [...(document.revisions || [])].reverse();
          const historyOpen = expandedDocumentId === document.id;
          const currentTimestamp = document.revisedAt || document.attachedAt;
          return (
          <div
            key={document.id}
            className={`document-card${document.active === false ? " archived" : ""}`}
          >
            <div className="document-card-header">
              <div>
                <strong>{document.originalFilename || "Document"}</strong>
                <span>
                  {[
                    document.fileType || "File",
                    `Rev ${document.revisionNumber || 1}`,
                    currentTimestamp ? formatDateTime(currentTimestamp) : "",
                    document.active === false ? "Archived" : ""
                  ].filter(Boolean).join(" | ")}
                </span>
              </div>
              <div className="tiny-toolbar">
                <button onClick={() => onOpenDocument(document.id)}>Open</button>
                <button onClick={() => onReviseDocument(document.id)} disabled={document.active === false}>New Revision</button>
                <button
                  className={document.active === false ? "" : "danger"}
                  onClick={() => onArchiveDocument(document.id, document.originalFilename, document.active === false)}
                >
                  {document.active === false ? "Unarchive" : "Archive"}
                </button>
                {document.active === false ? (
                  <button className="danger" onClick={() => onDeleteDocument(document.id, document.originalFilename)}>Delete</button>
                ) : null}
              </div>
            </div>
            {revisions.length ? (
              <div className="document-history">
                <button
                  className="history-toggle"
                  onClick={() => setExpandedDocumentId((current) => current === document.id ? "" : document.id)}
                >
                  {historyOpen ? "Hide Revision History" : `Revision History (${revisions.length})`}
                </button>
                {historyOpen ? (
                  <div className="document-history-list">
                    {revisions.map((revision, revisionOffset) => {
                      const revisionIndex = (document.revisions || []).length - 1 - revisionOffset;
                      const revisionTimestamp = revision.revisedAt || revision.attachedAt;
                      return (
                        <div key={`${document.id}-revision-${revisionIndex}`} className="document-history-row">
                          <div>
                            <strong>{revision.originalFilename || revision.storedFilename || "Revision"}</strong>
                            <span>
                              {[
                                revision.fileType || document.fileType || "File",
                                `Rev ${revision.revisionNumber || revisionOffset + 1}`,
                                revisionTimestamp ? formatDateTime(revisionTimestamp) : ""
                              ].filter(Boolean).join(" | ")}
                            </span>
                          </div>
                          <button onClick={() => onOpenRevision(document.id, revisionIndex)}>Open</button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
        })}
        {!visibleDocuments.length && <div className="empty-inline">{showArchived ? "No attachments matched the current filter." : emptyText}</div>}
      </div>
    </section>
  );
}
function CustomerDialog({ open, customer, onChange, onClose, onSaveCustomer, onLinked }) {
  useAutoSave({
    value: open ? customer : null,
    resetKey: `customer-dialog:${open ? customer?.id || "new" : "closed"}`,
    enabled: Boolean(open && customer),
    isReady: (current) => Boolean(current?.name),
    save: onSaveCustomer,
    onSaved: (saved) => {
      if (saved) {
        onChange(saved);
        onLinked(saved);
      }
    }
  });

  if (!open || !customer) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel">
        <div className="panel-heading inline">
          <div>
            <h3>{customer.name || "New Customer"}</h3>
            <span>{customer.jobRefs?.length || 0} linked jobs</span>
          </div>
          <button onClick={onClose}><X size={14} /> Done</button>
        </div>
        <div className="form-grid">
          <TextField label="Customer Name" value={customer.name || ""} onChange={(value) => onChange({ ...customer, name: value })} />
          <TextField label="Contact Name" value={customer.contactName || ""} onChange={(value) => onChange({ ...customer, contactName: value })} />
          <TextField label="Email" value={customer.email || ""} onChange={(value) => onChange({ ...customer, email: value })} />
          <TextField label="Phone" value={customer.phone || ""} onChange={(value) => onChange({ ...customer, phone: value })} />
          <TextField label="Shipping Address 1" value={customer.shippingAddress1 || ""} onChange={(value) => onChange({ ...customer, shippingAddress1: value })} />
          <TextField label="Shipping Address 2" value={customer.shippingAddress2 || ""} onChange={(value) => onChange({ ...customer, shippingAddress2: value })} />
          <TextField label="City" value={customer.city || ""} onChange={(value) => onChange({ ...customer, city: value })} />
          <TextField label="State" value={customer.state || ""} onChange={(value) => onChange({ ...customer, state: value })} />
          <TextField label="Postal Code" value={customer.postalCode || ""} onChange={(value) => onChange({ ...customer, postalCode: value })} />
          <TextField label="Country" value={customer.country || ""} onChange={(value) => onChange({ ...customer, country: value })} />
        </div>
        <TextArea label="Notes" value={customer.notes || ""} onChange={(value) => onChange({ ...customer, notes: value })} rows={3} />
        <div className="subpanel top-gap">
          <div className="subpanel-header">
            <div>
              <h4>Linked Jobs</h4>
            </div>
          </div>
          <div className="record-list">
            {(customer.jobRefs || []).map((jobRef) => (
              <div key={jobRef.jobId} className="inline-card">
                <strong>{jobRef.jobNumber || jobRef.jobId}</strong>
                <span>{jobRef.status || "Open"}</span>
                <small>{formatDateTime(jobRef.updatedAt)}</small>
              </div>
            ))}
            {!customer.jobRefs?.length && <div className="empty-inline">No linked jobs yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobsView({
  busy,
  jobScreen,
  job,
  setJob,
  selectedPartId,
  selectedOperationId,
  workspace,
  onOpenJob,
  onCreateJob,
  onOpenPart,
  onOpenOperation,
  onBackToJobList,
  onBackToJob,
  onBackToPart,
  onImportSubtractPurchaseOrders,
  onImportXometryPurchaseOrders,
  onImportXometryIntoJob,
  onAssignNextJobNumber,
  onChooseOperationImages,
  onImportFusionToPart,
  onAddJobDocuments,
  onAddPartDocuments,
  onOpenJobDocument,
  onOpenPartDocument,
  onOpenJobDocumentRevision,
  onOpenPartDocumentRevision,
  onArchiveJobDocument,
  onArchivePartDocument,
  onUnarchiveJobDocument,
  onUnarchivePartDocument,
  onReviseJobDocument,
  onRevisePartDocument,
  onDeleteJobDocument,
  onDeletePartDocument,
  onSaveCustomer,
  onCreateInlineMaterial,
  onAddMaterialFamily,
  onAddMaterialAlloy
}) {
  const materials = workspace.materials || [];
  const instruments = workspace.instruments || [];
  const templates = workspace.templates || [];
  const customers = workspace.customers || [];
  const selectedPart = job?.parts?.find((part) => part.id === selectedPartId) || null;
  const selectedOperation = selectedPart?.operations?.find((operation) => operation.id === selectedOperationId) || null;

  const updateJob = (patch) => setJob((current) => ({ ...current, ...patch }));
  const updatePart = (partId, updater) => setJob((current) => ({
    ...current,
    parts: current.parts.map((part) => part.id === partId ? (typeof updater === "function" ? updater(part) : { ...part, ...updater }) : part)
  }));
  const addPart = () => setJob((current) => ({ ...current, parts: [...current.parts, blankPart()] }));
  const removePart = (partId) => setJob((current) => ({ ...current, parts: current.parts.filter((part) => part.id !== partId) }));
  const addOperation = (partId, templateId = "") => {
    const template = templates.find((item) => item.id === templateId);
    updatePart(partId, (part) => {
      const sequence = part.operations.length + 1;
      const operation = blankOperation(sequence);
      if (template) {
        operation.title = template.name;
        operation.type = template.category;
        operation.setupTemplateRefs = [template.id];
        operation.librarySelections = Object.fromEntries((template.libraryNames || []).map((libraryName) => [libraryName, []]));
        operation.parameters = (template.defaultParameters || []).map((item) => ({ ...blankParameter(), label: item.label || "", value: item.value || "" }));
        operation.instructionSteps = (template.defaultSteps || []).map((step) => blankInstructionStep(step));
        operation.workInstructions = (template.defaultSteps || []).join("\n");
      }
      return { ...part, operations: [...part.operations, operation] };
    });
  };
  const updateOperation = (partId, operationId, updater) => updatePart(partId, (part) => ({
    ...part,
    operations: part.operations.map((operation) => operation.id === operationId ? (typeof updater === "function" ? updater(operation) : { ...operation, ...updater }) : operation)
  }));
  const removeOperation = (partId, operationId) => updatePart(partId, (part) => ({
    ...part,
    operations: part.operations
      .filter((operation) => operation.id !== operationId)
      .map((operation, index) => ({ ...operation, sequence: index + 1 }))
  }));
  const moveOperation = (partId, operationId, direction) => updatePart(partId, (part) => {
    const currentIndex = part.operations.findIndex((operation) => operation.id === operationId);
    if (currentIndex < 0) {
      return part;
    }
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= part.operations.length) {
      return part;
    }
    const nextOperations = [...part.operations];
    const [movedOperation] = nextOperations.splice(currentIndex, 1);
    nextOperations.splice(targetIndex, 0, movedOperation);
    return {
      ...part,
      operations: nextOperations.map((operation, index) => ({
        ...operation,
        sequence: index + 1
      }))
    };
  });

  if (jobScreen === "list") {
    return <JobListScreen jobs={workspace.jobs} onOpenJob={onOpenJob} onCreateJob={onCreateJob} onImportSubtractPurchaseOrders={onImportSubtractPurchaseOrders} onImportXometryPurchaseOrders={onImportXometryPurchaseOrders} />;
  }

  if (!job) {
    return <EmptyState icon={Package} title="No job selected" text="Choose a job from the list or create a new one." actionLabel="New Job" onAction={onCreateJob} />;
  }

  if (jobScreen === "operation" && selectedPart && selectedOperation) {
    return (
      <OperationDetailScreen
        job={job}
        part={selectedPart}
        operation={selectedOperation}
        libraries={workspace.libraries || {}}
        templates={templates}
        onUpdate={(updater) => updateOperation(selectedPart.id, selectedOperation.id, updater)}
        onRemove={() => {
          removeOperation(selectedPart.id, selectedOperation.id);
          onBackToPart();
        }}
        onAddImages={async () => {
          return onChooseOperationImages(job.id, selectedPart.id, selectedOperation.id);
        }}
      />
    );
  }

  if (jobScreen === "part" && selectedPart) {
    return (
      <PartDetailScreen
        busy={busy}
        part={selectedPart}
        templates={templates}
        onUpdate={(updater) => updatePart(selectedPart.id, updater)}
        onRemove={() => {
          removePart(selectedPart.id);
          onBackToJob();
        }}
        onAddDocuments={() => onAddPartDocuments(selectedPart.id)}
        onOpenDocument={(documentId) => onOpenPartDocument(job.id, selectedPart.id, documentId)}
        onOpenRevision={(documentId, revisionIndex) => onOpenPartDocumentRevision(job.id, selectedPart.id, documentId, revisionIndex)}
        onArchiveDocument={(documentId, filename, archived) => {
          if (archived) {
            void onUnarchivePartDocument(selectedPart.id, documentId);
            return;
          }
          void onArchivePartDocument(selectedPart.id, documentId);
        }}
        onDeleteDocument={(documentId, filename) => {
          if (window.confirm(`Delete archived attachment ${filename}? This cannot be undone.`)) {
            void onDeletePartDocument(selectedPart.id, documentId);
          }
        }}
        onReviseDocument={(documentId) => onRevisePartDocument(selectedPart.id, documentId)}
        onAddOperation={addOperation}
        onImportFusion={onImportFusionToPart}
        onOpenOperation={(operationId) => onOpenOperation(selectedPart.id, operationId)}
        onMoveOperation={(operationId, direction) => moveOperation(selectedPart.id, operationId, direction)}
        materials={materials}
        constants={workspace.constants}
        preferences={workspace.preferences}
        onCreateInlineMaterial={onCreateInlineMaterial}
        onAddMaterialFamily={onAddMaterialFamily}
        onAddMaterialAlloy={onAddMaterialAlloy}
      />
    );
  }

  return (
      <JobDetailScreen
        busy={busy}
        job={job}
        constants={workspace.constants}
        customers={customers}
        updateJob={updateJob}
        onAddPart={addPart}
      onOpenPart={onOpenPart}
        onImportXometry={onImportXometryIntoJob}
        onAssignNextJobNumber={onAssignNextJobNumber}
        onAddDocuments={onAddJobDocuments}
        onOpenDocument={(documentId) => onOpenJobDocument(job.id, documentId)}
        onOpenRevision={(documentId, revisionIndex) => onOpenJobDocumentRevision(job.id, documentId, revisionIndex)}
        onArchiveDocument={(documentId, filename, archived) => {
          if (archived) {
            void onUnarchiveJobDocument(documentId);
            return;
          }
          void onArchiveJobDocument(documentId);
        }}
        onDeleteDocument={(documentId, filename) => {
          if (window.confirm(`Delete archived attachment ${filename}? This cannot be undone.`)) {
            void onDeleteJobDocument(documentId);
          }
        }}
        onReviseDocument={onReviseJobDocument}
        onSaveCustomer={onSaveCustomer}
      />
  );
}

function JobListScreen({ jobs, onOpenJob, onCreateJob, onImportSubtractPurchaseOrders, onImportXometryPurchaseOrders }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const filteredJobs = jobs.filter((item) => {
    if (!showArchived && item.active === false) {
      return false;
    }
    const haystack = [item.jobNumber, item.customer, item.routeSummary, item.id].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <section className="panel">
      <div className="panel-heading inline">
        <div>
          <h3>Jobs</h3>
          <span>{filteredJobs.length} visible records</span>
        </div>
        <div className="toolbar">
          <button onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
          <button onClick={onImportXometryPurchaseOrders}><Import size={15} /> Import Xometry PO</button>
          <button onClick={onImportSubtractPurchaseOrders}><Import size={15} /> Import Subtract PO</button>
          <button onClick={onCreateJob}><Plus size={15} /> New Job</button>
        </div>
      </div>
      <TextField label="Search Jobs" value={query} onChange={setQuery} placeholder="Job number, customer, route..." />
      <div className="record-list top-gap">
        {filteredJobs.map((item) => (
          <button key={item.id} className="record-list-item record-list-row" onClick={() => onOpenJob(item.id)}>
            <div className="record-row-primary">
              <strong>{item.jobNumber || item.id}</strong>
              <span>{item.customer || "No customer"}</span>
            </div>
            <div className="record-row-meta">
              <small>{item.dueDate || "No due date"}</small>
              <small>{item.status || "Open"}</small>
              <small>{item.partCount} parts</small>
              <small>{item.operationCount} ops</small>
            </div>
          </button>
        ))}
        {!filteredJobs.length && <div className="empty-inline">No jobs matched the current search.</div>}
      </div>
    </section>
  );
}

function JobDetailScreen({
  busy,
  job,
  constants,
  customers,
  updateJob,
  onAddPart,
  onOpenPart,
  onImportXometry,
  onAssignNextJobNumber,
  onAddDocuments,
  onOpenDocument,
  onOpenRevision,
  onArchiveDocument,
  onDeleteDocument,
  onReviseDocument,
  onSaveCustomer
}) {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState(null);
  const customerOptions = Array.from(new Set(["", job.customer || "", ...customers.map((customer) => customer.name)]));
  const linkedCustomer = customers.find((customer) => customer.id === job.customerId)
    || customers.find((customer) => customer.name === job.customer)
    || null;
  useEffect(() => {
    if (!customerDialogOpen) {
      return;
    }
    if (!customerDraft?.id) {
      setCustomerDialogOpen(false);
      return;
    }
    const latest = customers.find((customer) => customer.id === customerDraft.id);
    if (latest) {
      setCustomerDraft(latest);
    }
  }, [customers, customerDialogOpen, customerDraft?.id]);
  const linkCustomer = (customer) => {
    updateJob({
      customerId: customer?.id || "",
      customer: customer?.name || ""
    });
  };
  const openNewCustomer = () => {
    const draft = blankCustomer(job.customer || "");
    setCustomerDraft(draft);
    setCustomerDialogOpen(true);
  };
  const openExistingCustomer = () => {
    if (!linkedCustomer) {
      return;
    }
    setCustomerDraft(linkedCustomer);
    setCustomerDialogOpen(true);
  };
  return (
    <>
      <div className="workflow-stack">
        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Job Header</h3>
              <span>{job.parts.length} parts</span>
            </div>
          </div>
          <div className="form-grid job-header-grid">
            <label className="field">
              <span>Job Number</span>
              <div className="field-action-row">
                <input value={job.jobNumber || ""} onChange={(event) => updateJob({ jobNumber: event.target.value })} />
                <button
                  className="primary-button inline-action-button"
                  onClick={onAssignNextJobNumber}
                  disabled={Boolean(job.jobNumber?.trim())}
                >
                  Assign Number
                </button>
              </div>
            </label>
            <label className="field">
              <span>Customer</span>
              <div className="field-action-row">
                <select
                  value={job.customer || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    const selected = customers.find((customer) => customer.name === value) || null;
                    updateJob({
                      customerId: selected?.id || "",
                      customer: value
                    });
                  }}
                >
                  {customerOptions.map((option) => (
                    <option key={`customer-${option || "empty"}`} value={option}>
                      {option || "No customer"}
                    </option>
                  ))}
                </select>
                <div className="tiny-toolbar">
                  <button className="inline-action-button" onClick={openNewCustomer}><Plus size={13} /> New</button>
                  <button className="inline-action-button" onClick={openExistingCustomer} disabled={!linkedCustomer}>Edit</button>
                </div>
              </div>
            </label>
            <SelectField label="Status" value={job.status} options={constants.jobStatuses} onChange={(value) => updateJob({ status: value })} />
            <TextField label="Due Date" type="date" value={job.dueDate} onChange={(value) => updateJob({ dueDate: value })} />
            <SelectField label="Priority" value={job.priority} options={constants.priorities} onChange={(value) => updateJob({ priority: value })} />
            <label className="field">
              <span>Last Changed</span>
              <div className="static-field">{formatDateTime(job.updatedAt)}</div>
            </label>
          </div>
          <TextArea label="Job Notes" value={job.notes || ""} onChange={(value) => updateJob({ notes: value })} rows={3} />
        </section>
        <div className="record-grid job-detail-columns">
          <section className="panel">
            <div className="panel-heading inline">
              <div>
                <h3>Parts</h3>
                <span>{job.parts.length} total</span>
              </div>
              <div className="toolbar">
                <button onClick={onImportXometry} disabled={busy || !job.id}><Import size={14} /> Import Xometry Traveler</button>
                <button onClick={onAddPart}><Plus size={15} /> Part</button>
              </div>
            </div>
            <div className="record-list">
              {job.parts.map((part) => (
                <button key={part.id} className="record-list-item" onClick={() => onOpenPart(part.id)}>
                  <strong>{part.partNumber || part.partName || "New Part"}</strong>
                  <span>{part.materialSpec || "No material spec"}</span>
                  <small>{part.operations.length} operations</small>
                </button>
              ))}
              {!job.parts.length && <div className="empty-inline">No parts yet. Add a part or import a traveler when you are ready.</div>}
            </div>
          </section>
          <DocumentsPanel
            title="Job Attachments"
            documents={job.documents || []}
            onAddDocuments={onAddDocuments}
            onOpenDocument={onOpenDocument}
            onOpenRevision={onOpenRevision}
            onArchiveDocument={onArchiveDocument}
            onDeleteDocument={onDeleteDocument}
            onReviseDocument={onReviseDocument}
            emptyText="No job attachments attached yet."
          />
        </div>
      </div>
      <CustomerDialog
        open={customerDialogOpen}
        customer={customerDraft}
        onChange={setCustomerDraft}
        onClose={() => setCustomerDialogOpen(false)}
        onSaveCustomer={onSaveCustomer}
        onLinked={linkCustomer}
      />
    </>
  );
}
function PartDetailScreen({
  busy,
  part,
  templates,
  materials,
  constants,
  preferences,
  onUpdate,
  onRemove,
  onAddDocuments,
  onOpenDocument,
  onOpenRevision,
  onArchiveDocument,
  onDeleteDocument,
  onReviseDocument,
  onAddOperation,
  onImportFusion,
  onOpenOperation,
  onMoveOperation,
  onCreateInlineMaterial,
  onAddMaterialFamily,
  onAddMaterialAlloy
}) {
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const updateField = (patch) => onUpdate((current) => ({ ...current, ...patch }));
  const updateRevision = (patch) => onUpdate((current) => ({ ...current, revision: { ...current.revision, ...patch } }));
  const selectedMaterials = (materials || []).filter((item) => (part.requiredMaterialLots || []).includes(item.id));

  return (
    <div className="workflow-stack">
      <div className="record-grid job-detail-columns">
        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Part Detail</h3>
              <span>{part.operations.length} operations</span>
            </div>
            <div className="toolbar">
              <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove Part</button>
            </div>
          </div>
          <div className="form-grid compact-4">
            <TextField label="Part Number" value={part.partNumber} onChange={(value) => updateField({ partNumber: value })} />
            <TextField label="Part Name" value={part.partName} onChange={(value) => updateField({ partName: value })} />
            <TextField label="Quantity" value={part.quantity} onChange={(value) => updateField({ quantity: value })} />
            <TextField label="Material Spec" value={part.materialSpec} onChange={(value) => updateField({ materialSpec: value })} />
            <TextField label="Part Revision" value={part.revision?.number || ""} onChange={(value) => updateRevision({ number: value })} />
            <TextField label="Revision Date" type="date" value={part.revision?.date || ""} onChange={(value) => updateRevision({ date: value })} />
          </div>
          <div className="subpanel top-gap">
            <div className="subpanel-header">
              <div>
                <h4>Part Materials</h4>
                <span>{selectedMaterials.length} linked / {part.customMaterialText ? "Other set" : "No other material"}</span>
              </div>
              <button onClick={() => setShowMaterialPicker(true)}><Database size={14} /> Select Materials</button>
            </div>
            <div className="summary-lines">
              {selectedMaterials.map((item) => (
                <p key={item.id} className="summary-line"><strong>{item.serialCode}</strong><span>{[item.materialFamily, materialDisplayType(item)].filter(Boolean).join(" / ") || "-"}</span></p>
              ))}
              {!selectedMaterials.length && <div className="empty-inline">No linked material records.</div>}
              {part.customMaterialText && <p className="summary-line"><strong>Other</strong><span>{part.customMaterialText}</span></p>}
            </div>
          </div>
          <TextArea label="Part Notes" value={part.notes || ""} onChange={(value) => updateField({ notes: value })} rows={3} />
        </section>

        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Operations</h3>
              <span>{part.operations.length} total</span>
            </div>
            <div className="toolbar">
              <button onClick={() => onImportFusion(part.id)} disabled={busy}><Import size={14} /> From Fusion</button>
              <select className="compact-select" defaultValue="" disabled={busy} onChange={(event) => event.target.value && onAddOperation(part.id, event.target.value)}>
                <option value="">Add From Template</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <button onClick={() => onAddOperation(part.id, "")} disabled={busy}><Plus size={14} /> Blank Operation</button>
            </div>
          </div>
          <div className="record-list">
            {part.operations.map((operation) => (
              <button key={operation.id} className="record-list-item record-list-row" onClick={() => onOpenOperation(operation.id)}>
                <div className="record-row-primary">
                  <strong>{operation.title || "Operation"}</strong>
                </div>
                <div className="record-row-meta">
                  <small>{operation.type || "General"}</small>
                  <small>{operation.tools?.length || 0} tools</small>
                  <div className="tiny-toolbar">
                    <button
                      type="button"
                      className="inline-action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveOperation(operation.id, -1);
                      }}
                      disabled={operation.sequence <= 1}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="inline-action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveOperation(operation.id, 1);
                      }}
                      disabled={operation.sequence >= part.operations.length}
                    >
                      Down
                    </button>
                  </div>
                </div>
              </button>
            ))}
            {!part.operations.length && <div className="empty-inline">No operations yet. Add one when you are ready.</div>}
          </div>
        </section>
      </div>

      <DocumentsPanel
        title="Part Attachments"
        documents={part.documents || []}
        onAddDocuments={onAddDocuments}
        onOpenDocument={onOpenDocument}
        onOpenRevision={onOpenRevision}
        onArchiveDocument={onArchiveDocument}
        onDeleteDocument={onDeleteDocument}
        onReviseDocument={onReviseDocument}
        emptyText="No part attachments attached yet."
      />

      <MaterialPickerDialog
        open={showMaterialPicker}
        materials={materials}
        constants={constants}
        preferences={preferences}
        selectedIds={part.requiredMaterialLots || []}
        customMaterialText={part.customMaterialText || ""}
        singleSelect
        onClose={() => setShowMaterialPicker(false)}
        onApply={({ selectedIds, customMaterialText }) => {
          updateField({ requiredMaterialLots: selectedIds, customMaterialText });
          setShowMaterialPicker(false);
        }}
        onCreateInlineMaterial={onCreateInlineMaterial}
        onAddMaterialFamily={onAddMaterialFamily}
        onAddMaterialAlloy={onAddMaterialAlloy}
      />
    </div>
  );
}

function OperationDetailScreen({
  job,
  part,
  operation,
  libraries,
  templates,
  onUpdate,
  onRemove,
  onAddImages,
}) {
  const updateField = (patch) => onUpdate((current) => ({ ...current, ...patch }));
  const updateInstructionSteps = (updater) => onUpdate((current) => {
    const currentSteps = instructionStepsFromOperation(current);
    const nextSteps = typeof updater === "function" ? updater(currentSteps) : updater;
    return {
      ...current,
      instructionSteps: nextSteps,
      workInstructions: serializeInstructionSteps(nextSteps),
      stepImages: nextSteps.flatMap((step) => step.images || [])
    };
  });
  const updateParameter = (parameterId, patch) => onUpdate((current) => ({
    ...current,
    parameters: current.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...patch } : parameter)
  }));
  const addParameter = () => onUpdate((current) => ({ ...current, parameters: [...current.parameters, blankParameter()] }));
  const removeParameter = (parameterId) => onUpdate((current) => ({ ...current, parameters: current.parameters.filter((parameter) => parameter.id !== parameterId) }));
  const updateTool = (toolId, patch) => onUpdate((current) => ({
    ...current,
    tools: (current.tools || []).map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool)
  }));
  const addTool = () => onUpdate((current) => ({ ...current, tools: [...(current.tools || []), blankOperationTool()] }));
  const removeTool = (toolId) => onUpdate((current) => ({ ...current, tools: (current.tools || []).filter((tool) => tool.id !== toolId) }));
  const instructionSteps = instructionStepsFromOperation(operation);
  const assignedLibraryNames = selectedLibraryNamesForOperation(operation, templates);
  const supportsTooling = ["milling", "turning"].includes(String(operation.type || "").toLowerCase());
  const moveParameter = (parameterId, direction) => onUpdate((current) => {
    const currentIndex = (current.parameters || []).findIndex((parameter) => parameter.id === parameterId);
    if (currentIndex < 0) {
      return current;
    }
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= (current.parameters || []).length) {
      return current;
    }
    const nextParameters = [...(current.parameters || [])];
    const [moved] = nextParameters.splice(currentIndex, 1);
    nextParameters.splice(targetIndex, 0, moved);
    return {
      ...current,
      parameters: nextParameters
    };
  });
  const updateLibrarySelection = (libraryName, recordId) => onUpdate((current) => {
    return {
      ...current,
      librarySelections: {
        ...(current.librarySelections || {}),
        [libraryName]: recordId ? [recordId] : []
      }
    };
  });

  const addInstructionStep = () => updateInstructionSteps((current) => [...current, blankInstructionStep("")]);
  const changeInstructionStep = (stepId, text) => updateInstructionSteps((current) => current.map((step) => step.id === stepId ? { ...step, text } : step));
  const removeInstructionStep = (stepId) => updateInstructionSteps((current) => current.filter((step) => step.id !== stepId));
  const moveInstructionStep = (stepId, direction) => updateInstructionSteps((current) => {
    const currentIndex = current.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) {
      return current;
    }
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= current.length) {
      return current;
    }
    const nextSteps = [...current];
    const [movedStep] = nextSteps.splice(currentIndex, 1);
    nextSteps.splice(targetIndex, 0, movedStep);
    return nextSteps;
  });
  const addImagesToStep = async (stepId) => {
    const images = await onAddImages();
    if (!images?.length) {
      return;
    }
    updateInstructionSteps((current) => current.map((step) => step.id === stepId ? { ...step, images: [...(step.images || []), ...images] } : step));
  };

  return (
    <>
      <div className="workflow-stack">
        <div className="record-grid job-detail-columns">
          <div className="workflow-stack">
            <section className="panel">
              <div className="panel-heading inline">
                <div>
                  <h3>Operation Detail</h3>
                  <span>{job.jobNumber || job.id} / {part.partNumber || part.partName || part.id}</span>
                </div>
                <div className="toolbar">
                  <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove Operation</button>
                </div>
              </div>

              <div className="form-grid compact-4">
                <TextField label="Title" value={operation.title || ""} onChange={(value) => updateField({ title: value })} />
                <TextField label="Work Center" value={operation.workCenter || ""} onChange={(value) => updateField({ workCenter: value })} />
                <label className="field">
                  <span>Type</span>
                  <div className="static-field">{operation.type || OPERATION_TYPE_OPTIONS[0]}</div>
                </label>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Operation Steps</h3>
                </div>
              </div>

              <div className="template-editor-block">
                <div className="subpanel-header">
                  <div>
                    <h4>Steps</h4>
                    <span>{instructionSteps.length} step{instructionSteps.length === 1 ? "" : "s"}</span>
                  </div>
                  <button onClick={addInstructionStep}><Plus size={14} /> Step</button>
                </div>
                <div className="instruction-step-list">
                  {instructionSteps.map((step, index) => (
                    <div key={step.id} className="instruction-step-card">
                      <div className="subpanel-header">
                        <div>
                          <h5>Step {index + 1}</h5>
                          <span>{step.images?.length || 0} photo{(step.images?.length || 0) === 1 ? "" : "s"}</span>
                        </div>
                        <div className="toolbar">
                          <button onClick={() => moveInstructionStep(step.id, -1)} disabled={index === 0}>Up</button>
                          <button onClick={() => moveInstructionStep(step.id, 1)} disabled={index >= instructionSteps.length - 1}>Down</button>
                          <button onClick={() => void addImagesToStep(step.id)}><FolderOpen size={14} /> Photos</button>
                          <button className="danger subtle" onClick={() => removeInstructionStep(step.id)}><X size={14} /> Remove</button>
                        </div>
                      </div>
                      <TextArea label="Instruction" value={step.text || ""} onChange={(value) => changeInstructionStep(step.id, value)} rows={2} />
                      <div className="image-strip">
                        {(step.images || []).map((image) => (
                          <figure key={image.id} className="image-chip">
                            <img src={api.assetUrl(image.relativePath)} alt={image.name || "Step photo"} />
                            <figcaption>{image.name}</figcaption>
                          </figure>
                        ))}
                        {!step.images?.length && <div className="empty-inline">No photos attached to this step.</div>}
                      </div>
                    </div>
                  ))}
                  {!instructionSteps.length && <div className="empty-inline">No operation steps yet.</div>}
                </div>
              </div>
              <TextArea label="Operation Notes" value={operation.notes || ""} onChange={(value) => updateField({ notes: value })} rows={2} />
            </section>
          </div>

          <div className="workflow-stack">
            <section className="panel">
              <div className="subpanel-header">
                <div>
                  <h4>Parameters</h4>
                </div>
                <button onClick={addParameter}><Plus size={14} /> Parameter</button>
              </div>
              <div className="parameter-list">
                {operation.parameters.map((parameter) => (
                  <div className="parameter-row" key={parameter.id}>
                    <input value={parameter.label} placeholder="Label" onChange={(event) => updateParameter(parameter.id, { label: event.target.value })} />
                    <input value={parameter.value} placeholder="Value" onChange={(event) => updateParameter(parameter.id, { value: event.target.value })} />
                    <div className="tiny-toolbar parameter-actions">
                      <button type="button" className="inline-action-button" onClick={() => moveParameter(parameter.id, -1)} disabled={operation.parameters.findIndex((item) => item.id === parameter.id) === 0}>Up</button>
                      <button type="button" className="inline-action-button" onClick={() => moveParameter(parameter.id, 1)} disabled={operation.parameters.findIndex((item) => item.id === parameter.id) === operation.parameters.length - 1}>Down</button>
                      <button className="danger subtle square" onClick={() => removeParameter(parameter.id)}><X size={13} /></button>
                    </div>
                  </div>
                ))}
                {assignedLibraryNames.map((libraryName) => {
                  const library = libraries?.[libraryName] || null;
                  const selectedId = operation.librarySelections?.[libraryName]?.[0] || "";
                  const availableRecords = (library?.records || []).filter((record) => record.active !== false);
                  const hasMissingValue = selectedId && !availableRecords.some((record) => record.id === selectedId);
                  return (
                    <div className="parameter-row" key={`library-${libraryName}`}>
                      <div className="static-field">{library?.label || libraryName}</div>
                      <select
                        value={selectedId}
                        onChange={(event) => updateLibrarySelection(libraryName, event.target.value)}
                        disabled={!availableRecords.length}
                      >
                        <option value="">{availableRecords.length ? "Select item" : "No records available"}</option>
                        {hasMissingValue ? <option value={selectedId}>Missing record</option> : null}
                        {availableRecords.map((record) => (
                          <option key={record.id} value={record.id}>{record.name}</option>
                        ))}
                      </select>
                      <div />
                    </div>
                  );
                })}
                {!operation.parameters.length && !assignedLibraryNames.length && <div className="empty-inline">No parameters yet.</div>}
              </div>
            </section>

            {supportsTooling ? (
              <section className="panel">
                <div className="subpanel-header">
                  <div>
                    <h4>Tools</h4>
                    <span>{operation.tools?.length || 0} saved with this operation</span>
                  </div>
                  <button onClick={addTool}><Plus size={14} /> Tool</button>
                </div>
                <div className="job-tools-grid">
                  {(operation.tools || []).map((tool) => (
                    <div key={tool.id} className="tool-card">
                      <div className="form-grid compact">
                        <TextField label="Tool" value={tool.name || ""} onChange={(value) => updateTool(tool.id, { name: value })} />
                        <TextField label="Diameter" value={tool.diameter || ""} onChange={(value) => updateTool(tool.id, { diameter: value })} />
                        <TextField label="Stickout" value={tool.length || ""} onChange={(value) => updateTool(tool.id, { length: value })} />
                        <TextField label="Holder" value={tool.holder || ""} onChange={(value) => updateTool(tool.id, { holder: value })} />
                      </div>
                      <TextArea label="Details" value={tool.details || ""} onChange={(value) => updateTool(tool.id, { details: value })} rows={3} />
                      <div className="tool-card-actions">
                        <button className="danger subtle" onClick={() => removeTool(tool.id)}><X size={14} /> Remove</button>
                      </div>
                    </div>
                  ))}
                  {!operation.tools?.length && <div className="empty-inline">No tools saved with this operation.</div>}
                </div>
              </section>
            ) : null}
          </div>
        </div>

      </div>

    </>
  );
}

function MaterialPickerDialog({
  open,
  materials,
  constants,
  preferences,
  selectedIds,
  customMaterialText,
  singleSelect = false,
  onClose,
  onApply,
  onCreateInlineMaterial,
  onAddMaterialFamily,
  onAddMaterialAlloy
}) {
  const [query, setQuery] = useState("");
  const [materialFamily, setMaterialFamily] = useState("All");
  const [materialAlloy, setMaterialAlloy] = useState("All");
  const [form, setForm] = useState("All");
  const [status, setStatus] = useState("Active");
  const [traceabilityLevel, setTraceabilityLevel] = useState("All");
  const [page, setPage] = useState(0);
  const [localSelectedIds, setLocalSelectedIds] = useState(selectedIds);
  const [otherText, setOtherText] = useState(customMaterialText);
  const [creating, setCreating] = useState(false);
  const [draftMaterial, setDraftMaterial] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setMaterialFamily("All");
    setMaterialAlloy("All");
    setForm("All");
    setStatus("Active");
    setTraceabilityLevel("All");
    setPage(0);
    setLocalSelectedIds(selectedIds);
    setOtherText(customMaterialText);
    setCreating(false);
    setDraftMaterial(null);
  }, [open, selectedIds, customMaterialText]);

  const toggleSelection = (materialId) => {
    setLocalSelectedIds((current) => {
      if (singleSelect) {
        return current.includes(materialId) ? [] : [materialId];
      }
      return current.includes(materialId) ? current.filter((item) => item !== materialId) : [...current, materialId];
    });
  };

  const startCreateMaterial = async () => {
    const serial = await api.generateMaterialSerial().catch(() => "");
    setDraftMaterial(syncMaterialClassification(
      updateMaterialWithShape({ ...blankMaterial(), serialCode: serial }, { form: constants.material.forms[0] || "" }),
      preferences
    ));
    setCreating(true);
  };

  const saveInlineMaterial = async () => {
    if (!draftMaterial) {
      return;
    }
    const saved = await onCreateInlineMaterial(draftMaterial);
    setLocalSelectedIds((current) => {
      if (singleSelect) {
        return [saved.id];
      }
      return current.includes(saved.id) ? current : [...current, saved.id];
    });
    setDraftMaterial(syncMaterialClassification(saved, preferences));
  };

  useAutoSave({
    value: creating ? draftMaterial : null,
    resetKey: creating ? `inline-material:${draftMaterial?.id || "new"}` : "inline-material:closed",
    enabled: Boolean(creating && draftMaterial),
    isReady: (current) => Boolean(current?.supplier && materialDisplayType(current)),
    save: saveInlineMaterial,
    onSaved: (saved) => {
      if (saved) {
        setDraftMaterial(syncMaterialClassification(saved, preferences));
      }
    }
  });

  if (!open) {
    return null;
  }

  const filteredMaterials = materials.filter((material) => materialMatchesFilters(material, {
    query,
    materialFamily,
    materialAlloy,
    supplier: "",
    form,
    status,
    traceabilityLevel
  }));
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filteredMaterials.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel">
        {!creating ? (
          <>
            <div className="panel-heading inline">
              <div>
                <h3>Pick Materials</h3>
                <span>{filteredMaterials.length} matching records</span>
              </div>
              <div className="toolbar">
                <button onClick={startCreateMaterial}><Plus size={14} /> New Material</button>
                <button className="danger subtle" onClick={onClose}><X size={14} /> Close</button>
              </div>
            </div>
            <div className="search-grid materials-search-grid">
              <TextField label="Search" value={query} onChange={(value) => { setQuery(value); setPage(0); }} placeholder="Serial, alloy, supplier, PO, heat, lot..." />
              <SelectField
                label="Material"
                value={materialFamily}
                options={["All", ...materialFamilyOptions(preferences)]}
                onChange={(value) => {
                  setMaterialFamily(value);
                  setMaterialAlloy("All");
                  setPage(0);
                }}
              />
              <SelectField
                label="Alloy"
                value={materialAlloy}
                options={["All", ...(materialFamily === "All"
                  ? Array.from(new Set(materialFamilyList(preferences).flatMap((family) => family.alloys || []))).sort((a, b) => a.localeCompare(b))
                  : materialAlloyOptions(preferences, materialFamily))]}
                onChange={(value) => { setMaterialAlloy(value); setPage(0); }}
              />
              <SelectField
                label="Shape"
                value={form}
                options={["All", ...constants.material.forms]}
                onChange={(value) => { setForm(value); setPage(0); }}
              />
              <SelectField
                label="Traceability"
                value={traceabilityLevel}
                options={["All", ...constants.material.traceabilityLevels]}
                onChange={(value) => { setTraceabilityLevel(value); setPage(0); }}
              />
              <SelectField
                label="Status"
                value={status}
                options={MATERIAL_STATUS_FILTERS}
                onChange={(value) => { setStatus(value); setPage(0); }}
              />
            </div>
            <div className="table-wrap top-gap dialog-results">
              <table className="materials-table">
                <thead>
                  <tr>
                    <th>Use</th>
                    {MATERIAL_RESULT_COLUMNS.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => (
                    <tr key={item.id} className={localSelectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleSelection(item.id)}>
                      <td>
                        <input
                          type={singleSelect ? "radio" : "checkbox"}
                          name={singleSelect ? "material-picker-selection" : undefined}
                          checked={localSelectedIds.includes(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      {MATERIAL_RESULT_COLUMNS.map((column) => (
                        <td key={column.key}>
                          {column.key === "status"
                            ? <span className={`status-pill ${item.status || "active"}`}>{materialCellValue(item, column.key)}</span>
                            : materialCellValue(item, column.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pageItems.length && <div className="empty-inline">No material records matched the current search.</div>}
            </div>
            <div className="dialog-pagination">
              <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0}>Previous</button>
              <span>Page {currentPage + 1} of {totalPages}</span>
              <button onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={currentPage >= totalPages - 1}>Next</button>
            </div>
            <TextArea label="Other Material" value={otherText} onChange={setOtherText} rows={3} />
            <div className="dialog-actions">
              <button onClick={onClose}>Cancel</button>
              <button onClick={() => onApply({ selectedIds: localSelectedIds, customMaterialText: otherText.trim() })}>Apply Selection</button>
            </div>
          </>
        ) : (
          <>
            <div className="panel-heading inline">
              <div>
                <h3>New Material</h3>
                <span>Create a record without leaving this operation.</span>
              </div>
              <button className="danger subtle" onClick={() => setCreating(false)}><X size={14} /> Cancel</button>
            </div>
            <div className="form-grid">
              <TextField label="Serial Code" value={draftMaterial?.serialCode || ""} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { serialCode: value }))} />
              <MaterialClassificationFields
                material={draftMaterial}
                preferences={preferences}
                onChange={(patch) => setDraftMaterial((current) => updateMaterialRecord(current, patch, preferences))}
                onAddFamily={onAddMaterialFamily}
                onAddAlloy={onAddMaterialAlloy}
              />
              <SelectField label="Shape" value={draftMaterial?.form || constants.material.forms[0]} options={constants.material.forms} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { form: value, shapeDimensions: {}, dimensions: "" }))} />
              <TextField label="Supplier" value={draftMaterial?.supplier || ""} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { supplier: value }))} />
              <TextField label="Date Received" type="date" value={draftMaterial?.dateReceived || ""} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { dateReceived: value }))} />
              <MaterialShapeFields
                material={draftMaterial}
                onChange={(shapeDimensions) => setDraftMaterial((current) => updateMaterialWithShape(current, { shapeDimensions }))}
              />
              <SelectField label="Traceability" value={draftMaterial?.traceabilityLevel || constants.material.traceabilityLevels[0]} options={constants.material.traceabilityLevels} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { traceabilityLevel: value }))} />
            </div>
            <TextArea label="Notes" value={draftMaterial?.notes || ""} onChange={(value) => setDraftMaterial((current) => updateMaterialWithShape(current, { notes: value }))} rows={3} />
            <div className="dialog-actions">
              <button onClick={() => { setCreating(false); setDraftMaterial(null); }}>Cancel</button>
              <button onClick={() => setCreating(false)} disabled={!draftMaterial?.updatedAt}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MaterialShapeFields({ material, onChange }) {
  const fields = shapeFieldsForForm(material?.form);
  const shapeDimensions = material?.shapeDimensions || {};
  const updateField = (key, value) => onChange({ ...shapeDimensions, [key]: value });

  return fields.map((field) => (
    <TextField
      key={field.key}
      label={field.label}
      value={shapeDimensions[field.key] || ""}
      onChange={(value) => updateField(field.key, value)}
    />
  ));
}

function RecordChecklist({ title, items, selected, onToggle }) {
  return (
    <div className="checklist">
      <h5>{title}</h5>
      <div className="checklist-items">
        {items.map((item) => (
          <label key={item.id} className="check-row">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
            <span>{item.label}</span>
          </label>
        ))}
        {!items.length && <div className="empty-inline">No records available.</div>}
      </div>
    </div>
  );
}

function LegacyMaterialsView({ workspace, material, setMaterial, onOpenMaterial, onCreateNew }) {
  return (
    <div className="workspace-columns">
      <section className="panel thin">
        <div className="panel-heading inline">
          <div>
            <h3>Material Lots</h3>
            <span>Traceable cert-controlled stock records</span>
          </div>
          <button onClick={onCreateNew}><Plus size={14} /> New</button>
        </div>
        <div className="record-list">
          {workspace.materials.map((item) => (
            <button key={item.id} className={`record-list-item ${material?.id === item.id ? "selected" : ""}`} onClick={() => onOpenMaterial(item.id)}>
              <strong>{item.serialCode}</strong>
              <span>{item.materialType}</span>
              <small>{item.traceabilityLevel} • {item.status}</small>
            </button>
          ))}
        </div>
      </section>

      {!material ? (
        <EmptyState icon={Database} title="No material selected" text="Choose a material record or create a new one." actionLabel="New Material" onAction={onCreateNew} />
      ) : (
      <>
      <section className="panel">
        <div className="panel-heading">
          <h3>Material Record</h3>
          <span>Human-readable canonical lot record</span>
        </div>
        <div className="form-grid">
          <TextField label="Serial Code" value={material.serialCode || ""} onChange={(value) => setMaterial((current) => ({ ...current, serialCode: value }))} />
          <TextField label="Material Type" value={material.materialType || ""} onChange={(value) => setMaterial((current) => ({ ...current, materialType: value }))} />
          <SelectField label="Form" value={material.form || workspace.constants.material.forms[0]} options={workspace.constants.material.forms} onChange={(value) => setMaterial((current) => ({ ...current, form: value }))} />
          <TextField label="Supplier" value={material.supplier || ""} onChange={(value) => setMaterial((current) => ({ ...current, supplier: value }))} />
          <TextField label="Date Received" type="date" value={material.dateReceived || ""} onChange={(value) => setMaterial((current) => ({ ...current, dateReceived: value }))} />
          <TextField label="Purchase Order" value={material.purchaseOrder || ""} onChange={(value) => setMaterial((current) => ({ ...current, purchaseOrder: value }))} />
          <TextField label="Heat Number" value={material.heatNumber || ""} onChange={(value) => setMaterial((current) => ({ ...current, heatNumber: value }))} />
          <TextField label="Lot Number" value={material.lotNumber || ""} onChange={(value) => setMaterial((current) => ({ ...current, lotNumber: value }))} />
          <TextField label="Material Spec" value={material.materialSpec || ""} onChange={(value) => setMaterial((current) => ({ ...current, materialSpec: value }))} />
          <TextField label="Dimensions" value={material.dimensions || ""} onChange={(value) => setMaterial((current) => ({ ...current, dimensions: value }))} />
          <SelectField label="Traceability" value={material.traceabilityLevel || workspace.constants.material.traceabilityLevels[0]} options={workspace.constants.material.traceabilityLevels} onChange={(value) => setMaterial((current) => ({ ...current, traceabilityLevel: value }))} />
          <TextField label="Storage Location" value={material.storageLocation || ""} onChange={(value) => setMaterial((current) => ({ ...current, storageLocation: value }))} />
        </div>
        <TextArea label="Notes" value={material.notes || ""} onChange={(value) => setMaterial((current) => ({ ...current, notes: value }))} rows={4} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Traceability</h3>
          <span>Job usage and attachments</span>
        </div>
        <div className="stack-list">
          <div className="subpanel">
            <div className="subpanel-header">
              <h4>Usage References</h4>
              <span>{material.usageRefs?.length || 0} links</span>
            </div>
            {(material.usageRefs || []).map((ref) => (
              <div key={`${ref.jobId}-${ref.operationId}`} className="inline-card">
                <strong>{ref.jobNumber || ref.jobId}</strong>
                <span>{ref.partNumber || ref.partId} • {ref.operationCode || ref.operationId}</span>
              </div>
            ))}
            {!material.usageRefs?.length && <div className="empty-inline">No linked job usage yet.</div>}
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h4>Attachments</h4>
              <span>{material.attachments?.length || 0} files</span>
            </div>
            {(material.attachments || []).map((attachment) => (
              <div key={attachment.id} className="inline-card">
                <strong>{attachment.originalFilename}</strong>
                <span>{attachment.attachmentCategory || "Other"}</span>
              </div>
            ))}
            {!material.attachments?.length && <div className="empty-inline">No attachments copied into the managed file tree.</div>}
          </div>
        </div>
      </section>
      </>
      )}
    </div>
  );
}

function MaterialClassificationFields({ material, preferences, onChange, onAddFamily, onAddAlloy }) {
  const familyOptions = materialFamilyOptions(preferences);
  const alloyOptions = materialAlloyOptions(preferences, material?.materialFamily || "");
  const [newFamilyOpen, setNewFamilyOpen] = useState(false);
  const [newAlloyOpen, setNewAlloyOpen] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newAlloyName, setNewAlloyName] = useState("");

  const saveFamily = async () => {
    if (!onAddFamily) return;
    const saved = await onAddFamily(newFamilyName);
    onChange({ materialFamily: saved, materialAlloy: "" });
    setNewFamilyName("");
    setNewFamilyOpen(false);
  };

  const saveAlloy = async () => {
    if (!onAddAlloy) return;
    const saved = await onAddAlloy(material?.materialFamily || "", newAlloyName);
    onChange({ materialAlloy: saved });
    setNewAlloyName("");
    setNewAlloyOpen(false);
  };

  return (
    <>
      <label className="field">
        <span>Material</span>
        <div className="field-action-row">
          <select
            value={material?.materialFamily || ""}
            onChange={(event) => {
              const value = event.target.value;
              onChange({
                materialFamily: value,
                materialAlloy: alloyOptions.includes(material?.materialAlloy) && value === material?.materialFamily ? material.materialAlloy : ""
              });
            }}
          >
            {["", ...familyOptions].map((option) => (
              <option key={`material-family-${option || "empty"}`} value={option}>
                {option || "Choose material"}
              </option>
            ))}
          </select>
          {onAddFamily ? (
            <button type="button" className="inline-action-button" onClick={() => setNewFamilyOpen((current) => !current)}>
              <Plus size={13} /> New
            </button>
          ) : null}
        </div>
        {newFamilyOpen ? (
          <div className="mini-inline-editor">
            <input value={newFamilyName} placeholder="New material" onChange={(event) => setNewFamilyName(event.target.value)} />
            <button type="button" className="inline-action-button" onClick={() => void saveFamily()}>Add</button>
            <button type="button" className="inline-action-button" onClick={() => { setNewFamilyOpen(false); setNewFamilyName(""); }}>Cancel</button>
          </div>
        ) : null}
      </label>
      <label className="field">
        <span>Alloy</span>
        <div className="field-action-row">
          <select
            value={material?.materialAlloy || ""}
            onChange={(event) => onChange({ materialAlloy: event.target.value })}
          >
            {["", ...alloyOptions].map((option) => (
              <option key={`material-alloy-${option || "empty"}`} value={option}>
                {option || "Choose alloy"}
              </option>
            ))}
          </select>
          {onAddAlloy ? (
            <button type="button" className="inline-action-button" onClick={() => setNewAlloyOpen((current) => !current)} disabled={!material?.materialFamily}>
              <Plus size={13} /> New
            </button>
          ) : null}
        </div>
        {newAlloyOpen ? (
          <div className="mini-inline-editor">
            <input value={newAlloyName} placeholder="New alloy" onChange={(event) => setNewAlloyName(event.target.value)} />
            <button type="button" className="inline-action-button" onClick={() => void saveAlloy()} disabled={!material?.materialFamily}>Add</button>
            <button type="button" className="inline-action-button" onClick={() => { setNewAlloyOpen(false); setNewAlloyName(""); }}>Cancel</button>
          </div>
        ) : null}
      </label>
    </>
  );
}

function MaterialDetailScreen({
  workspace,
  material,
  onBack,
  onChange,
  onAddAttachments,
  canAddAttachments,
  onOpenAttachment,
  onOpenAttachmentRevision,
  onArchiveAttachment,
  onUnarchiveAttachment,
  onReviseAttachment,
  onDeleteAttachment,
  onAddMaterialFamily,
  onAddMaterialAlloy
}) {
  return (
    <div className="workflow-stack">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>{material.serialCode || "New Material"}</h3>
            <span>{[material.materialFamily, materialDisplayType(material)].filter(Boolean).join(" / ") || "Material detail"}</span>
          </div>
          <div className="toolbar">
            <button onClick={onAddAttachments} disabled={!canAddAttachments}><FolderOpen size={14} /> Add Attachments</button>
          </div>
        </div>

        <div className="form-grid compact-3 material-detail-grid">
          <TextField label="Serial Code" value={material.serialCode || ""} onChange={(value) => onChange({ serialCode: value })} />
          <MaterialClassificationFields
            material={material}
            preferences={workspace.preferences}
            onChange={onChange}
            onAddFamily={onAddMaterialFamily}
            onAddAlloy={onAddMaterialAlloy}
          />
          <SelectField label="Shape" value={material.form || workspace.constants.material.forms[0]} options={workspace.constants.material.forms} onChange={(value) => onChange({ form: value, shapeDimensions: {}, dimensions: "" })} />
          <TextField label="Supplier" value={material.supplier || ""} onChange={(value) => onChange({ supplier: value })} />
          <TextField label="Purchase Order" value={material.purchaseOrder || ""} onChange={(value) => onChange({ purchaseOrder: value })} />
          <SelectField
            label="Traceability"
            value={material.traceabilityLevel || workspace.constants.material.traceabilityLevels[0]}
            options={workspace.constants.material.traceabilityLevels}
            onChange={(value) => onChange({ traceabilityLevel: value })}
          />
          <TextField label="Date Received" type="date" value={material.dateReceived || ""} onChange={(value) => onChange({ dateReceived: value })} />
          <SelectField label="Status" value={material.status || "active"} options={["active", "archived"]} onChange={(value) => onChange({ status: value })} />
          <TextField label="Lot Number" value={material.lotNumber || ""} onChange={(value) => onChange({ lotNumber: value })} />
          <TextField label="Heat Number" value={material.heatNumber || ""} onChange={(value) => onChange({ heatNumber: value })} />
          <TextField label="Storage Location" value={material.storageLocation || ""} onChange={(value) => onChange({ storageLocation: value })} />
        </div>
        <TextArea label="Notes" value={material.notes || ""} onChange={(value) => onChange({ notes: value })} rows={3} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Shape and Dimensions</h3>
        </div>
        <div className="form-grid compact-3 material-shape-grid">
          <div className="field">
            <span>Shape</span>
            <div className="static-field">{material.form || "-"}</div>
          </div>
          <MaterialShapeFields material={material} onChange={(shapeDimensions) => onChange({ shapeDimensions })} />
        </div>
        <div className="shape-summary-note">Saved dimensions: {materialDimensionsSummary(material.form, material.shapeDimensions, material.dimensions || "-") || "-"}</div>
      </section>

      <div className="record-grid job-detail-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Usage References</h3>
              <span>{material.usageRefs?.length || 0} links</span>
            </div>
          </div>
          <div className="table-wrap compact">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Part</th>
                  <th>Operation</th>
                </tr>
              </thead>
              <tbody>
                {(material.usageRefs || []).map((ref) => (
                  <tr key={usageRefKey(ref)}>
                    <td>{ref.jobNumber || ref.jobId || "-"}</td>
                    <td>{ref.partNumber || ref.partId || "-"}</td>
                    <td>{ref.operationCode || ref.operationId || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!material.usageRefs?.length && <div className="empty-inline">No usage links.</div>}
          </div>
        </section>

        <DocumentsPanel
          title="Material Attachments"
          documents={material.attachments || []}
          onAddDocuments={onAddAttachments}
          onOpenDocument={onOpenAttachment}
          onOpenRevision={onOpenAttachmentRevision}
          onArchiveDocument={(attachmentId, _filename, archived) => {
            if (archived) {
              void onUnarchiveAttachment(attachmentId);
              return;
            }
            void onArchiveAttachment(attachmentId);
          }}
          onDeleteDocument={(attachmentId, filename) => {
            if (window.confirm(`Delete archived attachment ${filename}? This cannot be undone.`)) {
              void onDeleteAttachment(attachmentId);
            }
          }}
          onReviseDocument={onReviseAttachment}
          emptyText="No material attachments attached yet."
        />
      </div>
    </div>
  );
}

function KanbanView({
  workspace,
  screen,
  card,
  setCard,
  onOpenCard,
  onShowList,
  onCreateNew,
  onImportFromUrl,
  onRefreshFromUrl,
  onChoosePhoto,
  onAssignInventoryNumber,
  onAddVendor,
  onAddDepartment,
  onAddLocation,
  onAddCategory,
  aiState
}) {
  const [filters, setFilters] = useState({
    query: "",
    vendor: "All",
    category: "All",
    department: "All",
    storageLocation: "All",
    status: "Active"
  });
  const [showArchived, setShowArchived] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const cards = workspace.kanbanCards || [];
  const vendorOptions = Array.from(new Set(cards.map((item) => item.vendor).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const categoryOptions = Array.from(new Set(cards.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const departmentOptions = Array.from(new Set(cards.map((item) => item.department).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const storageLocationOptions = filters.department !== "All" && filters.department
    ? kanbanLocationOptions(workspace.preferences, filters.department)
    : Array.from(new Set(kanbanDepartmentList(workspace.preferences).flatMap((item) => item.locations || []).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const filteredCards = cards.filter((item) => {
    const statusValue = item.active === false ? "Archived" : "Active";
    if (!showArchived && item.active === false) {
      return false;
    }
    if (filters.status !== "All" && statusValue !== filters.status) {
      return false;
    }
    if (filters.vendor !== "All" && (item.vendor || "") !== filters.vendor) {
      return false;
    }
    if (filters.category !== "All" && (item.category || "") !== filters.category) {
      return false;
    }
    if (filters.department !== "All" && (item.department || "") !== filters.department) {
      return false;
    }
    if (filters.storageLocation !== "All" && (item.storageLocation || "") !== filters.storageLocation) {
      return false;
    }
    const haystack = [
      item.itemName,
      item.internalInventoryNumber,
      item.vendor,
      item.category,
      item.department,
      item.storageLocation,
      item.id
    ].join(" ").toLowerCase();
    return haystack.includes(filters.query.trim().toLowerCase());
  });
  const activeFilterChips = [
    filters.query ? `Search: ${filters.query}` : "",
    filters.vendor !== "All" ? `Vendor: ${filters.vendor}` : "",
    filters.category !== "All" ? `Category: ${filters.category}` : "",
    filters.department !== "All" ? `Department: ${filters.department}` : "",
    filters.storageLocation !== "All" ? `Location: ${filters.storageLocation}` : "",
    filters.status !== "Active" ? `Status: ${filters.status}` : ""
  ].filter(Boolean);
  const updateCard = (patch) => setCard((current) => current ? { ...current, ...patch } : current);

  return (
    <>
      {screen === "detail" && card ? (
        <KanbanDetailScreen
          workspace={workspace}
          card={card}
          onBack={onShowList}
          onChange={updateCard}
          onChoosePhoto={onChoosePhoto}
          onImportFromUrl={onRefreshFromUrl}
          onAssignInventoryNumber={onAssignInventoryNumber}
          onAddVendor={onAddVendor}
          onAddDepartment={onAddDepartment}
          onAddLocation={onAddLocation}
          onAddCategory={onAddCategory}
          aiState={aiState}
        />
      ) : (
        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Kanban Cards</h3>
              <span>{filteredCards.length} matching records</span>
            </div>
            <div className="toolbar">
              <button onClick={() => setFilters({
                query: "",
                vendor: "All",
                category: "All",
                department: "All",
                storageLocation: "All",
                status: "Active"
              })}>Clear Filters</button>
              <button onClick={() => setShowArchived((current) => !current)}>
                {showArchived ? "Hide Archived" : "Show Archived"}
              </button>
              <button onClick={() => setImportDialogOpen(true)}><Import size={15} /> Import From URL</button>
              <button onClick={onCreateNew}><Plus size={15} /> New Card</button>
            </div>
          </div>
          <div className="search-grid materials-search-grid sticky-filters">
            <TextField
              label="Search"
              value={filters.query}
              onChange={(value) => setFilters((current) => ({ ...current, query: value }))}
              placeholder="Item, inventory number, vendor, category, department, location..."
            />
            <SelectField
              label="Vendor"
              value={filters.vendor}
              options={["All", ...vendorOptions]}
              onChange={(value) => setFilters((current) => ({ ...current, vendor: value }))}
            />
            <SelectField
              label="Category"
              value={filters.category}
              options={["All", ...categoryOptions]}
              onChange={(value) => setFilters((current) => ({ ...current, category: value }))}
            />
            <SelectField
              label="Department"
              value={filters.department}
              options={["All", ...departmentOptions]}
              onChange={(value) => setFilters((current) => ({ ...current, department: value, storageLocation: "All" }))}
            />
            <SelectField
              label="Location"
              value={filters.storageLocation}
              options={["All", ...storageLocationOptions]}
              onChange={(value) => setFilters((current) => ({ ...current, storageLocation: value }))}
            />
            <SelectField
              label="Status"
              value={filters.status}
              options={["Active", "Archived", "All"]}
              onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            />
          </div>
          {activeFilterChips.length ? (
            <div className="inline-chip-list">
              {activeFilterChips.map((chip) => <span key={chip} className="inline-chip">{chip}</span>)}
            </div>
          ) : null}
          <div className="record-list top-gap">
            {filteredCards.map((item) => (
              <button key={item.id} className="record-list-item record-list-row" onClick={() => onOpenCard(item.id)}>
                <div className="record-row-primary">
                    <strong>{item.itemName || item.internalInventoryNumber || item.id}</strong>
                    <span>{item.internalInventoryNumber || "No inventory number"}</span>
                  </div>
                  <div className="record-row-meta">
                    <small>{item.vendor || "No vendor"}</small>
                    <small>{item.category || "No category"}</small>
                    <small>{item.department || "No department"}</small>
                    <small>{item.storageLocation || "No location"}</small>
                    <small>{item.active === false ? "Archived" : "Active"}</small>
                  </div>
                </button>
            ))}
            {!filteredCards.length && (
              <EmptyState
                icon={ClipboardList}
                title="No Kanban Cards"
                text="Create a card manually or import one from any product URL."
                actionLabel="New Card"
                onAction={onCreateNew}
              />
            )}
          </div>
        </section>
      )}
      <KanbanImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={async (url) => {
          await onImportFromUrl(url);
          setImportDialogOpen(false);
        }}
      />
    </>
  );
}

function KanbanDetailScreen({
  workspace,
  card,
  onChange,
  onChoosePhoto,
  onImportFromUrl,
  onAssignInventoryNumber,
  onAddVendor,
  onAddDepartment,
  onAddLocation,
  onAddCategory,
  aiState = "idle"
}) {
  const vendorOptions = Array.from(new Set(["", ...(workspace.preferences?.kanbanVendors || []), card.vendor || ""]));
  const departmentOptions = Array.from(new Set(["", ...kanbanDepartmentOptions(workspace.preferences), card.department || ""]));
  const locationOptions = Array.from(new Set(["", ...kanbanLocationOptions(workspace.preferences, card.department), card.storageLocation || ""]));
  const categoryOptions = Array.from(new Set(["", ...(workspace.preferences?.kanbanCategories || []), card.category || ""]));
  const photoUrl = kanbanPhotoSrc(card);
  const aiMessage = aiState === "filling"
    ? "Refreshing from URL and applying AI..."
    : aiState === "imaging"
      ? "AI is generating a product image..."
      : "";

  return (
    <div className="workflow-stack">
      <div className="workspace-columns">
        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Card Details</h3>
              <span>{aiMessage || (card.active === false ? "Archived" : "Active")}</span>
            </div>
            <div className="toolbar">
              <button onClick={onImportFromUrl} disabled={!card.purchaseUrl || aiState === "filling"}>
                <Import size={14} /> {aiState === "filling" ? "Refreshing URL..." : "Refresh From URL"}
              </button>
            </div>
          </div>
          <div className="form-grid compact-3">
            <TextField label="Item Name" value={card.itemName || ""} onChange={(value) => onChange({ itemName: value })} />
            <label className="field">
              <span>Internal Inventory Number</span>
              <div className="field-action-row">
                <input value={card.internalInventoryNumber || ""} onChange={(event) => onChange({ internalInventoryNumber: event.target.value })} />
                <button className="subtle" onClick={onAssignInventoryNumber} disabled={Boolean(card.internalInventoryNumber)}>Assign Number</button>
              </div>
            </label>
            <SelectWithInlineAdd
              label="Vendor"
              value={card.vendor || ""}
              options={vendorOptions}
              emptyLabel="Choose vendor"
              newPlaceholder="New vendor"
              onChange={(value) => onChange({ vendor: value })}
              onAddOption={onAddVendor}
            />
            <TextField label="Minimum Level" value={card.minimumLevel || ""} onChange={(value) => onChange({ minimumLevel: value })} />
            <TextField label="Order Quantity" value={card.orderQuantity || ""} onChange={(value) => onChange({ orderQuantity: value })} />
            <SelectWithInlineAdd
              label="Department"
              value={card.department || ""}
              options={departmentOptions}
              emptyLabel="Choose department"
              newPlaceholder="New department"
              onChange={(value) => onChange({ department: value, storageLocation: value === card.department ? card.storageLocation : "" })}
              onAddOption={onAddDepartment}
            />
            <SelectWithInlineAdd
              label="Storage Location"
              value={card.storageLocation || ""}
              options={locationOptions}
              emptyLabel={card.department ? "Choose location" : "Choose department first"}
              newPlaceholder="New location"
              onChange={(value) => onChange({ storageLocation: value })}
              onAddOption={(value) => onAddLocation(card.department, value)}
              disabled={!card.department}
            />
            <SelectWithInlineAdd
              label="Category"
              value={card.category || ""}
              options={categoryOptions}
              emptyLabel="Choose category"
              newPlaceholder="New category"
              onChange={(value) => onChange({ category: value })}
              onAddOption={onAddCategory}
            />
            <TextField label="Pack Size / Unit" value={card.packSize || ""} onChange={(value) => onChange({ packSize: value })} />
            <label className="field full">
              <span>Purchase URL</span>
              <input value={card.purchaseUrl || ""} onChange={(event) => onChange({ purchaseUrl: event.target.value })} />
            </label>
          </div>
          <TextArea label="Description" value={card.description || ""} onChange={(value) => onChange({ description: value })} rows={4} />
          <TextArea label="Ordering Notes" value={card.orderingNotes || ""} onChange={(value) => onChange({ orderingNotes: value })} rows={4} />
        </section>

        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Product Photo</h3>
              <span>{aiState === "imaging" ? "Generating image..." : (card.photo?.originalFilename || "No photo selected.")}</span>
            </div>
            <div className="toolbar">
              <button onClick={onChoosePhoto}><FolderOpen size={14} /> Choose Photo</button>
              {card.photo ? <button className="subtle" onClick={() => onChange({ photo: null })}><X size={14} /> Clear</button> : null}
            </div>
          </div>
          {photoUrl ? (
            <div className="kanban-photo-frame">
              <img src={photoUrl} alt={card.itemName || "Kanban item"} />
            </div>
          ) : (
            <div className="empty-inline">No photo selected yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function KanbanImportDialog({ open, onClose, onImport }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setBusy(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel narrow">
        <div className="panel-heading">
          <h3>Import Product URL</h3>
        </div>
        <p>Paste any product URL to prefill a new Kanban card with AI-assisted page parsing.</p>
        <TextField label="Product URL" value={url} onChange={setUrl} placeholder="https://..." />
        <div className="dialog-actions">
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button
            onClick={async () => {
              if (!url.trim()) {
                return;
              }
              setBusy(true);
              try {
                await onImport(url.trim());
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || !url.trim()}
          >
            <Import size={14} /> Import
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialsView({
  workspace,
  materialScreen,
  material,
  setMaterial,
  onOpenMaterial,
  onShowList,
  onCreateNew,
  onAddAttachments,
  canAddAttachments,
  onOpenAttachment,
  onOpenAttachmentRevision,
  onArchiveAttachment,
  onUnarchiveAttachment,
  onReviseAttachment,
  onDeleteAttachment,
  onAddMaterialFamily,
  onAddMaterialAlloy
}) {
  const [filters, setFilters] = useState({
    query: "",
    materialFamily: "All",
    materialAlloy: "All",
    supplier: "",
    form: "All",
    status: "Active",
    traceabilityLevel: "All"
  });

  const filteredMaterials = workspace.materials.filter((item) => materialMatchesFilters(item, filters));
  const alloyFilterEnabled = filters.materialFamily !== "All" && Boolean(filters.materialFamily);
  const alloyFilterOptions = alloyFilterEnabled
    ? materialAlloyOptions(workspace.preferences, filters.materialFamily)
    : [];
  const updateMaterial = (patch) => setMaterial((current) => updateMaterialRecord(current, patch, workspace.preferences));
  const activeFilterChips = [
    filters.query ? `Search: ${filters.query}` : "",
    filters.materialFamily !== "All" ? `Material: ${filters.materialFamily}` : "",
    filters.materialAlloy !== "All" ? `Alloy: ${filters.materialAlloy}` : "",
    filters.form !== "All" ? `Shape: ${filters.form}` : "",
    filters.supplier ? `Supplier: ${filters.supplier}` : "",
    filters.traceabilityLevel !== "All" ? `Traceability: ${filters.traceabilityLevel}` : "",
    filters.status !== "Active" ? `Status: ${filters.status}` : ""
  ].filter(Boolean);

  if (materialScreen === "detail" && material) {
    return (
      <MaterialDetailScreen
        workspace={workspace}
        material={material}
        onBack={onShowList}
        onChange={updateMaterial}
        onAddAttachments={onAddAttachments}
        canAddAttachments={canAddAttachments}
        onOpenAttachment={onOpenAttachment}
        onOpenAttachmentRevision={onOpenAttachmentRevision}
        onArchiveAttachment={onArchiveAttachment}
        onUnarchiveAttachment={onUnarchiveAttachment}
        onReviseAttachment={onReviseAttachment}
        onDeleteAttachment={onDeleteAttachment}
        onAddMaterialFamily={onAddMaterialFamily}
        onAddMaterialAlloy={onAddMaterialAlloy}
      />
    );
  }

  return (
    <div className="materials-screen workflow-stack">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Material Records</h3>
            <span>{filteredMaterials.length} matching records</span>
          </div>
          <div className="toolbar">
            <button onClick={() => setFilters({
              query: "",
              materialFamily: "All",
              materialAlloy: "All",
              supplier: "",
              form: "All",
              status: "Active",
              traceabilityLevel: "All"
            })}>Clear Filters</button>
          </div>
        </div>
        <div className="search-grid materials-search-grid sticky-filters">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(value) => setFilters((current) => ({ ...current, query: value }))}
            placeholder="Serial, alloy, supplier, PO, heat, lot, notes..."
          />
          <SelectField
            label="Material"
            value={filters.materialFamily}
            options={["All", ...materialFamilyOptions(workspace.preferences)]}
            onChange={(value) => setFilters((current) => ({ ...current, materialFamily: value, materialAlloy: "All" }))}
          />
          <SelectField
            label="Alloy"
            value={filters.materialAlloy}
            options={["All", ...alloyFilterOptions]}
            onChange={(value) => setFilters((current) => ({ ...current, materialAlloy: value }))}
            disabled={!alloyFilterEnabled}
          />
          <TextField
            label="Supplier"
            value={filters.supplier}
            onChange={(value) => setFilters((current) => ({ ...current, supplier: value }))}
            placeholder="Filter supplier..."
          />
          <SelectField
            label="Shape"
            value={filters.form}
            options={["All", ...workspace.constants.material.forms]}
            onChange={(value) => setFilters((current) => ({ ...current, form: value }))}
          />
          <SelectField
            label="Status"
            value={filters.status}
            options={MATERIAL_STATUS_FILTERS}
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
          />
          <SelectField
            label="Traceability"
            value={filters.traceabilityLevel}
            options={["All", ...workspace.constants.material.traceabilityLevels]}
            onChange={(value) => setFilters((current) => ({ ...current, traceabilityLevel: value }))}
          />
        </div>

        {activeFilterChips.length ? (
          <div className="inline-chip-list">
            {activeFilterChips.map((chip) => <span key={chip} className="inline-chip">{chip}</span>)}
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                {MATERIAL_RESULT_COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((item) => (
                <tr key={item.id} className={material?.id === item.id ? "selected" : ""} onClick={() => onOpenMaterial(item.id)}>
                  {MATERIAL_RESULT_COLUMNS.map((column) => (
                    <td key={column.key}>
                      {column.key === "status"
                        ? <span className={`status-pill ${item.status || "active"}`}>{materialCellValue(item, column.key)}</span>
                        : materialCellValue(item, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredMaterials.length && <div className="empty-inline">No material records matched the current search.</div>}
        </div>
      </section>
    </div>
  );
}

function MetrologyView({ workspace, screen, payload, setPayload, onOpenInstrument, onCreateNew, onShowList }) {
  const instrument = payload?.instrument;
  const preferences = workspace.preferences || {};
  const [filters, setFilters] = useState({
    query: "",
    toolType: "All",
    status: "All",
    location: "All",
    dueState: "All"
  });
  const updateInstrument = (patch) => setPayload((current) => ({ ...current, instrument: { ...current.instrument, ...patch } }));
  const updateCalibration = (calibrationId, patch) => setPayload((current) => ({
    ...current,
    calibrations: current.calibrations.map((item) => item.calibration_id === calibrationId ? { ...item, ...patch } : item)
  }));
  const addCalibration = () => setPayload((current) => ({ ...current, calibrations: [...current.calibrations, blankCalibration()] }));
  const removeCalibration = (calibrationId) => setPayload((current) => ({ ...current, calibrations: current.calibrations.filter((item) => item.calibration_id !== calibrationId) }));
  const filteredInstruments = workspace.instruments.filter((item) => {
    const query = filters.query.trim().toLowerCase();
    if (query) {
      const haystack = [
        item.instrumentId,
        item.toolName,
        item.toolType,
        item.manufacturer,
        item.location,
        item.status,
        item.dueState
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    if (filters.toolType !== "All" && item.toolType !== filters.toolType) {
      return false;
    }
    if (filters.status !== "All" && item.status !== filters.status) {
      return false;
    }
    if (filters.location !== "All" && item.location !== filters.location) {
      return false;
    }
    if (filters.dueState !== "All" && item.dueState !== filters.dueState) {
      return false;
    }
    return true;
  });
  const activeFilterChips = [
    filters.query ? `Search: ${filters.query}` : "",
    filters.toolType !== "All" ? `Tool Type: ${filters.toolType}` : "",
    filters.status !== "All" ? `Status: ${filters.status}` : "",
    filters.location !== "All" ? `Location: ${filters.location}` : "",
    filters.dueState !== "All" ? `Due: ${filters.dueState}` : ""
  ].filter(Boolean);
  const metrologyDueStateOptions = Array.from(new Set(workspace.instruments.map((item) => item.dueState).filter(Boolean)));
  const metrologyLocationOptions = Array.from(new Set(workspace.instruments.map((item) => item.location).filter(Boolean)));
  const latestCalibration = [...(payload?.calibrations || [])]
    .sort((a, b) => String(b.calibration_date || "").localeCompare(String(a.calibration_date || "")))[0] || null;
  const nextDueCalibration = [...(payload?.calibrations || [])]
    .filter((item) => item.next_due_date)
    .sort((a, b) => String(a.next_due_date || "").localeCompare(String(b.next_due_date || "")))[0] || null;
  const dueStateLabel = (() => {
    const nextDue = nextDueCalibration?.next_due_date;
    if (!nextDue) return "No due date";
    const todayValue = today();
    if (nextDue < todayValue) return "Overdue";
    return "In service";
  })();
  const dueStateClass = dueStateLabel.toLowerCase().includes("over") ? "archived" : "active";

  if (screen === "list" || !payload) {
    return (
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Gages</h3>
            <span>{filteredInstruments.length} matching records</span>
          </div>
          <div className="toolbar">
            <button onClick={() => setFilters({
              query: "",
              toolType: "All",
              status: "All",
              location: "All",
              dueState: "All"
            })}>Clear Filters</button>
          </div>
        </div>
        <div className="search-grid metrology-search-grid sticky-filters">
          <TextField
            label="Search"
            value={filters.query}
            onChange={(value) => setFilters((current) => ({ ...current, query: value }))}
            placeholder="ID, tool name, type, manufacturer, location..."
          />
          <SelectField
            label="Tool Type"
            value={filters.toolType}
            options={["All", ...(preferences.metrologyToolTypes || [])]}
            onChange={(value) => setFilters((current) => ({ ...current, toolType: value }))}
          />
          <SelectField
            label="Status"
            value={filters.status}
            options={["All", ...(preferences.metrologyStatuses || [])]}
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
          />
          <SelectField
            label="Location"
            value={filters.location}
            options={["All", ...metrologyLocationOptions]}
            onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
          />
          <SelectField
            label="Due State"
            value={filters.dueState}
            options={["All", ...metrologyDueStateOptions]}
            onChange={(value) => setFilters((current) => ({ ...current, dueState: value }))}
          />
        </div>
        {activeFilterChips.length ? (
          <div className="inline-chip-list">
            {activeFilterChips.map((chip) => <span key={chip} className="inline-chip">{chip}</span>)}
          </div>
        ) : null}
        <div className="table-wrap">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Instrument ID</th>
                <th>Tool Name</th>
                <th>Tool Type</th>
                <th>Manufacturer</th>
                <th>Location</th>
                <th>Status</th>
                <th>Due State</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstruments.map((item) => (
                <tr key={item.instrumentId} className={instrument?.instrument_id === item.instrumentId ? "selected" : ""} onClick={() => onOpenInstrument(item.instrumentId)}>
                  <td>{item.instrumentId}</td>
                  <td>{item.toolName || "-"}</td>
                  <td>{item.toolType || "-"}</td>
                  <td>{item.manufacturer || "-"}</td>
                  <td>{item.location || "-"}</td>
                  <td>{item.status || "-"}</td>
                  <td><span className={`status-pill ${item.dueState?.toLowerCase().includes("over") ? "archived" : "active"}`}>{item.dueState || "No due state"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredInstruments.length && <div className="empty-inline">No gages matched the current search.</div>}
        </div>
      </section>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="panel">
        <div className="panel-heading">
          <h3>Gage Record</h3>
        </div>
        <div className="form-grid compact-3">
          <TextField label="Instrument ID" value={instrument.instrument_id || ""} onChange={(value) => updateInstrument({ instrument_id: value })} />
          <TextField label="Tool Name" value={instrument.tool_name || ""} onChange={(value) => updateInstrument({ tool_name: value })} />
          <SelectField label="Tool Type" value={instrument.tool_type || ""} options={preferences.metrologyToolTypes || []} emptyLabel="Choose type" onChange={(value) => updateInstrument({ tool_type: value })} />
          <SelectField label="Manufacturer" value={instrument.manufacturer || ""} options={preferences.metrologyManufacturers || []} emptyLabel="Choose manufacturer" onChange={(value) => updateInstrument({ manufacturer: value })} />
          <TextField label="Model" value={instrument.model || ""} onChange={(value) => updateInstrument({ model: value })} />
          <TextField label="Serial Number" value={instrument.serial_number || ""} onChange={(value) => updateInstrument({ serial_number: value })} />
          <TextField label="Range" value={instrument.measuring_range || ""} onChange={(value) => updateInstrument({ measuring_range: value })} />
          <SelectField label="Resolution" value={instrument.resolution || ""} options={preferences.metrologyResolutions || []} emptyLabel="Choose resolution" onChange={(value) => updateInstrument({ resolution: value })} />
          <TextField label="Accuracy" value={instrument.accuracy || ""} onChange={(value) => updateInstrument({ accuracy: value })} />
          <SelectField label="Location" value={instrument.location || ""} options={preferences.metrologyLocations || []} emptyLabel="Choose location" onChange={(value) => updateInstrument({ location: value })} />
          <SelectField label="Department" value={instrument.owner_department || ""} options={preferences.metrologyDepartments || []} emptyLabel="Choose department" onChange={(value) => updateInstrument({ owner_department: value })} />
          <SelectField label="Status" value={instrument.status || ""} options={preferences.metrologyStatuses || []} emptyLabel="Choose status" onChange={(value) => updateInstrument({ status: value })} />
        </div>
        <TextArea label="Notes" value={instrument.notes || ""} onChange={(value) => updateInstrument({ notes: value })} rows={3} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Calibration Status</h3>
        </div>
        <div className="form-grid compact-3">
          <TextField label="Current Due State" value={dueStateLabel} onChange={() => {}} readOnly />
          <TextField label="Last Calibration" value={latestCalibration?.calibration_date || ""} onChange={() => {}} type="date" readOnly />
          <TextField label="Next Due" value={nextDueCalibration?.next_due_date || ""} onChange={() => {}} type="date" readOnly />
          <TextField label="Last Result" value={latestCalibration?.result || ""} onChange={() => {}} readOnly />
          <TextField label="Performed By" value={latestCalibration?.performed_by || ""} onChange={() => {}} readOnly />
          <TextField label="Certificate Number" value={latestCalibration?.certificate_number || ""} onChange={() => {}} readOnly />
        </div>
        <div className="top-gap">
          <span className={`status-pill ${dueStateClass}`}>{dueStateLabel}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Calibration Records</h3>
            <span>{payload.calibrations?.length || 0} records</span>
          </div>
          <button onClick={addCalibration}><Plus size={15} /> Calibration</button>
        </div>
        <div className="stack-list">
          {(payload.calibrations || []).map((calibration) => (
            <div key={calibration.calibration_id} className="subpanel">
              <div className="subpanel-header">
                <div>
                  <h4>{calibration.calibration_date || "Calibration"}</h4>
                  <span>{calibration.result || "No result"}</span>
                </div>
                <button className="danger subtle" onClick={() => removeCalibration(calibration.calibration_id)}><X size={14} /> Remove</button>
              </div>
              <div className="form-grid compact-3">
                <TextField label="Calibration Date" type="date" value={calibration.calibration_date || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { calibration_date: value })} />
                <TextField label="Next Due" type="date" value={calibration.next_due_date || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { next_due_date: value })} />
                <TextField label="Performed By" value={calibration.performed_by || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { performed_by: value })} />
                <TextField label="Result" value={calibration.result || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { result: value })} />
                <TextField label="Vendor" value={calibration.calibration_vendor || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { calibration_vendor: value })} />
                <TextField label="Standard Name" value={calibration.standard_name || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { standard_name: value })} />
                <TextField label="Certificate Number" value={calibration.certificate_number || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { certificate_number: value })} />
                <TextField label="Traceability Ref" value={calibration.traceability_reference || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { traceability_reference: value })} />
              </div>
              <TextArea label="Notes" value={calibration.notes || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { notes: value })} rows={2} />
            </div>
          ))}
          {!payload.calibrations?.length && <div className="empty-inline">No calibrations yet.</div>}
        </div>
      </section>
    </div>
  );
}

function TemplateSettingsSection({ workspace, selectedTemplate, setSelectedTemplateId, onStatus, onRefresh }) {
  const [template, setTemplate] = useState(selectedTemplate || blankTemplate());
  const libraries = libraryList(workspace.libraries);
  const assignedMissingLibraries = (template.libraryNames || []).filter((name) => !(workspace.libraries || {})[name]);

  useEffect(() => {
    setTemplate(selectedTemplate || blankTemplate());
  }, [selectedTemplate?.id]);

  const deleteTemplate = async () => {
    if (!template?.id) {
      return;
    }
    try {
      await api.deleteTemplate(template.id);
      await onRefresh();
      setSelectedTemplateId(workspace.templates.find((item) => item.id !== template.id)?.id || null);
      onStatus("Template deleted.");
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const toggleLibrary = (name) => {
    setTemplate((current) => ({
      ...current,
      libraryNames: current.libraryNames.includes(name)
        ? current.libraryNames.filter((item) => item !== name)
        : [...current.libraryNames, name]
    }));
  };

  const addDefaultParameter = () => setTemplate((current) => ({ ...current, defaultParameters: [...(current.defaultParameters || []), blankParameter()] }));
  const updateDefaultParameter = (parameterId, patch) => setTemplate((current) => ({
    ...current,
    defaultParameters: (current.defaultParameters || []).map((parameter) => parameter.id === parameterId ? { ...parameter, ...patch } : parameter)
  }));
  const removeDefaultParameter = (parameterId) => setTemplate((current) => ({
    ...current,
    defaultParameters: (current.defaultParameters || []).filter((parameter) => parameter.id !== parameterId)
  }));
  const addDefaultStep = () => setTemplate((current) => ({ ...current, defaultSteps: [...(current.defaultSteps || []), ""] }));
  const updateDefaultStep = (index, value) => setTemplate((current) => ({
    ...current,
    defaultSteps: (current.defaultSteps || []).map((step, stepIndex) => stepIndex === index ? value : step)
  }));
  const removeDefaultStep = (index) => setTemplate((current) => ({
    ...current,
    defaultSteps: (current.defaultSteps || []).filter((_step, stepIndex) => stepIndex !== index)
  }));

  useAutoSave({
    value: template,
    resetKey: `template:${template?.id || "none"}`,
    enabled: Boolean(template),
    isReady: (current) => Boolean(current),
    save: (current) => api.saveTemplate(current),
    onSaved: async (saved) => {
      setTemplate(saved);
      setSelectedTemplateId(saved.id);
      await onRefresh();
    },
    onError: (error) => onStatus(error.message || String(error))
  });

  return (
    <div className="catalog-layout settings-template-layout">
      <div className="catalog-list">
        <button className="sidebar-action" onClick={() => setTemplate(blankTemplate())}><Plus size={14} /> New Template</button>
        {workspace.templates.map((item) => (
          <button key={item.id} className={`record-list-item ${template.id === item.id ? "selected" : ""}`} onClick={() => setSelectedTemplateId(item.id)}>
            <strong>{item.name}</strong>
            <span>{item.category}</span>
          </button>
        ))}
        {!workspace.templates.length && <div className="empty-inline">No templates saved yet.</div>}
      </div>

      <div className="subpanel">
        <div className="subpanel-header">
          <div>
            <h4>{template.name || "New Template"}</h4>
            <span>{template.category || "General"}</span>
          </div>
          <div className="toolbar">
            {template.id && <button className="danger subtle" onClick={deleteTemplate}><X size={14} /> Delete</button>}
          </div>
        </div>
        <div className="form-grid compact-3">
          <TextField label="Template Name" value={template.name || ""} onChange={(value) => setTemplate((current) => ({ ...current, name: value }))} />
          <TextField label="Category" value={template.category || ""} onChange={(value) => setTemplate((current) => ({ ...current, category: value }))} />
        </div>
        <div className="top-gap">
          <label className="field full">
            <span>Assigned Libraries</span>
            <div className="library-chip-grid">
              {libraries.map((library) => (
                <label key={library.name} className={`library-chip ${template.libraryNames.includes(library.name) ? "active" : ""}`}>
                  <input type="checkbox" checked={template.libraryNames.includes(library.name)} onChange={() => toggleLibrary(library.name)} />
                  <span>{library.label}</span>
                </label>
              ))}
              {assignedMissingLibraries.map((name) => (
                <label key={`missing-${name}`} className="library-chip active disabled">
                  <input type="checkbox" checked disabled />
                  <span>{name} (missing)</span>
                </label>
              ))}
              {!libraries.length && <div className="empty-inline">No libraries available.</div>}
            </div>
          </label>
        </div>
        <div className="template-editor-block">
          <div className="subpanel-header">
            <div>
              <h4>Default Parameters</h4>
            </div>
            <button onClick={addDefaultParameter}><Plus size={14} /> Parameter</button>
          </div>
          <div className="parameter-list">
            {(template.defaultParameters || []).map((parameter) => (
              <div className="parameter-row" key={parameter.id}>
                <input value={parameter.label || ""} placeholder="Parameter name" onChange={(event) => updateDefaultParameter(parameter.id, { label: event.target.value })} />
                <input value={parameter.value || ""} placeholder="Default value" onChange={(event) => updateDefaultParameter(parameter.id, { value: event.target.value })} />
                <button className="danger subtle square" onClick={() => removeDefaultParameter(parameter.id)}><X size={13} /></button>
              </div>
            ))}
            {!template.defaultParameters?.length && <div className="empty-inline">No default parameters yet.</div>}
          </div>
        </div>
        <div className="template-editor-block">
          <div className="subpanel-header">
            <div>
              <h4>Default Steps</h4>
            </div>
            <button onClick={addDefaultStep}><Plus size={14} /> Step</button>
          </div>
          <div className="parameter-list">
            {(template.defaultSteps || []).map((step, index) => (
              <div className="parameter-row template-step-row" key={`${template.id || "new"}-${index}`}>
                <input value={step || ""} placeholder="Default instruction step" onChange={(event) => updateDefaultStep(index, event.target.value)} />
                <button className="danger subtle square" onClick={() => removeDefaultStep(index)}><X size={13} /></button>
              </div>
            ))}
            {!template.defaultSteps?.length && <div className="empty-inline">No default steps yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LibrarySettingsSection({ workspace, onStatus, onRefresh }) {
  const [libraries, setLibraries] = useState(libraryList(workspace.libraries));
  const [selectedLibraryName, setSelectedLibraryName] = useState(libraryList(workspace.libraries)[0]?.name || null);
  const [deletingLibraryName, setDeletingLibraryName] = useState("");

  useEffect(() => {
    const nextLibraries = libraryList(workspace.libraries);
    setLibraries(nextLibraries);
    setSelectedLibraryName((current) => nextLibraries.some((library) => library.name === current) ? current : nextLibraries[0]?.name || null);
  }, [workspace.libraries]);

  const selectedLibrary = libraries.find((library) => library.name === selectedLibraryName) || null;
  const updateLibrary = (libraryName, updater) => {
    setLibraries((current) => current.map((library) => {
      if (library.name !== libraryName) {
        return library;
      }
      return typeof updater === "function" ? updater(library) : { ...library, ...updater };
    }));
  };
  const addLibrary = () => {
    const nextOrder = Math.max(0, ...libraries.map((library) => Number(library.order || 0))) + 1;
    const library = blankLibraryDefinition(nextOrder);
    setLibraries((current) => [...current, library]);
    setSelectedLibraryName(library.name);
  };
  const addLibraryRecord = () => {
    if (!selectedLibrary) {
      return;
    }
    updateLibrary(selectedLibrary.name, (current) => ({
      ...current,
      records: [...(current.records || []), blankLibraryRecord()]
    }));
  };
  const updateLibraryRecord = (recordId, patch) => {
    if (!selectedLibrary) {
      return;
    }
    updateLibrary(selectedLibrary.name, (current) => ({
      ...current,
      records: (current.records || []).map((record) => record.id === recordId ? { ...record, ...patch } : record)
    }));
  };
  const removeLibraryRecord = (recordId) => {
    if (!selectedLibrary) {
      return;
    }
    updateLibrary(selectedLibrary.name, (current) => ({
      ...current,
      records: (current.records || []).filter((record) => record.id !== recordId)
    }));
  };
  const deleteLibrary = async () => {
    if (!selectedLibrary) {
      return;
    }
    try {
      const libraryName = selectedLibrary.name;
      const remainingLibraries = libraries.filter((library) => library.name !== libraryName);
      setDeletingLibraryName(libraryName);
      setLibraries(remainingLibraries);
      setSelectedLibraryName(remainingLibraries[0]?.name || null);
      await api.deleteLibrary(libraryName);
      await onRefresh();
      setDeletingLibraryName("");
      onStatus("Library deleted.");
    } catch (error) {
      setDeletingLibraryName("");
      await onRefresh();
      onStatus(error.message || String(error));
    }
  };

  useAutoSave({
    value: selectedLibrary,
    resetKey: `library:${selectedLibrary?.name || "none"}`,
    enabled: Boolean(selectedLibrary) && selectedLibrary.name !== deletingLibraryName,
    isReady: (current) => Boolean(current),
    save: (current) => api.saveLibrary(current),
    onSaved: async (saved) => {
      setLibraries((current) => current.some((library) => library.name === saved.name)
        ? current.map((library) => library.name === saved.name ? saved : library)
        : [...current, saved]);
      setSelectedLibraryName(saved.name);
      await onRefresh();
    },
    onError: (error) => onStatus(error.message || String(error))
  });

  return (
    <div className="catalog-layout settings-template-layout">
      <div className="catalog-list">
        <button className="sidebar-action" onClick={addLibrary}><Plus size={14} /> New Library</button>
        {libraries.map((library) => (
          <button key={library.name} className={`record-list-item ${selectedLibraryName === library.name ? "selected" : ""}`} onClick={() => setSelectedLibraryName(library.name)}>
            <strong>{library.label || "New Library"}</strong>
            <span>{library.records?.length || 0} saved records</span>
          </button>
        ))}
        {!libraries.length && <div className="empty-inline">No libraries saved yet.</div>}
      </div>

      {!selectedLibrary ? (
        <div className="subpanel">
          <div className="empty-inline">Choose a library or create a new one.</div>
        </div>
      ) : (
        <div className="subpanel">
          <div className="subpanel-header">
            <div>
              <h4>{selectedLibrary.label || "New Library"}</h4>
              <span>{selectedLibrary.records?.length || 0} saved records</span>
            </div>
            <div className="toolbar">
              <button className="danger subtle" onClick={deleteLibrary}><X size={14} /> Delete Library</button>
              <button onClick={addLibraryRecord}><Plus size={14} /> Add</button>
            </div>
          </div>
          <div className="form-grid compact-2">
            <TextField
              label="Library Name"
              value={selectedLibrary.label || ""}
              onChange={(value) => updateLibrary(selectedLibrary.name, { label: value })}
            />
          </div>
          <div className="template-editor-block">
            <div className="subpanel-header">
              <div>
                <h4>Records</h4>
                <span>Name-only library entries used in templates and operations.</span>
              </div>
            </div>
            <div className="parameter-list">
              {(selectedLibrary.records || []).map((record) => (
                <div className="parameter-row library-record-row" key={record.id}>
                  <input value={record.name || ""} placeholder="Record name" onChange={(event) => updateLibraryRecord(record.id, { name: event.target.value })} />
                  <button className="danger subtle square" onClick={() => removeLibraryRecord(record.id)}><X size={13} /></button>
                </div>
              ))}
              {!selectedLibrary.records?.length && <div className="empty-inline">No records saved yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsView({ onChooseDataFolder, onSavePreferences, workspace, selectedTemplate, setSelectedTemplateId, onStatus, onRefresh }) {
  const [materialFamilies, setMaterialFamilies] = useState(workspace.preferences?.materialFamilies || []);
  const [selectedFamilyId, setSelectedFamilyId] = useState(workspace.preferences?.materialFamilies?.[0]?.id || null);
  const [brandingSettings, setBrandingSettings] = useState({
    appTitle: workspace.preferences?.appTitle || "AMERP",
    appTagline: workspace.preferences?.appTagline || "Operator ERP",
    windowTitle: workspace.preferences?.windowTitle || "AMERP",
    appIconPath: workspace.preferences?.appIconPath || ""
  });
  const [moduleSettings, setModuleSettings] = useState(normalizeEnabledModules(workspace.preferences?.enabledModules));
  const [jobSettings, setJobSettings] = useState({
    jobPrefix: workspace.preferences?.jobPrefix || "J03C",
    startingJobNumber: String(workspace.preferences?.startingJobNumber ?? 600)
  });
  const [kanbanNumberSettings, setKanbanNumberSettings] = useState({
    kanbanInventoryPrefix: workspace.preferences?.kanbanInventoryPrefix || "J03C",
    kanbanStartingInventoryNumber: String(workspace.preferences?.kanbanStartingInventoryNumber ?? 600)
  });
  const [metrologyOptions, setMetrologyOptions] = useState({
    metrologyToolTypes: workspace.preferences?.metrologyToolTypes || [],
    metrologyManufacturers: workspace.preferences?.metrologyManufacturers || [],
    metrologyResolutions: workspace.preferences?.metrologyResolutions || [],
    metrologyLocations: workspace.preferences?.metrologyLocations || [],
    metrologyDepartments: workspace.preferences?.metrologyDepartments || [],
    metrologyStatuses: workspace.preferences?.metrologyStatuses || []
  });
  const [aiSettings, setAiSettings] = useState({
    openaiApiKey: workspace.preferences?.openaiApiKey || ""
  });
  const [kanbanDepartments, setKanbanDepartments] = useState(workspace.preferences?.kanbanDepartments || []);
  const [selectedKanbanDepartmentId, setSelectedKanbanDepartmentId] = useState(workspace.preferences?.kanbanDepartments?.[0]?.id || null);
  const [kanbanOptions, setKanbanOptions] = useState({
    kanbanVendors: workspace.preferences?.kanbanVendors || [],
    kanbanCategories: workspace.preferences?.kanbanCategories || []
  });
  const [kanbanPrintSettings, setKanbanPrintSettings] = useState({
    defaultKanbanPrintSizeId: workspace.preferences?.defaultKanbanPrintSizeId || defaultKanbanPrintSizeId(workspace.preferences),
    kanbanPrintSizes: (workspace.preferences?.kanbanPrintSizes || []).map((item) => ({
      ...item,
      widthIn: String(item.widthIn ?? ""),
      heightIn: String(item.heightIn ?? "")
    }))
  });

  useEffect(() => {
    const families = workspace.preferences?.materialFamilies || [];
    setMaterialFamilies(families);
    setSelectedFamilyId((current) => families.some((family) => family.id === current) ? current : families[0]?.id || null);
    setBrandingSettings({
      appTitle: workspace.preferences?.appTitle || "AMERP",
      appTagline: workspace.preferences?.appTagline || "Operator ERP",
      windowTitle: workspace.preferences?.windowTitle || "AMERP",
      appIconPath: workspace.preferences?.appIconPath || ""
    });
    setModuleSettings(normalizeEnabledModules(workspace.preferences?.enabledModules));
    setJobSettings({
      jobPrefix: workspace.preferences?.jobPrefix || "J03C",
      startingJobNumber: String(workspace.preferences?.startingJobNumber ?? 600)
    });
    setKanbanNumberSettings({
      kanbanInventoryPrefix: workspace.preferences?.kanbanInventoryPrefix || "J03C",
      kanbanStartingInventoryNumber: String(workspace.preferences?.kanbanStartingInventoryNumber ?? 600)
    });
    setMetrologyOptions({
      metrologyToolTypes: workspace.preferences?.metrologyToolTypes || [],
      metrologyManufacturers: workspace.preferences?.metrologyManufacturers || [],
      metrologyResolutions: workspace.preferences?.metrologyResolutions || [],
      metrologyLocations: workspace.preferences?.metrologyLocations || [],
      metrologyDepartments: workspace.preferences?.metrologyDepartments || [],
      metrologyStatuses: workspace.preferences?.metrologyStatuses || []
    });
    setAiSettings({
      openaiApiKey: workspace.preferences?.openaiApiKey || ""
    });
    const nextDepartments = workspace.preferences?.kanbanDepartments || [];
    setKanbanDepartments(nextDepartments);
    setSelectedKanbanDepartmentId((current) => nextDepartments.some((department) => department.id === current) ? current : nextDepartments[0]?.id || null);
    setKanbanOptions({
      kanbanVendors: workspace.preferences?.kanbanVendors || [],
      kanbanCategories: workspace.preferences?.kanbanCategories || []
    });
    setKanbanPrintSettings({
      defaultKanbanPrintSizeId: workspace.preferences?.defaultKanbanPrintSizeId || defaultKanbanPrintSizeId(workspace.preferences),
      kanbanPrintSizes: (workspace.preferences?.kanbanPrintSizes || []).map((item) => ({
        ...item,
        widthIn: String(item.widthIn ?? ""),
        heightIn: String(item.heightIn ?? "")
      }))
    });
  }, [workspace.dataFolder]);

  const selectedFamily = materialFamilies.find((family) => family.id === selectedFamilyId) || null;
  const updateFamily = (familyId, patch) => {
    setMaterialFamilies((current) => current.map((family) => family.id === familyId ? { ...family, ...patch } : family));
  };
  const addFamily = () => {
    const family = blankMaterialFamily();
    setMaterialFamilies((current) => [...current, family]);
    setSelectedFamilyId(family.id);
  };
  const removeFamily = (familyId) => {
    setMaterialFamilies((current) => {
      const next = current.filter((family) => family.id !== familyId);
      setSelectedFamilyId(next[0]?.id || null);
      return next;
    });
  };
  const addAlloy = () => {
    if (!selectedFamily) return;
    updateFamily(selectedFamily.id, { alloys: [...(selectedFamily.alloys || []), ""] });
  };
  const updateAlloy = (index, value) => {
    if (!selectedFamily) return;
    updateFamily(selectedFamily.id, {
      alloys: (selectedFamily.alloys || []).map((alloy, alloyIndex) => alloyIndex === index ? value : alloy)
    });
  };
  const removeAlloy = (index) => {
    if (!selectedFamily) return;
    updateFamily(selectedFamily.id, {
      alloys: (selectedFamily.alloys || []).filter((_, alloyIndex) => alloyIndex !== index)
    });
  };
  const updateMetrologyList = (key, updater) => {
    setMetrologyOptions((current) => ({
      ...current,
      [key]: typeof updater === "function" ? updater(current[key] || []) : updater
    }));
  };
  const addMetrologyOption = (key) => updateMetrologyList(key, (current) => [...current, ""]);
  const updateMetrologyOption = (key, index, value) => updateMetrologyList(key, (current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  const removeMetrologyOption = (key, index) => updateMetrologyList(key, (current) => current.filter((_item, itemIndex) => itemIndex !== index));
  const updateKanbanDepartment = (departmentId, patch) => {
    setKanbanDepartments((current) => current.map((item) => item.id === departmentId ? { ...item, ...patch } : item));
  };
  const addKanbanDepartment = () => {
    const department = blankKanbanDepartment();
    setKanbanDepartments((current) => [...current, department]);
    setSelectedKanbanDepartmentId(department.id);
  };
  const removeKanbanDepartment = (departmentId) => {
    setKanbanDepartments((current) => {
      const next = current.filter((item) => item.id !== departmentId);
      setSelectedKanbanDepartmentId(next[0]?.id || null);
      return next;
    });
  };
  const addKanbanDepartmentLocation = (departmentId) => {
    setKanbanDepartments((current) => current.map((item) => item.id === departmentId
      ? { ...item, locations: [...(item.locations || []), "New Location"] }
      : item));
  };
  const updateKanbanDepartmentLocation = (departmentId, index, value) => {
    setKanbanDepartments((current) => current.map((item) => item.id === departmentId
      ? {
        ...item,
        locations: (item.locations || []).map((location, locationIndex) => locationIndex === index ? value : location)
      }
      : item));
  };
  const removeKanbanDepartmentLocation = (departmentId, index) => {
    setKanbanDepartments((current) => current.map((item) => item.id === departmentId
      ? { ...item, locations: (item.locations || []).filter((_location, locationIndex) => locationIndex !== index) }
      : item));
  };
  const updateKanbanList = (key, updater) => {
    setKanbanOptions((current) => ({
      ...current,
      [key]: typeof updater === "function" ? updater(current[key] || []) : updater
    }));
  };
  const addKanbanOption = (key) => updateKanbanList(key, (current) => [...current, ""]);
  const updateKanbanOption = (key, index, value) => updateKanbanList(key, (current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  const removeKanbanOption = (key, index) => updateKanbanList(key, (current) => current.filter((_item, itemIndex) => itemIndex !== index));
  const updateKanbanPrintSize = (sizeId, patch) => {
    setKanbanPrintSettings((current) => ({
      ...current,
      kanbanPrintSizes: (current.kanbanPrintSizes || []).map((item) => item.id === sizeId ? { ...item, ...patch } : item)
    }));
  };
  const addKanbanPrintSize = () => {
    setKanbanPrintSettings((current) => {
      const next = [...(current.kanbanPrintSizes || []), blankKanbanPrintSize()];
      return {
        ...current,
        defaultKanbanPrintSizeId: current.defaultKanbanPrintSizeId || next[0]?.id || "",
        kanbanPrintSizes: next
      };
    });
  };
  const removeKanbanPrintSize = (sizeId) => {
    setKanbanPrintSettings((current) => {
      const next = (current.kanbanPrintSizes || []).filter((item) => item.id !== sizeId);
      return {
        defaultKanbanPrintSizeId: current.defaultKanbanPrintSizeId === sizeId ? (next[0]?.id || "") : current.defaultKanbanPrintSizeId,
        kanbanPrintSizes: next
      };
    });
  };
  const chooseBrandIcon = async () => {
    try {
      const selectedPath = await api.chooseBrandIcon();
      if (!selectedPath) {
        return;
      }
      setBrandingSettings((current) => ({ ...current, appIconPath: selectedPath }));
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  useAutoSave({
    value: brandingSettings,
    resetKey: `branding-settings:${workspace.dataFolder}:${workspace.preferences?.appTitle || ""}:${workspace.preferences?.appTagline || ""}:${workspace.preferences?.windowTitle || ""}:${workspace.preferences?.appIconPath || ""}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        appTitle: String(current.appTitle || "").trim() || "AMERP",
        appTagline: String(current.appTagline || "").trim() || "Operator ERP",
        windowTitle: String(current.windowTitle || "").trim() || "AMERP",
        appIconPath: String(current.appIconPath || "").trim()
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: moduleSettings,
    resetKey: `module-settings:${workspace.dataFolder}:${JSON.stringify(workspace.preferences?.enabledModules || {})}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        enabledModules: normalizeEnabledModules(current)
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: materialFamilies,
    resetKey: `settings:${workspace.dataFolder}:${JSON.stringify(workspace.preferences?.materialFamilies || [])}`,
    enabled: true,
    isReady: (current) => Array.isArray(current),
    save: async (current) => {
      await onSavePreferences({
        materialFamilies: current.map((family) => ({
          id: family.id,
          name: String(family.name || "").trim(),
          alloys: (family.alloys || []).map((alloy) => String(alloy || "").trim()).filter(Boolean)
        }))
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: jobSettings,
    resetKey: `job-settings:${workspace.dataFolder}:${workspace.preferences?.jobPrefix || ""}:${workspace.preferences?.startingJobNumber ?? ""}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        jobPrefix: String(current.jobPrefix || "").trim(),
        startingJobNumber: Number(current.startingJobNumber || 0) || 1
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: kanbanNumberSettings,
    resetKey: `kanban-number-settings:${workspace.dataFolder}:${workspace.preferences?.kanbanInventoryPrefix || ""}:${workspace.preferences?.kanbanStartingInventoryNumber ?? ""}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        kanbanInventoryPrefix: String(current.kanbanInventoryPrefix || "").trim(),
        kanbanStartingInventoryNumber: Number(current.kanbanStartingInventoryNumber || 0) || 1
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: metrologyOptions,
    resetKey: `metrology-settings:${workspace.dataFolder}:${JSON.stringify({
      metrologyToolTypes: workspace.preferences?.metrologyToolTypes || [],
      metrologyManufacturers: workspace.preferences?.metrologyManufacturers || [],
      metrologyResolutions: workspace.preferences?.metrologyResolutions || [],
      metrologyLocations: workspace.preferences?.metrologyLocations || [],
      metrologyDepartments: workspace.preferences?.metrologyDepartments || [],
      metrologyStatuses: workspace.preferences?.metrologyStatuses || []
    })}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences(Object.fromEntries(
        Object.entries(current).map(([key, values]) => [key, (values || []).map((value) => String(value || "").trim()).filter(Boolean)])
      ), { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: aiSettings,
    resetKey: `ai-settings:${workspace.dataFolder}:${workspace.preferences?.openaiApiKey || ""}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        openaiApiKey: String(current.openaiApiKey || "").trim()
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: kanbanDepartments,
    resetKey: `kanban-departments:${workspace.dataFolder}:${JSON.stringify(workspace.preferences?.kanbanDepartments || [])}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences({
        kanbanDepartments: (current || [])
          .map((item) => ({
            id: item.id,
            name: String(item.name || "").trim(),
            color: String(item.color || "#2563eb").trim() || "#2563eb",
            locations: (item.locations || []).map((location) => String(location || "").trim()).filter(Boolean)
          }))
          .filter((item) => item.name),
        kanbanStorageLocations: []
      }, { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: kanbanOptions,
    resetKey: `kanban-settings:${workspace.dataFolder}:${JSON.stringify({
      kanbanVendors: workspace.preferences?.kanbanVendors || [],
      kanbanCategories: workspace.preferences?.kanbanCategories || []
    })}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      await onSavePreferences(Object.fromEntries(
        Object.entries(current).map(([key, values]) => [key, (values || []).map((value) => String(value || "").trim()).filter(Boolean)])
      ), { silent: true });
      return current;
    }
  });

  useAutoSave({
    value: kanbanPrintSettings,
    resetKey: `kanban-print-settings:${workspace.dataFolder}:${JSON.stringify({
      kanbanPrintSizes: workspace.preferences?.kanbanPrintSizes || [],
      defaultKanbanPrintSizeId: workspace.preferences?.defaultKanbanPrintSizeId || ""
    })}`,
    enabled: true,
    isReady: (current) => Boolean(current),
    save: async (current) => {
      const sizes = (current.kanbanPrintSizes || [])
        .map((item) => ({
          id: item.id,
          name: String(item.name || "").trim(),
          widthIn: Number(item.widthIn || 0),
          heightIn: Number(item.heightIn || 0)
        }))
        .filter((item) => item.name && Number.isFinite(item.widthIn) && item.widthIn > 0 && Number.isFinite(item.heightIn) && item.heightIn > 0);
      const defaultId = sizes.some((item) => item.id === current.defaultKanbanPrintSizeId)
        ? current.defaultKanbanPrintSizeId
        : (sizes[0]?.id || "");
      await onSavePreferences({
        kanbanPrintSizes: sizes,
        defaultKanbanPrintSizeId: defaultId
      }, { silent: true });
      return {
        ...current,
        defaultKanbanPrintSizeId: defaultId
      };
    }
  });

  const metrologySections = [
    ["metrologyToolTypes", "Tool Types"],
    ["metrologyManufacturers", "Manufacturers"],
    ["metrologyResolutions", "Resolutions"],
    ["metrologyLocations", "Locations"],
    ["metrologyDepartments", "Departments"],
    ["metrologyStatuses", "Statuses"]
  ];
  const kanbanSections = [
    ["kanbanVendors", "Vendors"],
    ["kanbanCategories", "Categories"]
  ];
  const selectedKanbanDepartment = kanbanDepartments.find((department) => department.id === selectedKanbanDepartmentId) || null;
  const settingsOptionPlaceholder = (label) => {
    if (label === "Categories") {
      return "Category";
    }
    return label.endsWith("s") ? label.slice(0, -1) : label;
  };

  return (
    <div className="workflow-stack settings-stack">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Data</h3>
            <span>Workspace location and numbering defaults.</span>
          </div>
        </div>
        <div className="settings-admin-grid">
          <button className="import-card" onClick={onChooseDataFolder}>
            <FolderOpen size={20} />
            <strong>Change Data Folder</strong>
            <span>{workspace.dataFolder}</span>
          </button>
          <div className="subpanel">
            <div className="subpanel-header">
              <div>
                <h4>Branding</h4>
                <span>Change the software label, tagline, icon, and native window title.</span>
              </div>
            </div>
            <div className="form-grid compact-2">
              <TextField label="Software Title" value={brandingSettings.appTitle} onChange={(value) => setBrandingSettings((current) => ({ ...current, appTitle: value }))} />
              <TextField label="Tagline" value={brandingSettings.appTagline} onChange={(value) => setBrandingSettings((current) => ({ ...current, appTagline: value }))} />
              <TextField label="Window Title" value={brandingSettings.windowTitle} onChange={(value) => setBrandingSettings((current) => ({ ...current, windowTitle: value }))} />
            </div>
            <div className="subpanel top-gap">
              <div className="subpanel-header">
                <div>
                  <h4>Icon</h4>
                  <span>{brandingSettings.appIconPath || "No custom icon selected."}</span>
                </div>
                <div className="toolbar">
                  <button onClick={() => void chooseBrandIcon()}><FolderOpen size={14} /> Choose Icon</button>
                  <button onClick={() => setBrandingSettings((current) => ({ ...current, appIconPath: "" }))}>Clear</button>
                </div>
              </div>
              {brandingSettings.appIconPath ? (
                <div className="settings-icon-preview">
                  <img src={localFileUrl(brandingSettings.appIconPath)} alt="Brand icon preview" />
                </div>
              ) : (
                <div className="empty-inline">Using the default icon.</div>
              )}
            </div>
          </div>
          <div className="subpanel">
            <div className="subpanel-header">
              <div>
                <h4>Job Numbering</h4>
                <span>Defaults for Assign Number.</span>
              </div>
            </div>
            <div className="form-grid compact-2">
              <TextField label="Job Prefix" value={jobSettings.jobPrefix} onChange={(value) => setJobSettings((current) => ({ ...current, jobPrefix: value }))} />
              <TextField label="Starting Job Number" value={jobSettings.startingJobNumber} onChange={(value) => setJobSettings((current) => ({ ...current, startingJobNumber: value }))} />
            </div>
          </div>
          <div className="subpanel">
            <div className="subpanel-header">
              <div>
                <h4>Kanban Numbering</h4>
                <span>Defaults for Kanban Assign Number.</span>
              </div>
            </div>
            <div className="form-grid compact-2">
              <TextField label="Inventory Prefix" value={kanbanNumberSettings.kanbanInventoryPrefix} onChange={(value) => setKanbanNumberSettings((current) => ({ ...current, kanbanInventoryPrefix: value }))} />
              <TextField label="Starting Inventory Number" value={kanbanNumberSettings.kanbanStartingInventoryNumber} onChange={(value) => setKanbanNumberSettings((current) => ({ ...current, kanbanStartingInventoryNumber: value }))} />
            </div>
          </div>
          <div className="subpanel">
            <div className="subpanel-header">
              <div>
                <h4>AI</h4>
                <span>OpenAI settings for manual Kanban enrichment and image generation.</span>
              </div>
            </div>
            <div className="form-grid compact-2">
              <TextField
                label="OpenAI API Key"
                type="password"
                value={aiSettings.openaiApiKey}
                onChange={(value) => setAiSettings((current) => ({ ...current, openaiApiKey: value }))}
                placeholder="sk-..."
              />
            </div>
          </div>
          <div className="subpanel">
            <div className="subpanel-header">
              <div>
                <h4>Modules</h4>
                <span>Turn major workspaces on or off in the left navigation.</span>
              </div>
            </div>
            <div className="module-toggle-list">
              {PRIMARY_MODULES.map((module) => (
                <label className="module-toggle-row" key={module.id}>
                  <input
                    type="checkbox"
                    checked={moduleSettings[module.id] !== false}
                    onChange={(event) => setModuleSettings((current) => ({
                      ...normalizeEnabledModules(current),
                      [module.id]: event.target.checked
                    }))}
                  />
                  <span>
                    <strong>{module.label}</strong>
                    <small>{module.id === "metrology" ? "Gage records and calibration tracking." : `${module.label} workspace.`}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Reusable Libraries</h3>
            <span>Maintain machines, fixtures, blades, and other reusable lookup lists.</span>
          </div>
        </div>
        <LibrarySettingsSection
          workspace={workspace}
          onStatus={onStatus}
          onRefresh={onRefresh}
        />
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Operation Templates</h3>
            <span>Standardize starting operations, parameters, and steps.</span>
          </div>
        </div>
        <TemplateSettingsSection
          workspace={workspace}
          selectedTemplate={selectedTemplate}
          setSelectedTemplateId={setSelectedTemplateId}
          onStatus={onStatus}
          onRefresh={onRefresh}
        />
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Material Catalog</h3>
            <span>Configure material families and the alloys available under each one.</span>
          </div>
        </div>

        <div className="catalog-layout">
          <div className="catalog-list">
            <button className="sidebar-action" onClick={addFamily}><Plus size={14} /> New Material</button>
            {(materialFamilies || []).map((family) => (
              <button
                key={family.id}
                className={`record-list-item ${selectedFamilyId === family.id ? "selected" : ""}`}
                onClick={() => setSelectedFamilyId(family.id)}
              >
                <strong>{family.name || "Untitled Material"}</strong>
                <span>{family.alloys?.length || 0} alloys</span>
              </button>
            ))}
            {!materialFamilies.length && <div className="empty-inline">No material families configured yet.</div>}
          </div>

          {!selectedFamily ? (
            <div className="subpanel">
              <div className="empty-inline">Choose a material family or create a new one.</div>
            </div>
          ) : (
            <div className="subpanel">
              <div className="subpanel-header">
                <div>
                  <h4>{selectedFamily.name || "Material Family"}</h4>
                  <span>{selectedFamily.alloys?.length || 0} alloys</span>
                </div>
                <button className="danger subtle" onClick={() => removeFamily(selectedFamily.id)}><X size={14} /> Remove</button>
              </div>

              <div className="form-grid compact-2">
                <TextField
                  label="Material Name"
                  value={selectedFamily.name || ""}
                  onChange={(value) => updateFamily(selectedFamily.id, { name: value })}
                />
              </div>

              <div className="subpanel top-gap">
                <div className="subpanel-header">
                  <div>
                    <h4>Alloys</h4>
                    <span>Shown in the material dropdown.</span>
                  </div>
                  <button onClick={addAlloy}><Plus size={14} /> Alloy</button>
                </div>
                <div className="parameter-list">
                  {(selectedFamily.alloys || []).map((alloy, index) => (
                    <div className="parameter-row catalog-alloy-row" key={`${selectedFamily.id}-${index}`}>
                      <input value={alloy || ""} placeholder="Alloy or grade" onChange={(event) => updateAlloy(index, event.target.value)} />
                      <button className="danger subtle square" onClick={() => removeAlloy(index)}><X size={13} /></button>
                    </div>
                  ))}
                  {!selectedFamily.alloys?.length && <div className="empty-inline">No alloys configured yet.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Metrology Options</h3>
            <span>Dropdown lists used in gage records.</span>
          </div>
        </div>
        <div className="settings-metrology-grid">
          {metrologySections.map(([key, label]) => (
            <div key={key} className="subpanel">
              <div className="subpanel-header">
                <div>
                  <h4>{label}</h4>
                  <span>{metrologyOptions[key]?.length || 0} options</span>
                </div>
                <button onClick={() => addMetrologyOption(key)}><Plus size={14} /> Option</button>
              </div>
                <div className="parameter-list">
                  {(metrologyOptions[key] || []).map((value, index) => (
                    <div className="parameter-row catalog-alloy-row" key={`${key}-${index}`}>
                      <input value={value || ""} placeholder={`${settingsOptionPlaceholder(label)} option`} onChange={(event) => updateMetrologyOption(key, index, event.target.value)} />
                      <button className="danger subtle square" onClick={() => removeMetrologyOption(key, index)}><X size={13} /></button>
                    </div>
                  ))}
                {!metrologyOptions[key]?.length && <div className="empty-inline">No options configured yet.</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Kanban Options</h3>
            <span>Controlled lists used in Kanban cards.</span>
          </div>
        </div>
        <div className="catalog-layout settings-template-layout">
          <div className="catalog-list">
            <button className="sidebar-action" onClick={addKanbanDepartment}><Plus size={14} /> New Department</button>
            {(kanbanDepartments || []).map((department) => (
              <button
                key={department.id}
                className={`record-list-item ${selectedKanbanDepartmentId === department.id ? "selected" : ""}`}
                onClick={() => setSelectedKanbanDepartmentId(department.id)}
              >
                <strong>{department.name || "Untitled Department"}</strong>
                <span>{department.locations?.length || 0} locations</span>
              </button>
            ))}
            {!kanbanDepartments.length && <div className="empty-inline">No departments configured yet.</div>}
          </div>

          {!selectedKanbanDepartment ? (
            <div className="subpanel">
              <div className="empty-inline">Choose a department or create a new one.</div>
            </div>
          ) : (
            <div className="subpanel">
              <div className="subpanel-header">
                <div>
                  <h4>{selectedKanbanDepartment.name || "Kanban Department"}</h4>
                  <span>{selectedKanbanDepartment.locations?.length || 0} storage locations</span>
                </div>
                <button className="danger subtle" onClick={() => removeKanbanDepartment(selectedKanbanDepartment.id)}><X size={14} /> Remove</button>
              </div>

              <div className="form-grid compact-2">
                <TextField
                  label="Department Name"
                  value={selectedKanbanDepartment.name || ""}
                  onChange={(value) => updateKanbanDepartment(selectedKanbanDepartment.id, { name: value })}
                />
                <label className="field">
                  <span>Accent Color</span>
                  <input
                    type="color"
                    value={selectedKanbanDepartment.color || "#2563eb"}
                    onChange={(event) => updateKanbanDepartment(selectedKanbanDepartment.id, { color: event.target.value })}
                  />
                </label>
              </div>

              <div className="subpanel top-gap">
                <div className="subpanel-header">
                  <div>
                    <h4>Storage Locations</h4>
                    <span>Only available when this department is selected on a Kanban card.</span>
                  </div>
                  <button onClick={() => addKanbanDepartmentLocation(selectedKanbanDepartment.id)}><Plus size={14} /> Location</button>
                </div>
                <div className="parameter-list">
                  {(selectedKanbanDepartment.locations || []).map((location, index) => (
                    <div className="parameter-row catalog-alloy-row" key={`${selectedKanbanDepartment.id}-location-${index}`}>
                      <input value={location || ""} placeholder="Storage location" onChange={(event) => updateKanbanDepartmentLocation(selectedKanbanDepartment.id, index, event.target.value)} />
                      <button className="danger subtle square" onClick={() => removeKanbanDepartmentLocation(selectedKanbanDepartment.id, index)}><X size={13} /></button>
                    </div>
                  ))}
                  {!selectedKanbanDepartment.locations?.length && <div className="empty-inline">No locations configured for this department yet.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="settings-metrology-grid">
          {kanbanSections.map(([key, label]) => (
            <div key={key} className="subpanel">
              <div className="subpanel-header">
                <div>
                  <h4>{label}</h4>
                  <span>{kanbanOptions[key]?.length || 0} options</span>
                </div>
                <button onClick={() => addKanbanOption(key)}><Plus size={14} /> Option</button>
              </div>
              <div className="parameter-list">
                {(kanbanOptions[key] || []).map((value, index) => (
                  <div className="parameter-row catalog-alloy-row" key={`${key}-${index}`}>
                    <input value={value || ""} placeholder={`${settingsOptionPlaceholder(label)} option`} onChange={(event) => updateKanbanOption(key, index, event.target.value)} />
                    <button className="danger subtle square" onClick={() => removeKanbanOption(key, index)}><X size={13} /></button>
                  </div>
                ))}
                {!kanbanOptions[key]?.length && <div className="empty-inline">No options configured yet.</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Kanban Print Sizes</h3>
            <span>Preset label/card sizes available when generating a Kanban PDF.</span>
          </div>
          <button onClick={addKanbanPrintSize}><Plus size={14} /> Size</button>
        </div>
        <div className="parameter-list">
          {(kanbanPrintSettings.kanbanPrintSizes || []).map((size) => (
            <div className="parameter-row kanban-print-size-row" key={size.id}>
              <input
                type="radio"
                name="default-kanban-size"
                checked={kanbanPrintSettings.defaultKanbanPrintSizeId === size.id}
                onChange={() => setKanbanPrintSettings((current) => ({ ...current, defaultKanbanPrintSizeId: size.id }))}
              />
              <input value={size.name || ""} placeholder='Size name (for example 2" x 4")' onChange={(event) => updateKanbanPrintSize(size.id, { name: event.target.value })} />
              <input type="number" min="0.5" step="0.1" value={size.widthIn} placeholder="Width (in)" onChange={(event) => updateKanbanPrintSize(size.id, { widthIn: event.target.value })} />
              <input type="number" min="0.5" step="0.1" value={size.heightIn} placeholder="Height (in)" onChange={(event) => updateKanbanPrintSize(size.id, { heightIn: event.target.value })} />
              <button className="danger subtle square" onClick={() => removeKanbanPrintSize(size.id)}><X size={13} /></button>
            </div>
          ))}
          {!kanbanPrintSettings.kanbanPrintSizes?.length && <div className="empty-inline">No print sizes configured yet.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Activity</h3>
            <span>Recent changes across the workspace.</span>
          </div>
        </div>
        <div className="stack-list">
          {(workspace.dashboard?.recentAudit || []).map((item, index) => (
            <div className="inline-card" key={`${item.timestamp}-${index}`}>
              <strong>{item.eventType}</strong>
              <span>{item.message}</span>
              <small>{item.timestamp}</small>
            </div>
          ))}
          {!workspace.dashboard?.recentAudit?.length && <div className="empty-inline">No recent activity.</div>}
        </div>
      </section>
    </div>
  );
}

function QrCodeImage({ value, alt }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc("");
      return () => {
        cancelled = true;
      };
    }
    QRCode.toDataURL(String(value), {
      margin: 1,
      width: 240,
      color: {
        dark: "#111111",
        light: "#ffffff"
      }
    }).then((dataUrl) => {
      if (!cancelled) {
        setSrc(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setSrc("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return <div className="qr-placeholder">QR unavailable</div>;
  }
  return <img className="qr-image" src={src} alt={alt} />;
}

function PrintKanbanCard({ cardId, sizeId = "", monochrome = false }) {
  const [card, setCard] = useState(null);
  const [workspaceData, setWorkspaceData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedCard, loadedWorkspace] = await Promise.all([
          api.loadKanbanCard(cardId),
          api.loadWorkspace()
        ]);
        if (!loadedCard) {
          throw new Error("Kanban card not found.");
        }
        setCard(loadedCard);
        setWorkspaceData(loadedWorkspace);
      } catch (loadError) {
        setError(loadError.message || String(loadError));
      }
    };
    load();
  }, [cardId]);

  if (error) return <Fatal title="Print Error" message={error} />;
  if (!card || !workspaceData) return <LoadingScreen message="Loading Kanban card..." />;

  const photoUrl = kanbanPhotoSrc(card);
  const amerpQrValue = kanbanDeepLink(card.id, workspaceData);
  const size = kanbanPrintSizes(workspaceData.preferences).find((item) => item.id === sizeId)
    || kanbanPrintSizes(workspaceData.preferences).find((item) => item.id === defaultKanbanPrintSizeId(workspaceData.preferences))
    || { name: '2" x 4"', widthIn: 2, heightIn: 4 };
  const effectiveWidth = Number(size.widthIn || 2) * 0.93;
  const effectiveHeight = Number(size.heightIn || 4) * 0.93;
  const accentColor = monochrome ? "#111111" : kanbanDepartmentColor(workspaceData.preferences, card.department);
  const subtitle = [card.internalInventoryNumber, card.packSize].filter(Boolean).join(" | ");
  const detailRows = [
    ["Minimum", card.minimumLevel],
    ["Location", card.storageLocation],
    ["Order", card.orderQuantity],
    ["Vendor", card.vendor],
    ["Category", card.category]
  ].filter(([, value]) => value);

  return (
    <div className="print-shell kanban-print-shell">
      <div className="print-actions screen-only kanban-label-actions" style={{ width: `${effectiveWidth}in` }}>
        <button onClick={() => { window.location.hash = "/"; }}>Back</button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <section
        className="print-page kanban-print-page kanban-label-page"
        style={{
          width: `${effectiveWidth}in`,
          height: `${effectiveHeight}in`,
          minHeight: `${effectiveHeight}in`,
          "--kanban-accent": accentColor
        }}
      >
        <article className={`kanban-label-card ${monochrome ? "kanban-label-monochrome" : ""}`}>
          <header className="kanban-label-header front-only">
            <div className="kanban-label-title-block">
              <h1>{card.itemName || "Kanban Item"}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </header>

          <div className="kanban-label-accent-line" />

          <div className="kanban-label-body">
            <div className="kanban-label-details">
              {detailRows.map(([label, value]) => (
                <div key={label} className="kanban-detail-row">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              {card.description ? (
                <div className="kanban-label-copy">
                  <span>Description</span>
                  <p>{card.description}</p>
                </div>
              ) : null}
              {card.orderingNotes ? (
                <div className="kanban-label-copy secondary">
                  <span>Notes</span>
                  <p>{card.orderingNotes}</p>
                </div>
              ) : null}
            </div>

            <div className="kanban-label-photo-wrap">
              {photoUrl ? (
                <div className="kanban-label-photo">
                  <img src={photoUrl} alt={card.itemName || "Kanban item"} />
                </div>
              ) : (
                <div className="kanban-label-photo empty-inline">No product photo</div>
              )}
            </div>
          </div>

          <footer className="kanban-label-footer front-only">
            <div className="kanban-label-department">
              <span>{card.department || ""}</span>
            </div>
          </footer>
        </article>
      </section>

      <section
        className="print-page kanban-print-page kanban-label-page kanban-label-back-page"
        style={{
          width: `${effectiveWidth}in`,
          height: `${effectiveHeight}in`,
          minHeight: `${effectiveHeight}in`
        }}
      >
        <article className={`kanban-label-card kanban-label-card-back ${monochrome ? "kanban-label-monochrome" : ""}`}>
          <div className="kanban-card-back-grid">
            <div className="kanban-card-back-qr-block">
              <span>AMERP</span>
              <QrCodeImage value={amerpQrValue} alt="AMERP QR code" />
            </div>
            <div className="kanban-card-back-qr-block">
              <span>Vendor</span>
              <QrCodeImage value={card.purchaseUrl} alt="Vendor QR code" />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function PrintMaterialLabel({ materialId, sizeId = "", monochrome = false }) {
  const [material, setMaterial] = useState(null);
  const [workspaceData, setWorkspaceData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedMaterial, loadedWorkspace] = await Promise.all([
          api.loadMaterial(materialId),
          api.loadWorkspace()
        ]);
        if (!loadedMaterial) {
          throw new Error("Material not found.");
        }
        setMaterial(syncMaterialClassification(loadedMaterial, loadedWorkspace.preferences));
        setWorkspaceData(loadedWorkspace);
      } catch (loadError) {
        setError(loadError.message || String(loadError));
      }
    };
    load();
  }, [materialId]);

  if (error) return <Fatal title="Print Error" message={error} />;
  if (!material || !workspaceData) return <LoadingScreen message="Loading material label..." />;

  const amerpQrValue = materialDeepLink(material.id, workspaceData);
  const size = kanbanPrintSizes(workspaceData.preferences).find((item) => item.id === sizeId)
    || kanbanPrintSizes(workspaceData.preferences).find((item) => item.id === defaultKanbanPrintSizeId(workspaceData.preferences))
    || { name: '2" x 4"', widthIn: 2, heightIn: 4 };
  const effectiveWidth = Number(size.widthIn || 2) * 0.93;
  const effectiveHeight = Number(size.heightIn || 4) * 0.93;
  const accentColor = monochrome ? "#111111" : "#1d6b57";
  const titleParts = [material.materialFamily, materialDisplayType(material)].filter(Boolean);
  const uniqueTitleParts = titleParts.filter((value, index) => titleParts.findIndex((item) => item === value) === index);
  const title = material.serialCode || "Material";
  const subtitle = [uniqueTitleParts.join(" / "), material.form].filter(Boolean).join(" | ");
  const detailRows = [
    ["Dimensions", materialDimensionsSummary(material.form, material.shapeDimensions, material.dimensions || "")],
    ["Supplier", material.supplier],
    ["PO", material.purchaseOrder],
    ["Lot", material.lotNumber],
    ["Heat", material.heatNumber],
    ["Traceability", material.traceabilityLevel],
    ["Location", material.storageLocation],
    ["Received", material.dateReceived]
  ].filter(([, value]) => value);
  const footerLabel = material.storageLocation || material.traceabilityLevel || material.status || "";

  return (
    <div className="print-shell kanban-print-shell">
      <div className="print-actions screen-only kanban-label-actions" style={{ width: `${effectiveWidth}in` }}>
        <button onClick={() => { window.location.hash = "/"; }}>Back</button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <section
        className="print-page kanban-print-page kanban-label-page material-label-page"
        style={{
          width: `${effectiveWidth}in`,
          height: `${effectiveHeight}in`,
          minHeight: `${effectiveHeight}in`,
          "--kanban-accent": accentColor
        }}
      >
        <article className={`kanban-label-card material-label-card ${monochrome ? "kanban-label-monochrome" : ""}`}>
          <header className="kanban-label-header front-only">
            <div className="kanban-label-title-block">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </header>

          <div className="kanban-label-accent-line" />

          <div className="kanban-label-body">
            <div className="kanban-label-details">
              {detailRows.map(([label, value]) => (
                <div key={label} className="kanban-detail-row">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              {material.notes ? (
                <div className="kanban-label-copy secondary">
                  <span>Notes</span>
                  <p>{material.notes}</p>
                </div>
              ) : null}
            </div>

            <div className="kanban-label-photo-wrap">
              <div className="kanban-label-photo material-label-qr-photo">
                <QrCodeImage value={amerpQrValue} alt="AMERP QR code" />
              </div>
            </div>
          </div>

          <footer className="kanban-label-footer front-only">
            <div className="kanban-label-department">
              <span>{footerLabel}</span>
            </div>
          </footer>
        </article>
      </section>
    </div>
  );
}

function PrintPacket({ jobId }) {
  const [job, setJob] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [libraries, setLibraries] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedJob, materialRows, instrumentRows, loadedLibraries] = await Promise.all([
          api.loadJob(jobId),
          api.listMaterials(),
          api.listInstruments(),
          api.loadLibraries()
        ]);
        if (!loadedJob) throw new Error("Job not found.");
        setJob(loadedJob);
        setMaterials(materialRows);
        setInstruments(instrumentRows);
        setLibraries(loadedLibraries || {});
      } catch (loadError) {
        setError(loadError.message || String(loadError));
      }
    };
    load();
  }, [jobId]);

  if (error) return <Fatal title="Print Error" message={error} />;
  if (!job) return <LoadingScreen message="Loading traveler..." />;

  const materialMap = new Map(materials.map((item) => [item.id, item]));
  const instrumentMap = new Map(instruments.map((item) => [item.instrumentId, item]));

  return (
    <div className="print-shell">
      <div className="print-actions screen-only">
        <button onClick={() => { window.location.hash = "/"; }}>Back</button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <section className="print-page">
        <header className="packet-header">
          <div>
            <h1>{job.jobNumber || "Untitled Job"}</h1>
            <p>{job.customer || "No customer"}</p>
          </div>
          <div className="revision-box">
            <strong>Rev {job.revision?.number || "-"}</strong>
            <span>{job.revision?.date || ""}</span>
          </div>
        </header>
        <div className="packet-grid">
          <PrintField label="Status" value={job.status} />
          <PrintField label="Priority" value={job.priority} />
          <PrintField label="Due Date" value={job.dueDate} />
          <PrintField label="Author" value={job.revision?.author} />
        </div>
        <div className="route-summary">
          <h2>Parts And Routes</h2>
          <ol>
            {job.parts.map((part) => (
              <li key={part.id}>{part.partNumber || part.partName || part.id} • {part.operations.length} operations</li>
            ))}
          </ol>
        </div>
        {job.parts.map((part) => (
          <div className="print-part-block" key={part.id}>
            <header className="operation-print-header">
              <span>Part</span>
              <h2>{part.partNumber || part.partName || part.id}</h2>
            </header>
            <div className="packet-grid compact-grid">
              <PrintField label="Description" value={part.description} compact />
              <PrintField label="Quantity" value={part.quantity} compact />
              <PrintField label="Material Spec" value={part.materialSpec} compact />
              <PrintField label="Material Lots" value={[(part.requiredMaterialLots || []).map((id) => materialMap.get(id)?.serialCode || id).join(", "), part.customMaterialText || ""].filter(Boolean).join(" / ")} compact />
              <PrintField label="Revision" value={part.revision?.number} compact />
            </div>
            {part.operations.map((operation) => {
              const instructionSteps = instructionStepsFromOperation(operation);
              return (
                <div className="print-operation-block" key={operation.id}>
                  <h3>{operation.sequence}. {operation.title}</h3>
                  <div className="print-two-column compact-grid">
                    <div>
                      <PrintField label="Op Code" value={operation.operationCode} compact />
                      <PrintField label="Type" value={operation.type} compact />
                      <PrintField label="Work Center" value={operation.workCenter} compact />
                      <PrintField label="Status" value={operation.status} compact />
                    </div>
                    <div>
                      <PrintField label="Tools" value={(operation.tools || []).map((tool) => summarizeJobTool(tool)).join(", ")} compact />
                      <PrintField label="Libraries" value={summarizeOperationLibraries(operation, libraries, []).join(" | ")} compact />
                      <PrintField label="Instruments" value={(operation.requiredInstruments || []).map((id) => instrumentMap.get(id)?.toolName || id).join(", ")} compact />
                    </div>
                  </div>
                  {operation.parameters?.length > 0 && (
                    <table className="print-table compact">
                      <tbody>
                        {operation.parameters.map((parameter) => (
                          <tr key={parameter.id}>
                            <th>{parameter.label}</th>
                            <td>{parameter.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {operation.setupInstructions && <div className="print-note compact"><strong>Setup</strong><p>{operation.setupInstructions}</p></div>}
                  {instructionSteps.length > 0 ? (
                    <div className="print-note compact">
                      <strong>Work Instructions</strong>
                      <div className="print-step-list">
                        {instructionSteps.map((step, index) => (
                          <div key={step.id || index} className="print-step-block">
                            <p>{index + 1}. {step.text || ""}</p>
                            {step.images?.length > 0 && (
                              <div className="print-images compact">
                                {step.images.map((image) => <img key={image.id} src={api.assetUrl(image.relativePath)} alt={image.name || "Step"} />)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : operation.workInstructions ? <div className="print-note compact"><strong>Work Instructions</strong><p>{operation.workInstructions}</p></div> : null}
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}

function TravelerPrintPacket({ jobId }) {
  const [job, setJob] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [libraries, setLibraries] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedJob, materialRows, instrumentRows, loadedLibraries] = await Promise.all([
          api.loadJob(jobId),
          api.listMaterials(),
          api.listInstruments(),
          api.loadLibraries()
        ]);
        if (!loadedJob) throw new Error("Job not found.");
        setJob(loadedJob);
        setMaterials(materialRows);
        setInstruments(instrumentRows);
        setLibraries(loadedLibraries || {});
      } catch (loadError) {
        setError(loadError.message || String(loadError));
      }
    };
    load();
  }, [jobId]);

  if (error) return <Fatal title="Print Error" message={error} />;
  if (!job) return <LoadingScreen message="Loading traveler..." />;

  const materialMap = new Map(materials.map((item) => [item.id, item]));
  const instrumentMap = new Map(instruments.map((item) => [item.instrumentId, item]));
  const partCount = job.parts.length;
  const operationCount = job.parts.reduce((sum, part) => sum + (part.operations || []).length, 0);

  return (
    <div className="print-shell traveler-shell">
      <div className="print-actions screen-only">
        <button onClick={() => { window.location.hash = "/"; }}>Back</button>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <section className="print-page traveler-page traveler-page-sheet traveler-job-sheet">
        <div className="traveler-page-inner">
          <header className="packet-header traveler-header">
            <div className="traveler-header-copy">
              <span className="traveler-kicker">Job Traveler / Setup Sheet</span>
              <h1>{job.jobNumber || "Untitled Job"}</h1>
              <p>{job.customer || "No customer"}</p>
            </div>
            <div className="traveler-header-badge">
              <strong>{partCount} part{partCount === 1 ? "" : "s"}</strong>
              <span>{operationCount} operation{operationCount === 1 ? "" : "s"}</span>
            </div>
          </header>

          <section className="traveler-card traveler-job-card">
            <div className="traveler-card-heading">
              <div>
                <h2>Job Details</h2>
                <span>Job first, then part details, then operations.</span>
              </div>
            </div>
            <div className="traveler-fact-stack">
              <div className="traveler-fact-grid traveler-job-grid">
                <PrintField label="Status" value={job.status} compact />
                <PrintField label="Priority" value={job.priority} compact />
                <PrintField label="Due Date" value={job.dueDate} compact />
                <div className="traveler-grid-spacer" aria-hidden="true" />
              </div>
              <div className="traveler-fact-grid traveler-job-grid">
                <PrintField label="Updated" value={formatDateTime(job.updatedAt)} compact />
                <PrintField label="Revision" value={job.revision?.number} compact />
                <PrintField label="Revision Date" value={job.revision?.date} compact />
                <div className="traveler-grid-spacer" aria-hidden="true" />
              </div>
            </div>
            {job.notes ? (
              <div className="traveler-note-block">
                <strong>Job Notes</strong>
                <p>{job.notes}</p>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      {job.parts.map((part) => (
        <React.Fragment key={part.id}>
          <section className="print-page traveler-page traveler-page-sheet traveler-part-block">
            <div className="traveler-page-inner">
            <div className="traveler-section-accent" />
            <div className="traveler-card traveler-part-card">
              <header className="operation-print-header traveler-section-header">
                <div>
                  <span className="traveler-kicker">Part</span>
                  <h2>{part.partNumber || part.partName || part.id}</h2>
                  {part.partName && part.partName !== part.partNumber ? <p>{part.partName}</p> : null}
                </div>
                <div className="traveler-part-count">{part.operations.length} operation{part.operations.length === 1 ? "" : "s"}</div>
              </header>
              <div className="traveler-fact-stack compact-grid">
                <div className="traveler-fact-grid traveler-part-grid">
                  <PrintField label="Quantity" value={part.quantity} compact />
                  <PrintField label="Revision" value={part.revision?.number} compact />
                  <PrintField label="Revision Date" value={part.revision?.date} compact />
                </div>
                <div className="traveler-fact-grid traveler-part-material-grid">
                  <PrintField label="Material Spec" value={part.materialSpec} compact />
                  <PrintField label="Material Lots" value={[(part.requiredMaterialLots || []).map((id) => materialMap.get(id)?.serialCode || id).join(", "), part.customMaterialText || ""].filter(Boolean).join(" / ")} compact />
                </div>
              </div>
              {part.notes ? (
                <div className="traveler-note-block">
                  <strong>Part Notes</strong>
                  <p>{part.notes}</p>
                </div>
              ) : null}
            </div>
            </div>
          </section>

          <div className="traveler-operation-list">
              {part.operations.map((operation, operationIndex) => {
                const instructionSteps = instructionStepsFromOperation(operation);
                const libraryRows = operationLibraryRows(operation, libraries, []);
                const parameterRows = [
                  ...(operation.parameters || [])
                    .filter((parameter) => parameter.label || parameter.value)
                    .map((parameter) => ({
                      id: parameter.id,
                      label: parameter.label || "Parameter",
                      value: parameter.value || "-"
                    })),
                  ...libraryRows.map((libraryRow, index) => ({
                    id: `library-${operation.id}-${index}`,
                    label: libraryRow.label,
                    value: libraryRow.value
                  }))
                ];
                const instrumentNames = (operation.requiredInstruments || [])
                  .map((id) => instrumentMap.get(id)?.toolName || id)
                  .filter(Boolean);
                const showDetailedTooling = supportsDetailedTooling(operation.type);

                return (
                  <section className="print-page traveler-page traveler-page-sheet traveler-operation-block print-operation-block" key={operation.id}>
                    <div className="traveler-page-inner">
                    <article className="traveler-card traveler-operation-card">
                    <header className="operation-print-header traveler-section-header">
                      <div>
                        <span className="traveler-kicker">Operation {operationIndex + 1}</span>
                        <h2>{operation.title || "Operation"}</h2>
                        <p>
                          Part: {part.partNumber || part.partName || part.id}
                          {part.partName && part.partName !== part.partNumber ? ` / ${part.partName}` : ""}
                        </p>
                      </div>
                      <div className="traveler-operation-type">{operation.type || "General"}</div>
                    </header>

                    <div className="traveler-fact-grid traveler-operation-grid compact-grid">
                      <PrintField label="Work Center" value={operation.workCenter} compact />
                      <PrintField label="Type" value={operation.type} compact />
                      {instrumentNames.length ? <PrintField label="Instruments" value={instrumentNames.join(", ")} compact /> : null}
                    </div>

                    {parameterRows.length ? (
                      <div className="traveler-subsection">
                        <strong className="traveler-subsection-title">Parameters</strong>
                        <table className="print-table compact traveler-parameter-table">
                          <tbody>
                            {parameterRows.map((parameter) => (
                              <tr key={parameter.id}>
                                <th>{parameter.label}</th>
                                <td>{parameter.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {showDetailedTooling ? (
                      <div className="traveler-subsection">
                        <strong className="traveler-subsection-title">Tooling</strong>
                        {(operation.tools || []).length ? (
                          <div className="traveler-tool-grid">
                            {(operation.tools || []).map((tool, index) => (
                              <div key={tool.id || `${operation.id}-tool-${index}`} className="traveler-tool-card">
                                <h4>{toolHeading(tool, index)}</h4>
                                <div className="traveler-tool-facts">
                                  <PrintField label="Diameter" value={tool.diameter} compact />
                                  <PrintField label="Stickout" value={tool.length} compact />
                                  <PrintField label="Holder" value={tool.holder} compact />
                                  <PrintField label="Source" value={tool.source} compact />
                                </div>
                                {tool.details ? (
                                  <div className="traveler-note-block compact">
                                    <strong>Details</strong>
                                    <p>{tool.details}</p>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="traveler-empty-state">No tools defined.</div>
                        )}
                      </div>
                    ) : null}

                    {instructionSteps.length ? (
                      <div className="traveler-subsection">
                        <strong className="traveler-subsection-title">Operation Steps</strong>
                        <div className="traveler-step-list">
                          {instructionSteps.map((step, index) => (
                            <div key={step.id || index} className="traveler-step-card print-step-block">
                              <p className="traveler-step-text">
                                <span>{index + 1}.</span> {step.text || ""}
                              </p>
                              {step.images?.length > 0 ? (
                                <div className="print-images compact traveler-step-images">
                                  {step.images.map((image) => <img key={image.id} src={api.assetUrl(image.relativePath)} alt={image.name || "Step"} />)}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {operation.notes ? (
                      <div className="traveler-note-block compact">
                        <strong>Operation Notes</strong>
                        <p>{operation.notes}</p>
                      </div>
                    ) : null}
                    </article>
                    </div>
                  </section>
                );
              })}
            </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder = "", readOnly = false, disabled = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} disabled={disabled} />
    </label>
  );
}

function SelectField({ label, value, options, onChange, emptyLabel = "", disabled = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => (
          <option key={`${label}-${option || "empty"}`} value={option}>
            {option || emptyLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectWithInlineAdd({
  label,
  value,
  options,
  onChange,
  onAddOption,
  emptyLabel = "",
  newPlaceholder = "New option",
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const saveOption = async () => {
    if (!onAddOption) return;
    setSaving(true);
    try {
      const saved = await onAddOption(draft);
      onChange(saved);
      setDraft("");
      setOpen(false);
    } catch (error) {
      window.alert(error.message || String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-action-row">
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          {options.map((option) => (
            <option key={`${label}-${option || "empty"}`} value={option}>
              {option || emptyLabel}
            </option>
          ))}
        </select>
        {onAddOption ? (
          <button type="button" className="inline-action-button" onClick={() => setOpen((current) => !current)} disabled={disabled || saving}>
            <Plus size={13} /> New
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mini-inline-editor">
          <input value={draft} placeholder={newPlaceholder} onChange={(event) => setDraft(event.target.value)} disabled={saving} />
          <button type="button" className="inline-action-button" onClick={() => void saveOption()} disabled={saving || !draft.trim()}>Add</button>
          <button
            type="button"
            className="inline-action-button"
            onClick={() => {
              setOpen(false);
              setDraft("");
            }}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }) {
  return (
    <label className="field full">
      <span>{label}</span>
      <textarea value={value || ""} rows={rows} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EmptyState({ icon: Icon, title, text, actionLabel, onAction }) {
  return (
    <section className="empty-state">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && <button onClick={onAction}>{actionLabel}</button>}
    </section>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel narrow">
        <div className="panel-heading">
          <h3>{title}</h3>
        </div>
        <p>{message}</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function KanbanPrintDialog({
  open,
  title = "Kanban Card Size",
  description = "Choose the card or label size to use for this PDF.",
  sizes,
  selectedSizeId,
  monochrome = false,
  onChange,
  onToggleMonochrome,
  onCancel,
  onConfirm
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel narrow">
        <div className="panel-heading">
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
        <label className="field">
          <span>Print Size</span>
          <select value={selectedSizeId || ""} onChange={(event) => onChange(event.target.value)}>
            {(sizes || []).map((size) => (
              <option key={size.id} value={size.id}>
                {size.name} ({size.widthIn}" x {size.heightIn}")
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row top-gap">
          <input type="checkbox" checked={monochrome} onChange={(event) => onToggleMonochrome?.(event.target.checked)} />
          <span>Black and white mode</span>
        </label>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} disabled={!selectedSizeId}><FileDown size={14} /> Export PDF</button>
        </div>
      </div>
    </div>
  );
}

function SaveStatePill({ state }) {
  const labels = {
    saving: "Saving...",
    saved: "Saved",
    error: "Save error"
  };
  return <div className={`save-state-pill ${state || "saved"}`}>{labels[state] || labels.saved}</div>;
}

function LoadingScreen({ message }) {
  return <div className="setup-screen"><div className="setup-panel"><h1>{message}</h1></div></div>;
}

function Fatal({ title, message }) {
  return <div className="fatal"><h1>{title}</h1><p>{message}</p></div>;
}

function StatCard({ label, value, accent = false }) {
  return (
    <section className={`panel stat-card ${accent ? "accent-card" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function PrintField({ label, value, compact = false, className = "" }) {
  return (
    <div className={`print-field ${compact ? "compact" : ""} ${className}`.trim()}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function titleForView(view) {
  return {
    jobs: "Jobs",
    kanban: "Kanban",
    materials: "Materials",
    metrology: "Gages",
    templates: "Operation Templates",
    settings: "Settings"
  }[view] || "AMERP";
}

function subtitleForView(view) {
  return {
    jobs: "",
    kanban: "",
    materials: "",
    metrology: "",
    templates: "",
    settings: ""
  }[view] || "";
}

createRoot(document.getElementById("root")).render(<App />);

