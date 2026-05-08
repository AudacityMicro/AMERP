# AMERP

AMERP is a local-first `Electron + React` ERP for jobshops, geared toward ISO9001-style traceability and quality records.

Phase 1 centers the workflow on:

- `Job -> Part -> ordered Operations`
- setup documentation and traveler packets
- material cert and lot traceability
- metrology / calibration visibility for inspection tools
- part-linked inspection and nonconformance records
- a human-readable canonical file tree with generated Markdown history records

## Current Architecture

- `electron/main.cjs`
  - Electron shell and IPC wiring
- `electron/backend/erp.cjs`
  - file-backed repositories, importers, audit trail, lock handling, and PDF export
- `src/main.jsx`
  - unified ERP UI and print packet renderer
- `src/styles.css`
  - main application and print styling
- `scripts/import_materials_sqlite.py`
  - SQLite export helper for importing legacy Materials-Database records

## Local Run

Preferred Windows entrypoints:

- `Start-App.cmd`
- `Start-Dev.cmd`
- `Build-App.cmd`

You can also use:

- `npm start`
- `npm run dev`
- `npm run build`

The scripts are configured to prefer a known-good Node path before falling back to `PATH`, because some Windows environments expose a broken `node` resolution.

## Canonical Data Root

The selected ERP data folder is the system of record. It contains:

- `config/`
- `jobs/`
- `nonconformances/`
- `materials/`
- `metrology/`
- `templates/operations/`
- `libraries/`
- `audit/`
- `cache/`
- `locks/`

All business data is stored as readable JSON and Markdown companion files. The search index under `cache/` is disposable.

## Legacy Imports

Phase 1 includes one-time import flows for:

- `SetupSheetGenerator`
- `Materials-Database`
- `Metrology-Tracker`

After import, AMERP becomes the authoritative application for those records.

## NCR Workflow

AMERP includes an ISO-friendly nonconformance workflow that is created from a part and then managed either from the part workspace or the top-level `Nonconformance` module.

- NCRs are file-backed under `nonconformances/<ncr-id>/`
- records preserve traceability to job, part, inspection context, attachments, and audit entries
- closure is validation-gated so containment, disposition/correction, and verification remain distinct
- closed NCRs are read-only until explicitly reopened with a reason
- NCR PDF export produces a grouped audit-style report, and the module can export NCR summary CSV files
