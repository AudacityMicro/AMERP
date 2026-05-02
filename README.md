# AMERP

AMERP is a local-first `Electron + React` ERP for jobshops, geared toward ISO9001-style traceability and quality records.

Phase 1 centers the workflow on:

- `Job -> Part -> ordered Operations`
- setup documentation and traveler packets
- material cert and lot traceability
- metrology / calibration visibility for inspection tools
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

## Canonical Data Root

The selected ERP data folder is the system of record. It contains:

- `config/`
- `jobs/`
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
