import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HandoffPending } from "../src/brain.mjs";
import { advanceRun, createRun } from "../src/pipeline.mjs";
import { log, writeJson } from "../src/util.mjs";

log.quiet = true;
const donor = fileURLToPath(new URL("./fixtures/donor-mit", import.meta.url));

const spec = (name) => ({
  name,
  oneLiner: "Clamps and scales numbers.",
  problem: "Keeping values in range.",
  capabilities: [
    {
      id: "clamp",
      name: "Clamp",
      behavior: "Keeps a value within bounds.",
      inputs: "value, min, max",
      outputs: "number",
      edgeCases: [],
      examples: [{ input: "clamp(5, 0, 3)", output: "3" }],
    },
  ],
  designIdeas: [],
  limitations: [],
  evidence: ["src/index.js"],
});

const proposal = {
  name: "Bounded Mixer",
  tagline: "Clamp, then mix.",
  concept: "Mixes two clamped values.",
  inheritsFromA: ["clamp"],
  inheritsFromB: ["clamp"],
  newCapability: "Mixing.",
  whyItIsNew: "Test creature.",
  api: [{ name: "mix", signature: "mix(a, b, t): number", description: "Linear mix of clamped values." }],
  cliCommand: "mixer",
  cliExamples: ["mixer 1 2 0.5"],
};

const contractTest = `import test from "node:test";
import assert from "node:assert/strict";
import { mix } from "../../src/index.mjs";
test("mixes halfway", () => assert.equal(mix(0, 10, 0.5), 5));
test("clamps t", () => assert.equal(mix(0, 10, 2), 10));
`;

const contract = {
  tests: [{ path: "test/contract/mix.test.mjs", content: contractTest }],
  mapping: [
    { test: "mixes halfway", origin: "fusion", capabilityIds: ["clamp"] },
    { test: "clamps t", origin: "A", capabilityIds: ["clamp"] },
  ],
};

const goodIndex = "export const mix = (a, b, t) => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return a + (b - a) * k; };\n";

async function seededRun(growFiles) {
  const lab = await mkdtemp(join(tmpdir(), "franken-lab-"));
  const runDir = await createRun(lab, donor, donor, { pick: 1, noRea: true, maxRepairs: 0 });
  const answers = {
    "spec-A": spec("A"),
    "spec-B": spec("B"),
    fuse: { proposals: [proposal, proposal, proposal] },
    "contract-p1": contract,
    "grow-p1": { files: growFiles, summary: "test" },
  };
  for (const [stage, value] of Object.entries(answers)) await writeJson(join(runDir, "brain", `${stage}.response.json`), value);
  return { lab, runDir };
}

test("a well-grown creature is ALIVE and gets a hashed lab report", async () => {
  const { lab, runDir } = await seededRun([
    { path: "src/index.mjs", content: goodIndex },
    { path: "package.json", content: '{"name":"bounded-mixer","type":"module"}' },
  ]);
  const { report } = await advanceRun(runDir, { labDir: lab, brainProvider: "handoff" });
  assert.equal(report.verdict.status, "ALIVE");
  assert.equal(report.creature.name, "bounded-mixer");
  assert.equal(report.verification.contract.passed, 2);
  assert.match(report.certificate, /^[0-9a-f]{64}$/);
  const lineage = await readFile(join(runDir, report.creature.dir, "LINEAGE.md"), "utf8");
  assert.match(lineage, /IT'S ALIVE/);
  await rm(lab, { recursive: true, force: true });
});

test("a creature cannot rewrite the lab contract to pass", async () => {
  const { lab, runDir } = await seededRun([
    { path: "src/index.mjs", content: "export const mix = () => 0;\n" },
    { path: "test/contract/mix.test.mjs", content: 'import test from "node:test"; test("mixes halfway", () => {}); test("clamps t", () => {});' },
  ]);
  const { report } = await advanceRun(runDir, { labDir: lab, brainProvider: "handoff" });
  assert.equal(report.verdict.status, "DEAD");
  assert.equal(report.verification.contract.passed, 0);
  await rm(lab, { recursive: true, force: true });
});

test("creature tests run sandboxed: writing files is denied", async () => {
  const { lab, runDir } = await seededRun([
    { path: "src/index.mjs", content: goodIndex },
    {
      path: "test/escape.test.mjs",
      content: 'import test from "node:test"; import { writeFileSync } from "node:fs"; test("escape", () => writeFileSync("pwned.txt", "x"));',
    },
  ]);
  const { report } = await advanceRun(runDir, { labDir: lab, brainProvider: "handoff" });
  assert.equal(report.verification.own.failed, 1);
  assert.equal(report.verdict.status, "UNSTABLE");
  await rm(lab, { recursive: true, force: true });
});

test("the handoff brain pauses a run at the first unanswered stage", async () => {
  const lab = await mkdtemp(join(tmpdir(), "franken-lab-"));
  const runDir = await createRun(lab, donor, donor, { pick: 1, noRea: true });
  await assert.rejects(advanceRun(runDir, { labDir: lab, brainProvider: "handoff" }), (error) => {
    assert.ok(error instanceof HandoffPending);
    assert.equal(error.stage, "spec-A");
    return true;
  });
  await rm(lab, { recursive: true, force: true });
});

test("a copyleft donor is rejected before any brain call", async () => {
  const lab = await mkdtemp(join(tmpdir(), "franken-lab-"));
  const gpl = fileURLToPath(new URL("./fixtures/donor-gpl", import.meta.url));
  const runDir = await createRun(lab, donor, gpl, { noRea: true });
  const { report } = await advanceRun(runDir, { labDir: lab, brainProvider: "handoff" });
  assert.equal(report.verdict.status, "REJECTED");
  assert.match(report.verdict.reason, /copyleft/);
  await rm(lab, { recursive: true, force: true });
});
