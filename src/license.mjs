import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const PERMISSIVE = new Set(["MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0", "Unlicense", "CC0-1.0", "BlueOak-1.0.0", "Zlib"]);
const COPYLEFT = /^(A?GPL|LGPL|MPL|EPL|EUPL|CDDL|OSL|CC-BY-SA)/i;

const TEXT_SIGNATURES = [
  ["MIT", /Permission is hereby granted, free of charge/i],
  ["ISC", /Permission to use, copy, modify, and\/or distribute this software for any purpose/i],
  ["Apache-2.0", /Apache License[\s\S]{0,40}Version 2\.0/i],
  ["AGPL-3.0", /GNU AFFERO GENERAL PUBLIC LICENSE/i],
  ["LGPL-3.0", /GNU LESSER GENERAL PUBLIC LICENSE/i],
  ["GPL-3.0", /GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/i],
  ["GPL-2.0", /GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 2/i],
  ["MPL-2.0", /Mozilla Public License,? (?:Version|v\.?) ?2\.0/i],
  ["BSD-3-Clause", /Neither the name of[\s\S]{0,200}endorse or promote/i],
  ["BSD-2-Clause", /Redistribution and use in source and binary forms/i],
  ["Unlicense", /This is free and unencumbered software released into the public domain/i],
];

/** Detects a donor's license from package metadata and license files. */
export async function detectLicense(dir, packageJson) {
  const declared = normalizeDeclared(packageJson?.license ?? packageJson?.licenses?.[0]?.type);
  let fromFile = null;
  let file = null;

  const entries = await readdir(dir).catch(() => []);
  const licenseFile = entries.find((name) => /^(licen[cs]e|copying|unlicense)([._-]|$)/i.test(name));
  if (licenseFile) {
    file = licenseFile;
    const text = await readFile(join(dir, licenseFile), "utf8").catch(() => "");
    fromFile = TEXT_SIGNATURES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  }

  const spdx = declared ?? fromFile;
  return {
    spdx,
    declared,
    detectedFromFile: fromFile,
    file,
    category: categorize(spdx),
    conflict: Boolean(declared && fromFile && declared !== fromFile),
  };
}

function normalizeDeclared(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^\((.*)\)$/, "$1");
  if (/^SEE LICEN[CS]E/i.test(trimmed) || /^UNLICENSED$/i.test(trimmed)) return null;
  return trimmed;
}

export function categorize(spdx) {
  if (!spdx) return "unknown";
  // "MIT OR Apache-2.0" is permissive if any alternative is permissive.
  const options = spdx.split(/\s+OR\s+/i).map((part) => part.trim());
  if (options.some((option) => PERMISSIVE.has(option))) return "permissive";
  if (options.some((option) => COPYLEFT.test(option))) return "copyleft";
  return "unknown";
}

/**
 * License check. ReaFuse learns behavior (ideas) and never copies code, which
 * the originality scan enforces, so by default every license is recorded and
 * flagged but nothing is blocked. Strict mode (--strict-license) refuses
 * copyleft and unidentified licenses for operators who want that policy.
 */
export function licenseGate(license, { owned = false, allowCopyleft = false, strictLicense = false } = {}) {
  if (owned) return { ok: true, reason: "Operator declared ownership of this donor." };
  if (license.category === "permissive") return { ok: true, reason: `${license.spdx} is permissive.` };
  if (!strictLicense) {
    const label = license.spdx ?? "No recognisable license";
    return { ok: true, warning: true, reason: `${label}: recorded. Behavior only, no code is reused; check the terms before shipping the creature.` };
  }
  if (license.category === "copyleft") {
    return allowCopyleft
      ? { ok: true, reason: `${license.spdx} is copyleft; allowed by --allow-copyleft (behavior only, no code reuse).` }
      : { ok: false, reason: `${license.spdx} is copyleft. Strict mode: re-run with --allow-copyleft to fuse behavior only.` };
  }
  return { ok: false, reason: "No recognisable license. Strict mode: re-run with --owned only if you own this donor." };
}
