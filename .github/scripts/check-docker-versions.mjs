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

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..", "..");
const VERSIONS_PATH = join(ROOT, "versions.json");
const COMPOSE_PATHS = [
  join(ROOT, "stack", "docker-compose.yml"),
  join(ROOT, "stack", "docker-compose.v2.yml"),
  join(ROOT, "mariadb", "docker-compose.yml"),
  join(ROOT, "postgres", "docker-compose.yml"),
  join(ROOT, "valkey", "docker-compose.yml"),
  join(ROOT, "meilisearch", "docker-compose.yml"),
];

const DRY_RUN = process.env.DRY_RUN === "true";

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
 * Splits a `versions.json` `tagPattern` (e.g. `"{version}-alpine"`,
 * `"v{version}"`) around its `{version}` placeholder.
 */
function splitTagPattern(tagPattern) {
  const idx = tagPattern.indexOf("{version}");
  return {
    prefix: tagPattern.slice(0, idx),
    suffix: tagPattern.slice(idx + "{version}".length),
  };
}

/**
 * Returns the latest stable version on the currently selected release line
 * whose tag is built from `tagPattern`,
 * e.g. `{version}-alpine` for postgres - actually exists on Docker Hub with:
 *  - a semver-ish version part (digits and dots only, no alpha/beta/rc)
 *  - both linux/amd64 AND linux/arm64 support
 * Matching the exact tag shape (not just any numeric-looking tag) matters
 * because `build-push.yml` re-tags that specific upstream tag - a bare
 * numeric tag can go multi-arch before its `-alpine` counterpart does. The
 * precision already declared in versions.json is preserved: a major pin keeps
 * tracking that major, a major.minor pin keeps that line, and a full semver pin
 * receives patches on its major.minor line. A newer major is reported
 * separately; it is never substituted for an existing user-selectable line.
 */
async function latestStableVersion(image, currentMajor, tagPattern) {
  const tags = await fetchTags(image);
  const { prefix, suffix } = splitTagPattern(tagPattern);

  const stable = tags.filter((t) => {
    const name = t.name;
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false;
    const version = name.slice(prefix.length, name.length - suffix.length);
    if (!/^\d+(\.\d+)*$/.test(version)) return false;
    if (/alpha|beta|rc|preview|dev/i.test(version)) return false;
    const images = t.images ?? [];
    const hasAmd64 = images.some((i) => i.architecture === "amd64" && i.os === "linux");
    const hasArm64 = images.some((i) => i.architecture === "arm64" && i.os === "linux");
    return hasAmd64 && hasArm64;
  });

  if (stable.length === 0) return null;

  const versionOf = (name) => name.slice(prefix.length, name.length - suffix.length);

  stable.sort((a, b) => {
    const av = versionOf(a.name).split(".").map(Number);
    const bv = versionOf(b.name).split(".").map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const diff = (bv[i] ?? 0) - (av[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  const overallBest = versionOf(stable[0].name);
  const currentParts = String(currentMajor).split(".");
  const lineParts = currentParts.slice(0, Math.min(2, currentParts.length));
  const compatible = stable.find((tag) => {
    const candidate = versionOf(tag.name).split(".");
    return lineParts.every((part, index) => candidate[index] === part);
  });
  if (!compatible) return null;

  const best = versionOf(compatible.name);
  const parts = best.split(".");
  const precision = Math.max(1, currentParts.length);
  const platformDigests = Object.fromEntries(
    (compatible.images ?? [])
      .filter(
        (image) =>
          image.os === "linux" &&
          ["amd64", "arm64"].includes(image.architecture) &&
          /^sha256:[a-f0-9]{64}$/.test(image.digest ?? ""),
      )
      .map((image) => [`linux/${image.architecture}`, image.digest]),
  );
  return {
    version: parts.slice(0, precision).join("."),
    digest: compatible.digest,
    platformDigests,
    newerMajor:
      overallBest.split(".")[0] !== currentParts[0] ? overallBest : null,
  };
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
const originalVersions = structuredClone(versions);
const tableRows = [];
const majorRows = [];
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
      const result = await latestStableVersion(cfg.image, cfg.version, cfg.tagPattern);
      newVersion = result?.version ?? null;
      if (result?.digest && result.digest !== cfg.digest) {
        extraChanges.digest = result.digest;
      }
      if (
        result &&
        Object.keys(result.platformDigests).length === 2 &&
        JSON.stringify(result.platformDigests) !== JSON.stringify(cfg.platformDigests)
      ) {
        extraChanges.platformDigests = result.platformDigests;
      }
      if (result?.newerMajor) {
        majorRows.push(`| ${key} | \`${cfg.version}\` | \`${result.newerMajor}\` |`);
      }
    }

    if (!newVersion) {
      console.log("⚠ could not determine latest version, skipping");
      continue;
    }

    const old = cfg.version;
    const hasVersionChange = newVersion !== old;
    const hasExtraChanges = Object.keys(extraChanges).length > 0;

    if (hasVersionChange || hasExtraChanges) {
      console.log(
        hasVersionChange ? `${old} → ${newVersion}` : `${old} (digest refresh)`,
      );
      versions.images[key].version = newVersion;
      Object.assign(versions.images[key], extraChanges);
      changed = true;
      if (hasVersionChange) {
        tableRows.push(`| ${key} | \`${old}\` | \`${newVersion}\` |`);
      } else {
        tableRows.push(`| ${key} | \`${old}\` | digest refresh |`);
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
  for (const path of COMPOSE_PATHS) {
    let content = readFileSync(path, "utf8");
    const original = content;
    for (const [key, next] of Object.entries(versions.images)) {
      const previous = originalVersions.images[key];
      if (!previous || key === "frankenphp") continue;
      content = content
        .replaceAll(
          `${previous.publishedImage}:${previous.version}@${previous.digest}`,
          `${next.publishedImage}:${next.version}@${next.digest}`,
        )
        .replaceAll(
          `${key.toUpperCase()}_VERSION:-${previous.version}`,
          `${key.toUpperCase()}_VERSION:-${next.version}`,
        );
    }
    if (content !== original) writeFileSync(path, content, "utf8");
  }
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
  appendFileSync(outputFile, `major_candidates=${majorRows.join("\\n")}\n`);
} else {
  console.log(`\nchanged=${changed}`);
  console.log(`date=${today}`);
  if (tableRows.length) console.log("\nTable rows:\n" + tableRows.join("\n"));
  if (majorRows.length) {
    console.log("\nNew major release lines (not auto-updated):\n" + majorRows.join("\n"));
  }
}
