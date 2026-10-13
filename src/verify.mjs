import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { run, truncate } from "./util.mjs";

/**
 * Runs the creature's tests under Node's permission model: the creature may
 * read its own folder, but cannot write files, spawn processes or load addons.
 * Donor code is never run; only freshly grown creature code is.
 */
export async function runSuite(creatureDir, files, { timeoutMs = 120_000 } = {}) {
  if (files.length === 0) return { files: 0, total: 0, passed: 0, failed: 0, failures: [], output: "", timedOut: false };
  const args = [
    "--permission",
    `--allow-fs-read=${creatureDir}`,
    "--test",
    "--test-isolation=none",
    "--test-reporter=tap",
    ...files.map((file) => relative(creatureDir, file).split(sep).join("/")),
  ];
  const env = { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", NODE_OPTIONS: "", NO_COLOR: "1" };
  const result = await run(process.execPath, args, { cwd: creatureDir, timeoutMs, env });
  return { files: files.length, ...parseTap(result.stdout + result.stderr), timedOut: result.timedOut };
}

export function parseTap(output) {
  const count = (label) => Number(output.match(new RegExp(`^# ${label} (\\d+)`, "m"))?.[1] ?? 0);
  const failures = [];
  const lines = output.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)not ok \d+ - (.*)$/);
    if (!match) return;
    // Keep the YAML diagnostic block that follows a failing test.
    const detail = [];
    for (let i = index + 1; i < lines.length && i < index + 40; i += 1) {
      if (/^\s*(not )?ok \d+ - /.test(lines[i]) || /^# /.test(lines[i])) break;
      detail.push(lines[i]);
    }
    failures.push({ name: match[2].trim(), detail: truncate(detail.join("\n"), 2_000) });
  });
  return {
    total: count("tests"),
    passed: count("pass"),
    failed: count("fail") + count("cancelled"),
    failures,
    output: truncate(output, 20_000),
  };
}

export async function findTests(creatureDir) {
  const all = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") await visit(full);
      else if (entry.isFile() && /\.test\.[cm]?js$/.test(entry.name)) all.push(full);
    }
  }
  await visit(join(creatureDir, "test"));
  const contractDir = join(creatureDir, "test", "contract") + sep;
  return {
    contract: all.filter((file) => file.startsWith(contractDir)).sort(),
    own: all.filter((file) => !file.startsWith(contractDir)).sort(),
  };
}

export async function verifyCreature(creatureDir, expectedContractTests = 0) {
  const tests = await findTests(creatureDir);
  const contract = await runSuite(creatureDir, tests.contract);
  const own = await runSuite(creatureDir, tests.own);
  // A crash (e.g. a module that fails to load) can hide tests; count those as failed.
  if (contract.total < expectedContractTests) {
    const missing = expectedContractTests - contract.total;
    contract.failed += missing;
    contract.total = expectedContractTests;
    contract.failures.push({ name: `${missing} contract test(s) never ran`, detail: "The suite crashed or did not load." });
  }
  return { contract, own };
}

/** Verdict from the lab's point of view. */
export function verdictFor({ contract, own }) {
  if (contract.total === 0) return "DEAD";
  const contractRate = contract.passed / contract.total;
  const ownOk = own.failed === 0 && !own.timedOut;
  if (contractRate === 1 && ownOk && !contract.timedOut) return "ALIVE";
  if (contractRate >= 0.5) return "UNSTABLE";
  return "DEAD";
}
