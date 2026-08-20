#!/usr/bin/env node
/**
 * Smart development startup script
 * Automatically detects system architecture and sets correct CLI path
 *
 * Default: upstream bundled CLI from sync-upstream (src/{platform}/codex).
 * Opt-in Cometix fork: USE_COMETIX_CODEX=1 npm run dev (see build-flags.js).
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { isCometixCodexEnabled, isSystemCliEnabled } = require('./build-flags');
const { resolveCodexVendor } = require('./cometix-vendor');
const { resolveFromPath } = require('./system-cli');

const platform = process.platform;
const arch = os.arch();

const platformMap = {
  darwin: {
    x64: 'darwin-x64',
    arm64: 'darwin-arm64',
  },
  linux: {
    x64: 'linux-x64',
    arm64: 'linux-arm64',
  },
  win32: {
    x64: 'win32-x64',
  },
};

const binDir = platformMap[platform]?.[arch];
if (!binDir) {
  console.error(`Unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

const cliName = platform === 'win32' ? 'codex.exe' : 'codex';
const useCometixCodex = isCometixCodexEnabled();
const linuxPlatform = `${platform}-${arch}`;
const useSystemCli = isSystemCliEnabled(
  platform === 'linux' ? linuxPlatform : '',
);
const linuxBundleResources = path.join(__dirname, '..', 'src', linuxPlatform, 'bundle', 'resources');

const srcPlatform = platform === 'darwin'
  ? (arch === 'arm64' ? 'mac-arm64' : 'mac-x64')
  : platform === 'win32' ? 'win' : linuxPlatform;

const upstreamCli = platform === 'linux' && fs.existsSync(path.join(linuxBundleResources, cliName))
  ? path.join(linuxBundleResources, cliName)
  : path.join(__dirname, '..', 'src', srcPlatform, cliName);
const resourcesCli = path.join(__dirname, '..', 'resources', 'bin', binDir, cliName);

/** @type {string | undefined} */
let cliPath;

if (useCometixCodex) {
  const buildPlatform = platform === 'darwin'
    ? (arch === 'arm64' ? 'mac-arm64' : 'mac-x64')
    : platform === 'win32' ? 'win' : linuxPlatform;
  cliPath = resolveCodexVendor(buildPlatform) ?? undefined;
} else if (platform === 'linux' && useSystemCli) {
  cliPath = resolveFromPath('codex', process.env.CODEX_CLI_PATH) ?? undefined;
}

if (!cliPath && fs.existsSync(upstreamCli)) {
  cliPath = upstreamCli;
}

if (!cliPath && fs.existsSync(resourcesCli)) {
  cliPath = resourcesCli;
}

if (!cliPath) {
  console.error('CLI not found.');
  console.error(`  upstream: ${upstreamCli}`);
  if (useCometixCodex) {
    console.error('  Cometix vendor lookup failed (USE_COMETIX_CODEX=1)');
  } else if (platform === 'linux' && useSystemCli) {
    console.error('  Install codex on PATH, set CODEX_CLI_PATH, or run npm run sync first.');
  } else {
    console.error('  Set USE_COMETIX_CODEX=1 to use @cometix/codex, or run npm run sync first.');
  }
  process.exit(1);
}

const appRoot = path.join(__dirname, '..', 'src', srcPlatform, '_asar');
const appEntry = fs.existsSync(appRoot) ? appRoot : path.join(__dirname, '..');

console.log(`[start-dev] Platform: ${platform}, Arch: ${arch}`);
console.log(`[start-dev] USE_COMETIX_CODEX: ${useCometixCodex ? 'yes' : 'no'}`);
console.log(`[start-dev] USE_SYSTEM_CLI: ${platform === 'linux' && useSystemCli ? 'yes' : 'no'}`);
console.log(`[start-dev] CLI Path: ${cliPath}`);
console.log(`[start-dev] App Root: ${appEntry}`);

const linuxResources = fs.existsSync(linuxBundleResources)
  ? linuxBundleResources
  : path.join(__dirname, '..', 'src', srcPlatform);

const electronBin = require('electron');
const child = spawn(electronBin, [appEntry], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    CODEX_CLI_PATH: cliPath,
    BUILD_FLAVOR: process.env.BUILD_FLAVOR || 'dev',
    ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL || 'app://-/index.html',
    CODEX_ELECTRON_RESOURCES_PATH: linuxResources,
    CODEX_ELECTRON_BUNDLED_PLUGINS_RESOURCES_PATH: linuxResources,
    CODEX_NODE_REPL_PATH: path.join(linuxResources, 'node_repl'),
    CODEX_BROWSER_USE_NODE_PATH: path.join(linuxResources, 'node'),
  },
});

child.on('close', (code) => {
  process.exit(code);
});
