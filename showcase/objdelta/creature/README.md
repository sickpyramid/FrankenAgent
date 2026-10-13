# objdelta

Structural diffs and immutable patches for plain JavaScript data.

```js
import { diff, patch, summarize } from "objdelta";

const before = { user: { name: "Ada" }, tags: ["a"], legacy: true };
const after = { user: { name: "Grace" }, tags: ["a", "b"] };

const ops = diff(before, after);
// [ { op: "replace", path: ["user", "name"], value: "Grace" },
//   { op: "add",     path: ["tags", 1], value: "b" },
//   { op: "remove",  path: ["legacy"] } ]

summarize(ops);      // ["~ user.name", "+ tags[1]", "- legacy"]
patch(before, ops);  // deep-equals `after`; `before` is untouched
```

Zero dependencies. Node.js 22+.

## Guarantees

- `patch(a, diff(a, b))` deep-equals `b`.
- `patch` never mutates its inputs and never shares references with them.
- `__proto__` keys are treated as data and cannot pollute prototypes.

## API

| Function | What it does |
|---|---|
| `equal(a, b)` | Deep equality for objects, arrays, `Date`, `RegExp`, `Map`, `Set`, typed arrays and `NaN` |
| `clone(value)` | Deep, independent copy of the same types (class instances keep their prototype) |
| `diff(before, after)` | Operations `{ op: "add" \| "remove" \| "replace", path, value? }` |
| `patch(value, ops)` | Applies operations to a clone of `value` |
| `summarize(ops)` | `"~ user.name"`, `"+ tags[2]"`, `"- legacy"` |

Objects are compared key by key and arrays index by index; any other change, including a change of type, becomes a `replace`.

## CLI

```bash
objdelta before.json after.json          # readable change list, exit 1 if different
objdelta before.json after.json --json   # machine-readable operations
```

## Lineage

objdelta was grown by [ReaFuse](https://github.com/sickpyramid/ReaFuse) from two donors, without copying their code. See `LINEAGE.md`.

## License

MIT
