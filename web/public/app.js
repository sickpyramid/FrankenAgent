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

/** Sends a pulse of current through the fuse on the home board. */
function surge(ms = 1400) {
  const board = $("#fuse-form");
  board.classList.add("surge");
  setTimeout(() => board.classList.remove("surge"), ms);
}

// ── status plates ──────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const status = await api("status");
    const brain = status.brain;
    $("#st-brain").innerHTML = `<i class="dot ${brain.ready ? "ok" : "bad"}"></i>BRAIN ${brain.ready ? "READY" : "OFFLINE"}`;
    $("#st-brain").title = brain.detail;
    $("#st-rea").textContent = `REA ${status.rea ?? "?"}`;
    $("#st-queue").innerHTML = `<i class="dot ${status.running ? "busy" : "ok"}"></i>${status.running ? "FUSING" : "IDLE"} · Q${status.queue}`;
  } catch {
    $("#st-brain").innerHTML = `<i class="dot bad"></i>LAB UNREACHABLE`;
  }
}

// ── terminals ──────────────────────────────────────────────────────────────
function kindOf(text) {
  const value = text.trim();
  if (!value) return "EMPTY";
  if (/^(?:https?:\/\/)?(?:www\.)?(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)\/[\w.-]+\/[\w.-]+/i.test(value)) return "REPO";
  if (/^https?:\/\//i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(value)) return "SITE → TWIN";
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return "REPO";
  return "NAME → TWIN";
}

function wireTerminal(inputId, kindId, side) {
  const input = $(`#${inputId}`);
  const kind = $(`#${kindId}`);
  const update = () => {
    const label = kindOf(input.value);
    kind.textContent = label;
    kind.classList.toggle("set", label !== "EMPTY");
    $("#fuse-form").classList.toggle(`has-${side}`, label !== "EMPTY");
  };
  input.addEventListener("input", update);
  $$(`.chips[data-for="${inputId}"] button`).forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.textContent;
      update();
      input.focus();
    }),
  );
  update();
}

// ── home ───────────────────────────────────────────────────────────────────
async function loadGallery() {
  const gallery = $("#gallery");
  try {
    const { items } = await api("gallery");
    if (!items.length) {
      gallery.innerHTML = `<p class="mute">No parts yet. Be the first to throw the switch.</p>`;
      return;
    }
    gallery.innerHTML = items
      .map((item, index) => {
        const part = `RF-${String(items.length - index).padStart(4, "0")}`;
        return `<a class="part" href="/run/${encodeURIComponent(item.id)}" data-link>
          <div class="part-head"><span>${part}</span><span>${item.showcase ? "SHOWCASE" : esc(new Date(item.createdAt).toISOString().slice(0, 10))}</span></div>
          <span class="mini-stamp ${esc(item.verdict)}">${esc(item.verdict)}</span>
          <div class="part-body">
            <h3>${esc(item.name)}</h3>
            <p>${esc(item.tagline)}</p>
          </div>
          <div class="lineage"><span class="la">A · ${esc(item.donors.A)}</span><span class="lb">B · ${esc(item.donors.B)}</span></div>
          <div class="part-foot">${item.contract ? `<span>CONTRACT ${esc(item.contract)}</span>` : ""}${item.overlap !== null ? `<span>OVERLAP ${(item.overlap * 100).toFixed(1)}%</span>` : ""}</div>
        </a>`;
      })
      .join("");
  } catch (error) {
    gallery.innerHTML = `<p class="mute">Catalog offline: ${esc(error.message)}</p>`;
  }
}

$("#fuse-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#fuse-btn");
  const message = $("#form-msg");
  message.textContent = "";
  button.disabled = true;
  surge(2400);
  try {
    const { id } = await api("fuse", { method: "POST", body: JSON.stringify({ a: $("#donor-a").value, b: $("#donor-b").value }) });
    setTimeout(() => navigate(`/run/${encodeURIComponent(id)}`), 650);
  } catch (error) {
    message.textContent = `✕ ${error.message}`;
  } finally {
    setTimeout(() => (button.disabled = false), 700);
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

let current = null;

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
  $("#donor-cards").innerHTML = ["A", "B"]
    .map((label) => {
      const donor = view.donors?.[label];
      const spec = view.specs?.[label];
      const input = view.inputs?.[label] ?? "?";
      return `<div class="sheet ${label.toLowerCase()}">
        <div class="sheet-head"><span>DATASHEET · TERMINAL ${label}</span><span>${donor ? "LOADED" : "PENDING"}</span></div>
        <div class="sheet-body">
          <div class="sheet-name">${esc(donor?.name ?? input)}</div>
          ${donor?.resolution ? `<div class="twin">Twin of “${esc(donor.resolution.from)}”: ${esc(donor.resolution.why)}</div>` : ""}
          ${donor ? `<dl><dt>license</dt><dd>${esc(donor.license ?? "unknown")}</dd><dt>commit</dt><dd>${esc(donor.commit?.slice(0, 10) ?? "local")}</dd></dl>` : `<p class="mute">Awaiting intake…</p>`}
          ${spec ? `<p>${esc(spec.oneLiner)}</p><ul>${spec.capabilities.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

function renderPick(view) {
  const show = view.phase === "awaiting-pick" && view.proposals && !view.showcase;
  $("#pick").hidden = !show;
  if (!show) return;
  $("#concepts").innerHTML = view.proposals
    .map(
      (p, i) => `<button type="button" class="concept" data-pick="${i + 1}">
        <span class="num">0${i + 1}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="desc">${esc(p.concept)}</p>
        <p class="new"><b>Only possible fused:</b> ${esc(p.newCapability)}</p>
        <div class="api">${p.api.map((fn) => `<code>${esc(fn.name)}()</code>`).join("")}</div>
      </button>`,
    )
    .join("");
  $$("#concepts .concept").forEach((button) =>
    button.addEventListener("click", async () => {
      $$("#concepts .concept").forEach((b) => (b.disabled = true));
      try {
        await api(`runs/${encodeURIComponent(current.id)}/pick`, { method: "POST", body: JSON.stringify({ pick: Number(button.dataset.pick) }) });
        $("#pick").hidden = true;
        setStage("contract");
      } catch (error) {
        appendLog(`\n✕ ${error.message}\n`);
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
  const words = { ALIVE: "Alive", UNSTABLE: "Unstable", DEAD: "Blown", REJECTED: "Rejected" };
  $("#banner").className = `stamp ${status}`;
  $("#banner").textContent = words[status] ?? status;
  $("#verdict-info").innerHTML = report.creature
    ? `<h3>${esc(report.creature.name)}</h3><p>${esc(report.creature.tagline)}</p>${report.verdict.reason ? `<p><b>${esc(report.verdict.reason)}</b></p>` : ""}<div class="cert">CERTIFICATE ${esc(report.certificate)}</div>`
    : `<h3>No creature</h3><p>${esc(report.verdict.reason ?? "")}</p><div class="cert">CERTIFICATE ${esc(report.certificate)}</div>`;
  const v = report.verification;
  const stats = [
    v && [`${v.contract.passed}/${v.contract.total}`, "Lab contract"],
    v && [`${v.own.passed}/${v.own.total}`, "Own tests"],
    report.originality && [`${(report.originality.overlap * 100).toFixed(1)}%`, "Code overlap"],
    report.originality && [report.originality.longestCopiedTokens, "Longest shared run"],
    [report.rea ?? "—", "REA version"],
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
  if (!current) return null;
  const view = await api(`runs/${encodeURIComponent(current.id)}`);
  const title = (label) => {
    const input = view.inputs?.[label] ?? label;
    return /^https?:\/\//.test(input) && view.donors?.[label]?.name ? view.donors[label].name : input;
  };
  $("#run-a").textContent = title("A");
  $("#run-b").textContent = title("B");
  renderDonors(view);
  renderPick(view);
  renderVerdict(view);
  if (view.phase === "awaiting-pick") setStage("pick");
  return view;
}

async function openRun(id) {
  closeRun();
  current = { id, stage: "intake", started: Date.now() };
  $("#home").hidden = true;
  $("#run").hidden = false;
  $("#log").textContent = "";
  $("#run-id").textContent = id;
  $("#verdict").hidden = true;
  $("#pick").hidden = true;
  $$("#rail li").forEach((li) => (li.className = ""));
  window.scrollTo(0, 0);

  const view = await refreshRun().catch((error) => {
    appendLog(`✕ ${error.message}\n`);
    return null;
  });
  if (!view) return;
  $("#log").style.height = view.showcase ? "auto" : "";
  if (view.showcase) {
    appendLog(`# Showcase part: fused, grown and verified earlier.\n# The lab report and the creature's files are below.\n`);
    setStage("verdict");
    return;
  }

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

// ── tiny markdown renderer ─────────────────────────────────────────────────
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
  const link = event.target.closest("a[data-link], a.back, a.mark");
  if (link && link.origin === location.origin) {
    event.preventDefault();
    navigate(link.pathname);
  }
});
window.addEventListener("popstate", route);

wireTerminal("donor-a", "kind-a", "a");
wireTerminal("donor-b", "kind-b", "b");
refreshStatus();
setInterval(refreshStatus, 30_000);
route();
