// Value inspection, equality and cloning: the two inherited organs.

export const kindOf = (value) => Object.prototype.toString.call(value).slice(8, -1);

export const isObjectLike = (value) => typeof value === "object" && value !== null;

export const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function bytesOf(view) {
  return view instanceof ArrayBuffer ? new Uint8Array(view) : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function sameBytes(left, right) {
  const a = bytesOf(left);
  const b = bytesOf(right);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function findMatchingKey(map, wanted) {
  if (map.has(wanted)) return { found: true, key: wanted };
  for (const key of map.keys()) {
    if (equal(key, wanted)) return { found: true, key };
  }
  return { found: false };
}

/** Deep structural equality. NaN equals NaN; prototypes must match. */
export function equal(a, b) {
  if (a === b) return true;
  if (!isObjectLike(a) || !isObjectLike(b)) return a !== a && b !== b;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  switch (kindOf(a)) {
    case "Date":
      return a.getTime() === b.getTime();
    case "RegExp":
      return a.source === b.source && a.flags === b.flags;
    case "Array":
      return a.length === b.length && a.every((item, index) => equal(item, b[index]));
    case "Map":
      if (a.size !== b.size) return false;
      for (const [key, value] of a) {
        const match = findMatchingKey(b, key);
        if (!match.found || !equal(value, b.get(match.key))) return false;
      }
      return true;
    case "Set":
      if (a.size !== b.size) return false;
      for (const item of a) {
        if (!b.has(item) && ![...b].some((other) => equal(item, other))) return false;
      }
      return true;
    case "ArrayBuffer":
    case "DataView":
      return sameBytes(a, b);
    default:
      break;
  }
  if (ArrayBuffer.isView(a)) return sameBytes(a, b);

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => hasOwn(b, key) && equal(a[key], b[key]));
}

/** Deep, independent copy. Own "__proto__" keys are copied as plain data. */
export function clone(value) {
  if (!isObjectLike(value)) return value;

  switch (kindOf(value)) {
    case "Date":
      return new Date(value.getTime());
    case "RegExp": {
      const copy = new RegExp(value.source, value.flags);
      copy.lastIndex = value.lastIndex;
      return copy;
    }
    case "Array":
      return Array.from(value, clone);
    case "Map":
      return new Map(Array.from(value, ([key, item]) => [clone(key), clone(item)]));
    case "Set":
      return new Set(Array.from(value, clone));
    case "ArrayBuffer":
      return value.slice(0);
    case "DataView":
      return new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength);
    default:
      break;
  }
  if (ArrayBuffer.isView(value)) return value.slice();

  const copy = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) defineData(copy, key, clone(value[key]));
  return copy;
}

/** Sets a property without ever triggering setters such as __proto__. */
export function defineData(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}
