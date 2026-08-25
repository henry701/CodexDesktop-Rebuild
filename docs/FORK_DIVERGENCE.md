# Fork divergence (henry701 vs Haleclipse)

This repository is a personal fork of
[Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild).
It is not a drop-in CI clone. Local Linux builds work; the inherited
**Sync Upstream & Patch** GitHub workflow does not.

**Status (2026-08-25):** that workflow is parked. The daily `08:00 UTC`
cron is removed from `.github/workflows/sync.yml`, and the workflow is
disabled in the GitHub Actions UI. Re-enable only after the checklist
below is done.

Latest failed scheduled run:
[32827475010](https://github.com/henry701/CodexDesktop-Rebuild/actions/runs/32827475010)
(same pattern 2026-08-20 through 2026-08-25).

## Two different “upstreams”

| Name | What it is | How this fork uses it |
|------|------------|------------------------|
| Haleclipse (`origin`) | Cometix Space git repo | `git fetch origin`; merge/rebase when you want their scripts |
| OpenAI desktop apps | Published macOS ZIP, Windows bundle, Linux ChatGPT `.deb` | `npm run sync` / `npm run sync:linux` |

`sync.yml` syncs **OpenAI app bits**, not Haleclipse git. A green detect
job does not mean the fork’s Linux product path is what Haleclipse CI
builds.

## Product split

Haleclipse Linux still extracts the **macOS Codex ZIP**, patches that
ASAR, and runs electron-forge (`out/make/deb|rpm|zip`). This fork’s
default Linux path extracts OpenAI’s **official ChatGPT `.deb`**, patches
`src/linux-*/_asar`, and zips that Electron/Owl tree
(`out/ChatGPT-linux-*.zip`). Forge remains only as
`npm run build:linux-x64:forge`.

Other fork-only pieces: `USE_SYSTEM_CLI=1` by default on Linux, Cometix
CLI opt-in, Arch `chatgpt-desktop` PKGBUILD, optional
`USE_SHIM_MODEL_PICKER`, `scripts/ensure-electron-dist.js` on
`postinstall` (Haleclipse has none).

## Why the scheduled workflow failed

`check` succeeded. Linux even finished `sync-linux-official` + patch.
Every platform **build** then died, and `release` still ran.

1. **Linux x64/arm64 `Build`.**
   `prepare-linux-official.js` defaults `USE_SYSTEM_CLI=1` and looks up
   `codex` / `rg` on `PATH`. GitHub-hosted runners have neither:

   ```
   [x] USE_SYSTEM_CLI: 'codex' not found on PATH
   ```

   Haleclipse never hits this: it still runs `sync-upstream.js --skip-win`
   and forge. The fork switched the job in `40099ea` without setting
   `USE_SYSTEM_CLI=0`. For portable CI zips, keep the ELFs from the `.deb`.

2. **macOS and Windows `npm ci`.**
   Fork `postinstall` runs `ensure-electron-dist.js`, which only walks
   `~/.cache/electron` (Linux Electron cache). After Node 24
   `extract-zip` leaves a partial `dist/`, the fallback looks for the zip
   and exits 1:

   ```
   [ensure-electron-dist] electron zip not found in cache
   ```

   On macOS the zip is under `~/Library/Caches/electron`; on Windows under
   `%LOCALAPPDATA%\electron\Cache`. Ubuntu `check` / `build-linux` hide
   this because that Linux path exists there. Haleclipse has no such
   `postinstall`.

3. **`release`.**
   `if: always() && needs.check.result == 'success'` is inherited from
   Haleclipse. Builds failed, so `artifacts/` is empty and `ls` exits 2.

`scripts/.versions.json` is also stale (linux last recorded `26.814.41957`;
`package.json` already past that). Combined with `check-update.js --json
--force` (exit 0 even with no new version), every schedule sets
`has_update=true` and pays for a full matrix. Haleclipse uses the same
`--force` detect; it is not fork-specific, but it makes the broken jobs
run daily.

The **manual** workflow `.github/workflows/build.yml` has the same Linux
`USE_SYSTEM_CLI` and mac/win `ensure-electron-dist` holes. It has no
cron, so it was left enabled.

## What still works locally

```bash
nvm use && npm ci
npm run sync:linux
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run build
cd packaging/arch/chatgpt-desktop-bin && updpkgsums && makepkg -si
```

Git sync from Haleclipse is unchanged: `git fetch origin && git merge
origin/master` (or rebase) onto `fork/master`.

## Before turning the cron back on

1. Linux CI jobs: `USE_SYSTEM_CLI=0` (or install `codex` + `rg` on the runner).
2. `ensure-electron-dist.js`: search the Electron cache for the current OS,
   or skip `postinstall` on linux-official-only jobs.
3. `release`: run only when mac/windows/linux builds succeeded.
4. Scheduled detect: drop `--force` unless `workflow_dispatch` sets force.
5. Restore the `schedule:` block in `sync.yml`.
6. `gh workflow enable "Sync Upstream & Patch"` on
   `henry701/CodexDesktop-Rebuild`.
