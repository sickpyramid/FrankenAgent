import assert from "node:assert/strict";
import test from "node:test";

import { productTerm, scoreCandidate } from "../src/twins.mjs";

const NOW = Date.parse("2026-10-14T00:00:00Z");
const repo = (overrides) => ({
  name: "x",
  full_name: "o/x",
  description: "",
  topics: [],
  stargazers_count: 100,
  pushed_at: "2026-09-01T00:00:00Z",
  language: "TypeScript",
  size: 2048,
  license: { spdx_id: "MIT" },
  archived: false,
  ...overrides,
});

test("productTerm turns names, domains and URLs into a search term", () => {
  assert.equal(productTerm("Spotify"), "spotify");
  assert.equal(productTerm("instagram.com"), "instagram");
  assert.equal(productTerm("https://www.whatsapp.com/download"), "whatsapp");
  assert.equal(productTerm("Google Maps"), "google maps");
});

test("an app clone outranks a utility that merely talks to the product", () => {
  const clone = scoreCandidate(repo({ name: "spotify-clone", description: "A Spotify clone built with React" }), "spotify", NOW);
  const downloader = scoreCandidate(repo({ name: "spotify-dl", description: "Download Spotify songs", stargazers_count: 5000 }), "spotify", NOW);
  assert.ok(clone.score > downloader.score, `${clone.score} <= ${downloader.score}`);
});

test("REA compatibility prefers small, permissive JavaScript/TypeScript projects", () => {
  const small = scoreCandidate(repo({ name: "spotify-clone" }), "spotify", NOW);
  const huge = scoreCandidate(repo({ name: "spotify-clone", size: 400 * 1024, license: null }), "spotify", NOW);
  assert.ok(small.scores.compatibility > huge.scores.compatibility);
  assert.equal(scoreCandidate(repo({ name: "spotify-clone", language: "Rust" }), "spotify", NOW).scores.compatibility < 0.5, true);
});
