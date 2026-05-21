# Release Audit: AMERP 0.0.1-beta

Generated: 2026-05-11T20:20:49-04:00
Branch: `main`
HEAD: `280b931 Add ISO compliance feature toggle`
Publishing status: no tag, release, push, PR, or GitHub publication was performed.

## Pass / Fail Summary

Result: **Fail - not ready to publish yet**

The branch is close, but it is not release-ready in its current state because the documented release gate, `npm.cmd run release:check`, failed in the default shell due to `trivy` not being visible on `PATH`. The same gate passed after manually adding the WinGet Trivy install directory to `PATH`, so this is an environment/script robustness issue rather than an application vulnerability finding.

Confidence level: **Medium**

Confidence is supported by successful syntax checks, Python compile checks, unit tests, dependency audit, secret scan, production build, Trivy scan, and sandboxed Electron launch smoke. Confidence is limited because the release gate does not pass without a PATH workaround, the clean-machine installer smoke test was not run, and the current working tree contains uncommitted release-readiness changes.

## Blocking Issues

1. **Documented release gate fails in the default shell.** `npm.cmd run release:check` fails at the Trivy step because `trivy` is installed by WinGet but not visible on `PATH` to this shell. With `C:\Users\AJ\AppData\Local\Microsoft\WinGet\Packages\AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe` added to `PATH`, the same command passes. Fix `scripts/release-check.ps1` to locate WinGet-installed Trivy or require/verify a refreshed shell before considering this release-ready.
2. **Current branch has uncommitted/untracked release-readiness changes.** `main` matches `origin/main`, but the working tree contains modified and untracked files. Do not publish until these changes are intentionally committed and pushed.
3. **Clean-machine installer smoke test has not been run.** Public beta distribution depends on `Install-AMERP.cmd`, so a fresh GitHub ZIP install on another Windows machine remains required before publishing.

## Checks Run

| Check | Result | Notes |
|---|---:|---|
| CI config discovery | Pass | No project `.github`, GitLab, Azure Pipelines, or Jenkins config found outside dependencies. Package scripts are the check source of truth. |
| `npm.cmd run release:check` | Fail | Failed only because `trivy` was not visible on `PATH` in the default shell. Earlier steps passed. |
| `npm.cmd run release:check` with WinGet Trivy path added | Pass | Full release gate passed. |
| `npm.cmd run check:syntax` | Pass | Checked 11 Node `.cjs/.mjs` files. |
| `npm.cmd run check:python` | Pass | Compiled 4 Python helper/parser files. |
| `npm.cmd test` | Pass | 4 Node tests passed. |
| `npm.cmd run audit:deps` | Pass | `pnpm audit --prod` found no known vulnerabilities. |
| `npm.cmd run secret:scan` | Pass | No high-confidence secrets found. |
| `npm.cmd run build` | Pass | Vite production build succeeded. |
| `git diff --check` | Pass | No whitespace errors. Git reported line-ending warnings only. |
| Sandboxed Electron launch smoke | Pass | Process stayed alive for 8 seconds with isolated `AMERP_USER_DATA_FOLDER` and temporary data folder. |
| Clean-machine install smoke | Not run | Required before public beta publish. |

Build notes:

- Vite still reports a large chunk warning for the main renderer bundle. This is not a blocker for beta but should be addressed later with code splitting.
- npm reports pnpm-specific `.npmrc` config warnings when npm invokes scripts. This is non-blocking.
- No packaged/signed Electron artifact process was detected. The intended beta path remains GitHub ZIP plus installer script.

## Security / Secrets

Secret scan result: **Pass**

Scans performed:

- `scripts/secret-scan.cjs` against tracked files.
- Manual filename scan for `.env`, private keys, certificates, and credential-like tracked files.
- Manual working-tree regex scan excluding dependencies and build output.
- Git history scan for high-confidence private-key/API-token patterns.
- Trivy filesystem scan with vulnerability and secret scanning enabled.

Findings:

- No tracked `.env`, key, certificate, or private-key files were found.
- No high-confidence committed secrets were found.
- The only broad regex false positive was `scripts/parse_subtract_purchase_orders.py`, where `token` is a local parsing variable.
- Git history scan returned no high-confidence private key, OpenAI key, GitHub token, AWS key, or Slack token matches.

Trivy summary:

- Version: `0.70.0`
- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Unknown: 0
- Target scanned: `pnpm-lock.yaml`

## Electron Security Review

Positive findings:

- Main renderer has `contextIsolation: true`.
- Main renderer has `nodeIntegration: false`.
- Main renderer has `sandbox: true`.
- `index.html` now has a CSP and the source title is `AMERP`.
- IPC is registered through a validation wrapper in `electron/main.cjs`.
- Production loads local `dist/index.html`.
- Dev loading is local to `127.0.0.1`.
- `amerp://local/...` asset serving uses `resolveInside` to constrain paths to the selected data root.
- No auto-updater was detected.

Risks / recommended hardening:

- Hidden print/export windows in `electron/backend/erp.cjs` still use `sandbox: false`, although they keep `contextIsolation: true` and `nodeIntegration: false`. Prefer sandboxing these print windows too if compatible with PDF generation.
- The preload API remains broad because the app exposes many local-first ERP operations. The IPC validation layer reduces risk, but a future capability-based split would be stronger.
- CSP still allows `style-src 'unsafe-inline'` for current styling compatibility.
- Kanban URL import and OpenAI features intentionally fetch remote content. Continue treating fetched content as untrusted and keep these actions user-controlled.
- Export/open operations use `shell.openPath`; backend path checks and managed-copy behavior remain important for safety.

## Product Readiness

Scans performed:

- `TODO|FIXME|HACK|debugger` scan excluding dependencies/build output.
- Search for obvious unfinished strings, mock data markers, debug console calls, prompt/alert usage, and local dev URLs.

Findings:

- No `TODO`, `FIXME`, `HACK`, or `debugger` markers were found.
- No obvious `Not implemented`, `coming soon`, mock data, or dummy data markers were found.
- `window.prompt` / `window.alert` remain in some NCR/report/error flows. This is not a release blocker but is less polished than custom dialogs.
- `127.0.0.1` appears in dev-server tooling and CSP for Vite dev mode; this is expected.
- Release notes are present at `docs/release-notes-0.0.1-beta.md`.

Risky for end users:

- The app should not be published until the installer has been tested from a fresh GitHub ZIP on a clean Windows machine.
- OpenAI API key storage is local data-folder JSON by design; this should remain documented for beta users.
- The current branch state is not committed, so a GitHub release from `origin/main` would not include the release-readiness changes.

## Release Prep

GitHub CLI is installed:

- `gh version 2.92.0`

No draft release was created because:

- The user explicitly said not to publish without approval.
- The documented release gate failed in the default shell.
- The working tree has uncommitted release-readiness changes.

No git tags were found. Release notes should be generated from all current branch commits once the release-readiness changes are committed. A local release-notes draft already exists at `docs/release-notes-0.0.1-beta.md`.

## Recommended Fixes

1. Update `scripts/release-check.ps1` so it can locate WinGet-installed Trivy or clearly instruct the user to restart/refresh PATH before failing.
2. Rerun `npm.cmd run release:check` in a default shell and confirm it passes without manual PATH edits.
3. Run the clean-machine `Install-AMERP.cmd` smoke test from a fresh GitHub ZIP.
4. Commit and push the release-readiness changes intentionally before preparing a GitHub draft release.
5. Consider enabling sandbox on print/export windows.
6. Replace remaining `window.prompt` / `window.alert` flows with app-native dialogs in a later polish pass.
7. Split the large renderer bundle after beta.

## Final Assessment

This branch is **not ready to publish today**. The app code and security checks are close, and the full gate passes with a Trivy PATH workaround, but release readiness requires the documented gate to pass as written, the current changes to be committed, and a clean-machine installer smoke test to pass.
