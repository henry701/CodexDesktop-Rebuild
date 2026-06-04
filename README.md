# Codex Desktop Rebuild

Cross-platform Electron build for OpenAI Codex Desktop App.

## Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS    | x64, arm64   | ✅     |
| Windows  | x64          | ✅     |
| Linux    | x64, arm64   | ✅     |

## Prerequisites

- **Node.js 22** — required for Electron packaging (Node 24+ breaks Electron zip extraction). Use [nvm](https://github.com/nvm-sh/nvm):

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

## Other build notes

- **`better-sqlite3`** — pinned to `vendor/better-sqlite3-12.10.0-electron42.tgz` until upstream ships Electron 42 V8 API support ([WiseLibs/better-sqlite3#1475](https://github.com/WiseLibs/better-sqlite3/pull/1475)).
- **RPM packages** — skipped when no RPM database is present (typical on Arch). Force with `FORGE_LINUX_RPM=1` after initializing an RPM db (e.g. `sudo rpm --initdb`).

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
│   └── patch-all.js
├── vendor/              # better-sqlite3 Electron 42 tarball
├── forge.config.js      # Electron Forge config
└── package.json
```

## CI/CD

GitHub Actions automatically builds on:
- Push to `master`
- Tag `v*` → Creates draft release

CI uses Node 22 (see `.nvmrc`).

## Credits

**© OpenAI · Cometix Space**

- [OpenAI Codex](https://github.com/openai/codex) - Original Codex CLI (Apache-2.0)
- [Cometix Space](https://github.com/Haleclipse) - Cross-platform rebuild & [@cometix/codex](https://www.npmjs.com/package/@cometix/codex) binaries
- [Electron Forge](https://www.electronforge.io/) - Build toolchain

## License

This project rebuilds the Codex Desktop app for cross-platform distribution.
Original Codex CLI by OpenAI is licensed under Apache-2.0.
