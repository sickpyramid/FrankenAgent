import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { exists, run, slugify } from "./util.mjs";

const GIT_HOSTS = /^(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i;
const DOMAIN = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/.*)?$/i;
const PATHLIKE = /^(\.{1,2}[\\/]|[\\/]|[a-zA-Z]:[\\/])/;

/**
 * Classifies a donor reference: git repositories, local directories, websites
 * and plain product names ("Spotify"). Websites and names are resolved to an
 * open-source twin repository by the pipeline before acquisition.
 */
export function classifyTarget(input) {
  const text = String(input).trim();
  const hosted = text.match(GIT_HOSTS);
  if (hosted) {
    return { kind: "git", url: `https://${hosted[1].toLowerCase()}/${hosted[2]}/${hosted[3]}.git`, name: hosted[3] };
  }
  if (/^https?:\/\//i.test(text)) {
    return { kind: "website", url: text, name: new URL(text).hostname.replace(/^www\./, "") };
  }
  if (PATHLIKE.test(text)) {
    return { kind: "local", path: resolve(text), name: slugify(resolve(text).split(/[\\/]/).pop()) };
  }
  if (/^git@[\w.-]+:[\w.-]+\/[\w.-]+$/.test(text)) {
    return { kind: "git", url: text, name: text.replace(/\.git$/, "").split(/[/:]/).pop() };
  }
  if (DOMAIN.test(text) && !existsSync(resolve(text))) {
    return { kind: "website", url: `https://${text}`, name: text.split("/")[0].replace(/^www\./, "") };
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) {
    // owner/repo shorthand for GitHub, unless it exists locally.
    return { kind: "maybe-github", url: `https://github.com/${text}.git`, name: text.split("/")[1] };
  }
  if (existsSync(resolve(text))) {
    return { kind: "local", path: resolve(text), name: slugify(resolve(text).split(/[\\/]/).pop()) };
  }
  return { kind: "name", name: text };
}

/** Resolves a repository reference to a local directory FrankenAgent can inspect. */
export async function acquireTarget(input, cacheDir, { allowLocal = true } = {}) {
  let target = classifyTarget(input);

  if (target.kind === "maybe-github") {
    target = allowLocal && (await isDirectory(resolve(input)))
      ? { kind: "local", path: resolve(input), name: slugify(target.name) }
      : { kind: "git", url: target.url, name: target.name };
  }

  if (target.kind === "website" || target.kind === "name") {
    throw new Error(`"${input}" is not a repository. Resolve it to an open-source twin first.`);
  }

  if (target.kind === "local") {
    if (!allowLocal) throw new Error("Local directories are disabled here. Use a repository URL or a name.");
    if (!(await isDirectory(target.path))) throw new Error(`Donor directory not found: ${target.path}`);
    const commit = await gitHead(target.path);
    return { input, kind: "local", name: target.name, path: target.path, commit };
  }

  if (!allowLocal && !target.url.startsWith("https://")) {
    throw new Error("Only https repository URLs are accepted here.");
  }

  const dest = join(cacheDir, slugify(target.url.replace(/^https?:\/\//, ""), 80));
  if (!(await exists(join(dest, ".git")))) {
    // Cloning never executes repository code: hooks are not transferred by git clone,
    // and we disable symlinks so a donor cannot point outside its own folder.
    const result = await run(
      "git",
      ["-c", "core.symlinks=false", "clone", "--depth", "1", "--quiet", "--no-recurse-submodules", target.url, dest],
      { timeoutMs: 180_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" } },
    );
    if (result.code !== 0) {
      throw new Error(`git clone failed for ${target.url}: ${result.stderr.trim() || result.stdout.trim()}`);
    }
  }
  const commit = await gitHead(dest);
  return { input, kind: "git", name: slugify(target.name), url: target.url, path: dest, commit };
}

/** True when a public repository answers at this URL. */
export async function repositoryExists(url) {
  const result = await run("git", ["ls-remote", "--heads", url], {
    timeoutMs: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return result.code === 0;
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
