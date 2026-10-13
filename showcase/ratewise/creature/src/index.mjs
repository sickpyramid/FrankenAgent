import { bytesPerUnit, DURATION_LADDER, DURATION_MS, PER_SECONDS, SIZE_LABELS } from "./units.mjs";

const QUANTITY = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-zA-Z]*)\s*$/;

/** Parses "1.5 GB", "2 KiB", "100 Mbit" or "100" into bytes. NaN if unrecognised. */
export function parseSize(text) {
  if (typeof text !== "string") return NaN;
  const match = QUANTITY.exec(text);
  if (!match) return NaN;
  const factor = bytesPerUnit(match[2]);
  return factor === undefined ? NaN : Number(match[1]) * factor;
}

/** Parses "90s", "2 hours" or "1.5d" into milliseconds. NaN if unrecognised. */
export function parseDuration(text) {
  if (typeof text !== "string") return NaN;
  const match = QUANTITY.exec(text);
  if (!match) return NaN;
  const factor = match[2] === "" ? 1 : DURATION_MS.get(match[2].toLowerCase());
  return factor === undefined ? NaN : Number(match[1]) * factor;
}

/**
 * Parses "<size>/<period>" or "<size> per <period>" into bytes per second.
 * The period may carry its own amount, e.g. "1 GB / 2h".
 */
export function parseRate(text) {
  if (typeof text !== "string") return NaN;
  const parts = text.split(/\s*(?:\/|\bper\b)\s*/i);
  if (parts.length !== 2) return NaN;
  const bytes = parseSize(parts[0]);
  const period = /^[a-zA-Z]/.test(parts[1]) ? `1 ${parts[1]}` : parts[1];
  const ms = parseDuration(period);
  if (Number.isNaN(bytes) || Number.isNaN(ms) || ms <= 0) return NaN;
  return bytes / (ms / 1000);
}

/** Formats bytes for people: 1337 → "1.34 kB". */
export function formatSize(bytes, { binary = false, bits = false } = {}) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    throw new TypeError(`Expected a finite number of bytes, got ${bytes}`);
  }
  const labels = SIZE_LABELS[bits ? (binary ? "binaryBits" : "bits") : binary ? "binary" : "decimal"];
  const step = binary ? 1024 : 1000;
  let amount = Math.abs(bits ? bytes * 8 : bytes);
  let power = 0;
  while (amount >= step && power < labels.length - 1) {
    amount /= step;
    power += 1;
  }
  amount = roundReadable(amount);
  if (amount >= step && power < labels.length - 1) {
    amount = roundReadable(amount / step);
    power += 1;
  }
  const sign = bytes < 0 && amount !== 0 ? "-" : "";
  return `${sign}${amount} ${labels[power]}`;
}

/** Formats a rate in bytes per second: 1337 → "1.34 kB/s". */
export function formatRate(bytesPerSecond, { per = "s", binary = false, bits = false } = {}) {
  const seconds = PER_SECONDS[per];
  if (seconds === undefined) throw new RangeError(`Unknown period "${per}"; use s, m, h or d.`);
  return `${formatSize(bytesPerSecond * seconds, { binary, bits })}/${per}`;
}

/** Formats milliseconds as "2m" or, with long, "2 minutes". */
export function formatDuration(ms, { long = false } = {}) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    throw new TypeError(`Expected a finite number of milliseconds, got ${ms}`);
  }
  const magnitude = Math.abs(ms);
  const rung = DURATION_LADDER.find((candidate) => magnitude >= candidate.size);
  if (!rung) {
    const whole = Math.round(ms);
    return long ? `${whole} ms` : `${whole}ms`;
  }
  const count = Math.round(ms / rung.size);
  if (!long) return `${count}${rung.short}`;
  return `${count} ${rung.long}${magnitude >= rung.size * 1.5 ? "s" : ""}`;
}

/** How long moving `size` takes at `rate`, as a readable duration. */
export function eta(size, rate, options = {}) {
  const bytes = toBytes(size);
  const bytesPerSecond = toRate(rate);
  if (bytesPerSecond <= 0) throw new RangeError("Rate must be greater than zero.");
  return formatDuration((bytes / bytesPerSecond) * 1000, options);
}

/** Bytes moved at `rate` during `duration` (milliseconds or text like "1h"). */
export function budget(rate, duration) {
  const bytesPerSecond = toRate(rate);
  const ms = typeof duration === "number" ? duration : parseDuration(duration);
  if (!Number.isFinite(ms)) throw new TypeError(`Unrecognised duration: ${duration}`);
  return bytesPerSecond * (ms / 1000);
}

function toBytes(size) {
  const bytes = typeof size === "number" ? size : parseSize(size);
  if (!Number.isFinite(bytes)) throw new TypeError(`Unrecognised size: ${size}`);
  return bytes;
}

function toRate(rate) {
  const value = typeof rate === "number" ? rate : parseRate(rate);
  if (!Number.isFinite(value)) throw new TypeError(`Unrecognised rate: ${rate}`);
  return value;
}

// Three significant digits, or every integer digit when there are more.
function roundReadable(amount) {
  if (amount === 0) return 0;
  const integerDigits = Math.floor(Math.log10(amount)) + 1;
  return Number(amount.toPrecision(Math.max(3, integerDigits)));
}
