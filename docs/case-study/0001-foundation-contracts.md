# 0001: Foundation Contracts Before Runner Code

Date: 2026-06-15
Status: Draft
Thread: Building Opzava as a serious automation tool, not a fragile agent demo.

## Hook

Most automation tools show the happy path first.

We started by making the unhappy paths explicit.

Before Opzava runs a content workflow, calls a provider, creates a WordPress draft, or lets an agent write anything important, it now has contracts for the things that usually break automation systems: credentials, workflow states, artifacts, approvals, provider boundaries, and invalid transitions.

That is less flashy than a demo button. It is also the reason the demo button can eventually be trusted.

## Product Stakes

Opzava is being built as an automation control plane for AI-powered operations. The first workflow is content creation, but the bigger product needs to coordinate research, writing, review, approvals, publishing, outreach, costs, and failures from one dashboard.

The dangerous shortcut would be obvious: wire a few agents together, call it a workflow, and celebrate the first generated draft.

We did the opposite. We made the system define what must be true before any runner code or live provider adapter can depend on it.

## What We Built

We added the first Opzava contract layer under `src/opzava/`.

The foundation now includes:

- `AdminConfig` and `SecretReference` contracts so credentials and operator settings do not become random strings in source code.
- Secret resolution failure contracts so missing credentials are typed failures, not opaque runtime crashes.
- Provider profile contracts so mock providers can run safely, while live providers require secret references.
- Workflow definition contracts with explicit step graphs.
- Workflow run and step run state transitions.
- Cycle detection so invalid workflow graphs are rejected before execution.
- Artifact contracts with schema version, validation state, source step, and lineage.
- Artifact payload protection that rejects secret references inside stored content.
- Approval contracts so external actions are blocked until an explicit decision grants them.

## Why This Matters

In an AI automation product, the hardest bugs do not come from one bad prompt. They come from missing system boundaries.

Without these contracts:

- A workflow can loop forever because its graph contains a cycle.
- A failed step can look indistinguishable from a blocked step.
- A draft can appear without traceable source artifacts.
- A provider can silently depend on an ambient API key.
- An approval can be treated as granted just because a record exists.
- A secret can leak into an artifact, log, or audit trail.

Opzava is being built so those classes of mistakes are rejected early.

## Industry Counterfactual

The typical fragile automation demo starts with a chain: prompt in, generated draft out, maybe a webhook at the end.

That can look impressive for five minutes. Then the real questions arrive.

What happens when a step fails halfway through? What proves the draft came from trusted sources? What stops an external action from running twice? Where did the API key come from? Who approved the final side effect? Can the system replay only the failed part, or does it rerun everything and hope?

Opzava is being built from the opposite direction. The first visible win is not a generated article. The first visible win is a foundation that says: before any automation is trusted, its states, artifacts, credentials, provider boundaries, and approvals must be explicit.

The repo evidence is concrete: the workflow contract rejects invalid graphs, artifacts require lineage, provider profiles require `SecretReference` for live credentials, and approvals do not grant side effects until explicitly approved.

## Evidence

Core contract files added:

- `src/opzava/platform/admin-config/contracts.ts`
- `src/opzava/platform/providers/contracts.ts`
- `src/opzava/core/workflows/contracts.ts`
- `src/opzava/core/artifacts/contracts.ts`
- `src/opzava/core/approvals/contracts.ts`

Contract tests added:

- `src/opzava/platform/admin-config/contracts.test.ts`
- `src/opzava/platform/providers/contracts.test.ts`
- `src/opzava/core/workflows/contracts.test.ts`
- `src/opzava/core/artifacts/contracts.test.ts`
- `src/opzava/core/approvals/contracts.test.ts`

Supporting discovery and governance:

- `docs/discovery/0003-inherited-config-and-secret-inventory.md`
- `docs/plans/opzava-start-plan.md`
- `docs/plans/opzava-implementation-layers.md`
- `docs/architecture/production-grade-complexity.md`

## What We Refused To Fake

We did not build live provider adapters.

We did not connect WordPress.

We did not let environment variables become the product configuration model.

We did not create a runner before defining the states it must obey.

We did not treat “approval exists” as “approval granted.”

We did not store generated content as an unstructured blob with no lineage.

That restraint is part of the product. Opzava should automate work without hiding the control plane that makes automation safe.

## Validation

Validation completed locally after the contract slices:

```text
pnpm run typecheck: passed
pnpm test: passed 103 files, 1097 tests
pnpm run lint: passed with 0 errors and existing warnings
node --test test/*.test.mjs: passed 20/20
```

Red-first evidence was observed during the build:

- Missing contract modules failed before implementation.
- Cyclic workflow graph rejection failed before cycle detection was added.
- TypeScript caught unsafe transition lookup typing before the final implementation was accepted.

## The Automation Lesson

The first impressive thing an automation platform can do is not generate output.

The first impressive thing is refusing to generate output when the system cannot prove it should.

That is the line Opzava is being built around.

## Next Case Study Thread

Next, the build should move from static contracts into durable execution foundations:

- `Job`
- `Attempt`
- `DeadLetter`
- retry decisions
- replay eligibility
- idempotency boundaries

That is where Opzava starts proving it can survive failure instead of only modeling success.
