#!/usr/bin/env node
/**
 * Queries Docker Hub for the latest stable versions of each image in
 * versions.json and updates the file in-place.
 *
 * Outputs GitHub Actions step outputs:
 *   changed  — "true" | "false"
 *   date     — YYYY-MM-DD
 *   table    — markdown table rows for the PR body
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..", "..");
const VERSIONS_PATH = join(ROOT, "versions.json");

const DRY_RUN = process.env.DRY_RUN === "true";

// versions.json is the source of truth; these are the other places a version
// number is duplicated as a docker-compose/`.env` fallback default. Keep them
// in sync here instead of relying on someone to remember to edit all of them.
const DEFAULT_FILES = [
  ".env.example",
  "mariadb/docker-compose.yml",
  "valkey/docker-compose.yml",
  "frankenphp/docker-compose.yml",
  "postgres/docker-compose.yml",
  "meilisearch/docker-compose.yml",
  "stack/docker-compose.yml",
].map((p) => join(ROOT, p));

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces `${ENV_VAR:-old}` and `ENV_VAR=old` with the new value across DEFAULT_FILES. */
function propagateDefault(envVar, oldValue, newValue) {
  const replacements = [
    [new RegExp(`(\\$\\{${envVar}:-)${escapeRegExp(oldValue)}(\\})`, "g"), `$1${newValue}$2`],
    [new RegExp(`(^${envVar}=)${escapeRegExp(oldValue)}$`, "gm"), `$1${newValue}`],
  ];
  const touched = [];
  for (const file of DEFAULT_FILES) {
    if (!existsSync(file)) continue;
    let text = readFileSync(file, "utf8");
    let fileChanged = false;
    for (const [re, repl] of replacements) {
      const next = text.replace(re, repl);
      if (next !== text) {
        text = next;
        fileChanged = true;
      }
    }
    if (fileChanged) {
      if (!DRY_RUN) writeFileSync(file, text, "utf8");
      touched.push(file.slice(ROOT.length + 1));
    }
  }
  return touched;
}

// ── Docker Hub helpers ────────────────────────────────────────────────────────

async function fetchTags(image, pageSize = 100) {
  const [namespace, name] = image.includes("/")
    ? image.split("/")
    : ["library", image];
  const url = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=${pageSize}&ordering=last_updated`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Docker Hub ${url} → ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

/**
 * Returns the latest MAJOR.MINOR version tag that:
 *  - matches semver-ish (digits and dots only, optional -suffix)
 *  - is NOT a pre-release (no alpha/beta/rc)
 *  - supports both linux/amd64 AND linux/arm64
 */
async function latestStableVersion(image, currentMajor) {
  const tags = await fetchTags(image);

  // Tags may carry a "v" prefix (e.g. meilisearch's "v1.53.1") — strip it
  // before matching/sorting so those images aren't silently skipped forever.
  const stable = tags
    .map((t) => ({ ...t, version: t.name.replace(/^v/, "") }))
    .filter((t) => {
      const name = t.version;
      if (!/^\d+(\.\d+)*(-[a-z0-9]+)?$/.test(name)) return false;
      if (/alpha|beta|rc|preview|dev/i.test(name)) return false;
      const images = t.images ?? [];
      const hasAmd64 = images.some((i) => i.architecture === "amd64" && i.os === "linux");
      const hasArm64 = images.some((i) => i.architecture === "arm64" && i.os === "linux");
      return hasAmd64 && hasArm64;
    });

  if (stable.length === 0) return null;

  stable.sort((a, b) => {
    const av = a.version.split("-")[0].split(".").map(Number);
    const bv = b.version.split("-")[0].split(".").map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const diff = (bv[i] ?? 0) - (av[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  const best = stable[0].version.split("-")[0];
  const parts = best.split(".");
  if (String(currentMajor).split(".").length === 1 && parts.length >= 1) {
    return parts[0];
  }
  return parts.slice(0, 2).join(".");
}

// ── FrankenPHP: check latest PHP version available ────────────────────────────

async function latestFrankenPhpVersion(currentVersion) {
  const tags = await fetchTags("dunglas/frankenphp");
  const phpVersions = new Set();

  for (const t of tags) {
    const m = t.name.match(/^[\d.]+-php(\d+\.\d+)$/);
    if (!m) continue;
    const images = t.images ?? [];
    const hasAmd64 = images.some((i) => i.architecture === "amd64" && i.os === "linux");
    const hasArm64 = images.some((i) => i.architecture === "arm64" && i.os === "linux");
    if (hasAmd64 && hasArm64) phpVersions.add(m[1]);
  }

  const frankenVersions = tags
    .filter((t) => /^[\d.]+-php\d+\.\d+$/.test(t.name))
    .map((t) => t.name.split("-")[0])
    .filter((v) => /^\d+(\.\d+)*$/.test(v));

  frankenVersions.sort((a, b) => {
    const av = a.split(".").map(Number);
    const bv = b.split(".").map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const diff = (bv[i] ?? 0) - (av[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return {
    version: frankenVersions[0] ?? currentVersion,
    phpVersions: [...phpVersions].sort((a, b) => {
      const [am, an] = a.split(".").map(Number);
      const [bm, bn] = b.split(".").map(Number);
      return bm - am || bn - an;
    }),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const versions = JSON.parse(readFileSync(VERSIONS_PATH, "utf8"));
const tableRows = [];
let changed = false;

console.log("Checking Docker Hub for latest versions…\n");

for (const [key, cfg] of Object.entries(versions.images)) {
  process.stdout.write(`  ${key} (${cfg.image}) … `);
  try {
    let newVersion;
    let extraChanges = {};

    if (key === "frankenphp") {
      const result = await latestFrankenPhpVersion(cfg.version);
      newVersion = result.version;
      const sortedNew = result.phpVersions.join(",");
      const sortedOld = (cfg.phpVersions ?? []).join(",");
      if (sortedNew !== sortedOld && result.phpVersions.length > 0) {
        extraChanges.phpVersions = result.phpVersions;
      }
    } else {
      newVersion = await latestStableVersion(cfg.image, cfg.version);
    }

    if (!newVersion) {
      console.log("⚠ could not determine latest version, skipping");
      continue;
    }

    const old = cfg.version;
    const hasVersionChange = newVersion !== old;
    const hasExtraChanges = Object.keys(extraChanges).length > 0;

    if (hasVersionChange || hasExtraChanges) {
      console.log(`${old} → ${newVersion}`);
      versions.images[key].version = newVersion;
      Object.assign(versions.images[key], extraChanges);
      changed = true;
      if (hasVersionChange) {
        tableRows.push(`| ${key} | \`${old}\` | \`${newVersion}\` |`);
        const envVar = `${key.toUpperCase()}_VERSION`;
        const touched = propagateDefault(envVar, old, newVersion);
        if (touched.length) console.log(`    also updated: ${touched.join(", ")}`);
      }
    } else {
      console.log(`${old} (no change)`);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}

const today = new Date().toISOString().slice(0, 10);
versions._updated = today;

if (changed && !DRY_RUN) {
  writeFileSync(VERSIONS_PATH, JSON.stringify(versions, null, 2) + "\n", "utf8");
  console.log(`\n✓ Written ${VERSIONS_PATH}`);
} else if (changed && DRY_RUN) {
  console.log("\n[dry-run] Would write updated versions.json");
} else {
  console.log("\n✓ All versions are up to date.");
}

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  const { appendFileSync } = await import("fs");
  appendFileSync(outputFile, `changed=${changed}\n`);
  appendFileSync(outputFile, `date=${today}\n`);
  appendFileSync(outputFile, `table=${tableRows.join("\\n")}\n`);
} else {
  console.log(`\nchanged=${changed}`);
  console.log(`date=${today}`);
  if (tableRows.length) console.log("\nTable rows:\n" + tableRows.join("\n"));
}
