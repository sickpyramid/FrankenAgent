import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";

import { createBrain, providerChain } from "../src/brain.mjs";
import { log } from "../src/util.mjs";

log.quiet = true;
process.env.REAFUSE_KILO_BACKOFF_MS = "0";
const Answer = z.object({ product: z.string(), score: z.number() });

function mockFetch(responses) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const next = responses.shift() ?? responses.at(-1);
    return new Response(next.body, { status: next.status ?? 200 });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

const chat = (content) => ({ body: JSON.stringify({ model: "test-model", choices: [{ message: { content }, finish_reason: "stop" }] }) });

test("hybrid routes routine stages to Kilo and code-writing stages to Claude CLI", () => {
  for (const stage of ["resolve-A", "spec-B", "fuse"]) assert.deepEqual(providerChain("hybrid", stage), ["kilo", "llm7", "pollinations", "claude-cli"]);
  for (const stage of ["contract-p1", "grow-p2", "repair-p1-1"]) assert.deepEqual(providerChain("hybrid", stage), ["claude-cli", "kilo"]);
  assert.deepEqual(providerChain("kilo", "grow-p1"), ["kilo"]);
});

test("the Kilo brain sends the schema in plain mode and accepts fenced JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reafuse-brain-"));
  const mock = mockFetch([chat('Here you go:\n```json\n{"product":"Spotify","score":3}\n```')]);
  try {
    const brain = createBrain({ provider: "kilo", runDir: dir });
    const answer = await brain.ask({ stage: "resolve-A", system: "sys", prompt: "find twins", schema: Answer });
    assert.deepEqual(answer, { product: "Spotify", score: 3 });
    assert.equal(mock.calls[0].response_format, undefined);
    assert.match(mock.calls[0].messages[1].content, /JSON Schema/);
    const meta = JSON.parse(await readFile(join(dir, "brain", "resolve-A.meta.json"), "utf8"));
    assert.equal(meta.provider, "kilo");
  } finally {
    mock.restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the Kilo brain retries upstream errors and empty answers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reafuse-brain-"));
  const mock = mockFetch([{ status: 400, body: '{"error":"The upstream provider was unable to process the request"}' }, chat(""), chat('{"product":"x","score":1}')]);
  try {
    const brain = createBrain({ provider: "kilo", runDir: dir });
    assert.deepEqual(await brain.ask({ stage: "spec-A", system: "s", prompt: "p", schema: Answer }), { product: "x", score: 1 });
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
    await rm(dir, { recursive: true, force: true });
  }
});

test("hybrid reports every provider that failed when none can answer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reafuse-brain-"));
  const mock = mockFetch([chat('{"product":"x"}')]); // fails schema validation
  const previous = process.env.REAFUSE_CLAUDE_BIN;
  process.env.REAFUSE_CLAUDE_BIN = join(dir, "missing-claude");
  try {
    const brain = createBrain({ provider: "hybrid", runDir: dir });
    await assert.rejects(brain.ask({ stage: "spec-A", system: "s", prompt: "p", schema: Answer }), /kilo: .*claude-cli: /s);
  } finally {
    mock.restore();
    if (previous === undefined) delete process.env.REAFUSE_CLAUDE_BIN;
    else process.env.REAFUSE_CLAUDE_BIN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Kilo backs up Claude: fallback chains and capacity cooldown", async () => {
  const { providerChain, CAPACITY, claudeCooldown, claudeCooldownPath } = await import("../src/brain.mjs");
  assert.deepEqual(providerChain("claude-cli", "grow-p1"), ["claude-cli", "kilo"]);
  assert.deepEqual(providerChain("claude-cli", "spec-A"), ["claude-cli", "kilo", "llm7", "pollinations"]);
  assert.deepEqual(providerChain("free", "grow-p1"), ["kilo"]);
  assert.deepEqual(providerChain("free", "fuse"), ["kilo", "llm7", "pollinations"]);
  assert.deepEqual(providerChain("anthropic", "spec-A"), ["anthropic", "kilo", "llm7", "pollinations"]);
  assert.deepEqual(providerChain("hybrid", "grow-p1", { claudeCooling: true }), ["kilo", "claude-cli"]);
  assert.deepEqual(providerChain("claude-cli", "grow-p1", { claudeCooling: true }), ["kilo", "claude-cli"]);
  assert.ok(CAPACITY.test("Claude CLI error: Claude AI usage limit reached|1791970000"));
  assert.ok(CAPACITY.test("API Error: 529 Overloaded"));
  assert.ok(!CAPACITY.test("Invalid brain answer: missing field"));

  const lab = await mkdtemp(join(tmpdir(), "reafuse-lab-"));
  const { writeJson } = await import("../src/util.mjs");
  assert.equal(await claudeCooldown(lab), null);
  await writeJson(claudeCooldownPath(lab), { until: Date.now() + 60_000 });
  assert.ok(await claudeCooldown(lab));
  await writeJson(claudeCooldownPath(lab), { until: Date.now() - 1 });
  assert.equal(await claudeCooldown(lab), null);
  await rm(lab, { recursive: true, force: true });
});
