# Codex Desktop Rebuild

> **Canonical upstream:** [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild)
> (Cometix Space) is the cross-platform rebuild project most users should start from.
>
> **This repository** ([henry701/CodexDesktop-Rebuild](https://github.com/henry701/CodexDesktop-Rebuild))
> is a personal fork. It is **not** focused on upstreaming changes. Haleclipse/upstream are
> welcome to borrow ideas and reimplement them independently.

Cross-platform Electron build for OpenAI Codex / ChatGPT Desktop.

## This fork (henry701)

The fork tracks OpenAI's published desktop apps with as little extra surface
area as possible. Linux no longer rebuilds the macOS ASAR through electron-forge:
it patches the official Linux ChatGPT `.deb` and reuses that Electron/Owl runtime.
Haleclipse CI still builds Codex-from-macOS-ZIP; this fork’s default Linux
product and GitHub Actions matrix are not the same. See
[docs/FORK_DIVERGENCE.md](docs/FORK_DIVERGENCE.md).

| Principle | What it means here |
|---|---|
| **Stay close to upstream** | `npm run sync:linux` extracts OpenAI's [Linux ChatGPT `.deb`](https://learn.chatgpt.com/docs/linux/linux-app). `npm run sync` still pulls macOS/Windows bundles. |
| **Minimize supply-chain risk** | Third-party CLI redistribution (`@cometix/codex` via npm) is **opt-in only** (`USE_COMETIX_CODEX=1`). The Debian postinst is never run (it would add OpenAI's apt repo). |
| **System `codex` + `rg`** | Linux defaults to `USE_SYSTEM_CLI=1`: the zip copies `codex` and `rg` from **your** `PATH`. `USE_SYSTEM_CLI=0` keeps the official Linux ELFs already in the `.deb`. |
| **Linux `codex-code-mode-host`** | Prefer PATH (`/usr/bin/codex-code-mode-host` from `openai-codex`), then vendor cache, then the ELF shipped in the official Linux bundle, then GitHub musl fallback. Override with `CODEX_CODE_MODE_HOST_PATH`. |
| **Optional BYOK picker** | `USE_SHIM_MODEL_PICKER=1` patches the ASAR so [henry701/codex-shim](https://github.com/henry701/codex-shim) catalog models appear in the picker (off by default). |
| **Arch packaging** | `packaging/arch/chatgpt-desktop-bin/` wraps the patched zip as `chatgpt-desktop` (`/usr/lib/chatgpt`). Coexists with `codex-desktop` until you uninstall the old package. |

**Typical fork workflow (Linux x64)**

```bash
nvm use && npm ci
npm run sync:linux                  # official chatgpt_amd64.deb → src/linux-x64/{bundle,_asar}
# Ensure codex + rg on PATH (e.g. pacman/AUR openai-codex package)
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run build                       # official Linux ChatGPT zip (no forge)
cd packaging/arch/chatgpt-desktop-bin && updpkgsums && makepkg -si
# Optional: npm run prune:artifacts   (KEEP_VERSIONS=3 default)
```

Pair with `codex-shim sync-desktop` if you route Desktop through BYOK models.

OpenAI's Linux preview does not include Computer Use yet; this fork still applies
`patch-plugin-auth.js` so those gates stay on if a later drop enables them.

---

## Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS    | x64, arm64   | ✅     |
| Windows  | x64          | ✅     |
| Linux    | x64, arm64   | ✅     |

## Prerequisites

- **Node.js 24** — matches upstream CI. `extract-zip` can leave a partial Electron `dist/` on Node 24+; `scripts/ensure-electron-dist.js` re-extracts with system `unzip` and patches `@electron/packager` before forge runs. Use [nvm](https://github.com/nvm-sh/nvm):

  ```bash
  nvm install    # reads .nvmrc
  nvm use
  ```

- **Linux builds** — `dpkg-deb` to extract the official `.deb`. Default `USE_SYSTEM_CLI`
  still wants `codex` and `rg` on `PATH`. The forge/`dpkg`/`fakeroot` path is
  `npm run build:linux-x64:forge` only (legacy mac-ASAR rebuild).
- **Upstream app bundle** — `npm run sync:linux` before the first Linux build;
  `npm run sync` for macOS/Windows extracts.

## Build

```bash
npm ci

# Official Linux ChatGPT (this fork's default; not the legacy Codex forge rebuild)
npm run build

# Other platforms (macOS/Windows still use the Codex/mac ASAR extract)
npm run build:mac-x64
npm run build:mac-arm64
npm run build:win-x64
npm run build:linux-arm64

# Build all platforms
npm run build:all
```

### Linux workflow

Linux packages start from OpenAI's official ChatGPT `.deb` (same version as macOS).
Patches land on `src/linux-x64/_asar/`; `prepare-linux-official.js` packs that ASAR
back into the official `ChatGPT` Electron tree. No forge, no macOS Mach-O swap.

```bash
nvm use
npm ci
npm run sync:linux                  # chatgpt_amd64.deb → src/linux-x64/
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run build                       # out/ChatGPT-linux-x64-<ver>.zip
```

For arm64: `npm run sync:linux-arm64`, `patch:linux-arm64`, `build:linux-arm64`.

Docs: [ChatGPT desktop app for Linux](https://learn.chatgpt.com/docs/linux/linux-app).
OpenAI supports Ubuntu 24.04/26.04, Debian 13, and Fedora 43/44; Arch is best-effort
via this PKGBUILD. Native Wayland is experimental; the launcher defaults to XWayland.

## Build flags

Flags are read from environment variables or CLI args on `prepare-src`, `patch-all`, and `start-dev`. See `scripts/build-flags.js` for details.

### `USE_COMETIX_CODEX` (default: **off**)

Replace bundled `codex` / `rg` with prebuilt binaries from the third-party npm package [`@cometix/codex`](https://www.npmjs.com/package/@cometix/codex) ([Haleclipse/codex](https://github.com/Haleclipse/codex)).

**This fork keeps this off by default.** Opt-in only: binaries are fetched via `npm pack`
at build time and are not built or audited in this repo. Prefer `USE_SYSTEM_CLI` when you
already install Codex from your distro or OpenAI's release channel.

```bash
USE_COMETIX_CODEX=1 npm run build:linux-x64
# or
npm run build:linux-x64:cometix
npm run patch:linux-x64:cometix
```

Optional version pin: `USE_COMETIX_CODEX_VERSION=0.135.0-cometix`

When Cometix is enabled, the archive-delete patch in `patch-archive-delete.js` also runs (required for that CLI).

### `USE_SYSTEM_CLI` (Linux default: **on** — **fork preference**)

Bundle `codex` and `rg` from the host `PATH` instead of the official Linux `.deb`
ELFs (or Cometix npm tarballs). Rebuild Desktop after upgrading your system
`codex` package. Cometix takes precedence when both are enabled.

```bash
USE_SYSTEM_CLI=0 npm run build:linux-x64   # keep official Linux bundled ELFs
npm run build:linux-x64:upstream           # same, via npm script
```

Optional explicit paths:

```bash
CODEX_CLI_PATH=/usr/bin/codex RG_CLI_PATH=/usr/bin/rg npm run build:linux-x64
```

CLI equivalents: `--use-system-cli`, `--no-system-cli`, `--use-cometix-codex`

### Linux CLI resolution order

1. Cometix (`USE_COMETIX_CODEX=1`)
2. System PATH (`USE_SYSTEM_CLI=1`, default on Linux)
3. Official Linux ChatGPT `.deb` ELFs (when `USE_SYSTEM_CLI=0`)

## npm scripts (Linux variants)

| Script | Description |
|--------|-------------|
| `build` | **Default:** same as `build:linux-x64` (official ChatGPT, not Codex forge) |
| `sync:linux` | Download/extract official `chatgpt_amd64.deb` |
| `sync:linux-arm64` | Same for `chatgpt_arm64.deb` |
| `patch:linux-x64` | Patch `src/linux-x64/_asar` |
| `patch:linux-arm64` | Patch `src/linux-arm64/_asar` |
| `build:linux-x64` | Repack official ChatGPT tree + zip (system CLI by default) |
| `build:linux-x64:upstream` | Keep official Linux CLI ELFs |
| `build:linux-x64:cometix` | Cometix npm CLI binaries |
| `build:linux-x64:forge` | Legacy mac-ASAR + electron-forge rebuild |
| `patch:linux-x64:shim-picker` | Desktop model picker for codex-shim catalog (`USE_SHIM_MODEL_PICKER=1`) |
| `patch:linux-arm64:shim-picker` | Same for arm64 |

### `USE_SHIM_MODEL_PICKER` (default: **off**)

ASAR patch for [**codex-shim**](https://github.com/henry701/codex-shim) integration (Statsig allowlist bypass + sidebar
`modelProviders` filter). **Unlimited model list (single `limit:1e4` fetch) is always applied** via
`patch-model-list-pagination.js` in `BASE_PATCHES` (upstream defaults to 100; 26.825 uses picker hook
`e?.limit??100` / pager `CDr=100`). **Picker scroller height** (`max-h-[250px]` → `480px`) and **Electron
row padding** (`--menu-item-height` / `--menu-item-padding`, otherwise `0px`) are always applied via
`patch-model-picker-height.js`. 26.825 allowlist needles: `n.has(a.model)` / `a.useHiddenModels`.
Linux auto-update is disabled via `shouldIncludeLinuxPackageUpdater` in `patch-updater.js`. Pets stay
enabled (`patch-linux-wayland-keyboard.js` is not in `BASE_PATCHES`).

Verify with:
```bash
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run patch:linux-x64:shim-picker   # convenience alias
node scripts/patch-model-list-pagination.js linux-x64 --check
node scripts/verify-shim-picker-patch.js linux-x64
```

### Menu bar suppression (Linux)

Always-on `BASE_PATCH` (`patch-remove-menu.js`) that prevents the GTK/KDE global menu bar
from appearing on Linux while preserving in-app File/Edit/View dropdowns.

Upstream Codex Desktop only calls `win.removeMenu()` on Windows. On Linux (and most non-macOS
platforms), `Menu.setApplicationMenu()` hands the menu to the OS via D-Bus — the resulting
GTK/KDE menu bar is always visible and `setMenu(null)` per-window cannot override it.

The patch makes three changes to the main-process bundle:

1. **`removeMenu()` → `setMenu(null)`** — extends upstream's win32-only guard to all
   non-macOS platforms.
2. **Store menu instead of setting it on Linux** — replaces
   `a.Menu.setApplicationMenu(st)` with `process.platform==='linux' ? (globalThis.__cm=st)
   : a.Menu.setApplicationMenu(st)`. On Linux the menu goes into a global variable; on
   macOS/Windows behavior is unchanged.
3. **Fallback in IPC handler** — wraps `a.Menu.getApplicationMenu()` with
   `(globalThis.__cm || a.Menu.getApplicationMenu())` so the in-app menu popup finds the
   stored menu on Linux and falls through to the real application menu elsewhere.

Verify with:
```bash
node scripts/patch-remove-menu.js linux-x64 --check
```

### Linux window chrome (`patch-linux-chrome.js`)

Always-on `BASE_PATCH` for native Wayland on KDE:

1. **Integrated titlebar** — primary window on Linux uses `titleBarStyle: hidden` +
   `titleBarOverlay` (same as Windows) instead of SSD `default`.
2. **Opaque surfaces** — Linux gets the same `backgroundColor` path as win32/darwin when
   opaque windows are enabled, including `M2`/`N2` gating for `applyWindowBackdrop` (sidebar).

Pair with the Arch launcher: **XWayland default** on Wayland sessions (`--ozone-platform=x11`
+ `--disable-gpu-compositing`, commit `fb601df`) for stable sidebar repaint. Native Wayland:
`CODEX_OZONE_PLATFORM=wayland` (better taskbar/drag; needs `patch-linux-chrome.js` for opaque
sidebar). Opt out of compositing disable: `CODEX_DISABLE_GPU=0`.

Verify with:
```bash
node scripts/patch-linux-chrome.js linux-x64 --check
```

The official Linux ASAR already uses a Linux titlebar overlay in 26.814; opaque-surface
helpers may still omit `linux`. The patch is idempotent (`already` vs `applied`).

## Other build notes

- **`better-sqlite3`** — pinned to `vendor/better-sqlite3-12.10.0-electron42.tgz` until upstream ships Electron 42 V8 API support ([WiseLibs/better-sqlite3#1475](https://github.com/WiseLibs/better-sqlite3/pull/1475)).
- **`electron`** — pinned to **42.3.0** (exact), matching the official Linux ChatGPT bundle (`/usr/lib/chatgpt/version`) and the macOS extract.
- **`ensure-electron-dist.js`** — Node 24+ workaround: full Electron runtime via system `unzip` (runs on `postinstall` and before forge package/make).
- **RPM packages** — skipped when no RPM database is present (typical on Arch). Force with `FORGE_LINUX_RPM=1` after initializing an RPM db (e.g. `sudo rpm --initdb`).

## Install on Arch Linux

A local PKGBUILD wraps the patched official Linux zip (OpenAI's Electron/Owl
runtime, **no system Electron**). Pacman name is **`chatgpt-desktop`**
(`/usr/lib/chatgpt`). The legacy forge package remains at
`packaging/arch/codex-desktop-bin` (`codex-desktop`, `/usr/lib/codex-desktop`);
both stay buildable and can be installed side by side. Default Linux install is
ChatGPT only.

```bash
# codex + rg must resolve on PATH before build (e.g. openai-codex from AUR/pacman)
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run build
cd packaging/arch/chatgpt-desktop-bin
updpkgsums
makepkg -si
```

`npm run prune:artifacts` keeps the newest **3** app versions of
`ChatGPT-linux-x64-*.zip` / `chatgpt-desktop-*-x86_64.pkg.tar.zst`.

To rebuild without reinstalling:

```bash
makepkg -f
sudo pacman -U --noconfirm chatgpt-desktop-*.pkg.tar.zst
```

Do **not** run `yay -Bi .` with **cleanBuild** enabled inside this repo.

Installs:

| Path | Purpose |
|------|---------|
| `/usr/lib/chatgpt/` | Official Electron/Owl bundle with patched `app.asar` |
| `/usr/bin/chatgpt` | Launcher (XWayland + compositing defaults) |
| `/usr/share/applications/chatgpt.desktop` | Application menu entry |
| `/usr/share/icons/hicolor/256x256/apps/chatgpt.png` | Icon |

**Recommended alongside:** [henry701/codex-shim](https://github.com/henry701/codex-shim).

Launch `chatgpt`. Default on Plasma Wayland is XWayland
(`--ozone-platform=x11` + `--disable-gpu-compositing`). Native Wayland:
`CHATGPT_OZONE_PLATFORM=wayland` (or `CODEX_OZONE_PLATFORM`).

| Goal | Command |
|------|---------|
| XWayland (default on Plasma) | `chatgpt` |
| Native Wayland | `CHATGPT_OZONE_PLATFORM=wayland chatgpt` |
| Enable GPU compositing | `CHATGPT_DISABLE_GPU=0 chatgpt` |

## Development

```bash
npm run dev
```

## Project Structure

```
├── src/
│   ├── linux-x64/       # Official Linux ChatGPT extract (bundle/ + _asar/)
│   ├── linux-arm64/     # Official Linux arm64 extract
│   ├── mac-x64/         # Upstream macOS x64 extract
│   ├── mac-arm64/       # Upstream macOS arm64 extract
│   ├── win/             # Upstream Windows extract
│   ├── .vite/build/     # Main process (Electron)
│   └── webview/         # Renderer (Frontend)
├── resources/
│   ├── electron.icns    # App icon
│   └── notification.wav # Sound
├── scripts/
│   ├── build-flags.js   # USE_COMETIX_CODEX / USE_SYSTEM_CLI
│   ├── cometix-vendor.js
│   ├── system-cli.js
│   ├── ensure-electron-dist.js
│   ├── linux-official.js / sync-linux-official.js / prepare-linux-official.js
│   ├── patch-all.js      # Runs all BASE_PATCHES in sequence
│   ├── patch-remove-menu.js  # Suppress GTK/KDE menu bar on Linux
│   ├── ...
├── vendor/              # better-sqlite3 Electron 42 tarball
├── packaging/
│   └── arch/chatgpt-desktop-bin/  # Arch PKGBUILD (official Linux zip → pacman)
├── forge.config.js      # Electron Forge config
└── package.json
```

## CI/CD

**Sync Upstream & Patch is parked** (2026-08-25). The daily cron is off;
the workflow is disabled in the Actions UI until the fork-only Linux /
Electron-cache failures are fixed. Details and a re-enable checklist:
[docs/FORK_DIVERGENCE.md](docs/FORK_DIVERGENCE.md).

| Workflow | Trigger | State |
|----------|---------|--------|
| `sync.yml` (OpenAI app sync + patch + build + draft release) | `workflow_dispatch` only | Disabled in UI |
| `build.yml` (same matrix, no detect/release) | `workflow_dispatch` | Enabled; same Linux/mac/win holes |

CI Node is 24 (`.nvmrc`). Local Linux builds use `ensure-electron-dist`;
that script’s cache lookup is Linux-only, which is why macOS/Windows
runners fail `npm ci`.

## Git remotes

| Remote | Repository | Role |
|--------|------------|------|
| `fork` | `henry701/CodexDesktop-Rebuild` | Primary push target for this fork |
| `origin` | `Haleclipse/CodexDesktop-Rebuild` | Canonical upstream (Cometix Space) |

`master` tracks `fork/master`. Push with `git push fork master`; merge upstream with
`git fetch origin && git merge origin/master` (or rebase) when pulling Cometix changes.

## Contributing

**Upstream:** general cross-platform rebuild improvements belong in
[Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild).

**This fork:** issues/PRs here are for personal workflow (official Linux ChatGPT
pipeline, system CLI defaults, Arch packaging, shim-picker). No expectation of
upstream cherry-picks.

## Credits

**© OpenAI · Cometix Space**

- [OpenAI Codex](https://github.com/openai/codex) - Original Codex CLI (Apache-2.0)
- [Cometix Space](https://github.com/Haleclipse) - Cross-platform rebuild & [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain
- [henry701/codex-shim](https://github.com/henry701/codex-shim) - Responses API shim for multi-model Codex Desktop routing (fork of [0xSero/codex-shim](https://github.com/0xSero/codex-shim))

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
