import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  BookOpen,
  ClipboardList,
  Copy,
  FileDown,
  FolderOpen,
  ImagePlus,
  Library,
  ListPlus,
  PanelLeft,
  Plus,
  Printer,
  Save,
  Settings,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import './styles.css';

const api = window.setupSheets;

const SPECIAL_LIBRARY_FIELDS = {
  sawBlades: 'sawBladeId',
  blastMedia: 'blastMediaId',
  tumblingMedia: 'tumblingMediaId'
};

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const defaultRevision = () => ({
  number: 'A',
  date: today(),
  author: '',
  notes: ''
});

const blankJob = () => ({
  id: newId('job'),
  customer: '',
  jobNumber: '',
  jobName: '',
  partNumber: '',
  partName: '',
  material: '',
  quantity: '',
  revision: defaultRevision(),
  setupSheets: [],
  tools: [],
  operations: [],
  createdAt: nowIso(),
  updatedAt: nowIso()
});

const blankRecord = () => ({
  id: newId('record'),
  name: '',
  description: '',
  details: ''
});

const blankParameter = () => ({
  id: newId('parameter'),
  label: '',
  value: ''
});

const blankStep = () => ({
  id: newId('step'),
  instruction: '',
  images: []
});

const titleFromName = (name) => String(name || 'Library')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const libraryList = (libraries) => Object.values(libraries || {})
  .sort((a, b) => (Number(a.order || 1000) - Number(b.order || 1000)) || String(a.label || a.name).localeCompare(String(b.label || b.name)));

const defaultTemplateLibraryNames = (template) => {
  const text = `${template?.name || ''} ${template?.category || ''} ${template?.id || ''}`.toLowerCase();
  if (text.includes('saw')) return ['machines', 'sawBlades'];
  if (text.includes('mill') || text.includes('turn')) return ['machines', 'fixtures'];
  if (text.includes('drill') || text.includes('tap')) return ['machines'];
  if (text.includes('blast')) return ['machines', 'blastMedia'];
  if (text.includes('tumbl')) return ['machines', 'tumblingMedia'];
  return [];
};

const templateLibraryNames = (template) => {
  if (!template) return [];
  if (Object.prototype.hasOwnProperty.call(template, 'libraryNames')) {
    return [...new Set((Array.isArray(template.libraryNames) ? template.libraryNames : []).filter(Boolean))];
  }
  return defaultTemplateLibraryNames(template);
};

const operationLibraryNames = (operation) => {
  if (!operation) return [];
  if (Object.prototype.hasOwnProperty.call(operation, 'libraryNames')) {
    return [...new Set((Array.isArray(operation.libraryNames) ? operation.libraryNames : []).filter(Boolean))];
  }
  return defaultTemplateLibraryNames(operation);
};

const isFixtureLibrary = (libraryOrName, libraries = {}) => {
  const library = typeof libraryOrName === 'string' ? libraries[libraryOrName] : libraryOrName;
  const text = `${library?.name || libraryOrName || ''} ${library?.label || ''}`.toLowerCase();
  return text.includes('fixture');
};

const operationSelectedLibraryIds = (operation, libraryName) => {
  const genericSelection = operation?.librarySelections?.[libraryName];
  if (Array.isArray(genericSelection)) return genericSelection;
  const specialField = SPECIAL_LIBRARY_FIELDS[libraryName];
  return specialField && operation?.[specialField] ? [operation[specialField]] : [];
};

const normalizeParameter = (parameter) => ({
  id: parameter.id || newId('parameter'),
  label: parameter.label || '',
  value: parameter.value || ''
});

const operationFromTemplate = (template) => ({
  id: newId('operation'),
  templateId: template?.id || 'generic',
  type: template?.name || 'Generic Operation',
  title: template?.name || 'Generic Operation',
  libraryNames: templateLibraryNames(template),
  librarySelections: {},
  machineId: '',
  fixtureIds: [],
  toolIds: [],
  sawBladeId: '',
  blastMediaId: '',
  tumblingMediaId: '',
  parameters: (template?.defaultParameters || [{ label: 'Parameter', value: '' }]).map((parameter) => ({
    ...normalizeParameter(parameter),
    id: newId('parameter')
  })),
  notes: '',
  steps: (template?.defaultSteps || ['Document operation instructions.']).map((instruction) => ({
    ...blankStep(),
    instruction
  }))
});

const recordName = (libraries, libraryName, id) => {
  const record = libraries?.[libraryName]?.records?.find((item) => item.id === id);
  if (!record) return '';
  if (libraryName === 'tools' && record.length) return `${record.name} (${record.length})`;
  return record.name || '';
};

const toolName = (tools, id) => {
  const tool = (tools || []).find((item) => item.id === id);
  if (!tool) return '';
  return tool.length ? `${tool.name} (${tool.length})` : tool.name || '';
};

const operationText = (operation) => `${operation.title || ''} ${operation.type || ''} ${operation.templateId || ''}`.toLowerCase();
const isSawingOperation = (operation) => operationText(operation).includes('saw');
const isBlastingOperation = (operation) => operationText(operation).includes('blast');
const isTumblingOperation = (operation) => operationText(operation).includes('tumbl');
const isMillingOperation = (operation) => operationText(operation).includes('mill');
const isTurningOperation = (operation) => operationText(operation).includes('turn');
const usesToolsAndFixtures = (operation) => isMillingOperation(operation) || isTurningOperation(operation);

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const validateJob = (job) => {
  const errors = [];
  if (!job.jobNumber?.trim() && !job.jobName?.trim()) {
    errors.push('job number or job name');
  }
  if (!job.partNumber?.trim() && !job.partName?.trim()) {
    errors.push('part number or part name');
  }
  if (!job.operations?.length) {
    errors.push('at least one operation');
  }
  return errors;
};

function App() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, '') || '/');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!api) {
    return (
      <div className="fatal">
        <h1>Setup Sheet Generator</h1>
        <p>This app must run inside Electron so it can access the secure filesystem API.</p>
      </div>
    );
  }

  if (route.startsWith('/print/')) {
    const jobId = decodeURIComponent(route.replace('/print/', '').split('?')[0]);
    return <PrintPacket jobId={jobId} />;
  }

  return <Workspace />;
}

function Workspace() {
  const [dataFolder, setDataFolder] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [libraries, setLibraries] = useState({});
  const [templates, setTemplates] = useState([]);
  const [view, setView] = useState('jobs');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedTemplate = useMemo(() => templates[0] || null, [templates]);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    setBusy(true);
    try {
      const folder = await api.getDataFolder();
      setDataFolder(folder);
      if (!folder) return;
      const [nextJobs, nextLibraries, nextTemplates] = await Promise.all([
        api.listJobs(),
        api.loadLibraries(),
        api.loadTemplates()
      ]);
      setJobs(nextJobs);
      setLibraries(nextLibraries);
      setTemplates(nextTemplates);
      if (!job && nextJobs[0]) {
        await openJob(nextJobs[0].id);
      }
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const showStatus = (message) => {
    setStatus(message);
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => setStatus(''), 4500);
  };

  const chooseFolder = async () => {
    setBusy(true);
    try {
      const folder = await api.selectDataFolder();
      setDataFolder(folder);
      await refreshAll();
      showStatus(folder ? `Using data folder: ${folder}` : 'No data folder selected.');
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openJob = async (id) => {
    if (!id) return;
    setBusy(true);
    try {
      const loaded = await api.loadJob(id);
      setSelectedJobId(id);
      setJob(loaded);
      setView('jobs');
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const createBlankJob = () => {
    const nextJob = blankJob();
    setJob(nextJob);
    setSelectedJobId(nextJob.id);
    setView('jobs');
    showStatus('New blank job created.');
  };

  const createJobFromSetupSheets = async () => {
    setBusy(true);
    try {
      const imported = await api.importFusionSetupSheets();
      if (!imported?.sheets?.length) return;
      const nextJob = blankJob();

      const firstHeader = imported.sheets[0].header || {};
      nextJob.jobNumber = firstHeader.program || '';
      nextJob.jobName = firstHeader.jobDescription || firstHeader.documentPath || '';
      nextJob.partName = firstHeader.documentPath || '';
      nextJob.setupSheets = imported.sheets.map((sheet) => ({
        source: sheet.source,
        header: sheet.header
      }));
      nextJob.tools = imported.tools || [];
      nextJob.operations = imported.sheets.map((sheet) => sheet.operation);
      showStatus(`Created job from ${imported.sheets.length} setup sheet${imported.sheets.length === 1 ? '' : 's'} with ${(imported.tools || []).length} job tool${(imported.tools || []).length === 1 ? '' : 's'}.`);

      setJob(nextJob);
      setSelectedJobId(nextJob.id);
      setView('jobs');
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const duplicateJob = () => {
    if (!job) return;
    const nextJob = {
      ...structuredClone(job),
      id: newId('job'),
      jobNumber: job.jobNumber ? `${job.jobNumber}-copy` : '',
      jobName: job.jobName ? `${job.jobName} Copy` : '',
      revision: { ...job.revision, date: today() },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    setJob(nextJob);
    setSelectedJobId(nextJob.id);
    showStatus('Duplicated job. Save it to create the new JSON file.');
  };

  const saveCurrentJob = async () => {
    if (!job) return null;
    const validationErrors = validateJob(job);
    if (validationErrors.length) {
      showStatus(`Add ${validationErrors.join(', ')} before saving.`);
      return null;
    }

    setBusy(true);
    try {
      const saved = await api.saveJob(job);
      setJob(saved);
      setSelectedJobId(saved.id);
      setJobs(await api.listJobs());
      showStatus('Job saved.');
      return saved;
    } catch (error) {
      showStatus(error.message || String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentJob = async () => {
    if (!job) return;
    const label = job.jobNumber || job.jobName || 'this job';
    if (!window.confirm(`Delete ${label}? This removes its JSON file and copied images.`)) return;
    setBusy(true);
    try {
      await api.deleteJob(job.id);
      const nextJobs = await api.listJobs();
      setJobs(nextJobs);
      setJob(null);
      setSelectedJobId(null);
      if (nextJobs[0]) await openJob(nextJobs[0].id);
      showStatus('Job deleted.');
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const addOperation = (template = selectedTemplate) => {
    const nextOperation = operationFromTemplate(template);
    setJob((current) => ({
      ...(current || blankJob()),
      operations: [...(current?.operations || []), nextOperation]
    }));
  };

  const exportPdf = async () => {
    if (!job) return;
    const saved = await saveCurrentJob();
    if (!saved) return;
    setBusy(true);
    try {
      const outputPath = await api.exportJobPdf(saved.id);
      if (outputPath) showStatus(`PDF exported: ${outputPath}`);
    } catch (error) {
      showStatus(error.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  const openPrintPreview = async () => {
    if (!job) return;
    const saved = await saveCurrentJob();
    if (!saved) return;
    window.location.hash = `/print/${encodeURIComponent(saved.id)}`;
  };

  if (!dataFolder) {
    return (
      <div className="setup-screen">
        <div className="setup-panel">
          <div className="setup-icon"><FolderOpen size={34} /></div>
          <h1>Choose a Data Folder</h1>
          <p>Setup Sheet Generator stores jobs, reusable libraries, templates, and step images as JSON files in a folder you choose.</p>
          <button className="primary-button" onClick={chooseFolder} disabled={busy}>
            <FolderOpen size={18} />
            Select Folder
          </button>
          {status && <p className="status-text">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <ClipboardList size={24} />
          <div>
            <h1>Setup Sheets</h1>
            <span>Process docs</span>
          </div>
        </div>

        <div className="folder-chip" title={dataFolder}>
          <FolderOpen size={16} />
          <span>{dataFolder}</span>
        </div>

        <nav className="nav-tabs" aria-label="Primary">
          <button className={view === 'jobs' ? 'active' : ''} onClick={() => setView('jobs')} title="Jobs">
            <PanelLeft size={17} />
            Jobs
          </button>
          <button className={view === 'libraries' ? 'active' : ''} onClick={() => setView('libraries')} title="Libraries">
            <Library size={17} />
            Libraries
          </button>
          <button className={view === 'templates' ? 'active' : ''} onClick={() => setView('templates')} title="Templates">
            <BookOpen size={17} />
            Templates
          </button>
        </nav>

        <button className="sidebar-action" onClick={createJobFromSetupSheets}>
          <Plus size={17} />
          New From Setup Sheets
        </button>

        <button className="sidebar-secondary-action" onClick={createBlankJob}>
          <Plus size={17} />
          New Blank Job
        </button>

        <div className="job-list">
          {jobs.length === 0 && <div className="empty-list">No saved jobs yet.</div>}
          {jobs.map((item) => (
            <button
              key={item.id}
              className={`job-list-item ${selectedJobId === item.id ? 'selected' : ''}`}
              onClick={() => openJob(item.id)}
            >
              <strong>{item.jobNumber || item.jobName || 'Untitled Job'}</strong>
              <span>{item.partNumber || item.partName || item.customer || 'No part details'}</span>
              <small>Rev {item.revision || '-'} {formatDateTime(item.updatedAt)}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h2>{view === 'jobs' ? (job?.jobNumber || job?.jobName || 'Job Editor') : view === 'libraries' ? 'Reusable Libraries' : 'Operation Templates'}</h2>
            <p>{view === 'jobs' ? 'Start from Fusion setup sheets, then refine job-specific operations and tools.' : view === 'libraries' ? 'Maintain machines, fixtures, blades, and finishing media.' : 'Configure default fields and starting instruction steps.'}</p>
          </div>
          <div className="toolbar">
            <button onClick={chooseFolder} title="Change data folder">
              <FolderOpen size={17} />
              Folder
            </button>
            {view === 'jobs' && (
              <>
                <button onClick={duplicateJob} disabled={!job} title="Duplicate job">
                  <Copy size={17} />
                  Duplicate
                </button>
                <button onClick={saveCurrentJob} disabled={!job || busy} title="Save job">
                  <Save size={17} />
                  Save
                </button>
                <button onClick={openPrintPreview} disabled={!job || busy} title="Open print preview">
                  <Printer size={17} />
                  Preview
                </button>
                <button onClick={exportPdf} disabled={!job || busy} title="Export PDF">
                  <FileDown size={17} />
                  PDF
                </button>
                <button className="danger" onClick={deleteCurrentJob} disabled={!job || busy} title="Delete job">
                  <Trash2 size={17} />
                  Delete
                </button>
              </>
            )}
          </div>
        </header>

        {status && <div className="status-banner">{status}</div>}

        {view === 'jobs' && (
          <JobEditor
            job={job}
            setJob={setJob}
            libraries={libraries}
            templates={templates}
            onAddOperation={addOperation}
            onStatus={showStatus}
          />
        )}
        {view === 'libraries' && (
          <LibraryManager
            libraries={libraries}
            setLibraries={setLibraries}
            templates={templates}
            setTemplates={setTemplates}
            onStatus={showStatus}
          />
        )}
        {view === 'templates' && (
          <TemplateManager
            templates={templates}
            setTemplates={setTemplates}
            libraries={libraries}
            onStatus={showStatus}
          />
        )}
      </main>
    </div>
  );
}

function JobEditor({ job, setJob, libraries, templates, onAddOperation, onStatus }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || 'generic');

  useEffect(() => {
    if (templates[0] && !templates.some((template) => template.id === templateId)) {
      setTemplateId(templates[0].id);
    }
  }, [templates, templateId]);

  if (!job) {
    return (
      <section className="empty-state">
        <ClipboardList size={34} />
        <h3>No job selected</h3>
        <p>Create a job or select a saved job from the sidebar.</p>
      </section>
    );
  }

  const updateField = (field, value) => setJob((current) => ({ ...current, [field]: value }));
  const updateRevision = (field, value) => setJob((current) => ({
    ...current,
    revision: { ...current.revision, [field]: value }
  }));

  const selectedTemplate = templates.find((template) => template.id === templateId) || templates[0];
  const hasToolsAndFixturesOperation = (job.operations || []).some(usesToolsAndFixtures);

  const moveOperation = (operationId, direction) => {
    setJob((current) => {
      const operations = [...current.operations];
      const index = operations.findIndex((operation) => operation.id === operationId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= operations.length) return current;
      [operations[index], operations[nextIndex]] = [operations[nextIndex], operations[index]];
      return { ...current, operations };
    });
  };

  const removeOperation = (operationId) => {
    setJob((current) => ({
      ...current,
      operations: current.operations.filter((operation) => operation.id !== operationId)
    }));
  };

  const updateOperation = (operationId, updater) => {
    setJob((current) => ({
      ...current,
      operations: current.operations.map((operation) => {
        if (operation.id !== operationId) return operation;
        return typeof updater === 'function' ? updater(operation) : { ...operation, ...updater };
      })
    }));
  };

  return (
    <div className="editor-grid">
      <section className="panel job-details-panel">
        <div className="panel-heading">
          <h3>Job Details</h3>
          <span>Header and revision block</span>
        </div>
        <div className="form-grid">
          <TextField label="Customer" value={job.customer} onChange={(value) => updateField('customer', value)} />
          <TextField label="Job Number" value={job.jobNumber} onChange={(value) => updateField('jobNumber', value)} />
          <TextField label="Job Name" value={job.jobName} onChange={(value) => updateField('jobName', value)} />
          <TextField label="Part Number" value={job.partNumber} onChange={(value) => updateField('partNumber', value)} />
          <TextField label="Part Name" value={job.partName} onChange={(value) => updateField('partName', value)} />
          <TextField label="Material" value={job.material} onChange={(value) => updateField('material', value)} />
          <TextField label="Quantity" value={job.quantity} onChange={(value) => updateField('quantity', value)} />
          <TextField label="Revision" value={job.revision?.number || ''} onChange={(value) => updateRevision('number', value)} />
          <TextField label="Revision Date" type="date" value={job.revision?.date || ''} onChange={(value) => updateRevision('date', value)} />
          <TextField label="Author" value={job.revision?.author || ''} onChange={(value) => updateRevision('author', value)} />
        </div>
        <TextArea label="Revision Notes" value={job.revision?.notes || ''} onChange={(value) => updateRevision('notes', value)} rows={3} />
      </section>

      <section className="panel operation-add-panel">
        <div className="panel-heading">
          <h3>Add Operation</h3>
          <span>Start from a template, then customize fields</span>
        </div>
        <div className="inline-controls">
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <button className="primary-button" onClick={() => onAddOperation(selectedTemplate)}>
            <ListPlus size={17} />
            Add
          </button>
        </div>
      </section>

      {hasToolsAndFixturesOperation && (
        <JobToolsPanel
          tools={job.tools || []}
          onChange={(tools) => setJob((current) => ({ ...current, tools }))}
        />
      )}

      <section className="operations-stack">
        {job.operations.length === 0 && (
          <div className="empty-state compact">
            <Wrench size={30} />
            <h3>No operations yet</h3>
            <p>Add sawing, milling, finishing, inspection, or any custom operation.</p>
          </div>
        )}
        {job.operations.map((operation, index) => (
          <OperationCard
            key={operation.id}
            operation={operation}
            index={index}
            total={job.operations.length}
            jobId={job.id}
            libraries={libraries}
            jobTools={job.tools || []}
            onUpdate={(updater) => updateOperation(operation.id, updater)}
            onMove={(direction) => moveOperation(operation.id, direction)}
            onRemove={() => removeOperation(operation.id)}
            onStatus={onStatus}
          />
        ))}
      </section>
    </div>
  );
}

function OperationCard({ operation, index, total, jobId, libraries, jobTools, onUpdate, onMove, onRemove, onStatus }) {
  const updateParameter = (parameterId, patch) => {
    onUpdate((current) => ({
      ...current,
      parameters: current.parameters.map((parameter) => parameter.id === parameterId ? { ...parameter, ...patch } : parameter)
    }));
  };

  const addParameter = () => onUpdate((current) => ({
    ...current,
    parameters: [...current.parameters, blankParameter()]
  }));

  const removeParameter = (parameterId) => onUpdate((current) => ({
    ...current,
    parameters: current.parameters.filter((parameter) => parameter.id !== parameterId)
  }));

  const addStep = () => onUpdate((current) => ({
    ...current,
    steps: [...current.steps, blankStep()]
  }));

  const updateStep = (stepId, patch) => onUpdate((current) => ({
    ...current,
    steps: current.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step)
  }));

  const removeStep = (stepId) => onUpdate((current) => ({
    ...current,
    steps: current.steps.filter((step) => step.id !== stepId)
  }));

  const moveStep = (stepId, direction) => {
    onUpdate((current) => {
      const steps = [...current.steps];
      const stepIndex = steps.findIndex((step) => step.id === stepId);
      const nextIndex = stepIndex + direction;
      if (stepIndex < 0 || nextIndex < 0 || nextIndex >= steps.length) return current;
      [steps[stepIndex], steps[nextIndex]] = [steps[nextIndex], steps[stepIndex]];
      return { ...current, steps };
    });
  };

  const toggleReference = (field, id) => {
    onUpdate((current) => {
      const values = new Set(current[field] || []);
      if (values.has(id)) values.delete(id);
      else values.add(id);
      return { ...current, [field]: [...values] };
    });
  };

  const assignedLibraries = operationLibraryNames(operation)
    .map((name) => libraries[name])
    .filter(Boolean)
    .filter((library) => !isFixtureLibrary(library) || usesToolsAndFixtures(operation));
  const machineLibrary = assignedLibraries.find((library) => library.name === 'machines');
  const fixtureLibrary = assignedLibraries.find((library) => isFixtureLibrary(library));
  const resourceLibraries = assignedLibraries.filter((library) => (
    library.name !== 'machines' && !isFixtureLibrary(library)
  ));

  const toggleLibrarySelection = (libraryName, id) => {
    onUpdate((current) => {
      const values = new Set(operationSelectedLibraryIds(current, libraryName));
      if (values.has(id)) values.delete(id);
      else values.add(id);
      const nextIds = [...values];
      const nextOperation = {
        ...current,
        librarySelections: {
          ...(current.librarySelections || {}),
          [libraryName]: nextIds
        }
      };
      const specialField = SPECIAL_LIBRARY_FIELDS[libraryName];
      if (specialField) nextOperation[specialField] = nextIds[0] || '';
      return nextOperation;
    });
  };

  const addImages = async (stepId) => {
    try {
      const images = await api.chooseStepImages(jobId);
      if (!images.length) return;
      updateStep(stepId, {
        images: [
          ...(operation.steps.find((step) => step.id === stepId)?.images || []),
          ...images
        ]
      });
      onStatus(`${images.length} image${images.length === 1 ? '' : 's'} added.`);
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const removeImage = (stepId, imageId) => {
    const step = operation.steps.find((item) => item.id === stepId);
    updateStep(stepId, {
      images: (step?.images || []).filter((image) => image.id !== imageId)
    });
  };

  return (
    <article className="operation-card">
      <div className="operation-header">
        <div className="operation-index">{index + 1}</div>
        <div className="operation-title-fields">
          <TextField label="Operation Title" value={operation.title || ''} onChange={(value) => onUpdate({ title: value })} />
        </div>
        <div className="icon-button-row">
          <button onClick={() => onMove(-1)} disabled={index === 0} title="Move operation up">↑</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} title="Move operation down">↓</button>
          <button className="danger square" onClick={onRemove} title="Remove operation">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="operation-body">
        <div className="operation-setup">
          {machineLibrary && (
            <LibrarySelect
              label={machineLibrary.label || 'Machine'}
              value={operation.machineId || ''}
              records={machineLibrary.records || []}
              onChange={(value) => onUpdate({ machineId: value })}
            />
          )}

          {usesToolsAndFixtures(operation) && (
            <div className="tools-picker">
              <ReferenceChecklist
                title="Tools"
                records={jobTools || []}
                selectedIds={operation.toolIds || []}
                onToggle={(id) => toggleReference('toolIds', id)}
              />
            </div>
          )}

          {fixtureLibrary && (
            <ReferenceChecklist
              title={fixtureLibrary.label || 'Fixtures'}
              records={fixtureLibrary.records || []}
              selectedIds={operation.fixtureIds || []}
              onToggle={(id) => toggleReference('fixtureIds', id)}
            />
          )}

          {resourceLibraries.map((library) => (
            <ReferenceChecklist
              key={library.name}
              title={library.label || titleFromName(library.name)}
              records={library.records || []}
              selectedIds={operationSelectedLibraryIds(operation, library.name)}
              onToggle={(id) => toggleLibrarySelection(library.name, id)}
            />
          ))}

          {assignedLibraries.length === 0 && !usesToolsAndFixtures(operation) && (
            <div className="empty-inline">No libraries assigned.</div>
          )}
        </div>

        <div className="parameters-block">
          <div className="subheading-row">
            <h4>Process Parameters</h4>
            <button onClick={addParameter} title="Add parameter">
              <Plus size={16} />
              Parameter
            </button>
          </div>
          <div className="parameter-list">
            {operation.parameters.map((parameter) => (
              <div className="parameter-row" key={parameter.id}>
                <input value={parameter.label} placeholder="Parameter" onChange={(event) => updateParameter(parameter.id, { label: event.target.value })} />
                <input value={parameter.value} placeholder="Value" onChange={(event) => updateParameter(parameter.id, { value: event.target.value })} />
                <button className="danger square" onClick={() => removeParameter(parameter.id)} title="Remove parameter">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="steps-block">
          <div className="subheading-row">
            <h4>Instruction Steps</h4>
            <button onClick={addStep} title="Add step">
              <Plus size={16} />
              Step
            </button>
          </div>
          {operation.steps.map((step, stepIndex) => (
            <div className="step-editor" key={step.id}>
              <div className="step-number">{stepIndex + 1}</div>
              <div className="step-content">
                <textarea value={step.instruction} rows={3} onChange={(event) => updateStep(step.id, { instruction: event.target.value })} placeholder="Instruction step" />
                <div className="image-strip">
                  {(step.images || []).map((image) => (
                    <div className="image-thumb" key={image.id}>
                      <img src={api.assetUrl(image.relativePath)} alt={image.name || 'Step image'} />
                      <button className="danger square" onClick={() => removeImage(step.id, image.id)} title="Remove image">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="image-add-button" onClick={() => addImages(step.id)} title="Add step images">
                    <ImagePlus size={17} />
                    Add Images
                  </button>
                </div>
              </div>
              <div className="step-actions">
                <button onClick={() => moveStep(step.id, -1)} disabled={stepIndex === 0} title="Move step up">↑</button>
                <button onClick={() => moveStep(step.id, 1)} disabled={stepIndex === operation.steps.length - 1} title="Move step down">↓</button>
                <button className="danger square" onClick={() => removeStep(step.id)} title="Remove step">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function LibrarySelect({ label, value, records, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>{record.name}</option>
        ))}
      </select>
    </label>
  );
}

function ReferenceChecklist({ title, records, selectedIds, onToggle }) {
  return (
    <div className="reference-list">
      <h4>{title}</h4>
      {records.length === 0 && <span className="muted">Add records in Libraries.</span>}
      {records.map((record) => (
        <label key={record.id} className="check-row">
          <input type="checkbox" checked={selectedIds.includes(record.id)} onChange={() => onToggle(record.id)} />
          <span>{record.name}{record.length ? ` (${record.length})` : ''}</span>
        </label>
      ))}
    </div>
  );
}

function JobToolsPanel({ tools, onChange }) {
  const addTool = () => onChange([...tools, {
    ...blankRecord(),
    length: '',
    diameter: '',
    holder: ''
  }]);
  const updateTool = (id, patch) => onChange(tools.map((tool) => tool.id === id ? { ...tool, ...patch } : tool));
  const removeTool = (id) => onChange(tools.filter((tool) => tool.id !== id));

  return (
    <section className="panel job-tools-panel">
      <div className="panel-heading inline">
        <div>
          <h3>Job Tools</h3>
          <span>{tools.length} tool{tools.length === 1 ? '' : 's'} saved with this job</span>
        </div>
        <button onClick={addTool}>
          <Plus size={16} />
          Tool
        </button>
      </div>
      {tools.length === 0 ? (
        <div className="empty-inline">Import Fusion setup sheets when creating a job, or add job-specific tools here.</div>
      ) : (
        <div className="job-tools-grid">
          {tools.map((tool) => (
            <div className="job-tool-card" key={tool.id}>
              <TextField label="Tool" value={tool.name || ''} onChange={(value) => updateTool(tool.id, { name: value })} />
              <TextField label="Diameter" value={tool.diameter || ''} onChange={(value) => updateTool(tool.id, { diameter: value })} />
              <TextField label="Length / Stickout" value={tool.length || ''} onChange={(value) => updateTool(tool.id, { length: value })} />
              <TextField label="Holder" value={tool.holder || ''} onChange={(value) => updateTool(tool.id, { holder: value })} />
              <TextArea label="Details" value={tool.details || ''} onChange={(value) => updateTool(tool.id, { details: value })} rows={2} />
              <button className="danger" onClick={() => removeTool(tool.id)}>
                <Trash2 size={16} />
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryManager({ libraries, setLibraries, templates, setTemplates, onStatus }) {
  const librariesInOrder = libraryList(libraries);
  const [active, setActive] = useState(librariesInOrder[0]?.name || '');
  const library = libraries[active] || librariesInOrder[0] || null;

  useEffect(() => {
    if (librariesInOrder[0] && !librariesInOrder.some((item) => item.name === active)) {
      setActive(librariesInOrder[0].name);
    }
    if (!librariesInOrder.length && active) setActive('');
  }, [active, librariesInOrder]);

  const updateLibrary = (patch) => {
    if (!library) return;
    setLibraries((current) => ({
      ...current,
      [library.name]: {
        ...library,
        ...patch
      }
    }));
  };

  const updateRecords = (records) => {
    if (!library) return;
    setLibraries((current) => ({
      ...current,
      [library.name]: {
        ...(current[library.name] || library),
        records
      }
    }));
  };

  const save = async () => {
    if (!library) return;
    try {
      const saved = await api.saveLibrary(library);
      setLibraries((current) => ({ ...current, [saved.name]: saved }));
      setActive(saved.name);
      onStatus(`${saved.label} saved.`);
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const addLibrary = () => {
    const name = newId('library');
    const next = {
      name,
      label: 'New Library',
      order: 1000 + librariesInOrder.length,
      records: []
    };
    setLibraries((current) => ({ ...current, [name]: next }));
    setActive(name);
  };

  const removeLibrary = async () => {
    if (!library) return;
    if (!window.confirm(`Delete the "${library.label || library.name}" library? Existing jobs will keep their saved text and IDs.`)) return;

    try {
      await api.deleteLibrary(library.name);
      setLibraries((current) => {
        const next = { ...current };
        delete next[library.name];
        return next;
      });

      const nextTemplates = templates.map((template) => ({
        ...template,
        libraryNames: templateLibraryNames(template).filter((name) => name !== library.name)
      }));
      const changedTemplates = nextTemplates.filter((template, index) => (
        templateLibraryNames(templates[index]).length !== template.libraryNames.length
      ));
      await Promise.all(changedTemplates.map((template) => api.saveTemplate(template)));
      setTemplates(nextTemplates);
      setActive(librariesInOrder.find((item) => item.name !== library.name)?.name || '');
      onStatus(`${library.label || library.name} deleted.`);
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const addRecord = () => updateRecords([...(library.records || []), blankRecord()]);
  const removeRecord = (id) => updateRecords((library.records || []).filter((record) => record.id !== id));
  const updateRecord = (id, patch) => updateRecords((library.records || []).map((record) => record.id === id ? { ...record, ...patch } : record));

  if (!library) {
    return (
      <section className="empty-state">
        <Library size={34} />
        <h3>No libraries</h3>
        <button className="primary-button" onClick={addLibrary}>
          <Plus size={17} />
          Add Library
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="library-layout">
        <div className="library-tabs">
          <button className="sidebar-action" onClick={addLibrary}>
            <Plus size={16} />
            New Library
          </button>
          {librariesInOrder.map((item) => (
            <button key={item.name} className={library.name === item.name ? 'active' : ''} onClick={() => setActive(item.name)}>
              <Archive size={16} />
              <span>{item.label || titleFromName(item.name)}</span>
            </button>
          ))}
        </div>
        <div className="library-editor">
          <div className="panel-heading inline">
            <div>
              <h3>{library.label || active}</h3>
              <span>{(library.records || []).length} saved record{(library.records || []).length === 1 ? '' : 's'}</span>
            </div>
            <div className="toolbar">
              <button className="danger" onClick={removeLibrary}>
                <Trash2 size={16} />
                Delete Library
              </button>
              <button onClick={addRecord}>
                <Plus size={16} />
                Add
              </button>
              <button className="primary-button" onClick={save}>
                <Save size={16} />
                Save Library
              </button>
            </div>
          </div>

          <div className="form-grid library-meta">
            <TextField label="Library Name" value={library.label || ''} onChange={(value) => updateLibrary({ label: value })} />
          </div>

          <div className="record-grid">
            {(library.records || []).map((record) => (
              <div className="record-card" key={record.id}>
                <TextField label="Name" value={record.name} onChange={(value) => updateRecord(record.id, { name: value })} />
                <TextField label="Description" value={record.description || ''} onChange={(value) => updateRecord(record.id, { description: value })} />
                <TextArea label="Details" value={record.details || ''} onChange={(value) => updateRecord(record.id, { details: value })} rows={3} />
                <button className="danger" onClick={() => removeRecord(record.id)}>
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TemplateManager({ templates, setTemplates, libraries, onStatus }) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');
  const selected = templates.find((template) => template.id === selectedId) || templates[0];
  const librariesInOrder = libraryList(libraries);

  useEffect(() => {
    if (templates[0] && !templates.some((template) => template.id === selectedId)) setSelectedId(templates[0].id);
    if (!templates.length && selectedId) setSelectedId('');
  }, [selectedId, templates]);

  const updateTemplate = (patch) => {
    setTemplates((current) => current.map((template) => template.id === selected.id ? { ...template, ...patch } : template));
  };

  const addTemplate = () => {
    const next = {
      id: newId('template'),
      name: 'New Template',
      category: 'General',
      libraryNames: [],
      defaultParameters: [blankParameter()],
      defaultSteps: ['Document operation instructions.']
    };
    setTemplates((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const save = async () => {
    if (!selected) return;
    try {
      const saved = await api.saveTemplate(selected);
      setTemplates((current) => current.map((template) => template.id === saved.id ? saved : template));
      onStatus(`${saved.name} template saved.`);
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const removeTemplate = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete the "${selected.name}" template? Existing jobs will not be changed.`)) return;

    try {
      await api.deleteTemplate(selected.id);
      const remaining = templates.filter((template) => template.id !== selected.id);
      setTemplates(remaining);
      setSelectedId(remaining[0]?.id || '');
      onStatus(`${selected.name} template deleted.`);
    } catch (error) {
      onStatus(error.message || String(error));
    }
  };

  const updateParameter = (id, patch) => updateTemplate({
    defaultParameters: (selected.defaultParameters || []).map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter)
  });

  const updateStep = (index, value) => {
    const steps = [...(selected.defaultSteps || [])];
    steps[index] = value;
    updateTemplate({ defaultSteps: steps });
  };

  const toggleTemplateLibrary = (libraryName) => {
    const values = new Set(templateLibraryNames(selected));
    if (values.has(libraryName)) values.delete(libraryName);
    else values.add(libraryName);
    updateTemplate({ libraryNames: [...values] });
  };

  if (!selected) {
    return (
      <section className="empty-state">
        <BookOpen size={34} />
        <h3>No templates loaded</h3>
        <button className="primary-button" onClick={addTemplate}>
          <Plus size={17} />
          Add Template
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="template-layout">
        <div className="template-list">
          <button className="sidebar-action" onClick={addTemplate}>
            <Plus size={16} />
            New Template
          </button>
          {templates.map((template) => (
            <button key={template.id} className={template.id === selected.id ? 'selected' : ''} onClick={() => setSelectedId(template.id)}>
              <strong>{template.name}</strong>
              <span>{template.category}</span>
            </button>
          ))}
        </div>
        <div className="template-editor">
          <div className="panel-heading inline">
            <div>
              <h3>{selected.name}</h3>
              <span>Default parameters and starting steps</span>
            </div>
            <div className="toolbar">
              <button className="danger" onClick={removeTemplate}>
                <Trash2 size={16} />
                Delete
              </button>
              <button className="primary-button" onClick={save}>
                <Save size={16} />
                Save Template
              </button>
            </div>
          </div>
          <div className="form-grid">
            <TextField label="Template Name" value={selected.name || ''} onChange={(value) => updateTemplate({ name: value })} />
            <TextField label="Category" value={selected.category || ''} onChange={(value) => updateTemplate({ category: value })} />
          </div>

          <div>
            <div className="subheading-row">
              <h4>Assigned Libraries</h4>
            </div>
            <div className="template-library-grid">
              {librariesInOrder.map((library) => (
                <label key={library.name} className="check-row library-assignment-row">
                  <input
                    type="checkbox"
                    checked={templateLibraryNames(selected).includes(library.name)}
                    onChange={() => toggleTemplateLibrary(library.name)}
                  />
                  <span>{library.label || titleFromName(library.name)}</span>
                </label>
              ))}
              {librariesInOrder.length === 0 && <div className="empty-inline">No libraries available.</div>}
            </div>
          </div>

          <div className="subheading-row">
            <h4>Default Parameters</h4>
            <button onClick={() => updateTemplate({ defaultParameters: [...(selected.defaultParameters || []), blankParameter()] })}>
              <Plus size={16} />
              Parameter
            </button>
          </div>
          <div className="parameter-list">
            {(selected.defaultParameters || []).map((parameter) => (
              <div className="parameter-row" key={parameter.id}>
                <input value={parameter.label} placeholder="Parameter" onChange={(event) => updateParameter(parameter.id, { label: event.target.value })} />
                <input value={parameter.value} placeholder="Default value" onChange={(event) => updateParameter(parameter.id, { value: event.target.value })} />
                <button className="danger square" onClick={() => updateTemplate({ defaultParameters: selected.defaultParameters.filter((item) => item.id !== parameter.id) })}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="subheading-row">
            <h4>Default Steps</h4>
            <button onClick={() => updateTemplate({ defaultSteps: [...(selected.defaultSteps || []), ''] })}>
              <Plus size={16} />
              Step
            </button>
          </div>
          <div className="default-step-list">
            {(selected.defaultSteps || []).map((step, index) => (
              <div className="parameter-row" key={`${selected.id}-${index}`}>
                <input value={step} placeholder="Default instruction" onChange={(event) => updateStep(index, event.target.value)} />
                <button className="danger square" onClick={() => updateTemplate({ defaultSteps: selected.defaultSteps.filter((_, stepIndex) => stepIndex !== index) })}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PrintPacket({ jobId }) {
  const [job, setJob] = useState(null);
  const [libraries, setLibraries] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedJob, loadedLibraries] = await Promise.all([
          api.loadJob(jobId),
          api.loadLibraries()
        ]);
        if (!loadedJob) throw new Error('Job not found.');
        setJob(loadedJob);
        setLibraries(loadedLibraries);
      } catch (loadError) {
        setError(loadError.message || String(loadError));
      }
    };
    load();
  }, [jobId]);

  if (error) {
    return <div className="fatal"><h1>Print Error</h1><p>{error}</p></div>;
  }

  if (!job) {
    return <div className="fatal"><h1>Loading job packet...</h1></div>;
  }

  return (
    <div className="print-shell">
      <div className="print-actions screen-only">
        <button onClick={() => { window.location.hash = '/'; }}>
          <PanelLeft size={17} />
          Back
        </button>
        <button onClick={() => window.print()}>
          <Printer size={17} />
          Print
        </button>
      </div>

      <section className="print-page">
        <header className="packet-header">
          <div>
            <h1>{job.jobNumber || job.jobName || 'Untitled Job'}</h1>
            <p>{job.partNumber || ''} {job.partName || ''}</p>
          </div>
          <div className="revision-box">
            <strong>Rev {job.revision?.number || '-'}</strong>
            <span>{job.revision?.date || ''}</span>
          </div>
        </header>

        <div className="packet-grid">
          <PrintField label="Customer" value={job.customer} />
          <PrintField label="Material" value={job.material} />
          <PrintField label="Quantity" value={job.quantity} />
          <PrintField label="Author" value={job.revision?.author} />
        </div>

        {job.revision?.notes && (
          <div className="print-note">
            <strong>Revision Notes</strong>
            <p>{job.revision.notes}</p>
          </div>
        )}

        <div className="route-summary">
          <h2>Process Route</h2>
          <ol>
            {job.operations.map((operation) => (
              <li key={operation.id}>{operation.title || operation.type}</li>
            ))}
          </ol>
        </div>
      </section>

      {job.operations.map((operation, index) => (
        <PrintOperation key={operation.id} operation={operation} index={index} libraries={libraries} jobTools={job.tools || []} />
      ))}
    </div>
  );
}

function PrintOperation({ operation, index, libraries, jobTools }) {
  const operationTools = (operation.toolIds || [])
    .map((id) => (jobTools || []).find((tool) => tool.id === id))
    .filter(Boolean)
    .filter(() => usesToolsAndFixtures(operation));
  const assignedLibraries = operationLibraryNames(operation)
    .map((name) => libraries[name])
    .filter(Boolean)
    .filter((library) => !isFixtureLibrary(library) || usesToolsAndFixtures(operation));
  const setupRows = assignedLibraries.map((library) => {
    if (library.name === 'machines') {
      return [library.label || 'Machine', recordName(libraries, library.name, operation.machineId)];
    }
    if (isFixtureLibrary(library)) {
      return [
        library.label || 'Fixtures',
        (operation.fixtureIds || []).map((id) => recordName(libraries, library.name, id)).filter(Boolean).join(', ')
      ];
    }
    return [
      library.label || titleFromName(library.name),
      operationSelectedLibraryIds(operation, library.name).map((id) => recordName(libraries, library.name, id)).filter(Boolean).join(', ')
    ];
  }).filter(([, value]) => String(value || '').trim());

  const parameterRows = (operation.parameters || [])
    .filter((parameter) => String(parameter.label || '').trim() || String(parameter.value || '').trim());
  const instructionSteps = (operation.steps || [])
    .filter((step) => String(step.instruction || '').trim() || (step.images || []).length > 0);

  return (
    <section className="print-page operation-print-page">
      <header className="operation-print-header">
        <span>Operation {index + 1}</span>
        <h2>{operation.title || operation.type}</h2>
      </header>

      {(setupRows.length > 0 || parameterRows.length > 0) && (
        <div className="print-two-column">
          {setupRows.length > 0 && (
            <div>
              <h3>Setup</h3>
              {setupRows.map(([label, value]) => (
                <PrintField key={`${label}-${value}`} label={label} value={value} compact />
              ))}
            </div>
          )}
          {parameterRows.length > 0 && (
            <div>
              <h3>Parameters</h3>
              <table className="print-table">
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
          )}
        </div>
      )}

      {operationTools.length > 0 && (
        <>
          <h3>Tools</h3>
          <table className="print-table tool-print-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Diameter</th>
                <th>Length / Stickout</th>
                <th>Holder</th>
              </tr>
            </thead>
            <tbody>
              {operationTools.map((tool) => (
                <tr key={tool.id}>
                  <td>{tool.name || '-'}</td>
                  <td>{tool.diameter || '-'}</td>
                  <td>{tool.length || '-'}</td>
                  <td>{tool.holder || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {instructionSteps.length > 0 && (
        <>
          <h3>Work Instructions</h3>
          <ol className="print-steps">
            {instructionSteps.map((step) => (
              <li key={step.id}>
                {step.instruction && <p>{step.instruction}</p>}
                {(step.images || []).length > 0 && (
                  <div className="print-images">
                    {step.images.map((image) => (
                      <img key={image.id} src={api.assetUrl(image.relativePath)} alt={image.name || 'Step image'} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function TextField({ label, value, onChange, type = 'text' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }) {
  return (
    <label className="field full">
      <span>{label}</span>
      <textarea value={value || ''} rows={rows} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PrintField({ label, value, compact = false }) {
  return (
    <div className={`print-field ${compact ? 'compact' : ''}`}>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
