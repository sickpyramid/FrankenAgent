// ReaFuse reactor: replays real fusions from the parts catalog as particle physics.
// Donor names form from orange (A) and cobalt (B) matter, collide in the fuse,
// and recombine into the creature, still carrying both colors: its lineage.

const RGB = { a: "255,79,0", b: "74,98,255", live: "255,176,0", ok: "38,196,110", paper: "236,232,223" };
const CYCLE = 6_600;
const T = { dissect: 850, charge: 1800, flash: 2750, grow: 3200, verify: 4150, stamp: 4850, dissolve: 5800 };
const STAGES = [0, 420, 850, 1800, 3000, 3200, 4150, 5200]; // RSLV INTK DSCT FUSE CTRC GROW VRFY ORIG
const FALLBACK = [
  { id: "showcase:ratewise", name: "ratewise", tagline: "Human-readable transfer rates, ETAs and data budgets.", A: "ms", B: "pretty-bytes", total: 18, passed: 18, verdict: "ALIVE" },
  { id: "showcase:objdelta", name: "objdelta", tagline: "Structural diffs and immutable patches for plain JavaScript data.", A: "dequal", B: "klona", total: 17, passed: 17, verdict: "ALIVE" },
];
const FONT = `900 {s}px Archivo, "Helvetica Neue", Arial, sans-serif`;
const MONO = `500 {s}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;

const panel = document.getElementById("chamber");
if (panel) boot(panel);

function boot(panel) {
  const canvas = panel.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const sampler = document.createElement("canvas");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ui = {
    a: panel.querySelector(".cx-pair .ta"),
    b: panel.querySelector(".cx-pair .tb"),
    c: panel.querySelector(".cx-pair .tc"),
    tag: panel.querySelector(".cx-tag"),
    open: panel.querySelector(".cx-open"),
    stages: [...panel.querySelectorAll(".cx-stages li")],
  };

  let W = 0, H = 0, dpr = 1, N = 0;
  let x, y, vx, vy, tx, ty, delay, seed;
  let items = FALLBACK, index = -1, item = FALLBACK[0], typed = null;
  let clock = 0, last = 0, frame = 0, cycleNo = -1, onScreen = true, ready = false;
  let mode = "", modeAt = 0;
  let flash = 0, ring = -1, shake = 0;
  let debris = [];
  let grid = null;
  const pointer = { x: -1e4, y: -1e4 };

  // ── layout ──────────────────────────────────────────────
  const field = () => {
    const top = 46, bottom = H - (W < 560 ? 118 : 128);
    return { top, bottom, cx: W / 2, cy: (top + bottom) / 2, h: bottom - top };
  };
  const boxA = () => { const f = field(); return { x: W * 0.07, y: f.top + f.h * 0.04, w: W * 0.86, h: f.h * 0.36 }; };
  const boxB = () => { const f = field(); return { x: W * 0.07, y: f.top + f.h * 0.56, w: W * 0.86, h: f.h * 0.36 }; };
  const boxC = () => { const f = field(); return { x: W * 0.06, y: f.top + f.h * 0.16, w: W * 0.88, h: f.h * 0.5 }; };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width; H = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const want = Math.round(Math.min(2000, Math.max(700, (W * H) / 170)));
    if (Math.abs(want - N) > 120) allocate(want);
    grid = makeGrid();
    if (ready) retarget();
    if (reduced) still();
    else play();
  }

  function allocate(count) {
    N = count;
    x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    tx = new Float32Array(N); ty = new Float32Array(N); delay = new Float32Array(N); seed = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      x[i] = Math.random() * W; y[i] = Math.random() * H;
      seed[i] = Math.random() * 1000;
    }
  }

  function makeGrid() {
    const g = document.createElement("canvas");
    g.width = canvas.width; g.height = canvas.height;
    const c = g.getContext("2d");
    c.scale(dpr, dpr);
    c.strokeStyle = `rgba(${RGB.paper},1)`;
    c.lineWidth = 1 / dpr;
    c.beginPath();
    for (let gx = 0; gx < W; gx += 24) { c.moveTo(gx + 0.5, 0); c.lineTo(gx + 0.5, H); }
    for (let gy = 0; gy < H; gy += 24) { c.moveTo(0, gy + 0.5); c.lineTo(W, gy + 0.5); }
    c.stroke();
    return g;
  }

  // ── text → particle targets ─────────────────────────────
  function sample(text, box) {
    const w = Math.max(8, Math.ceil(box.w)), h = Math.max(8, Math.ceil(box.h));
    sampler.width = w; sampler.height = h;
    const c = sampler.getContext("2d", { willReadFrequently: true });
    let size = h * 0.92;
    c.font = FONT.replace("{s}", size);
    const width = c.measureText(text).width;
    if (width > w) size *= w / width;
    size = Math.max(10, Math.floor(size));
    c.clearRect(0, 0, w, h);
    c.font = FONT.replace("{s}", size);
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff";
    c.fillText(text, w / 2, h / 2 + size * 0.05);
    const data = c.getImageData(0, 0, w, h).data;
    const step = Math.max(1, Math.round(size / 34));
    const points = [];
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) if (data[(py * w + px) * 4 + 3] > 140) points.push(box.x + px, box.y + py);
    }
    if (!points.length) points.push(box.x + w / 2, box.y + h / 2);
    // Fisher-Yates over point pairs so any prefix covers the whole word.
    for (let i = points.length / 2 - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[2 * i], points[2 * j]] = [points[2 * j], points[2 * i]];
      [points[2 * i + 1], points[2 * j + 1]] = [points[2 * j + 1], points[2 * i + 1]];
    }
    return points;
  }

  const label = (text) => String(text ?? "").toUpperCase().slice(0, 22);

  function aim(points, from, to, spread) {
    const count = points.length / 2;
    for (let i = from; i < to; i += 1) {
      const k = (i - from) % count;
      tx[i] = points[2 * k] + (Math.random() - 0.5) * 0.8;
      ty[i] = points[2 * k + 1] + (Math.random() - 0.5) * 0.8;
      delay[i] = Math.random() * spread;
    }
  }

  function retarget() {
    const half = N >> 1;
    if (mode === "names") {
      aim(sample(label(item.A), boxA()), 0, half, 0);
      aim(sample(label(item.B), boxB()), half, N, 0);
    } else if (mode === "creature") {
      aim(sample(label(item.custom ? "?" : item.name), boxC()), 0, N, 0);
    }
  }

  // ── the show ────────────────────────────────────────────
  function nextItem() {
    if (typed) {
      item = { ...typed, custom: true };
      typed = null;
    } else {
      index = (index + 1) % items.length;
      item = items[index];
    }
    ui.a.textContent = item.A;
    ui.b.textContent = item.B;
    ui.c.textContent = item.custom ? "your creature" : item.name;
    ui.tag.textContent = item.custom ? "Not born yet. Throw the switch below to grow it." : item.tagline ?? "";
    panel.classList.remove("cx-grown");
    if (item.custom) {
      ui.open.href = "#fuse-form";
      ui.open.removeAttribute("data-link");
      ui.open.textContent = "Throw the switch ↓";
    } else {
      ui.open.href = `/run/${encodeURIComponent(item.id)}`;
      ui.open.setAttribute("data-link", "");
      ui.open.textContent = "Open this run ↗";
    }
  }

  function enter(name, t) {
    mode = name; modeAt = t;
    const half = N >> 1;
    if (name === "names") {
      // Matter streams in from the A and B terminals.
      for (let i = 0; i < N; i += 1) {
        x[i] = i < half ? -40 - Math.random() * W * 0.4 : W + 40 + Math.random() * W * 0.4;
        y[i] = field().cy + (Math.random() - 0.5) * H * 0.9;
        vx[i] = vy[i] = 0;
      }
      aim(sample(label(item.A), boxA()), 0, half, 320);
      aim(sample(label(item.B), boxB()), half, N, 320);
    } else if (name === "creature") {
      aim(sample(label(item.custom ? "?" : item.name), boxC()), 0, N, 260);
      panel.classList.add("cx-grown");
    } else if (name === "flash") {
      const { cx, cy } = field();
      for (let i = 0; i < N; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const power = 8 + Math.random() * 24;
        x[i] = cx + (Math.random() - 0.5) * 10; y[i] = cy + (Math.random() - 0.5) * 10;
        vx[i] = Math.cos(angle) * power; vy[i] = Math.sin(angle) * power * 0.7;
      }
      flash = 1; ring = 0; shake = 1;
      spawnDebris(cx, cy);
    }
  }

  function spawnDebris(cx, cy) {
    const name = item.custom ? "creature" : item.name;
    const tokens = [
      "export function", "import { test } from 'node:test'", "assert.deepEqual", "src/index.mjs", `bin/${name}.mjs`,
      "spec-A.json", "spec-B.json", "REA evidence", "zero deps", "node --test", "contract.test.mjs", "{ A, B } ⇒ C",
      "originality 0.0%", `"type": "module"`, "clean-room", "verify()", "license: MIT",
    ];
    const count = W < 560 ? 9 : 16;
    debris = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.2 + Math.random() * 3.2;
      return {
        text: tokens[(i + Math.floor(Math.random() * tokens.length)) % tokens.length],
        x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.75,
        rot: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 0.02,
        color: i % 3 === 0 ? RGB.a : i % 3 === 1 ? RGB.b : RGB.paper, life: 1,
      };
    });
  }

  function schedule(t) {
    if (t < T.dissect) return "names";
    if (t < T.charge) return "names";
    if (t < T.flash) return "vortex";
    if (t < T.grow) return "flash";
    if (t < T.dissolve) return "creature";
    return "drift";
  }

  function update(dt, t) {
    const want = schedule(t);
    if (want !== mode) enter(want, t);
    const f = dt / 16.67;
    const since = t - modeAt;
    const { cx, cy, h } = field();
    const repel = W < 560 ? 54 : 84;

    if (mode === "names" || mode === "creature") {
      const k = 0.085, damp = Math.pow(0.78, f);
      const jitter = mode === "names" && t > T.dissect ? scanJitter(t) : null;
      for (let i = 0; i < N; i += 1) {
        if (since < delay[i]) { vx[i] *= 0.96; vy[i] *= 0.96; x[i] += vx[i] * f; y[i] += vy[i] * f; continue; }
        let gx = tx[i], gy = ty[i];
        if (jitter && Math.abs(gy - jitter.y) < jitter.band) { gx += (Math.random() - 0.5) * 6; gy += (Math.random() - 0.5) * 3; }
        vx[i] = (vx[i] + (gx - x[i]) * k * f) * damp;
        vy[i] = (vy[i] + (gy - y[i]) * k * f) * damp;
      }
    } else if (mode === "vortex") {
      // Counter-rotating rings: A and B spiral into the fuse.
      const p = Math.min(1, since / (T.flash - T.charge));
      const radius = h * (0.46 - 0.3 * p * p);
      const half = N >> 1;
      for (let i = 0; i < N; i += 1) {
        const dx = x[i] - cx, dy = (y[i] - cy) * 1.4;
        const r = Math.hypot(dx, dy) || 1;
        const spin = (i < half ? 1 : -1) * (0.9 + p * 2.6);
        const pull = (radius * (0.85 + (seed[i] % 0.3)) - r) * 0.012;
        vx[i] = (vx[i] + (dx / r) * pull * f + (-dy / r) * spin * 0.12 * f) * Math.pow(0.9, f);
        vy[i] = (vy[i] + (dy / r) * pull * f / 1.4 + (dx / r) * spin * 0.12 * f / 1.4) * Math.pow(0.9, f);
      }
    } else if (mode === "flash") {
      const damp = Math.pow(0.93, f);
      for (let i = 0; i < N; i += 1) { vx[i] *= damp; vy[i] *= damp; }
    } else {
      // Dissolve: matter drifts back into the ambient field.
      for (let i = 0; i < N; i += 1) {
        vx[i] = (vx[i] + Math.sin(y[i] * 0.012 + t * 0.0011 + seed[i]) * 0.06 * f) * Math.pow(0.97, f);
        vy[i] = (vy[i] + Math.cos(x[i] * 0.012 + t * 0.0009 + seed[i]) * 0.06 * f - 0.015 * f) * Math.pow(0.97, f);
      }
    }

    for (let i = 0; i < N; i += 1) {
      const dx = x[i] - pointer.x, dy = y[i] - pointer.y, d2 = dx * dx + dy * dy;
      if (d2 < repel * repel && d2 > 1) {
        const push = ((repel * repel - d2) / (repel * repel)) * 2.4 * f / Math.sqrt(d2);
        vx[i] += dx * push; vy[i] += dy * push;
      }
      x[i] += vx[i] * f; y[i] += vy[i] * f;
    }

    for (const piece of debris) {
      piece.x += piece.vx * f; piece.y += piece.vy * f;
      piece.vx *= Math.pow(0.985, f); piece.vy *= Math.pow(0.985, f);
      piece.rot += piece.spin * f; piece.life -= 0.013 * f;
    }
    debris = debris.filter((piece) => piece.life > 0);
    flash = Math.max(0, flash - 0.065 * f);
    shake = Math.max(0, shake - 0.06 * f);
    if (ring >= 0) ring = ring > 1 ? -1 : ring + 0.034 * f;
  }

  function scanJitter(t) {
    const { top, h } = field();
    const p = (t - T.dissect) / (T.charge - T.dissect);
    return { y: top + h * ((p * 1.6) % 1), band: 7 };
  }

  // ── drawing ─────────────────────────────────────────────
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = mode === "flash" ? "rgba(17,17,16,0.22)" : "rgba(17,17,16,0.34)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.05;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (grid) ctx.drawImage(grid, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    const { cx, cy, h } = field();
    const sx = shake ? (Math.random() - 0.5) * 9 * shake : 0, sy = shake ? (Math.random() - 0.5) * 6 * shake : 0;
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = "lighter";

    if (mode === "vortex") {
      const p = Math.min(1, (t - T.charge) / (T.flash - T.charge));
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.42);
      glow.addColorStop(0, `rgba(${RGB.live},${0.02 + p * 0.1})`);
      glow.addColorStop(1, "rgba(255,176,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      if (Math.random() < 0.25 + p * 0.6) arc(cx, cy, h, p);
    }

    const half = N >> 1;
    const size = W < 560 ? 1.5 : 1.7;
    const hot = mode === "flash" ? Math.min(1, flash * 1.4) : 0;
    ctx.fillStyle = `rgba(${RGB.a},${mode === "vortex" ? 0.7 : 0.95})`;
    for (let i = 0; i < half; i += 1) ctx.fillRect(x[i], y[i], size, size);
    ctx.fillStyle = `rgba(${RGB.b},${mode === "vortex" ? 0.75 : 0.95})`;
    for (let i = half; i < N; i += 1) ctx.fillRect(x[i], y[i], size, size);
    if (hot) {
      ctx.fillStyle = `rgba(${RGB.paper},${hot * 0.8})`;
      for (let i = 0; i < N; i += 3) ctx.fillRect(x[i], y[i], size, size);
    }

    if (mode === "names" && t > T.dissect) {
      const { y: scanY } = scanJitter(t);
      const beam = ctx.createLinearGradient(0, scanY - 26, 0, scanY + 2);
      beam.addColorStop(0, "rgba(255,176,0,0)");
      beam.addColorStop(1, "rgba(255,176,0,0.32)");
      ctx.fillStyle = beam;
      ctx.fillRect(0, scanY - 26, W, 28);
      ctx.fillStyle = `rgba(${RGB.live},0.9)`;
      ctx.fillRect(0, scanY, W, 1);
    }

    if (ring >= 0) {
      const radius = ring * Math.max(W, H) * 0.75;
      ctx.lineWidth = 2 + (1 - ring) * 8;
      ctx.strokeStyle = `rgba(${RGB.live},${(1 - ring) * 0.55})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${RGB.paper},${(1 - ring) * 0.5})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius * 0.82, radius * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (flash > 0) {
      const burst = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      burst.addColorStop(0, `rgba(255,246,220,${flash * 0.78})`);
      burst.addColorStop(0.25, `rgba(${RGB.live},${flash * 0.45})`);
      burst.addColorStop(1, "rgba(255,79,0,0)");
      ctx.fillStyle = burst;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.font = MONO.replace("{s}", W < 560 ? 10 : 11);
    for (const piece of debris) {
      ctx.save();
      ctx.translate(piece.x, piece.y); ctx.rotate(piece.rot);
      ctx.fillStyle = `rgba(${piece.color},${Math.min(1, piece.life * 1.3)})`;
      ctx.fillText(piece.text, 0, 0);
      ctx.restore();
    }

    if (mode === "creature" || (mode === "drift" && !item.custom)) verifyLayer(t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud(t);
  }

  function arc(cx, cy, h, p) {
    // Lightning between a random A particle and a random B particle.
    const half = N >> 1;
    const i = Math.floor(Math.random() * half), j = half + Math.floor(Math.random() * half);
    let ax = x[i], ay = y[i];
    const bx = x[j], by = y[j];
    const segments = 9;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let s = 1; s <= segments; s += 1) {
      const k = s / segments;
      const mx = ax + (bx - ax) * (1 / (segments - s + 1)) + (Math.random() - 0.5) * 26 * (1 - k * 0.5);
      const my = ay + (by - ay) * (1 / (segments - s + 1)) + (Math.random() - 0.5) * 26 * (1 - k * 0.5);
      ctx.lineTo(mx, my);
      ax = mx; ay = my;
    }
    ctx.strokeStyle = `rgba(${RGB.live},${0.18 + p * 0.25})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,240,210,${0.55 + p * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function verifyLayer(t) {
    if (item.custom) return;
    const box = boxC();
    const total = item.total || 0;
    const fade = mode === "drift" ? Math.max(0, 1 - (t - T.dissolve) / 450) : 1;
    if (t < T.verify || !total || fade <= 0) return;
    const p = Math.min(1, (t - T.verify) / 600);
    const shown = Math.round(p * (item.passed ?? total));
    const cells = Math.min(total, 30);
    const cell = W < 560 ? 6 : 8, gap = 3;
    const rowW = cells * (cell + gap) - gap;
    const rx = W / 2 - rowW / 2, ry = box.y + box.h + 8;
    ctx.globalAlpha = fade;
    for (let c = 0; c < cells; c += 1) {
      const lit = c < Math.round((shown / total) * cells);
      ctx.fillStyle = lit ? `rgba(${RGB.ok},1)` : "rgba(236,232,223,0.14)";
      ctx.fillRect(rx + c * (cell + gap), ry, cell, cell);
    }
    ctx.font = MONO.replace("{s}", W < 560 ? 10 : 11);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(${RGB.paper},0.75)`;
    ctx.fillText(W < 560 ? `CONTRACT ${shown}/${total} PASSED` : `CONTRACT ${shown}/${total} PASSED  ·  WRITTEN BEFORE THE CODE`, W / 2, ry + cell + 16);
    ctx.textAlign = "left";

    if (t > T.stamp) {
      const q = Math.min(1, (t - T.stamp) / 200);
      const back = 1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2);
      const scale = 1.9 - 0.9 * back;
      const sw = W < 560 ? 92 : 124, sh = W < 560 ? 34 : 44;
      const sx = Math.min(W - sw * 0.6 - 10, box.x + box.w * 0.82), sy = box.y + box.h * 0.12;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(-0.12); ctx.scale(scale, scale);
      ctx.globalAlpha = fade * Math.min(1, q * 1.6);
      ctx.fillStyle = "rgba(17,17,16,0.82)";
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
      ctx.strokeStyle = `rgba(${RGB.ok},1)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.lineWidth = 1;
      ctx.strokeRect(-sw / 2 + 5, -sh / 2 + 5, sw - 10, sh - 10);
      ctx.fillStyle = `rgba(${RGB.ok},1)`;
      ctx.font = FONT.replace("{s}", W < 560 ? 19 : 25);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(item.verdict ?? "ALIVE", 0, 1);
      ctx.restore();
      if (q < 1 && q > 0.7) shake = Math.max(shake, 0.35);
    }
    ctx.globalAlpha = 1;
  }

  function hud(t) {
    const small = W < 560;
    ctx.font = MONO.replace("{s}", small ? 9.5 : 11);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = `rgba(${RGB.paper},0.55)`;
    ctx.textAlign = "left";
    const title = small ? "CHAMBER 01" : "REACTOR · CHAMBER 01 · REPLAY";
    ctx.fillText(title, 16, 26);
    const blink = Math.floor(clock / 500) % 2 === 0;
    ctx.fillStyle = `rgba(${RGB.live},${blink ? 1 : 0.25})`;
    ctx.fillRect(16 + ctx.measureText(title).width + 8, 19, 6, 6);
    ctx.textAlign = "right";
    ctx.fillStyle = `rgba(${RGB.paper},0.55)`;
    const id = item.custom ? "RF-????" : `RF-${String(items.length - Math.max(0, index)).padStart(4, "0")}`;
    ctx.fillText(`${id}  T+${(t / 1000).toFixed(2).padStart(5, "0")}s`, W - 16, 26);
    ctx.textAlign = "left";
    // Terminal labels while the donors are on the bench.
    if (mode === "names") {
      const a = boxA(), b = boxB();
      ctx.fillStyle = `rgba(${RGB.a},0.9)`;
      ctx.fillText("TERMINAL A", a.x, a.y - 2);
      ctx.fillStyle = `rgba(${RGB.b},1)`;
      ctx.fillText("TERMINAL B", b.x, b.y - 2);
      if (t > T.dissect) {
        ctx.fillStyle = `rgba(${RGB.live},0.9)`;
        ctx.textAlign = "right";
        ctx.fillText("REA · DISSECTING", W - 16, b.y - 2);
        ctx.textAlign = "left";
      }
    }
  }

  function syncStages(t) {
    ui.stages.forEach((li, i) => {
      const start = STAGES[i], end = STAGES[i + 1] ?? T.dissolve;
      li.classList.toggle("done", t >= end);
      li.classList.toggle("on", t >= start && t < end);
    });
  }

  // ── loop ────────────────────────────────────────────────
  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(48, now - (last || now));
    last = now;
    clock += dt;
    const t = clock % CYCLE;
    const cycle = Math.floor(clock / CYCLE);
    if (cycle !== cycleNo) { cycleNo = cycle; nextItem(); mode = ""; }
    update(dt, t);
    draw(t);
    syncStages(t);
  }

  function play() {
    if (frame || reduced || !onScreen || document.hidden || !ready || !grid || !N) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function still() {
    // Reduced motion: one composed frame of the finished creature.
    if (!ready) return;
    mode = "creature";
    aim(sample(label(item.name), boxC()), 0, N, 0);
    for (let i = 0; i < N; i += 1) { x[i] = tx[i]; y[i] = ty[i]; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111110"; ctx.fillRect(0, 0, W, H);
    draw(T.stamp + 600);
    syncStages(T.dissolve);
    panel.classList.add("cx-grown");
  }

  // ── wiring ──────────────────────────────────────────────
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
  });
  canvas.addEventListener("pointerleave", () => { pointer.x = pointer.y = -1e4; });
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left, py = event.clientY - rect.top;
    for (let i = 0; i < N; i += 1) {
      const dx = x[i] - px, dy = y[i] - py, d = Math.hypot(dx, dy) || 1;
      if (d < 160) { vx[i] += (dx / d) * (160 - d) * 0.12; vy[i] += (dy / d) * (160 - d) * 0.12; }
    }
  });

  // What the visitor types becomes the next replay.
  const inputA = document.getElementById("donor-a"), inputB = document.getElementById("donor-b");
  const onType = () => {
    const A = inputA?.value.trim(), B = inputB?.value.trim();
    if (A && B) {
      typed = { A: shorten(A), B: shorten(B), name: "?", tagline: "" };
      if (mode === "drift" || mode === "creature") clock += CYCLE - (clock % CYCLE) - 1;
    }
  };
  let typing = 0;
  const debounced = () => { clearTimeout(typing); typing = setTimeout(onType, 700); };
  inputA?.addEventListener("input", debounced);
  inputB?.addEventListener("input", debounced);
  document.querySelectorAll(".chips button").forEach((chip) => chip.addEventListener("click", debounced));

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    onScreen ? play() : pause();
  }).observe(panel);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  new ResizeObserver(resize).observe(canvas);

  Promise.all([
    fetch("/api/gallery").then((r) => r.json()).catch(() => ({ items: [] })),
    document.fonts?.load(FONT.replace("{s}", 64)).catch(() => null),
  ]).then(([gallery]) => {
    const real = (gallery.items ?? [])
      .filter((g) => g.verdict === "ALIVE" && g.name && g.donors?.A && g.donors?.B)
      .map((g) => {
        const [passed, total] = String(g.contract ?? "").split("/").map(Number);
        return { id: g.id, name: g.name, tagline: g.tagline, A: g.donors.A, B: g.donors.B, passed, total, verdict: g.verdict };
      });
    // Lead with the visitor-friendly app-name fusions.
    real.sort((p, q) => Number(q.id.startsWith("showcase:") ? 0 : 1) - Number(p.id.startsWith("showcase:") ? 0 : 1));
    if (real.length) items = real;
    item = items[0];
    ready = true;
    resize();
    if (reduced) { nextItem(); still(); } else play();
  });
}

function shorten(value) {
  const repo = value.match(/github\.com\/[^/]+\/([^/#?]+)/i) ?? value.match(/^[\w.-]+\/([\w.-]+)$/);
  if (repo) return repo[1].replace(/\.git$/, "");
  return value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
