import { join } from "node:path";

import { sha256, writeJson, writeText } from "./util.mjs";

const BANNERS = {
  ALIVE: "IT'S ALIVE",
  UNSTABLE: "UNSTABLE CREATURE",
  DEAD: "THE CREATURE DID NOT WAKE",
  REJECTED: "ORGAN REJECTED",
};

/**
 * Writes the lab report: report.json (machine-readable, hashed) and
 * REPORT.md, plus LINEAGE.md inside the creature itself.
 */
export async function writeReport(runDir, state, details) {
  const { specs, proposals, proposal, contract, results } = details;
  const verdict = state.verdict ?? { status: "PENDING" };

  const body = {
    schema: "reafuse.lab-report/v1",
    runId: state.id,
    createdAt: state.createdAt,
    reafuse: state.reafuse,
    rea: state.rea,
    brain: state.brain,
    donors: Object.fromEntries(
      Object.entries(state.donors ?? {}).map(([label, donor]) => [
        label,
        {
          input: donor.input,
          name: donor.name,
          url: donor.url ?? null,
          resolvedFrom: donor.resolution ? { input: donor.resolution.from, tier: donor.resolution.tier, why: donor.resolution.why } : null,
          commit: donor.commit,
          license: donor.license?.spdx ?? null,
          gate: donor.gate,
          capabilities: specs?.[label]?.capabilities.map((capability) => capability.id) ?? [],
        },
      ]),
    ),
    proposals: proposals?.map((item) => ({ name: item.name, tagline: item.tagline })) ?? [],
    creature: proposal
      ? {
          name: proposal.name,
          tagline: proposal.tagline,
          concept: proposal.concept,
          newCapability: proposal.newCapability,
          inheritsFromA: proposal.inheritsFromA,
          inheritsFromB: proposal.inheritsFromB,
          api: proposal.api,
          cli: { command: proposal.cliCommand, examples: proposal.cliExamples },
          dir: verdict.creature?.dir ?? null,
        }
      : null,
    contract: contract ? { tests: contract.mapping } : null,
    verification: results
      ? {
          sandbox: "node --permission (read-only creature folder, no child processes, no writes)",
          contract: summarize(results.contract),
          own: summarize(results.own),
          attempts: verdict.attempts,
        }
      : null,
    originality: verdict.originality ?? null,
    verdict: { status: verdict.status, reason: verdict.reason ?? null },
  };
  const report = { ...body, certificate: sha256(JSON.stringify(body)) };

  await writeJson(join(runDir, "report.json"), report);
  const markdown = renderMarkdown(report);
  await writeText(join(runDir, "REPORT.md"), markdown);
  if (report.creature?.dir) await writeText(join(runDir, report.creature.dir, "LINEAGE.md"), markdown);
  return report;
}

function summarize(suite) {
  return { total: suite.total, passed: suite.passed, failed: suite.failed, failures: suite.failures.map((f) => f.name) };
}

export function renderMarkdown(report) {
  const { donors, creature, verification, originality, verdict } = report;
  const lines = [];
  lines.push(`# ${BANNERS[verdict.status] ?? verdict.status}`, "");
  if (creature) lines.push(`**${creature.name}** — ${creature.tagline}`, "");
  if (verdict.reason) lines.push(`> ${verdict.reason}`, "");

  lines.push("## Donors", "", "| | Donor | Commit | License | Gate |", "|---|---|---|---|---|");
  for (const [label, donor] of Object.entries(donors)) {
    const where = donor.url ? `[${donor.name}](${donor.url.replace(/\.git$/, "")})` : donor.name;
    const via = donor.resolvedFrom ? ` (twin of "${donor.resolvedFrom.input}")` : "";
    lines.push(`| ${label} | ${where}${via} | \`${donor.commit?.slice(0, 10) ?? "local"}\` | ${donor.license ?? "unknown"} | ${donor.gate.ok ? "✅" : "❌"} ${donor.gate.reason} |`);
  }
  lines.push("");

  if (creature) {
    lines.push("## The creature", "", creature.concept, "");
    lines.push(`- **Inherited from A:** ${creature.inheritsFromA.join(", ")}`);
    lines.push(`- **Inherited from B:** ${creature.inheritsFromB.join(", ")}`);
    lines.push(`- **Born from the fusion:** ${creature.newCapability}`, "");
    lines.push("### API", "");
    for (const fn of creature.api) lines.push(`- \`${fn.signature}\` — ${fn.description}`);
    lines.push("", "### CLI", "", "```bash", ...creature.cli.examples, "```", "");
  }

  if (verification) {
    lines.push("## Verification", "");
    lines.push(`- Sandbox: ${verification.sandbox}`);
    lines.push(`- Lab contract: **${verification.contract.passed}/${verification.contract.total}** passed`);
    lines.push(`- Creature's own tests: **${verification.own.passed}/${verification.own.total}** passed`);
    lines.push(`- Attempts: ${verification.attempts.map((a) => `${a.attempt === 0 ? "grow" : `repair ${a.attempt}`} → ${a.status}`).join(", ")}`);
    if (verification.contract.failures.length) lines.push(`- Failing: ${verification.contract.failures.join("; ")}`);
    lines.push("");
  }

  if (report.contract) {
    lines.push("### Contract lineage", "", "| Test | Origin |", "|---|---|");
    for (const test of report.contract.tests) lines.push(`| ${test.test.replace(/\|/g, "\\|")} | ${test.origin} |`);
    lines.push("");
  }

  if (originality) {
    lines.push("## Clean-room originality scan", "");
    lines.push(`- Fingerprint overlap with donor code: **${(originality.overlap * 100).toFixed(1)}%** (limit ${originality.thresholds.maxOverlap * 100}%)`);
    lines.push(`- Longest shared token run: **${originality.longestCopiedTokens}** (limit ${originality.thresholds.maxCopiedRun})`);
    lines.push(`- Result: ${originality.passed ? "✅ original" : "❌ breach"}`, "");
  }

  lines.push("## Provenance", "");
  lines.push(`- Run: \`${report.runId}\``);
  lines.push(`- ReaFuse ${report.reafuse} · REA ${report.rea ?? "n/a"} · brain: ${report.brain?.provider ?? "n/a"}${report.brain?.model && report.brain.provider !== "handoff" ? ` (${report.brain.model})` : ""}`);
  lines.push(`- Certificate: \`${report.certificate}\``, "");
  lines.push("Behavior was learned from the donors; no donor code was copied or executed. Donors keep their own licenses and credit.", "");
  return lines.join("\n");
}
