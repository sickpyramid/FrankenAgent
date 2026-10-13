# 🧟 FrankenAgent

**Give it two projects. It dissects them, fuses their best capabilities, and grows something new — then proves the creature is alive.**

```bash
franken fuse vercel/ms sindresorhus/pretty-bytes
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

FrankenAgent uses [REA — Reverse Engineer Anything](https://github.com/morluto/rea) to inspect donors, then adds what REA does not do: **fusion, clean-room synthesis and verification.**

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
2. **Dissect** — [REA](https://github.com/morluto/rea) statically analyses each donor (modules, exports, imports — donor code is parsed as inert text, never executed). The brain turns REA evidence, README and tests into a **spec card**: behavior only, no code.
3. **Fuse** — the brain proposes three creatures that inherit from both donors *and* gain a capability neither had. You pick one.
4. **Contract** — acceptance tests are written **before** the creature exists, each mapped to its origin (A, B or fusion). The creature can never edit them.
5. **Grow** — a brand-new codebase is generated from the specs: zero dependencies, its own tests, README and CLI.
6. **Verify** — tests run under Node's permission model (read-only creature folder, no child processes, no file writes). Failures go back to the brain for up to two repair rounds.
7. **Originality** — a token-fingerprint scanner compares the creature to every donor source file. Copied stretches (even reformatted) turn the verdict into **REJECTED**.
8. **Report** — `REPORT.md` + `report.json` with commits, licenses, evidence ids, test lineage, originality metrics and a SHA-256 certificate. The creature gets a `LINEAGE.md`.

## Install

Requires Node.js 22.19+ and git.

```bash
git clone https://github.com/sickpyramid/FrankenAgent && cd FrankenAgent
npm install
npm link        # makes the `franken` command available
franken doctor
```

## Usage

```bash
franken fuse <donorA> <donorB> [--pick n]   # full run
franken resume <run-id>                     # continue a paused run, or grow another pick
franken dissect <donor>                     # profile + license + REA evidence, no brain needed
franken runs                                # list runs
franken doctor                              # check REA, git and brain availability
```

Donors can be GitHub URLs, `owner/repo` shorthand or local directories. Websites and binaries are on the roadmap.

### Choosing a brain

| Brain | How | When |
|---|---|---|
| `anthropic` | set `ANTHROPIC_API_KEY` | default when a key is present; uses Claude Opus 5.5 with structured outputs |
| `claude-cli` | a logged-in [Claude Code](https://claude.com/claude-code) CLI on `PATH` (or `FRANKEN_CLAUDE_BIN`) | use your Claude subscription |
| `handoff` | `--brain handoff` | writes each request to `brain/<stage>.prompt.md` and waits for `<stage>.response.json` — lets any agent (or a human) act as the brain |

Every brain answer is cached in the run folder, so runs are resumable and reproducible regardless of provider. The showcase creatures were produced with the `handoff` brain, with Claude Code answering each stage.

## Responsible use

- Only fuse projects you own or whose licenses permit it. The license gate is a safeguard, not legal advice.
- FrankenAgent learns **behavior**, never code. The originality scan enforces this; do not disable it to ship copied code.
- Donor projects keep their own copyrights. Reports credit every donor with its commit and license.

## Status

v0.1 — JavaScript/TypeScript donors, library + CLI creatures, Node.js verification. Next: website donors via REA's web analysis, Python creatures, a public lab gallery.

## Credits

- [REA — Reverse Engineer Anything](https://github.com/morluto/rea) by morluto and contributors (MIT) powers donor inspection. FrankenAgent is independent and not affiliated with or endorsed by REA.
- Showcase donors: [ms](https://github.com/vercel/ms), [pretty-bytes](https://github.com/sindresorhus/pretty-bytes), [dequal](https://github.com/lukeed/dequal), [klona](https://github.com/lukeed/klona) — all MIT. No donor code is included in this repository.

## License

MIT — see [LICENSE](LICENSE). Third-party notices in [NOTICE.md](NOTICE.md).
