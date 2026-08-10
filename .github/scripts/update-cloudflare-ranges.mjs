#!/usr/bin/env node
/**
 * Fetches Cloudflare's published proxy ranges and updates the static Caddy
 * trusted-proxy import only when the ranges have actually changed.
 *
 * Set DRY_RUN=true to validate and print the result without writing the file.
 */

import { isIP } from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..", "..");
const targetPath = join(rootDir, "frankenphp", "caddy-global", "trusted-proxies", "cloudflare.caddyfile");
const sources = {
  ipv4: "https://www.cloudflare.com/ips-v4",
  ipv6: "https://www.cloudflare.com/ips-v6",
};
const dryRun = process.env.DRY_RUN === "true";

function isValidCidr(value, version) {
  const [address, prefix, ...extra] = value.split("/");
  if (extra.length > 0 || !address || prefix === undefined || isIP(address) !== version) return false;

  const prefixNumber = Number(prefix);
  return Number.isInteger(prefixNumber) && prefixNumber >= 0 && prefixNumber <= (version === 4 ? 32 : 128);
}

async function fetchRanges(url, version) {
  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!response.ok) throw new Error(url + " returned HTTP " + response.status);

  const ranges = (await response.text())
    .split(/\r?\n/)
    .map((range) => range.trim())
    .filter(Boolean);

  if (ranges.length === 0 || ranges.some((range) => !isValidCidr(range, version))) {
    throw new Error(url + " returned an invalid " + (version === 4 ? "IPv4" : "IPv6") + " CIDR list");
  }

  return [...new Set(ranges)];
}

function render(ipv4, ipv6) {
  const ranges = [...ipv4, ...ipv6];
  const continuedRanges = ranges.map((range, index) => range + (index === ranges.length - 1 ? "" : " \\"));

  return [
    "# Cloudflare published IP ranges.",
    "# Source: https://www.cloudflare.com/ips-v4 and /ips-v6",
    "# Updated automatically by .github/workflows/update-cloudflare-ranges.yml.",
    "trusted_proxies static \\",
    ...continuedRanges,
    "trusted_proxies_strict",
    "client_ip_headers CF-Connecting-IP X-Forwarded-For",
    "",
  ].join("\n");
}

const [ipv4, ipv6] = await Promise.all([
  fetchRanges(sources.ipv4, 4),
  fetchRanges(sources.ipv6, 6),
]);
const nextContents = render(ipv4, ipv6);
const currentContents = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
const changed = nextContents !== currentContents;

if (changed && !dryRun) {
  writeFileSync(targetPath, nextContents, "utf8");
}

console.log("Cloudflare ranges: " + ipv4.length + " IPv4, " + ipv6.length + " IPv6");
console.log(changed ? (dryRun ? "[dry-run] ranges would be updated" : "ranges updated") : "ranges are already current");

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, "changed=" + changed + "\n", { flag: "a" });
}
