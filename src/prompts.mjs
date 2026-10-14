export const SYSTEM = `You are the surgeon inside ReaFuse, a laboratory that fuses two existing software projects ("donors") into one brand-new project ("the creature").

The clean-room rule is absolute:
- You may learn WHAT donors do (behavior, inputs, outputs, ideas).
- You must never copy HOW they do it: no copied code, no copied comments, no copied identifiers beyond common words, no copied README text.
- A deterministic originality scanner compares the creature to the donors' source. Copied stretches fail the operation.

Always answer with JSON that matches the provided schema exactly.`;

export function specPrompt(label, profile, reaSummary) {
  return `Write the spec card for donor ${label}.

Describe observable behavior only, grounded in the evidence below. Prefer behavior that is confirmed by the donor's own tests and README. Every example must be precise enough to become an automated test (exact inputs and exact outputs).

## Donor metadata
${JSON.stringify(
  {
    name: profile.name,
    version: profile.version,
    description: profile.description,
    keywords: profile.keywords,
    license: profile.license.spdx,
    entrypoints: profile.entrypoints,
    dependencies: profile.dependencies,
    fileCount: profile.fileCount,
  },
  null,
  2,
)}

## REA evidence (static analysis, modules/exports/imports)
${reaSummary ? JSON.stringify(reaSummary, null, 1) : "REA evidence unavailable for this donor."}

## README
${profile.readme || "(none)"}

## Source excerpts (for understanding only; never reproduce)
${profile.sources.map((file) => `### ${file.path}\n${file.content}`).join("\n\n")}

## Test excerpts (the best evidence of behavior)
${profile.tests.map((file) => `### ${file.path}\n${file.content}`).join("\n\n") || "(none)"}`;
}

export function fusePrompt(specA, specB) {
  return `Two donors are on the table. Propose exactly 3 creatures.

A creature is a NEW small JavaScript library + CLI that:
- inherits at least one capability from each donor,
- adds one capability that only makes sense because both donors were combined,
- is useful on its own (someone would actually install it),
- is small enough to implement in a few hundred lines with zero runtime dependencies,
- has deterministic behavior that can be verified by unit tests (no network, no clocks, no randomness in the tested API — accept such values as parameters instead).

## Donor A spec card
${JSON.stringify(specA, null, 2)}

## Donor B spec card
${JSON.stringify(specB, null, 2)}`;
}

export function contractPrompt(proposal, specA, specB) {
  return `Write the acceptance contract for this creature BEFORE it is built.

The contract proves the creature is alive: it really inherited donor A's capabilities, donor B's capabilities, and has its fused capability.

Rules:
- Files go in test/contract/ and end with .test.mjs.
- Use only node:test and node:assert/strict.
- Import the creature only as: import { ... } from "../../src/index.mjs";
- Test only the API listed in the proposal, with the exact names and signatures.
- Derive inherited expectations from the donors' spec-card examples and edge cases, adapted to the creature's API.
- 10-20 focused tests. Deterministic: no network, no filesystem writes, no timers, no randomness.
- Every test name must appear in "mapping" with its origin (A, B or fusion).
- Never write expectations you are unsure about. Precision beats coverage.

## Creature proposal
${JSON.stringify(proposal, null, 2)}

## Donor A spec card
${JSON.stringify(specA, null, 2)}

## Donor B spec card
${JSON.stringify(specB, null, 2)}`;
}

export function growPrompt(proposal, contract) {
  return `Grow the creature "${proposal.name}" from scratch.

Hard requirements:
- Plain JavaScript ES modules, Node.js 22+, ZERO runtime or dev dependencies.
- package.json: name "${proposal.name}", "type": "module", "main": "src/index.mjs", "bin": { "${proposal.cliCommand}": "bin/${proposal.cliCommand}.mjs" }, "scripts": { "test": "node --test" }, "license": "MIT".
- src/index.mjs exports exactly the proposal's API; split logic into other src/ modules if helpful.
- bin/${proposal.cliCommand}.mjs: a small CLI over the API (parse process.argv, print results, exit codes, --help).
- test/*.test.mjs: your own additional unit tests (node:test). Do not write anything under test/contract/ — the contract below is owned by the lab and will be installed as-is.
- README.md: what the creature is, install, API, CLI usage. Do not copy donor README text.
- Write original code. Do not reproduce donor implementations.

The creature must pass this contract exactly:
${contract.tests.map((file) => `### ${file.path}\n${file.content}`).join("\n\n")}

## Creature proposal
${JSON.stringify(proposal, null, 2)}`;
}

export function repairPrompt(proposal, files, failures, attempt) {
  return `Repair attempt ${attempt} for the creature "${proposal.name}".

The lab contract under test/contract/ is fixed and cannot be changed. Fix the implementation (or your own tests under test/, if they are wrong) so everything passes.

Return only the files you change, each with its complete new content.

## Failing test output
${failures}

## Current creature files
${files.map((file) => `### ${file.path}\n${file.content}`).join("\n\n")}`;
}

export function resolvePrompt(input, kind) {
  return `A user wants to use "${input}" (${kind === "website" ? "a website" : "a product name"}) as a donor.

ReaFuse never dissects closed-source products. Instead, find open-source "twins": existing public GitHub projects that implement the same core capabilities, so the product's ideas can be learned legally from open code.

Rules:
- Only list repositories you are confident exist on GitHub, as owner/name.
- Prefer JavaScript or TypeScript projects with permissive licenses (MIT, Apache-2.0, BSD, ISC). Avoid GPL, AGPL, LGPL and MPL projects.
- Prefer focused libraries or small apps that capture the product's signature capability over giant platforms.
- If "${input}" is itself an open-source project, list its own repository first.`;
}
