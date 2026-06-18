# Opzava Golden Principles

Golden principles are opinionated mechanical rules that preserve human taste and keep future agent runs from compounding entropy.

## Architecture

- Generated code must have utter simplicity.
- No MVP-grade implementation shortcuts.
- Product-facing surfaces use `Opzava`, never `Mission Control`.
- Keep the durable runner, contracts, providers, approvals, audit, costs, workflow steps, configuration, and UI concerns separate.
- Prefer explicit state machines over scattered conditional workflow policy.
- Prefer shared contract modules over hand-rolled local shapes.
- Do not build shallow modules with complex interfaces and little behavior.
- Do not create new top-level folders without updating the folder-structure contract.
- Do not create new source folders unless `docs/architecture/folder-structure.md` explicitly allows them.
- Feature modules own their contracts, application services, workflow steps, UI, tests, and fixtures.
- Route handlers, pages, and panel files are adapters; they do not own workflow policy or persistence policy.
- Do not add broad abstractions before two real use cases prove the seam.
- Do not let the upstream Mission Control generic task model become the Opzava artifact model.

## Data And Boundaries

- Validate boundaries with schemas or typed SDKs. Do not probe data YOLO-style.
- Persist provider responses that downstream steps depend on.
- Preserve source provenance for generated content.
- Use idempotency keys for jobs and external actions.
- Treat prompts, logs, and agent memory as evidence, not source of truth.

## Secrets And Configuration

- No hard-coded secrets, API keys, tokens, passwords, provider URLs, model names, workflow limits, or operator-tunable settings in source code.
- Provider credentials belong in admin settings backed by safe secret storage or environment-provided secret references.
- Operator-controlled variables belong in admin settings with typed config validation, defaults where safe, audit events, and secret redaction.
- Source code may define config schema, validation rules, and safe defaults. It must not define real secret values.
- Logs, artifacts, benchmarks, discovery notes, and tests must never expose cleartext secrets.

## Testing

- Use red-green-refactor for new behavior and bug fixes.
- Add contract tests before runner or workflow code depends on a new artifact shape.
- Add failure injection tests for retries, timeouts, malformed provider responses, and process restarts.
- Add approval-blocking tests before any external side effect is wired live.
- Add duplicate-action tests before WordPress draft creation or future email sending.
- Add configuration tests proving missing, invalid, or redacted secret references behave safely.

## Complexity

- Choose the smallest correct design that satisfies the current tested requirement.
- Anchor every feature slice to the full production spec before coding.
- Keep functions small enough to explain without tracing unrelated concerns.
- Keep functions and modules singular in purpose.
- Prefer direct readable code over clever abstractions.
- Do not create base classes, factories, registries, or generic helpers before real use cases prove the need.
- Avoid deep nesting and broad switch statements in business policy.
- Move repeated policy decisions into named state transitions.
- Reject misleading names. Names must disclose state mutation, scheduling, provider calls, configuration reads, and audit creation.
- Remove dead code and unused abstractions quickly.

## Content Quality

- Do not accept generic AI slop as a final artifact.
- Generated content must identify the product as `Opzava` when naming the app.
- Require source capture before SEO brief, draft, fact check, and brand review steps depend on claims.
- Require fact-check output before human approval.
- Require brand-review output before WordPress draft creation.
- Preserve a distinct brand voice instead of formulaic generated prose.

## Garbage Collection

- Run recurring scans for drift.
- Convert repeated bad patterns into tests, lint rules, docs, or cleanup tasks.
- Prefer small targeted refactors over large cleanup bursts.
- Track quality grades for core areas once the implementation exists.
- Treat accepted shortcuts as temporary debt with an owner and removal trigger.
