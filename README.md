# AMERP

AMERP is a local-first `Electron + React` ERP for small jobshops. It is built around job, part, material, inspection, and quality traceability without requiring a server or cloud account.

The selected AMERP data folder is the source of truth. Business records are stored as readable JSON and Markdown files, and generated PDFs/assets are stored beside the records they belong to.

## Handoff Quick Start

For a new Windows computer:

1. Download AMERP from GitHub with `Code -> Download ZIP`.
2. Extract the ZIP.
3. Double-click `Install-AMERP.cmd`.
4. Use the new `AMERP` desktop shortcut.

The installer downloads the latest AMERP from GitHub, installs Node.js LTS and Python through `winget` when they are missing, installs JavaScript and Python dependencies, builds the app, creates a desktop shortcut, and launches AMERP.

For development:

1. Run `Setup-AMERP.cmd` once.
2. Run `Start-Dev.cmd` for the Vite + Electron development app.
3. Run `Build-App.cmd` before sending a build to another computer.

The app prompts for an AMERP data folder on first use. Keep that folder backed up; it contains the real ERP records.

## Run Commands

Preferred Windows entry points:

- `Install-AMERP.cmd` is the friend-friendly installer. It downloads the latest GitHub version into `%USERPROFILE%\AMERP`, installs prerequisites/dependencies, builds, creates a desktop shortcut, and starts the app.
- `Setup-AMERP.cmd` installs dependencies with `pnpm` and builds the renderer.
- `Start-App.cmd` launches the built Electron app from `dist/`.
- `Start-Dev.cmd` launches the development app.
- `Build-App.cmd` rebuilds the renderer bundle.

Package scripts are also available:

- `npm start`
- `npm run dev`
- `npm run build`

The command files prefer a known Codex Node runtime when present, then fall back to installed Node.js on `PATH`. Git is not required for the installer because it downloads the GitHub ZIP directly.

## Current Workspaces

- `Jobs`: job headers, parts, operations, travelers, Xometry/Subtract imports, attachments, and archive workflows.
- `Materials`: material lots, cert attachments, traceability, usage references, and material labels.
- `Gages`: metrology equipment, calibration history, status, and inspection-tool references.
- `Kanban`: purchasing cards with QR codes, AI-assisted URL enrichment, card PDFs, archive/unarchive, and controlled lists.
- `Inspections`: global listing for part-scoped inspection reports.
- `Nonconformance`: ISO 9001-style NCR listing, part-linked NCR editor, attachments, CSV export, and NCR reports.
- `Settings`: numbering, module visibility, customer/options lists, operation templates, reusable libraries, print sizes, branding, AI key, and controlled lists.

## Job And Quality Flow

The primary hierarchy is:

```text
Job -> Part -> ordered Operations
```

Parts can also hold:

- managed part attachments
- selected material lots
- inspection setup and inspection reports
- ballooned drawings
- linked nonconformance records

Inspection reports are versioned under the part inspection data. NCRs are stored in the top-level `nonconformances/` root but always keep stable links back to the originating job and part.

## Imports

Current one-time import flows include:

- Xometry traveler PDFs into an existing job as part shells.
- Xometry purchase-order PDFs into new jobs.
- Subtract Manufacturing purchase-order PDFs into new jobs.
- Fusion/setup-sheet imports into part operations.
- Legacy Materials-Database import through `scripts/import_materials_sqlite.py`.

The importer paths are intentionally separate. Do not merge unrelated parser logic.

## Documents And PDFs

Attachments are managed copies inside the AMERP data folder, not external links. Attachment revision history is preserved, and archived attachments are hidden by default.

Generated PDFs save automatically into the appropriate record folder and open after generation:

- job travelers under `jobs/<job-id>/print/`
- inspection reports under `jobs/<job-id>/parts/<part-id>/inspection/reports/`
- ballooned drawings as part attachments
- NCR reports under `nonconformances/<ncr-id>/print/`
- Kanban cards under `kanban/<card-id>/print/`
- material labels under `materials/<material-id>/print/`

PDF filenames include the record identity, report/card size when relevant, and a date/time stamp.

## Data Folder Layout

Typical data roots include:

- `config/`
- `jobs/<job-id>/job.json`
- `jobs/<job-id>/parts/<part-id>/part.json`
- `jobs/<job-id>/parts/<part-id>/operations/<seq>-<slug>/operation.json`
- `materials/<material-id>/material.json`
- `metrology/instruments/<instrument-id>/`
- `kanban/<card-id>/card.json`
- `nonconformances/<ncr-id>/ncr.json`
- `templates/operations/*.json`
- `libraries/*.json`
- `audit/audit-log.jsonl`
- `cache/search-index.json`
- `locks/*.json`

The `cache/` folder is rebuildable and is not authoritative.

## Optional AI Features

Kanban enrichment and image generation use the OpenAI API only when the user sets an API key in `Settings > AI` and manually runs an AI-assisted action or imports/refreshes a Kanban card URL. The key is local to the preferences JSON for this desktop app.

Core ERP records do not depend on cloud services.

## Validation

Before sharing a build, run:

```powershell
node --check electron/backend/erp.cjs
node --check electron/main.cjs
node --check electron/preload.cjs
python -m py_compile scripts/import_materials_sqlite.py
node node_modules/vite/bin/vite.js build
```

`node_modules/` and `dist/` are intentionally ignored by git. A receiving computer should run `Install-AMERP.cmd` for a full install or `Setup-AMERP.cmd` if the repository is already in its final folder.

## Troubleshooting

- If Electron is missing, run `Install-AMERP.cmd` or `Setup-AMERP.cmd`.
- If Node.js or Python is missing and `winget` cannot install it automatically, install Node.js LTS from https://nodejs.org and Python from https://www.python.org/downloads/, then run `Install-AMERP.cmd` again.
- If built files are missing, run `Build-App.cmd`.
- If the app reports a stale record lock, confirm no other AMERP instance is open, then reopen the app. Lock files live under the selected data folder in `locks/`.
- If a PDF export fails, rebuild with `Build-App.cmd` and retry.
