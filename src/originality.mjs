import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const SHINGLE = 20; // tokens per fingerprint window
const MAX_COPIED_RUN = 60; // longest tolerated stretch of identical tokens
const MAX_OVERLAP = 0.15; // tolerated share of creature fingerprints found in donors

/**
 * Tokenizes JavaScript-like source while ignoring comments, whitespace and
 * string contents' formatting, so reformatting cannot hide copied code.
 */
export function tokenize(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  return withoutComments.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[^\s\w]/g) ?? [];
}

function fingerprints(tokens) {
  const out = [];
  for (let i = 0; i + SHINGLE <= tokens.length; i += 1) {
    out.push(createHash("sha1").update(tokens.slice(i, i + SHINGLE).join("\u0000")).digest("base64"));
  }
  return out;
}

/** Compares creature files to donor files and reports copied stretches. */
export async function checkOriginality(creatureFiles, donorPaths) {
  const donorSet = new Set();
  for (const path of donorPaths) {
    const text = await readFile(path, "utf8").catch(() => "");
    for (const print of fingerprints(tokenize(text))) donorSet.add(print);
  }

  let total = 0;
  let matched = 0;
  let longestRun = 0;
  const offenders = [];

  for (const file of creatureFiles) {
    if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    const prints = fingerprints(tokenize(file.content));
    let run = 0;
    let fileLongest = 0;
    for (const print of prints) {
      total += 1;
      if (donorSet.has(print)) {
        matched += 1;
        run += 1;
        fileLongest = Math.max(fileLongest, run + SHINGLE - 1);
      } else {
        run = 0;
      }
    }
    longestRun = Math.max(longestRun, fileLongest);
    if (fileLongest >= MAX_COPIED_RUN) offenders.push({ path: file.path, longestCopiedTokens: fileLongest });
  }

  const overlap = total === 0 ? 0 : matched / total;
  return {
    passed: offenders.length === 0 && overlap <= MAX_OVERLAP,
    overlap: Number(overlap.toFixed(4)),
    longestCopiedTokens: longestRun,
    thresholds: { shingleTokens: SHINGLE, maxCopiedRun: MAX_COPIED_RUN, maxOverlap: MAX_OVERLAP },
    offenders,
  };
}
