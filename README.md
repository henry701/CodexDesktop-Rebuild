# Codex Desktop Rebuild

> **Canonical upstream:** [Haleclipse/CodexDesktop-Rebuild](https://github.com/Haleclipse/CodexDesktop-Rebuild)
> (Cometix Space) is the cross-platform rebuild project most users should start from.
>
> **This repository** ([henry701/CodexDesktop-Rebuild](https://github.com/henry701/CodexDesktop-Rebuild))
> is a personal fork. It is **not** focused on upstreaming changes. Haleclipse/upstream are
> welcome to borrow ideas and reimplement them independently.

Cross-platform Electron build for OpenAI Codex Desktop App.

## This fork (henry701)

The fork exists to track **OpenAI Codex Desktop** releases with **as little extra surface
area as possible**. Updates are expected to be frequent (new upstream app drops), so the
build pipeline favors **trust boundaries you already control** over third-party binary
channels.

| Principle | What it means here |
|---|---|
| **Stay close to upstream** | `npm run sync` pulls OpenAI's published macOS/Windows app bundles; Linux builds patch that ASAR locally instead of inventing a parallel app tree. |
| **Minimize supply-chain risk** | Third-party CLI redistribution (`@cometix/codex` via npm) is **opt-in only** (`USE_COMETIX_CODEX=1`). Default Linux builds **do not** download unaudited binaries at package time. |
| **System `codex` + `rg`** | Linux defaults to `USE_SYSTEM_CLI=1`: the build copies `codex` and `rg` from **your** `PATH` (or `CODEX_CLI_PATH` / `RG_CLI_PATH`) into the Electron bundle. You rebuild Desktop when you upgrade the system Codex CLI — one binary, one update channel. |
| **Optional BYOK picker** | `USE_SHIM_MODEL_PICKER=1` patches the ASAR so [henry701/codex-shim](https://github.com/henry701/codex-shim) catalog models appear in Desktop's picker (off by default). |
| **Arch packaging** | `packaging/arch/codex-desktop-bin/` wraps the prebuilt zip for local `makepkg -si` installs. |

**Typical fork workflow (Linux x64)**

```bash
nvm use && npm ci
npm run sync -- --skip-win          # pulls upstream; prunes /tmp/codex-sync + old packaging zips/pkgs
# Ensure codex + rg on PATH (e.g. pacman/AUR openai-codex package)
USE_SHIM_MODEL_PICKER=1 npm run build:linux-x64
cp out/make/zip/linux/x64/Codex-linux-x64-*.zip packaging/arch/codex-desktop-bin/
cd packaging/arch/codex-desktop-bin && makepkg -si
# Optional: npm run prune:artifacts   (KEEP_VERSIONS=3 default; also runs at end of sync)
```

Pair with `codex-shim sync-desktop` if you route Desktop through BYOK models.

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

- **Linux builds** — `codex` and `rg` on `PATH` (default `USE_SYSTEM_CLI`; this fork's
  preferred path), plus `dpkg` and `fakeroot` for `.deb` artifacts. Install or upgrade
  your system Codex CLI before rebuilding so the bundled copy stays current.
- **Upstream app bundle** — run `npm run sync` before the first build to fetch platform extracts into `src/`.

## Build

```bash
npm ci

# Build for current platform
npm run build

# Build for specific platform
npm run build:mac-x64
npm run build:mac-arm64
npm run build:win-x64
npm run build:linux-x64
npm run build:linux-arm64

# Build all platforms
npm run build:all
```

### Linux workflow

Linux packages are built from the macOS upstream ASAR (patched locally), not a native Linux upstream extract:

```bash
nvm use
npm ci
npm run sync -- --skip-win          # fetch upstream macOS/Windows bundles
npm run patch:linux-x64             # AST patches on mac-x64 extract
npm run build:linux-x64             # deb + zip (system CLI by default)
```

For arm64, use `patch:linux-arm64` and `build:linux-arm64`.

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

Bundle `codex` and `rg` from the host `PATH` instead of the macOS upstream binaries
(which cannot run on Linux) or Cometix npm tarballs. At build time the resolved binaries
are copied into `resources/` inside the zip; rebuild Desktop after upgrading your system
`codex` package to pick up CLI changes. Cometix takes precedence when both are enabled.

```bash
USE_SYSTEM_CLI=0 npm run build:linux-x64   # keep upstream macOS binaries (non-functional on Linux)
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
3. macOS upstream extract (warns; binaries will not execute on Linux)

## npm scripts (Linux variants)

| Script | Description |
|--------|-------------|
| `patch:linux-x64` | Patch mac-x64 upstream for Linux x64 build |
| `patch:linux-arm64` | Patch mac-arm64 upstream for Linux arm64 build |
| `build:linux-x64` | System CLI from PATH (default) |
| `build:linux-x64:upstream` | Upstream macOS CLI binaries |
| `build:linux-x64:cometix` | Cometix npm CLI binaries |
| `build:linux-arm64:cometix` | Cometix CLI for arm64 |
| `patch:linux-x64:shim-picker` | Desktop model picker for codex-shim catalog (`USE_SHIM_MODEL_PICKER=1`) |
| `patch:linux-arm64:shim-picker` | Same for arm64 upstream extract |

### `USE_SHIM_MODEL_PICKER` (default: **off**)

ASAR patch for [**codex-shim**](https://github.com/henry701/codex-shim) integration (Statsig allowlist bypass + sidebar
`modelProviders` filter). **Unlimited model list (single `limit:1e4` fetch) is always applied** via
`patch-model-list-pagination.js` in `BASE_PATCHES` (upstream defaults to 100).

Verify with:
```bash
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run patch:linux-x64:shim-picker   # convenience alias
node scripts/patch-model-list-pagination.js mac-x64 --check
node scripts/verify-shim-picker-patch.js mac-x64
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
node scripts/patch-remove-menu.js mac-x64 --check
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
node scripts/patch-linux-chrome.js mac-x64 --check
```

## Other build notes

- **`better-sqlite3`** — pinned to `vendor/better-sqlite3-12.10.0-electron42.tgz` until upstream ships Electron 42 V8 API support ([WiseLibs/better-sqlite3#1475](https://github.com/WiseLibs/better-sqlite3/pull/1475)).
- **`electron`** — pinned to **42.1.0** (exact), matching the upstream macOS app extract (`src/mac-x64/_asar/package.json`). Using 42.0.1 omits Linux transparent-window fixes backported in 42.1.x ([#51430](https://github.com/electron/electron/pull/51430)).
- **`ensure-electron-dist.js`** — Node 24+ workaround: full Electron runtime via system `unzip` (runs on `postinstall` and before forge package/make).
- **RPM packages** — skipped when no RPM database is present (typical on Arch). Force with `FORGE_LINUX_RPM=1` after initializing an RPM db (e.g. `sudo rpm --initdb`).

## Install on Arch Linux

A local PKGBUILD wraps the prebuilt Linux zip (full Electron bundle, **no system Electron**).
The pacman package name is **`codex-desktop`**; the directory `packaging/arch/codex-desktop-bin/`
uses the `-bin` suffix only as AUR convention for prebuilt packages.

Build the zip with **`codex` and `rg` on your PATH`** so `USE_SYSTEM_CLI` (Linux default)
snapshots your distro/OpenAI CLI into the bundle — not Cometix npm artifacts.

```bash
# codex + rg must resolve on PATH before build (e.g. openai-codex from AUR/pacman)
USE_SHIM_MODEL_PICKER=1 npm run build:linux-x64
cp out/make/zip/linux/x64/Codex-linux-x64-*.zip packaging/arch/codex-desktop-bin/
cd packaging/arch/codex-desktop-bin
# bump pkgver/pkgrel in PKGBUILD when the version changes
updpkgsums
makepkg -si
```

`npm run sync` and `npm run prune:artifacts` keep the newest **3** app versions of
`Codex-linux-x64-*.zip` / `codex-desktop-*-x86_64.pkg.tar.zst` under the packaging dir,
drop makepkg `src/`/`pkg/`, and clear `/tmp/codex-sync` download leftovers.

To rebuild without reinstalling:

```bash
makepkg -f
yay -U --noconfirm codex-desktop-*.pkg.tar.zst
```

Do **not** run `yay -Bi .` with **cleanBuild** enabled inside this repo. Yay treats local PKGBUILD directories like AUR clones and can delete `PKGBUILD`, sources, and `.SRCINFO` from the tree. Prefer `makepkg -si`, or copy the packaging dir to `~/aur/codex-desktop-bin/` if you want yay-driven builds.

Installs:

| Path | Purpose |
|------|---------|
| `/usr/lib/codex-desktop/` | Full Electron bundle |
| `/usr/bin/codex-desktop` | Launcher (Claude-aligned Wayland + KDE compositing defaults) |
| `/usr/share/applications/codex-desktop.desktop` | Application menu entry |
| `/usr/share/icons/hicolor/256x256/apps/codex-desktop.png` | Icon |

Runtime dependencies are declared in the PKGBUILD (`gtk3`, `nss`, `mesa`, etc.). Optional: `gvfs`, `libsecret`, `trash-cli`, `xdg-desktop-portal`.

**Recommended alongside:** [henry701/codex-shim](https://github.com/henry701/codex-shim) routes Codex Desktop through OpenCode and third-party models (Cursor, OpenCode free tier, NVIDIA NIM, etc.). Install with `uv tool install git+https://github.com/henry701/codex-shim`, run `codex-shim sync-desktop`, then optionally rebuild Desktop with `USE_SHIM_MODEL_PICKER=1` so the in-app model picker lists your shim catalog.

Launch from the menu or run `codex-desktop`. **Default on Plasma Wayland is XWayland**
(`--ozone-platform=x11` + `--disable-gpu-compositing`) for stable sidebar repaint. Native
Wayland: `CODEX_OZONE_PLATFORM=wayland` (IME flags included).

| Goal | Command |
|------|---------|
| XWayland (default on Plasma) | `codex-desktop` |
| Native Wayland | `CODEX_OZONE_PLATFORM=wayland codex-desktop` |
| Enable GPU compositing | `CODEX_DISABLE_GPU=0 codex-desktop` |
| Install previous kept build | `sudo pacman -U packaging/arch/codex-desktop-bin/codex-desktop-*-x86_64.pkg.tar.zst` |

## Development

```bash
npm run dev
```

## Project Structure

```
├── src/
│   ├── mac-x64/         # Upstream macOS x64 extract (Linux build base)
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
│   ├── patch-all.js      # Runs all BASE_PATCHES in sequence
│   ├── patch-remove-menu.js  # Suppress GTK/KDE menu bar on Linux
│   ├── ...
├── vendor/              # better-sqlite3 Electron 42 tarball
├── packaging/
│   └── arch/codex-desktop-bin/  # Arch PKGBUILD (prebuilt zip → pacman)
├── forge.config.js      # Electron Forge config
└── package.json
```

## CI/CD

GitHub Actions automatically builds on:
- Push to `master`
- Tag `v*` → Creates draft release

CI uses Node 24 (see `.nvmrc`), with the same `ensure-electron-dist` workaround as local builds.

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

**This fork:** issues/PRs here are for personal workflow (system CLI defaults, Arch
packaging, shim-picker integration, supply-chain posture). No expectation of upstream
cherry-picks.

## Credits

**© OpenAI · Cometix Space**

- [OpenAI Codex](https://github.com/openai/codex) - Original Codex CLI (Apache-2.0)
- [Cometix Space](https://github.com/Haleclipse) - Cross-platform rebuild & [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain
- [henry701/codex-shim](https://github.com/henry701/codex-shim) - Responses API shim for multi-model Codex Desktop routing (fork of [0xSero/codex-shim](https://github.com/0xSero/codex-shim))

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
