/**
 * Official OpenAI Linux ChatGPT desktop packages (deb), not the macOS ASAR rebuild.
 *
 * Index (no 300MB download):
 *   https://persistent.oaistatic.com/codex-app-prod/linux/deb/dists/stable/main/binary-{amd64,arm64}/Packages
 *
 * Latest blobs:
 *   .../linux/deb/latest/chatgpt_amd64.deb
 *   .../linux/deb/latest/chatgpt_arm64.deb
 *
 * Do not run the Debian postinst — it writes apt sources + a signing key under /etc.
 */
const https = require("https");
const http = require("http");

const LINUX_DEB_REPO = "https://persistent.oaistatic.com/codex-app-prod/linux/deb";

const LINUX_OFFICIAL_PLATFORMS = ["linux-x64", "linux-arm64"];

/** @type {Record<string, { arch: string, packagesUrl: string, latestUrl: string }>} */
const LINUX_OFFICIAL = {
  "linux-x64": {
    arch: "amd64",
    packagesUrl: `${LINUX_DEB_REPO}/dists/stable/main/binary-amd64/Packages`,
    latestUrl: `${LINUX_DEB_REPO}/latest/chatgpt_amd64.deb`,
  },
  "linux-arm64": {
    arch: "arm64",
    packagesUrl: `${LINUX_DEB_REPO}/dists/stable/main/binary-arm64/Packages`,
    latestUrl: `${LINUX_DEB_REPO}/latest/chatgpt_arm64.deb`,
  },
};

/**
 * @param {string} platform
 * @returns {typeof LINUX_OFFICIAL[string]}
 */
function officialLinuxSpec(platform) {
  const spec = LINUX_OFFICIAL[platform];
  if (!spec) {
    throw new Error(`unsupported official Linux platform: ${platform}`);
  }
  return spec;
}

/**
 * Parse a Debian Packages index (first `Package: chatgpt` stanza).
 * @param {string} text
 */
function parseDebianPackages(text) {
  const stanzas = String(text).split(/\n\n+/);
  let stanza = stanzas.find((block) => /^Package:\s*chatgpt\s*$/m.test(block));
  if (!stanza) {
    stanza = stanzas.find((block) => /^Package:\s*chatgpt\b/m.test(block));
  }
  if (!stanza) {
    throw new Error("chatgpt stanza not found in Debian Packages index");
  }

  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of stanza.split("\n")) {
    const m = line.match(/^(Version|Architecture|Filename|SHA256|SHA1|MD5sum|Size):\s*(.+)\s*$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  if (!fields.version) {
    throw new Error("chatgpt Packages stanza missing Version");
  }

  const filename = fields.filename || "";
  return {
    package: "chatgpt",
    version: fields.version,
    architecture: fields.architecture || "",
    filename,
    sha256: (fields.sha256 || "").toLowerCase(),
    sha1: fields.sha1 || "",
    md5: fields.md5sum || "",
    size: Number(fields.size || 0),
    url: filename ? `${LINUX_DEB_REPO}/${filename}` : null,
  };
}

/**
 * @param {string} url
 * @returns {Promise<{ status: number, body: Buffer }>}
 */
function httpGet(url) {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    mod
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return httpGet(res.headers.location).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

/**
 * @param {string} platform linux-x64 | linux-arm64
 */
async function fetchLinuxDebInfo(platform) {
  const spec = officialLinuxSpec(platform);
  const res = await httpGet(spec.packagesUrl);
  if (res.status !== 200) {
    throw new Error(`Packages fetch failed (${res.status}): ${spec.packagesUrl}`);
  }
  const info = parseDebianPackages(res.body.toString("utf-8"));
  if (!info.url) info.url = spec.latestUrl;
  return { ...info, platform, packagesUrl: spec.packagesUrl, latestUrl: spec.latestUrl };
}

module.exports = {
  LINUX_DEB_REPO,
  LINUX_OFFICIAL,
  LINUX_OFFICIAL_PLATFORMS,
  fetchLinuxDebInfo,
  httpGet,
  officialLinuxSpec,
  parseDebianPackages,
};
