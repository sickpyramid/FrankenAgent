#!/usr/bin/env node
// Settings from a .env file in the current folder, if there is one.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env: defaults apply
}

const { main } = await import("../src/cli.mjs");

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`reafuse: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
