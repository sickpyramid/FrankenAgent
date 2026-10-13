import test from "node:test";
import assert from "node:assert/strict";

import { clone, diff, equal, formatPath, patch } from "../src/index.mjs";

test("equal compares typed arrays and buffers by bytes", () => {
  assert.equal(equal(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(equal(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(equal(new Uint8Array([1]).buffer, new Uint8Array([1]).buffer), true);
});

test("clone keeps class prototypes", () => {
  class Point {
    constructor(x) {
      this.x = x;
    }
  }
  const copy = clone(new Point(3));
  assert.ok(copy instanceof Point);
  assert.equal(copy.x, 3);
});

test("clone and patch never let __proto__ keys pollute prototypes", () => {
  const hostile = JSON.parse('{"__proto__": {"polluted": true}}');
  const copy = clone(hostile);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  const patched = patch({}, [{ op: "add", path: ["__proto__"], value: { polluted: true } }]);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(patched), ["__proto__"]);
});

test("patch removes array items and rejects out-of-range indices", () => {
  assert.deepEqual(patch([1, 2, 3], [{ op: "remove", path: [1] }]), [1, 3]);
  assert.throws(() => patch([1], [{ op: "replace", path: [5], value: 0 }]), RangeError);
});

test("diff of Maps replaces the whole Map", () => {
  const ops = diff({ m: new Map([["a", 1]]) }, { m: new Map([["a", 2]]) });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "replace");
});

test("formatPath quotes keys that are not identifiers", () => {
  assert.equal(formatPath(["a b", 0, "ok"]), '["a b"][0].ok');
  assert.equal(formatPath([]), "(root)");
});
