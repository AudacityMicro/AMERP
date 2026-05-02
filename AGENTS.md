# AMERP Agent Guide

This repository is a local-first `Electron + React` ERP for jobshops. Future agent work should preserve the file-backed architecture and the job-centered domain model.

## Core Rules

- Keep the app local-only. Do not add cloud auth, server dependencies, or remote persistence without an explicit product decision.
- Canonical business records live in the selected ERP data folder as readable JSON and Markdown companion files.
- The cache/index layer is disposable. Never make it the source of truth.
- Archive records instead of hard-deleting them when the record has business meaning.
- Cross-module links must use stable IDs, not path scraping or UI-only labels.
- The Electron main process owns filesystem access and domain services.

## Current Architecture

- `electron/main.cjs`
  - Electron bootstrap, protocol registration, and IPC wiring.
- `electron/preload.cjs`
  - Safe renderer bridge exposed as `window.amerp`.
- `electron/backend/erp.cjs`
  - Main domain backend for jobs, materials, metrology, imports, locks, audit, and print/PDF.
- `electron/backend/utils.cjs`
  - Shared file and path helpers.
- `electron/backend/defaults.cjs`
  - Seed templates, libraries, and material constants.
- `src/main.jsx`
  - Unified ERP UI and print route.
- `src/styles.css`
  - Main UI and print styling.
- `scripts/import_materials_sqlite.py`
  - SQLite reader used to import the legacy materials database.

## Domain Model

- `Job -> Part -> ordered Operations`
- Materials are traceable lots/certs that can be linked to operations.
- Instruments carry calibration history and can be linked to inspection operations.
- Templates and libraries are reusable helpers, not the canonical business record layer.

## Data Folder Layout

- `config/`
- `jobs/<job-id>/job.json`
- `jobs/<job-id>/history.md`
- `jobs/<job-id>/parts/<part-id>/part.json`
- `jobs/<job-id>/parts/<part-id>/operations/<seq>-<slug>/operation.json`
- `jobs/<job-id>/parts/<part-id>/operations/<seq>-<slug>/work-instructions.md`
- `materials/<material-id>/material.json`
- `materials/<material-id>/history.md`
- `metrology/instruments/<instrument-id>/...`
- `metrology/standards/standards.json`
- `templates/operations/*.json`
- `libraries/*.json`
- `audit/audit-log.jsonl`
- `cache/search-index.json`
- `locks/*.json`

## Concurrency

- Phase 1 uses single-writer guards via lock files under `locks/`.
- Reads can remain available while another user holds a lock.
- If you change editor flows, preserve lock acquire/release behavior.

## Import Boundaries

Phase 1 supports one-time import from:

- `SetupSheetGenerator`
- `Materials-Database`
- `Metrology-Tracker`

Do not introduce live dual-write between old apps and AMERP.

## Validation Expectations

Before closing work, prefer:

- `node --check` for Electron backend files
- `python -m py_compile` for Python helpers
- `node node_modules/vite/bin/vite.js build` for renderer verification

If Electron install scripts are blocked locally, state that clearly rather than claiming runtime launch validation.

## Near-Term Priorities

- tighten importer coverage and field mapping
- add tests around file-backed repositories and cross-reference rebuilding
- improve print packet layout and route-specific quality outputs
- expand quality-side operation details without breaking the current file schema
