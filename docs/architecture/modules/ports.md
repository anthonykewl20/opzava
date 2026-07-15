# packages/ports - agnostic capability seams
> **Current implementation inventory (2026-07-15):** `IssueTrackerPort` and all Task/Issue consumers below describe current code. The target Dev Board GitHub App, webhook, deterministic sync, and durable outbox seams are planned under PRD-019/ADR-017 and are not implemented by this inventory.

> Part of the Opzava architecture (see ../README.md). Vocabulary: codebase-design.

## Overview
`packages/ports` is the agnostic-ports layer: it owns only TypeScript types (interfaces, branded ids, input/output shapes) and one pure classification overlay, with zero runtime behavior of its own.
Its job is to give every bounded context and every app a stable seam to code against, so that domain packages never import OpenClaw, AWS, Better Auth, GitHub, or any concrete vendor, and so adapters can be swapped behind an unchanged caller.
The key invariants it enforces are: every operation returns `Result<T>` from `@opzava/shared-kernel` (no thrown-control-flow crosses a seam), every actor carries a scoped principal (`tenantId`/`orgId`/`workspaceId`/`userId`/`roleKeys`), and no vendor type leaks through the surface.

## Modules

### ports barrel - `packages/ports/src/index.ts`
- **Interface (the seam):** ten `export *` lines re-exporting `auth`, `authorization`, `connections-provisioning`, `error-capture`, `issue-tracker`, `model-provider-taxonomy`, `object-store`, `openclaw-gateway`, `realtime-transport`, and `secrets-vault` (`packages/ports/src/index.ts`).
Callers depend on `@opzava/ports` as a single path; the invariants are "one import for the whole capability surface" and "nothing un-exported is reachable."
- **Behind the seam (implementation):** none; the file is pure re-export.
- **Adapters:** n/a (barrel, not a port).
- **Depth:** shallow.
The deletion test is trivial: deleting the barrel only changes import paths, it concentrates no complexity.
- **Seams:** external seam is the package import path; it hides eleven child modules, so the real behavior surface is wider than the single file suggests.
- **Testing through the interface:** no direct test; coverage is transitive through each child module's consumers.
Gap: a barrel has no contract to test, but there is no guard preventing two child modules from exporting the same name and colliding.
- **Deepening opportunity:** none - already as shallow as a seam gets; the only improvement is a lint rule forbidding star-export name collisions.

### ConnectionsProvisioningPort - `packages/ports/src/connections-provisioning.ts`
- **Interface (the seam):** `ConnectionsProvisioningPort` declares 13 async operations returning `Promise<Result<T>>` (`packages/ports/src/connections-provisioning.ts:239-273`): one read (`getConnectionsSnapshot`), five model-provider connect/disconnect flows (api-key start/poll at `:243-248`, setup-token start/poll/submit at `:249-257`, device-flow start/poll at `:258-261`, disconnect at `:262-264`), orchestrator delegation (`applyOrchestratorDelegation` `:265-267`, `setMainOrchestrator` `:268-270`), and GitHub connect/disconnect (`:271-272`).
Invariants a caller must know: every input extends `ConnectionProvisioningPrincipal` (`:21-26`, the scoped actor), `ConnectionsSnapshot` (`:154-162`) is the single read model that fans into gateway/provider/github/orchestrator sub-states, and the five connect flows are each two-phase start-then-poll state machines whose poll results are discriminated unions (`ModelProviderApiKeyConnectPollState` `:179-189`, `SetupTokenFlowPollState` `:209-213`, `DeviceFlowPollState` `:121-129`).
Error modes are encoded as failure variants inside the unions (`status: "failed" | "expired"` with `message`/`code`), not as thrown exceptions.
- **Behind the seam (implementation):** the heaviest behavior in the package is hidden here: live OpenClaw gateway RPC (`models.list`, `models.authStatus`, `onboard`), five independent async-poll state machines, device-flow challenge lifecycle, orchestrator delegation with tool-policy expansion (`OrchestratorDelegationState.toolPolicyExpansion` `:147-150`), and the projection of all of it into one `ConnectionsSnapshot`.
- **Adapters:** 4 adapters (real seam, the heaviest in the repo): `GatewayAdminConnectionsProvisioningPort` (`apps/workers/src/provisioning/gateway-admin-connections.ts:2741`) and `UnavailableConnectionsProvisioningPort` (`apps/workers/src/provisioning/gateway-admin-connections.ts:4485`) on the worker side; `InternalConnectionsProvisioningClient` (`apps/web/lib/connections.ts:242`) and `UnavailableConnectionsProvisioningPort` (`apps/web/lib/connections.ts:175`) on the web side.
Each adapter hides a different failure posture: the worker gateway-admin adapter hides the entire OpenClaw admin RPC + vault + saga, the web internal client hides the HTTP hop to the worker, and both `Unavailable*` adapters hide a degraded-mode return shape.
- **Depth:** moderate (deep behavior, wide interface).
By the strict vocabulary a deep module has a small interface; this one exposes 13 methods and ~30 types across catalog data, provider health, five flow state machines, and delegation, so its interface economy is poor even though what it hides is rich.
Deletion test: deleting it would force both apps to reimplement five flow machines and gateway RPC, so it concentrates complexity, but callers already absorb most of the shape, which is the signature of a too-wide seam.
- **Seams:** external seam consumed by `apps/web/lib/connections.ts` and `apps/workers/src/provisioning/connections-http-server.ts`; internal seam to `model-provider-taxonomy` via `ProviderTier` (`packages/ports/src/connections-provisioning.ts:3`).
Coupling note: the worker adapter also consumes `OpenClawAdminRpcPort` (`apps/workers/src/provisioning/gateway-admin-connections.ts:65,83`), a real seam that is mis-placed inside an app rather than in this package (see Cross-cutting notes).
- **Testing through the interface:** the worker adapter is exercised heavily at `apps/workers/src/provisioning/__tests__/connections.test.ts` (fake at `:152`, real class at `:524`); the port itself has no contract test.
Gap: there is no shared contract test pinning the five poll state machines to the same discriminated-union shape, so a flow could drift from the union without failing a port-level suite.
- **Deepening opportunity:** split this wide seam into three cohesive ports: a read port (`getConnectionsSnapshot` only), a `ModelProviderConnectFlowsPort` (the five start/poll/submit/disconnect flows), and an `OrchestratorDelegationPort` (`applyOrchestratorDelegation` + `setMainOrchestrator`).
Each sub-port would have a small interface over rich behavior, the deletion test would bite on each, and the two web `Unavailable*` shims would shrink to the one sub-port a given caller actually needs.

### AuthorizationPort - `packages/ports/src/authorization.ts`
- **Interface (the seam):** `AuthorizationPort` exposes three operations (`packages/ports/src/authorization.ts:59-67`): `can(subject, action, resource)`, `hasTenantGrant`, and `hasProjectGrant`.
The vocabulary is fixed and small: `AuthorizationAction` is a 7-value union (`:12-19`), `AuthorizationResource.type` is an 8-value union (`:22-30`), and `TenantGrant`/`ProjectGrant` (`:43-44`) enumerate the grant lattice.
Invariants: every call takes an `AuthorizationSubject` scoped by tenant/org/workspace/roleKeys (`:4-10`) and returns `Result<AuthorizationDecision>` (`:38-41`); the decision carries `allowed` plus an optional `reason`.
- **Behind the seam (implementation):** hidden policy behavior is the action-x-resource matrix plus tenant/project grant resolution; the interface deliberately exposes the matrix vocabulary so callers can ask any well-formed question.
- **Adapters:** 2 current adapters (real seam), one per bounded context: `RoleKeyTaskAuthorizationPort` (`packages/project-management/src/application/authorization.ts:39`) and `RoleKeyRuntimeControlAuthorizationPort` (`packages/runtime-control/src/application/authorization.ts:39`). The CRM adapter was removed and is deferred to the future user-side dashboard (GitHub issue #200).
Each adapter hides that context's specific role-key-to-grant mapping behind the identical question surface.
- **Depth:** moderate.
Deletion test: deleting the port would push the action/resource vocabulary and grant resolution into three contexts at once, concentrating policy; but because the matrix is visible in the interface, callers already see much of the shape, so it is not as deep as a behavior-hiding port.
- **Seams:** external seam shared across three bounded contexts, which is real seam reuse but also the highest policy-coupling point; one change to `AuthorizationAction` or `AuthorizationResource.type` touches all three adapters simultaneously.
- **Testing through the interface:** adapter-level coverage at `packages/runtime-control/src/__tests__/slice2a-runtime-control.integration.test.ts`.
Gap: no shared authorization contract test, so the three adapters could diverge on edge cases (unknown resource type, cross-workspace `projectId`) without a common suite catching it.
- **Deepening opportunity:** none on the interface shape; the win is a shared `authorization-contract.test.ts` that every adapter must pass against the same subject/action/resource table, making "the interface is the test surface" literal.

### ObjectStorePort - `packages/ports/src/object-store.ts`
- **Interface (the seam):** `ObjectStorePort` exposes five operations (`packages/ports/src/object-store.ts:59-65`): `putObject`, `getObject`, `presignPutObject`, `presignGetObject`, `deleteObject`.
Invariants: bodies are streaming on both write (`Uint8Array | ReadableStream | AsyncIterable`, `:10`) and read (`AsyncIterable | ReadableStream`, `:45`), refs are `{bucket, key}` (`:3-6`), presign requires an explicit `expiresInSeconds` (`:28,34`), and every call returns `Result<T>`.
- **Behind the seam (implementation):** hidden behavior is stream materialization, content-type/size handling, presigned-url generation, etag tracking, and storage backend semantics.
- **Adapters:** 2 adapters (real seam): `InMemoryObjectStore` (`packages/adapters/src/object-store/in-memory-object-store.ts:89`) and `S3ObjectStoreAdapter` (`packages/adapters/src/object-store/s3-object-store.ts:92`).
The in-memory adapter hides a test/local shim; the S3 adapter hides the AWS SDK, streaming uploads, and presigning.
- **Depth:** deep.
Deletion test: deleting the port would force every caller to re-plumb streaming bodies, presigning, and S3 error mapping, a large concentration of complexity behind a five-method interface.
- **Seams:** external seam consumed by web and adapters; the streaming body union is the main internal-shape coupling point.
- **Testing through the interface:** `packages/adapters/src/object-store/__tests__/in-memory-object-store.test.ts` exercises put/get/presign/delete against the fake.
Gap: no shared contract test asserting the S3 adapter matches the in-memory adapter on edge cases (zero-byte body, oversized presign, missing metadata).
- **Deepening opportunity:** none - already deep; the presign/streaming surface is intentionally complete.

### OpenClawGatewayPort - `packages/ports/src/openclaw-gateway.ts`
- **Interface (the seam):** `OpenClawGatewayPort` exposes three operations (`packages/ports/src/openclaw-gateway.ts:114-120`): `startAssistantStream`, `getEffectiveTools`, `getHealth`.
Invariants: `startAssistantStream` returns a `StartAssistantStreamReceipt` whose `events` is an `AsyncIterable<OpenClawStreamEvent>` (`:89-93`); the stream event union has 8 variants (`:20-68`); the critical ordering rule is that `sessionRef`/`runRef` appear only on the `final` variant (`:56-62`), not on `delta`, `tool.*`, or `approval.requested`.
`getHealth` returns a circuit-breaker snapshot (`reachable`, `circuitOpen`, `degradedReason`, `:106-112`).
- **Behind the seam (implementation):** hidden behavior is the WS/HTTP streaming relay to OpenClaw, tool-policy enforcement (`getEffectiveTools`), circuit-breaker health, and the two-token boundary (this is the hot-path ACL seam per the project's gateway rules).
- **Adapters:** 1 adapter by count: `GatewayConnectionManager` (`apps/gateway-broker/src/routing/connection-manager.ts:47`).
By the "two adapters = real seam" rule this is hypothetical on adapter diversity, but architecturally it is the single hot-path ACL seam into OpenClaw, so its structural importance outweighs the count.
- **Depth:** deep.
Deletion test: deleting the port would push streaming relay, the 8-event state machine, tool inventory, and circuit-breaking into every caller, a heavy concentration behind a three-method interface.
- **Seams:** external seam consumed by the gateway-broker (the only ACL to OpenClaw); the wide stream-event union is the main internal-shape coupling and the easiest thing for a caller to misuse.
- **Testing through the interface:** `apps/gateway-broker/src/__tests__/internal-http.fake-gateway.test.ts` and `apps/web/test/ask-admin-route.test.ts`.
Gap: the "sessionRef/runRef only on final" invariant is stated in comments, not enforced by the type, so a caller can read `sessionRef` off a non-final event without a type error; a contract test should pin the terminal-only invariant.
- **Deepening opportunity:** make the terminal invariant structural by splitting `OpenClawStreamEvent` into a `OpenClawStreamChunk` (non-terminal) and a terminal `OpenClawStreamFinal` that is the only variant carrying `sessionRef`/`runRef`, so the interface itself refuses the misuse.

### AuthPort - `packages/ports/src/auth.ts`
- **Interface (the seam):** `AuthPort` exposes five operations (`packages/ports/src/auth.ts:85-91`): `signIn`, `getSession`, `revokeSession`, `listSessions`, `logoutAll`.
Invariants: `signIn` takes optional `MfaHooks` (`:78-83`) and returns `Result<AuthSession | MfaChallenge>` (`:86`), so MFA orchestration is expressed as a return-value branch, not a separate call; sessions carry identity, membership(s), and expiry (`:15-29`); ids are branded (`SessionId`, `SessionToken`, `MfaChallengeId`, `:4-6`).
- **Behind the seam (implementation):** hidden behavior is session issuance/revocation, multi-membership resolution, MFA challenge creation/verification, and logout-all fan-out.
- **Adapters:** 1 adapter: `BetterAuthPortAdapter` (`packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts:101`).
Hypothetical seam by count; the adapter hides the entire Better Auth SDK plus the DB session store.
- **Depth:** deep.
Deletion test: deleting the port would push MFA orchestration, session lifecycle, and multi-membership resolution into every caller, a large concentration behind a five-method interface that also folds MFA into `signIn`'s return type.
- **Seams:** external seam consumed by web auth routes; the only external type leak is the DOM `Headers` type in `GetSessionInput` (`:38-41`), which loosely couples the port to a fetch-style request shape.
- **Testing through the interface:** `packages/identity-access/src/__tests__/slice1c-auth.integration.test.ts`.
Gap: the MFA-as-return-branch contract (challenge vs session) is the riskiest path and has no dedicated port-level contract test asserting both branches.
- **Deepening opportunity:** none on the surface; the MFA fold into `signIn` is already a depth win (one operation, two outcomes) and should be preserved.

### EventBusPort - DELETED (#160)
- **Interface (the seam):** none. The port exposed `publish`/`recordOutbox`/`subscribe` and had **zero adapters and zero consumers**; its one caller took it as an optional dependency, so the domain event it claimed to publish went nowhere. It was deleted in #160 (zero adapters, zero consumers — the optional dependency made the missing adapter a silent no-op). ADR-004 stands; any replacement must land with the Postgres outbox and its first real consumer under PRD-019/ADR-017 rather than historical #152.
Invariants: `publish` returns the persisted `OutboxRecord` (`:47-51`), `OutboxRecord` carries attempt count and optional `externalRef` (`:17-27`), `subscribe` returns an `EventSubscription` whose `unsubscribe` is itself async (`:38-40`), and `PublishOptions` carries `idempotencyKey`/`availableAt` (`:29-32`).
- **Behind the seam (implementation):** hidden behavior is outbox persistence, idempotent publish, scheduled availability, and subscription lifecycle.
- **Adapters:** 0 class adapters found; the port is consumed only as a dependency-injection parameter (`packages/identity-access/src/application/first-owner-setup.ts:48,154,187`), so it is a planned/speculative seam, not yet a real one.
- **Depth:** deep by shape (small interface, rich outbox/subscription behavior), but unproven because no adapter implements it yet.
- **Seams:** external seam is not yet wired to a concrete publisher; the `unsubscribe` lifecycle and optional `externalRef` are the widest parts of the failure surface.
- **Testing through the interface:** none found.
Gap: with zero adapters, the seam is entirely unverified; the moment a first adapter lands it needs a contract test for idempotency and subscription cleanup.
- **Deepening opportunity:** none until an adapter exists; the seam is well-shaped but currently speculative.

### SecretsVaultPort - `packages/ports/src/secrets-vault.ts`
- **Interface (the seam):** `SecretsVaultPort` exposes two operations (`packages/ports/src/secrets-vault.ts:33-36`): `getRef` and `resolve`.
Invariants: `SecretReference` binds a `tenantId` + `purpose` (`database|auth|openclaw|provider|tls|docker`, `:9`) + `label` to a branded `SecretRefId` (`:4`); `resolve` takes a `requestedBy`/`reason` audit pair (`:20-24`) and returns a `ResolvedSecret` with `fingerprint` and optional `expiresAt` (`:26-31`).
- **Behind the seam (implementation):** hidden behavior is tenant-scoped secret naming, fingerprinting, audit-tagged resolution, and expiry policy.
- **Adapters:** 1 adapter: `LocalFileSecretsVault` (`packages/adapters/src/secrets/local-file-secrets-vault.ts:120`).
Hypothetical seam by count; the adapter hides the local file-backed store suitable only for dev/local parity.
- **Depth:** deep.
Deletion test: deleting the port would push tenant-purpose naming, fingerprinting, and audit-tagged resolution into every caller, a real concentration behind a two-method interface.
- **Seams:** external seam consumed by web/worker; the `purpose` enum and tenant-scoped naming rule are baked into the port surface, which is intentional but couples every adapter to that naming convention.
- **Testing through the interface:** `packages/adapters/src/secrets/__tests__/local-file-secrets-vault.test.ts`.
Gap: only one (dev-only) adapter exists, so the resolve/fingerprint contract is unproven against a production-grade vault.
- **Deepening opportunity:** none - already deep; the two-method surface is exemplary.

### IssueTrackerPort - `packages/ports/src/issue-tracker.ts`
- **Interface (the seam):** `IssueTrackerPort` exposes four operations (`packages/ports/src/issue-tracker.ts:48-53`): `listIssues`, `getIssue`, `createIssue`, `closeIssue`.
Invariants: `IssueTrackerProvider` is currently the single literal `"github"` (`:3`), `IssueTrackerRef` is `{provider, repository, number, url}` (`:9-14`), and `GITHUB_ISSUES_TOKEN_SECRET_LABEL` is exported as a constant (`:7`).
- **Behind the seam (implementation):** hidden behavior is GitHub transport, pagination, response mapping, and close-reason translation (`completed|not_planned`, `:5`).
- **Adapters:** 1 adapter: `GitHubIssueTrackerAdapter` (`packages/adapters/src/github/issues.ts:150`).
Hypothetical seam by count, and the `provider` union plus the exported token-secret label mean the port is GitHub-shaped despite naming itself generically.
- **Depth:** moderate.
Deletion test: deleting the port would push transport, pagination, and mapping into callers, but each operation is a thin CRUD wrapper so the concentration is modest relative to the four-method surface.
- **Seams:** external seam consumed by project-management; the `GITHUB_ISSUES_TOKEN_SECRET_LABEL` export leaks a storage convention (`github-issues-token`) directly into the port surface.
- **Testing through the interface:** `packages/project-management/src/__tests__/slice25e-issues.integration.test.ts` plus the adapter at `packages/adapters/src/github/issues.ts`.
Gap: the port is GitHub-only in practice, so multi-provider claims in the type are unverified.
- **Deepening opportunity:** if a second provider is never planned, narrow `IssueTrackerProvider` to `"github"` and drop the pretense of generality; if one is planned, move `GITHUB_ISSUES_TOKEN_SECRET_LABEL` out of the port into the adapter so the seam stops leaking a storage convention.

### ErrorCapturePort - `packages/ports/src/error-capture.ts`
- **Interface (the seam):** `ErrorCapturePort` exposes one operation (`packages/ports/src/error-capture.ts:21-23`): `capture(input): Promise<Result<void>>`.
The real surface is the `CaptureErrorInput` struct (`:6-19`): `source`, `operation`, `severity` (`info|warning|error`, `:4`), `message`, plus optional tenant/org/workspace/user ids, `correlationId`, `details`, and `cause`.
- **Behind the seam (implementation):** hidden behavior is structured normalization of an operational failure into a context-rich capture; in practice the adapters inline-normalize and forward to a logger/Sentry.
- **Adapters:** 0 class adapters; only inline structural objects exist (`apps/web/app/api/tasks/ask-admin/turn/route.ts:78` `noopErrorCapturePort`, `apps/web/app/(app)/tasks/[cardId]/actions.ts:85`), so the seam exists in practice but has no reusable adapter yet.
- **Depth:** moderate, leaning shallow.
Deletion test: deleting the port would mostly move a structured-log call back into callers, a weak concentration, but the normalized context struct does carry mild behavior.
- **Seams:** external seam consumed by web route handlers; the fat input struct is effectively the whole interface, so the seam is "the shape of one record."
- **Testing through the interface:** `apps/web/test/ask-admin-route.test.ts` drives a fake capture recorder (`:157-165`), and `apps/web/lib/task-card-detail.ts:191,412` consumes it optionally.
Gap: no real sink adapter exists, so severity/de-dup/retry behavior is unverified.
- **Deepening opportunity:** if capture stays a thin forward, leave it; if severity routing or sampling is added, sink that behavior inside a real adapter rather than widening `CaptureErrorInput` further.

### RealtimeTransportPort - `packages/ports/src/realtime-transport.ts`
- **Interface (the seam):** `RealtimeTransportPort` exposes two operations (`packages/ports/src/realtime-transport.ts:41-46`): `publish` and `authorizeTopic`.
Invariants: `publish` takes a tenant-scoped `RealtimeEvent` with optional `idempotencyKey` (`:24-29`), `authorizeTopic` takes a `RealtimePrincipal` + branded `RealtimeTopic` and returns a `RealtimeTopicDecision` (`:31-39`).
- **Behind the seam (implementation):** intended hidden behavior is realtime fan-out plus topic authorization; currently nothing implements it.
- **Adapters:** 0 adapters found anywhere in the repo, so this is a planned/speculative seam.
- **Depth:** moderate by shape (publish + authz is behavior-rich), but entirely unproven.
- **Seams:** external seam is not yet wired; coupling is therefore latent.
- **Testing through the interface:** none found.
Gap: zero implementation means the seam is a design placeholder; `authorizeTopic` returning a denial must mean hard-403 elsewhere, but that contract is not yet enforced by any adapter.
- **Deepening opportunity:** none until an adapter lands; the seam is well-shaped but speculative.

### model-provider-taxonomy - `packages/ports/src/model-provider-taxonomy.ts`
- **Interface (the seam):** the public surface is a classification overlay, not a port: `classifyModelProvider(providerId)` (`packages/ports/src/model-provider-taxonomy.ts:134-162`), `isTopLevelLlmProvider` (`:165-168`), `providerTier` (`:170-174`), plus exported data maps `RUNTIME_PARENTS` (`:20-28`), `PROVIDER_PARENT_ALIASES` (`:31-37`), `PROVIDER_TIERS` (`:55-66`), `NON_LLM_PROVIDER_IDS` (`:73-85`), `CANONICAL_PROVIDER_LABELS` (`:88-108`), and the `ProviderTier` type (`:46`).
Invariant: default classification is "LLM parent" so an unknown gateway-advertised id still surfaces (gateway-driven, no invented list, per `:130-133`).
- **Behind the seam (implementation):** hidden behavior is the canonicalization rules: CLI runtimes fold under parents (Codex to OpenAI, Claude CLI to Anthropic, Gemini CLI to Google), auth/plan aliases fold under parents (qwen-oauth to qwen), and an explicit non-LLM denylist is hidden from the Models & Providers surface.
- **Adapters:** n/a (pure data + pure functions, not a port); it is consumed internally by `connections-provisioning.ts:3` and shared by the provisioning worker ACL and the web projection with zero OpenClaw types leaking.
- **Depth:** moderate.
Deletion test: deleting it would push the canonicalization rules into both worker and web, duplicating policy, so it concentrates policy; but the maps are partly exposed on the surface, which keeps it from being deep.
- **Seams:** internal seam to `connections-provisioning` only; the module is intentionally pure so both runtimes share it.
- **Testing through the interface:** none found in this package.
Gap: the classification rules (runtime fold, alias fold, non-LLM denylist, default-LLM) are policy-heavy and entirely untested; a provider id reclassification would silently change the Models & Providers surface.
- **Deepening opportunity:** hide the mutable-looking `Record`/`Set` maps behind the functions and export only `classifyModelProvider`/`providerTier`/`isTopLevelLlmProvider`, so the canonicalization rules become the only surface and the data cannot be read around the functions.

## Cross-cutting notes
- **Depth heat:** deep = `ObjectStorePort`, `OpenClawGatewayPort`, `AuthPort`, `SecretsVaultPort` (4); moderate = `ConnectionsProvisioningPort`, `AuthorizationPort`, `IssueTrackerPort`, `ErrorCapturePort`, `RealtimeTransportPort`, `model-provider-taxonomy` (6); shallow = ports barrel (1).
- **Real vs hypothetical seams (adapter-count ground truth):** real seams (2+ adapters) are `ConnectionsProvisioningPort` (4), `AuthorizationPort` (3), `ObjectStorePort` (2); hypothetical (1 adapter) are `AuthPort`, `IssueTrackerPort`, `SecretsVaultPort`, `OpenClawGatewayPort`; not-yet-a-seam (0 class adapters) are `ErrorCapturePort` and `RealtimeTransportPort` (`EventBusPort` was deleted in #160 for exactly this reason — see above).
`OpenClawGatewayPort` is the exception: 1 adapter by count but the single hot-path ACL seam into OpenClaw, so its architectural weight exceeds the count.
- **Shared coupling and blast radius:** every port returns `Result<T>` from `packages/shared-kernel/src/result`, so that primitive is the widest blast-radius dependency in the layer; `AuthorizationPort` is the next widest because one change to its action/resource vocabulary rewrites three bounded contexts at once.
- **Patterns observed:** agnostic-ports (the whole layer); two-token boundary (`OpenClawGatewayPort` is the hot-path write+approvals seam, while the JIT admin seam is `OpenClawAdminRpcPort`); tool-policy-first (`OrchestratorDelegationState.toolPolicyExpansion` carries the `sessions_spawn`/`subagents`/`group:sessions` expansion at `packages/ports/src/connections-provisioning.ts:147-150`); projections-are-cache (`ConnectionsSnapshot` is a rebuildable projection of live gateway state); tenant-scoped-everything (every actor principal carries `tenantId`/`orgId`/`workspaceId`/`userId`/`roleKeys`).
- **Friction clusters:** (1) `connections-provisioning.ts` is the largest, widest seam (273 LOC, 13 methods, ~30 types) mixing catalog, health, five flow state machines, and delegation, and is the prime deepening target; (2) `OpenClawAdminRpcPort` is a real seam (2 production adapters plus a test fake: `apps/workers/src/provisioning/openclaw-admin-client.ts:504`, `apps/workers/src/provisioning/gateway-admin-connections.ts:1127`, `apps/workers/src/provisioning/__tests__/connections.test.ts:207`) but is defined inside `apps/workers/src/provisioning/openclaw-admin-client.ts:21` instead of `packages/ports`, a seam-placement smell; (3) three zero-adapter ports (`ErrorCapture`, `EventBus`, `Realtime`) are speculative and unverified; (4) `IssueTrackerPort` leaks the `github-issues-token` storage convention into the port surface via `GITHUB_ISSUES_TOKEN_SECRET_LABEL`.

## File map
- `packages/ports/src/index.ts` - barrel re-exporting all eleven child modules as one import seam.
- `packages/ports/src/connections-provisioning.ts` - widest seam; connections snapshot, five connect/disconnect flow state machines, orchestrator delegation.
- `packages/ports/src/openclaw-gateway.ts` - hot-path assistant-stream, tool-inventory, and health seam (the ACL into OpenClaw).
- `packages/ports/src/authorization.ts` - subject/action/resource policy seam reused by three bounded contexts.
- `packages/ports/src/object-store.ts` - streaming blob put/get/presign/delete seam.
- `packages/ports/src/auth.ts` - session, membership, and MFA seam with MFA folded into signIn's return.
- `packages/ports/src/secrets-vault.ts` - tenant-purpose secret reference and audit-tagged resolution seam.
- `packages/ports/src/issue-tracker.ts` - issue list/get/create/close seam (GitHub-only in practice).
- `packages/ports/src/error-capture.ts` - structured operational-failure capture seam (inline adapters only).
- `packages/ports/src/realtime-transport.ts` - realtime publish and topic-authorization seam (zero adapters).
- `packages/ports/src/model-provider-taxonomy.ts` - pure provider classification overlay (runtime/alias folding, non-LLM denylist, tiers).
