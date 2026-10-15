import { createHash, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function slugify(text, max = 40) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "x"
  );
}

export function newRunId(nameA, nameB) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${stamp}-${slugify(nameA, 20)}-x-${slugify(nameB, 20)}-${randomBytes(2).toString("hex")}`;
}

export function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}

/**
 * Resolves a model-supplied relative path inside `root`, refusing anything that
 * would escape it. Returns the absolute path.
 */
export function safeJoin(root, relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) throw new Error("Empty file path");
  if (isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) throw new Error(`Absolute path refused: ${relPath}`);
  const target = resolve(root, normalize(relPath));
  const rel = relative(resolve(root), target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Path escapes creature: ${relPath}`);
  if (rel.split(sep).some((part) => part === "node_modules" || part === ".git")) {
    throw new Error(`Refused path: ${relPath}`);
  }
  return target;
}

/** Runs a command without a shell and captures bounded output. */
export function run(command, args, { cwd, timeoutMs = 120_000, env, input, maxBytes = 10 * 1024 * 1024 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      windowsHide: true,
      shell: false,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const collect = (which) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        overflow = true;
        child.kill();
        return;
      }
      if (which === "out") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", collect("out"));
    child.stderr.on("data", collect("err"));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut, overflow });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut, overflow });
    });
    if (input !== undefined) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

export const log = {
  quiet: false,
  /** Optional file that receives a copy of every line (a run's live.log). */
  tee: null,
  write(line) {
    if (!this.quiet) process.stderr.write(line);
    if (this.tee) {
      try {
        appendFileSync(this.tee, line);
      } catch {
        // the lab tape is best effort
      }
    }
  },
  step(text) {
    this.write(`\n🧪 ${text}\n`);
  },
  info(text) {
    this.write(`   ${text}\n`);
  },
  warn(text) {
    this.write(`   ⚠ ${text}\n`);
  },
};
