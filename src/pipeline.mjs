import { readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join, relative, sep } from "node:path";
import { createInterface } from "node:readline/promises";

import { acquireTarget, classifyTarget, repositoryExists } from "./acquire.mjs";
import { donorCacheDir, pinnedTwin, readDonorCache, writeDonorCache } from "./donor-cache.mjs";
import { findTwins } from "./twins.mjs";
import { createBrain, HandoffPending } from "./brain.mjs";
import { licenseGate } from "./license.mjs";
import { checkOriginality } from "./originality.mjs";
import { listSourceFiles, profileDonor } from "./profile.mjs";
import { contractPrompt, fusePrompt, growFilePrompt, growPlanPrompt, growPrompt, previewPrompt, repairPrompt, resolvePrompt, specPrompt, SYSTEM } from "./prompts.mjs";
import { analyzeWithRea, reaVersion, summarizeReaEvidence } from "./rea.mjs";
import { writeReport } from "./report.mjs";
import { Contract, CreatureFiles, FileBody, FusionProposals, GrowPlan, Preview, Resolution, SpecCard } from "./schemas.mjs";
import { exists, log, newRunId, readJson, safeJoin, slugify, truncate, writeJson, writeText } from "./util.mjs";
import { verdictFor, verifyCreature } from "./verify.mjs";

const require = createRequire(import.meta.url);
export const REAFUSE_VERSION = require("../package.json").version;

/** Creates a new run directory for donors A and B and returns its path. */
export async function createRun(labDir, donorA, donorB, options) {
  const id = newRunId(guessName(donorA), guessName(donorB));
  const runDir = join(labDir, "runs", id);
  await writeJson(join(runDir, "run.json"), {
    id,
    createdAt: new Date().toISOString(),
    reafuse: REAFUSE_VERSION,
    rea: reaVersion(),
    inputs: { A: donorA, B: donorB },
    options,
    donors: null,
    pick: options.pick ?? null,
    verdict: null,
  });
  return runDir;
}

/**
 * Advances a run as far as possible. Every stage persists its output, so the
 * same call resumes a run after a handoff, a crash or a changed --pick.
 */
export async function advanceRun(runDir, { labDir, brainProvider, model, interactive = false, awaitPick = false } = {}) {
  const statePath = join(runDir, "run.json");
  const state = await readJson(statePath);
  const save = () => writeJson(statePath, state);
  state.brain ??= { provider: brainProvider ?? "auto", model };
  if (brainProvider) state.brain.provider = brainProvider;
  if (model) state.brain.model = model;
  const brain = createBrain({ provider: state.brain.provider, runDir, model: state.brain.model ?? undefined });
  state.brain.provider = brain.provider;
  state.brain.model = brain.model;
  await save();

  // 1. Intake: acquire donors, profile them, run the license gate.
  log.step("Intake: acquiring donors");
  if (!state.donors) {
    const donors = {};
    // Locate both donors at once (a quick GitHub search each), then dissect.
    const located = await Promise.all(
      ["A", "B"].map((label) => resolveCandidates(brain, label, state.inputs[label], { ...state.options, labDir, runDir })),
    );
    for (const [slot, label] of ["A", "B"].entries()) {
      const input = state.inputs[label];
      // Names and websites can map to several open-source builds; take the
      // best-ranked one that clones and passes the license check.
      const candidates = located[slot] ?? [null];
      let donor, profile, gate, resolution, lastError, firstAcceptable;
      for (const [index, candidate] of candidates.entries()) {
        try {
          donor = await acquireTarget(candidate?.repoUrl ?? input, join(labDir, "cache"), {
            allowLocal: state.options.allowLocal !== false,
          });
        } catch (error) {
          lastError = error;
          if (!candidate) throw error;
          continue;
        }
        profile = await profileDonor(donor.path);
        gate = licenseGate(profile.license, state.options);
        resolution = candidate;
        // Prefer a cleanly licensed build; otherwise keep the first acceptable one.
        if (gate.ok && !gate.warning) break;
        if (gate.ok) firstAcceptable ??= { donor, profile, gate, resolution };
        if (!candidate || index === candidates.length - 1) break;
      }
      if (firstAcceptable && !(gate.ok && !gate.warning)) ({ donor, profile, gate, resolution } = firstAcceptable);
      if (!donor) throw lastError ?? new Error(`Could not acquire "${input}".`);
      await writeJson(join(runDir, "donors", `${label}.profile.json`), profile);
      donors[label] = { ...donor, input, resolution, packageName: profile.name, license: profile.license, gate };
      const display = resolution ? input : donor.name;
      donors[label].display = display;
      log.info(`${label}: ${display} ${gate.ok ? (gate.warning ? "⚑" : "✓") : "✗"}${resolution ? ` (studied through ${resolution.repo}, ${profile.license.spdx ?? "license unknown"})` : ` @ ${donor.commit?.slice(0, 10) ?? "local"}, ${profile.license.spdx ?? "license unknown"}`}`);
    }
    state.donors = donors;
    await save();
  }
  const failedGate = ["A", "B"].find((label) => !state.donors[label].gate.ok);
  if (failedGate) {
    state.verdict = { status: "REJECTED", reason: `Donor ${failedGate}: ${state.donors[failedGate].gate.reason}` };
    state.phase = "done";
    await save();
    return finish(runDir, state);
  }

  // 2. Dissect: REA evidence + spec card per donor.
  const specs = {};
  for (const label of ["A", "B"]) {
    log.step(`Dissecting donor ${label} (${state.donors[label].display ?? state.donors[label].name})`);
    const profile = await readJson(join(runDir, "donors", `${label}.profile.json`));
    const summaryPath = join(runDir, "evidence", `${label}.rea-summary.json`);
    const cacheDir = donorCacheDir(labDir, state.donors[label]);
    let reaSummary = null;
    if (await exists(summaryPath)) {
      reaSummary = await readJson(summaryPath);
    } else if (!state.options.noRea) {
      const cached = await readDonorCache(cacheDir, "rea-summary.json");
      if (cached) {
        reaSummary = cached;
        log.info(`REA evidence ${reaSummary.evidenceId?.slice(0, 18) ?? ""}… (${reaSummary.modules?.length ?? 0} modules, cached)`);
      } else {
        log.info("REA static analysis…");
        const rea = await analyzeWithRea(state.donors[label].path);
        if (rea.ok) {
          await writeJson(join(runDir, "evidence", `${label}.rea.json`), rea.evidence);
          reaSummary = { command: rea.command, ...summarizeReaEvidence(rea.evidence) };
          log.info(`REA evidence ${reaSummary.evidenceId?.slice(0, 18)}… (${reaSummary.modules.length} modules)`);
          await writeDonorCache(cacheDir, "rea-summary.json", reaSummary);
        } else {
          reaSummary = { command: rea.command, unavailable: rea.error };
          log.warn(`REA unavailable: ${rea.error}`);
        }
      }
      await writeJson(summaryPath, reaSummary);
    }
    // A spec card written for this donor commit by any earlier run is reused.
    const specResponse = join(runDir, "brain", `spec-${label}.response.json`);
    const cachedSpec = (await exists(specResponse)) ? null : await readDonorCache(cacheDir, "spec.json");
    if (cachedSpec) {
      await writeJson(specResponse, cachedSpec);
      await writeJson(join(runDir, "brain", `spec-${label}.meta.json`), { provider: "cache", cachedFrom: cacheDir, answeredAt: new Date().toISOString() });
      log.info("🧠 spec card loaded from the donor cache");
    }
    specs[label] = await brain.ask({
      stage: `spec-${label}`,
      system: SYSTEM,
      prompt: specPrompt(label, profile, reaSummary?.unavailable ? null : reaSummary),
      schema: SpecCard,
    });
    if (!cachedSpec) await writeDonorCache(cacheDir, "spec.json", specs[label]);
    log.info(`Spec card: ${specs[label].capabilities.length} capabilities — ${specs[label].oneLiner}`);
  }

  // 3. Fuse: three creature concepts, one is chosen.
  log.step("Fusing: proposing creatures");
  const { proposals } = await brain.ask({ stage: "fuse", system: SYSTEM, prompt: fusePrompt(specs.A, specs.B), schema: FusionProposals });
  proposals.forEach((proposal, index) => log.info(`${index + 1}. ${proposal.name} — ${proposal.tagline}`));
  if (!state.pick && awaitPick) {
    state.phase = "awaiting-pick";
    await save();
    log.step("Awaiting your pick");
    return { runDir, state, report: null, awaitingPick: true };
  }
  if (!state.pick) {
    state.pick = interactive ? await askPick(proposals.length) : 1;
  }
  state.phase = "growing";
  await save();
  const proposal = proposals[state.pick - 1];
  if (!proposal) throw new Error(`--pick ${state.pick} is out of range (1-${proposals.length}).`);
  proposal.name = slugify(proposal.name, 60);
  proposal.cliCommand = slugify(proposal.cliCommand, 40);
  log.info(`Chosen: ${proposal.name}`);
  const tag = `p${state.pick}`;
  const creatureDir = join(runDir, "creature", proposal.name);

  // 4. Contract: acceptance tests written before the creature exists.
  log.step("Writing the acceptance contract");
  const contract = await brain.ask({
    stage: `contract-${tag}`,
    system: SYSTEM,
    prompt: contractPrompt(proposal, specs.A, specs.B),
    schema: Contract,
  });
  const contractFiles = contract.tests.map((file) => ({
    path: file.path.startsWith("test/contract/") ? file.path : `test/contract/${basename(file.path)}`,
    content: file.content,
  }));
  log.info(`${contract.mapping.length} contract tests (${countOrigins(contract.mapping)})`);

  // 5. Grow the creature from scratch, then install the lab-owned contract.
  log.step(`Growing ${proposal.name}`);
  // Free routers fail on one huge answer, so they grow the creature file by file.
  const partsMode = ["kilo", "free", "llm7", "pollinations"].includes(brain.provider) || process.env.REAFUSE_GROW_MODE === "parts";
  const grown = partsMode && !(await exists(join(runDir, "brain", `grow-${tag}.response.json`)))
    ? await growInParts(brain, runDir, tag, proposal, { tests: contractFiles })
    : await brain.ask({ stage: `grow-${tag}`, system: SYSTEM, prompt: growPrompt(proposal, { tests: contractFiles }), schema: CreatureFiles });
  await rm(creatureDir, { recursive: true, force: true });
  await writeCreatureFiles(creatureDir, grown.files);
  await writeCreatureFiles(creatureDir, contractFiles, { allowContract: true });
  log.info(`${grown.files.length} files grown`);

  // 6. Verify, with bounded repair attempts that may never touch the contract.
  const maxRepairs = state.options.maxRepairs ?? 2;
  let results;
  const attempts = [];
  for (let attempt = 0; ; attempt += 1) {
    log.step(attempt === 0 ? "Verifying" : `Re-verifying after repair ${attempt}`);
    results = await verifyCreature(creatureDir, contract.mapping.length);
    const status = verdictFor(results);
    attempts.push({ attempt, status, contract: pick(results.contract), own: pick(results.own) });
    log.info(`contract ${results.contract.passed}/${results.contract.total}, own tests ${results.own.passed}/${results.own.total} → ${status}`);
    if (status === "ALIVE" || attempt >= maxRepairs) break;

    const files = await readCreatureFiles(creatureDir);
    const failures = [...results.contract.failures, ...results.own.failures]
      .map((failure) => `✗ ${failure.name}\n${failure.detail}`)
      .join("\n\n");
    const fix = await brain.ask({
      stage: `repair-${tag}-${attempt + 1}`,
      system: SYSTEM,
      prompt: repairPrompt(proposal, files, truncate(failures || results.contract.output, 30_000), attempt + 1),
      schema: CreatureFiles,
    });
    await writeCreatureFiles(creatureDir, fix.files);
  }

  // 7. Originality: the clean-room scanner compares creature code to donor code.
  log.step("Originality scan (clean-room check)");
  const donorFiles = [...(await listSourceFiles(state.donors.A.path)), ...(await listSourceFiles(state.donors.B.path))];
  const originality = await checkOriginality(await readCreatureFiles(creatureDir), donorFiles);
  log.info(`overlap ${(originality.overlap * 100).toFixed(1)}%, longest shared run ${originality.longestCopiedTokens} tokens → ${originality.passed ? "original" : "BREACH"}`);

  const status = originality.passed ? verdictFor(results) : "REJECTED";

  // 8. Preview: a small page that lets people try the creature right away.
  if (status === "ALIVE" || status === "UNSTABLE") {
    log.step("Building the live preview");
    try {
      const preview = await brain.ask({
        stage: `preview-${tag}`,
        system: SYSTEM,
        prompt: previewPrompt(
          proposal,
          (await readCreatureFiles(creatureDir)).filter((file) => file.path.startsWith("src/") || file.path === "README.md"),
          { A: { name: state.donors.A.display ?? state.donors.A.name, spec: specs.A }, B: { name: state.donors.B.display ?? state.donors.B.name, spec: specs.B } },
        ),
        schema: Preview,
      });
      const html = preview.html;
      if (!html.includes("../src/index.mjs") || /(src|href)\s*=\s*["']https?:/i.test(html)) {
        log.warn("Preview skipped: the page must import ../src/index.mjs and load nothing from the network.");
      } else {
        await writeText(join(creatureDir, "demo", "index.html"), html);
        log.info(`Preview ready: ${preview.summary}`);
      }
    } catch (error) {
      if (error instanceof HandoffPending) throw error;
      log.warn(`Preview skipped:${String(error.message).split("\n")[0].slice(0, 160)}`);
    }
  }

  state.phase = "done";
  state.verdict = {
    status,
    reason: originality.passed ? null : "Clean-room breach: the creature contains code copied from a donor.",
    creature: { name: proposal.name, dir: relative(runDir, creatureDir).split(sep).join("/") },
    attempts,
    originality,
  };
  await save();
  return finish(runDir, state, { specs, proposals, proposal, contract, results, originality });
}

/**
 * Names ("Spotify") and websites ("instagram.com") are never dissected
 * directly. The brain proposes open-source builds of the same idea; every
 * candidate that really exists on GitHub is returned, best first.
 */
async function resolveCandidates(brain, label, input, { allowCopyleft = false, strictLicense = false, labDir, runDir } = {}) {
  const target = classifyTarget(input);
  if (target.kind !== "name" && target.kind !== "website") return null;
  log.info(`${label}: locating ${input}…`);

  // Fastest path: an app warmed with `reafuse warm` has a pinned build.
  const pinned = labDir ? await pinnedTwin(labDir, input) : null;
  if (pinned) {
    return [{ tier: "twin", source: "pinned", from: input, product: input, repo: pinned.repo, repoUrl: pinned.repoUrl, why: pinned.why ?? "" }];
  }

  // Fast path: GitHub search ranked by similarity, relevance and REA compatibility.
  try {
    const ranked = await findTwins(input, { cacheDir: labDir ? join(labDir, "cache", "twins") : null });
    const usable = ranked.filter((c) => !(strictLicense && !allowCopyleft && /\b(A?GPL|LGPL|MPL|EUPL|SSPL)/i.test(c.license ?? "")));
    if (runDir) await writeJson(join(runDir, "donors", `${label}.candidates.json`), { input, ranked });
    if (usable.length) {
      return usable.slice(0, 4).map((c) => ({
        tier: "twin",
        source: "github-search",
        from: input,
        product: input,
        repo: c.repo,
        repoUrl: c.repoUrl,
        why: c.description,
        score: c.score,
        scores: c.scores,
      }));
    }
  } catch (error) {
    log.info(`${label}: quick search unavailable (${String(error.message).slice(0, 80)}), asking the brain…`);
  }

  // Fallback: the brain proposes candidates from what it knows.
  const answer = await brain.ask({
    stage: `resolve-${label}`,
    system: SYSTEM,
    prompt: resolvePrompt(input, target.kind),
    schema: Resolution,
  });
  const found = [];
  for (const candidate of answer.candidates) {
    const repo = candidate.repo.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) continue;
    if (strictLicense && !allowCopyleft && /\b(A?GPL|LGPL|MPL|EUPL|SSPL|CC-BY-SA)/i.test(candidate.license)) continue;
    // v1 dissects JavaScript/TypeScript; other languages give REA nothing to read.
    if (candidate.language && !/(java|type)script|\bjs\b|\bts\b|node|vue|react|svelte|electron/i.test(candidate.language)) continue;
    const repoUrl = `https://github.com/${repo}.git`;
    if (!(await repositoryExists(repoUrl))) continue;
    found.push({ tier: "twin", from: input, product: answer.product, essence: answer.essence, repo, repoUrl, why: candidate.why });
    if (found.length === 4) break;
  }
  if (!found.length) throw new Error(`Could not find a usable open-source build to study for "${input}". Try a repository URL instead.`);
  return found;
}

/**
 * Grows the creature as a plan plus one small answer per file. Each part is
 * cached like any brain stage, and the assembled result is stored as the
 * normal grow answer so resumes and reports work unchanged.
 */
async function growInParts(brain, runDir, tag, proposal, contract) {
  const plan = await brain.ask({ stage: `grow-${tag}-plan`, system: SYSTEM, prompt: growPlanPrompt(proposal, contract), schema: GrowPlan });
  const targets = plan.files.filter((file) => !file.path.replace(/\\/g, "/").replace(/^\.\//, "").startsWith("test/contract/")).slice(0, 12);
  log.info(`Plan: ${targets.length} files (${targets.map((file) => file.path).join(", ")})`);
  const files = [];
  for (const [index, target] of targets.entries()) {
    const { content } = await brain.ask({
      stage: `grow-${tag}-f${index + 1}`,
      system: SYSTEM,
      prompt: growFilePrompt(proposal, contract, plan, target.path, files),
      schema: FileBody,
    });
    files.push({ path: target.path, content });
    log.info(`✎ ${target.path} (${content.length} chars)`);
  }
  const grown = { files, summary: plan.summary };
  await writeJson(join(runDir, "brain", `grow-${tag}.response.json`), grown);
  return grown;
}

async function finish(runDir, state, details = {}) {
  const report = await writeReport(runDir, state, details);
  return { runDir, state, report };
}

async function writeCreatureFiles(dir, files, { allowContract = false } = {}) {
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!allowContract && normalized.startsWith("test/contract/")) {
      log.warn(`Ignored attempt to modify the lab contract: ${normalized}`);
      continue;
    }
    await writeText(safeJoin(dir, normalized), file.content);
  }
}

export async function readCreatureFiles(dir) {
  const out = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = join(current, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") await visit(full);
      else if (entry.isFile() && entry.name !== "LINEAGE.md") {
        out.push({ path: relative(dir, full).split(sep).join("/"), content: await readFile(full, "utf8") });
      }
    }
  }
  await visit(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function askPick(count) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`\n   Which creature should we grow? [1-${count}] (1): `);
    const value = Number(answer.trim() || 1);
    return Number.isInteger(value) && value >= 1 && value <= count ? value : 1;
  } finally {
    rl.close();
  }
}

function countOrigins(mapping) {
  const counts = { A: 0, B: 0, fusion: 0 };
  for (const entry of mapping) counts[entry.origin] += 1;
  return `A ${counts.A}, B ${counts.B}, fusion ${counts.fusion}`;
}

function pick(suite) {
  return { total: suite.total, passed: suite.passed, failed: suite.failed, timedOut: suite.timedOut };
}

function guessName(input) {
  return String(input).replace(/\.git$/, "").split(/[\\/]/).filter(Boolean).pop() ?? "donor";
}
