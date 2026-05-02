# AMERP Architecture

## Intent

AMERP is a local-first ERP for jobshops, geared toward ISO9001-style traceability. The current implementation merges three legacy products into one shell:

- setup/process documentation
- material cert management
- metrology/calibration tracking

## Runtime Shape

- One Electron shell
- One React renderer
- File-backed repositories in the Electron backend
- No server process
- No cloud login dependency

## Source Of Truth

The selected ERP data folder is canonical. Business records are stored as readable JSON files with generated Markdown history companions.

The search index under `cache/` is rebuildable and disposable.

## Modules

### Jobs

- job header and revision block
- one or more parts per job
- ordered operations per part
- operation-level material and instrument links
- print and PDF traveler output

### Materials

- cert/lot identity
- supplier/spec/dimension metadata
- managed attachments
- traceability level
- usage references back to jobs/parts/operations

### Metrology

- instrument master records
- calibration history
- due/overdue state calculation
- standards library
- operation-level inspection tool linkage

### Shared

- libraries
- operation templates
- audit log
- record locks
- legacy importers

## Repository Boundaries

Keep logic grouped by domain behavior, not by UI screen. When expanding the backend, preserve explicit service/repository boundaries so future modules can be added cleanly.

## Important Constraints

- Do not make cache/index files authoritative.
- Do not use hard delete for canonical business records.
- Do not rely on UI-only labels for references.
- Do not bypass the preload bridge from the renderer.
- Do not add server-first assumptions into the current data model.

## Known Gaps

- import coverage is functional but still pragmatic, not exhaustive
- repository logic is large and should be split into domain files as the app grows
- automated tests are still missing
- Electron runtime launch was not verified in this environment when install scripts were blocked
