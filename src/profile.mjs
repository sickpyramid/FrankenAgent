import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import { detectLicense } from "./license.mjs";
import { truncate } from "./util.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", "vendor", ".cache", "bower_components"]);
const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"]);
const MAX_FILES_LISTED = 400;
const MAX_FILE_BYTES = 200_000;

/**
 * Deterministic donor profile: metadata, license, file map and a bounded
 * selection of source/test excerpts for the spec writer. Never executes donor code.
 */
export async function profileDonor(dir, { sourceBudget = 60_000, testBudget = 30_000 } = {}) {
  const files = await walk(dir);
  const packageJson = await readJsonSafe(join(dir, "package.json"));
  const license = await detectLicense(dir, packageJson);
  const readmeFile = files.find((file) => /^readme(\.|$)/i.test(file.path));
  const readme = readmeFile ? await readFile(join(dir, readmeFile.path), "utf8") : "";

  const sources = files.filter((file) => SOURCE_EXT.has(extname(file.path)) && !isTest(file.path) && !isConfig(file.path));
  const tests = files.filter((file) => SOURCE_EXT.has(extname(file.path)) && isTest(file.path));
  const entrypoints = findEntrypoints(packageJson, files);

  const rankedSources = sources.sort((a, b) => rank(a, entrypoints) - rank(b, entrypoints));

  return {
    name: packageJson?.name ?? null,
    version: packageJson?.version ?? null,
    description: packageJson?.description ?? null,
    keywords: packageJson?.keywords ?? [],
    license,
    entrypoints,
    dependencies: Object.keys(packageJson?.dependencies ?? {}),
    fileCount: files.length,
    files: files.slice(0, MAX_FILES_LISTED).map((file) => file.path),
    readme: truncate(readme, 12_000),
    sources: await excerpt(dir, rankedSources, sourceBudget),
    tests: await excerpt(dir, tests, testBudget),
  };
}

/** All donor source files (for the originality check), not just the excerpted ones. */
export async function listSourceFiles(dir) {
  const files = await walk(dir);
  return files.filter((file) => SOURCE_EXT.has(extname(file.path))).map((file) => join(dir, file.path));
}

async function walk(root) {
  const out = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        if (info.size <= MAX_FILE_BYTES) out.push({ path: relative(root, full).split(sep).join("/"), size: info.size });
      }
    }
  }
  await visit(root);
  return out;
}

function isTest(path) {
  return /(^|\/)(__tests__|tests?|spec)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path) || /^test\.[cm]?[jt]s$/i.test(path);
}

function isConfig(path) {
  return /(^|\/)(\.?eslint|prettier|rollup|webpack|vite|vitest|jest|babel|tsup|karma)[.\w-]*\.(c|m)?[jt]s$/i.test(path) || /\.d\.ts$/.test(path);
}

function findEntrypoints(pkg, files) {
  const candidates = new Set();
  const add = (value) => {
    if (typeof value === "string") candidates.add(value.replace(/^\.\//, ""));
    else if (value && typeof value === "object") Object.values(value).forEach(add);
  };
  add(pkg?.main);
  add(pkg?.module);
  add(pkg?.exports);
  add(pkg?.bin);
  for (const name of ["index.js", "index.mjs", "index.ts", "src/index.js", "src/index.ts", "src/index.mjs", "lib/index.js"]) {
    if (files.some((file) => file.path === name)) candidates.add(name);
  }
  return [...candidates].filter((path) => files.some((file) => file.path === path));
}

function rank(file, entrypoints) {
  if (entrypoints.includes(file.path)) return 0;
  if (/^(src|lib)\//.test(file.path)) return 1 + file.path.split("/").length;
  return 10 + file.path.split("/").length;
}

async function excerpt(dir, files, budget) {
  const out = [];
  let used = 0;
  for (const file of files) {
    if (used >= budget) break;
    const text = await readFile(join(dir, file.path), "utf8");
    const slice = truncate(text, Math.min(budget - used, 15_000));
    used += slice.length;
    out.push({ path: file.path, content: slice });
  }
  return out;
}

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
