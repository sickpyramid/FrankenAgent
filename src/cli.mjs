import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { acquireTarget } from "./acquire.mjs";
import { autoProvider, findClaudeCli, HandoffPending } from "./brain.mjs";
import { licenseGate } from "./license.mjs";
import { advanceRun, createRun, FRANKEN_VERSION } from "./pipeline.mjs";
import { profileDonor } from "./profile.mjs";
import { analyzeWithRea, reaVersion, summarizeReaEvidence } from "./rea.mjs";
import { exists, log } from "./util.mjs";

const HELP = `FrankenAgent ${FRANKEN_VERSION} — built on REA (Reverse Engineer Anything).
Fuse two projects into a new, verified creature.

Usage
  franken fuse <donorA> <donorB> [options]   Dissect, fuse, grow and verify
  franken resume <run-id|run-dir> [options]  Continue a run (after a handoff, or with a new --pick)
  franken dissect <donor> [--no-rea]         Profile one donor (no brain needed)
  franken runs                               List runs in this lab
  franken doctor                             Check REA, git and brain availability

Donors
  A GitHub URL, owner/repo, a local directory, a website (instagram.com) or a
  product name ("Spotify"). Websites and names are resolved to open-source twins.

Options
  --pick <n>          Which of the 3 proposed creatures to grow (default: ask, or 1)
  --brain <name>      anthropic | claude-cli | handoff (default: auto)
  --model <id>        Model for the brain (default: claude-opus-5-5)
  --lab <dir>         Lab directory (default: ./.franken)
  --max-repairs <n>   Repair attempts after a failed verification (default: 2)
  --no-rea            Skip REA static analysis
  --allow-copyleft    Allow copyleft donors (behavior only)
  --owned             You own both donors (skips the license gate)
  --await-pick        Stop after proposing creatures (exit code 4)
  --no-local          Refuse local directories (for servers)
  -h, --help`;

export async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      pick: { type: "string" },
      brain: { type: "string" },
      model: { type: "string" },
      lab: { type: "string" },
      "max-repairs": { type: "string" },
      "no-rea": { type: "boolean", default: false },
      "allow-copyleft": { type: "boolean", default: false },
      owned: { type: "boolean", default: false },
      "await-pick": { type: "boolean", default: false },
      "no-local": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  const labDir = resolve(values.lab ?? ".franken");

  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  if (command === "fuse") {
    if (rest.length !== 2) throw new Error("fuse needs exactly two donors.");
    const runDir = await createRun(labDir, rest[0], rest[1], {
      pick: values.pick ? Number(values.pick) : null,
      noRea: values["no-rea"],
      allowCopyleft: values["allow-copyleft"],
      owned: values.owned,
      allowLocal: !values["no-local"],
      maxRepairs: values["max-repairs"] ? Number(values["max-repairs"]) : 2,
    });
    log.info(`Run: ${runDir}`);
    return advance(runDir, labDir, values);
  }

  if (command === "resume") {
    if (!rest[0]) throw new Error("resume needs a run id or run directory.");
    const runDir = (await exists(join(rest[0], "run.json"))) ? resolve(rest[0]) : join(labDir, "runs", rest[0]);
    if (!(await exists(join(runDir, "run.json")))) throw new Error(`Run not found: ${rest[0]}`);
    if (values.pick) {
      const { readJson, writeJson } = await import("./util.mjs");
      const state = await readJson(join(runDir, "run.json"));
      state.pick = Number(values.pick);
      await writeJson(join(runDir, "run.json"), state);
    }
    return advance(runDir, labDir, values);
  }

  if (command === "dissect") {
    if (!rest[0]) throw new Error("dissect needs a donor.");
    const donor = await acquireTarget(rest[0], join(labDir, "cache"));
    const profile = await profileDonor(donor.path);
    const output = {
      donor,
      license: profile.license,
      gate: licenseGate(profile.license),
      name: profile.name,
      description: profile.description,
      entrypoints: profile.entrypoints,
      files: profile.fileCount,
      sources: profile.sources.map((file) => file.path),
      tests: profile.tests.map((file) => file.path),
    };
    if (!values["no-rea"]) {
      const rea = await analyzeWithRea(donor.path);
      output.rea = rea.ok ? summarizeReaEvidence(rea.evidence) : { unavailable: rea.error };
    }
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  if (command === "runs") {
    const runs = await readdir(join(labDir, "runs")).catch(() => []);
    console.log(runs.length ? runs.join("\n") : "No runs yet.");
    return 0;
  }

  if (command === "doctor") {
    const { run } = await import("./util.mjs");
    const git = await run("git", ["--version"], { timeoutMs: 10_000 });
    console.log(
      JSON.stringify(
        {
          frankenagent: FRANKEN_VERSION,
          node: process.version,
          rea: reaVersion(),
          git: git.code === 0 ? git.stdout.trim() : "missing",
          brain: {
            auto: autoProvider(),
            anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
            claudeCli: findClaudeCli(),
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  throw new Error(`Unknown command "${command}". Try franken --help.`);
}

async function advance(runDir, labDir, values) {
  try {
    const { report } = await advanceRun(runDir, {
      labDir,
      brainProvider: values.brain,
      model: values.model,
      interactive: process.stdin.isTTY && !values.pick && !values["await-pick"],
      awaitPick: values["await-pick"],
    });
    if (!report) {
      process.stderr.write(`
🧬 Three creatures proposed. Pick one with: franken resume "${runDir}" --pick <n>
`);
      return 4;
    }
    const status = report.verdict.status;
    process.stderr.write(`\n══════════════════════════════════════\n  ${status}${report.creature ? ` — ${report.creature.name}` : ""}\n══════════════════════════════════════\n`);
    if (report.verdict.reason) process.stderr.write(`  ${report.verdict.reason}\n`);
    process.stderr.write(`  Report: ${join(runDir, "REPORT.md")}\n`);
    if (report.creature?.dir) process.stderr.write(`  Creature: ${join(runDir, report.creature.dir)}\n`);
    return status === "ALIVE" ? 0 : 1;
  } catch (error) {
    if (error instanceof HandoffPending) {
      process.stderr.write(
        `\n🤝 Brain handoff: stage "${error.stage}" needs an answer.\n   Prompt:   ${error.promptPath}\n   Answer →  ${error.responsePath}\n   Then run: franken resume "${runDir}"\n`,
      );
      return 3;
    }
    throw error;
  }
}
