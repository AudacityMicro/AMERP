import React, { useEffect, useState } from "react";
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
  RefreshCcw,
  Save,
  ShieldCheck,
  Wrench,
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
  parts: [blankPart()],
  createdAt: nowIso(),
  updatedAt: nowIso()
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
  operations: [blankOperation(1)]
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
  setupTemplateRefs: [],
  jobToolRefs: [],
  requiredMaterialLots: [],
  requiredInstruments: [],
  inspectionPlan: {
    feature: "",
    method: "",
    sampleSize: "",
    frequency: "",
    resultPlaceholderRefs: []
  }
});

const blankParameter = () => ({ id: uid("parameter"), label: "", value: "" });

const blankMaterial = () => ({
  id: uid("material"),
  serialCode: "",
  materialType: "",
  form: "",
  supplier: "",
  dateReceived: today(),
  purchaseOrder: "",
  heatNumber: "",
  lotNumber: "",
  materialSpec: "",
  dimensions: "",
  traceabilityLevel: "Standard material certs",
  originalStockIdentifier: "",
  customerName: "",
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

function App() {
  const route = window.location.hash.replace(/^#/, "") || "/";
  if (!api) {
    return <Fatal title="AMERP" message="Run the app inside Electron so the secure local file APIs are available." />;
  }
  if (route.startsWith("/print/")) {
    const jobId = decodeURIComponent(route.replace("/print/", "").split("?")[0]);
    return <PrintPacket jobId={jobId} />;
  }
  return <Workspace />;
}

function Workspace() {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState("dashboard");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [selectedJobId, setSelectedJobId] = useState(null);
  const [job, setJob] = useState(null);

  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [material, setMaterial] = useState(null);

  const [selectedInstrumentId, setSelectedInstrumentId] = useState(null);
  const [instrumentPayload, setInstrumentPayload] = useState(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  const showStatus = (message) => {
    setStatus(message);
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => setStatus(""), 5000);
  };

  const refreshWorkspace = async (preserveSelection = true) => {
    setBusy(true);
    try {
      const next = await api.loadWorkspace();
      setWorkspace(next);
      if (!preserveSelection) {
        setSelectedJobId(null);
        setSelectedMaterialId(null);
        setSelectedInstrumentId(null);
      }
      if (!selectedTemplateId && next.templates?.[0]) {
        setSelectedTemplateId(next.templates[0].id);
      }
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshWorkspace(false);
    const release = () => {
      api.releaseAllLocks().catch(() => {});
    };
    window.addEventListener("beforeunload", release);
    return () => {
      release();
      window.removeEventListener("beforeunload", release);
    };
  }, []);

  const openJob = async (jobId) => {
    setBusy(true);
    try {
      if (selectedJobId && selectedJobId !== jobId) {
        await api.releaseLock("job", selectedJobId);
      }
      const loaded = await api.loadJob(jobId, { acquireLock: true });
      setSelectedJobId(jobId);
      setJob(loaded);
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
      setMaterial(loaded);
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
    setView("jobs");
  };

  const createJobFromFusion = async () => {
    setBusy(true);
    try {
      const imported = await api.createJobFromFusion();
      if (!imported) return;
      if (selectedJobId) await api.releaseLock("job", selectedJobId);
      setSelectedJobId(null);
      setJob(imported);
      setView("jobs");
      showStatus("Imported Fusion setup sheets into a new job draft.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentJob = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const saved = await api.saveJob(job);
      setJob(saved);
      setSelectedJobId(saved.id);
      await refreshWorkspace();
      showStatus("Job saved.");
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
    setMaterial({ ...blankMaterial(), serialCode: serial });
    setView("materials");
  };

  const saveCurrentMaterial = async () => {
    if (!material) return;
    setBusy(true);
    try {
      const saved = await api.saveMaterial(material);
      setMaterial(saved);
      setSelectedMaterialId(saved.id);
      await refreshWorkspace();
      showStatus("Material saved.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const addMaterialAttachments = async () => {
    if (!material?.id) {
      showStatus("Save the material once before adding attachments.");
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
      setMaterial(saved);
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

  const saveCurrentInstrument = async () => {
    if (!instrumentPayload) return;
    setBusy(true);
    try {
      const saved = await api.saveInstrument(instrumentPayload);
      setInstrumentPayload(saved);
      setSelectedInstrumentId(saved.instrument.instrument_id);
      await refreshWorkspace();
      showStatus("Instrument saved.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
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
      showStatus(`Import complete: ${JSON.stringify(result)}`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const rebuildIndex = async () => {
    setBusy(true);
    try {
      await api.rebuildIndex();
      await refreshWorkspace();
      showStatus("Search index rebuilt.");
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!workspace) {
    return <LoadingScreen message="Loading AMERP workspace..." />;
  }

  const selectedTemplate = workspace.templates.find((item) => item.id === selectedTemplateId) || workspace.templates[0] || null;

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

        <button className="folder-pill" onClick={() => api.selectDataFolder().then(() => refreshWorkspace(false))}>
          <FolderOpen size={16} />
          <span title={workspace.dataFolder}>{workspace.dataFolder}</span>
        </button>

        <nav className="nav-tabs">
          <NavButton icon={ClipboardList} active={view === "dashboard"} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavButton icon={Package} active={view === "jobs"} label="Jobs" onClick={() => setView("jobs")} />
          <NavButton icon={Database} active={view === "materials"} label="Materials" onClick={() => setView("materials")} />
          <NavButton icon={Gauge} active={view === "metrology"} label="Metrology" onClick={() => setView("metrology")} />
          <NavButton icon={Library} active={view === "templates"} label="Templates" onClick={() => setView("templates")} />
          <NavButton icon={Import} active={view === "imports"} label="Imports" onClick={() => setView("imports")} />
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-heading">Quick Actions</div>
          <button className="sidebar-action" onClick={createNewJob}><Plus size={15} /> New Job</button>
          <button className="sidebar-action" onClick={createJobFromFusion}><Plus size={15} /> New From Fusion</button>
          <button className="sidebar-action" onClick={createNewMaterial}><Plus size={15} /> New Material</button>
          <button className="sidebar-action" onClick={createNewInstrument}><Plus size={15} /> New Instrument</button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-heading">Jobs</div>
          <div className="record-list">
            {workspace.jobs.map((item) => (
              <button key={item.id} className={`record-list-item ${selectedJobId === item.id ? "selected" : ""}`} onClick={() => openJob(item.id)}>
                <strong>{item.jobNumber || item.id}</strong>
                <span>{item.customer || item.routeSummary || "No customer"}</span>
                <small>{item.partCount} parts / {item.operationCount} ops</small>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>{titleForView(view)}</h2>
            <p>{subtitleForView(view)}</p>
          </div>
          <div className="toolbar">
            <button onClick={() => refreshWorkspace()}><RefreshCcw size={16} /> Refresh</button>
            <button onClick={rebuildIndex}><ShieldCheck size={16} /> Rebuild Index</button>
            {view === "jobs" && (
              <>
                <button onClick={saveCurrentJob} disabled={!job || busy}><Save size={16} /> Save Job</button>
                <button onClick={() => job?.id && api.exportJobPdf(job.id)} disabled={!job || busy}><FileDown size={16} /> PDF</button>
                <button className="danger" onClick={archiveCurrentJob} disabled={!selectedJobId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
            {view === "materials" && (
              <>
                <button onClick={saveCurrentMaterial} disabled={!material || busy}><Save size={16} /> Save Material</button>
                <button onClick={addMaterialAttachments} disabled={!material || busy}><FolderOpen size={16} /> Attachments</button>
                <button className="danger" onClick={archiveCurrentMaterial} disabled={!selectedMaterialId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
            {view === "metrology" && (
              <>
                <button onClick={saveCurrentInstrument} disabled={!instrumentPayload || busy}><Save size={16} /> Save Instrument</button>
                <button className="danger" onClick={archiveCurrentInstrument} disabled={!selectedInstrumentId || busy}><Archive size={16} /> Archive</button>
              </>
            )}
          </div>
        </header>

        {status && <div className="status-banner">{status}</div>}

        {view === "dashboard" && <DashboardView workspace={workspace} />}
        {view === "jobs" && (
          <JobsView
            job={job}
            setJob={setJob}
            workspace={workspace}
            onOpenJob={openJob}
            onChooseOperationImages={async (jobId, partId, operationId) => api.chooseOperationImages(jobId, partId, operationId)}
          />
        )}
        {view === "materials" && (
          <MaterialsView
            workspace={workspace}
            material={material}
            setMaterial={setMaterial}
            onOpenMaterial={openMaterial}
            onCreateNew={createNewMaterial}
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
        {view === "imports" && (
          <ImportsView onImport={runImport} workspace={workspace} />
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
      <StatCard label="Active Instruments" value={counts.instruments || 0} />
      <StatCard label="Due / Overdue Gauges" value={counts.overdueInstruments || 0} accent />

      <section className="panel wide">
        <div className="panel-heading">
          <h3>Quality Watch</h3>
          <span>Upcoming and overdue calibration items</span>
        </div>
        <div className="stack-list">
          {(workspace.dashboard?.overdueInstruments || []).map((item) => (
            <div className="inline-card" key={item.instrumentId}>
              <strong>{item.toolName}</strong>
              <span>{item.instrumentId}</span>
              <span className={`pill ${item.dueState === "Overdue" ? "danger-pill" : "warn-pill"}`}>{item.dueState}</span>
            </div>
          ))}
          {!workspace.dashboard?.overdueInstruments?.length && <div className="empty-inline">No due or overdue instruments.</div>}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-heading">
          <h3>Recent Audit</h3>
          <span>Append-only activity log</span>
        </div>
        <div className="stack-list">
          {(workspace.dashboard?.recentAudit || []).map((item, index) => (
            <div className="inline-card" key={`${item.timestamp}-${index}`}>
              <strong>{item.eventType}</strong>
              <span>{item.message}</span>
              <small>{item.timestamp}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function JobsView({ job, setJob, workspace, onChooseOperationImages }) {
  if (!job) {
    return <EmptyState icon={Package} title="No job selected" text="Create a job or pick one from the sidebar." />;
  }
  const materials = workspace.materials || [];
  const instruments = workspace.instruments || [];
  const templates = workspace.templates || [];

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

  return (
    <div className="workspace-columns">
      <section className="panel">
        <div className="panel-heading">
          <h3>Job Header</h3>
          <span>Revision-controlled traveler record</span>
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
      </section>

      <section className="panel">
        <div className="panel-heading inline">
          <div>
            <h3>Parts And Routes</h3>
            <span>Each part owns its own ordered operations</span>
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
              onUpdate={(updater) => updatePart(part.id, updater)}
              onRemove={() => removePart(part.id)}
              onAddOperation={addOperation}
              onChooseOperationImages={onChooseOperationImages}
              jobId={job.id}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PartEditor({ part, templates, materials, instruments, onUpdate, onRemove, onAddOperation, onChooseOperationImages, jobId }) {
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
          <span>Ordered route for this part</span>
        </div>
        <div className="toolbar">
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

function OperationEditor({ operation, materials, instruments, onUpdate, onRemove, onAddImages }) {
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
          <span>Traveler and setup values</span>
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
          title="Inspection Instruments"
          items={instruments.map((item) => ({ id: item.instrumentId, label: `${item.toolName} • ${item.dueState}` }))}
          selected={operation.requiredInstruments || []}
          onToggle={(id) => toggleRef("requiredInstruments", id)}
        />
      </div>

      <div className="subpanel-header">
        <div>
          <h4>Step Images</h4>
          <span>{operation.stepImages?.length || 0} linked assets</span>
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

function MaterialsView({ workspace, material, setMaterial, onOpenMaterial, onCreateNew }) {
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
            <h3>Instruments</h3>
            <span>Calibration-controlled inspection tools</span>
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
        <EmptyState icon={Gauge} title="No instrument selected" text="Choose an instrument record or create a new one." actionLabel="New Instrument" onAction={onCreateNew} />
      ) : (
      <>
      <section className="panel">
        <div className="panel-heading">
          <h3>Instrument Record</h3>
          <span>Inspection tool and calibration history</span>
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
          {!payload.calibrations?.length && <div className="empty-inline">No calibration records yet.</div>}
        </div>
      </section>
      </>
      )}
    </div>
  );
}

function TemplatesView({ workspace, selectedTemplate, setSelectedTemplateId, onStatus, onRefresh }) {
  const [template, setTemplate] = useState(selectedTemplate || blankTemplate());

  useEffect(() => {
    setTemplate(selectedTemplate || blankTemplate());
  }, [selectedTemplate?.id]);

  const saveTemplate = async () => {
    try {
      await api.saveTemplate(template);
      await onRefresh();
      onStatus("Template saved.");
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  if (!selectedTemplate) {
    return <EmptyState icon={Library} title="No template selected" text="Create a template after the workspace loads." />;
  }

  return (
    <div className="workspace-columns">
      <section className="panel thin">
        <div className="panel-heading inline">
          <div>
            <h3>Templates</h3>
            <span>Reusable route starters</span>
          </div>
          <button onClick={() => setTemplate(blankTemplate())}><Plus size={14} /> New</button>
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
            <h3>Template Editor</h3>
            <span>Operation defaults and instructions</span>
          </div>
          <button onClick={saveTemplate}><Save size={14} /> Save Template</button>
        </div>
        <div className="form-grid">
          <TextField label="Name" value={template.name || ""} onChange={(value) => setTemplate((current) => ({ ...current, name: value }))} />
          <TextField label="Category" value={template.category || ""} onChange={(value) => setTemplate((current) => ({ ...current, category: value }))} />
        </div>
        <TextArea label="Default Instructions" value={(template.defaultSteps || []).join("\n")} onChange={(value) => setTemplate((current) => ({ ...current, defaultSteps: value.split(/\r?\n/).filter(Boolean) }))} rows={6} />
      </section>
    </div>
  );
}

function ImportsView({ onImport, workspace }) {
  return (
    <div className="workspace-columns">
      <section className="panel">
        <div className="panel-heading">
          <h3>Legacy Imports</h3>
          <span>One-time migration into the AMERP file tree</span>
        </div>
        <div className="action-grid">
          <button className="import-card" onClick={() => onImport("setup")}>
            <Wrench size={20} />
            <strong>Import Setup Sheet Data</strong>
            <span>Templates, libraries, and legacy single-part jobs.</span>
          </button>
          <button className="import-card" onClick={() => onImport("materials")}>
            <Database size={20} />
            <strong>Import Materials Data</strong>
            <span>SQLite materials, attachments, job usage, and change log.</span>
          </button>
          <button className="import-card" onClick={() => onImport("metrology")}>
            <Gauge size={20} />
            <strong>Import Metrology Data</strong>
            <span>Instruments, standards, and calibration history.</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h3>Current Workspace</h3>
          <span>Quick phase-1 readiness check</span>
        </div>
        <div className="stack-list">
          <div className="inline-card"><strong>{workspace.jobs.length}</strong><span>Jobs loaded</span></div>
          <div className="inline-card"><strong>{workspace.materials.length}</strong><span>Materials loaded</span></div>
          <div className="inline-card"><strong>{workspace.instruments.length}</strong><span>Instruments loaded</span></div>
          <div className="inline-card"><strong>{workspace.templates.length}</strong><span>Operation templates</span></div>
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
      </section>

      {job.parts.map((part) => (
        <section className="print-page" key={part.id}>
          <header className="operation-print-header">
            <span>Part</span>
            <h2>{part.partNumber || part.partName || part.id}</h2>
          </header>
          <div className="packet-grid">
            <PrintField label="Description" value={part.description} />
            <PrintField label="Quantity" value={part.quantity} />
            <PrintField label="Material Spec" value={part.materialSpec} />
            <PrintField label="Revision" value={part.revision?.number} />
          </div>
          {part.operations.map((operation) => (
            <div className="print-operation-block" key={operation.id}>
              <h3>{operation.sequence}. {operation.title}</h3>
              <div className="print-two-column">
                <div>
                  <PrintField label="Op Code" value={operation.operationCode} compact />
                  <PrintField label="Type" value={operation.type} compact />
                  <PrintField label="Work Center" value={operation.workCenter} compact />
                  <PrintField label="Status" value={operation.status} compact />
                </div>
                <div>
                  <PrintField label="Material Lots" value={(operation.requiredMaterialLots || []).map((id) => materialMap.get(id)?.serialCode || id).join(", ")} compact />
                  <PrintField label="Instruments" value={(operation.requiredInstruments || []).map((id) => instrumentMap.get(id)?.toolName || id).join(", ")} compact />
                </div>
              </div>
              {operation.parameters?.length > 0 && (
                <table className="print-table">
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
              {operation.setupInstructions && <div className="print-note"><strong>Setup</strong><p>{operation.setupInstructions}</p></div>}
              {operation.workInstructions && <div className="print-note"><strong>Work Instructions</strong><p>{operation.workInstructions}</p></div>}
              {operation.stepImages?.length > 0 && (
                <div className="print-images">
                  {operation.stepImages.map((image) => <img key={image.id} src={api.assetUrl(image.relativePath)} alt={image.name || "Step"} />)}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function TextField({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
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
    metrology: "Metrology",
    templates: "Templates",
    imports: "Imports"
  }[view] || "AMERP";
}

function subtitleForView(view) {
  return {
    dashboard: "Job-centered ERP status, audit visibility, and quality watch.",
    jobs: "Jobs contain parts, and each part owns an ordered route.",
    materials: "Local-first material cert and traceability records.",
    metrology: "Calibration-controlled instruments linked into operations.",
    templates: "Reusable operation defaults and routing helpers.",
    imports: "One-time migration tools for the three legacy projects."
  }[view] || "";
}

createRoot(document.getElementById("root")).render(<App />);
