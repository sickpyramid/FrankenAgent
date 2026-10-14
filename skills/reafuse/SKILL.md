---
name: reafuse
description: Fuse two apps, repositories or websites into a brand-new, verified project with ReaFuse (built on REA, Reverse Engineer Anything). Use when the user wants to combine two projects or products ("Spotify × WhatsApp", "fuse vercel/ms with pretty-bytes"), grow something new from two donors, or dissect a repository with REA.
---

# ReaFuse

ReaFuse dissects two donors with REA, writes a spec card for each (behavior only, never code), proposes three new "creatures", writes acceptance tests first, grows fresh code, verifies it in a sandbox and scans it for copied code. Every run ends with a verdict (ALIVE, UNSTABLE, DEAD, REJECTED) and a lab report.

## With the MCP server (preferred)

If the `reafuse_*` tools are available, you are the brain:

1. `reafuse_fuse { a, b }`: donors can be a GitHub URL, `owner/repo`, a local path, a website or an app name.
2. While the result says `next: "answer"`, read `request` (a prompt plus a JSON schema) and call `reafuse_answer { run, stage, answer }` with a JSON object that matches the schema exactly. Stages are `resolve-*`, `spec-A`, `spec-B`, `fuse`, `contract-pN`, `grow-pN` and `repair-pN-K`.
3. When `next: "pick"`, show the user the three creatures (or choose the best one if they asked you to decide) and call `reafuse_pick { run, pick }`.
4. When `next: "done"`, report the verdict, the creature folder and `REPORT.md`.

Rules for answers:
- Spec cards describe observable behavior grounded in the donor's README, tests and REA evidence. Never paste donor code.
- Contract tests import only from `../../src/index.mjs` and use `node:test` with `node:assert/strict`. They must be deterministic.
- Grown code is original, has zero dependencies and must pass the contract. Never write under `test/contract/`; the lab owns that folder.
- If an answer is rejected for not matching the schema, fix it and call `reafuse_answer` again.

## With the CLI

```bash
reafuse fuse <donorA> <donorB> --brain handoff   # pauses at each stage
# answer: write JSON to the printed <stage>.response.json path
reafuse resume <run-dir>                         # continue; repeat until a verdict
```

Other brains do the reasoning themselves: `--brain claude-cli` (a logged-in Claude Code CLI), `--brain anthropic` (`ANTHROPIC_API_KEY`), `--brain kilo` (Kilo Gateway; free models need no key) or `--brain hybrid` (Kilo for routine stages, Claude CLI for the code-writing ones).

`reafuse dissect <donor>` profiles one donor with REA without fusing.
