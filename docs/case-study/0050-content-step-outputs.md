# 0050: Content Step Outputs

Date: 2026-06-16
Status: Draft
Thread: The content workflow graph (0048) names eleven steps and their order; the artifact envelope (0049) names the generic `Artifact` a derived step may emit. Neither yet answers the question the runner must ask after a step finishes: "did this step produce the *kind* of output it was supposed to?" An `article-draft` step that returns nothing, or returns a `keyword-research` artifact, is silently wrong unless something can check it. This slice adds the declarative binding between each content step and its declared output — a record, an artifact, an approval, or an external action — so the runner has one typed lookup to verify a step emitted the right thing. The map is proven exhaustive against the workflow definition's steps by a test that iterates every step and asserts an entry exists.

## Hook

A content pipeline where each step "usually" emits the right artifact is a pipeline that is wrong in the ways no one checks. The step graph says *order*; the artifact envelope says *shape*. Neither says, for a given step, *what that step owes the run on completion*. The risk is a step service that silently emits the wrong artifact type — an `article-draft` provider that returns a `keyword-research` payload, or a `human-approval` step that forgets to record an approval — and nothing fails loudly because nothing was told what to expect. This slice makes the expectation a frozen, typed map keyed by step id, so a future runner can reject a step that emitted anything other than its declared output.

## Product Stakes

Slice 0048 wired the steps into a validated DAG; slice 0049 gave derived payloads a shared envelope. Both left the per-step output contract implicit — a step "produces" something, but that something lives nowhere a runner can read before it executes. As long as that gap lasts, any step-service implementation is unverifiable at the boundary: the runner cannot tell a correct completion from a wrong one, and a misbehaving step ships its defect downstream silently.

This slice adds `CONTENT_STEP_OUTPUTS` under `src/opzava/modules/content/workflow/`. It is a frozen `Record` from step id to a `ContentStepOutput` discriminated union with four kinds: `intake-record` (the root `idea-intake`), `artifact` (a derived `ContentArtifactType`), `approval` (the human gate), and `external-action` (the terminal WordPress request). A `getContentStepOutput(stepId)` lookup returns the declared output or throws for an unknown step. The map is pure data: no runner, no providers, no side effects — it is the contract the runner will check against, not the check itself.

## Industry Counterfactual

The common shortcut is to leave "what each step produces" as orchestrator knowledge — a switch statement inside the runner, or a comment on each step service, or the developer remembering that `fact-check` emits a `fact-check-report` artifact (not a `fact-check` one). The verification then survives only as convention.

That detaches the output contract from any checkable artifact. A step service rewritten by a different author returns a differently-named payload, the runner accepts it because nothing declares the expectation, and the post-mortem finds a contract that was *understood* but never *declared*. The naming drift that matters most — `fact-check` step versus `fact-check-report` artifact — is exactly the kind of detail a convention misremembers.

Opzava declares the binding as frozen data beside the workflow definition, so the step graph (what runs, in what order) and the output map (what each step owes) live together and stay in sync. A test iterates the workflow's steps and asserts an entry for each, so a new step that forgets its output binding fails the suite, not production.

## What We Built

We added `src/opzava/modules/content/workflow/content-step-outputs.ts`:

- exports `ContentStepOutput`, a discriminated union: `intake-record` (`recordType: 'idea-intake'`), `artifact` (`artifactType: ContentArtifactType`), `approval`, and `external-action` (`requestType: 'wordpress-draft-request'`)
- exports `CONTENT_STEP_OUTPUTS`, a frozen `Record<string, ContentStepOutput>` binding each of the eleven content steps to its output kind — the nine derived steps to their artifact types, `idea-intake` to its root intake record, `human-approval` to an approval, and `wordpress-draft` to its external action
- exports `getContentStepOutput(stepId)`, returning the declared output or throwing `no declared output for content step: <id>` for an unknown step
- is pure: no runner, no providers, no I/O, no side effects

The module index re-exports `CONTENT_STEP_OUTPUTS`, `getContentStepOutput`, and `ContentStepOutput` after the artifact envelope.

## What We Refused To Fake

We did not add a runner or a step-service validator; this slice is the *declaration*, not the *enforcement*. A later runner slice consumes the map.

We did not invent a second output vocabulary; every `artifact` output's `artifactType` is drawn from the existing `CONTENT_ARTIFACT_TYPES` closed list, and a test asserts each is a member, so the binding cannot drift from the envelope's types.

We did not duplicate the step list; exhaustiveness is proven against `getContentWorkflowDefinition().steps` by iterating every step and asserting an entry, so a step added to the graph without an output binding breaks the test rather than shipping silent.

We did not coerce the root intake into an artifact output; `idea-intake` is bound to `intake-record` per ARD 0003, keeping the root/derived split expressed in the output map as it is in the envelope.

## Evidence

Files changed:

- `src/opzava/modules/content/workflow/content-step-outputs.test.ts`
- `src/opzava/modules/content/workflow/content-step-outputs.ts`
- `src/opzava/modules/content/index.ts`

The tests cover:

- every step in `getContentWorkflowDefinition().steps` has an entry in `CONTENT_STEP_OUTPUTS` and a resolvable `getContentStepOutput` (exhaustiveness)
- `idea-intake` binds to `{ kind: 'intake-record', recordType: 'idea-intake' }`
- `keyword-research` binds to `{ kind: 'artifact', artifactType: 'keyword-research' }`
- `human-approval` binds to `{ kind: 'approval' }`
- `wordpress-draft` binds to `{ kind: 'external-action', requestType: 'wordpress-draft-request' }`
- `getContentStepOutput('nonsense')` throws naming the step
- every `artifact` output's `artifactType` is a member of `CONTENT_ARTIFACT_TYPES`

## Validation

Focused validation completed locally:

```text
node_modules/.bin/vitest run src/opzava/modules/content/workflow/content-step-outputs.test.ts: passed 7/7 (failed before implementation: import "./content-step-outputs" unresolvable — module missing)
node_modules/.bin/vitest run src/opzava/modules/content: passed 115/115 across 13 files (9 derived content contracts + idea-intake + content-workflow graph + content-artifact envelope + content-step-outputs)
node_modules/.bin/tsc --noEmit (typecheck): passed
node_modules/.bin/eslint src/opzava/modules/content: passed with 0 errors
```

Every workflow step now has a declared output type, so a runner can reject a step that emits the wrong thing; the map is proven exhaustive against the workflow definition's steps.

## The Automation Lesson

The boundary this slice draws is deliberate. The map declares *what* a step owes; it does not yet *enforce* it at runtime. A step service could still emit a `keyword-research` artifact from the `article-draft` step and the map would not object — the map is data, not a check. A later runner slice must compare the step's actual emitted output against `getContentStepOutput(stepId)` and reject the mismatch. It must also guarantee that an `artifact` output's payload is schema-valid and lineage-complete (per slice 0049's lesson) before it is accepted. Shipping the declaration without the runtime check would let a step silently emit the wrong type, so the next slice must close that loop at the producing boundary, not assume it.

## Next Case Study Thread

This declares the per-step output binding the runner will check against.

The next build thread should:

- add the first content **step service** — `idea-intake` executed as an application service that produces a validated `IdeaIntake` root record from manual input — run through the durable runner on mock providers, the first step whose completion the runner verifies against `getContentStepOutput('idea-intake')`.
