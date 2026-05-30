# AMERP

AMERP is a local-first `Electron + React` ERP for small jobshops. It is built around job, part, material, inspection, and quality traceability without requiring a server or cloud account.

The selected AMERP data folder is the source of truth. Business records are stored as readable JSON and Markdown files, and generated PDFs/assets are stored beside the records they belong to.

## Handoff Quick Start

Recommended public-beta path:

1. Open the latest published GitHub Release.
2. Download the Windows `AMERP-...-Setup.exe` or macOS `AMERP-...dmg` / `.zip`.
3. Run the installer or open the DMG.
4. Launch `AMERP` and choose an AMERP data folder on first use.

The packaged app keeps ERP records outside the install folder, so updating AMERP does not overwrite business data.

For a new Windows computer:

1. Download AMERP from GitHub with `Code -> Download ZIP`.
2. Extract the ZIP.
3. Double-click `Install-AMERP.cmd`.
4. Use the new `AMERP` desktop shortcut.

The installer downloads the latest AMERP from GitHub, installs Node.js LTS and Python through `winget` when they are missing, installs JavaScript and legacy Python dependencies, builds the app, creates a desktop shortcut, and launches AMERP.

The installer is safe to rerun. It refreshes the application folder and leaves the separate AMERP data folder alone.

Packaged beta builds parse Xometry/Subtract PDF imports in JavaScript. The source installer still installs Python because the legacy Materials-Database SQLite import helper uses a Python script.

## Packaged Beta Releases

Packaged installers are produced by GitHub Actions from `.github/workflows/release.yml`.

- Windows builds an unsigned NSIS one-click installer.
- macOS builds separate ad-hoc-signed, unnotarized x64 and arm64 DMG and ZIP artifacts.
- Linux builds unsigned AppImage and DEB artifacts.
- Release jobs attach artifacts and update metadata to a draft GitHub Release.
- Draft releases must be reviewed and manually published.
- No app update check runs automatically on startup.

In an installed packaged build, use `Help -> Check for Updates...` to voluntarily check GitHub Releases. The app shows release details before any download. macOS unsigned beta builds open the GitHub release page instead of pretending automatic installation is reliable. Source/developer runs report that packaged updates are only available in installed release builds.

## Public Beta Checklist

Before sharing a public beta:

1. Run `npm run release:check`.
2. Confirm Trivy completes with zero vulnerabilities for `pnpm-lock.yaml`.
3. Confirm the production build completes and only the known Vite chunk-size warning remains.
4. Install from a fresh GitHub ZIP with `Install-AMERP.cmd` on a clean Windows machine.
   Or run the automated Windows/macOS/Linux smoke workflows and installer smoke scripts.
5. Launch AMERP, choose a new data folder, create a job, add a part, and export a job traveler PDF.
6. Create or open one material, Kanban card, inspection report, and NCR enough to confirm major navigation and PDF export paths.
7. Reopen AMERP and confirm the data persists.
8. Do not publish a GitHub release, tag, or package until the release audit says the branch is ready.

For development on any OS:

1. Run `pnpm install --frozen-lockfile` or `npm install`.
2. Run `npm run dev` for the Vite + Electron development app.
3. Run `npm run build` before sending a source build to another computer.

Windows convenience wrappers remain available:

- `Setup-AMERP.cmd`
- `Start-Dev.cmd`
- `Build-App.cmd`

The app prompts for an AMERP data folder on first use. Keep that folder backed up; it contains the real ERP records.

## Run Commands

Preferred Windows entry points:

- `Install-AMERP.cmd` is the friend-friendly installer. It downloads the latest GitHub version into `%USERPROFILE%\AMERP`, installs prerequisites/dependencies, builds, creates a desktop shortcut, and starts the app.
- `Setup-AMERP.cmd` installs dependencies with `pnpm` and builds the renderer.
- `Start-App.cmd` launches the built Electron app from `dist/`.
- `Start-Dev.cmd` launches the development app.
- `Build-App.cmd` rebuilds the renderer bundle.
- `scripts/windows-install-smoke.ps1` automates clean-Windows source and packaged installer smoke tests using isolated data/user-data folders.
- `scripts/macos-install-smoke.sh` automates macOS DMG/ZIP packaged app smoke tests using isolated data/user-data folders.
- `scripts/linux-install-smoke.sh` automates Linux AppImage/DEB packaged app smoke tests using isolated data/user-data folders.

Package scripts are also available:

- `npm start`
- `npm run dev`
- `npm run check:syntax`
- `npm run check:python`
- `npm test`
- `npm run build`
- `npm run pack`
- `npm run dist:win`
- `npm run dist:mac`
- `npm run dist:linux`
- `npm run release:artifacts`

The command files prefer a known Codex Node runtime when present, then fall back to installed Node.js on `PATH`. Git is not required for the installer because it downloads the GitHub ZIP directly.

## Current Workspaces

- `Jobs`: job headers, parts, operations, travelers, Xometry/Subtract imports, attachments, and archive workflows.
- `Materials`: material lots, cert attachments, traceability, usage references, and material labels.
- `Gages`: metrology equipment, calibration history, status, and inspection-tool references.
- `Kanban`: purchasing cards with QR codes, AI-assisted URL enrichment, card PDFs, archive/unarchive, and controlled lists.
- `Inspections`: global listing for part-scoped inspection reports.
- `Nonconformance`: ISO 9001-style NCR listing, part-linked NCR editor, attachments, CSV export, and NCR reports.
- `Settings`: numbering, module visibility, customer/options lists, operation templates, reusable libraries, print sizes, branding, AI key, and controlled lists.

`Settings > System` also includes an `ISO 9001 compliance features` toggle. Turning it off hides compliance-specific inspection/NCR navigation and audit-heavy quality fields without deleting existing records.

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
- Kanban product URL lists from CSV files, and complete Kanban card records from CSV files.
- Legacy Materials-Database import through `scripts/import_materials_sqlite.py`.

The importer paths are intentionally separate. Do not merge unrelated parser logic.

The expected full-card Kanban CSV format is documented by `docs/samples/kanban-card-import-sample.csv`.

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

Kanban enrichment, image generation, and drawing inspection extraction use the OpenAI API only when the user sets an API key in `Settings > AI` and manually runs an AI-assisted action. The key is stored in the selected AMERP data folder at `config/ai-settings.json`.

Core ERP records do not depend on cloud services.

## Validation

Before sharing a build, run:

```bash
npm run release:check
```

Before publishing a packaged beta, also confirm the GitHub Actions draft release completes on Windows, macOS, and Linux, then manually inspect the draft release assets before publishing.

For faster local iteration, the release check is split into:

```bash
npm run check:syntax
npm run check:python
npm test
npm run audit:deps
npm run secret:scan
npm run build
```

Windows-only installer smoke checks:

```powershell
npm run smoke:install:source:win
# or after building a Windows installer:
npm run smoke:install:packaged:win -- -InstallerPath .\release\AMERP-...-Setup.exe
```

On macOS, after building macOS artifacts:

```bash
npm run smoke:install:packaged:mac -- --artifact ./release/AMERP-...-mac-arm64.zip
# or for Intel Macs:
npm run smoke:install:packaged:mac -- --artifact ./release/AMERP-...-mac-x64.zip
```

On Linux, after building Linux artifacts:

```bash
npm run smoke:install:packaged:linux -- --artifact ./release/AMERP-...-linux-x86_64.AppImage
```

`node_modules/` and `dist/` are intentionally ignored by git. A receiving Windows computer should run `Install-AMERP.cmd` for a full source install or `Setup-AMERP.cmd` if the repository is already in its final folder. Linux and macOS users should install from packaged release artifacts, or run the cross-platform package scripts from a source checkout.

## Troubleshooting

- If Electron is missing, run `Install-AMERP.cmd` or `Setup-AMERP.cmd`.
- If Node.js or Python is missing and `winget` cannot install it automatically, install Node.js LTS from https://nodejs.org and Python from https://www.python.org/downloads/, then run `Install-AMERP.cmd` again. Python is only needed for the legacy material database importer.
- If built files are missing, run `Build-App.cmd`.
- If the app reports a stale record lock, confirm no other AMERP instance is open, then reopen the app. Lock files live under the selected data folder in `locks/`.
- If a PDF export fails, rebuild with `Build-App.cmd` and retry.
