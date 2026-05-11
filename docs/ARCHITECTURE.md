# AMERP Architecture

## Intent

AMERP is a local-first ERP for jobshops that need practical ISO 9001-style traceability without a server. It merges setup documentation, material certification, metrology, Kanban purchasing cards, inspection reporting, and nonconformance handling into one Electron desktop app.

## Runtime Shape

- One Electron shell.
- One React renderer.
- File-backed repositories in the Electron main process.
- No server process.
- No cloud login dependency.
- Optional OpenAI API usage only for user-triggered AI assistance.

## Source Of Truth

The selected AMERP data folder is canonical. Business records are stored as readable JSON files with generated Markdown history companions and managed document copies.

The search index under `cache/` is rebuildable and disposable. Locks under `locks/` are coordination aids, not business data.

## Main Processes

- Electron main process owns filesystem access, import/export, PDF generation, and IPC.
- Preload exposes a safe `window.amerp` bridge.
- React renderer owns UI state, editor layout, and print-route rendering.
- Parser scripts are called from the backend for PDF import boundaries.

## Modules

### Jobs

- job list/detail workspace
- customer and job-number handling
- one or more parts per job
- ordered operations per part
- job and part attachments with revision/archive behavior
- Xometry traveler import into existing jobs
- Xometry and Subtract PO import into new jobs
- 8.5 x 11 traveler/setup-sheet PDF output

### Parts And Operations

- part metadata, notes, revision, and material selection
- part-level inspection setup/results links
- part-level NCR links
- operation parameters, library-backed parameter selections, steps, step photos, and tooling
- milling/turning operations print detailed tool blocks in travelers

### Materials

- material lots and supplier/spec/dimension metadata
- material cert attachments
- traceability status and usage references
- material label PDF output
- archive/unarchive/delete archived workflow

### Gages

- instrument master records
- calibration history
- due/overdue state calculation
- measuring-tool options used by inspection characteristics and reports

### Kanban

- standalone purchasing card records
- controlled departments, department-specific locations, vendors, and categories
- optional OpenAI-assisted URL enrichment and image generation
- two-sided card PDF output with configurable sizes and black-and-white mode

### Inspection

- part-scoped inspection setup and results
- PDF drawing ballooning
- characteristics and measured instances
- versioned inspection report records
- material cert inclusion
- gage certification history inclusion
- global `Inspections` module for report listing

### Nonconformance

- part-created NCR records stored under a top-level `nonconformances/` root
- global `Nonconformance` module for search/filter/reporting
- simplified ISO 9001-friendly stepper editor
- controlled lifecycle validation
- attachments, CSV export, archive/unarchive/delete archived workflow
- NCR report PDF output

### Settings

- data folder and module visibility
- job, Kanban, NCR, and inspection report numbering
- customers and controlled option lists
- materials catalog options
- metrology dropdown options
- Kanban print sizes and department colors
- operation templates and reusable libraries
- branding, title, tagline, icon, and OpenAI API key

## Repository Boundaries

Keep logic grouped by domain behavior rather than only by UI screen. The backend is currently concentrated in `electron/backend/erp.cjs`; when splitting it, preserve explicit service boundaries:

- records/repositories
- importers/parsers
- managed attachments
- print/export
- lock/audit
- settings/defaults

## PDF Strategy

PDFs are generated through Electron print routes and saved automatically into record-specific folders. Print routes should render purpose-built report/card/label markup, not the live editor UI.

Current PDF families:

- job traveler/setup packet
- inspection report
- ballooned drawing
- NCR report
- Kanban card
- material label

## Important Constraints

- Do not make cache/index files authoritative.
- Do not use hard delete for canonical business records except where the UI explicitly allows deleting archived records.
- Do not rely on UI-only labels for references.
- Do not bypass the preload bridge from the renderer.
- Do not add server-first assumptions into the current data model.
- Do not merge import parser paths that represent different business documents.

## Known Gaps

- Automated test coverage is still thin.
- `electron/backend/erp.cjs` is large and should be split into domain services as the app grows.
- Import coverage is pragmatic and sample-driven, not exhaustive.
- Runtime packaging is source-folder based; there is not yet a signed installer.
