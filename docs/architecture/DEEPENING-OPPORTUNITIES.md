# Deepening opportunities

This is the prioritized register of shallow-to-deep refactor candidates across the Opzava-owned codebase.
Each candidate turns a shallow Module into a deeper one, fixes a mis-placed Seam, or makes an Interface carry an invariant it currently only states in comments.
It is derived from the per-module docs in [modules/](modules/) and the [seam map](SEAM-MAP.md), and it respects every locked ADR in [adr-seam-constraints.md](adr-seam-constraints.md).

Vocabulary is fixed from codebase-design: Module, Interface, Depth, Seam, Adapter, Leverage, Locality.
A candidate must pass the deletion test (deleting the status quo moves complexity; the proposed change concentrates it) and must not re-litigate any item in the do-not-re-litigate list.

## Status (applied on branch `worktree-arch-deepen`)

| # | Candidate | Outcome |
| --- | --- | --- |
| 1 | Split the `gateway-admin-connections.ts` god-module | APPLIED (`c1f4fc75`) - 4633 LOC split into docker-runtime + connections-provisioning + config-mutation + thin entry; 88-test suite green. |
| 2 | Relocate `OpenClawAdminRpcPort`/`GatewayRuntimePort` into `packages/ports` | APPLIED (`54402488`). |
| 3 | Promote `resolveSecretValue`/`putSecret` onto `SecretsVaultPort` | APPLIED (`53cf4de4`). |
| 4 | Split `OpenClawStreamEvent` chunk/final | NOT NEEDED - verified the terminal invariant (`sessionRef`/`runRef` only on `final`) is ALREADY structural: a typecheck probe reading `sessionRef` off a non-final event errors TS2339. The discriminated union enforces it; named sub-unions would add only ergonomics. |
| 5 | Shared `AuthorizationPort` contract test across all 3 adapters | APPLIED (`49647797`). |
| 6 | Extract shared tool-execution harness | APPLIED (`fc652c93`). |
| 7 | `AuthPort.signIn` MFA-hooks gap | APPLIED (`cd16e9ee`) - verified NO caller passes hooks, so narrowed the port (removed the dead `hooks` param) rather than wiring unused plumbing. |
| 8 | Split `ConnectionsProvisioningPort` into cohesive sub-ports | APPLIED (`62aaab37`) - safe backward-compatible realization: 3 sub-interfaces composed into the unchanged combined port. Full consumer migration (the grilling-gated part) deferred for incremental adoption. |
| 9 | Real `ErrorCapturePort` adapter in web | APPLIED (`5d108345`). |
| 10 | Move `GITHUB_ISSUES_TOKEN_SECRET_LABEL` out of the port | APPLIED (`2c1f3fce`). |
| 11 | `Money.parse` factory | APPLIED (`4dbe43bf`). |
| 12 | Derive eslint boundaries from the workspace catalog | APPLIED (`e53651ac`) - verified lint-equivalent (forced `pnpm lint` identical zero-violation output before/after). |
| 13 | Split `assistant-conversations.ts` | APPLIED (`9543bd87`). |
| 14 | Centralize the link-token scope whitelist | APPLIED (`125119c2`). |
| 15 | Narrow `IssueTrackerProvider` to `"github"` | SUPERSEDED - do not deepen the legacy `IssueTrackerPort`; retire/adapt it through the Dev Board migration. V1's target `DevBoardMirrorPort` facade composes focused provider capabilities implemented by one GitHub App adapter for one repository. |
| 16 | Collapse the two `canMutate` predicates | NOT APPLICABLE - no `canMutate` predicate exists in `packages/runtime-control` (verified by grep); the genuine duplication is the executor skeleton, covered by candidate 6. |
| 17 | Hide `model-provider-taxonomy` data behind accessors | APPLIED (`4c8ea3d6`). |
| gaps | ObjectStore contract, lazy pg client, migration-gate tests | APPLIED (`df42bb49`). |

Summary: 14 of 17 applied, 2 verified already-satisfied/not-applicable (4, 16), and 1 superseded by the Dev Board migration (15).

Strength badges:

- STRONG: clear depth or correctness win, respects all ADRs, the change is well-scoped.
- WORTH EXPLORING: plausible win but needs design (grilling) before committing, because the interface shape or blast radius is non-trivial.
- SPECULATIVE: low-cost cleanup or a judgement call that depends on product direction.

Each card names its source module doc so the claim can be verified against the cited file paths.

## STRONG

### 1. Split the `gateway-admin-connections.ts` god-module
- Source: [modules/workers.md](modules/workers.md), [SEAM-MAP.md](SEAM-MAP.md).
- Files: `apps/workers/src/provisioning/gateway-admin-connections.ts` (about 4633 lines).
- Problem: one Module holds the `GatewayRuntimePort` Docker Adapter, the `ConnectionsProvisioningPort` provisioning Adapter, config mutation, and fallback behavior behind an enormous Implementation with no single small Interface. Depth is buried in girth; Locality is poor because any provisioning change touches the same file as Docker runtime control.
- Solution: split along the four concerns into separate Modules (a docker-runtime Adapter, a provisioning Adapter, a config-mutation Module, a fallback Adapter), each behind its own small Interface.
- Benefits: each sub-seam can be tested and reasoned about independently; the docker Adapter and the provisioning Adapter change on different cadences; the file stops being a merge-conflict magnet.
- ADR check: respects ADR-002 (GatewayRuntimePort stays the only Docker mutation surface) and ADR-015 (only worker-provisioning reaches the socket proxy).
- Strength: STRONG.

### 2. Relocate `OpenClawAdminRpcPort` and `GatewayRuntimePort` into `packages/ports`
- Source: [SEAM-MAP.md](SEAM-MAP.md) seam-placement smells, [modules/workers.md](modules/workers.md).
- Files: `apps/workers/src/provisioning/openclaw-admin-client.ts:21` (`OpenClawAdminRpcPort`); `apps/workers/src/provisioning/gateway-admin-connections.ts` (`GatewayRuntimePort` defined alongside its Adapter).
- Problem: two real seams (3 and 1 Adapters respectively) have their Interfaces declared inside an app, not in the agnostic-ports package, so the capability Interface is coupled to the first app that implemented it.
- Solution: move both Interface declarations to `packages/ports` and import them into the worker Adapters.
- Benefits: the seams become vendor-agnostic by construction (ADR-001); a second Adapter (K8s or Nomad for `GatewayRuntimePort` per ADR-002; another admin client) can land without depending on an app.
- ADR check: directly serves ADR-001 (domain depends on ports, not concrete Adapters) and ADR-002.
- Strength: STRONG.

### 3. Promote `resolveSecretValue` (and likely `putSecret`) onto `SecretsVaultPort`
- Source: [modules/adapters.md](modules/adapters.md).
- Files: `packages/adapters/src/secrets/local-file-secrets-vault.ts`; four concrete callers depend on `LocalFileSecretsVault` by name.
- Problem: `SecretsVaultPort` is a hypothetical seam (one Adapter) and callers reach past it to the concrete class for secret resolution, so the seam cannot do its job.
- Solution: add `resolveSecretValue` (and `putSecret` if needed) to the port Interface; callers depend on the port.
- Benefits: converts a hypothetical seam into a real one and unblocks a second vault Adapter; Locality for secret resolution concentrates behind the Interface.
- ADR check: respects the agnostic-ports invariant (ADR-001) and the secrets-handling boundary.
- Strength: STRONG.

### 4. Make the `OpenClawStreamEvent` terminal invariant structural
- Source: [modules/ports.md](modules/ports.md).
- Files: `packages/ports/src/openclaw-gateway.ts:20-68` (the stream event union), `:56-62` (the terminal-only `sessionRef`/`runRef` rule).
- Problem: the rule that `sessionRef` and `runRef` appear only on the final event is stated in comments, not enforced by the type, so a caller can read them off a non-terminal event without a type error.
- Solution: split the union into `OpenClawStreamChunk` (non-terminal variants) and `OpenClawStreamFinal` (the only variant carrying `sessionRef`/`runRef`).
- Benefits: the Interface itself refuses the misuse; the test surface tightens; the broker Adapter and web consumer both get compile-time protection.
- ADR check: respects ADR-003 (the stream shape stays behind the OpenClawGatewayPort seam).
- Strength: STRONG.

### 5. Add a shared `authorization-contract.test.ts` run against all three `AuthorizationPort` Adapters
- Source: [modules/ports.md](modules/ports.md).
- Files: `packages/project-management/src/application/authorization.ts`, `packages/runtime-control/src/application/authorization.ts`. The former CRM adapter was removed on 2026-07-15 (GitHub issue #200); reassess this opportunity when CRM returns with the user-side dashboard.
- Problem: three Adapters share one Interface but have no shared contract test, so they can diverge on edge cases (unknown resource type, cross-workspace `projectId`, owner override) without a common suite catching it.
- Solution: one contract suite keyed on `AuthorizationPort`, executed against every Adapter, covering the subject or action or resource table.
- Benefits: makes "the Interface is the test surface" literal; one change to the action or resource vocabulary is validated across all three contexts at once.
- ADR check: respects ADR-007 (`AuthorizationPort` stays the single fine-grained authority).
- Strength: STRONG.

### 6. Deferred: Extract a shared tool-execution harness
- Source: [modules/runtime-control.md](modules/runtime-control.md).
- The CRM and task runners were removed from the duplication set on 2026-07-15 (GitHub issue #200). Retain this map entry for the future CRM rebuild; `task-tools.ts` is the only current runner.
- Problem: the two runners share an executor skeleton (record-started, replay short-circuit, parse, perform, record-result) and several helpers verbatim; two near-identical implementations is the signal of a real seam.
- Solution: extract a shared `runTooledExecution` harness behind a small Interface that both runners use.
- Benefits: removes duplication; the tool-policy seam becomes explicit; a third tool runner lands cheaply.
- ADR check: respects ADR-005 (tool policy stays the enforcement boundary).
- Strength: STRONG (verify the duplication is truly verbatim before extracting).

## WORTH EXPLORING

### 8. Split `ConnectionsProvisioningPort` into three cohesive ports
- Source: [modules/ports.md](modules/ports.md).
- Files: `packages/ports/src/connections-provisioning.ts:239-273`.
- Problem: the port exposes 13 methods across a read snapshot, five connect or disconnect flow state machines, and orchestrator delegation; the Interface economy is poor even though what it hides is rich.
- Solution: a read port (`getConnectionsSnapshot` only), a `ModelProviderConnectFlowsPort` (the five start, poll, submit, disconnect flows), and an `OrchestratorDelegationPort` (`applyOrchestratorDelegation` plus `setMainOrchestrator`).
- Benefits: each sub-port is small over rich behavior; the two web `Unavailable*` shims shrink to the one sub-port a caller needs.
- ADR check: respects ADR-001; needs grilling because four Adapters and two apps move.
- Strength: WORTH EXPLORING.

### 9. Replace `ErrorCapturePort` inline object literals with a real Adapter
- Source: [modules/web.md](modules/web.md), [modules/ports.md](modules/ports.md).
- Files: `apps/web/app/(app)/tasks/[cardId]/actions.ts`, `apps/web/app/api/tasks/ask-admin/turn/route.ts`.
- Problem: web satisfies the port with inline literals, so the seam exists in practice but has no reusable Adapter; the port is a not-yet-a-seam today.
- Solution: a concrete `ErrorCapturePort` Adapter (built-in reporter now, GlitchTip later per ADR-013) wired through the app, removing the inline literals.
- Benefits: the seam becomes real; redaction and routing concentrate behind one Adapter (ADR-013).
- ADR check: respects ADR-013 (ErrorGroup/Incident lifecycle, separate Incidents projection, linked remediation DevTicket, redaction at ingest).
- Strength: WORTH EXPLORING.

### 10. Move `GITHUB_ISSUES_TOKEN_SECRET_LABEL` out of `IssueTrackerPort`
- Source: [modules/ports.md](modules/ports.md).
- Files: `packages/ports/src/issue-tracker.ts` (the constant is exported from the port).
- Problem: the port leaks a storage convention (the vault secret label) into the agnostic Interface, coupling every consumer to a GitHub-specific label.
- Solution: move the constant into the GitHub Adapter (`packages/adapters/src/github/issues.ts`); let the Adapter own its vault label.
- Benefits: the seam stops carrying vendor storage detail; a second provider Adapter brings its own label.
- ADR check: respects ADR-001 (agnostic ports) and the secrets-vault boundary.
- Strength: WORTH EXPLORING.

### 11. Add a `Result`-returning `Money.parse` factory
- Source: [modules/shared-kernel.md](modules/shared-kernel.md).
- Files: `packages/shared-kernel/src/money/index.ts`.
- Problem: `Money` has `make` factories but no `parse(input)` matching the `make` or `parse` convention used by `ids` and `refs`, so callers validating raw money input improvise.
- Solution: add `Money.parse(input): Result<Money>`.
- Benefits: consistent validation discipline across the kernel value objects.
- ADR check: none; a small kernel addition.
- Strength: WORTH EXPLORING.

### 12. Derive the ESLint boundaries element map from the workspace catalog
- Source: [modules/config.md](modules/config.md).
- Files: `packages/config/eslint/base.mjs`.
- Problem: the `boundaries/elements` list and allow rules are hand-maintained, so the element map can drift ahead of the real packages.
- Solution: derive the element list from `pnpm-workspace.yaml` or the pnpm catalog so the import rules cannot drift from the actual packages.
- Benefits: the architectural boundary (the layered seam graph in SEAM-MAP.md) is enforced from one source of truth.
- ADR check: serves ADR-001 (package boundary enforcement).
- Strength: WORTH EXPLORING.

### 13. Split the 1273-line assistant-conversations Module along its exported commands
- Source: [modules/runtime-control.md](modules/runtime-control.md).
- Files: `packages/runtime-control/src/application/assistant-conversations.ts` (about 1273 lines).
- Problem: one Module holds conversation, turn lifecycle, and tool-outcome behavior behind a wide surface.
- Solution: split along exported commands into three Modules behind the same Interface.
- Benefits: each sub-seam tests independently; the file shrinks to a readable size.
- ADR check: respects ADR-008 and ADR-005.
- Strength: WORTH EXPLORING.

### 14. Centralize the link-token scope whitelist in one source of truth
- Source: [modules/identity-access.md](modules/identity-access.md).
- Files: the `linkTokenScopes` constant, `normalizeScopes` in application, and the `link_tokens_scopes_subset_check` database constraint.
- Problem: the scope whitelist is enforced at three layers that must stay aligned by hand.
- Solution: a single constant consumed by migration generation, the application check, and the constraint.
- Benefits: removes three-way drift risk.
- ADR check: serves the on-behalf-of authority invariant (ADR-005, ADR-007).
- Strength: WORTH EXPLORING.

## SPECULATIVE

### 15. Narrow legacy `IssueTrackerProvider` to `"github"`
- Source: [modules/ports.md](modules/ports.md).
- **Superseded by PRD-019/ADR-017.** The current `IssueTrackerPort` is legacy migration input, so narrowing its provider union is churn in a seam scheduled for retirement/adaptation. V1 instead introduces a `DevBoardMirrorPort` application facade composed from focused provider capabilities implemented by one GitHub App adapter for the single Opzava repository; future repository/provider expansion requires a new approved contract rather than speculative generality in the old port.
- Strength: SPECULATIVE.

### 16. Collapse the two identical `canMutate` predicates in runtime-control
- Source: [modules/runtime-control.md](modules/runtime-control.md).
- If their semantics are meant to stay coupled, one named predicate is cleaner.
- Strength: SPECULATIVE.

### 17. Hide the mutable `Record` or `Set` maps in `model-provider-taxonomy` behind functions
- Source: [modules/ports.md](modules/ports.md).
- Export only `classifyModelProvider`, `providerTier`, `isTopLevelLlmProvider` so the canonicalization data cannot be read around the functions.
- Strength: SPECULATIVE.

## Test-coverage gaps worth noting (not deepening, but load-bearing)

These surfaced repeatedly across the module docs and are recorded here so they are not lost.
They are missing tests on already-deep Modules, not refactor candidates.

- The Postgres client lazy-import path (`packages/adapters/src/postgres/client.ts`): a test importing it with `DATABASE_URL` unset, asserting no connection until first access.
- The migration gate error paths (`packages/adapters/src/postgres/migration-gate.ts`): unit tests for `forbidUnsafeMigrationCommand` and `verifyMigrationManifest`.
- The authorization decision matrix: a focused unit test for unsupported resource, tenant or org or workspace mismatch, guest denial, owner override.
- The broker stream terminal-only invariant: a contract test until candidate 4 makes it structural.
- An `ObjectStorePort` contract suite run against both Adapters (zero-byte body, oversized presign, missing metadata).

## Explicitly excluded (would re-litigate a locked ADR)

No candidate here proposes any of the following, because each is locked in [adr-seam-constraints.md](adr-seam-constraints.md):

- A second hot-path ACL to OpenClaw, or any direct OpenClaw call from web, a route handler, a server action, a domain package, or a worker (ADR-003).
- Merging `pm.Card` and `workboard.Card`, or storing OpenClaw refs as foreign keys (ADR-004, ADR-008).
- Making OpenClaw a query backend or copying runtime state into normalized Opzava tables (ADR-004).
- A per-project Docker sandbox for standard agents (ADR-005).
- Soft-fail tenant access (a missing `app.current_org` must stay a hard 403, ADR-007).
- Any Docker mutation path other than worker-provisioning through the socket proxy (ADR-015).

## Top recommendation

Start with candidate 1 (split the `gateway-admin-connections.ts` god-module) and candidate 2 (relocate the two ports into `packages/ports`) together, because they are the same change: the god-module split is the natural moment to lift `GatewayRuntimePort` and `OpenClawAdminRpcPort` out of `apps/workers` into `packages/ports`.
Together they remove the codebase's biggest Locality hazard and its two clearest seam-placement smells, and every other candidate becomes easier once the provisioning layer is decomposed.

Candidate 7 (the `AuthPort.signIn` MFA gap) should be verified first and fast, because if the mismatch is real it is a correctness defect, not a refactor.
