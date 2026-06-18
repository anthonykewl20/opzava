# Opzava Code Simplicity Gate

Generated code must have utter simplicity.

Simple does not mean MVP-grade. Every accepted slice must also satisfy `docs/architecture/production-grade-complexity.md`.

This is a hard engineering gate for `opzava`, not a style preference. The system is meant to grow across content, outreach, reporting, approvals, integrations, and operations. That growth only stays safe if the code remains easy to read, easy to test, easy to replace, and hard to misuse.

## Prime Rule

Choose the simplest design that satisfies the current tested requirement.

Do not add abstraction for imagined future needs. Do not make code clever. Do not create general-purpose machinery when a small direct function is enough.

## Smallest Correct Design

- Build the smallest vertical slice that passes the failing test.
- Prefer one clear function over a cluster of wrappers.
- Prefer a plain object or typed schema over a class hierarchy unless behavior requires the class.
- Prefer explicit code over reflection, dynamic dispatch, magic registries, or hidden conventions.
- Prefer deleting an abstraction over explaining it.
- Do not add configuration switches until an actual operator need exists.

## Singular Purpose

- A module owns one capability.
- A function performs one operation at one level of abstraction.
- A route handler handles HTTP boundaries and delegates behavior.
- A workflow step transforms validated inputs into one validated output or scheduled side effect request.
- A provider adapter talks to one provider contract.
- An admin config service validates settings; it does not run workflow policy.

If a function name needs `and`, split it or rename the actual single responsibility.

## No Premature Abstraction

- Do not create base classes for one implementation.
- Do not create factories for one concrete type.
- Do not create generic helpers before two real call sites prove the invariant.
- Do not create catch-all service layers.
- Do not create extension points before the first module proves the seam.
- Do not make the content module generic for future outreach work before outreach has real requirements.

Duplication is allowed temporarily when the shared abstraction is not obvious. Wrong abstraction is more expensive than small local duplication.

## Readability Over Cleverness

- Use boring names that describe business meaning.
- Use direct control flow.
- Avoid nested conditionals by returning early or extracting a named decision.
- Avoid implicit side effects.
- Avoid clever TypeScript that hides data shape or control flow.
- Add comments only for non-obvious decisions, invariants, or tradeoffs.
- A reviewer should understand the code without reconstructing hidden context from five files.

## Modularity And Composability

- Keep feature logic inside `src/opzava/modules/<feature>/`.
- Keep cross-feature infrastructure inside `src/opzava/platform/`.
- Keep framework-independent primitives inside `src/opzava/core/`.
- Compose modules through public `index.ts` APIs, not deep imports.
- Keep Next.js route handlers, pages, and panels as adapters.
- Keep client components at the leaves.

## Simplicity Review Checklist

Before generated code is accepted, answer yes to all applicable checks:

- Does this solve the current tested requirement and nothing speculative?
- Can the main behavior be explained in one sentence?
- Does each function do one thing?
- Does each module have one reason to change?
- Are names specific and honest about side effects?
- Are state transitions explicit rather than hidden in conditionals?
- Are provider calls, database writes, admin config reads, secret resolution, audit events, and cost events visible at service boundaries?
- Could a simpler plain function replace a class, factory, registry, generic, or abstraction?
- Can this be tested without mocking half the system?
- Would deleting this abstraction make the code easier to understand?

If any answer is no, simplify before continuing.

## Complexity Triggers

These patterns require refactor, a discovery note, or an ARD before they spread:

- Deep nesting.
- Large switch statements for business policy.
- Boolean flags that change unrelated behaviors.
- Functions that validate, mutate, call providers, and write audit events all at once.
- Generic names such as `manager`, `handler`, `processor`, `service`, `helper`, or `utils` without a precise domain noun.
- New abstractions with only one implementation.
- Cross-module deep imports.
- Route handlers or React components that own workflow policy.

## Generated Code Rule

AI-generated code is not accepted because it works once. It is accepted only when it is simple enough for future agents and humans to safely change.

Generated code that is overly generic, clever, broad, deeply nested, hard to name, or hard to test must be simplified before it becomes part of the codebase.
