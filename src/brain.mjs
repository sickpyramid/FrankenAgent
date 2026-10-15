import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { exists, log, run, sha256, writeJson, writeText } from "./util.mjs";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Raised when the handoff brain is waiting for an answer written by a person or agent. */
export class HandoffPending extends Error {
  constructor(stage, promptPath, responsePath) {
    super(`Brain handoff pending for stage "${stage}".`);
    this.stage = stage;
    this.promptPath = promptPath;
    this.responsePath = responsePath;
  }
}

/**
 * The brain answers structured questions. Every answer is cached in the run
 * directory, so a run is reproducible and resumable no matter which provider
 * produced it.
 */
const BACKENDS = {
  anthropic: anthropicBackend,
  "claude-cli": claudeCliBackend,
  kilo: freeRouterBackend("kilo"),
  llm7: freeRouterBackend("llm7"),
  pollinations: freeRouterBackend("pollinations"),
  handoff: handoffBackend,
};

/** Stages that write the creature's code: the ones worth the strongest brain. */
export const HEAVY_STAGES = /^(contract|grow|repair|preview)-/;

/**
 * Which providers try a stage, in order. "hybrid" sends routine stages
 * (twin lookup, spec cards, concepts) to Kilo Gateway and the code-writing
 * stages to Claude CLI, each falling back to the other on failure.
 */
/** Free public routers, tried in this order when a stage needs a backup. */
export const FREE_POOL = ["kilo", "llm7", "pollinations"];

export function providerChain(provider, stage, { claudeCooling = false } = {}) {
  // Keyless routers (LLM7, Pollinations) have small anonymous quotas: they back up
  // the light stages only; code-writing stages fall back to Kilo alone.
  const heavy = HEAVY_STAGES.test(stage);
  const backups = heavy ? ["kilo"] : FREE_POOL;
  let chain;
  if (provider === "hybrid") chain = heavy ? ["claude-cli", ...backups] : [...FREE_POOL, "claude-cli"];
  else if (provider === "claude-cli" || provider === "anthropic") chain = [provider, ...backups];
  else if (provider === "free") chain = [...backups];
  else chain = [provider];
  // While Claude is at capacity, skip straight to Kilo instead of waiting to fail.
  if (claudeCooling && chain.includes("claude-cli") && chain.length > 1) {
    chain = [...chain.filter((name) => name !== "claude-cli"), "claude-cli"];
  }
  return chain;
}

/** Claude CLI answers that mean "out of capacity" rather than "bad request". */
export const CAPACITY = /usage limit|rate.?limit|at capacity|capacity|overloaded|quota|limit reached|too many requests|\b429\b|\b529\b|try again later/i;

const COOLDOWN_MS = 60 * 60_000;

/** Lab-wide marker shared by every run (and the web lab's status check). */
export function claudeCooldownPath(labDir) {
  return join(labDir, "claude-cooldown.json");
}

export async function claudeCooldown(labDir) {
  try {
    const marker = JSON.parse(await readFile(claudeCooldownPath(labDir), "utf8"));
    return marker.until > Date.now() ? marker : null;
  } catch {
    return null;
  }
}

/** Uses the reset time from the CLI's message when it gives one ("resets 3pm"), else an hour. */
function cooldownUntil(reason) {
  const match = reason.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hour = Number(match[1]) % 12;
    if ((match[3] ?? "").toLowerCase() === "pm") hour += 12;
    if (!match[3] && Number(match[1]) >= 12) hour = Number(match[1]);
    const reset = new Date();
    reset.setHours(hour, Number(match[2] ?? 0), 0, 0);
    if (reset.getTime() <= Date.now()) reset.setDate(reset.getDate() + 1);
    if (reset.getTime() - Date.now() < 24 * 3_600_000) return reset.getTime();
  }
  return Date.now() + COOLDOWN_MS;
}

export function createBrain({ provider, runDir, model = DEFAULT_MODEL, effort = "high" }) {
  const resolved = provider === "auto" || !provider ? autoProvider() : provider;
  if (resolved !== "hybrid" && resolved !== "free" && !BACKENDS[resolved]) {
    throw new Error(`Unknown brain provider "${resolved}". Use anthropic, claude-cli, kilo, llm7, pollinations, free, hybrid or handoff.`);
  }

  return {
    provider: resolved,
    model,
    async ask({ stage, system, prompt, schema }) {
      const jsonSchema = z.toJSONSchema(schema);
      const dir = join(runDir, "brain");
      const promptPath = join(dir, `${stage}.prompt.md`);
      const responsePath = join(dir, `${stage}.response.json`);

      if (await exists(responsePath)) {
        return validate(schema, JSON.parse(await readFile(responsePath, "utf8")), responsePath);
      }

      await writeText(promptPath, renderPromptFile(stage, system, prompt, jsonSchema, responsePath));
      const labDir = join(runDir, "..", "..");
      const cooling = await claudeCooldown(labDir);
      const chain = providerChain(resolved, stage, { claudeCooling: Boolean(cooling) });
      if (cooling && chain[0] !== "claude-cli" && chain.includes("claude-cli")) {
        log.info(`🧠 Claude is at capacity until ${new Date(cooling.until).toLocaleTimeString()}; Kilo takes ${stage}`);
      }
      const failures = [];
      for (const [index, name] of chain.entries()) {
        const started = Date.now();
        try {
          // An answer that misses the schema gets one more try from the same provider.
          let value;
          for (let attempt = 1; ; attempt += 1) {
            const raw = await BACKENDS[name]({ stage, system, prompt, jsonSchema, model, effort, runDir, promptPath, responsePath });
            try {
              value = validate(schema, raw, `${name} response for ${stage}`);
              break;
            } catch (error) {
              if (attempt >= 2 || name === "handoff") throw error;
              log.warn(`${name}'s answer for ${stage} did not match the expected shape; asking again`);
            }
          }
          await writeJson(responsePath, value);
          await writeJson(join(dir, `${stage}.meta.json`), {
            provider: name,
            model: modelLabel(name, model),
            fallbackFrom: failures.length ? failures : undefined,
            seconds: Math.round((Date.now() - started) / 1000),
            promptSha256: sha256(system + prompt),
            answeredAt: new Date().toISOString(),
          });
          if (chain.length > 1) log.info(`🧠 ${stage} answered by ${name} in ${Math.round((Date.now() - started) / 1000)}s`);
          return value;
        } catch (error) {
          if (error instanceof HandoffPending) throw error;
          const reason = String(error.message ?? error).split("\n")[0].slice(0, 240);
          failures.push({ provider: name, reason });
          if (name === "claude-cli" && CAPACITY.test(reason)) {
            const until = cooldownUntil(reason);
            await writeJson(claudeCooldownPath(labDir), { until, reason, since: Date.now() }).catch(() => {});
            log.warn(`Claude is at capacity; Kilo covers every stage until ${new Date(until).toLocaleTimeString()}`);
          }
          const next = chain[index + 1];
          if (next) log.warn(`${name} could not answer ${stage} (${reason}), handing over to ${next}`);
        }
      }
      throw new Error(`No brain could answer "${stage}": ${failures.map((f) => `${f.provider}: ${f.reason}`).join(" | ")}`);
    },
  };
}

function modelLabel(name, model) {
  if (name === "handoff") return null;
  if (name === "kilo") return process.env.REAFUSE_KILO_MODEL ?? "kilo-auto/free";
  if (name === "llm7") return process.env.REAFUSE_LLM7_MODEL ?? "llm7 default";
  if (name === "pollinations") return process.env.REAFUSE_POLLINATIONS_MODEL ?? "pollinations openai";
  if (name === "claude-cli") return process.env.REAFUSE_CLAUDE_MODEL ?? model;
  return model;
}

/**
 * Zero-setup default: an Anthropic key if present; otherwise Kilo's free
 * models, with a local Claude CLI (if installed) taking the code-writing
 * stages. "handoff" is only used when asked for explicitly.
 */
export function autoProvider() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (findClaudeCli()) return "hybrid";
  return "kilo";
}

function validate(schema, value, source) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid brain answer from ${source}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

function renderPromptFile(stage, system, prompt, jsonSchema, responsePath) {
  return `<!-- ReaFuse brain request: ${stage} -->
<!-- Answer with JSON matching the schema below, saved to: ${responsePath} -->

# System

${system}

# Request

${prompt}

# Required JSON schema

\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`
`;
}

async function handoffBackend({ stage, promptPath, responsePath }) {
  throw new HandoffPending(stage, promptPath, responsePath);
}

async function anthropicBackend({ system, prompt, jsonSchema, model, effort }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { jsonSchemaOutputFormat } = await import("@anthropic-ai/sdk/helpers/json-schema");
  const client = new Anthropic();
  const { $schema, ...schema } = jsonSchema;
  const { parse, ...format } = jsonSchemaOutputFormat(schema);

  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort, format },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`The model declined this request (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The model ran out of output tokens before finishing the answer.");
  }
  const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  return parse(text);
}

async function claudeCliBackend({ system, prompt, jsonSchema, model, runDir }) {
  const bin = findClaudeCli();
  if (!bin) throw new Error("Claude CLI not found. Install Claude Code or set REAFUSE_CLAUDE_BIN.");
  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--no-session-persistence",
    "--system-prompt",
    system,
    "--json-schema",
    JSON.stringify(withoutDialect(jsonSchema)),
  ];
  if (process.env.REAFUSE_CLAUDE_MODEL ?? model) args.push("--model", process.env.REAFUSE_CLAUDE_MODEL ?? model);

  const result = await run(bin, args, { cwd: runDir, input: prompt, timeoutMs: 30 * 60_000 });
  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Claude CLI returned no JSON (exit ${result.code}): ${(result.stderr || result.stdout).slice(0, 500)}`);
  }
  if (envelope.is_error) throw new Error(`Claude CLI error: ${envelope.result ?? "unknown error"}`);
  if (envelope.structured_output) return envelope.structured_output;
  return extractJson(envelope.result ?? "");
}

/**
 * Free public routers (OpenAI-compatible). Free routers often reject
 * response_format, so the schema travels inside the prompt and the answer
 * is validated by the caller like every other provider's.
 */
const FREE_ROUTERS = {
  kilo: {
    label: "Kilo Gateway",
    url: "https://api.kilo.ai/api/gateway/chat/completions",
    model: () => process.env.REAFUSE_KILO_MODEL ?? "kilo-auto/free",
    key: () => kiloApiKey(),
  },
  // Keyless, about 30 requests per minute anonymously (llm7.io).
  llm7: {
    label: "LLM7",
    url: "https://api.llm7.io/v1/chat/completions",
    model: () => process.env.REAFUSE_LLM7_MODEL ?? "default",
    key: async () => process.env.LLM7_API_KEY?.trim() || "unused",
  },
  // Keyless with tight anonymous limits (pollinations.ai); used as the last free resort.
  pollinations: {
    label: "Pollinations",
    url: "https://text.pollinations.ai/openai",
    model: () => process.env.REAFUSE_POLLINATIONS_MODEL ?? "openai",
    key: async () => process.env.POLLINATIONS_API_KEY?.trim() || null,
  },
};

function freeRouterBackend(name) {
  return async function ({ stage, system, prompt, jsonSchema }) {
    const router = FREE_ROUTERS[name];
    const model = router.model();
    const heavy = HEAVY_STAGES.test(stage);
    const maxTokens = Number(process.env.REAFUSE_FREE_MAX_TOKENS ?? process.env.REAFUSE_KILO_MAX_TOKENS ?? (heavy ? 32_000 : 16_000));
    const headers = { "content-type": "application/json" };
    const apiKey = await router.key();
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${prompt}

Respond with ONLY one JSON object (no markdown fences, no commentary) that validates against this JSON Schema:
${JSON.stringify(withoutDialect(jsonSchema))}`,
        },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    });

    let lastError = "no attempt";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      // Back off between attempts: free routers shed load with errors and empty answers.
      const backoff = Number(process.env.REAFUSE_KILO_BACKOFF_MS ?? 8_000);
      if (attempt > 1 && backoff > 0) await new Promise((done) => setTimeout(done, (attempt - 1) * backoff));
      let response;
      try {
        response = await fetch(router.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10 * 60_000) });
      } catch (error) {
        lastError = `network: ${error.message}`;
        continue;
      }
      const text = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
        if (response.status === 429 || response.status >= 500 || /upstream|unavailable|overloaded/i.test(text)) continue;
        break;
      }
      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        lastError = "gateway returned invalid JSON";
        continue;
      }
      // Some gateways report upstream failures inside a 200 response.
      if (envelope.error) {
        lastError = `upstream error: ${String(envelope.error.message ?? envelope.error).slice(0, 160)}`;
        continue;
      }
      const content = envelope.choices?.[0]?.message?.content;
      const rendered = Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : content;
      if (!rendered) {
        lastError = `empty answer from ${envelope.model ?? model} (finish ${envelope.choices?.[0]?.finish_reason ?? "unknown"})`;
        continue;
      }
      try {
        return extractJson(rendered);
      } catch (error) {
        // A single-file answer ({ content }) often arrives as the raw file itself.
        const keys = Object.keys(jsonSchema.properties ?? {});
        if (keys.length === 1 && keys[0] === "content" && rendered.trim().length > 20) {
          const fenced = rendered.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/);
          return { content: fenced ? fenced[1] : rendered.trim() + "\n" };
        }
        // Free models occasionally emit malformed JSON; ask again.
        lastError = `malformed JSON from ${envelope.model ?? model}: ${error.message}`;
      }
    }
    throw new Error(`${router.label}: ${lastError}`);
  };
}

async function kiloApiKey() {
  if (process.env.KILO_API_KEY) return process.env.KILO_API_KEY.trim();
  const path = process.env.KILO_API_KEY_FILE;
  if (path && (await exists(path))) return (await readFile(path, "utf8")).trim() || null;
  return null;
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in brain answer.");
  const body = candidate.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (error) {
    // Common model slips: trailing commas, smart quotes around keys.
    const repaired = body.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
    try {
      return JSON.parse(repaired);
    } catch {
      throw error;
    }
  }
}

export function findClaudeCli() {
  if (process.env.REAFUSE_CLAUDE_BIN) return process.env.REAFUSE_CLAUDE_BIN;
  const exe = process.platform === "win32" ? ".exe" : "";
  const pathDirs = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":");
  for (const dir of [...pathDirs, join(homedir(), ".local", "bin"), join(homedir(), ".claude", "local")]) {
    const candidate = join(dir, `claude${exe}`);
    if (dir && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Drops the "$schema" dialect marker, which some validators (e.g. the Claude CLI's) reject. */
function withoutDialect(jsonSchema) {
  const { $schema, ...schema } = jsonSchema;
  return schema;
}
