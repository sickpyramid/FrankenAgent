<div align="center">

# 🧟 ReaFuse

### Built on [REA — Reverse Engineer Anything](https://github.com/morluto/rea)

**REA reverse engineers anything. ReaFuse fuses what it finds into something new.**

Give it two projects. It dissects both with REA, fuses their best capabilities, grows a brand-new project — then proves the creature is alive.

[![Built on REA](https://img.shields.io/badge/built%20on-REA%20%E2%80%94%20Reverse%20Engineer%20Anything-5c4ee5?style=flat-square)](https://github.com/morluto/rea)
[![rea-agents](https://img.shields.io/badge/rea--agents-6.4.0-cb3837?style=flat-square&logo=npm)](https://www.npmjs.com/package/rea-agents)
[![Creatures alive](https://img.shields.io/badge/creatures%20alive-2%2F2-2ea44f?style=flat-square)](showcase)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.19-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#install)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)

<sub>Independent community project built on REA. Not made by, affiliated with or endorsed by the REA maintainers.</sub>

[Built on REA](#built-on-rea-reverse-engineer-anything) · [Creatures](#the-creatures) · [How it works](#how-it-works) · [Install](#install) · [FAQ](#faq)

</div>

---

```bash
reafuse fuse vercel/ms sindresorhus/pretty-bytes
```

```
🧪 Intake: acquiring donors
   A: ms @ 4ff48cec09 — license MIT ✓
   B: pretty-bytes @ a35ed21bb4 — license MIT ✓
🧪 Dissecting donor A (ms)
   REA evidence ev_1bb7dd1cd16550c… (8 modules)
   Spec card: 3 capabilities — Converts human-readable duration strings to milliseconds…
🧪 Fusing: proposing creatures
   1. ratewise — Human-readable transfer rates, ETAs and data budgets
   2. staleness — Cache size and age policies in one readable string
   3. quotaclock — Readable usage quotas
🧪 Writing the acceptance contract
   18 contract tests (A 2, B 7, fusion 9)
🧪 Growing ratewise
🧪 Verifying
   contract 18/18, own tests 7/7 → ALIVE
🧪 Originality scan (clean-room check)
   overlap 0.0%, longest shared run 0 tokens → original

══════════════════════════════════════
  ALIVE — ratewise
══════════════════════════════════════
```

## Built on REA (Reverse Engineer Anything)

[REA — Reverse Engineer Anything](https://github.com/morluto/rea) answers *"how does this feature work?"* for binaries, JavaScript and Electron apps, .NET assemblies and websites, with evidence for every conclusion. REA's own pitch is to see a feature you like, understand it, and build a version for your project.

ReaFuse takes that one step further: **reverse engineer two things with REA, then fuse them into a third thing that never existed.**

| | REA — Reverse Engineer Anything | ReaFuse (built on REA) |
|---|---|---|
| Input | One target: an app, binary, bundle or site | Two donors |
| Question | How does this work? | What new thing can these two become? |
| Output | Evidence: modules, imports, call paths, behavior | A brand-new project with a lab report |
| Proof | Evidence and limitations behind each finding | Contract tests, sandboxed verification, originality scan, certificate |

How ReaFuse uses REA:

- Every donor goes through **REA's static JavaScript application analysis** (`rea analyze-javascript-application`). Donor code is parsed as inert text and never executed.
- REA's evidence graph is condensed into modules, exports and imports, and fed into the donor's **spec card**, so the fusion is grounded in what REA actually observed.
- Each lab report records the **REA version and REA evidence id** for every donor, e.g. `ev_1bb7dd1cd16550c…`, so anyone can trace a creature back to REA's findings.
- `rea-agents` is a pinned dependency (6.4.0). Run `npm run rea:doctor` to check your REA setup.

On the roadmap: REA website and Electron-app analysis as donor types. That covers REA's whole "anything", not just source repositories.

> ReaFuse is an independent community project built on REA. It is not affiliated with or endorsed by the REA maintainers. All credit for REA goes to [morluto and the REA contributors](https://github.com/morluto/rea). If you like ReaFuse, go star REA too.

## The creatures

Every run ends in a lab report with a verdict: **ALIVE**, **UNSTABLE**, **DEAD** or **REJECTED**.

| Creature | Donor A | Donor B | What's new | Contract | Verdict |
|---|---|---|---|---|---|
| [ratewise](showcase/ratewise/REPORT.md) | [vercel/ms](https://github.com/vercel/ms) — durations | [sindresorhus/pretty-bytes](https://github.com/sindresorhus/pretty-bytes) — byte sizes | Transfer rates, ETAs, data budgets: `eta("3 GB", "25 MB/s")` → `"2m"` | 18/18 | ✅ ALIVE |
| [objdelta](showcase/objdelta/REPORT.md) | [lukeed/dequal](https://github.com/lukeed/dequal) — deep equality | [lukeed/klona](https://github.com/lukeed/klona) — deep cloning | Structural diff + immutable patch: `patch(a, diff(a, b))` equals `b` | 17/17 | ✅ ALIVE |

Each folder in [`showcase/`](showcase) contains the creature, its lab report, the REA evidence summaries, and every brain answer (spec cards, proposals, contract, grown files), so a run can be audited and replayed.

## How it works

```
donor A ─┐                                                                    
         ├─▶ intake ─▶ dissect ─▶ fuse ─▶ contract ─▶ grow ─▶ verify ─▶ originality ─▶ lab report
donor B ─┘   license    REA +     3 ideas  tests      fresh   sandbox    clean-room     certificate
             gate       spec      pick 1   first      code    + repair   scan
                        cards
```

1. **Intake** — clones the donors (shallow, no hooks, no symlinks) and runs a **license gate**. Copyleft and unknown licenses are rejected unless you opt in.
2. **Dissect with REA** — [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) statically analyses each donor (modules, exports, imports — donor code is parsed as inert text, never executed). The brain turns REA evidence, README and tests into a **spec card**: behavior only, no code.
3. **Fuse** — the brain proposes three creatures that inherit from both donors *and* gain a capability neither had. You pick one.
4. **Contract** — acceptance tests are written **before** the creature exists, each mapped to its origin (A, B or fusion). The creature can never edit them.
5. **Grow** — a brand-new codebase is generated from the specs: zero dependencies, its own tests, README and CLI.
6. **Verify** — tests run under Node's permission model (read-only creature folder, no child processes, no file writes). Failures go back to the brain for up to two repair rounds.
7. **Originality** — a token-fingerprint scanner compares the creature to every donor source file. Copied stretches (even reformatted) turn the verdict into **REJECTED**.
8. **Report** — `REPORT.md` + `report.json` with commits, licenses, evidence ids, test lineage, originality metrics and a SHA-256 certificate. The creature gets a `LINEAGE.md`.

## Install

Requires Node.js 22.19+ and git.

```bash
git clone https://github.com/sickpyramid/ReaFuse && cd ReaFuse
npm install
npm link        # makes the `reafuse` command available
reafuse doctor
```

## Usage

```bash
reafuse fuse <donorA> <donorB> [--pick n]   # full run
reafuse resume <run-id>                     # continue a paused run, or grow another pick
reafuse dissect <donor>                     # profile + license + REA evidence, no brain needed
reafuse runs                                # list runs
reafuse doctor                              # check REA, git and brain availability
```

Donors can be GitHub URLs, `owner/repo` shorthand or local directories. Websites and binaries are on the roadmap.

### Web lab

Type two subjects side by side, such as a repo, a link or just an app name like `Spotify` × `Instagram`, and watch the fusion live. App names and websites are resolved to open-source twins before REA dissects them.

```bash
node web/server.mjs                                   # http://localhost:4400
docker compose -f deploy/compose.yml up -d --build    # production (Claude CLI inside)
docker exec -it reafuse claude                   # one-time login for the lab's brain
```

### Choosing a brain

| Brain | How | When |
|---|---|---|
| `anthropic` | set `ANTHROPIC_API_KEY` | default when a key is present; uses Claude Opus 5.5 with structured outputs |
| `claude-cli` | a logged-in [Claude Code](https://claude.com/claude-code) CLI on `PATH` (or `REAFUSE_CLAUDE_BIN`) | use your Claude subscription |
| `handoff` | `--brain handoff` | writes each request to `brain/<stage>.prompt.md` and waits for `<stage>.response.json` — lets any agent (or a human) act as the brain |

Every brain answer is cached in the run folder, so runs are resumable and reproducible regardless of provider. The showcase creatures were produced with the `handoff` brain, with Claude Code answering each stage.

## Responsible use

- Only fuse projects you own or whose licenses permit it. The license gate is a safeguard, not legal advice.
- ReaFuse learns **behavior**, never code. The originality scan enforces this; do not disable it to ship copied code.
- Donor projects keep their own copyrights. Reports credit every donor with its commit and license.

## FAQ

**What is REA (Reverse Engineer Anything)?**
[REA](https://github.com/morluto/rea) is an open-source CLI and MCP server by morluto that lets you and your AI agent reverse engineer native binaries, JavaScript/Electron apps, .NET assemblies and websites, with evidence for every finding. Install it with `npx rea-agents setup`.

**What can I build with REA?**
REA's own workflow is "understand a feature, then build a version for your project." ReaFuse is one example of building on top of REA: it automates *understand two projects → fuse them → build and verify something new*.

**Is ReaFuse an REA plugin or fork?**
Neither. It is a separate open-source tool that depends on the published `rea-agents` npm package and calls the REA CLI. REA is unmodified.

**Do I need REA installed separately?**
No. `npm install` pulls in the pinned `rea-agents` package. `reafuse doctor` shows which REA version is active. Use `--no-rea` to skip REA analysis.

**Does it copy code from the donors?**
No. ReaFuse learns behavior from REA evidence, READMEs and tests, then grows fresh code. The originality scan rejects creatures that contain copied donor code, even reformatted.

**Can it reverse engineer websites and apps like REA does?**
Not yet. v0.1 fuses source repositories. Websites and Electron apps through REA's analyzers are next on the roadmap.

## Status

v0.1 — JavaScript/TypeScript donors analysed with REA, library + CLI creatures, Node.js verification. Next: website and Electron-app donors through REA, Python creatures, a public lab gallery.

## Credits

- **[REA — Reverse Engineer Anything](https://github.com/morluto/rea)** by morluto and contributors (MIT) is the reverse-engineering engine underneath ReaFuse. ReaFuse is independent and not affiliated with or endorsed by REA. Please star REA if this project is useful to you.
- Showcase donors: [ms](https://github.com/vercel/ms), [pretty-bytes](https://github.com/sindresorhus/pretty-bytes), [dequal](https://github.com/lukeed/dequal), [klona](https://github.com/lukeed/klona) — all MIT. No donor code is included in this repository.

## License

MIT — see [LICENSE](LICENSE). Third-party notices in [NOTICE.md](NOTICE.md).
