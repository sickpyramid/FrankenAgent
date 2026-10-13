import test from "node:test";
import assert from "node:assert/strict";
import { equal, clone, diff, patch, summarize } from "../../src/index.mjs";

test("equal compares nested objects and arrays", () => {
  assert.equal(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
  assert.equal(equal({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(equal([], {}), false);
});

test("equal handles Date, RegExp and NaN", () => {
  assert.equal(equal(new Date(0), new Date(0)), true);
  assert.equal(equal(/x/g, /x/g), true);
  assert.equal(equal(/x/g, /x/i), false);
  assert.equal(equal(NaN, NaN), true);
});

test("equal handles Map and Set", () => {
  assert.equal(equal(new Map([["k", { v: 1 }]]), new Map([["k", { v: 1 }]])), true);
  assert.equal(equal(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(equal(new Set([1]), new Set([2])), false);
});

test("clone makes an independent deep copy", () => {
  const source = { a: { b: [1, 2] } };
  const copy = clone(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy.a, source.a);
  assert.notEqual(copy.a.b, source.a.b);
});

test("clone preserves Date, RegExp, Map and Set", () => {
  const date = clone(new Date(5));
  assert.ok(date instanceof Date);
  assert.equal(date.getTime(), 5);
  const regex = clone(/a/gi);
  assert.equal(regex.source, "a");
  assert.equal(regex.flags, "gi");
  const inner = { v: 1 };
  const map = clone(new Map([["k", inner]]));
  assert.deepEqual(map.get("k"), inner);
  assert.notEqual(map.get("k"), inner);
  assert.deepEqual(clone(new Set([1, 2])), new Set([1, 2]));
});

test("clone returns primitives unchanged", () => {
  assert.equal(clone(5), 5);
  assert.equal(clone("s"), "s");
  assert.equal(clone(null), null);
});

test("diff of equal values is empty", () => {
  assert.deepEqual(diff({ a: 1, d: new Date(0) }, { a: 1, d: new Date(0) }), []);
});

test("diff reports replace, add and remove with paths", () => {
  assert.deepEqual(diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }), [
    { op: "replace", path: ["b"], value: 3 },
    { op: "add", path: ["c"], value: 4 },
  ]);
  assert.deepEqual(diff({ a: 1, b: 2 }, { a: 1 }), [{ op: "remove", path: ["b"] }]);
});

test("diff descends into nested objects", () => {
  assert.deepEqual(diff({ user: { name: "A", age: 3 } }, { user: { name: "B", age: 3 } }), [
    { op: "replace", path: ["user", "name"], value: "B" },
  ]);
});

test("diff handles growing and shrinking arrays", () => {
  assert.deepEqual(diff({ t: [1, 2] }, { t: [1, 2, 3] }), [{ op: "add", path: ["t", 2], value: 3 }]);
  assert.deepEqual(diff({ t: [1, 2, 3] }, { t: [1] }), [
    { op: "remove", path: ["t", 2] },
    { op: "remove", path: ["t", 1] },
  ]);
});

test("diff replaces values whose type changes, including at the root", () => {
  assert.deepEqual(diff({ a: [1] }, { a: { 0: 1 } }), [{ op: "replace", path: ["a"], value: { 0: 1 } }]);
  assert.deepEqual(diff(1, 2), [{ op: "replace", path: [], value: 2 }]);
});

test("diff compares Dates by value", () => {
  assert.deepEqual(diff({ d: new Date(0) }, { d: new Date(1) }), [{ op: "replace", path: ["d"], value: new Date(1) }]);
});

test("patch applies operations without mutating its input", () => {
  const before = { a: 1, list: [1] };
  const after = patch(before, [
    { op: "replace", path: ["a"], value: 2 },
    { op: "add", path: ["list", 1], value: 2 },
  ]);
  assert.deepEqual(after, { a: 2, list: [1, 2] });
  assert.deepEqual(before, { a: 1, list: [1] });
});

test("patch(a, diff(a, b)) reproduces b", () => {
  const pairs = [
    [{ a: 1, b: { c: [1, 2, 3] } }, { a: 2, b: { c: [1, 5] }, d: "new" }],
    [{ list: [{ id: 1 }, { id: 2 }] }, { list: [{ id: 1, tag: "x" }] }],
    [{ keep: true, drop: { deep: 1 } }, { keep: true }],
    [[1, 2], { not: "an array" }],
  ];
  for (const [a, b] of pairs) assert.deepEqual(patch(a, diff(a, b)), b);
});

test("patch clones inserted values", () => {
  const value = { deep: { x: 1 } };
  const out = patch({}, [{ op: "add", path: ["v"], value }]);
  assert.deepEqual(out.v, value);
  assert.notEqual(out.v, value);
  assert.notEqual(out.v.deep, value.deep);
});

test("patch rejects a path through a missing parent", () => {
  assert.throws(() => patch({ a: 1 }, [{ op: "replace", path: ["missing", "x"], value: 1 }]), /path/);
});

test("summarize prints readable change lines", () => {
  assert.deepEqual(
    summarize([
      { op: "replace", path: ["user", "name"], value: "B" },
      { op: "add", path: ["tags", 2], value: "x" },
      { op: "remove", path: ["legacy"] },
    ]),
    ["~ user.name", "+ tags[2]", "- legacy"],
  );
});
