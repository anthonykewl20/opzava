# MODULE.md template

> Copy this file to `src/opzava/<layer>/<module>/MODULE.md` and fill it in. `MODULE.md` is the
> per-module context an editing AI agent (or human) reads **before** changing the module. It is the
> module's **interface** in the deep-module sense — not just the types, but the invariants, error
> modes, and harmony rules a caller or editor must know. Keep it short and current; **the code is
> truth** — where this doc and the code disagree, fix the doc.
>
> One `MODULE.md` per module: the 4 feature modules, the 6 platform modules, and the core domains
> (incl. `core/secrets`). See `docs/architecture/folder-structure.md` (the rules) and
> `docs/architecture/dependency-graph.md` (the edges).

---

<!-- agent-context: read this before editing the module -->

# &lt;module name&gt;

## Purpose
One capability this module owns. (1-3 sentences.)

## Public surface
The exact exports other code may import.
- **Feature modules**: copy the groups from `index.ts` (the barrel is truth — link it and state the
  export count).
- **Platform modules**: list from `contracts.ts` — platform modules have **no** `index.ts`;
  `contracts.ts` is the public surface. (`observability` has neither — list its public functions.)
- **Core domains**: the exported schemas / types / factories.

Anything not listed here is internal.

## Dependencies
- **Outbound** (what this imports): core only / platform only / sibling modules via public API only.
  State the layering rule that applies — see `docs/architecture/dependency-graph.md`.
- **Inbound** (who imports this): the callers an editor must not silently break.

## Invariants
Non-obvious correctness rules an editor must preserve (e.g. "every derived artifact declares ≥1
lineage input"; "sensitivity:'secret' ⇒ value must be a SecretReference").

## Harmony rules
- **Which engine** does this belong to? (opzava canonical `src/opzava` vs inherited `src/lib`. See
  ARD 0007 and `test/engine-boundary.test.mjs`.)
- **Dead-surface / dead-wired** warnings, where they apply (copy from
  `docs/architecture/system-map/92-stale-findings.md`).

## Editor guardrails
The verified findings an agent must not regress — copy the relevant entries verbatim from
`docs/architecture/system-map/92-stale-findings.md`. Each is **CONFIRMED / PARTIAL / REFUTED** with
`file:line`; do not "fix" a CONFIRMED trap without a deliberate decision.
