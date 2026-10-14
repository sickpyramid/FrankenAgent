// Finds open-source builds of a product ("Spotify") fast: one GitHub search,
// then a deterministic ranking. No model calls; the brain is only a fallback.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SEARCH_URL = "https://api.github.com/search/repositories";
const PERMISSIVE = /^(MIT|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|Unlicense|CC0-1\.0|Zlib|MIT-0)$/i;
const JS_LIKE = /^(TypeScript|JavaScript|Vue|Svelte|Astro)$/i;
// Words that suggest a project recreates the product vs. one that merely talks to it.
const APP_LIKE = /\b(clone|alternative|replica|redesign|recreat\w*|inspired|ui|client|player|app|messenger|chat|feed|social)\b/;
const UTILITY = /\b(dl|download\w*|api|sdk|wrapper|bot|scraper|cli|plugin|extension|theme|spicetify|stats|lyrics|exporter|converter)\b|-dl\b/;
const STOP = new Set(["the", "app", "web", "inc", "www", "com", "io", "org", "net", "co"]);

/** "instagram.com" → "instagram", "Google Maps" → "google maps". */
export function productTerm(input) {
  let text = String(input).trim();
  if (/^https?:\/\//i.test(text)) text = new URL(text).hostname;
  text = text.replace(/^www\./i, "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(text)) text = text.split("/")[0].split(".").slice(0, -1).join(" ");
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(term) {
  return term.split(" ").filter((word) => word.length > 1 && !STOP.has(word));
}

async function search(query, token) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&per_page=50`;
  const headers = { accept: "application/vnd.github+json", "user-agent": "reafuse" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub search ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return (await response.json()).items ?? [];
}

const round = (value) => Math.round(value * 1000) / 1000;

/** Scores one repository against the product. Each part is 0..1. */
export function scoreCandidate(repo, term, now = Date.now()) {
  const words = tokens(term);
  const joined = words.join("");
  const name = repo.name.toLowerCase();
  const description = (repo.description ?? "").toLowerCase();
  const topics = (repo.topics ?? []).map((topic) => topic.toLowerCase());
  const text = `${name.replace(/[-_]/g, " ")} ${description} ${topics.join(" ")}`;

  // Similarity: does it reproduce the product's experience, not just touch it?
  let similarity = 0;
  if (words.length && (name.includes(joined) || words.every((word) => name.includes(word)))) similarity += 0.35;
  if (words.length && words.every((word) => description.includes(word))) similarity += 0.15;
  if (topics.some((topic) => words.includes(topic) || topic === joined)) similarity += 0.1;
  if (APP_LIKE.test(text)) similarity += 0.4;
  if (UTILITY.test(text)) similarity -= 0.35;
  similarity = Math.max(0, Math.min(1, similarity));

  // Relevance: an established, maintained project beats an abandoned toy.
  const stars = Math.min(1, Math.log10((repo.stargazers_count ?? 0) + 1) / 5);
  const ageDays = (now - Date.parse(repo.pushed_at ?? 0)) / 86_400_000;
  const fresh = ageDays < 365 ? 1 : ageDays < 3 * 365 ? 0.5 : 0.1;
  const relevance = 0.8 * stars + 0.2 * fresh;

  // REA compatibility: JS/TS, a size REA can dissect quickly, a clean license.
  const language = repo.language ?? "";
  const sizeMb = (repo.size ?? 0) / 1024;
  const spdx = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : null;
  let compatibility = JS_LIKE.test(language) ? 0.6 : 0;
  compatibility += sizeMb < 30 ? 0.25 : sizeMb < 150 ? 0.12 : 0;
  compatibility += spdx && PERMISSIVE.test(spdx) ? 0.15 : 0;
  if (repo.archived) compatibility -= 0.1;
  compatibility = Math.max(0, Math.min(1, compatibility));

  return {
    repo: repo.full_name,
    repoUrl: `https://github.com/${repo.full_name}.git`,
    description: repo.description ?? "",
    language: language || null,
    license: spdx,
    stars: repo.stargazers_count ?? 0,
    sizeMb: Math.round(sizeMb * 10) / 10,
    scores: { similarity: round(similarity), relevance: round(relevance), compatibility: round(compatibility) },
    score: round(0.5 * similarity + 0.2 * relevance + 0.3 * compatibility),
  };
}

/**
 * Searches GitHub for open-source builds of a product and returns them
 * ranked best first. Only JavaScript/TypeScript projects are kept, since
 * that is what REA dissects in v1. One query per product keeps anonymous use
 * inside GitHub's 10 searches/minute; results are cached for a week.
 */
export async function findTwins(input, { token = process.env.GITHUB_TOKEN, limit = 6, cacheDir = null } = {}) {
  const term = productTerm(input);
  if (!term) return [];
  const cachePath = cacheDir ? join(cacheDir, `${term.replace(/ /g, "-")}.json`) : null;
  let items = null;
  if (cachePath) {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8"));
      if (Date.now() - cached.fetchedAt < 7 * 86_400_000) items = cached.items;
    } catch {
      // no cache yet
    }
  }
  if (!items) {
    items = await search(`${term} in:name,description,topics`, token);
    if (cachePath) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), items }));
    }
  }
  const unique = new Map();
  for (const repo of items) if (!repo.fork && !unique.has(repo.full_name)) unique.set(repo.full_name, repo);
  return [...unique.values()]
    .filter((repo) => JS_LIKE.test(repo.language ?? ""))
    .map((repo) => scoreCandidate(repo, term))
    .filter((candidate) => candidate.scores.similarity > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
