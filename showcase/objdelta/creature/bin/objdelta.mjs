#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { diff, summarize } from "../src/index.mjs";

const HELP = `objdelta — show what changed between two JSON files

Usage
  objdelta <before.json> <after.json>          Readable change list
  objdelta <before.json> <after.json> --json   Operations as JSON (feed them to patch())

Exit code: 0 when identical, 1 when they differ, 2 on errors.`;

const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));

if (args.includes("--help") || files.length !== 2) {
  console.log(HELP);
  process.exitCode = args.includes("--help") ? 0 : 2;
} else {
  try {
    const [before, after] = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8"))));
    const ops = diff(before, after);
    if (args.includes("--json")) console.log(JSON.stringify(ops, null, 2));
    else console.log(ops.length ? summarize(ops).join("\n") : "No differences.");
    process.exitCode = ops.length ? 1 : 0;
  } catch (error) {
    console.error(`objdelta: ${error.message}`);
    process.exitCode = 2;
  }
}
