#!/usr/bin/env node
/**
 * Prepare catalog images for the current platform. FrankenPHP is built locally;
 * data services use the exact official images mirrored by the publishing job.
 *
 * node images/build.mjs                         # all supported runtimes/services
 * node images/build.mjs frankenphp:8.3 mariadb  # selected PHP/service
 * node images/build.mjs --list --json           # inspect without Docker
 * node images/build.mjs --check                 # check upstream versions
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(directory, "built-images.json");
const { images } = JSON.parse(readFileSync(join(directory, "versions.json"), "utf8"));
const platform = `linux/${process.arch === "arm64" ? "arm64" : "amd64"}`;
const args = process.argv.slice(2);
const allowedFlags = new Set(["--list", "--json", "--force", "--check"]);
for (const arg of args) {
  if (arg.startsWith("--") && !allowedFlags.has(arg)) throw new Error(`Unknown option: ${arg}`);
}
if (args.includes("--json") && !args.includes("--list")) throw new Error("--json requires --list");

function run(command, commandArgs) {
  console.log(`  $ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`);
}

if (args.includes("--check")) {
  const result = spawnSync(process.execPath, [join(directory, ".github/scripts/check-docker-versions.mjs")], {
    stdio: "inherit", env: { ...process.env, DRY_RUN: "true" },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function officialBuild(service, entry, version, digest, name = service) {
  if (!version || !/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) {
    throw new Error(`Missing version or digest for ${name}`);
  }
  return {
    name, group: service, official: true,
    tag: `${entry.image}:${entry.tagPattern.replace("{version}", version)}@${digest}`,
  };
}

const builds = [
  ...images.frankenphp.runtimes.filter((runtime) => runtime.supportStatus === "supported").map((runtime) => ({
    name: `frankenphp:${runtime.phpVersion}`, group: "frankenphp", official: false,
    tag: `wcp/frankenphp:${runtime.tag}`, context: join(directory, "frankenphp"),
    buildArgs: { FRANKENPHP_VERSION: images.frankenphp.baseVersion, PHP_VERSION: runtime.phpVersion },
  })),
  ...images.mariadb.runtimes.filter((runtime) => runtime.supportStatus === "supported").map((runtime) =>
    officialBuild("mariadb", images.mariadb, runtime.version, runtime.digest, `mariadb:${runtime.version}`)),
  ...["valkey", "postgres", "meilisearch"].map((service) =>
    officialBuild(service, images[service], images[service].version, images[service].digest)),
];
const targets = args.filter((arg) => !arg.startsWith("--"));
for (const target of targets) {
  if (!builds.some((build) => build.name === target || build.group === target)) {
    throw new Error(`Unknown image target: ${target}`);
  }
}
const selected = targets.length ? builds.filter((build) => targets.includes(build.name) || targets.includes(build.group)) : builds;
if (!selected.some((build) => build.group === "frankenphp") && targets.includes("frankenphp")) {
  throw new Error("The catalog has no supported FrankenPHP runtimes");
}
if (args.includes("--list")) {
  if (args.includes("--json")) console.log(JSON.stringify({ platform, builds: selected }, null, 2));
  else {
    console.log(`Platform: ${platform}\n`);
    for (const build of selected) console.log(`  ${build.name.padEnd(16)} ${build.tag}${build.official ? "  (official, no build)" : ""}`);
  }
  process.exit(0);
}

// Use this daemon's default builder; do not create or switch a global builder.
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
for (const build of selected) {
  console.log(`\n── ${build.name} ──`);
  const inspection = spawnSync("docker", ["image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", build.tag], { encoding: "utf8" });
  const exists = inspection.status === 0 && inspection.stdout.trim() === platform;
  if (!args.includes("--force") && exists) {
    console.log(`  Already available: ${build.tag}`);
  } else if (build.official) {
    run("docker", ["pull", "--platform", platform, build.tag]);
  } else {
    const buildArgs = Object.entries(build.buildArgs).flatMap(([key, value]) => ["--build-arg", `${key}=${value}`]);
    run("docker", ["buildx", "build", "--builder", "default", "--platform", platform, "--load", ...buildArgs, "-t", build.tag, build.context]);
  }
  manifest[build.name] = {
    tag: build.tag, platform, official: build.official,
    builtAt: exists && !args.includes("--force") ? manifest[build.name]?.builtAt ?? new Date().toISOString() : new Date().toISOString(),
  };
  // Preserve successfully prepared images if a later target fails.
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`\n✓ Written ${manifestPath}`);
