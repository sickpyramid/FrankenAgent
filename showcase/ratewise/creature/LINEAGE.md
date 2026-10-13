# IT'S ALIVE

**ratewise** — Human-readable transfer rates, ETAs and data budgets: '3 GB at 25 MB/s' → '2m'.

## Donors

| | Donor | Commit | License | Gate |
|---|---|---|---|---|
| A | [ms](https://github.com/vercel/ms) | `4ff48cec09` | MIT | ✅ MIT is permissive. |
| B | [pretty-bytes](https://github.com/sindresorhus/pretty-bytes) | `a35ed21bb4` | MIT | ✅ MIT is permissive. |

## The creature

A tiny library and CLI for anyone who moves data: parse sizes ('1.5 GB') and rates ('100 Mbit/s', '20 GB/day'), format rates back for humans, estimate how long a transfer takes, and compute how much data fits in a time window. Useful for download managers, backup scripts, CI logs and capacity planning.

- **Inherited from A:** parse-duration, format-duration-short, format-duration-long
- **Inherited from B:** format-bytes, unit-systems
- **Born from the fusion:** Rates: sizes divided by durations. Neither donor can parse '20 GB/day', convert it to bytes per second, or answer 'how long will 3 GB take at 25 MB/s?'.

### API

- `parseSize(text: string): number` — Parses '1.5 GB', '2 KiB', '100 Mbit' or a bare number of bytes into bytes. Bits are divided by 8. Returns NaN for unrecognised text.
- `parseRate(text: string): number` — Parses '<size>/<duration unit>' such as '5 MB/s', '20 GB/day', '100 Mbit/s' into bytes per second. Returns NaN for unrecognised text.
- `formatSize(bytes: number, options?: { binary?: boolean, bits?: boolean }): string` — Formats bytes with 3 significant digits, e.g. 1337 → '1.34 kB'.
- `formatRate(bytesPerSecond: number, options?: { per?: 's'|'m'|'h'|'d', binary?: boolean, bits?: boolean }): string` — Formats a rate, e.g. 1337 → '1.34 kB/s'; with bits, 12500000 → '100 Mbit/s'.
- `eta(size: number|string, rate: number|string, options?: { long?: boolean }): string` — How long a transfer takes, as a short ('2m') or long ('2 minutes') duration.
- `budget(rate: number|string, duration: number|string): number` — Bytes transferred at a rate over a duration (milliseconds or text like '1h').

### CLI

```bash
ratewise eta "3 GB" "25 MB/s"
ratewise rate "20 GB/day" --per s
ratewise budget "100 Mbit/s" 1h
```

## Verification

- Sandbox: node --permission (read-only creature folder, no child processes, no writes)
- Lab contract: **18/18** passed
- Creature's own tests: **7/7** passed
- Attempts: grow → ALIVE

### Contract lineage

| Test | Origin |
|---|---|
| parseSize reads decimal units | B |
| parseSize reads binary units | B |
| parseSize converts bits to bytes | B |
| parseSize treats a bare number as bytes | B |
| parseSize returns NaN for unrecognised text | B |
| parseRate reads per-second rates | fusion |
| parseRate understands duration units like ms does | A |
| parseRate returns NaN without a time unit or for nonsense | fusion |
| formatSize uses 3 significant digits and decimal units | B |
| formatSize supports binary and bit units | B |
| formatRate formats bytes per second | fusion |
| formatRate can express the rate per day | fusion |
| eta gives a short duration for text inputs | fusion |
| eta gives a long duration on request | A |
| eta accepts raw numbers (bytes and bytes per second) | fusion |
| eta rejects a zero rate | fusion |
| budget multiplies a rate by a duration | fusion |
| budget output reads naturally through formatSize | fusion |

## Clean-room originality scan

- Fingerprint overlap with donor code: **0.0%** (limit 15%)
- Longest shared token run: **0** (limit 60)
- Result: ✅ original

## Provenance

- Run: `202610131244-ms-x-pretty-bytes-b462`
- ReaFuse 0.1.0 · REA 6.4.0 · brain: handoff
- Certificate: `16e6ce1b250dbd635734e23d440e04385a07b509781b4b846a11b46c95155e2d`

Behavior was learned from the donors; no donor code was copied or executed. Donors keep their own licenses and credit.
