import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const directory = dirname(fileURLToPath(import.meta.url));
const { images } = JSON.parse(readFileSync(join(directory, "versions.json"), "utf8"));
const list = (...args) => spawnSync(process.execPath, [join(directory, "build.mjs"), "--list", "--json", ...args], { encoding: "utf8" });

test("all supported PHP runtimes and exact official service pins are prepared", () => {
  const result = list();
  assert.equal(result.status, 0, result.stderr);
  const { builds } = JSON.parse(result.stdout);
  const php = builds.filter((build) => build.group === "frankenphp");
  assert.deepEqual(php.map((build) => build.tag), images.frankenphp.runtimes.filter((runtime) => runtime.supportStatus === "supported").map((runtime) => `wcp/frankenphp:${runtime.tag}`));
  assert.ok(php.every((build) => build.buildArgs.FRANKENPHP_VERSION === images.frankenphp.baseVersion));
  for (const build of php) {
    const runtime = images.frankenphp.runtimes.find((runtime) => runtime.phpVersion === build.buildArgs.PHP_VERSION);
    assert.match(runtime.baseDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(build.buildArgs.FRANKENPHP_BASE_DIGEST, `@${runtime.baseDigest}`);
  }
  for (const service of ["mariadb", "valkey", "postgres", "meilisearch"]) {
    const entry = images[service];
    const tuples = entry.runtimes?.filter((runtime) => runtime.supportStatus === "supported") ?? [entry];
    assert.deepEqual(builds.filter((build) => build.group === service).map((build) => build.tag), tuples.map((tuple) => `${entry.image}:${entry.tagPattern.replace("{version}", tuple.version)}@${tuple.digest}`));
    assert.ok(builds.filter((build) => build.group === service).every((build) => build.official));
  }
});

test("an explicit PHP target builds only that runtime and typos fail", () => {
  const version = images.frankenphp.runtimes.find((runtime) => runtime.supportStatus === "supported").phpVersion;
  const result = list(`frankenphp:${version}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).builds.length, 1);
  assert.notEqual(list("maraidb").status, 0);
  assert.notEqual(list("--froce").status, 0);
});

test("official images are pulled without creating a builder; repeat run reuses them", () => {
  const temp = mkdtempSync(join(tmpdir(), "wcp-image-test-"));
  try {
    for (const name of ["build.mjs", "versions.json"]) copyFileSync(join(directory, name), join(temp, name));
    mkdirSync(join(temp, "bin"));
    const log = join(temp, "commands.jsonl");
    const docker = join(temp, "bin/docker");
    writeFileSync(docker, `#!${process.execPath}\nimport('node:fs').then(fs => {fs.appendFileSync(process.env.COMMAND_LOG, JSON.stringify(process.argv.slice(2))+'\\n'); if(process.argv[2]==='image' && process.env.IMAGE_PRESENT==='1') console.log('linux/'+(process.arch==='arm64'?'arm64':'amd64')); process.exit(process.argv[2]==='image' && process.env.IMAGE_PRESENT!=='1' ? 1 : 0);});\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${join(temp, "bin")}:${process.env.PATH}`, COMMAND_LOG: log };
    let result = spawnSync(process.execPath, [join(temp, "build.mjs"), "mariadb", "valkey", "meilisearch"], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    let commands = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(commands.filter((args) => args[0] === "pull").length, images.mariadb.runtimes.filter((runtime) => runtime.supportStatus === "supported").length + 2);
    assert.ok(commands.every((args) => args[0] !== "buildx"));
    writeFileSync(log, "");
    result = spawnSync(process.execPath, [join(temp, "build.mjs"), "valkey"], { encoding: "utf8", env: { ...env, IMAGE_PRESENT: "1" } });
    assert.equal(result.status, 0, result.stderr);
    commands = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(commands.every((args) => args[0] === "image"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("local Compose consumes exactly the images prepared for every runtime", (t) => {
  const probe = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (probe.status !== 0) return t.skip("Docker Compose CLI unavailable");
  const env = { ...process.env, MARIADB_ROOT_PASSWORD: "testpass", MARIADB_PASSWORD: "testpass",
    POSTGRES_PASSWORD: "testpass", VALKEY_ADMIN_PASSWORD: "testpass", MEILISEARCH_MASTER_KEY: "testtesttesttest",
    WCP_INGRESS_D: "/tmp/wcp-local-test/ingress", WCP_RUNTIME_D: "/tmp/wcp-local-test/runtime",
    WCP_WWW_ROOT: "/tmp/wcp-local-test/www", WCP_CADDY_LOG: "/tmp/wcp-local-test/logs" };
  for (const key of Object.keys(env)) {
    if ((key.startsWith("WCP_") && key.endsWith("_IMAGE")) || ["WCP_RUNTIME_84_D", "WCP_RUNTIME_85_D", "WCP_SITE_SERVICES_D", "WCP_TOOLS_D"].includes(key)) delete env[key];
  }
  const result = spawnSync("docker", ["compose", "-f", join(directory, "stack/docker-compose.v2.yml"), "-f", join(directory, "stack/docker-compose.v2.local.yml"), "--profile", "*", "config", "--format", "json"], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  const { builds } = JSON.parse(list().stdout);
  const tags = new Set(builds.map((build) => build.tag));
  for (const [name, service] of Object.entries(services)) {
    assert.ok(tags.has(service.image), `${name} image is not prepared locally: ${service.image}`);
    if (name.startsWith("runtime-")) {
      const version = images.frankenphp.runtimes.find((runtime) => name === `runtime-${runtime.id}`).phpVersion;
      assert.ok(service.image.endsWith(`-php${version}`));
      for (const mount of service.volumes.filter((volume) => volume.type === "bind")) {
        assert.ok(!/^\/(etc\/wcp|var\/www|var\/log\/caddy|var\/lib\/wcp)/.test(mount.source), `host mount escapes sandbox: ${mount.source}`);
      }
    }
  }
});

test("example settings have unique keys and the current Valkey ACL model", () => {
  const example = readFileSync(join(directory, ".env.example"), "utf8");
  const keys = example.split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split("=")[0]);
  assert.equal(new Set(keys).size, keys.length, "duplicate environment settings");
  assert.ok(example.includes(`VALKEY_VERSION=${images.valkey.version}\n`));
  assert.ok(!example.includes("VALKEY_PASSWORD="));
});
