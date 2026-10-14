<div align="center">

# 🧟 ReaFuse

### Built on [REA — Reverse Engineer Anything](https://github.com/morluto/rea)

**Two apps in. One new thing out.**

Name two apps or repos, for example `Spotify` and `WhatsApp`. ReaFuse studies both with REA, invents three new projects that combine them, writes the one you pick from scratch, and tests it until it works.

[![Built on REA](https://img.shields.io/badge/built%20on-REA%20%E2%80%94%20Reverse%20Engineer%20Anything-5c4ee5?style=flat-square)](https://github.com/morluto/rea)
[![rea-agents](https://img.shields.io/badge/rea--agents-6.4.0-cb3837?style=flat-square&logo=npm)](https://www.npmjs.com/package/rea-agents)
[![MCP server](https://img.shields.io/badge/MCP-server-5c4ee5?style=flat-square)](#use-it-inside-your-ai-agent)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.19-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#quick-start-5-minutes)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)

**[▶ Try it live](https://reafuse.140-82-32-12.sslip.io)** · [Quick start](#quick-start-5-minutes) · [Use it in your agent](#use-it-inside-your-ai-agent) · [How it works](#how-it-works) · [Troubleshooting](#troubleshooting) · [FAQ](#faq)

<sub>Independent community project built on REA. Not made by, affiliated with or endorsed by the REA maintainers.</sub>

</div>

---

## What does it do?

```text
  Spotify ─┐
           ├─▶  study both with REA  ─▶  3 new ideas  ─▶  you pick one  ─▶  write it  ─▶  test it  ─▶  ✅ ALIVE
 WhatsApp ─┘
```

For **Spotify × WhatsApp**, ReaFuse proposed:

1. **listen-party**: synchronized group listening with a shared queue and chat
2. **lyric-lab**: collaborative lyric annotation with AI suggestions
3. **wave-share**: generate and share animated audio-visualization clips

You choose one, and ReaFuse writes it as a brand-new project with its own tests, README and command-line tool. It never copies the original apps' code: a built-in scanner checks for that.

## Three ways to use it

| | For | What you need |
|---|---|---|
| **[Online](https://reafuse.140-82-32-12.sslip.io)** | Trying it out | A browser |
| **[On your computer](#quick-start-5-minutes)** | Running it yourself | Node.js and git, 5 minutes |
| **[Inside your AI agent](#use-it-inside-your-ai-agent)** | Claude Code, Codex, Cursor users | One command; your agent does the thinking, no API key |

## Quick start (5 minutes)

**1. Install the two prerequisites** (skip what you already have):

- [Node.js 22 or newer](https://nodejs.org) (choose the LTS download)
- [git](https://git-scm.com/downloads)

**2. Download ReaFuse and set it up:**

```bash
git clone https://github.com/sickpyramid/ReaFuse
cd ReaFuse
npm install
npm link
```

`npm link` creates the `reafuse` command. If it fails with a permission error, skip it and type `npm start --` instead of `reafuse` in the commands below (for example `npm start -- doctor`).

**3. Check everything is ready:**

```bash
reafuse doctor
```

You should see four ✓ marks. If not, the line with ✗ tells you what to do.

**4. Fuse something:**

```bash
reafuse fuse Spotify WhatsApp
```

or with real repositories:

```bash
reafuse fuse vercel/ms sindresorhus/pretty-bytes
```

ReaFuse shows three ideas and asks which one to build. When it finishes, the new project is in `.reafuse/runs/<run>/creature/` and the report is next to it in `REPORT.md`.

**No account needed.** Out of the box ReaFuse thinks with [Kilo Gateway](https://kilo.ai)'s free models. If you have a Claude subscription, install [Claude Code](https://claude.com/claude-code) and log in (`claude`, then `/login`): ReaFuse then uses it automatically for the code-writing steps, which gives better results. See [choosing a brain](#choosing-a-brain).

**Prefer a web page?** Run `npm run lab` and open http://localhost:4400.

## Use it inside your AI agent

ReaFuse includes an [MCP](https://modelcontextprotocol.io) server. Add it to your agent and the agent itself does the thinking, using your existing account. Replace `/path/to/ReaFuse` with the folder you cloned.

**Claude Code**

```bash
claude mcp add reafuse -- node /path/to/ReaFuse/bin/reafuse.mjs mcp
```

**Codex** (in `~/.codex/config.toml`)

```toml
[mcp_servers.reafuse]
command = "node"
args = ["/path/to/ReaFuse/bin/reafuse.mjs", "mcp"]
```

**Cursor, Windsurf or any other MCP client** (in its `mcp.json`)

```json
{ "mcpServers": { "reafuse": { "command": "node", "args": ["/path/to/ReaFuse/bin/reafuse.mjs", "mcp"] } } }
```

Then just ask your agent: *"Fuse Spotify and WhatsApp with ReaFuse."*

Agents that support skills can also load [`skills/reafuse/SKILL.md`](skills/reafuse/SKILL.md) (for Claude Code, copy the folder to `~/.claude/skills/reafuse/`).

<details>
<summary>MCP tools and options</summary>

| Tool | What it does |
|---|---|
| `reafuse_fuse` | Starts a run from two donors and returns the next step |
| `reafuse_answer` | Gives ReaFuse the agent's answer for the step it is waiting on |
| `reafuse_pick` | Chooses which of the three ideas to build |
| `reafuse_status` | Shows a run's report, or lists recent runs |
| `reafuse_dissect` | Profiles one repository with REA, no fusion |

By default the agent answers every reasoning step (`REAFUSE_MCP_BRAIN=handoff`). Set `REAFUSE_MCP_BRAIN` to `kilo`, `claude-cli`, `hybrid` or `anthropic` to let ReaFuse call a model itself.

</details>

## How it works

```text
donor A ─┐
         ├─▶ find ─▶ dissect ─▶ fuse ─▶ contract ─▶ grow ─▶ verify ─▶ originality ─▶ report
donor B ─┘   GitHub   REA +     3 ideas  tests      fresh   sandbox    clean-room     verdict +
             search   specs     pick 1   first      code    + repair   scan           certificate
```

1. **Find:** app names and websites are matched to open-source projects that recreate them, with one GitHub search per app, ranked by similarity, popularity and REA compatibility (about 2 seconds). Repository links skip this step.
2. **Dissect with REA:** [REA](https://github.com/morluto/rea) statically analyzes each project (modules, exports, imports; code is read, never run). The brain turns that evidence plus the README and tests into a **spec card** that describes behavior, never code.
3. **Fuse:** the brain proposes three new projects that use both donors and add something neither had. You pick one.
4. **Contract:** acceptance tests are written **before** any code, each traced to donor A, donor B or the fusion. The new project can't change them.
5. **Grow:** a new codebase is written from the specs, with zero dependencies, its own tests, a README and a CLI.
6. **Verify:** tests run in a sandbox (Node's permission model: no file writes, no child processes). Failures go back to the brain for up to two repair rounds.
7. **Originality:** a fingerprint scanner compares the new code against every donor file. Copied code, even reformatted, turns the verdict into **REJECTED**.
8. **Report:** `REPORT.md` and `report.json` record the donors, licenses, REA evidence, test results, originality score and a SHA-256 certificate.

**Verdicts:** ✅ **ALIVE** (all tests pass) · ⚠ **UNSTABLE** (most pass) · 💀 **DEAD** (most fail) · ⛔ **REJECTED** (copied code, or a strict license check failed)

<details>
<summary>Glossary</summary>

| Word | Meaning |
|---|---|
| **Donor** | One of the two inputs: an app name, website, repository or folder |
| **Creature** | The new project ReaFuse builds |
| **Spec card** | A behavior-only description of what a donor does |
| **Contract** | The tests the creature must pass, written before it exists |
| **Brain** | The AI model that does the reasoning steps |
| **Lab / run** | One fusion; everything it produces is saved in `.reafuse/runs/<run>/` |

</details>

## Examples

| Creature | Donor A | Donor B | What's new | Tests | Verdict |
|---|---|---|---|---|---|
| [ratewise](showcase/ratewise/REPORT.md) | [vercel/ms](https://github.com/vercel/ms) (durations) | [sindresorhus/pretty-bytes](https://github.com/sindresorhus/pretty-bytes) (byte sizes) | Transfer rates and ETAs: `eta("3 GB", "25 MB/s")` → `"2m"` | 18/18 | ✅ ALIVE |
| [objdelta](showcase/objdelta/REPORT.md) | [lukeed/dequal](https://github.com/lukeed/dequal) (deep equality) | [lukeed/klona](https://github.com/lukeed/klona) (deep cloning) | Diff and immutable patch: `patch(a, diff(a, b))` equals `b` | 17/17 | ✅ ALIVE |

Each folder in [`showcase/`](showcase) holds the creature, its report, the REA evidence and every brain answer, so a run can be audited and replayed.

<details>
<summary>What a run looks like in the terminal</summary>

```text
🧪 Intake: acquiring donors
   A: ms ✓ @ 4ff48cec09, MIT
   B: pretty-bytes ✓ @ a35ed21bb4, MIT
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

</details>

## Built on REA (Reverse Engineer Anything)

[REA](https://github.com/morluto/rea) answers *"how does this feature work?"* for binaries, JavaScript and Electron apps, .NET assemblies and websites, with evidence for every conclusion. ReaFuse takes the next step: **reverse engineer two things with REA, then fuse them into a third thing that never existed.**

| | REA | ReaFuse (built on REA) |
|---|---|---|
| Input | One app, binary, bundle or site | Two apps, repos or sites |
| Question | How does this work? | What new thing can these two become? |
| Output | Evidence: modules, imports, call paths | A new, tested project and a lab report |

Every donor goes through REA's static JavaScript analysis (`rea analyze-javascript-application`). REA's evidence feeds the spec cards, and each report records the REA version and evidence id. `rea-agents` is installed automatically by `npm install`.

## Advanced

### Command reference

```bash
reafuse fuse <A> <B> [--pick n]     # full run (asks which idea to build unless --pick is given)
reafuse resume <run>                # continue a paused run, or build another idea with --pick
reafuse dissect <donor>             # REA profile of one donor, no AI needed
reafuse runs                        # list runs
reafuse mcp                         # start the MCP server
reafuse doctor [--json]             # check the setup
```

Donors can be app names (`Spotify`), websites (`instagram.com`), GitHub URLs, `owner/repo` or local folders.

| Option | Effect |
|---|---|
| `--brain <name>` | Which AI does the reasoning (see below) |
| `--pick <n>` | Build idea *n* without asking |
| `--no-rea` | Skip REA analysis (faster, less grounded) |
| `--max-repairs <n>` | Repair rounds after failing tests (default 2) |
| `--strict-license` | Refuse copyleft and unidentified licenses (default: record and warn) |
| `--lab <dir>` | Where runs are stored (default `.reafuse`) |

### Choosing a brain

Everything runs on **your** accounts. Set `REAFUSE_BRAIN` in `.env` (copy [`.env.example`](.env.example)) or pass `--brain`.

| Brain | Setup | Best for |
|---|---|---|
| `auto` (default) | nothing | Anthropic key if set; otherwise Kilo free, plus your Claude CLI for code if installed |
| `kilo` | nothing for free models (`KILO_API_KEY` for paid ones) | zero-setup use |
| `claude-cli` | install [Claude Code](https://claude.com/claude-code), run `claude`, type `/login` | using your Claude subscription |
| `hybrid` | Claude CLI login | Kilo for routine steps, Claude for writing code; each covers for the other |
| `anthropic` | `ANTHROPIC_API_KEY` | API users; Claude Opus 5.5 with structured outputs |
| `handoff` | nothing | an agent or a human answers each step (writes `brain/<stage>.prompt.md`, reads `<stage>.response.json`) |

Every answer is cached in the run folder, so runs can be resumed and replayed.

### All settings

| Variable | Default | Meaning |
|---|---|---|
| `REAFUSE_BRAIN` | `auto` | Brain for CLI and web lab |
| `REAFUSE_MCP_BRAIN` | `handoff` | Brain for the MCP server (`handoff` = your agent) |
| `ANTHROPIC_API_KEY` | | Anthropic API key |
| `KILO_API_KEY` | | Kilo Gateway key (only for paid models) |
| `REAFUSE_KILO_MODEL` | `kilo-auto/free` | Kilo model |
| `REAFUSE_CLAUDE_MODEL` | `claude-opus-5-5` | Model passed to the Claude CLI |
| `REAFUSE_CLAUDE_BIN` | found on `PATH` | Path to the Claude CLI |
| `GITHUB_TOKEN` | | Faster app-name lookups (30 searches/min instead of 10) |
| `REAFUSE_LAB` | `.reafuse` | Where runs and caches are stored |
| `PORT` | `4400` | Web lab port |
| `REAFUSE_RUNS_PER_HOUR` | `6` | Web lab rate limit per visitor |
| `REAFUSE_MAX_CONCURRENT` | `1` | Web lab fusions at the same time |

### Web lab and Docker

```bash
npm run lab                                          # http://localhost:4400
```

Self-hosting with Docker (the image includes the Claude CLI):

```bash
cp .env.example deploy/.env                          # choose a brain, add keys if any
docker compose -f deploy/compose.yml up -d --build   # serves 127.0.0.1:4400
docker exec -it reafuse claude                       # only for claude-cli/hybrid: type /login once
```

[`deploy/examples/Caddyfile.example`](deploy/examples/Caddyfile.example) adds HTTPS with live streaming.

### Development

```bash
npm test     # 22 tests, including offline end-to-end runs
```

The code lives in `src/` (pipeline, brains, REA wrapper, twin search, originality scan, MCP server), the web lab in `web/`, and the tests in `test/`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `reafuse: command not found` | Run `npm link` in the ReaFuse folder, or use `npm start -- <command>` |
| `npm link` permission error | Use `npm start -- <command>` instead, or fix npm's global folder ([guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)) |
| Node version error | Install Node.js 22 or newer from [nodejs.org](https://nodejs.org) |
| `Claude CLI … not logged in` | Run `claude`, type `/login`, finish in the browser; or use `--brain kilo` |
| Steps are slow (2-3 min each) | Kilo's free models are slow. Log in to the Claude CLI, or set a `KILO_API_KEY` with a faster model |
| `GitHub search 403` / rate limit | Wait a minute, or add a `GITHUB_TOKEN` to `.env`. ReaFuse falls back to the AI lookup on its own |
| `Could not find a usable open-source build` | Use a repository link instead of an app name |
| A run stopped half-way | `reafuse resume <run>`: finished steps are cached and not redone |

Still stuck? Run `reafuse doctor --json` and [open an issue](https://github.com/sickpyramid/ReaFuse/issues) with its output.

## Responsible use

- ReaFuse is a tool: you are responsible for what you fuse and ship. Every report records each donor's license, so check it before publishing a creature. `--strict-license` enforces a conservative policy.
- ReaFuse learns **behavior**, never code. The originality scan enforces this, so don't disable it to ship copied code.
- Donor projects keep their copyrights. Reports credit every donor with its commit and license.

## FAQ

**What is REA (Reverse Engineer Anything)?**
[REA](https://github.com/morluto/rea) is an open-source CLI and MCP server by morluto for reverse engineering native binaries, JavaScript/Electron apps, .NET assemblies and websites, with evidence for every finding.

**Do I need an API key or a paid account?**
No. Without any setup ReaFuse uses Kilo Gateway's free models. A Claude subscription (through Claude Code) or an Anthropic API key gives better and faster results.

**Can I really type "Spotify"?**
Yes. ReaFuse finds open-source projects that recreate the app, studies the best match with REA, and builds from that. It never touches the real app or its code. The report names the project it studied.

**Does it copy code from the donors?**
No. It learns behavior from REA evidence, READMEs and tests, then writes fresh code. The originality scan rejects creatures that contain copied donor code.

**What languages does it support?**
Donors are analyzed as JavaScript/TypeScript (what REA's application analyzer reads). Creatures are written in modern JavaScript for Node.js.

**Is ReaFuse an REA plugin or fork?**
Neither. It's a separate project that depends on the published `rea-agents` package. REA is unmodified.

## Status

v0.1 — app-name, website and repository donors; REA analysis of JavaScript/TypeScript; library + CLI creatures; Kilo, Claude CLI, Anthropic and agent (MCP) brains; web lab. Next: runnable web-app creatures, direct REA website analysis, Python creatures.

## Credits

- **[REA — Reverse Engineer Anything](https://github.com/morluto/rea)** by morluto and contributors (MIT) is the reverse-engineering engine underneath ReaFuse. ReaFuse is independent and not affiliated with or endorsed by REA. Please star REA if this project is useful to you.
- Showcase donors: [ms](https://github.com/vercel/ms), [pretty-bytes](https://github.com/sindresorhus/pretty-bytes), [dequal](https://github.com/lukeed/dequal), [klona](https://github.com/lukeed/klona), all MIT. No donor code is included in this repository.

## License

MIT, see [LICENSE](LICENSE). Third-party notices in [NOTICE.md](NOTICE.md).
