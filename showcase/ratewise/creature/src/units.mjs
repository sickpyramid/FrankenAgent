// Unit tables shared by the size, duration and rate helpers.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365.25 * DAY;
const MONTH = YEAR / 12;

/** Duration words (lower-case) mapped to milliseconds. */
export const DURATION_MS = new Map([
  ...["ms", "msec", "msecs", "millisecond", "milliseconds"].map((word) => [word, 1]),
  ...["s", "sec", "secs", "second", "seconds"].map((word) => [word, SECOND]),
  ...["m", "min", "mins", "minute", "minutes"].map((word) => [word, MINUTE]),
  ...["h", "hr", "hrs", "hour", "hours"].map((word) => [word, HOUR]),
  ...["d", "day", "days"].map((word) => [word, DAY]),
  ...["w", "wk", "wks", "week", "weeks"].map((word) => [word, WEEK]),
  ...["mo", "month", "months"].map((word) => [word, MONTH]),
  ...["y", "yr", "yrs", "year", "years"].map((word) => [word, YEAR]),
]);

/** Largest-first ladder used when describing a duration to people. */
export const DURATION_LADDER = [
  { size: YEAR, short: "y", long: "year" },
  { size: MONTH, short: "mo", long: "month" },
  { size: WEEK, short: "w", long: "week" },
  { size: DAY, short: "d", long: "day" },
  { size: HOUR, short: "h", long: "hour" },
  { size: MINUTE, short: "m", long: "minute" },
  { size: SECOND, short: "s", long: "second" },
];

/** Seconds in each "per" period accepted by formatRate. */
export const PER_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };

const PREFIXES = ["", "k", "m", "g", "t", "p", "e", "z", "y"];

/** Display labels for each unit family, indexed by power. */
export const SIZE_LABELS = {
  decimal: ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
  binary: ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"],
  bits: ["bit", "kbit", "Mbit", "Gbit", "Tbit", "Pbit", "Ebit", "Zbit", "Ybit"],
  binaryBits: ["bit", "Kibit", "Mibit", "Gibit", "Tibit", "Pibit", "Eibit", "Zibit", "Yibit"],
};

/**
 * Converts a size unit such as "GB", "KiB", "Mbit" or "bytes" into the number
 * of bytes it represents. Returns undefined for anything unknown.
 */
export function bytesPerUnit(unit) {
  const word = unit.toLowerCase();
  if (word === "" || word === "b" || word === "byte" || word === "bytes") return 1;
  if (word === "bit" || word === "bits") return 1 / 8;
  if (!/(b|bytes?|bits?)$/.test(word)) return undefined;

  const isBits = word.endsWith("bit") || word.endsWith("bits");
  const stem = word.replace(/bits?$/, "").replace(/(bytes?|b)$/, "");
  const binary = stem.endsWith("i");
  const prefix = binary ? stem.slice(0, -1) : stem;
  const power = PREFIXES.indexOf(prefix);
  if (prefix === "" || power < 1) return undefined;

  const bytes = (binary ? 1024 : 1000) ** power;
  return isBits ? bytes / 8 : bytes;
}
