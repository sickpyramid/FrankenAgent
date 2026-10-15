// Shared, lab-wide cache of donor work: pinned open-source builds for famous
// apps, and per-commit REA summaries and spec cards. A cached donor skips
// search, REA analysis and its spec card entirely.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { productTerm } from "./twins.mjs";
import { slugify, writeJson } from "./util.mjs";

/** Apps people are likely to type, pre-warmed with `reafuse warm --famous`. */
export const FAMOUS_APPS = [
  "Spotify", "WhatsApp", "Instagram", "TikTok", "YouTube", "Netflix",
  "Twitter", "Uber", "Airbnb", "Slack", "Discord", "Notion",
  "Trello", "Google Maps", "Zoom", "Duolingo", "Tinder", "Pinterest",
  "Reddit", "Telegram", "Strava", "Figma", "Shopify", "Medium",
];

const PINS = (labDir) => join(labDir, "cache", "famous.json");

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** The pinned open-source build for an app name, if one was warmed. */
export async function pinnedTwin(labDir, input) {
  const pins = (await readJsonSafe(PINS(labDir))) ?? {};
  return pins[productTerm(input)] ?? null;
}

export async function pinTwin(labDir, input, twin) {
  const pins = (await readJsonSafe(PINS(labDir))) ?? {};
  pins[productTerm(input)] = { ...twin, pinnedAt: new Date().toISOString() };
  await writeJson(PINS(labDir), pins);
}

/** Folder for one donor repository at one commit; null for local donors. */
export function donorCacheDir(labDir, donor) {
  if (!donor?.url || !donor?.commit) return null;
  const repo = slugify(donor.url.replace(/^https?:\/\//, "").replace(/\.git$/, ""), 80);
  return join(labDir, "cache", "donors", `${repo}@${donor.commit.slice(0, 12)}`);
}

export async function readDonorCache(dir, name) {
  return dir ? readJsonSafe(join(dir, name)) : null;
}

export async function writeDonorCache(dir, name, value) {
  if (dir) await writeJson(join(dir, name), value);
}
