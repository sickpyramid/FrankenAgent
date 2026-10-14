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

1. **Intake** — resolves app names and websites to open-source builds, clones the donors (shallow, no hooks, no symlinks) and records each **license**. Licenses are flagged, not blocked (ReaFuse never reuses donor code); `--strict-license` refuses copyleft and unidentified ones.
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
npm link            # makes the `reafuse` command available
cp .env.example .env   # pick a brain, add keys if you use them
reafuse doctor
```

## Use it inside your agent (MCP)

ReaFuse ships an MCP server. Your agent (Claude Code, Codex, Cursor, …) becomes ReaFuse's brain: it receives each reasoning step as a request and answers it, so **no API key is needed**. Replace `/path/to/ReaFuse` with your clone.

**Claude Code**

```bash
claude mcp add reafuse -- node /path/to/ReaFuse/bin/reafuse.mjs mcp
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.reafuse]
command = "node"
args = ["/path/to/ReaFuse/bin/reafuse.mjs", "mcp"]
```

**Cursor / any MCP client** (`mcp.json`)

```json
{ "mcpServers": { "reafuse": { "command": "node", "args": ["/path/to/ReaFuse/bin/reafuse.mjs", "mcp"] } } }
```

Then ask: *"Fuse Spotify and WhatsApp with ReaFuse."* The tools are `reafuse_fuse`, `reafuse_answer`, `reafuse_pick`, `reafuse_status` and `reafuse_dissect`. To let ReaFuse call a model itself instead, set `REAFUSE_MCP_BRAIN` to `claude-cli`, `anthropic`, `kilo` or `hybrid`.

For agents that load skills, [`skills/reafuse/SKILL.md`](skills/reafuse/SKILL.md) explains the workflow; copy it into your agent's skills folder (for Claude Code: `~/.claude/skills/reafuse/`).

## Usage (CLI)

```bash
reafuse fuse <donorA> <donorB> [--pick n]   # full run
reafuse resume <run-id>                     # continue a paused run, or grow another pick
reafuse dissect <donor>                     # profile + license + REA evidence, no brain needed
reafuse runs                                # list runs
reafuse mcp                                 # MCP server (see above)
reafuse doctor                              # check REA, git and brain availability
```

Donors can be GitHub URLs, `owner/repo`, local directories, websites (`instagram.com`) or app names (`Spotify`). Names and websites are studied through a matching open-source JavaScript/TypeScript build.

### Choosing a brain

Use your own account; nothing is tied to ours. Set `REAFUSE_BRAIN` in `.env` or pass `--brain`.

| Brain | Setup | Notes |
|---|---|---|
| `claude-cli` | install [Claude Code](https://claude.com/claude-code), run `claude` once and `/login` | uses your Claude subscription |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude Opus 5.5 with structured outputs |
| `kilo` | nothing for free models; `KILO_API_KEY` for paid ones | [Kilo Gateway](https://kilo.ai), default model `kilo-auto/free` |
| `hybrid` | Claude CLI login + Kilo | Kilo for lookups, spec cards and concepts; Claude for contract, grow and repair; each falls back to the other |
| `handoff` | nothing | writes each request to `brain/<stage>.prompt.md` and waits for `<stage>.response.json` |
| `auto` (default) | | Anthropic key → Claude CLI → handoff |

Every brain answer is cached in the run folder, so runs are resumable and reproducible regardless of provider.

### Web lab

Two subjects side by side, live lab tape, concept picking, verdicts and a parts catalog.

```bash
npm run lab                                         # http://localhost:4400
```

With Docker (Claude CLI included):

```bash
cp .env.example deploy/.env                         # choose REAFUSE_BRAIN, add keys
docker compose -f deploy/compose.yml up -d --build  # binds 127.0.0.1:4400 by default
docker exec -it reafuse claude                      # only for claude-cli/hybrid: /login once
```

[`deploy/examples/Caddyfile.example`](deploy/examples/Caddyfile.example) shows HTTPS with live streaming.

## Responsible use

- ReaFuse is a tool: you are responsible for what you fuse and ship. Donor licenses are recorded in every report; check them before publishing a creature. `--strict-license` enforces a conservative policy.
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
