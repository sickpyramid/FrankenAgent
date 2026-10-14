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
  kilo: kiloBackend,
  handoff: handoffBackend,
};

/** Stages that write the creature's code: the ones worth the strongest brain. */
export const HEAVY_STAGES = /^(contract|grow|repair)-/;

/**
 * Which providers try a stage, in order. "hybrid" sends routine stages
 * (twin lookup, spec cards, concepts) to Kilo Gateway and the code-writing
 * stages to Claude CLI, each falling back to the other on failure.
 */
export function providerChain(provider, stage) {
  if (provider !== "hybrid") return [provider];
  return HEAVY_STAGES.test(stage) ? ["claude-cli", "kilo"] : ["kilo", "claude-cli"];
}

export function createBrain({ provider, runDir, model = DEFAULT_MODEL, effort = "high" }) {
  const resolved = provider === "auto" || !provider ? autoProvider() : provider;
  if (resolved !== "hybrid" && !BACKENDS[resolved]) {
    throw new Error(`Unknown brain provider "${resolved}". Use anthropic, claude-cli, kilo, hybrid or handoff.`);
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
      const chain = providerChain(resolved, stage);
      const failures = [];
      for (const [index, name] of chain.entries()) {
        const started = Date.now();
        try {
          const raw = await BACKENDS[name]({ stage, system, prompt, jsonSchema, model, effort, runDir, promptPath, responsePath });
          const value = validate(schema, raw, `${name} response for ${stage}`);
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
  if (name === "claude-cli") return process.env.REAFUSE_CLAUDE_MODEL ?? model;
  return model;
}

export function autoProvider() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (findClaudeCli()) return "claude-cli";
  return "handoff";
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

const KILO_URL = "https://api.kilo.ai/api/gateway/chat/completions";

/**
 * Kilo Gateway (OpenAI-compatible). Its free router rejects
 * response_format, so the schema travels inside the prompt and the answer
 * is validated by the caller like every other provider's.
 */
async function kiloBackend({ stage, system, prompt, jsonSchema }) {
  const model = process.env.REAFUSE_KILO_MODEL ?? "kilo-auto/free";
  const heavy = HEAVY_STAGES.test(stage);
  const maxTokens = Number(process.env.REAFUSE_KILO_MAX_TOKENS ?? (heavy ? 32_000 : 16_000));
  const headers = { "content-type": "application/json" };
  const apiKey = await kiloApiKey();
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
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(KILO_URL, { method: "POST", headers, body, signal: AbortSignal.timeout(10 * 60_000) });
    } catch (error) {
      lastError = `network: ${error.message}`;
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
      if (response.status === 429 || response.status >= 500 || /upstream/i.test(text)) continue;
      break;
    }
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      lastError = "gateway returned invalid JSON";
      continue;
    }
    const content = envelope.choices?.[0]?.message?.content;
    const rendered = Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : content;
    if (!rendered) {
      lastError = `empty answer from ${envelope.model ?? model} (finish ${envelope.choices?.[0]?.finish_reason ?? "unknown"})`;
      continue;
    }
    return extractJson(rendered);
  }
  throw new Error(`Kilo Gateway: ${lastError}`);
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
  return JSON.parse(candidate.slice(start, end + 1));
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
