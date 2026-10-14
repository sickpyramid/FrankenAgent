#!/usr/bin/env node
// ReaFuse web lab: a zero-dependency HTTP server that queues fusions,
// runs them through the CLI in child processes and streams the lab log live.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { appendFile, open, readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { autoProvider, findClaudeCli } from "../src/brain.mjs";
import { classifyTarget } from "../src/acquire.mjs";
import { createRun, REAFUSE_VERSION } from "../src/pipeline.mjs";
import { reaVersion } from "../src/rea.mjs";
import { exists, readJson, run as runCommand, safeJoin, writeJson } from "../src/util.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "web", "public");
const SHOWCASE = join(ROOT, "showcase");
const LAB = resolve(process.env.REAFUSE_LAB ?? join(ROOT, ".reafuse"));
const PORT = Number(process.env.PORT ?? 4400);
const BRAIN = process.env.REAFUSE_BRAIN ?? "auto";
const MAX_CONCURRENT = Number(process.env.REAFUSE_MAX_CONCURRENT ?? 1);
const RUNS_PER_HOUR = Number(process.env.REAFUSE_RUNS_PER_HOUR ?? 6);
const JOB_TIMEOUT_MS = 45 * 60_000;

const queue = [];
const active = new Map(); // runId -> child process
const hits = new Map(); // ip -> timestamps

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png" };

// ── jobs ────────────────────────────────────────────────────────────────────

function enqueue(runId, args) {
  if (active.has(runId) || queue.some((job) => job.runId === runId)) return;
  queue.push({ runId, args });
  pump();
}

function pump() {
  while (active.size < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    start(job);
  }
}

async function start({ runId, args }) {
  const runDir = join(LAB, "runs", runId);
  const logPath = join(runDir, "live.log");
  await appendFile(logPath, `\n▶ ${new Date().toISOString()} lab process started\n`);
  const child = spawn(process.execPath, [join(ROOT, "bin", "reafuse.mjs"), ...args, "--lab", LAB], {
    cwd: ROOT,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "FORCE_COLOR" && key !== "NO_COLOR")),
    stdio: ["ignore", "pipe", "pipe"],
  });
  active.set(runId, child);
  const write = (chunk) => appendFile(logPath, scrub(chunk.toString("utf8"))).catch(() => {});
  child.stdout.on("data", write);
  child.stderr.on("data", write);
  const timer = setTimeout(() => child.kill("SIGKILL"), JOB_TIMEOUT_MS);
  child.on("close", async (code) => {
    clearTimeout(timer);
    active.delete(runId);
    await appendFile(logPath, `\n■ lab process exited with code ${code}\n`).catch(() => {});
    await writeJson(join(runDir, "live.json"), { exitCode: code, endedAt: new Date().toISOString() }).catch(() => {});
    pump();
  });
}

/** Masks server paths so the public log never reveals the filesystem layout. */
function scrub(text) {
  let out = text;
  for (const [path, label] of [[LAB, "<lab>"], [ROOT, "<reafuse>"]]) {
    out = out.split(path).join(label).split(path.replaceAll("\\", "/")).join(label);
  }
  return out.replace(/reafuse resume "[^"]*"/g, "reafuse resume <run>");
}

function queuePosition(runId) {
  if (active.has(runId)) return 0;
  const index = queue.findIndex((job) => job.runId === runId);
  return index === -1 ? null : index + 1;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", ...headers });
  res.end(payload);
}

async function readBody(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 3_600_000);
  if (recent.length >= RUNS_PER_HOUR) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function cleanDonor(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 200 || /[\u0000-\u001f]/.test(text)) return null;
  const kind = classifyTarget(text).kind;
  if (kind === "local") return null; // never let visitors point at server paths
  return text;
}

/** Resolves a run id (lab run or showcase:<name>) to its folders. */
async function locate(id) {
  if (id.startsWith("showcase:")) {
    const name = id.slice("showcase:".length);
    if (!/^[\w-]+$/.test(name)) return null;
    const dir = join(SHOWCASE, name);
    if (!(await exists(join(dir, "report.json")))) return null;
    return { id, dir, brainDir: join(dir, "lab"), creatureDir: join(dir, "creature"), showcase: true };
  }
  if (!/^[\w.+-]+$/.test(id)) return null;
  const dir = join(LAB, "runs", id);
  if (!(await exists(join(dir, "run.json")))) return null;
  return { id, dir, brainDir: join(dir, "brain"), creatureDir: null, showcase: false };
}

async function readJsonSafe(path) {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

async function runView(found) {
  const report = await readJsonSafe(join(found.dir, "report.json"));
  const state = found.showcase ? null : await readJsonSafe(join(found.dir, "run.json"));
  const fuse = await readJsonSafe(join(found.brainDir, "fuse.response.json"));
  const specA = await readJsonSafe(join(found.brainDir, "spec-A.response.json"));
  const specB = await readJsonSafe(join(found.brainDir, "spec-B.response.json"));
  const live = found.showcase ? null : await readJsonSafe(join(found.dir, "live.json"));
  const creatureDir = found.showcase ? found.creatureDir : report?.creature?.dir ? join(found.dir, report.creature.dir) : null;
  return {
    id: found.id,
    showcase: found.showcase,
    inputs: state?.inputs ?? (report ? { A: report.donors.A.input, B: report.donors.B.input } : null),
    phase: found.showcase ? "done" : state?.phase ?? "queued",
    pick: state?.pick ?? null,
    donors: state?.donors ? Object.fromEntries(Object.entries(state.donors).map(([k, d]) => [k, { name: d.name, url: d.url ?? null, commit: d.commit, license: d.license?.spdx ?? null, gate: d.gate, resolution: d.resolution ?? null }])) : report?.donors ?? null,
    specs: specA || specB ? { A: specA, B: specB } : null,
    proposals: fuse?.proposals ?? null,
    report,
    reportMarkdown: (await exists(join(found.dir, "REPORT.md"))) ? await readFile(join(found.dir, "REPORT.md"), "utf8") : null,
    files: creatureDir ? await listFiles(creatureDir) : [],
    queuePosition: found.showcase ? null : queuePosition(found.id),
    running: active.has(found.id),
    exitCode: live?.exitCode ?? null,
  };
}

async function listFiles(dir) {
  const out = [];
  async function visit(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === "node_modules") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(join(current, entry.name), rel);
      else out.push(rel);
    }
  }
  await visit(dir, "");
  return out.sort();
}

/**
 * Health checks never spend model tokens: Claude CLI is checked with
 * "claude auth status", Kilo's free tier needs no check at all.
 */
async function claudeStatus() {
  const bin = findClaudeCli();
  if (!bin) return { ready: false, detail: "claude-cli not installed" };
  const probe = await runCommand(bin, ["auth", "status"], { timeoutMs: 30_000 });
  try {
    return JSON.parse(probe.stdout).loggedIn ? { ready: true, detail: "claude-cli" } : { ready: false, detail: "claude-cli logged out" };
  } catch {
    return { ready: false, detail: "claude-cli auth status unavailable" };
  }
}

function kiloStatus() {
  const model = process.env.REAFUSE_KILO_MODEL ?? "kilo-auto/free";
  const keyed = Boolean(process.env.KILO_API_KEY || process.env.KILO_API_KEY_FILE);
  const ready = keyed || /[/:]free$/.test(model);
  return { ready, detail: ready ? `kilo ${model}` : "kilo needs an API key for paid models" };
}

async function brainStatus() {
  const provider = BRAIN === "auto" ? autoProvider() : BRAIN;
  const parts = [];
  if (provider === "claude-cli" || provider === "hybrid") parts.push(await claudeStatus());
  if (provider === "kilo" || provider === "hybrid") parts.push(kiloStatus());
  if (provider === "anthropic") parts.push({ ready: true, detail: "anthropic api" });
  if (provider === "handoff") parts.push({ ready: false, detail: "handoff brain needs an operator" });
  // Hybrid stays open while either half works: each stage falls back to the other.
  const ready = parts.some((part) => part.ready);
  return { provider, ready, detail: parts.map((p) => `${p.detail} ${p.ready ? "✓" : "✕"}`).join(" · "), checkedAt: Date.now() };
}

let brainCache = null;
let brainPending = null;
async function cachedBrainStatus() {
  const maxAge = brainCache?.ready ? 10 * 60_000 : 60_000;
  if (brainCache && Date.now() - brainCache.checkedAt < maxAge) return brainCache;
  brainPending ??= brainStatus().finally(() => (brainPending = null));
  brainCache = await brainPending;
  return brainCache;
}

// ── routes ──────────────────────────────────────────────────────────────────

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean).slice(1); // drop "api"

  if (req.method === "GET" && parts[0] === "status") {
    const brain = await cachedBrainStatus();
    return send(res, 200, { reafuse: REAFUSE_VERSION, rea: reaVersion(), brain, queue: queue.length, running: active.size });
  }

  if (req.method === "GET" && parts[0] === "gallery") {
    const items = [];
    for (const name of await readdir(SHOWCASE).catch(() => [])) {
      const report = await readJsonSafe(join(SHOWCASE, name, "report.json"));
      if (report) items.push(card(`showcase:${name}`, report, true));
    }
    const runs = (await readdir(join(LAB, "runs")).catch(() => [])).sort().reverse().slice(0, 60);
    for (const id of runs) {
      const report = await readJsonSafe(join(LAB, "runs", id, "report.json"));
      if (report?.creature) items.push(card(id, report, false));
    }
    return send(res, 200, { items });
  }

  if (req.method === "POST" && parts[0] === "fuse") {
    const body = await readBody(req);
    const a = cleanDonor(body.a);
    const b = cleanDonor(body.b);
    if (!a || !b) return send(res, 400, { error: "Give two donors: a repository URL, owner/repo, a website or an app name." });
    const brain = await cachedBrainStatus();
    if (!brain.ready) return send(res, 503, { error: "The lab's brain is offline right now. Browse the specimens while we reconnect it." });
    if (rateLimited(clientIp(req))) return send(res, 429, { error: "The lab is cooling down. Try again in a little while." });
    const runDir = await createRun(LAB, a, b, { pick: null, noRea: false, allowLocal: false, allowCopyleft: body.allowCopyleft === true, maxRepairs: 2 });
    const id = runDir.split(sep).pop();
    await appendFile(join(runDir, "live.log"), `⚡ Subjects received: [A] ${a}  ×  [B] ${b}\n`);
    enqueue(id, ["resume", runDir, "--await-pick", "--brain", BRAIN]);
    return send(res, 202, { id });
  }

  const found = parts[0] === "runs" && parts[1] ? await locate(decodeURIComponent(parts[1])) : null;
  if (parts[0] === "runs" && !found) return send(res, 404, { error: "No such experiment." });

  if (req.method === "GET" && parts[2] === undefined) return send(res, 200, await runView(found));

  if (req.method === "POST" && parts[2] === "pick" && !found.showcase) {
    const body = await readBody(req);
    const statePath = join(found.dir, "run.json");
    const state = await readJson(statePath);
    const proposals = (await readJsonSafe(join(found.brainDir, "fuse.response.json")))?.proposals ?? [];
    const pick = Number(body.pick);
    if (state.phase !== "awaiting-pick" || !Number.isInteger(pick) || pick < 1 || pick > proposals.length) {
      return send(res, 409, { error: "This experiment is not waiting for a pick." });
    }
    state.pick = pick;
    state.phase = "growing";
    await writeJson(statePath, state);
    await appendFile(join(found.dir, "live.log"), `\n🧬 Subject chosen: #${pick} ${proposals[pick - 1].name}\n`);
    enqueue(found.id, ["resume", found.dir, "--brain", BRAIN]);
    return send(res, 202, { ok: true });
  }

  if (req.method === "GET" && parts[2] === "file") {
    const view = await runView(found);
    const rel = url.searchParams.get("path") ?? "";
    if (!view.files.includes(rel)) return send(res, 404, { error: "No such file." });
    const base = found.showcase ? found.creatureDir : join(found.dir, view.report.creature.dir);
    const content = await readFile(safeJoin(base, rel), "utf8");
    return send(res, 200, { path: rel, content });
  }

  if (req.method === "GET" && parts[2] === "stream") return stream(req, res, found);

  return send(res, 404, { error: "Unknown endpoint." });
}

function card(id, report, showcase) {
  return {
    id,
    showcase,
    name: report.creature?.name ?? null,
    tagline: report.creature?.tagline ?? null,
    verdict: report.verdict.status,
    donors: { A: report.donors.A?.name, B: report.donors.B?.name },
    contract: report.verification?.contract ? `${report.verification.contract.passed}/${report.verification.contract.total}` : null,
    overlap: report.originality?.overlap ?? null,
    createdAt: report.createdAt,
  };
}

/** Server-sent events: replays the lab log, then tails it. */
async function stream(req, res, found) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  const logPath = join(found.dir, "live.log");
  let offset = 0;
  let lastPhase = null;
  let closed = false;
  req.on("close", () => (closed = true));

  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (found.showcase) {
    emit("phase", { phase: "done" });
    return res.end();
  }

  while (!closed) {
    try {
      const info = await stat(logPath);
      if (info.size > offset) {
        const handle = await open(logPath, "r");
        const { buffer, bytesRead } = await handle.read(Buffer.alloc(Math.min(info.size - offset, 256 * 1024)), 0, Math.min(info.size - offset, 256 * 1024), offset);
        await handle.close();
        offset += bytesRead;
        emit("log", { text: buffer.subarray(0, bytesRead).toString("utf8") });
      }
    } catch {
      // log not created yet
    }
    const state = await readJsonSafe(join(found.dir, "run.json"));
    const phase = active.has(found.id) ? state?.phase ?? "running" : state?.phase ?? "queued";
    const key = `${phase}|${active.has(found.id)}|${queuePosition(found.id)}`;
    if (key !== lastPhase) {
      lastPhase = key;
      emit("phase", { phase, running: active.has(found.id), queuePosition: queuePosition(found.id) });
    }
    res.write(": ping\n\n");
    await new Promise((done) => setTimeout(done, 700));
  }
}

async function serveStatic(req, res, url) {
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  let file;
  try {
    file = safeJoin(PUBLIC, rel);
  } catch {
    return send(res, 404, "Not found");
  }
  if (!(await exists(file)) || !(await stat(file)).isFile()) {
    file = join(PUBLIC, "index.html"); // single-page app fallback
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://lab");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else if (req.method === "GET") await serveStatic(req, res, url);
    else send(res, 405, "Method not allowed");
  } catch (error) {
    if (!res.headersSent) send(res, error.status ?? 500, { error: error.status ? error.message : "The lab exploded. Try again." });
    if (!error.status) console.error(error);
  }
});

server.listen(PORT, () => console.log(`ReaFuse lab listening on :${PORT} (lab ${LAB}, brain ${BRAIN})`));
