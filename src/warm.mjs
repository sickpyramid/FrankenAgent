// `reafuse warm`: pre-builds the donor cache for app names, so later fusions
// skip search, cloning, REA analysis and the spec card for those apps.
import { join } from "node:path";

import { acquireTarget } from "./acquire.mjs";
import { createBrain } from "./brain.mjs";
import { donorCacheDir, pinTwin, readDonorCache, writeDonorCache } from "./donor-cache.mjs";
import { licenseGate } from "./license.mjs";
import { profileDonor } from "./profile.mjs";
import { specPrompt, SYSTEM } from "./prompts.mjs";
import { analyzeWithRea, summarizeReaEvidence } from "./rea.mjs";
import { SpecCard } from "./schemas.mjs";
import { findTwins, productTerm } from "./twins.mjs";
import { log, slugify } from "./util.mjs";

export async function warmApps(names, { labDir, brainProvider = "auto", model } = {}) {
  const results = [];
  for (const name of names) {
    const started = Date.now();
    log.step(`Warming ${name}`);
    try {
      const candidates = await findTwins(name, { cacheDir: join(labDir, "cache", "twins") });
      if (!candidates.length) throw new Error("no JavaScript/TypeScript build found on GitHub");

      // Prefer the best-ranked build that clones and carries a clean license.
      let chosen = null;
      for (const candidate of candidates.slice(0, 4)) {
        try {
          const donor = await acquireTarget(candidate.repoUrl, join(labDir, "cache"), { allowLocal: false });
          const profile = await profileDonor(donor.path);
          const gate = licenseGate(profile.license);
          chosen ??= { candidate, donor, profile };
          if (!gate.warning) {
            chosen = { candidate, donor, profile };
            break;
          }
        } catch (error) {
          log.warn(`${candidate.repo}: ${error.message.slice(0, 120)}`);
        }
      }
      if (!chosen) throw new Error("no candidate could be cloned");
      const { candidate, donor, profile } = chosen;
      await pinTwin(labDir, name, { repo: candidate.repo, repoUrl: candidate.repoUrl, why: candidate.description, score: candidate.score });
      log.info(`${name} → ${candidate.repo} (${profile.license.spdx ?? "license unknown"})`);

      const cacheDir = donorCacheDir(labDir, donor);
      let rea = await readDonorCache(cacheDir, "rea-summary.json");
      if (!rea) {
        const analysis = await analyzeWithRea(donor.path);
        rea = analysis.ok ? { command: analysis.command, ...summarizeReaEvidence(analysis.evidence) } : { command: analysis.command, unavailable: analysis.error };
        if (analysis.ok) await writeDonorCache(cacheDir, "rea-summary.json", rea);
      }
      log.info(`REA: ${rea.unavailable ? `unavailable (${rea.unavailable.slice(0, 80)})` : `${rea.modules.length} modules`}`);

      let spec = await readDonorCache(cacheDir, "spec.json");
      if (!spec) {
        // A scratch run folder keeps the brain's request and answer for inspection.
        const runDir = join(labDir, "warm", `${slugify(productTerm(name))}-${donor.commit?.slice(0, 8) ?? "local"}`);
        const brain = createBrain({ provider: brainProvider, runDir, model });
        spec = await brain.ask({ stage: "spec-A", system: SYSTEM, prompt: specPrompt("A", profile, rea.unavailable ? null : rea), schema: SpecCard });
        await writeDonorCache(cacheDir, "spec.json", spec);
      }
      log.info(`Spec card: ${spec.capabilities.length} capabilities — ${spec.oneLiner}`);
      results.push({ name, repo: candidate.repo, ok: true, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (error) {
      log.warn(`${name}: ${error.message}`);
      results.push({ name, ok: false, error: error.message });
    }
  }
  return results;
}
