import { resolve, join } from "node:path";
import { stat } from "node:fs/promises";

import { exists, run, slugify } from "./util.mjs";

const GIT_HOSTS = /^(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;

/**
 * Classifies a donor reference. Supported in v1: local directories and public
 * git repositories. Websites and binaries are recognised so they can be
 * rejected with a clear message instead of failing obscurely.
 */
export function classifyTarget(input) {
  const text = String(input).trim();
  const hosted = text.match(GIT_HOSTS);
  if (hosted) {
    return { kind: "git", url: `https://${hosted[1]}/${hosted[2]}/${hosted[3]}.git`, name: hosted[3] };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(text) && !text.startsWith(".")) {
    // owner/repo shorthand for GitHub, unless it exists locally.
    return { kind: "maybe-github", url: `https://github.com/${text}.git`, name: text.split("/")[1] };
  }
  if (/^git@|\.git$/.test(text)) {
    return { kind: "git", url: text, name: text.replace(/\.git$/, "").split(/[/:]/).pop() };
  }
  if (/^https?:\/\//i.test(text)) {
    return { kind: "website", url: text, name: new URL(text).hostname };
  }
  return { kind: "local", path: resolve(text), name: slugify(resolve(text).split(/[\\/]/).pop()) };
}

/** Resolves a donor reference to a local directory FrankenAgent can inspect. */
export async function acquireTarget(input, cacheDir) {
  let target = classifyTarget(input);

  if (target.kind === "maybe-github") {
    target = (await isDirectory(resolve(input)))
      ? { kind: "local", path: resolve(input), name: slugify(target.name) }
      : { kind: "git", url: target.url, name: target.name };
  }

  if (target.kind === "website") {
    throw new Error(
      `Website donors are planned but not in v1 yet (${target.url}). Use a git repository or a local directory.`,
    );
  }

  if (target.kind === "local") {
    if (!(await isDirectory(target.path))) throw new Error(`Donor directory not found: ${target.path}`);
    const commit = await gitHead(target.path);
    return { input, kind: "local", name: target.name, path: target.path, commit };
  }

  const dest = join(cacheDir, slugify(target.url.replace(/^https?:\/\//, ""), 80));
  if (!(await exists(join(dest, ".git")))) {
    // Cloning never executes repository code: hooks are not transferred by git clone,
    // and we disable symlinks so a donor cannot point outside its own folder.
    const result = await run(
      "git",
      ["-c", "core.symlinks=false", "clone", "--depth", "1", "--quiet", target.url, dest],
      { timeoutMs: 180_000 },
    );
    if (result.code !== 0) {
      throw new Error(`git clone failed for ${target.url}: ${result.stderr.trim() || result.stdout.trim()}`);
    }
  }
  const commit = await gitHead(dest);
  return { input, kind: "git", name: slugify(target.name), url: target.url, path: dest, commit };
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function gitHead(dir) {
  // Only trust the donor's own repository, never a parent repository it sits inside.
  if (!(await exists(join(dir, ".git")))) return null;
  const result = await run("git", ["-C", dir, "rev-parse", "HEAD"], { timeoutMs: 15_000 });
  return result.code === 0 ? result.stdout.trim() : null;
}
