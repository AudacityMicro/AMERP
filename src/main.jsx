import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
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
  X
} from "lucide-react";
import "./styles.css";

const api = window.amerp;

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const blankJob = () => ({
  id: uid("job"),
  jobNumber: "",
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
  tools: [],
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
  revision: {
    number: "A",
    date: today(),
    notes: ""
  },
  notes: "",
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
  notes: "",
  parameters: [blankParameter()],
  stepImages: [],
  tools: [],
  setupTemplateRefs: [],
  jobToolRefs: [],
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
  onError
}) {
  const timerRef = useRef(null);
  const lastSavedRef = useRef(JSON.stringify(value ?? null));
  const latestValueRef = useRef(value);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const isReadyRef = useRef(isReady);
  const enabledRef = useRef(enabled);
  const delayRef = useRef(delay);

  latestValueRef.current = value;
  saveRef.current = save;
  onSavedRef.current = onSaved;
  onErrorRef.current = onError;
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
    } catch (error) {
      if (generation === generationRef.current) {
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
  if (route.startsWith("/print/")) {
    const jobId = decodeURIComponent(route.replace("/print/", "").split("?")[0]);
    return <PrintPacket jobId={jobId} />;
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
  const [view, setView] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [startupError, setStartupError] = useState("");
  const fusionImportInFlight = useRef(false);
  const refreshWorkspaceRef = useRef(null);

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [jobScreen, setJobScreen] = useState("list");
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [selectedOperationId, setSelectedOperationId] = useState(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [material, setMaterial] = useState(null);
  const [materialScreen, setMaterialScreen] = useState("list");

  const [selectedInstrumentId, setSelectedInstrumentId] = useState(null);
  const [instrumentPayload, setInstrumentPayload] = useState(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [lastIndexMaintenance, setLastIndexMaintenance] = useState(0);

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
        setSelectedMaterialId(null);
        setMaterial(null);
        setMaterialScreen("list");
        setSelectedInstrumentId(null);
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
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

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
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openInstrument = async (instrumentId) => {
    setBusy(true);
    try {
      if (selectedInstrumentId && selectedInstrumentId !== instrumentId) {
        await api.releaseLock("instrument", selectedInstrumentId);
      }
      const loaded = await api.loadInstrument(instrumentId, { acquireLock: true });
      setSelectedInstrumentId(instrumentId);
      setInstrumentPayload(loaded);
      setView("metrology");
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
  };

  const showJobList = () => {
    setView("jobs");
    setJobScreen("list");
    setSelectedPartId(null);
    setSelectedOperationId(null);
  };

  const openPart = (partId) => {
    setSelectedPartId(partId);
    setSelectedOperationId(null);
    setJobScreen("part");
  };

  const openOperation = (partId, operationId) => {
    setSelectedPartId(partId);
    setSelectedOperationId(operationId);
    setJobScreen("operation");
  };

  const backToJob = () => {
    setSelectedPartId(null);
    setSelectedOperationId(null);
    setJobScreen("job");
  };

  const backToPart = () => {
    setSelectedOperationId(null);
    setJobScreen("part");
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

  const applySavedJob = async (saved) => {
    setJob(saved);
    setSelectedJobId(saved.id);
    setSelectedPartId((current) => saved.parts.some((part) => part.id === current) ? current : null);
    setSelectedOperationId((current) => saved.parts.some((part) => part.operations.some((operation) => operation.id === current)) ? current : null);
    await refreshWorkspace();
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
    setInstrumentPayload(blankInstrumentPayload());
    setView("metrology");
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

  if (!workspace) {
    if (startupError) {
      return <Fatal title="Workspace Load Failed" message={startupError} />;
    }
    return <LoadingScreen message="Loading AMERP workspace..." />;
  }

  const selectedTemplate = workspace.templates.find((item) => item.id === selectedTemplateId) || workspace.templates[0] || null;
  const createInlineMaterial = async (draft) => {
    const saved = await api.saveMaterial(draft);
    await refreshWorkspace();
    return saved;
  };

  const showMaterialsList = () => {
    setView("materials");
    setMaterialScreen("list");
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

  useAutoSave({
    value: job,
    resetKey: `job:${job?.id || "none"}`,
    enabled: Boolean(job),
    isReady: (current) => Boolean(current?.jobNumber || current?.customer),
    save: (current) => api.saveJob(current),
    onSaved: applySavedJob,
    onError: (error) => showStatus(error.message || String(error))
  });

  useAutoSave({
    value: material,
    resetKey: `material:${material?.id || "none"}`,
    enabled: Boolean(material),
    isReady: (current) => Boolean(current?.supplier && materialDisplayType(current)),
    save: (current) => api.saveMaterial(current),
    onSaved: applySavedMaterial,
    onError: (error) => showStatus(error.message || String(error))
  });

  useAutoSave({
    value: instrumentPayload,
    resetKey: `instrument:${instrumentPayload?.instrument?.instrument_id || "none"}`,
    enabled: Boolean(instrumentPayload),
    isReady: (current) => Boolean(current?.instrument?.tool_name),
    save: (current) => api.saveInstrument(current),
    onSaved: applySavedInstrument,
    onError: (error) => showStatus(error.message || String(error))
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <Hammer size={26} />
          <div>
            <h1>AMERP</h1>
            <span>Jobshop ERP</span>
          </div>
        </div>

        <nav className="nav-tabs">
          <NavButton icon={ClipboardList} active={view === "dashboard"} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavButton icon={Package} active={view === "jobs"} label="Jobs" onClick={showJobList} />
          <NavButton icon={Database} active={view === "materials"} label="Materials" onClick={showMaterialsList} />
          <NavButton icon={Gauge} active={view === "metrology"} label="Gages" onClick={() => setView("metrology")} />
          <NavButton icon={Settings} active={view === "settings"} label="Settings" onClick={() => setView("settings")} />
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-heading">Quick Actions</div>
          <button className="sidebar-action" onClick={createNewJob}><Plus size={15} /> New Job</button>
          <button className="sidebar-action" onClick={createNewMaterial}><Plus size={15} /> New Material</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>{titleForView(view)}</h2>
            {subtitleForView(view) ? <p>{subtitleForView(view)}</p> : null}
          </div>
          <div className="toolbar">
            {view === "jobs" && jobScreen !== "list" && (
              <>
                <button onClick={exportCurrentJobPdf} disabled={!job || busy}><FileDown size={16} /> PDF</button>
                <button className="danger" onClick={archiveCurrentJob} disabled={!selectedJobId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
            {view === "materials" && materialScreen === "detail" && (
              <>
                <button className="danger" onClick={archiveCurrentMaterial} disabled={!selectedMaterialId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
            {view === "metrology" && (
              <>
                <button className="danger" onClick={archiveCurrentInstrument} disabled={!selectedInstrumentId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
          </div>
        </header>

        {status && <div className="status-banner">{status}</div>}

        {view === "dashboard" && <DashboardView workspace={workspace} />}
        {view === "jobs" && (
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
            onImportFusionToPart={importFusionIntoPart}
            onChooseOperationImages={async (jobId, partId, operationId) => api.chooseOperationImages(jobId, partId, operationId)}
            onCreateInlineMaterial={createInlineMaterial}
          />
        )}
        {view === "materials" && (
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
          />
        )}
        {view === "metrology" && (
          <MetrologyView
            workspace={workspace}
            payload={instrumentPayload}
            setPayload={setInstrumentPayload}
            onOpenInstrument={openInstrument}
            onCreateNew={createNewInstrument}
          />
        )}
        {view === "templates" && (
          <TemplatesView
            workspace={workspace}
            selectedTemplate={selectedTemplate}
            setSelectedTemplateId={setSelectedTemplateId}
            onStatus={showStatus}
            onRefresh={refreshWorkspace}
          />
        )}
        {view === "settings" && (
          <SettingsView
            onChooseDataFolder={() => api.selectDataFolder().then(() => refreshWorkspace(false))}
            onOpenTemplates={() => setView("templates")}
            onSavePreferences={savePreferences}
            workspace={workspace}
          />
        )}
      </main>
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
        operation.parameters = (template.defaultParameters || []).map((item) => ({ ...blankParameter(), label: item.label || "", value: item.value || "" }));
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
  onChooseOperationImages,
  onImportFusionToPart,
  onCreateInlineMaterial
}) {
  const materials = workspace.materials || [];
  const instruments = workspace.instruments || [];
  const templates = workspace.templates || [];
  const selectedPart = job?.parts?.find((part) => part.id === selectedPartId) || null;
  const selectedOperation = selectedPart?.operations?.find((operation) => operation.id === selectedOperationId) || null;

  const updateJob = (patch) => setJob((current) => ({ ...current, ...patch }));
  const updateRevision = (patch) => setJob((current) => ({ ...current, revision: { ...current.revision, ...patch } }));
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
        operation.parameters = (template.defaultParameters || []).map((item) => ({ ...blankParameter(), label: item.label || "", value: item.value || "" }));
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

  if (jobScreen === "list") {
    return <JobListScreen jobs={workspace.jobs} onOpenJob={onOpenJob} onCreateJob={onCreateJob} />;
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
        materials={materials}
        instruments={instruments}
        constants={workspace.constants}
        preferences={workspace.preferences}
        onBack={onBackToPart}
        onUpdate={(updater) => updateOperation(selectedPart.id, selectedOperation.id, updater)}
        onRemove={() => {
          removeOperation(selectedPart.id, selectedOperation.id);
          onBackToPart();
        }}
        onAddImages={async () => {
          const images = await onChooseOperationImages(job.id, selectedPart.id, selectedOperation.id);
          updateOperation(selectedPart.id, selectedOperation.id, (current) => ({ ...current, stepImages: [...current.stepImages, ...images] }));
        }}
        onCreateInlineMaterial={onCreateInlineMaterial}
      />
    );
  }

  if (jobScreen === "part" && selectedPart) {
    return (
      <PartDetailScreen
        busy={busy}
        part={selectedPart}
        templates={templates}
        onBack={onBackToJob}
        onUpdate={(updater) => updatePart(selectedPart.id, updater)}
        onRemove={() => {
          removePart(selectedPart.id);
          onBackToJob();
        }}
        onAddOperation={addOperation}
        onImportFusion={onImportFusionToPart}
        onOpenOperation={(operationId) => onOpenOperation(selectedPart.id, operationId)}
      />
    );
  }

  return (
    <JobDetailScreen
      job={job}
      constants={workspace.constants}
      updateJob={updateJob}
      updateRevision={updateRevision}
      onBack={onBackToJobList}
      onAddPart={addPart}
      onOpenPart={onOpenPart}
    />
  );
}

function JobListScreen({ jobs, onOpenJob, onCreateJob }) {
  const [query, setQuery] = useState("");
  const filteredJobs = jobs.filter((item) => {
    const haystack = [item.jobNumber, item.customer, item.routeSummary, item.id].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <section className="panel">
      <div className="panel-heading inline">
        <div>
          <h3>Jobs</h3>
          <span>{filteredJobs.length} records</span>
        </div>
        <button onClick={onCreateJob}><Plus size={15} /> New Job</button>
      </div>
      <TextField label="Search Jobs" value={query} onChange={setQuery} placeholder="Job number, customer, route..." />
      <div className="record-list top-gap">
        {filteredJobs.map((item) => (
          <button key={item.id} className="record-list-item" onClick={() => onOpenJob(item.id)}>
            <strong>{item.jobNumber || item.id}</strong>
            <span>{item.customer || "No customer"}</span>
            <small>{item.partCount} parts / {item.operationCount} ops</small>
          </button>
        ))}
        {!filteredJobs.length && <div className="empty-inline">No jobs matched the current search.</div>}
      </div>
    </section>
  );
}

function JobDetailScreen({ job, constants, updateJob, updateRevision, onBack, onAddPart, onOpenPart }) {
  return (
    <div className="workspace-columns">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Job Header</h3>
            <span>{job.parts.length} parts</span>
          </div>
          <button onClick={onBack}>Back To Jobs</button>
        </div>
        <div className="form-grid">
          <TextField label="Job Number" value={job.jobNumber} onChange={(value) => updateJob({ jobNumber: value })} />
          <TextField label="Customer" value={job.customer} onChange={(value) => updateJob({ customer: value })} />
          <SelectField label="Status" value={job.status} options={constants.jobStatuses} onChange={(value) => updateJob({ status: value })} />
          <SelectField label="Priority" value={job.priority} options={constants.priorities} onChange={(value) => updateJob({ priority: value })} />
          <TextField label="Due Date" type="date" value={job.dueDate} onChange={(value) => updateJob({ dueDate: value })} />
          <TextField label="Revision" value={job.revision?.number || ""} onChange={(value) => updateRevision({ number: value })} />
          <TextField label="Revision Date" type="date" value={job.revision?.date || ""} onChange={(value) => updateRevision({ date: value })} />
          <TextField label="Author" value={job.revision?.author || ""} onChange={(value) => updateRevision({ author: value })} />
        </div>
        <TextArea label="Revision Notes" value={job.revision?.notes || ""} onChange={(value) => updateRevision({ notes: value })} rows={3} />
        <TextArea label="Job Notes" value={job.notes || ""} onChange={(value) => updateJob({ notes: value })} rows={4} />
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Parts</h3>
            <span>{job.parts.length} total</span>
          </div>
          <button onClick={onAddPart}><Plus size={15} /> Part</button>
        </div>
        <div className="record-list">
          {job.parts.map((part) => (
            <button key={part.id} className="record-list-item" onClick={() => onOpenPart(part.id)}>
              <strong>{part.partNumber || part.partName || "New Part"}</strong>
              <span>{part.materialSpec || part.description || "No part description"}</span>
              <small>{part.operations.length} operations</small>
            </button>
          ))}
          {!job.parts.length && <div className="empty-inline">No parts yet. Add a part when you are ready.</div>}
        </div>
      </section>
    </div>
  );
}

function PartDetailScreen({ busy, part, templates, onBack, onUpdate, onRemove, onAddOperation, onImportFusion, onOpenOperation }) {
  const updateField = (patch) => onUpdate((current) => ({ ...current, ...patch }));
  const updateRevision = (patch) => onUpdate((current) => ({ ...current, revision: { ...current.revision, ...patch } }));

  return (
    <div className="workspace-columns">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Part Detail</h3>
            <span>{part.operations.length} operations</span>
          </div>
          <div className="toolbar">
            <button onClick={onBack}>Back To Job</button>
            <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove Part</button>
          </div>
        </div>
        <div className="form-grid">
          <TextField label="Part Number" value={part.partNumber} onChange={(value) => updateField({ partNumber: value })} />
          <TextField label="Part Name" value={part.partName} onChange={(value) => updateField({ partName: value })} />
          <TextField label="Quantity" value={part.quantity} onChange={(value) => updateField({ quantity: value })} />
          <TextField label="Material Spec" value={part.materialSpec} onChange={(value) => updateField({ materialSpec: value })} />
          <TextField label="Part Revision" value={part.revision?.number || ""} onChange={(value) => updateRevision({ number: value })} />
          <TextField label="Revision Date" type="date" value={part.revision?.date || ""} onChange={(value) => updateRevision({ date: value })} />
        </div>
        <TextArea label="Description" value={part.description || ""} onChange={(value) => updateField({ description: value })} rows={3} />
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
            <button key={operation.id} className="record-list-item" onClick={() => onOpenOperation(operation.id)}>
              <strong>{operation.sequence}. {operation.title || "Operation"}</strong>
              <span>{operation.operationCode || "No code"} / {operation.type || "General"}</span>
              <small>{operation.tools?.length || 0} tools / {(operation.requiredMaterialLots?.length || 0) + (operation.customMaterialText ? 1 : 0)} materials</small>
            </button>
          ))}
          {!part.operations.length && <div className="empty-inline">No operations yet. Add one when you are ready.</div>}
        </div>
      </section>
    </div>
  );
}

function OperationDetailScreen({
  job,
  part,
  operation,
  materials,
  instruments,
  constants,
  preferences,
  onBack,
  onUpdate,
  onRemove,
  onAddImages,
  onCreateInlineMaterial
}) {
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
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
  const updateTool = (toolId, patch) => onUpdate((current) => ({
    ...current,
    tools: (current.tools || []).map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool)
  }));
  const addTool = () => onUpdate((current) => ({ ...current, tools: [...(current.tools || []), blankOperationTool()] }));
  const removeTool = (toolId) => onUpdate((current) => ({ ...current, tools: (current.tools || []).filter((tool) => tool.id !== toolId) }));
  const selectedMaterials = materials.filter((item) => (operation.requiredMaterialLots || []).includes(item.id));

  return (
    <>
      <div className="workspace-columns">
        <section className="panel">
          <div className="panel-heading inline">
            <div>
              <h3>Operation Detail</h3>
              <span>{job.jobNumber || job.id} / {part.partNumber || part.partName || part.id}</span>
            </div>
            <div className="toolbar">
              <button onClick={onBack}>Back To Part</button>
              <button className="danger subtle" onClick={onRemove}><X size={14} /> Remove Operation</button>
            </div>
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

          <div className="subpanel top-gap">
            <div className="subpanel-header">
              <div>
                <h4>Materials</h4>
                <span>{selectedMaterials.length} linked / {operation.customMaterialText ? "Other set" : "No other material"}</span>
              </div>
              <button onClick={() => setShowMaterialPicker(true)}><Database size={14} /> Select Materials</button>
            </div>
            <div className="summary-lines">
              {selectedMaterials.map((item) => (
                <p key={item.id} className="summary-line"><strong>{item.serialCode}</strong><span>{[item.materialFamily, materialDisplayType(item)].filter(Boolean).join(" / ") || "-"}</span></p>
              ))}
              {!selectedMaterials.length && <div className="empty-inline">No linked material records.</div>}
              {operation.customMaterialText && <p className="summary-line"><strong>Other</strong><span>{operation.customMaterialText}</span></p>}
            </div>
          </div>

          <div className="subpanel top-gap">
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
              {!operation.parameters.length && <div className="empty-inline">No parameters yet.</div>}
            </div>
          </div>
        </section>

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
                <TextArea label="Details" value={tool.details || ""} onChange={(value) => updateTool(tool.id, { details: value })} rows={4} />
                <div className="tool-card-actions">
                  <button className="danger subtle" onClick={() => removeTool(tool.id)}><X size={14} /> Remove</button>
                </div>
              </div>
            ))}
            {!operation.tools?.length && <div className="empty-inline">No tools saved with this operation.</div>}
          </div>

          <div className="subpanel top-gap">
            <RecordChecklist
              title="Inspection Instruments"
              items={instruments.map((item) => ({ id: item.instrumentId, label: `${item.toolName} - ${item.dueState}` }))}
              selected={operation.requiredInstruments || []}
              onToggle={(id) => toggleRef("requiredInstruments", id)}
            />
          </div>

          <div className="subpanel top-gap">
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
        </section>
      </div>

      <MaterialPickerDialog
        open={showMaterialPicker}
        materials={materials}
        constants={constants}
        preferences={preferences}
        selectedIds={operation.requiredMaterialLots || []}
        customMaterialText={operation.customMaterialText || ""}
        onClose={() => setShowMaterialPicker(false)}
        onApply={({ selectedIds, customMaterialText }) => {
          updateField({ requiredMaterialLots: selectedIds, customMaterialText });
          setShowMaterialPicker(false);
        }}
        onCreateInlineMaterial={onCreateInlineMaterial}
      />
    </>
  );
}

function MaterialPickerDialog({ open, materials, constants, preferences, selectedIds, customMaterialText, onClose, onApply, onCreateInlineMaterial }) {
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

  const toggleSelection = (materialId) => {
    setLocalSelectedIds((current) => current.includes(materialId) ? current.filter((item) => item !== materialId) : [...current, materialId]);
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
    setLocalSelectedIds((current) => current.includes(saved.id) ? current : [...current, saved.id]);
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
                    <tr key={item.id}>
                      <td><input type="checkbox" checked={localSelectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)} /></td>
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
              <SelectField
                label="Material"
                value={draftMaterial?.materialFamily || ""}
                options={["", ...materialFamilyOptions(preferences)]}
                emptyLabel="Choose material"
                onChange={(value) => setDraftMaterial((current) => updateMaterialRecord(current, {
                  materialFamily: value,
                  materialAlloy: materialAlloyOptions(preferences, value).includes(current?.materialAlloy) ? current.materialAlloy : ""
                }, preferences))}
              />
              <SelectField
                label="Alloy"
                value={draftMaterial?.materialAlloy || ""}
                options={["", ...materialAlloyOptions(preferences, draftMaterial?.materialFamily || "")]}
                emptyLabel="Choose alloy"
                onChange={(value) => setDraftMaterial((current) => updateMaterialRecord(current, { materialAlloy: value }, preferences))}
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

function MaterialClassificationFields({ material, preferences, onChange }) {
  const familyOptions = materialFamilyOptions(preferences);
  const alloyOptions = materialAlloyOptions(preferences, material?.materialFamily || "");
  return (
    <>
      <SelectField
        label="Material"
        value={material?.materialFamily || ""}
        options={["", ...familyOptions]}
        emptyLabel="Choose material"
        onChange={(value) => onChange({
          materialFamily: value,
          materialAlloy: alloyOptions.includes(material?.materialAlloy) && value === material?.materialFamily ? material.materialAlloy : ""
        })}
      />
      <SelectField
        label="Alloy"
        value={material?.materialAlloy || ""}
        options={["", ...alloyOptions]}
        emptyLabel="Choose alloy"
        onChange={(value) => onChange({ materialAlloy: value })}
      />
    </>
  );
}

function MaterialDetailScreen({ workspace, material, onBack, onChange, onAddAttachments, canAddAttachments }) {
  return (
    <div className="materials-screen">
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>{material.serialCode || "New Material"}</h3>
            <span>{[material.materialFamily, materialDisplayType(material)].filter(Boolean).join(" / ") || "Material detail"}</span>
          </div>
          <div className="toolbar">
            <button onClick={onBack}>Back To List</button>
            <button onClick={onAddAttachments} disabled={!canAddAttachments}><FolderOpen size={14} /> Add Attachments</button>
          </div>
        </div>

        <div className="form-grid">
          <TextField label="Serial Code" value={material.serialCode || ""} onChange={(value) => onChange({ serialCode: value })} />
          <MaterialClassificationFields material={material} preferences={workspace.preferences} onChange={onChange} />
          <SelectField
            label="Shape"
            value={material.form || workspace.constants.material.forms[0]}
            options={workspace.constants.material.forms}
            onChange={(value) => onChange({ form: value, shapeDimensions: {}, dimensions: "" })}
          />
          <TextField label="Supplier" value={material.supplier || ""} onChange={(value) => onChange({ supplier: value })} />
          <TextField label="Date Received" type="date" value={material.dateReceived || ""} onChange={(value) => onChange({ dateReceived: value })} />
          <TextField label="Purchase Order" value={material.purchaseOrder || ""} onChange={(value) => onChange({ purchaseOrder: value })} />
          <TextField label="Heat Number" value={material.heatNumber || ""} onChange={(value) => onChange({ heatNumber: value })} />
          <TextField label="Lot Number" value={material.lotNumber || ""} onChange={(value) => onChange({ lotNumber: value })} />
          <MaterialShapeFields material={material} onChange={(shapeDimensions) => onChange({ shapeDimensions })} />
          <SelectField
            label="Traceability"
            value={material.traceabilityLevel || workspace.constants.material.traceabilityLevels[0]}
            options={workspace.constants.material.traceabilityLevels}
            onChange={(value) => onChange({ traceabilityLevel: value })}
          />
          <TextField label="Storage Location" value={material.storageLocation || ""} onChange={(value) => onChange({ storageLocation: value })} />
          <SelectField label="Status" value={material.status || "active"} options={["active", "archived"]} onChange={(value) => onChange({ status: value })} />
        </div>
        <div className="shape-summary-note">Saved dimensions: {materialDimensionsSummary(material.form, material.shapeDimensions, material.dimensions || "-") || "-"}</div>
        <TextArea label="Notes" value={material.notes || ""} onChange={(value) => onChange({ notes: value })} rows={4} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Traceability</h3>
          <span>Usage and attachments</span>
        </div>
        <div className="materials-detail-grid">
          <div className="subpanel">
            <div className="subpanel-header">
              <h4>Usage References</h4>
              <span>{material.usageRefs?.length || 0} links</span>
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
          </div>

          <div className="subpanel">
            <div className="subpanel-header">
              <h4>Attachments</h4>
              <span>{material.attachments?.length || 0} files</span>
            </div>
            <div className="table-wrap compact">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Category</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(material.attachments || []).map((attachment) => (
                    <tr key={attachment.id}>
                      <td>{attachment.originalFilename || attachment.filename || "-"}</td>
                      <td>{attachment.attachmentCategory || "Other"}</td>
                      <td className="action-cell">
                        <button onClick={() => api.openMaterialAttachment(material.id, attachment.id)}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!material.attachments?.length && <div className="empty-inline">No attachments yet.</div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MaterialsView({ workspace, materialScreen, material, setMaterial, onOpenMaterial, onShowList, onCreateNew, onAddAttachments, canAddAttachments }) {
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
  const alloyFilterOptions = filters.materialFamily === "All"
    ? Array.from(new Set(materialFamilyList(workspace.preferences).flatMap((family) => family.alloys || []))).sort((a, b) => a.localeCompare(b))
    : materialAlloyOptions(workspace.preferences, filters.materialFamily);
  const updateMaterial = (patch) => setMaterial((current) => updateMaterialRecord(current, patch, workspace.preferences));

  if (materialScreen === "detail" && material) {
    return (
      <MaterialDetailScreen
        workspace={workspace}
        material={material}
        onBack={onShowList}
        onChange={updateMaterial}
        onAddAttachments={onAddAttachments}
        canAddAttachments={canAddAttachments}
      />
    );
  }

  return (
    <div className="materials-screen">
      <section className="panel materials-hero">
        <div>
          <h3>Materials Database</h3>
        </div>
        <div className="materials-hero-stats">
          <div className="materials-stat">
            <strong>{workspace.materials.length}</strong>
            <span>Total records</span>
          </div>
          <div className="materials-stat">
            <strong>{workspace.materials.filter((item) => item.status !== "archived").length}</strong>
            <span>Active records</span>
          </div>
          <div className="materials-stat">
            <strong>{filteredMaterials.length}</strong>
            <span>Search results</span>
          </div>
        </div>
      </section>

      <section className="panel materials-toolbar">
        <button onClick={onCreateNew}><Plus size={14} /> New Record</button>
      </section>

      <section className="panel search-grid materials-search-grid">
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
      </section>

      <div className="main-grid materials-workspace-grid">
        <section className="panel results-panel">
          <div className="panel-heading inline">
            <div>
              <h3>Results</h3>
              <span>{filteredMaterials.length} matching material records</span>
            </div>
          </div>
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
    </div>
  );
}

function MetrologyView({ workspace, payload, setPayload, onOpenInstrument, onCreateNew }) {
  const instrument = payload?.instrument;
  const updateInstrument = (patch) => setPayload((current) => ({ ...current, instrument: { ...current.instrument, ...patch } }));
  const updateCalibration = (calibrationId, patch) => setPayload((current) => ({
    ...current,
    calibrations: current.calibrations.map((item) => item.calibration_id === calibrationId ? { ...item, ...patch } : item)
  }));
  const addCalibration = () => setPayload((current) => ({ ...current, calibrations: [...current.calibrations, blankCalibration()] }));
  const removeCalibration = (calibrationId) => setPayload((current) => ({ ...current, calibrations: current.calibrations.filter((item) => item.calibration_id !== calibrationId) }));

  return (
    <div className="workspace-columns">
      <section className="panel thin">
        <div className="panel-heading inline">
          <div>
            <h3>Gages</h3>
            <span>Inspection equipment</span>
          </div>
          <button onClick={onCreateNew}><Plus size={14} /> New</button>
        </div>
        <div className="record-list">
          {workspace.instruments.map((item) => (
            <button key={item.instrumentId} className={`record-list-item ${payload?.instrument?.instrument_id === item.instrumentId ? "selected" : ""}`} onClick={() => onOpenInstrument(item.instrumentId)}>
              <strong>{item.toolName}</strong>
              <span>{item.instrumentId}</span>
              <small>{item.dueState}</small>
            </button>
          ))}
        </div>
      </section>
      {!payload ? (
        <EmptyState icon={Gauge} title="No gage selected" text="Pick a gage or create a new one." actionLabel="New Gage" onAction={onCreateNew} />
      ) : (
      <>
      <section className="panel">
        <div className="panel-heading">
          <h3>Gage Record</h3>
        </div>
        <div className="form-grid">
          <TextField label="Instrument ID" value={instrument.instrument_id || ""} onChange={(value) => updateInstrument({ instrument_id: value })} />
          <TextField label="Tool Name" value={instrument.tool_name || ""} onChange={(value) => updateInstrument({ tool_name: value })} />
          <TextField label="Tool Type" value={instrument.tool_type || ""} onChange={(value) => updateInstrument({ tool_type: value })} />
          <TextField label="Manufacturer" value={instrument.manufacturer || ""} onChange={(value) => updateInstrument({ manufacturer: value })} />
          <TextField label="Model" value={instrument.model || ""} onChange={(value) => updateInstrument({ model: value })} />
          <TextField label="Serial Number" value={instrument.serial_number || ""} onChange={(value) => updateInstrument({ serial_number: value })} />
          <TextField label="Range" value={instrument.measuring_range || ""} onChange={(value) => updateInstrument({ measuring_range: value })} />
          <TextField label="Resolution" value={instrument.resolution || ""} onChange={(value) => updateInstrument({ resolution: value })} />
          <TextField label="Accuracy" value={instrument.accuracy || ""} onChange={(value) => updateInstrument({ accuracy: value })} />
          <TextField label="Location" value={instrument.location || ""} onChange={(value) => updateInstrument({ location: value })} />
          <TextField label="Department" value={instrument.owner_department || ""} onChange={(value) => updateInstrument({ owner_department: value })} />
          <TextField label="Status" value={instrument.status || ""} onChange={(value) => updateInstrument({ status: value })} />
        </div>
        <TextArea label="Notes" value={instrument.notes || ""} onChange={(value) => updateInstrument({ notes: value })} rows={4} />
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
              <div className="form-grid">
                <TextField label="Calibration Date" type="date" value={calibration.calibration_date || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { calibration_date: value })} />
                <TextField label="Next Due" type="date" value={calibration.next_due_date || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { next_due_date: value })} />
                <TextField label="Performed By" value={calibration.performed_by || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { performed_by: value })} />
                <TextField label="Result" value={calibration.result || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { result: value })} />
                <TextField label="Standard Name" value={calibration.standard_name || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { standard_name: value })} />
                <TextField label="Certificate Number" value={calibration.certificate_number || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { certificate_number: value })} />
              </div>
              <TextArea label="Notes" value={calibration.notes || ""} onChange={(value) => updateCalibration(calibration.calibration_id, { notes: value })} rows={2} />
            </div>
          ))}
          {!payload.calibrations?.length && <div className="empty-inline">No calibrations yet.</div>}
        </div>
      </section>
      </>
      )}
    </div>
  );
}

function TemplatesView({ workspace, selectedTemplate, setSelectedTemplateId, onStatus, onRefresh }) {
  const [template, setTemplate] = useState(selectedTemplate || blankTemplate());
  const libraries = Object.keys(workspace.libraries || {});

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

  if (!selectedTemplate) {
    return <EmptyState icon={Library} title="No operation template selected" text="Pick a template or create a new one." />;
  }

  return (
    <div className="workspace-columns">
      <section className="panel thin">
        <div className="panel-heading inline">
          <div>
            <h3>Operation Templates</h3>
            <span>Default fields and starting steps</span>
          </div>
          <button onClick={() => setTemplate(blankTemplate())}><Plus size={14} /> New Template</button>
        </div>
        <div className="record-list">
          {workspace.templates.map((item) => (
            <button key={item.id} className={`record-list-item ${template.id === item.id ? "selected" : ""}`} onClick={() => setSelectedTemplateId(item.id)}>
              <strong>{item.name}</strong>
              <span>{item.category}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>{template.name || "New Template"}</h3>
            <span>{template.category || "General"}</span>
          </div>
          <div className="toolbar">
            {template.id && <button className="danger subtle" onClick={deleteTemplate}><X size={14} /> Delete</button>}
          </div>
        </div>
        <div className="form-grid">
          <TextField label="Template Name" value={template.name || ""} onChange={(value) => setTemplate((current) => ({ ...current, name: value }))} />
          <TextField label="Category" value={template.category || ""} onChange={(value) => setTemplate((current) => ({ ...current, category: value }))} />
        </div>
        <div className="top-gap">
          <label className="field full">
            <span>Assigned Libraries</span>
            <div className="library-chip-grid">
              {libraries.map((name) => (
                <label key={name} className={`library-chip ${template.libraryNames.includes(name) ? "active" : ""}`}>
                  <input type="checkbox" checked={template.libraryNames.includes(name)} onChange={() => toggleLibrary(name)} />
                  <span>{name}</span>
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
      </section>
    </div>
  );
}

function SettingsView({ onChooseDataFolder, onOpenTemplates, onSavePreferences, workspace }) {
  const [materialFamilies, setMaterialFamilies] = useState(workspace.preferences?.materialFamilies || []);
  const [selectedFamilyId, setSelectedFamilyId] = useState(workspace.preferences?.materialFamilies?.[0]?.id || null);

  useEffect(() => {
    const families = workspace.preferences?.materialFamilies || [];
    setMaterialFamilies(families);
    setSelectedFamilyId((current) => families.some((family) => family.id === current) ? current : families[0]?.id || null);
  }, [workspace.preferences]);

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

  return (
    <div className="workspace-columns settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <h3>Settings</h3>
        </div>
        <div className="stack-list">
          <button className="import-card" onClick={onChooseDataFolder}>
            <FolderOpen size={20} />
            <strong>Change Data Folder</strong>
            <span>{workspace.dataFolder}</span>
          </button>
          <button className="import-card" onClick={onOpenTemplates}>
            <Library size={20} />
            <strong>Operation Templates</strong>
            <span>{workspace.templates.length} saved templates</span>
          </button>
          <div className="subpanel">
            <div className="subpanel-header">
              <h4>Recent Activity</h4>
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
          </div>
        </div>
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

              <div className="form-grid">
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
    </div>
  );
}

function PrintPacket({ jobId }) {
  const [job, setJob] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedJob, materialRows, instrumentRows] = await Promise.all([
          api.loadJob(jobId),
          api.listMaterials(),
          api.listInstruments()
        ]);
        if (!loadedJob) throw new Error("Job not found.");
        setJob(loadedJob);
        setMaterials(materialRows);
        setInstruments(instrumentRows);
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
              <PrintField label="Revision" value={part.revision?.number} compact />
            </div>
            {part.operations.map((operation) => (
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
                    <PrintField label="Material Lots" value={[(operation.requiredMaterialLots || []).map((id) => materialMap.get(id)?.serialCode || id).join(", "), operation.customMaterialText || ""].filter(Boolean).join(" / ")} compact />
                    <PrintField label="Tools" value={(operation.tools || []).map((tool) => summarizeJobTool(tool)).join(", ")} compact />
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
                {operation.workInstructions && <div className="print-note compact"><strong>Work Instructions</strong><p>{operation.workInstructions}</p></div>}
                {operation.stepImages?.length > 0 && (
                  <div className="print-images compact">
                    {operation.stepImages.map((image) => <img key={image.id} src={api.assetUrl(image.relativePath)} alt={image.name || "Step"} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange, emptyLabel = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${label}-${option || "empty"}`} value={option}>
            {option || emptyLabel}
          </option>
        ))}
      </select>
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

function PrintField({ label, value, compact = false }) {
  return (
    <div className={`print-field ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function titleForView(view) {
  return {
    dashboard: "Dashboard",
    jobs: "Jobs",
    materials: "Materials",
    metrology: "Gages",
    templates: "Operation Templates",
    settings: "Settings"
  }[view] || "AMERP";
}

function subtitleForView(view) {
  return {
    dashboard: "",
    jobs: "",
    materials: "",
    metrology: "",
    templates: "",
    settings: ""
  }[view] || "";
}

createRoot(document.getElementById("root")).render(<App />);
