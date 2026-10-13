import test from "node:test";
import assert from "node:assert/strict";

import { formatDuration, formatRate, formatSize, parseDuration, parseRate, parseSize } from "../src/index.mjs";

test("parseSize accepts lower-case and spelled-out units", () => {
  assert.equal(parseSize("3 gb"), 3e9);
  assert.equal(parseSize("12 bytes"), 12);
  assert.equal(parseSize("8 bits"), 1);
});

test("parseSize rejects bare SI prefixes without a byte or bit unit", () => {
  assert.ok(Number.isNaN(parseSize("100 m")));
});

test("parseRate accepts 'per' and periods with their own amount", () => {
  assert.equal(parseRate("60 MB per minute"), 1_000_000);
  assert.equal(parseRate("1 GB / 2s"), 500_000_000);
});

test("parseDuration covers the duration vocabulary", () => {
  assert.equal(parseDuration("1.5h"), 5_400_000);
  assert.equal(parseDuration("2 Weeks"), 1_209_600_000);
  assert.ok(Number.isNaN(parseDuration("soon")));
});

test("formatDuration pluralises from 1.5 units", () => {
  assert.equal(formatDuration(3_600_000 * 1.4, { long: true }), "1 hour");
  assert.equal(formatDuration(3_600_000 * 1.5, { long: true }), "2 hours");
  assert.equal(formatDuration(250, { long: true }), "250 ms");
});

test("formatSize promotes the unit when rounding reaches the next step", () => {
  assert.equal(formatSize(999_999), "1 MB");
  assert.equal(formatSize(-1337), "-1.34 kB");
});

test("formatRate rejects unknown periods", () => {
  assert.throws(() => formatRate(1, { per: "fortnight" }), RangeError);
});
