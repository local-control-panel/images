#!/usr/bin/env node
/**
 * Builds WCP Docker images locally for the current platform.
 * Images are tagged as wcp/<service>:<version> and loaded into the local daemon.
 *
 * Usage:
 *   node docker/build.mjs              # build all services
 *   node docker/build.mjs frankenphp   # build one service
 *   node docker/build.mjs --list       # print what would be built
 *
 * The script reads versions from docker/versions.json and writes a
 * docker/built-images.json manifest so the app knows which local images exist.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const VERSIONS_PATH = join(__dir, "versions.json");
const MANIFEST_PATH = join(__dir, "built-images.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPlatform() {
  const arch = process.arch; // "x64" | "arm64"
  const dockerArch = arch === "arm64" ? "arm64" : "amd64";
  return `linux/${dockerArch}`;
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  const result = spawnSync("sh", ["-c", cmd], {
    stdio: "inherit",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${cmd}`);
  }
}

function imageExists(tag) {
  const result = spawnSync("docker", ["image", "inspect", tag], {
    stdio: "pipe",
  });
  return result.status === 0;
}

// ── Build definitions ─────────────────────────────────────────────────────────

const versions = JSON.parse(readFileSync(VERSIONS_PATH, "utf8"));
const v = versions.images;

const BUILDS = [
  {
    name: "frankenphp",
    context: join(__dir, "frankenphp"),
    tag: `wcp/frankenphp:${v.frankenphp.version}-php${v.frankenphp.phpDefault}`,
    buildArgs: {
      FRANKENPHP_VERSION: v.frankenphp.version,
      PHP_VERSION: v.frankenphp.phpDefault,
    },
  },
  {
    name: "mariadb",
    context: join(__dir, "mariadb"),
    tag: `wcp/mariadb:${v.mariadb.version}`,
    buildArgs: {
      MARIADB_VERSION: v.mariadb.version,
    },
  },
  {
    name: "valkey",
    context: join(__dir, "valkey"),
    tag: `wcp/valkey:${v.valkey.version}`,
    buildArgs: {
      VALKEY_VERSION: v.valkey.version,
    },
  },
  // postgres: no custom Dockerfile — note the official image in the manifest
  {
    name: "postgres",
    context: null,
    tag: `postgres:${v.postgres.version}-alpine`,
    buildArgs: {},
    official: true,
  },
];

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const force = args.includes("--force");
const targets = args.filter((a) => !a.startsWith("--"));

const builds = targets.length
  ? BUILDS.filter((b) => targets.includes(b.name))
  : BUILDS;

if (listOnly) {
  const platform = detectPlatform();
  console.log(`Platform: ${platform}\n`);
  for (const b of builds) {
    console.log(`  ${b.name.padEnd(12)} ${b.tag}${b.official ? "  (official, no build)" : ""}`);
  }
  process.exit(0);
}

// ── Build ─────────────────────────────────────────────────────────────────────

const platform = detectPlatform();
console.log(`Building for platform: ${platform}\n`);

// Ensure buildx builder exists
try {
  execSync("docker buildx inspect wcp-builder 2>/dev/null || docker buildx create --name wcp-builder --use 2>/dev/null || true", {
    stdio: "pipe",
  });
  execSync("docker buildx use wcp-builder 2>/dev/null || true", { stdio: "pipe" });
} catch { /* non-fatal */ }

const manifest = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  : {};

for (const build of builds) {
  console.log(`\n── ${build.name} ─────────────────────────────────`);

  if (build.official) {
    console.log(`  Using official image: ${build.tag}`);
    run(`docker pull --platform ${platform} ${build.tag}`);
    manifest[build.name] = { tag: build.tag, platform, official: true, builtAt: new Date().toISOString() };
    continue;
  }

  if (!force && imageExists(build.tag)) {
    console.log(`  Already built: ${build.tag}  (use --force to rebuild)`);
    manifest[build.name] = { tag: build.tag, platform, official: false, builtAt: manifest[build.name]?.builtAt ?? new Date().toISOString() };
    continue;
  }

  const buildArgFlags = Object.entries(build.buildArgs)
    .map(([k, v]) => `--build-arg ${k}=${v}`)
    .join(" ");

  run(
    `docker buildx build --platform ${platform} --load ${buildArgFlags} -t ${build.tag} ${build.context}`,
  );

  manifest[build.name] = {
    tag: build.tag,
    platform,
    official: false,
    builtAt: new Date().toISOString(),
  };
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`\n✓ Written ${MANIFEST_PATH}`);
console.log("\nImages ready:");
for (const [name, info] of Object.entries(manifest)) {
  console.log(`  ${name.padEnd(12)} ${info.tag}  [${info.platform}]`);
}
