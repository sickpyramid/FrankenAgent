import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { acquireTarget } from "./acquire.mjs";
import { autoProvider, findClaudeCli, HandoffPending } from "./brain.mjs";
import { licenseGate } from "./license.mjs";
import { advanceRun, createRun, REAFUSE_VERSION } from "./pipeline.mjs";
import { profileDonor } from "./profile.mjs";
import { analyzeWithRea, reaVersion, summarizeReaEvidence } from "./rea.mjs";
import { exists, log } from "./util.mjs";

const HELP = `ReaFuse ${REAFUSE_VERSION} — built on REA (Reverse Engineer Anything).
Fuse two projects into a new, verified creature.

Usage
  reafuse fuse <donorA> <donorB> [options]   Dissect, fuse, grow and verify
  reafuse resume <run-id|run-dir> [options]  Continue a run (after a handoff, or with a new --pick)
  reafuse dissect <donor> [--no-rea]         Profile one donor (no brain needed)
  reafuse runs                               List runs in this lab
  reafuse mcp                                Run as an MCP server (your agent is the brain)
  reafuse doctor                             Check REA, git and brain availability

Donors
  A GitHub URL, owner/repo, a local directory, a website (instagram.com) or a
  product name ("Spotify"). Websites and names are resolved to open-source twins.

Options
  --pick <n>          Which of the 3 proposed creatures to grow (default: ask, or 1)
  --brain <name>      auto | kilo | claude-cli | hybrid | anthropic | handoff (default: auto)
                      auto: Anthropic key, else Kilo free (+ your Claude CLI for code if installed)
                      hybrid: Kilo Gateway for lookups/specs/concepts,
                      Claude CLI for contract/grow/repair, each falling back
  --model <id>        Model for the brain (default: claude-opus-5-5)
  --lab <dir>         Lab directory (default: ./.reafuse)
  --max-repairs <n>   Repair attempts after a failed verification (default: 2)
  --no-rea            Skip REA static analysis
  --strict-license    Refuse copyleft and unidentified licenses (default: record and warn)
  --allow-copyleft    With --strict-license, still allow copyleft donors
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
      "strict-license": { type: "boolean", default: false },
      "no-local": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  const labDir = resolve(values.lab ?? ".reafuse");

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
      strictLicense: values["strict-license"],
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

  if (command === "mcp") {
    const { startMcpServer } = await import("./mcp.mjs");
    await startMcpServer();
    return undefined; // the stdio transport keeps the process alive
  }

  if (command === "runs") {
    const runs = await readdir(join(labDir, "runs")).catch(() => []);
    console.log(runs.length ? runs.join("\n") : "No runs yet.");
    return 0;
  }

  if (command === "doctor") {
    const { run } = await import("./util.mjs");
    const git = await run("git", ["--version"], { timeoutMs: 10_000 });
    const claudeBin = findClaudeCli();
    const claudeLoggedIn = claudeBin
      ? await run(claudeBin, ["auth", "status"], { timeoutMs: 30_000 }).then((r) => {
          try {
            return Boolean(JSON.parse(r.stdout).loggedIn);
          } catch {
            return false;
          }
        })
      : false;
    const brain = values.brain ?? process.env.REAFUSE_BRAIN ?? "auto";
    const resolved = brain === "auto" ? autoProvider() : brain;
    const major = Number(process.versions.node.split(".")[0]);
    const report = {
      reafuse: REAFUSE_VERSION,
      node: process.version,
      rea: reaVersion(),
      git: git.code === 0 ? git.stdout.trim() : null,
      brain: { setting: brain, uses: resolved, anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY), kiloKey: Boolean(process.env.KILO_API_KEY), claudeCli: claudeBin, claudeLoggedIn },
    };
    if (values.json) {
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }
    const line = (ok, label, detail, fix) => console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(10)} ${detail}${!ok && fix ? `
      → ${fix}` : ""}`);
    console.log(`ReaFuse ${REAFUSE_VERSION} doctor
`);
    line(major >= 22, "Node.js", process.version, "Install Node.js 22 or newer from https://nodejs.org");
    line(Boolean(report.git), "git", report.git ?? "not found", "Install git from https://git-scm.com");
    line(Boolean(report.rea), "REA", report.rea ? `rea-agents ${report.rea}` : "not installed", "Run npm install inside the ReaFuse folder");
    const brainNotes = {
      anthropic: "Anthropic API key",
      hybrid: claudeLoggedIn ? "Kilo (free) for routine stages + your Claude CLI for code" : "Kilo (free); Claude CLI found but not logged in, so Kilo does everything",
      kilo: "Kilo Gateway free models, no account needed",
      "claude-cli": claudeLoggedIn ? "your Claude CLI login" : "Claude CLI is not logged in",
      handoff: "you (or your agent) answer each step by hand",
    };
    const brainOk = resolved !== "claude-cli" || claudeLoggedIn;
    line(brainOk, "brain", `${resolved}: ${brainNotes[resolved] ?? resolved}`, "Run `claude` once and type /login, or use --brain kilo");
    console.log(`
  Try it:  reafuse fuse vercel/ms sindresorhus/pretty-bytes
  Or with app names:  reafuse fuse Spotify WhatsApp`);
    return 0;
  }

  throw new Error(`Unknown command "${command}". Try reafuse --help.`);
}

async function advance(runDir, labDir, values) {
  try {
    const { report } = await advanceRun(runDir, {
      labDir,
      brainProvider: values.brain ?? process.env.REAFUSE_BRAIN,
      model: values.model,
      interactive: process.stdin.isTTY && !values.pick && !values["await-pick"],
      awaitPick: values["await-pick"],
    });
    if (!report) {
      process.stderr.write(`
🧬 Three creatures proposed. Pick one with: reafuse resume "${runDir}" --pick <n>
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
        `\n🤝 Brain handoff: stage "${error.stage}" needs an answer.\n   Prompt:   ${error.promptPath}\n   Answer →  ${error.responsePath}\n   Then run: reafuse resume "${runDir}"\n`,
      );
      return 3;
    }
    throw error;
  }
}
