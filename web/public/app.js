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
    $("#st-brain").innerHTML = `<i class="dot ${brain.ready ? "ok" : "bad"}"></i>BRAIN ${brain.ready ? (brain.provider === "hybrid" ? "HYBRID" : "READY") : "OFFLINE"}`;
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
// Each stage: key, title, typical seconds (for progress and ETA), and a
// function that describes what is happening using the run's data.
const STAGES = [
  { key: "intake", code: "01 LOCATE", title: "Locate the apps", est: 15 },
  { key: "dissect-a", code: "02 DISSECT", title: "Dissect A with REA", est: 150 },
  { key: "dissect-b", code: "03 DISSECT", title: "Dissect B with REA", est: 140 },
  { key: "fuse", code: "04 FUSE", title: "Invent three creatures", est: 140 },
  { key: "pick", code: "05 PICK", title: "Your pick", est: 0 },
  { key: "contract", code: "06 CONTRACT", title: "Write the tests first", est: 180 },
  { key: "grow", code: "07 GROW", title: "Grow the code", est: 300 },
  { key: "verify", code: "08 VERIFY", title: "Test in the sandbox", est: 45 },
  { key: "originality", code: "09 SCAN", title: "Originality scan", est: 10 },
  { key: "preview", code: "10 PREVIEW", title: "Build the live preview", est: 120 },
  { key: "verdict", code: "11 VERDICT", title: "Verdict", est: 0 },
];
const ORDER = STAGES.map((stage) => stage.key);
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
  [/Building the live preview/, "preview"],
  [/═{10,}/, "verdict"],
];
const NOW_TEXT = {
  intake: "Locating the apps on GitHub…",
  "dissect-a": "REA is dissecting donor A…",
  "dissect-b": "REA is dissecting donor B…",
  fuse: "Inventing three creatures…",
  pick: "Waiting for your pick",
  contract: "Writing the tests before the code exists…",
  grow: "Growing the creature from scratch…",
  verify: "Running the tests in the sandbox…",
  originality: "Scanning for copied code…",
  preview: "Building a page you can try…",
  verdict: "Done",
};

let current = null;

function toast(message) {
  $(".toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="toast" role="status">${esc(message)}</div>`);
  setTimeout(() => $(".toast")?.remove(), 2600);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function setStage(stage, { failed = false } = {}) {
  if (!current || !ORDER.includes(stage)) return;
  const index = ORDER.indexOf(stage);
  if (ORDER.indexOf(current.stage) > index && !failed) return;
  if (current.stage !== stage) current.stageStarted = Date.now();
  current.stage = stage;
  current.failed = failed;
  renderStages();
}

function appendLog(text) {
  const log = $("#log");
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  $(".cursor", log)?.remove();
  log.insertAdjacentText("beforeend", text);
  log.insertAdjacentHTML("beforeend", `<span class="cursor"></span>`);
  if (nearBottom) log.scrollTop = log.scrollHeight;
  if (!current) return;
  for (const [pattern, stage] of MARKERS) if (pattern.test(text)) setStage(stage);
  const verify = text.match(/contract (\d+)\/(\d+), own tests (\d+)\/(\d+)/g);
  if (verify) current.verifyText = verify.at(-1).replace(/^contract/, "Contract");
  const overlap = text.match(/overlap ([\d.]+)%/);
  if (overlap) current.overlapText = `${overlap[1]}% overlap with the donors`;
  const errorLine = text.match(/^reafuse: (.*)$/m);
  if (errorLine) {
    current.error = errorLine[1];
    setStage(current.stage, { failed: true });
  }
}

/** What each stage card says, from the run's data. */
function stageDetail(key, view) {
  const donor = (label) => view.donors?.[label];
  const via = (label) => (donor(label)?.resolution ? ` · studied via ${donor(label).resolution.repo}` : "");
  const caps = (label) => view.specs?.[label]?.capabilities?.map((c) => c.name) ?? [];
  switch (key) {
    case "intake":
      return view.donors ? ["A", "B"].map((l) => `${esc(donor(l).name)}${esc(via(l))}`).join("<br>") : "";
    case "dissect-a":
    case "dissect-b": {
      const label = key.endsWith("a") ? "A" : "B";
      const modules = view.reaModules?.[label];
      const parts = [];
      if (modules !== undefined && modules !== null) parts.push(`${modules} modules mapped by REA`);
      if (view.specs?.[label]) parts.push(esc(view.specs[label].oneLiner));
      const chips = caps(label).slice(0, 6).map((c) => `<span>${esc(c)}</span>`).join("");
      return parts.join("<br>") + (chips ? `<div class="caps">${chips}</div>` : "");
    }
    case "fuse":
      return view.proposals ? view.proposals.map((p) => esc(p.name)).join(" · ") : "";
    case "pick": {
      if (view.pick && view.proposals) return `Building <b>${esc(view.proposals[view.pick - 1]?.name ?? "#" + view.pick)}</b>`;
      if (view.phase === "awaiting-pick") return `Three creatures are waiting for you<br><button type="button" class="pick-again" data-open-picker>Choose now</button>`;
      return "";
    }
    case "contract":
      return view.contractTests ? `${view.contractTests} acceptance tests` : "";
    case "grow":
      return view.grownFiles ? `${view.grownFiles} files grown` : "";
    case "verify":
      return view.report?.verification ? `Contract ${view.report.verification.contract.passed}/${view.report.verification.contract.total}, own tests ${view.report.verification.own.passed}/${view.report.verification.own.total}` : current?.verifyText ?? "";
    case "originality":
      return view.report?.originality ? `${(view.report.originality.overlap * 100).toFixed(1)}% overlap with the donors` : current?.overlapText ?? "";
    case "preview":
      return view.preview ? "Ready to try below" : view.report ? "No preview for this creature" : "";
    case "verdict":
      return view.report ? `<b>${esc(view.report.verdict.status)}</b>${view.report.creature ? ` · ${esc(view.report.creature.name)}` : ""}` : "";
    default:
      return "";
  }
}

function renderStages() {
  if (!current) return;
  const view = current.view ?? {};
  const done = Boolean(view.report);
  const index = done ? ORDER.length - 1 : ORDER.indexOf(current.stage);
  const waiting = view.phase === "awaiting-pick";
  $("#rail").innerHTML = STAGES.map((stage, i) => {
    let state = i < index || (done && i <= index) ? "done" : i === index ? "now" : "pending";
    if (i === index && current.failed) state = "fail";
    if (stage.key === "pick" && waiting) state = "wait";
    if (stage.key === "preview" && done && !view.preview) state = i <= index ? "done" : state;
    const time = state === "now" ? fmtTime((Date.now() - current.stageStarted) / 1000) : state === "pending" && stage.est ? `~${fmtTime(stage.est)}` : "";
    let detail = stageDetail(stage.key, view);
    if (state === "fail" && current.error) detail = `<b>Stopped:</b> ${esc(current.error)}`;
    return `<li class="stage ${state}" data-stage="${stage.key}">
      <div class="s-top"><span>${stage.code}</span><span class="s-time">${time}</span><i class="s-icon"></i></div>
      <div class="s-title">${esc(stage.title)}</div>
      <div class="s-detail">${detail}</div>
    </li>`;
  }).join("");
  $$("[data-open-picker]").forEach((button) => button.addEventListener("click", () => openPicker(current.view)));
  renderReactor(index, done, waiting);
}

function renderReactor(index, done, waiting) {
  const reactor = $("#reactor");
  const total = STAGES.reduce((sum, stage) => sum + stage.est, 0);
  let spent = STAGES.slice(0, Math.max(0, index)).reduce((sum, stage) => sum + stage.est, 0);
  const stage = STAGES[index];
  const elapsed = (Date.now() - (current.stageStarted ?? Date.now())) / 1000;
  if (!done && stage?.est) spent += Math.min(stage.est * 0.92, elapsed);
  const pct = done ? 100 : Math.min(99, Math.round((spent / total) * 100));
  const remaining = Math.max(0, total - spent);
  $("#r-heat").setAttribute("width", String((204 * pct) / 100));
  $("#r-pct").textContent = `${pct}%`;
  const view = current.view ?? {};
  if (current.failed) $("#r-now").textContent = "The experiment stopped";
  else if (done) $("#r-now").textContent = view.report?.creature ? `${view.report.creature.name} is ${view.report.verdict.status.toLowerCase()}` : `Verdict: ${view.report?.verdict.status}`;
  else if (view.queuePosition > 0) $("#r-now").textContent = `In the queue (position ${view.queuePosition})`;
  else $("#r-now").textContent = NOW_TEXT[stage?.key] ?? "Working…";
  $("#r-eta").textContent = done || current.failed ? "" : waiting ? "Pick a creature to continue" : `About ${fmtTime(remaining)} left · step ${index + 1} of ${STAGES.length}`;
  reactor.toggleAttribute("data-done", done && !current.failed);
  reactor.toggleAttribute("data-failed", Boolean(current.failed));
  reactor.toggleAttribute("data-hot", !done && !current.failed && !waiting);
}

function openPicker(view) {
  if (!view?.proposals || view.showcase) return;
  $("#concepts").innerHTML = view.proposals
    .map(
      (p, i) => `<article class="concept">
        <div class="blend"></div>
        <span class="num">0${i + 1}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="desc">${esc(p.concept)}</p>
        <p class="new"><b>Only possible fused:</b> ${esc(p.newCapability)}</p>
        <div class="api">${p.api.map((fn) => `<code>${esc(fn.name)}()</code>`).join("")}</div>
        <button type="button" class="build" data-pick="${i + 1}">BUILD THIS →</button>
      </article>`,
    )
    .join("");
  $("#pick").hidden = false;
  document.body.style.overflow = "hidden";
  $$("#concepts .build").forEach((button) =>
    button.addEventListener("click", async () => {
      $$("#concepts .build").forEach((b) => (b.disabled = true));
      button.textContent = "STARTING…";
      try {
        await api(`runs/${encodeURIComponent(current.id)}/pick`, { method: "POST", body: JSON.stringify({ pick: Number(button.dataset.pick) }) });
        closePicker();
        current.pickedLocally = true;
        setStage("contract");
        toast(`Building ${view.proposals[Number(button.dataset.pick) - 1].name}`);
        refreshRun().catch(() => {});
      } catch (error) {
        toast(error.message);
        $$("#concepts .build").forEach((b) => (b.disabled = false));
        button.textContent = "BUILD THIS →";
      }
    }),
  );
}

function closePicker() {
  $("#pick").hidden = true;
  document.body.style.overflow = "";
}

function renderVerdict(view) {
  const report = view.report;
  $("#verdict").hidden = !report;
  $("#run").classList.toggle("finished", Boolean(report));
  if (!report) return;
  const status = report.verdict.status;
  const words = { ALIVE: "Alive", UNSTABLE: "Unstable", DEAD: "Blown", REJECTED: "Rejected" };
  $("#banner").className = `stamp ${status}`;
  $("#banner").textContent = words[status] ?? status;
  $("#c-name").textContent = report.creature?.name ?? "No creature";
  $("#c-tag").textContent = report.creature?.tagline ?? report.verdict.reason ?? "";

  // Fusion graphic: donor names in, creature out.
  const short = (text, max = 16) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));
  $("#lg-a").textContent = short($("#run-a").textContent);
  $("#lg-b").textContent = short($("#run-b").textContent);
  $("#lg-c").textContent = short(report.creature?.name ?? "—", 18);

  const v = report.verification;
  const stats = [
    v && [`${v.contract.passed}/${v.contract.total}`, "Tests passed"],
    v && [`${v.own.passed}/${v.own.total}`, "Own tests"],
    report.originality && [`${(report.originality.overlap * 100).toFixed(1)}%`, "Copied code"],
    view.files.length && [view.files.length, "Files"],
  ].filter(Boolean);
  $("#stats").innerHTML = stats.map(([value, label]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("");

  $("#donor-line").innerHTML = ["A", "B"]
    .map((label) => {
      const donor = view.donors?.[label];
      if (!donor) return "";
      const via = donor.resolution?.repo ? ` · studied via ${esc(donor.resolution.repo)}` : "";
      return `<li><b>${label}</b> ${esc(donor.name)}${via}${donor.license ? ` · ${esc(donor.license)}` : ""}</li>`;
    })
    .join("") + (report.rea ? `<li>REA ${esc(report.rea)}</li>` : "");
  $("#cert").textContent = `Certificate ${report.certificate}`;

  const id = encodeURIComponent(current.id);
  $("#dl-zip").hidden = !view.files.length;
  $("#dl-zip").href = `/api/runs/${id}/zip`;
  const inputs = view.inputs ?? {};
  $("#fuse-again").href = `/?a=${encodeURIComponent(inputs.A ?? "")}&b=${encodeURIComponent(inputs.B ?? "")}`;

  $("#try").hidden = !view.preview;
  $("#try-empty").hidden = Boolean(view.preview) || !report.creature;
  if (view.preview) {
    const src = `/preview/${id}/demo/index.html`;
    if ($("#try-frame").getAttribute("src") !== src) $("#try-frame").setAttribute("src", src);
    $("#try-open").href = src;
    $("#try-name").textContent = report.creature ? report.creature.name : "";
    fitPhone();
    setTimeout(fitPhone, 300);
  }

  // "How it was made": the stages, compact.
  $("#made-list").innerHTML = STAGES.filter((stage) => stage.key !== "verdict")
    .map((stage) => {
      const detail = stageDetail(stage.key, view).replace(/<div class="caps">[\s\S]*<\/div>/, "").replace(/<button[\s\S]*<\/button>/, "");
      return `<li><b>${esc(stage.title)}</b>${detail ? ` <span>· ${detail.replace(/<br>/g, " · ")}</span>` : ""}</li>`;
    })
    .join("");

  $("#report").innerHTML = markdown(view.reportMarkdown ?? "");
  $("#file-list").innerHTML = view.files.map((file) => `<li><button type="button" data-file="${esc(file)}">${esc(file)}</button></li>`).join("");
  $$("#file-list button").forEach((button) =>
    button.addEventListener("click", async () => {
      $$("#file-list button").forEach((b) => b.classList.toggle("on", b === button));
      const { content } = await api(`runs/${id}/file?path=${encodeURIComponent(button.dataset.file)}`);
      $("#file-view").textContent = content;
    }),
  );
}

/**
 * The phone keeps a real 390×800 screen and is scaled as a whole to fit
 * the column and the window, so the app inside never gets squeezed.
 */
function fitPhone() {
  const fit = $("#phone-fit");
  const phone = $("#phone");
  if (!fit || !phone || $("#try").hidden) return;
  const narrow = window.innerWidth < 960;
  // Measure the space the layout gives the phone, not the phone's own width.
  const column = (narrow ? $("#verdict").clientWidth : $(".done-right").clientWidth) || 418;
  // Fit the whole phone in the first screen: below the header on desktop, full width on phones.
  const top = fit.getBoundingClientRect().top + window.scrollY;
  const byHeight = (window.innerHeight - top - (narrow ? 14 : 28)) / 894;
  const scale = Math.max(narrow ? 0.66 : 0.55, Math.min(1, column / 418, byHeight));
  phone.style.transform = `scale(${scale})`;
  fit.style.width = `${Math.round(418 * scale)}px`;
  fit.style.height = `${Math.round(894 * scale)}px`;
}
window.addEventListener("resize", fitPhone);

function tickClock() {
  const clock = $("#phone-clock");
  if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/s?[AP]M$/i, "");
}
tickClock();
setInterval(tickClock, 30_000);

function renderDonors(view) {
  $("#donor-cards").innerHTML = ["A", "B"]
    .map((label) => {
      const donor = view.donors?.[label];
      const spec = view.specs?.[label];
      const input = view.inputs?.[label] ?? "?";
      return `<div class="sheet ${label.toLowerCase()}">
        <div class="sheet-head"><span>DATASHEET · DONOR ${label}</span><span>${donor ? "LOADED" : "PENDING"}</span></div>
        <div class="sheet-body">
          <div class="sheet-name">${esc(donor?.name ?? input)}</div>
          ${donor ? `<dl>${donor.resolution ? `<dt>studied via</dt><dd>${esc(donor.resolution.repo)}</dd>` : ""}<dt>license</dt><dd>${esc(donor.license ?? "unknown")}</dd><dt>commit</dt><dd>${esc(donor.commit?.slice(0, 10) ?? "local")}</dd></dl>` : ""}
          ${spec ? `<p>${esc(spec.oneLiner)}</p><ul>${spec.capabilities.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

async function refreshRun() {
  if (!current) return null;
  const view = await api(`runs/${encodeURIComponent(current.id)}`);
  const hadReport = Boolean(current.view?.report);
  current.view = view;
  const title = (label) => {
    const input = view.inputs?.[label] ?? label;
    return /^https?:\/\//.test(input) && view.donors?.[label]?.name ? view.donors[label].name : input;
  };
  $("#run-a").textContent = title("A");
  $("#run-b").textContent = title("B");
  document.title = `${title("A")} × ${title("B")} · ReaFuse`;
  if (view.report) setStage("verdict", { failed: view.report.verdict.status === "DEAD" || view.report.verdict.status === "REJECTED" });
  else if (view.phase === "awaiting-pick") setStage("pick");
  renderDonors(view);
  renderVerdict(view);
  renderStages();
  if (view.phase === "awaiting-pick" && !current.pickerShown) {
    current.pickerShown = true;
    openPicker(view);
  }
  if (view.report && !hadReport && current.live) {
    if (current.notify && "Notification" in window && Notification.permission === "granted") {
      new Notification("ReaFuse: experiment finished", { body: `${title("A")} × ${title("B")} → ${view.report.creature?.name ?? ""} ${view.report.verdict.status}` });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return view;
}

async function openRun(id) {
  closeRun();
  current = { id, stage: "intake", stageStarted: Date.now(), started: Date.now(), live: false };
  $("#home").hidden = true;
  $("#run").hidden = false;
  $("#log").textContent = "";
  $("#run-id").textContent = id;
  $("#verdict").hidden = true;
  closePicker();
  window.scrollTo(0, 0);

  const view = await refreshRun().catch((error) => {
    appendLog(`✕ ${error.message}\n`);
    return null;
  });
  if (!view) return;
  if (view.startedAt) current.started = Date.parse(view.startedAt);
  if (view.showcase) {
    appendLog(`# Showcase creature: fused, grown and verified earlier.\n`);
    return;
  }

  const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/stream`);
  current.source = source;
  source.addEventListener("log", (event) => appendLog(JSON.parse(event.data).text));
  source.addEventListener("phase", () => refreshRun().catch(() => {}));
  setTimeout(() => current && (current.live = true), 1500); // past the replay of the existing log
  current.timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - current.started) / 1000);
    $("#elapsed").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (!current.view?.report) renderStages();
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

$("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(location.href).catch(() => {});
  toast("Link copied: come back any time");
});

$("#notify-me").addEventListener("click", async () => {
  if (!("Notification" in window)) return toast("This browser can't show notifications");
  const permission = await Notification.requestPermission();
  if (current) current.notify = permission === "granted";
  toast(permission === "granted" ? "We'll notify you when it's done" : "Notifications are blocked");
});

$("#share").addEventListener("click", async () => {
  const view = current?.view;
  const text = view?.report?.creature
    ? `${$("#run-a").textContent} × ${$("#run-b").textContent} → ${view.report.creature.name} (${view.report.verdict.status}), fused with ReaFuse`
    : "Fused with ReaFuse";
  if (navigator.share) {
    await navigator.share({ title: "ReaFuse", text, url: location.href }).catch(() => {});
  } else {
    await navigator.clipboard?.writeText(`${text} ${location.href}`).catch(() => {});
    toast("Share text copied");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#pick").hidden) closePicker();
});


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
    $("#tab-donors").hidden = button.dataset.tab !== "donors";
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

const params = new URLSearchParams(location.search);
if (params.get("a")) $("#donor-a").value = params.get("a");
if (params.get("b")) $("#donor-b").value = params.get("b");
wireTerminal("donor-a", "kind-a", "a");
wireTerminal("donor-b", "kind-b", "b");
refreshStatus();
setInterval(refreshStatus, 120_000);
route();
