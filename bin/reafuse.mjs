#!/usr/bin/env node
// Settings from a .env file in the current folder, if there is one.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env: defaults apply
}

const { main } = await import("../src/cli.mjs");
const { log } = await import("../src/util.mjs");

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = `reafuse: ${error instanceof Error ? error.message : String(error)}
`;
  if (log.tee) log.write(message);
  else process.stderr.write(message);
  process.exitCode = 2;
}
