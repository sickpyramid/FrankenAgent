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
- Everything under src/ must also run in a web browser: no node: imports, no process, no Buffer, no filesystem. Only bin/ may use Node APIs.
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

export function previewPrompt(proposal, files, donors = {}) {
  const donorLines = ["A", "B"]
    .filter((label) => donors[label])
    .map((label) => `- Donor ${label}: ${donors[label].name}${donors[label].spec ? `: ${donors[label].spec.oneLiner}` : ""}`)
    .join("\n");
  return `Design and build the live preview of "${proposal.name}": ${proposal.tagline}

People see this right after the creature is born. It must feel like ONE real app they could open on their phone, the product that exists because ${donors.A?.name ?? "donor A"} and ${donors.B?.name ?? "donor B"} were fused, not a test bench.

## The donors it was born from
${donorLines || "- (unknown)"}

## Look and feel: inherit both parents
- Use the real visual identity of both donor products: their brand colors, light or dark mode, shapes, density and layout conventions (for example a music app's dark canvas, album-art grids and green accents, or a messenger's chat bubbles, green header and read ticks).
- Blend them into one coherent theme. When both donors share a color family (e.g. two greens), use both shades deliberately: one for primary actions, one for secondary accents.
- Never show the donors' logos, trademarks or product names inside the app. The app is called "${proposal.name}" and has its own simple icon (an emoji or a CSS/SVG shape).

## One app, one flow
- A single app screen shown inside a phone frame whose screen is exactly 390×800 CSS pixels. Fill it edge to edge (html, body and the app root at 100% width and 100vh, no outer margins, no device frame of your own). Layout as a column: app bar at the top, one scrollable middle area, and the input bar or bottom navigation pinned at the bottom. Nothing may overlap or be cut off at 390×800, and it must also work from 360 to 430px wide when opened full screen.
- Every capability from both donors appears inside the same experience, in context. Example for a music × messaging app: a room screen where the now-playing card, the shared queue and the group chat live together, not three separate forms.
- No developer UI: no raw IDs to type, no "create session" forms, no JSON or state dumps, no "API demo" wording.
- Prefill realistic sample data (people's names, song or item titles, timestamps) so it looks alive immediately, and simulate light activity with timers (a friend joins, a message arrives, progress ticks).
- Every interaction calls the creature's real API and updates the screen.

## Technical rules
- One self-contained file: demo/index.html with inline <style> and one <script type="module">. No external URLs, fonts, images, CDNs or network calls (the page runs in a sandbox without internet).
- Import the creature only as: import { ... } from "../src/index.mjs"; and use it for all behavior. Do not re-implement its logic.
- Responsive down to 360px. Catch API errors and show them as friendly in-app toasts, never a blank page.

## Creature
${JSON.stringify({ name: proposal.name, tagline: proposal.tagline, concept: proposal.concept, api: proposal.api }, null, 2)}

## Creature source (exact API and behavior)
${files.map((file) => `### ${file.path}\n${file.content}`).join("\n\n")}`;
}

export function growPlanPrompt(proposal, contract) {
  return `${growPrompt(proposal, contract)}

## This step: plan only
List every file you will write (path and purpose: exports, functions, which files it imports), in dependency order. Do not write any code yet; each file is requested separately afterwards. Keep it to at most 10 files.`;
}

export function growFilePrompt(proposal, contract, plan, path, written) {
  const budget = 40_000;
  let used = 0;
  const context = [];
  for (const file of written) {
    if (used > budget) break;
    const slice = file.content.slice(0, budget - used);
    used += slice.length;
    context.push(`### ${file.path}\n${slice}`);
  }
  return `${growPrompt(proposal, contract)}

## The file plan
${plan.files.map((file) => `- ${file.path}: ${file.purpose}`).join("\n")}

## Files already written (stay consistent with their exports and names)
${context.join("\n\n") || "(none yet)"}

## This step
Write the complete content of ${path} only.`;
}
