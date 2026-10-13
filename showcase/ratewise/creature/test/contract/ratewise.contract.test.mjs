import test from "node:test";
import assert from "node:assert/strict";
import { parseSize, parseRate, formatSize, formatRate, eta, budget } from "../../src/index.mjs";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, Math.abs(expected)), `${actual} ≉ ${expected}`);

test("parseSize reads decimal units", () => {
  assert.equal(parseSize("1.5 GB"), 1_500_000_000);
  assert.equal(parseSize("1 kB"), 1000);
});

test("parseSize reads binary units", () => {
  assert.equal(parseSize("2 KiB"), 2048);
  assert.equal(parseSize("1 MiB"), 1_048_576);
});

test("parseSize converts bits to bytes", () => {
  assert.equal(parseSize("100 Mbit"), 12_500_000);
});

test("parseSize treats a bare number as bytes", () => {
  assert.equal(parseSize("100"), 100);
});

test("parseSize returns NaN for unrecognised text", () => {
  assert.ok(Number.isNaN(parseSize("banana")));
});

test("parseRate reads per-second rates", () => {
  assert.equal(parseRate("5 MB/s"), 5_000_000);
  assert.equal(parseRate("100 Mbit/s"), 12_500_000);
});

test("parseRate understands duration units like ms does", () => {
  close(parseRate("20 GB/day"), 20e9 / 86_400);
  close(parseRate("1 KiB/min"), 1024 / 60);
  assert.equal(parseRate("3600 kB/h"), 1000);
});

test("parseRate returns NaN without a time unit or for nonsense", () => {
  assert.ok(Number.isNaN(parseRate("5 MB")));
  assert.ok(Number.isNaN(parseRate("fast")));
});

test("formatSize uses 3 significant digits and decimal units", () => {
  assert.equal(formatSize(1337), "1.34 kB");
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(999), "999 B");
});

test("formatSize supports binary and bit units", () => {
  assert.equal(formatSize(1024, { binary: true }), "1 KiB");
  assert.equal(formatSize(125_000, { bits: true }), "1 Mbit");
});

test("formatRate formats bytes per second", () => {
  assert.equal(formatRate(1337), "1.34 kB/s");
  assert.equal(formatRate(12_500_000, { bits: true }), "100 Mbit/s");
});

test("formatRate can express the rate per day", () => {
  assert.equal(formatRate(20e9 / 86_400, { per: "d" }), "20 GB/d");
});

test("eta gives a short duration for text inputs", () => {
  assert.equal(eta("3 GB", "25 MB/s"), "2m");
  assert.equal(eta("500 MB", "100 Mbit/s"), "40s");
});

test("eta gives a long duration on request", () => {
  assert.equal(eta("3 GB", "25 MB/s", { long: true }), "2 minutes");
});

test("eta accepts raw numbers (bytes and bytes per second)", () => {
  assert.equal(eta(1000, 1), "17m");
  assert.equal(eta(1, 1000), "1ms");
});

test("eta rejects a zero rate", () => {
  assert.throws(() => eta("1 GB", 0), RangeError);
});

test("budget multiplies a rate by a duration", () => {
  assert.equal(budget("10 MB/s", "1h"), 36_000_000_000);
  assert.equal(budget(1000, 60_000), 60_000);
});

test("budget output reads naturally through formatSize", () => {
  assert.equal(formatSize(budget("100 Mbit/s", "1h")), "45 GB");
});
