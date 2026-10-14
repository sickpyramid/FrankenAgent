import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { run } from "./util.mjs";

const require = createRequire(import.meta.url);

export function reaVersion() {
  try {
    return require("rea-agents/package.json").version;
  } catch {
    return null;
  }
}

function reaScript() {
  return join(dirname(require.resolve("rea-agents/package.json")), "scripts", "rea.mjs");
}

/**
 * Runs REA's static JavaScript application analysis. REA parses sources as
 * inert text; donor code is never executed.
 */
export async function analyzeWithRea(targetPath, { timeoutMs = 300_000 } = {}) {
  const args = ["analyze-javascript-application", targetPath, "--json"];
  const result = await run(process.execPath, [reaScript(), ...args], { timeoutMs, maxBytes: 200 * 1024 * 1024 });
  // Recorded without the local path so reports can be shared publicly.
  const command = "rea analyze-javascript-application <donor> --json";
  if (result.timedOut) return { ok: false, command, error: `REA timed out after ${timeoutMs}ms` };
  if (result.code !== 0) {
    // REA can exit non-zero while still emitting a usable evidence graph
    // (one unanalysable file is reported as a limitation). Keep it if so.
    try {
      const evidence = JSON.parse(result.stdout);
      if (evidence?.normalized_result?.graph) return { ok: true, command, evidence, partial: true };
    } catch {
      // fall through to the error below
    }
    return { ok: false, command, error: `REA exited with code ${result.code}: ${lastLines(result.stderr) || result.stdout.trim().slice(-300)}` };
  }
  try {
    return { ok: true, command, evidence: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, command, error: `REA returned invalid JSON: ${error.message}` };
  }
}

/**
 * Condenses REA's evidence graph into what the spec writer needs: modules,
 * their exports, and their imports. Full evidence is kept on disk.
 */
export function summarizeReaEvidence(evidence) {
  const normalized = evidence?.normalized_result;
  const graph = normalized?.graph;
  if (!graph) return null;

  const pathById = new Map();
  const modules = new Map();
  for (const node of graph.nodes ?? []) {
    const props = node.observations?.[0]?.properties ?? {};
    if (props.semantic_role !== "source-module" || !props.path) continue;
    pathById.set(node.node_id, props.path);
    modules.set(props.path, {
      path: props.path,
      format: props.module_format ?? null,
      exports: props.export_names ?? [],
      internalImports: new Set(),
      externalImports: new Set(),
    });
  }

  for (const edge of graph.edges ?? []) {
    if (edge.relation !== "imports") continue;
    const from = modules.get(pathById.get(edge.source_node_id));
    if (!from) continue;
    const specifier = edge.properties?.specifier;
    if (!specifier) continue;
    const resolved = edge.properties?.resolved_path;
    if (resolved) from.internalImports.add(resolved);
    else from.externalImports.add(specifier);
  }

  return {
    evidenceId: evidence.evidence_id,
    analyzer: evidence.provider?.name ?? "REA",
    statistics: normalized.statistics ?? null,
    modules: [...modules.values()].slice(0, 150).map((module) => ({
      ...module,
      internalImports: [...module.internalImports],
      externalImports: [...module.externalImports],
    })),
    limitations: normalized.limitations ?? evidence.limitations ?? [],
  };
}

function lastLines(text, count = 6) {
  return text.trim().split(/\r?\n/).filter((line) => !line.includes('"rea_progress"')).slice(-count).join("\n");
}
