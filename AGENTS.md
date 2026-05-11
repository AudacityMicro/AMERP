# AMERP Agent Guide

This repository is a local-first `Electron + React` ERP for jobshops. Preserve the file-backed architecture, stable record IDs, and shop-floor-first UI assumptions.

## Core Rules

- Keep the app local-only unless the user explicitly approves a product-level change. Do not add cloud auth, server persistence, or background services.
- Canonical business records live in the selected AMERP data folder as readable JSON and Markdown companion files.
- The cache/search layer is disposable. Never make `cache/` authoritative.
- Archive business records by default instead of hard-deleting. Only delete where the UI explicitly limits deletion to archived/non-current records.
- Cross-module links must use stable IDs, not path scraping or display labels.
- The Electron main process owns filesystem access, import/export, document storage, locks, and domain services.
- Renderer code must use the preload bridge exposed as `window.amerp`; do not bypass it.
- Preserve single-writer lock behavior when changing editor flows.

## Repository Map

- `electron/main.cjs`
  - Electron bootstrap, protocol registration, print-window orchestration, and IPC wiring.
- `electron/preload.cjs`
  - Safe renderer bridge exposed as `window.amerp`.
- `electron/backend/erp.cjs`
  - Main file-backed domain backend for jobs, parts, materials, gages, imports, customers, Kanban, inspections, NCRs, documents, locks, audit, and PDF export.
- `electron/backend/utils.cjs`
  - Shared file and path helpers.
- `electron/backend/defaults.cjs`
  - Seed templates, libraries, material constants, and default settings values.
- `src/main.jsx`
  - Unified ERP UI, route state, print routes, inspection/NCR/Kanban screens, and report renderers.
- `src/styles.css`
  - Main UI styling plus route-specific print styling.
- `scripts/dev.mjs`
  - Vite + Electron development launcher.
- `scripts/parse_xometry_travelers.py`
  - Xometry traveler parser for in-job part-shell import.
- `scripts/parse_xometry_purchase_orders.py`
  - Xometry PO parser for new-job import.
- `scripts/parse_subtract_purchase_orders.py`
  - Subtract Manufacturing PO parser for new-job import.
- `scripts/import_materials_sqlite.py`
  - SQLite reader used for legacy materials database import.

## Run And Handoff Scripts

- `Install-AMERP.cmd` is the friend-friendly installer wrapper.
- `Install-AMERP.ps1` downloads the latest GitHub ZIP, installs/verifies Node.js and Python, installs dependencies, builds, creates a desktop shortcut, and launches the app.
- `Setup-AMERP.cmd` installs dependencies with `pnpm` and builds the app. Use this on a fresh computer.
- `Start-App.cmd` starts the built Electron app from `dist/`.
- `Start-Dev.cmd` starts Vite and Electron for development.
- `Build-App.cmd` rebuilds the renderer bundle.

The scripts prefer the Codex bundled Node runtime when present, then fall back to installed Node.js on `PATH`. The installer does not require Git; it downloads the GitHub ZIP directly. Python plus `pypdf` are required for PDF import parsers.

## Domain Model

- Primary hierarchy: `Job -> Part -> ordered Operations`.
- Materials are traceable lots/certs selected at the part level and referenced by inspection/report output.
- Instruments/gages carry calibration history and can be linked to inspection characteristics.
- Inspection setup/results are part-scoped and include characteristics, instances, balloons, generated ballooned drawings, and versioned inspection reports.
- NCRs are stored in a top-level `nonconformances/` root but must remain linked to a job and part.
- Kanban cards are standalone purchasing records and do not track inventory transactions.
- Operation templates and reusable libraries are helpers, not canonical job records.

## Current Workspaces

- `Jobs`: job list/detail, parts, operations, documents, Xometry/Subtract imports, PDF travelers, archive/delete archived workflow.
- `Materials`: lots/certs, material labels, usage references, managed attachments, archive workflow.
- `Gages`: metrology records, calibration history, status visibility, dropdown-controlled fields.
- `Kanban`: controlled purchasing cards, AI-assisted URL enrichment, generated images, label/card PDFs, archive/unarchive/delete archived workflow.
- `Inspections`: global list of existing part inspection reports with links back to job/part context.
- `Nonconformance`: global NCR list/detail, part-level NCR creation, ISO 9001-friendly stepper editor, attachments, CSV export, and NCR PDFs.
- `Settings`: module visibility, numbering, controlled lists, operation templates, reusable libraries, print-size presets, branding, AI key, and quality defaults.
- `Settings > System` includes `iso9001ComplianceEnabled`. When false, ISO-specific inspection/NCR navigation and compliance-heavy fields should be hidden non-destructively; saved records must remain intact.

## Data Folder Layout

- `config/`
- `jobs/<job-id>/job.json`
- `jobs/<job-id>/history.md`
- `jobs/<job-id>/documents/...`
- `jobs/<job-id>/print/...`
- `jobs/<job-id>/parts/<part-id>/part.json`
- `jobs/<job-id>/parts/<part-id>/documents/...`
- `jobs/<job-id>/parts/<part-id>/inspection/reports/...`
- `jobs/<job-id>/parts/<part-id>/operations/<seq>-<slug>/operation.json`
- `jobs/<job-id>/parts/<part-id>/operations/<seq>-<slug>/work-instructions.md`
- `materials/<material-id>/material.json`
- `materials/<material-id>/history.md`
- `materials/<material-id>/documents/...`
- `materials/<material-id>/print/...`
- `metrology/instruments/<instrument-id>/...`
- `metrology/standards/standards.json`
- `kanban/<card-id>/card.json`
- `kanban/<card-id>/assets/...`
- `kanban/<card-id>/print/...`
- `nonconformances/<ncr-id>/ncr.json`
- `nonconformances/<ncr-id>/attachments/...`
- `nonconformances/<ncr-id>/print/...`
- `templates/operations/*.json`
- `libraries/*.json`
- `audit/audit-log.jsonl`
- `cache/search-index.json`
- `locks/*.json`

## Document And PDF Rules

- Managed attachments are copied into the AMERP data folder. Do not store business-critical references as external-only paths.
- Attachment revision history should be retained; the current row shows only the latest active revision by default.
- Archived attachments are hidden by default and can be opened when shown.
- Generated PDFs should save automatically into the relevant record print folder and open after generation.
- PDF filenames should include record identity and a date/time stamp. Include size/mode where useful, such as Kanban card size.
- Print routes should avoid rendering editor UI into the PDF unless the route is explicitly a UI capture.

## Import Boundaries

Keep parser paths separate:

- Xometry travelers create part shells inside an existing job.
- Xometry POs create new jobs.
- Subtract POs create new jobs.
- Fusion/setup-sheet imports create or update operations.
- Legacy materials import reads the old SQLite material database.

Do not introduce live dual-write between old apps and AMERP.

## Quality Workflows

- Inspection has separate setup and results screens. Setup owns editable balloons and characteristics; results owns measured instances and report output.
- Inspection reports are versioned records under `part.inspection.reports[]`.
- Ballooned drawings are generated managed outputs; original drawings remain unchanged.
- NCRs use a simplified stepper UI for normal entry while preserving the expanded ISO-friendly schema for reports/audit.
- NCR lifecycle, validation, and audit behavior should stay in the backend as the source of truth.
- Closed/finalized quality records should be treated as controlled records; changes should be explicit and auditable.

## UI Guidelines

- Preserve the compact industrial visual system.
- Keep navigation actions in the sticky top bar for the current record.
- Keep creation actions inside the owning module, not in global quick-action blocks.
- Prefer dense, aligned forms and tables over large empty cards.
- Use context cards for read-only traceability instead of forcing users to edit autofilled identifiers.
- Destructive actions should not look primary. Delete should be limited to archived/non-current records unless explicitly requested.

## Validation Expectations

Before closing work, prefer:

```powershell
node --check electron/backend/erp.cjs
node --check electron/main.cjs
node --check electron/preload.cjs
python -m py_compile scripts/import_materials_sqlite.py
node node_modules/vite/bin/vite.js build
```

If Electron runtime launch cannot be verified locally, state that clearly instead of claiming runtime validation.

## Git And Data Hygiene

- Do not commit `node_modules/`, `dist/`, `.smoke-data*`, local data folders, logs, or generated customer PDFs unless explicitly requested.
- Do not revert user changes unless explicitly instructed.
- Do not run destructive git commands such as `git reset --hard` or `git checkout --` without explicit user approval.
- When modifying mixed files, preserve unrelated user edits and stage only the intended paths.
