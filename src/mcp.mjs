// ReaFuse as an MCP server. By default the calling agent is the brain:
// every stage that needs reasoning is handed back to the agent as a request
// (prompt + JSON schema); the agent answers with reafuse_answer.
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { acquireTarget } from "./acquire.mjs";
import { HandoffPending } from "./brain.mjs";
import { advanceRun, createRun, REAFUSE_VERSION } from "./pipeline.mjs";
import { profileDonor } from "./profile.mjs";
import { analyzeWithRea, summarizeReaEvidence } from "./rea.mjs";
import { exists, log, readJson, writeJson } from "./util.mjs";

const LAB = resolve(process.env.REAFUSE_LAB ?? ".reafuse");
// "handoff" = the agent answers; set REAFUSE_MCP_BRAIN to claude-cli, kilo,
// hybrid or anthropic to let ReaFuse call a model itself instead.
const BRAIN = process.env.REAFUSE_MCP_BRAIN ?? "handoff";

const text = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

function runDirFor(run) {
  if (!/^[\w.+-]+$/.test(run)) throw new Error("Invalid run id.");
  return join(LAB, "runs", run);
}

/** Advances a run and describes what the agent should do next. */
async function step(runDir) {
  const id = runDir.split(/[\\/]/).pop();
  try {
    const { state, report, awaitingPick } = await advanceRun(runDir, { labDir: LAB, brainProvider: BRAIN, awaitPick: true });
    if (awaitingPick) {
      const { proposals } = await readJson(join(runDir, "brain", "fuse.response.json"));
      return {
        run: id,
        next: "pick",
        instructions: "Choose one creature with reafuse_pick (1-based index). Show the user the options if they should decide.",
        proposals: proposals.map((p, i) => ({ pick: i + 1, name: p.name, tagline: p.tagline, newCapability: p.newCapability })),
      };
    }
    return {
      run: id,
      next: "done",
      verdict: report.verdict,
      creature: report.creature ? { name: report.creature.name, dir: join(runDir, report.creature.dir) } : null,
      report: join(runDir, "REPORT.md"),
      donors: state.donors && Object.fromEntries(Object.entries(state.donors).map(([k, d]) => [k, { input: d.input, studied: d.resolution?.repo ?? d.name, license: d.license?.spdx ?? null }])),
    };
  } catch (error) {
    if (!(error instanceof HandoffPending)) throw error;
    return {
      run: id,
      next: "answer",
      stage: error.stage,
      instructions: `You are ReaFuse's brain for stage "${error.stage}". Follow the request below and call reafuse_answer with a JSON object matching its schema exactly.`,
      request: await readFile(error.promptPath, "utf8"),
    };
  }
}

export async function startMcpServer() {
  log.quiet = true; // stdout belongs to the protocol; keep the lab quiet
  const server = new McpServer({ name: "reafuse", version: REAFUSE_VERSION });

  server.registerTool(
    "reafuse_fuse",
    {
      title: "Fuse two projects",
      description:
        "Start a ReaFuse run: dissect two donors (GitHub URL, owner/repo, website or app name such as 'Spotify') with REA, fuse their capabilities and grow a new verified project. Returns the next step: a brain request to answer, a pick, or the verdict.",
      inputSchema: z.object({
        a: z.string().describe("Donor A: repository URL, owner/repo, local path, website or app name."),
        b: z.string().describe("Donor B: repository URL, owner/repo, local path, website or app name."),
        noRea: z.boolean().optional().describe("Skip REA static analysis (faster)."),
        strictLicense: z.boolean().optional().describe("Refuse copyleft and unidentified licenses."),
      }),
    },
    async ({ a, b, noRea = false, strictLicense = false }) => {
      const runDir = await createRun(LAB, a, b, { pick: null, noRea, strictLicense, maxRepairs: 2 });
      return text(await step(runDir));
    },
  );

  server.registerTool(
    "reafuse_answer",
    {
      title: "Answer a brain request",
      description: "Provide the JSON answer for the brain stage that a ReaFuse run is waiting on, then continue the run.",
      inputSchema: z.object({
        run: z.string().describe("Run id returned by reafuse_fuse."),
        stage: z.string().describe("The stage named in the request, e.g. spec-A, fuse, grow-p1."),
        answer: z.union([z.record(z.string(), z.unknown()), z.string()]).describe("The JSON answer (object or JSON string)."),
      }),
    },
    async ({ run, stage, answer }) => {
      const runDir = runDirFor(run);
      if (!/^[\w-]+$/.test(stage)) throw new Error("Invalid stage name.");
      const responsePath = join(runDir, "brain", `${stage}.response.json`);
      await writeJson(responsePath, typeof answer === "string" ? JSON.parse(answer) : answer);
      try {
        return text(await step(runDir));
      } catch (error) {
        // An answer that fails the stage schema is discarded so the agent can retry.
        if (/Invalid brain answer/.test(error.message)) await rm(responsePath, { force: true });
        throw error;
      }
    },
  );

  server.registerTool(
    "reafuse_pick",
    {
      title: "Pick a creature",
      description: "Choose which of the proposed creatures to grow, then continue the run.",
      inputSchema: z.object({ run: z.string(), pick: z.number().int().min(1) }),
    },
    async ({ run, pick }) => {
      const runDir = runDirFor(run);
      const statePath = join(runDir, "run.json");
      const state = await readJson(statePath);
      state.pick = pick;
      await writeJson(statePath, state);
      return text(await step(runDir));
    },
  );

  server.registerTool(
    "reafuse_status",
    {
      title: "Run status",
      description: "Show where a ReaFuse run stands, or list recent runs when no run id is given.",
      inputSchema: z.object({ run: z.string().optional() }),
    },
    async ({ run }) => {
      if (!run) {
        const { readdir } = await import("node:fs/promises");
        return text({ lab: LAB, runs: (await readdir(join(LAB, "runs")).catch(() => [])).sort().reverse().slice(0, 20) });
      }
      const runDir = runDirFor(run);
      if (!(await exists(join(runDir, "run.json")))) throw new Error(`Run not found: ${run}`);
      const reportPath = join(runDir, "REPORT.md");
      return text((await exists(reportPath)) ? await readFile(reportPath, "utf8") : await step(runDir));
    },
  );

  server.registerTool(
    "reafuse_dissect",
    {
      title: "Dissect one donor",
      description: "Profile a single donor with REA (modules, exports, imports, license) without fusing. No brain needed.",
      inputSchema: z.object({ donor: z.string().describe("Repository URL, owner/repo or local path.") }),
    },
    async ({ donor }) => {
      const target = await acquireTarget(donor, join(LAB, "cache"));
      const profile = await profileDonor(target.path);
      const rea = await analyzeWithRea(target.path);
      return text({
        donor: { name: target.name, url: target.url ?? null, commit: target.commit },
        license: profile.license,
        entrypoints: profile.entrypoints,
        files: profile.fileCount,
        rea: rea.ok ? summarizeReaEvidence(rea.evidence) : { unavailable: rea.error },
      });
    },
  );

  await server.connect(new StdioServerTransport());
}
