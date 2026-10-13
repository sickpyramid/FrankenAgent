# ratewise

Human-readable transfer rates, ETAs and data budgets.

```js
import { eta, budget, parseRate, formatRate, formatSize } from "ratewise";

eta("3 GB", "25 MB/s");                 // "2m"
eta("3 GB", "25 MB/s", { long: true }); // "2 minutes"
formatRate(parseRate("20 GB/day"));     // "231 kB/s"
formatSize(budget("100 Mbit/s", "1h")); // "45 GB"
```

Zero dependencies. Node.js 22+.

## API

| Function | What it does |
|---|---|
| `parseSize(text)` | `"1.5 GB"`, `"2 KiB"`, `"100 Mbit"`, `"100"` → bytes (`NaN` if unrecognised) |
| `parseRate(text)` | `"5 MB/s"`, `"20 GB per day"`, `"1 GB / 2s"` → bytes per second (`NaN` if unrecognised) |
| `parseDuration(text)` | `"90s"`, `"2 hours"`, `"1.5d"` → milliseconds |
| `formatSize(bytes, { binary, bits })` | `1337` → `"1.34 kB"` |
| `formatRate(bytesPerSecond, { per, binary, bits })` | `1337` → `"1.34 kB/s"`; `per` is `s`, `m`, `h` or `d` |
| `formatDuration(ms, { long })` | `120000` → `"2m"` or `"2 minutes"` |
| `eta(size, rate, { long })` | How long a transfer takes |
| `budget(rate, duration)` | Bytes moved at a rate over a duration |

Sizes use decimal units (`kB` = 1000 bytes) unless they carry an `i` (`KiB` = 1024 bytes). Units ending in `bit` are bits. Months are 1/12 of a 365.25-day year.

## CLI

```bash
ratewise eta "3 GB" "25 MB/s"          # 2m
ratewise rate "20 GB/day" --per s      # 231 kB/s
ratewise budget "100 Mbit/s" 1h        # 45 GB
```

## Lineage

ratewise was grown by [FrankenAgent](https://github.com/sickpyramid/FrankenAgent) from two donors, without copying their code. See `LINEAGE.md`.

## License

MIT
