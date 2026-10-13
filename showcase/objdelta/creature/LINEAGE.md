# IT'S ALIVE

**objdelta** — Structural diffs and immutable patches for plain JavaScript data.

## Donors

| | Donor | Commit | License | Gate |
|---|---|---|---|---|
| A | [dequal](https://github.com/lukeed/dequal) | `37c21f675c` | MIT | ✅ MIT is permissive. |
| B | [klona](https://github.com/lukeed/klona) | `e563341d88` | MIT | ✅ MIT is permissive. |

## The creature

Compute exactly what changed between two values as a list of path-addressed operations, replay those operations on a value without mutating it, and print them for humans. Useful for undo/redo, audit logs, syncing state and readable test failures.

- **Inherited from A:** deep-equal, special-objects
- **Inherited from B:** deep-clone, clone-builtins
- **Born from the fusion:** diff/patch: equality tells where values differ, cloning makes the patched result independent. Round-trip guarantee: patch(a, diff(a, b)) equals b, and a is untouched.

### API

- `equal(a: unknown, b: unknown): boolean` — Deep equality for objects, arrays, Date, RegExp, Map, Set and NaN.
- `clone<T>(value: T): T` — Deep, independent copy including Date, RegExp, Map and Set.
- `diff(before: unknown, after: unknown): Array<{ op: 'add'|'remove'|'replace', path: Array<string|number>, value?: unknown }>` — Operations that turn before into after. Object keys follow before's order, then new keys; extra array items are added in order or removed from the end.
- `patch<T>(value: T, ops: Op[]): T` — Applies operations to a deep clone of value. Never mutates its inputs; inserted values are cloned.
- `summarize(ops: Op[]): string[]` — Human-readable lines: '~ user.name', '+ tags[2]', '- legacy'.

### CLI

```bash
objdelta before.json after.json
objdelta before.json after.json --json
```

## Verification

- Sandbox: node --permission (read-only creature folder, no child processes, no writes)
- Lab contract: **17/17** passed
- Creature's own tests: **6/6** passed
- Attempts: grow → ALIVE

### Contract lineage

| Test | Origin |
|---|---|
| equal compares nested objects and arrays | A |
| equal handles Date, RegExp and NaN | A |
| equal handles Map and Set | A |
| clone makes an independent deep copy | B |
| clone preserves Date, RegExp, Map and Set | B |
| clone returns primitives unchanged | B |
| diff of equal values is empty | fusion |
| diff reports replace, add and remove with paths | fusion |
| diff descends into nested objects | fusion |
| diff handles growing and shrinking arrays | fusion |
| diff replaces values whose type changes, including at the root | fusion |
| diff compares Dates by value | fusion |
| patch applies operations without mutating its input | fusion |
| patch(a, diff(a, b)) reproduces b | fusion |
| patch clones inserted values | fusion |
| patch rejects a path through a missing parent | fusion |
| summarize prints readable change lines | fusion |

## Clean-room originality scan

- Fingerprint overlap with donor code: **0.0%** (limit 15%)
- Longest shared token run: **0** (limit 60)
- Result: ✅ original

## Provenance

- Run: `202610131250-dequal-x-klona-5fb6`
- ReaFuse 0.1.0 · REA 6.4.0 · brain: handoff
- Certificate: `a543ade9fb45ae631d09d2d153b757ca9f0f4db76602d5fb473eafecd24bd30e`

Behavior was learned from the donors; no donor code was copied or executed. Donors keep their own licenses and credit.
