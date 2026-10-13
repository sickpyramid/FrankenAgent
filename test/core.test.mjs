import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyTarget, acquireTarget } from "../src/acquire.mjs";
import { categorize, detectLicense, licenseGate } from "../src/license.mjs";
import { checkOriginality } from "../src/originality.mjs";
import { profileDonor } from "../src/profile.mjs";
import { safeJoin } from "../src/util.mjs";
import { extractJson } from "../src/brain.mjs";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const donorFile = join(fixtures, "donor-mit", "src", "index.js");

test("classifyTarget recognises git hosts, shorthand, websites and local paths", () => {
  assert.deepEqual(classifyTarget("https://github.com/vercel/ms"), { kind: "git", url: "https://github.com/vercel/ms.git", name: "ms" });
  assert.equal(classifyTarget("github.com/sindresorhus/pretty-bytes.git").kind, "git");
  assert.equal(classifyTarget("vercel/ms").kind, "maybe-github");
  assert.equal(classifyTarget("https://example.com/app").kind, "website");
  assert.equal(classifyTarget("./some/dir").kind, "local");
  assert.equal(classifyTarget("Spotify").kind, "name");
  assert.equal(classifyTarget("instagram.com").kind, "website");
  assert.equal(classifyTarget("https://github.com/lukeed/klona/tree/main").url, "https://github.com/lukeed/klona.git");
});

test("acquireTarget refuses names, websites, and (on servers) local paths", async () => {
  await assert.rejects(acquireTarget("https://example.com", tmpdir()), /not a repository/);
  await assert.rejects(acquireTarget("Spotify", tmpdir()), /open-source twin/);
  await assert.rejects(acquireTarget(join(fixtures, "donor-mit"), tmpdir(), { allowLocal: false }), /disabled/);
});

test("acquireTarget accepts a local donor without treating a parent repo as its own", async () => {
  const donor = await acquireTarget(join(fixtures, "donor-mit"), tmpdir());
  assert.equal(donor.kind, "local");
  assert.equal(donor.commit, null);
});

test("license detection and gate", async () => {
  assert.equal(categorize("MIT OR GPL-3.0"), "permissive");
  assert.equal(categorize("AGPL-3.0"), "copyleft");
  assert.equal(categorize(null), "unknown");

  const mit = await detectLicense(join(fixtures, "donor-mit"), { license: "MIT" });
  assert.equal(mit.detectedFromFile, "MIT");
  assert.equal(licenseGate(mit).ok, true);

  const gpl = await detectLicense(join(fixtures, "donor-gpl"), { license: "GPL-3.0-only" });
  assert.equal(licenseGate(gpl).ok, false);
  assert.equal(licenseGate(gpl, { allowCopyleft: true }).ok, true);
  assert.equal(licenseGate({ category: "unknown" }).ok, false);
  assert.equal(licenseGate({ category: "unknown" }, { owned: true }).ok, true);
});

test("profileDonor reads metadata, entrypoints and sources without executing them", async () => {
  const profile = await profileDonor(join(fixtures, "donor-mit"));
  assert.equal(profile.name, "fixture-donor");
  assert.deepEqual(profile.entrypoints, ["src/index.js"]);
  assert.equal(profile.sources[0].path, "src/index.js");
  assert.equal(profile.license.spdx, "MIT");
});

test("originality scan passes original code", async () => {
  const result = await checkOriginality(
    [{ path: "src/index.mjs", content: "export const limit = (x, lo, hi) => x < lo ? lo : x > hi ? hi : x;\n" }],
    [donorFile],
  );
  assert.equal(result.passed, true);
  assert.equal(result.overlap, 0);
});

test("originality scan catches copied code even when reformatted", async () => {
  const { readFile } = await import("node:fs/promises");
  const copied = (await readFile(donorFile, "utf8"))
    .replace(/\n\s*/g, " ")
    .replace(/export function/g, "/* mine! */ export function");
  const result = await checkOriginality([{ path: "src/stolen.mjs", content: copied }], [donorFile]);
  assert.equal(result.passed, false);
  assert.ok(result.longestCopiedTokens >= 60);
});

test("safeJoin keeps model-written paths inside the creature", () => {
  const root = join(tmpdir(), "creature");
  assert.ok(safeJoin(root, "src/index.mjs").startsWith(root));
  for (const bad of ["../escape.js", "/etc/passwd", "C:/Windows/x", "node_modules/x/index.js", "src/../../x"]) {
    assert.throws(() => safeJoin(root, bad), undefined, bad);
  }
});

test("extractJson finds JSON inside fenced or chatty answers", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('{"b":[1,2]}'), { b: [1, 2] });
});
