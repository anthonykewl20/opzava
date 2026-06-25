# Type-level invariants — making agent mistakes unrepresentable

> How we keep this codebase easy for AI agents to extend with **fewer mistakes and easy debugging**. The lever is plain TypeScript that **forbids the wrong thing at compile time** — not a framework.

## Why this, and explicitly not Effect (or any effect-system)

The goal is: AI agents extend the app *correctly, with fewer mistakes, and debug it easily*. We evaluated **Effect** (effect.website) against that goal and **rejected it** — recorded here so it isn't re-litigated:

- **Agents fumble niche dialects.** LLM reliability tracks training-data prevalence. `async/await` + discriminated unions are in millions of repos; Effect's `Effect.gen`/`pipe`/`Layer`/tagged-errors are in a handful. Agents hallucinate Effect APIs and write non-idiomatic effect code *far more* than they "forget an error" in plain TS → **more** mistakes, not fewer.
- **Effect-graphs are harder to debug** than a linear call stack (fiber/generator traces are opaque). That is the opposite of "easy debugging".
- **It colors the codebase** (~all-or-nothing, like `async`) over a **159K-LOC feature-complete fork** with **298 `getDatabase()` singletons** and a **synchronous** DB (better-sqlite3) — enormous cost for marginal benefit, most of which we already have (durable DB-backed retry via `attempts`/`dead_letters`; audit/event observability).
- The one real benefit — errors in the signature — we get from **discriminated-union result types in plain TS**, without the fluency tax.

**Conclusion: boring, explicit, typed-tight code _is_ the agent-friendly code.** Make the agent's most likely mistake a **compile error or a red test**.

## When to apply (proportionality)

Apply on **high-stakes modules** — anything with a "never do X" rule: auth/security, money/cost, the engine boundary, state machines, anything irreversible or externally visible. **Do not** type-gymnastic trivial CRUD — over-engineered types are themselves agent-hostile complexity (Critical Constraint #2 rejects over-engineering). For ordinary code, plain types + a `zod` parse at the boundary suffice.

## The toolkit (each: the mistake it prevents → the technique)

1. **Skipping a case** → **discriminated union + `assertNever`.** A new `kind` breaks compilation at every `switch (default: return assertNever(x))`.
2. **Illegal combinations** → **welded per-variant payload + action.** Each `kind` carries only its valid fields/action, so `{ kind: 'approval', action: { op: 'select' } }` won't type-check.
3. **Calling the unguarded path** → **hide the dangerous primitive.** Don't export a bare `verify`; export only the safe composed intent (`completeChallenge`) that runs the guard. The agent literally cannot reach the unsafe primitive.
4. **Forged / under-filled values** → **branded/opaque types + non-empty tuples.** `type Challenge = string & { readonly __brand: 'Challenge' }`; `variantIds: readonly [string, string, ...string[]]` ("≥2").
5. **Silent data drift** → **`.strict()` zod parse at every SQL/HTTP boundary.** Reject unknown keys + cross-check with `superRefine`, so DB/request data is welded to the types at runtime, not just at compile time.
6. **Unhandled failures** → **result types over thrown errors.** Put the error in the return (`{ ok: false; reason } | { ok: true; … }`); the agent must branch on it. (This is the Effect benefit, minus Effect.)
7. **Heisenbugs + hard debugging** → **pure functions + injected `now`/`window`.** No ambient clock/DB → deterministic, unit-testable with literal inputs; a bug localizes to one pure function.
8. **The regression that slips past types** → **a per-module "shape" contract test.** A static test asserting the invariant (no dangerous export, the rule localized to one statement) → an agent who breaks it fails CI.

## The process (one pass per high-stakes module)

1. `/grilling` → `/codebase-design` (design-it-twice) — settle the interface.
2. Ask the one question that matters: **"what is the #1 thing an agent could get wrong here — and how do I make it a compile error or a red test?"**
3. Encode the invariant with the toolkit; record it in the ARD's *Deep-module design* section.
4. Add the shape contract test.

**Worked examples** (this is how ARDs 0016/0018/0020/0021/0024 were designed, not theory):
- **2FA (0018)** — no public bare `verify`; the only verify is `completeChallenge`, which always runs lockout → challenge → replay-guard in order.
- **LinkedTool (0021)** — compiler-enforced state ceiling: `LiveHeartbeatState = Extract<ToolState,'connected'|'disconnected'|'not_linked'>` excludes `active`, so a CLI adapter returning `active` is a `tsc` error.
- **Needs-you (0024)** — welded row-union (`approval` can't carry a `select` action) + `assertNever` exhaustiveness + a `superRefine` that welds payload↔action at the SQL boundary.
- **user-profile (0020)** — a `.strict()` overlay that structurally cannot hold identity fields (`display_name`/`email`/`avatar`), so the Engine-A/Engine-B split can't be violated by accident.

See also: `docs/golden-principles.md` (mechanical repo rules), `docs/architecture/dependency-graph.md` + `system-map/` (navigability), and the `codebase-design` / `grilling` skills.
