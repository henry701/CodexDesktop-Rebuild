# Codex Desktop Rebuild

Cross-platform Electron build for OpenAI Codex Desktop App.

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

- **Linux builds** — `codex` and `rg` on `PATH` (default behavior), plus `dpkg` and `fakeroot` for `.deb` artifacts.
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

Opt-in only: binaries are fetched via `npm pack` at build time and are not built or audited in this repo.

```bash
USE_COMETIX_CODEX=1 npm run build:linux-x64
# or
npm run build:linux-x64:cometix
npm run patch:linux-x64:cometix
```

Optional version pin: `USE_COMETIX_CODEX_VERSION=0.135.0-cometix`

When Cometix is enabled, the archive-delete patch in `patch-archive-delete.js` also runs (required for that CLI).

### `USE_SYSTEM_CLI` (Linux default: **on**)

Bundle `codex` and `rg` from the host `PATH` instead of the macOS upstream binaries (which cannot run on Linux). Cometix takes precedence when both are enabled.

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

ASAR patch so Codex Desktop shows models from a [**codex-shim**](https://github.com/0xSero/codex-shim) catalog. Requires `npm run sync` first. Scripts: `patch-shim-model-picker.js`, `verify-shim-picker-patch.js`.

```bash
USE_SHIM_MODEL_PICKER=1 npm run patch:linux-x64
npm run patch:linux-x64:shim-picker   # convenience alias
npm run build:linux-x64:shim          # patch + build
node scripts/verify-shim-picker-patch.js mac-x64
```

## Other build notes

- **`better-sqlite3`** — pinned to `vendor/better-sqlite3-12.10.0-electron42.tgz` until upstream ships Electron 42 V8 API support ([WiseLibs/better-sqlite3#1475](https://github.com/WiseLibs/better-sqlite3/pull/1475)).
- **`electron`** — pinned to **42.1.0** (exact), matching the upstream macOS app extract (`src/mac-x64/_asar/package.json`). Using 42.0.1 omits Linux transparent-window fixes backported in 42.1.x ([#51430](https://github.com/electron/electron/pull/51430)).
- **`ensure-electron-dist.js`** — Node 24+ workaround: full Electron runtime via system `unzip` (runs on `postinstall` and before forge package/make).
- **RPM packages** — skipped when no RPM database is present (typical on Arch). Force with `FORGE_LINUX_RPM=1` after initializing an RPM db (e.g. `sudo rpm --initdb`).

## Install on Arch Linux

A local PKGBUILD wraps the prebuilt Linux zip (full Electron bundle, bundled `codex`/`rg` CLIs, no system Electron). The pacman package name is **`codex-desktop`**; the directory `packaging/arch/codex-desktop-bin/` uses the `-bin` suffix only as AUR convention for prebuilt packages.

```bash
npm run build:linux-x64
cp out/make/zip/linux/x64/Codex-linux-x64-*.zip packaging/arch/codex-desktop-bin/
cd packaging/arch/codex-desktop-bin
# bump pkgver/pkgrel in PKGBUILD when the version changes
updpkgsums
makepkg -si
```

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
| `/usr/bin/codex-desktop` | Launcher (`--no-sandbox`) |
| `/usr/share/applications/codex-desktop.desktop` | Application menu entry |
| `/usr/share/icons/hicolor/256x256/apps/codex-desktop.png` | Icon |

Runtime dependencies are declared in the PKGBUILD (`gtk3`, `nss`, `mesa`, etc.). Optional: `gvfs`, `libsecret`, `trash-cli`, `xdg-desktop-portal`.

Launch from the menu or run `codex-desktop`.

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
│   └── patch-all.js
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

This fork uses two remotes:

| Remote | Repository |
|--------|------------|
| `fork` | `henry701/CodexDesktop-Rebuild` (primary push target) |
| `origin` | `Haleclipse/CodexDesktop-Rebuild` (upstream) |

`master` tracks `fork/master`. Push with `git push fork master`; pull updates with `git pull fork master`.

## Credits

**© OpenAI · Cometix Space**

- [OpenAI Codex](https://github.com/openai/codex) - Original Codex CLI (Apache-2.0)
- [Cometix Space](https://github.com/Haleclipse) - Cross-platform rebuild & [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain
- [0xSero/codex-shim](https://github.com/0xSero/codex-shim) - Responses API shim for multi-model Codex Desktop routing

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
