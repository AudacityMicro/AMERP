# Release Audit: AMERP 0.0.1-beta

Generated: 2026-05-23T17:29:00-04:00
Branch: `main`
Pre-audit HEAD: `6a67186 Improve AI drawing extraction workflow`
Release-readiness commit: `d3e9bd7 Prepare AMERP beta release packaging`
Publishing status: no tag, release, PR, or GitHub publication was performed.

## Pass / Fail Summary

Result: **Pass for approval-gated beta source readiness**

The current branch is ready to commit and push as the source for an unsigned `0.0.1-beta` beta release. Local release checks, dependency audit, secret scan, Trivy, production build, sample PDF parser smoke tests, and Windows NSIS packaging pass.

This audit does **not** publish the release. Before public publication, run the GitHub Actions release workflow, inspect the Windows and macOS artifacts attached to the draft release, and manually approve publishing.

Confidence level: **Medium-High**

Confidence is high for Windows/source readiness because the local gate and Windows package build pass. Confidence remains lower for macOS until the `macos-latest` GitHub Actions job produces and validates DMG/ZIP artifacts.

## Blocking Issues

No local source or Windows packaging blockers remain.

Approval-gated release tasks still required:

1. Run the GitHub Actions release workflow for `v0.0.1-beta` or manually dispatch it for version `0.0.1-beta`.
2. Inspect the draft GitHub Release artifacts before publishing.
3. Validate macOS DMG/ZIP artifacts on a macOS machine.
4. Decide whether the unsigned beta warnings and default Electron icon are acceptable for this beta.

## Fixes Applied During Release Readiness

- Aligned `package.json` to `0.0.1-beta`.
- Added one-click packaging with `electron-builder` for Windows and macOS.
- Added a GitHub Actions release workflow that creates/updates draft releases without automatically publishing.
- Added voluntary packaged-app update checks under `Help -> Check for Updates...`; no background update checks run on startup.
- Kept source installer scripts for ZIP/source installs.
- Migrated Xometry traveler, Xometry PO, and Subtract PO PDF import parsing to JavaScript for packaged builds.
- Kept Python only for the legacy Materials-Database SQLite importer.
- Updated README and AGENTS release/deployment documentation.
- Hardened release checks so Trivy is required and stale build outputs are ignored.

## Checks Run

| Check | Result | Notes |
|---|---:|---|
| CI config discovery | Pass | Found `.github/workflows/release.yml`. |
| `npm.cmd run release:check` | Pass | Runs syntax, Python compile, unit tests, dependency audit, secret scan, production build, and Trivy. |
| `npm.cmd run check:syntax` | Pass | Release gate reported 13 Node files checked. |
| `npm.cmd run check:python` | Pass | Release gate compiled 4 legacy Python helper files. |
| `npm.cmd test` | Pass | Release gate ran 7 Node tests, all passed. |
| `npm.cmd run audit:deps` | Pass | `pnpm audit --prod` found no known vulnerabilities. |
| `npm.cmd run secret:scan` | Pass | No high-confidence secrets found in current tracked files. |
| `npm.cmd run build` | Pass | Vite build succeeded; known large chunk warning remains. |
| `npm.cmd run dist:win` | Pass | Built unsigned NSIS installer and update metadata under ignored `release/`. |
| `npm.cmd run dist:mac` | Not run locally | Requires macOS; covered by GitHub Actions workflow. |
| Parser smoke tests | Pass | JS parsers read sample Xometry travelers, Xometry POs, Subtract PO, and rejected the invalid traveler download file. |
| Lint/typecheck | Not applicable | No lint or TypeScript typecheck scripts are configured. |

Generated local Windows artifacts:

- `release/AMERP-0.0.1-beta-win-x64-Setup.exe` - 215,617,048 bytes
- `release/AMERP-0.0.1-beta-win-x64-Setup.exe.blockmap`
- `release/latest.yml`

These artifacts are ignored by git and were not published.

## Security And Secrets

### Secret Scans

- Current tracked-file secret scan: **Pass**
- Sensitive filename scan on tracked files: **Pass**
- Sensitive filename scan in git history: **Pass**
- Git history content scan for high-confidence token/key patterns: **Pass**
- Trivy filesystem scan: **Pass**

Trivy severity summary:

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| Unknown | 0 |

### Electron Security Review

- Main window uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Preload exposes a fixed `window.amerp` API and does not expose raw `ipcRenderer`.
- Main-process IPC uses `registerIpc()` plus argument validation for IDs, paths, URLs, option objects, delete/archive/export calls, and object sizes before backend dispatch.
- Custom `amerp://local/...` protocol resolves through `resolveInside(dataRoot, relativePath)`, constraining asset reads to the selected AMERP data root.
- CSP is present in `index.html`; it blocks objects and forms. It intentionally allows local/dev connections, `amerp:`, file/blob/data assets, and `https:` image/connect paths needed for OpenAI/vendor workflows.
- Updater behavior is voluntary only through `Help -> Check for Updates...`; no startup checks were found. `autoDownload` and `autoInstallOnAppQuit` are disabled.
- macOS unsigned beta update flow opens the GitHub release page instead of pretending automatic installation is reliable.

Security risks to track:

- Hidden vendor URL rendering loads arbitrary product pages in a BrowserWindow with JavaScript enabled and `sandbox: false`, though `nodeIntegration` remains default-off and there is no preload. This is manual/user-initiated and used for scraping page HTML, but sandboxing or a stricter isolated session should be considered before a wider public release.
- Print/export BrowserWindows use local app routes with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: false`. This is lower risk because they load local routes, but sandbox compatibility should be revisited.
- The beta is unsigned. Users will see OS trust warnings, and update integrity depends on electron-builder metadata plus GitHub release integrity rather than code signing.
- `gh` is installed but not authenticated in this environment, so a local draft release could not be created with the GitHub CLI.

## Product Readiness

Product scan results:

- No `TODO`, `FIXME`, `HACK`, `debugger`, `not implemented`, `coming soon`, dummy data, or mock-data markers were found outside ignored/generated folders.
- Placeholder matches were normal UI input placeholders and QR fallback classes.
- Console logging matches were normal CLI script success output; no user-facing debug console dependency was found.

Remaining beta risks:

- Windows builder reports the default Electron icon is used. This is not a functional blocker but should be fixed before a polished public beta.
- App and installer are unsigned. This is acceptable only if explicitly presented as an unsigned beta.
- The legacy material SQLite importer still uses Python; core packaged app launch and Xometry/Subtract PDF imports no longer require Python.
- Clean-machine smoke testing was not performed in this local audit run.

## Release Prep

No previous `v*` tag exists, so release notes should be generated from all commits on the branch. Current commit list:

- Initial process documentation app (`58e8d65`)
- Fix desktop launch and PDF pagination (`dcb5115`)
- Build AMERP phase 1 baseline (`75c856a`)
- Fix local run scripts (`0bb5303`)
- Refine materials workflow and add autosave (`c227fb8`)
- Disable alloy filter until a material family is selected (`d12be2a`)
- Move operation templates into settings (`480b478`)
- Tighten importer coverage and field mapping (`b75abfe`)
- Refine operation layout and tooling visibility (`75cfa4d`)
- Redesign Kanban print layouts and filters (`feeec25`)
- Fix AMERP startup after traveler print refactor (`e5e386f`)
- Align traveler operations with part-based print layout (`3d68ec8`)
- Add settings-controlled module visibility (`a30e59e`)
- Preserve local-only ERP architecture (`c273e33`)
- Split inspection setup and results workflows (`7261cd5`)
- Split inspection setup and results pages (`5beff55`)
- Refine importer field mapping and coverage (`acba6c1`)
- Refactor NCR report layout to match inspection format (`6cd8aa5`)
- Prepare AMERP handoff build (`990accd`)
- Add Windows installer for AMERP handoff (`91f6a65`)
- Add ISO compliance feature toggle (`280b931`)
- Improve AI drawing extraction workflow (`6a67186`)

Draft GitHub release status:

- `gh version`: available.
- `gh auth status`: not logged in.
- Draft release was **not created** because remote release publication requires approval and authentication.

## Recommended Next Steps

1. Push the release-readiness commit to GitHub.
2. Run the GitHub Actions release workflow to produce Windows and macOS artifacts in a draft release.
3. Inspect and smoke-test the draft release artifacts.
4. Publish the GitHub Release only after explicit approval.
5. Add app icons and code signing before a non-beta public distribution.

## Decision

The branch is **ready to commit and push as the 0.0.1-beta release candidate source**.

Do not publish the release until the draft artifacts have been generated, inspected, and explicitly approved.
