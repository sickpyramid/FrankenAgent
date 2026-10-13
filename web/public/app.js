// ReaFuse lab UI — vanilla JS, no build step.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function zap() {
  const flash = $("#flash");
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");
}

// ── status bar ─────────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const status = await api("status");
    const brain = status.brain;
    $("#st-brain").innerHTML = `<i class="led ${brain.ready ? "on" : "off"}"></i>brain: ${esc(brain.ready ? brain.provider : "offline")}`;
    $("#st-brain").title = brain.detail;
    $("#st-rea").innerHTML = `<i class="led on"></i>REA ${esc(status.rea ?? "?")}`;
    $("#st-queue").innerHTML = `<i class="led ${status.running ? "warn" : "on"}"></i>${status.running ? "operating" : "idle"} · queue ${status.queue}`;
  } catch {
    $("#st-brain").innerHTML = `<i class="led off"></i>lab unreachable`;
  }
}

// ── donor kind hints (mirrors the server classifier) ────────────────────────
function kindOf(text) {
  const value = text.trim();
  if (!value) return ["awaiting specimen", false];
  if (/^(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)\/[\w.-]+\/[\w.-]+/i.test(value)) return ["◆ git repository", true];
  if (/^https?:\/\//i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(value)) return ["◇ website → twin search", true];
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return ["◆ github owner/repo", true];
  return ["◎ app name → twin search", true];
}

function wireSlab(inputId, kindId) {
  const input = $(`#${inputId}`);
  const kind = $(`#${kindId}`);
  const update = () => {
    const [label, ok] = kindOf(input.value);
    kind.textContent = label;
    kind.classList.toggle("ok", ok);
  };
  input.addEventListener("input", update);
  $$(`.chips[data-for="${inputId}"] button`).forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.textContent;
      update();
      input.focus();
    }),
  );
}

// ── home ───────────────────────────────────────────────────────────────────
async function loadGallery() {
  try {
    const { items } = await api("gallery");
    const gallery = $("#gallery");
    if (!items.length) {
      gallery.innerHTML = `<p class="dim">no specimens yet: be the first to pull the lever.</p>`;
      return;
    }
    gallery.innerHTML = items
      .map(
        (item) => `<a class="specimen" href="/run/${encodeURIComponent(item.id)}" data-link>
          <span class="badge ${esc(item.verdict)}">${esc(item.verdict)}</span>
          <h3>${esc(item.name)}</h3>
          <p>${esc(item.tagline)}</p>
          <div class="lineage">${esc(item.donors.A)} × ${esc(item.donors.B)}</div>
          <div class="meta">${item.contract ? `<span class="badge">contract ${esc(item.contract)}</span>` : ""}${item.overlap !== null ? `<span class="badge">overlap ${(item.overlap * 100).toFixed(1)}%</span>` : ""}${item.showcase ? `<span class="badge">showcase</span>` : ""}</div>
        </a>`,
      )
      .join("");
  } catch (error) {
    $("#gallery").innerHTML = `<p class="dim">gallery offline: ${esc(error.message)}</p>`;
  }
}

$("#fuse-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#fuse-btn");
  const message = $("#form-msg");
  message.textContent = "";
  button.disabled = true;
  try {
    const { id } = await api("fuse", { method: "POST", body: JSON.stringify({ a: $("#donor-a").value, b: $("#donor-b").value }) });
    zap();
    navigate(`/run/${encodeURIComponent(id)}`);
  } catch (error) {
    message.textContent = `✗ ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

// ── run view ───────────────────────────────────────────────────────────────
const STAGES = ["intake", "dissect-a", "dissect-b", "fuse", "pick", "contract", "grow", "verify", "originality", "verdict"];
const MARKERS = [
  [/Intake: acquiring donors/, "intake"],
  [/Dissecting donor A/, "dissect-a"],
  [/Dissecting donor B/, "dissect-b"],
  [/Fusing: proposing creatures/, "fuse"],
  [/Awaiting your pick|Three creatures proposed/, "pick"],
  [/Subject chosen|Writing the acceptance contract/, "contract"],
  [/Growing /, "grow"],
  [/Verifying|Re-verifying/, "verify"],
  [/Originality scan/, "originality"],
  [/═{10,}/, "verdict"],
];

let current = null; // { id, source, timer, stage, started }

function setStage(stage, { failed = false } = {}) {
  const index = STAGES.indexOf(stage);
  if (index === -1) return;
  if (current && STAGES.indexOf(current.stage) > index && !failed) return;
  if (current) current.stage = stage;
  $$("#rail li").forEach((li, i) => {
    li.classList.toggle("done", i < index || (stage === "verdict" && i === index && !failed));
    li.classList.toggle("now", i === index && stage !== "verdict" && !failed);
    li.classList.toggle("fail", i === index && failed);
  });
}

function appendLog(text) {
  const log = $("#log");
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  $(".cursor", log)?.remove();
  log.insertAdjacentText("beforeend", text);
  log.insertAdjacentHTML("beforeend", `<span class="cursor"></span>`);
  if (nearBottom) log.scrollTop = log.scrollHeight;
  for (const [pattern, stage] of MARKERS) if (pattern.test(text)) setStage(stage);
  if (/^reafuse: /m.test(text)) setStage(current?.stage ?? "intake", { failed: true });
}

function renderDonors(view) {
  const cards = ["A", "B"].map((label) => {
    const donor = view.donors?.[label];
    const spec = view.specs?.[label];
    const input = view.inputs?.[label] ?? "?";
    return `<div class="donor-card">
      <h4>SUBJECT_${label}</h4>
      <div class="name">${esc(donor?.name ?? input)}</div>
      ${donor?.resolution ? `<div class="twin">twin of “${esc(donor.resolution.from)}”: ${esc(donor.resolution.why)}</div>` : ""}
      ${donor ? `<div class="dim">${esc(donor.license ?? "license ?")} · ${esc(donor.commit?.slice(0, 10) ?? "")}</div>` : `<div class="dim">awaiting intake…</div>`}
      ${spec ? `<div>${esc(spec.oneLiner)}</div><ul>${spec.capabilities.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul>` : ""}
    </div>`;
  });
  $("#donor-cards").innerHTML = cards.join("");
}

function renderPick(view) {
  const show = view.phase === "awaiting-pick" && view.proposals && !view.showcase;
  $("#pick").hidden = !show;
  if (!show) return;
  $("#concepts").innerHTML = view.proposals
    .map(
      (p, i) => `<button type="button" class="concept" data-pick="${i + 1}">
        <span class="num">#${i + 1}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="dim">${esc(p.concept)}</p>
        <p class="new">⚡ ${esc(p.newCapability)}</p>
        <div>${p.api.map((fn) => `<code>${esc(fn.name)}()</code>`).join(" ")}</div>
      </button>`,
    )
    .join("");
  $$("#concepts .concept").forEach((button) =>
    button.addEventListener("click", async () => {
      $$("#concepts .concept").forEach((b) => (b.disabled = true));
      try {
        await api(`runs/${encodeURIComponent(current.id)}/pick`, { method: "POST", body: JSON.stringify({ pick: Number(button.dataset.pick) }) });
        zap();
        $("#pick").hidden = true;
        setStage("contract");
      } catch (error) {
        appendLog(`\n✗ ${error.message}\n`);
        $$("#concepts .concept").forEach((b) => (b.disabled = false));
      }
    }),
  );
}

function renderVerdict(view) {
  const report = view.report;
  $("#verdict").hidden = !report;
  if (!report) return;
  const status = report.verdict.status;
  const words = { ALIVE: "IT'S ALIVE!!!", UNSTABLE: "UNSTABLE…", DEAD: "IT DIDN'T WAKE UP", REJECTED: "ORGAN REJECTED" };
  $("#banner").className = `banner ${status}`;
  $("#banner").innerHTML = `${esc(words[status] ?? status)}<small>${esc(report.creature ? `${report.creature.name}: ${report.creature.tagline}` : report.verdict.reason ?? "")}</small>`;
  const v = report.verification;
  const stats = [
    v && [`${v.contract.passed}/${v.contract.total}`, "lab contract"],
    v && [`${v.own.passed}/${v.own.total}`, "creature's own tests"],
    report.originality && [`${(report.originality.overlap * 100).toFixed(1)}%`, "code overlap with donors"],
    report.originality && [report.originality.longestCopiedTokens, "longest shared token run"],
    [report.rea ? `REA ${report.rea}` : "REA", "dissection engine"],
  ].filter(Boolean);
  $("#stats").innerHTML = stats.map(([value, label]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("");
  $("#report").innerHTML = markdown(view.reportMarkdown ?? "");
  $("#file-list").innerHTML = view.files.map((file) => `<li><button type="button" data-file="${esc(file)}">${esc(file)}</button></li>`).join("");
  $$("#file-list button").forEach((button) =>
    button.addEventListener("click", async () => {
      $$("#file-list button").forEach((b) => b.classList.toggle("on", b === button));
      const { content } = await api(`runs/${encodeURIComponent(current.id)}/file?path=${encodeURIComponent(button.dataset.file)}`);
      $("#file-view").textContent = content;
    }),
  );
  setStage("verdict", { failed: status === "DEAD" || status === "REJECTED" });
}

async function refreshRun() {
  if (!current) return;
  const view = await api(`runs/${encodeURIComponent(current.id)}`);
  const title = (label) => {
    const input = view.inputs?.[label] ?? label;
    return /^https?:\/\//.test(input) && view.donors?.[label]?.name ? view.donors[label].name : input;
  };
  $("#run-a").textContent = title("A");
  $("#run-b").textContent = title("B");
  renderDonors(view);
  renderPick(view);
  const hadVerdict = !$("#verdict").hidden;
  renderVerdict(view);
  if (view.report && !hadVerdict && !current.replayed) zap();
  if (view.phase === "awaiting-pick") setStage("pick");
  return view;
}

async function openRun(id) {
  closeRun();
  current = { id, stage: "intake", started: Date.now(), replayed: false };
  $("#home").hidden = true;
  $("#run").hidden = false;
  $("#log").textContent = "";
  $("#run-id").textContent = id;
  $("#verdict").hidden = true;
  $("#pick").hidden = true;
  $$("#rail li").forEach((li) => (li.className = ""));
  window.scrollTo(0, 0);

  const view = await refreshRun().catch((error) => {
    appendLog(`✗ ${error.message}\n`);
    return null;
  });
  if (!view) return;
  if (view.showcase) {
    current.replayed = true;
    appendLog(`# showcase specimen: grown earlier and verified.\n# the lab report and creature files are below.\n`);
    setStage("verdict");
    return;
  }
  if (view.report) current.replayed = true;

  const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/stream`);
  current.source = source;
  source.addEventListener("log", (event) => appendLog(JSON.parse(event.data).text));
  source.addEventListener("phase", (event) => {
    const data = JSON.parse(event.data);
    if (data.queuePosition > 0) appendLog(`… waiting in queue (position ${data.queuePosition})\n`);
    refreshRun().catch(() => {});
  });
  current.timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - current.started) / 1000);
    $("#elapsed").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, 1000);
  current.poll = setInterval(() => refreshRun().catch(() => {}), 8000);
}

function closeRun() {
  if (!current) return;
  current.source?.close();
  clearInterval(current.timer);
  clearInterval(current.poll);
  current = null;
}

// ── tiny markdown renderer (headings, tables, lists, code, quotes, links) ──
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function markdown(source) {
  const lines = source.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code = [];
      for (i += 1; i < lines.length && !lines[i].startsWith("```"); i += 1) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`);
    } else if (line.startsWith("|")) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith("|"); i += 1) rows.push(lines[i]);
      i -= 1;
      const cells = (row) => row.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
      const body = rows.filter((row) => !/^\|[\s|:-]+\|$/.test(row));
      out.push(`<table>${body.map((row, r) => `<tr>${cells(row).map((c) => (r === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("")}</table>`);
    } else if (/^- /.test(line)) {
      const items = [];
      for (; i < lines.length && /^- /.test(lines[i]); i += 1) items.push(`<li>${inline(lines[i].slice(2))}</li>`);
      i -= 1;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (line.startsWith("> ")) {
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (line.trim()) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  return out.join("\n");
}

// ── tabs + router ──────────────────────────────────────────────────────────
$$(".tabs button").forEach((button) =>
  button.addEventListener("click", () => {
    $$(".tabs button").forEach((b) => b.classList.toggle("on", b === button));
    $("#tab-report").hidden = button.dataset.tab !== "report";
    $("#tab-files").hidden = button.dataset.tab !== "files";
  }),
);

function navigate(path) {
  history.pushState({}, "", path);
  route();
}

function route() {
  const match = location.pathname.match(/^\/run\/(.+)$/);
  if (match) {
    openRun(decodeURIComponent(match[1]));
  } else {
    closeRun();
    $("#run").hidden = true;
    $("#home").hidden = false;
    loadGallery();
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link], a.back, a.brand");
  if (link && link.origin === location.origin) {
    event.preventDefault();
    navigate(link.pathname);
  }
});
window.addEventListener("popstate", route);

wireSlab("donor-a", "kind-a");
wireSlab("donor-b", "kind-b");
refreshStatus();
setInterval(refreshStatus, 30_000);
route();
