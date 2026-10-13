import { clone, defineData, equal, hasOwn, isObjectLike, kindOf } from "./core.mjs";

export { clone, equal };

/**
 * Lists the operations that turn `before` into `after`.
 * Values inside operations are clones, so they never alias either input.
 */
export function diff(before, after) {
  const ops = [];
  compare(before, after, [], ops);
  return ops;
}

function compare(left, right, path, ops) {
  if (equal(left, right)) return;

  if (Array.isArray(left) && Array.isArray(right)) {
    const shared = Math.min(left.length, right.length);
    for (let index = 0; index < shared; index += 1) compare(left[index], right[index], [...path, index], ops);
    for (let index = shared; index < right.length; index += 1) {
      ops.push({ op: "add", path: [...path, index], value: clone(right[index]) });
    }
    // Remove from the end so earlier indices stay valid while patching.
    for (let index = left.length - 1; index >= right.length; index -= 1) ops.push({ op: "remove", path: [...path, index] });
    return;
  }

  if (isRecord(left) && isRecord(right) && Object.getPrototypeOf(left) === Object.getPrototypeOf(right)) {
    for (const key of Object.keys(left)) {
      if (hasOwn(right, key)) compare(left[key], right[key], [...path, key], ops);
      else ops.push({ op: "remove", path: [...path, key] });
    }
    for (const key of Object.keys(right)) {
      if (!hasOwn(left, key)) ops.push({ op: "add", path: [...path, key], value: clone(right[key]) });
    }
    return;
  }

  ops.push({ op: "replace", path, value: clone(right) });
}

function isRecord(value) {
  return isObjectLike(value) && kindOf(value) === "Object";
}

/** Applies operations to a deep clone of `value`; inputs are never mutated. */
export function patch(value, ops) {
  if (!Array.isArray(ops)) throw new TypeError("patch expects an array of operations.");
  return ops.reduce(applyOperation, clone(value));
}

function applyOperation(root, operation) {
  const { op, path } = operation ?? {};
  if (!["add", "remove", "replace"].includes(op)) throw new TypeError(`Unknown operation "${op}".`);
  if (!Array.isArray(path)) throw new TypeError("Every operation needs a path array.");
  if (path.length === 0) return op === "remove" ? undefined : clone(operation.value);

  const parent = locateParent(root, path);
  const key = path[path.length - 1];

  if (Array.isArray(parent)) {
    const index = Number(key);
    const limit = op === "add" ? parent.length : parent.length - 1;
    if (!Number.isInteger(index) || index < 0 || index > limit) {
      throw new RangeError(`Invalid path ${formatPath(path)}: index ${key} is out of range.`);
    }
    if (op === "add") parent.splice(index, 0, clone(operation.value));
    else if (op === "replace") parent[index] = clone(operation.value);
    else parent.splice(index, 1);
    return root;
  }

  if (op !== "add" && !hasOwn(parent, key)) throw new Error(`Invalid path ${formatPath(path)}: nothing to ${op}.`);
  if (op === "remove") delete parent[key];
  else defineData(parent, key, clone(operation.value));
  return root;
}

function locateParent(root, path) {
  let node = root;
  for (const segment of path.slice(0, -1)) {
    if (!isObjectLike(node) || !hasOwn(node, segment)) {
      throw new Error(`Invalid path ${formatPath(path)}: "${segment}" does not exist.`);
    }
    node = node[segment];
  }
  if (!isObjectLike(node)) throw new Error(`Invalid path ${formatPath(path)}: parent is not an object.`);
  return node;
}

/** Human-readable change lines: "~ user.name", "+ tags[2]", "- legacy". */
export function summarize(ops) {
  const symbols = { add: "+", remove: "-", replace: "~" };
  return ops.map((operation) => `${symbols[operation.op] ?? "?"} ${formatPath(operation.path)}`);
}

export function formatPath(path) {
  if (path.length === 0) return "(root)";
  return path
    .map((segment, index) => {
      if (typeof segment === "number") return `[${segment}]`;
      if (/^[A-Za-z_$][\w$]*$/.test(segment)) return index === 0 ? segment : `.${segment}`;
      return `[${JSON.stringify(segment)}]`;
    })
    .join("");
}
