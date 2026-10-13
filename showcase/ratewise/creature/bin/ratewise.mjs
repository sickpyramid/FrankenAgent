#!/usr/bin/env node
import { budget, eta, formatRate, formatSize, parseRate } from "../src/index.mjs";

const HELP = `ratewise — transfer rates, ETAs and data budgets for humans

Usage
  ratewise eta <size> <rate> [--long]     ratewise eta "3 GB" "25 MB/s"      → 2m
  ratewise rate <rate> [--per s|m|h|d]    ratewise rate "20 GB/day" --per s → 231 kB/s
  ratewise budget <rate> <duration>       ratewise budget "100 Mbit/s" 1h   → 45 GB

Flags
  --long      Spell durations out (2 minutes)
  --per       Period for rate output (default s)
  --binary    Use KiB, MiB, GiB…
  --bits      Show bits (Mbit) instead of bytes`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--") && arg !== "--per"));
const perIndex = args.indexOf("--per");
const per = perIndex === -1 ? "s" : args[perIndex + 1];
const words = args.filter((arg, index) => !arg.startsWith("--") && (perIndex === -1 || index !== perIndex + 1));
const [command, first, second] = words;
const unitOptions = { binary: flags.has("--binary"), bits: flags.has("--bits") };

try {
  if (!command || flags.has("--help") || command === "help") {
    console.log(HELP);
  } else if (command === "eta" && first && second) {
    console.log(eta(first, second, { long: flags.has("--long") }));
  } else if (command === "rate" && first) {
    const value = parseRate(first);
    if (Number.isNaN(value)) throw new TypeError(`Unrecognised rate: ${first}`);
    console.log(formatRate(value, { per, ...unitOptions }));
  } else if (command === "budget" && first && second) {
    console.log(formatSize(budget(first, second), unitOptions));
  } else {
    console.error(HELP);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`ratewise: ${error.message}`);
  process.exitCode = 1;
}
