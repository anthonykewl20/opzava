# 0038: Content Module: Idea Intake Contract

Date: 2026-06-16
Status: Draft
Thread: Opening the content workflow module with its first artifact contract before any step logic.

## Hook

After eleven slices building a durable, exactly-once execution substrate, this is the first line of the actual product: the structured idea that a content workflow starts from.

## Product Stakes

The execution substrate (slices 0027 through 0037) can run a provider action exactly once, durably, and safely. But it had nothing to run. The content workflow is the first department that gives it work.

Per the project's layering, a feature module defines its data contracts before its behavior. This slice introduces the content module and its input artifact, so every later step has a typed, validated thing to begin from rather than a loose bag of fields.

## Industry Counterfactual

The common shortcut is to start a content pipeline from a free-text prompt and let each step reinterpret it.

That makes the idea unvalidatable and untraceable: there is no schema to check, no version to migrate, no lineage to follow.

Opzava makes the idea a versioned artifact from the first keystroke.

## What We Built

We created the content module root `src/opzava/modules/content/` with a public `index.ts`, and its first artifact contract `IdeaIntake`.

The contract:

- is a versioned, strict zod schema (`IDEA_INTAKE_SCHEMA_VERSION`)
- carries an idea id, title, topic, an optional target keyword and audience, the requester, and a creation timestamp
- rejects unknown fields, empty required strings, and unexpected schema versions
- exposes `parseIdeaIntake`, which returns a frozen value
- has no providers, runner, or side effects

The module exposes its public API through `index.ts` only, following the feature-module contract in `docs/architecture/folder-structure.md`.

## What We Refused To Fake

We did not add step logic, providers, or a runner; this slice is contract-only.

We did not accept a free-text idea; the intake is a strict, versioned schema.

We did not invent fields the workflow does not yet need; optional targeting fields stay optional.

We did not create a new top-level folder; the module lives under `src/opzava/modules/`, and the folder-structure gate still passes.

## Evidence

Files changed:

- `src/opzava/modules/content/contracts/idea-intake.ts`
- `src/opzava/modules/content/contracts/idea-intake.test.ts`
- `src/opzava/modules/content/index.ts`
- `test/check-plan.test.mjs`

The tests cover:

- a fully specified idea intake parses, including optional fields
- an idea intake without optional targeting fields parses
- a missing required field, an unknown field, an empty title, and a wrong schema version are rejected
- the parsed result is frozen and deterministic

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run idea-intake.test.ts: passed 7/7 (failed before implementation: module missing)
node --test test/check-plan.test.mjs: passed 48/48
node --test test/folder-structure.test.mjs: passed 2/2 (no new top-level entry)
node_modules/.bin/tsc --noEmit (typecheck): passed
eslint src/opzava/modules/content: passed with 0 errors
node --test test/*.test.mjs: passed 58/58
vitest run (full suite): passed 139 files / 1298 tests
```

This is a single pure contract mirroring the existing artifact contract style, so a council pass was not run; the schema's accept and reject behavior is fully covered by tests.

## The Automation Lesson

A workflow is only as trustworthy as its inputs. Making the very first input a validated, versioned artifact means every downstream step inherits a guarantee instead of a guess.

## Next Case Study Thread

The next build thread should add the next content artifact in the Layer 6 build order:

- a topic-and-keyword research artifact whose content references the originating idea via lineage
- the research artifact stays mock-provider-shaped, validated, and versioned, with no live calls
- step logic still comes after the contracts, per the feature-module discipline
- the content workflow will later run these artifacts through the existing durable runner and exactly-once boundary on mock providers
