# AMERP 0.0.1-beta Release Notes

Generated from the current branch because no prior git tags exist.

## Highlights

- Local-first Electron ERP baseline for jobshop workflows.
- Jobs, parts, operations, managed attachments, archive/delete archived workflows, and generated job traveler PDFs.
- Xometry traveler, Xometry purchase-order, Subtract purchase-order, Fusion/setup-sheet, and legacy material import paths.
- Materials, material cert attachments, material labels, and part-level material selection.
- Gages/metrology records with calibration history and inspection-tool references.
- Kanban purchasing cards with QR codes, configurable card sizes, AI-assisted URL enrichment, generated images, and card PDFs.
- Part-scoped inspection setup/results, drawing ballooning, inspection report PDFs, X-bar charts, material cert inclusion, and global inspection listing.
- ISO 9001-oriented nonconformance records with part/job linkage, simplified NCR stepper UI, attachments, CSV export, audit log, and NCR PDFs.
- Settings for module visibility, numbering, controlled lists, branding, AI key, print sizes, operation templates, reusable libraries, and ISO 9001 feature toggling.
- Friend/public beta installer scripts for Windows that install prerequisites, dependencies, build the app, create a desktop shortcut, and launch AMERP.

## Release-Readiness Work

- Added production CSP metadata and corrected the source app title to `AMERP`.
- Enabled Electron renderer sandboxing with `contextIsolation: true` and `nodeIntegration: false`.
- Added IPC argument validation for record IDs, option objects, file paths, URLs, revision indices, and destructive/export actions.
- Added repeatable release checks for Node syntax, Python compile, unit tests, production dependency audit, secret scan, production build, and Trivy.
- Added a small Node test suite for filesystem-safe utility behavior.
- Added a high-confidence tracked-file secret scanner.
- Added an isolated Electron user-data override for runtime smoke testing without interfering with an already-running AMERP instance.

## Verification

The current public beta gate is:

```powershell
npm.cmd run release:check
```

This runs syntax checks, Python checks, unit tests, dependency audit, secret scan, production build, and Trivy filesystem scanning.

## Known Limitations

- The app is distributed as a repository ZIP plus installer script, not a signed packaged Windows executable.
- The renderer bundle currently emits a Vite chunk-size warning; this is not blocking for beta but should be addressed later with code splitting.
- OpenAI API key storage remains plain local data-folder JSON for this local-only desktop app.
- Full end-to-end UI regression coverage is not yet automated; perform a clean-machine smoke test before publishing a GitHub release.
