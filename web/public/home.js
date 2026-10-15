// Home page extras: the "Use ReaFuse" tabs, copy buttons, live facts and the lit procedure.

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// ── agent prompt, filled with this lab's own address ─────
const origin = location.origin;
const prompt = $("#agent-prompt");
if (prompt) {
  prompt.textContent = `Use ReaFuse (${origin}) to fuse two apps into a new, tested project.

1. POST ${origin}/api/fuse with JSON {"a": "<app A>", "b": "<app B>"}.
   Apps can be names (Spotify), websites (instagram.com) or GitHub repos (owner/repo).
   The reply is {"id": "<run id>"}.
2. Poll GET ${origin}/api/runs/<id> every 15 seconds.
   When "phase" is "awaiting-pick", read "proposals" (three creatures), choose one,
   and POST ${origin}/api/runs/<id>/pick with {"pick": 1, 2 or 3}.
3. Keep polling until "phase" is "done". Report report.verdict.status
   (ALIVE, UNSTABLE, DEAD or REJECTED), the creature name and the contract result.
4. Download the code from ${origin}/api/runs/<id>/zip.
   Humans can watch live at ${origin}/run/<id>`;
}

// ── tabs ─────────────────────────────────────────────────
const tabs = $$(".use-tabs [role=tab]");
function select(name, focus = false) {
  for (const tab of tabs) {
    const on = tab.id === `tab-${name}`;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`#${tab.getAttribute("aria-controls")}`).hidden = !on;
    if (on && focus) tab.focus();
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(tab.id.slice(4)));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const next = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    select(next.id.slice(4), true);
  });
});
$$("[data-tab]").forEach((link) =>
  link.addEventListener("click", (event) => {
    event.preventDefault();
    select(link.dataset.tab);
    $("#use").scrollIntoView({ behavior: "smooth", block: "start" });
  }),
);
if (location.hash === "#agents") select("agents");

$("#cta-fuse")?.addEventListener("click", (event) => {
  event.preventDefault();
  $("#fuse-form").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("#donor-a")?.focus({ preventScroll: true }), 450);
});

// ── copy buttons ─────────────────────────────────────────
$$("button.copy").forEach((button) =>
  button.addEventListener("click", async () => {
    const text = $(`#${button.dataset.copy}`)?.textContent ?? "";
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied ✓";
    } catch {
      button.textContent = "Select and copy";
    }
    button.classList.add("done");
    setTimeout(() => { button.textContent = label; button.classList.remove("done"); }, 1600);
  }),
);

// ── live ticker: real fusions and the lab pulse ──────────
const ticker = $("#ticker");
const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
Promise.all([
  fetch("/api/gallery").then((r) => r.json()).catch(() => ({ items: [] })),
  fetch("/api/status").then((r) => r.json()).catch(() => null),
]).then(([gallery, status]) => {
  if (!ticker) return;
  const cells = (gallery.items ?? []).filter((item) => item.name).map((item) =>
    `<span class="tk"><b class="ta">${esc(item.donors.A)}</b><i>×</i><b class="tb">${esc(item.donors.B)}</b><i>→</i><b>${esc(item.name)}</b><em class="${esc(item.verdict)}">${esc(item.verdict)}${item.contract ? " " + esc(item.contract) : ""}</em></span>`);
  if (status) cells.unshift(`<span class="tk pulse"><i class="dot busy"></i><b>LAB LIVE</b><i>·</i>${status.running ?? 0} growing<i>·</i>queue ${status.queue ?? 0}<i>·</i>REA ${esc(status.rea ?? "")}</span>`);
  if (!cells.length) return;
  const run = cells.join("");
  ticker.innerHTML = run + run + run + run;
  ticker.style.setProperty("--tk-time", `${Math.max(14, cells.length * 4)}s`);
});

// ── live facts ───────────────────────────────────────────
fetch("/api/gallery")
  .then((response) => response.json())
  .then(({ items }) => {
    const alive = (items ?? []).filter((item) => item.verdict === "ALIVE").length;
    const fact = $("#fact-alive");
    if (!fact) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 900);
      fact.textContent = String(Math.round(alive * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })
  .catch(() => {});

// ── procedure: current flows through each step as it scrolls in ─
const steps = $$(".steps li");
if ("IntersectionObserver" in window && steps.length) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        steps.forEach((step, i) => setTimeout(() => step.classList.add("lit"), i * 140));
        seen.disconnect();
      }
    },
    { threshold: 0.35 },
  );
  seen.observe($(".steps"));
}
