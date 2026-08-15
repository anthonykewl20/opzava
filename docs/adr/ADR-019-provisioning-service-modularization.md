# ADR-019: Provisioning service modularization

## Status

Accepted — ratified 2026-08-12
**Ratified by:** merged PRs #293, #295, #296, #294, #298, #302 below.

**Current status (2026-08-15):** #164's opaque interactive-login facade is complete via #350; its
seven raw Docker-shaped methods and two raw types are deleted. #166 remains open after the #351
cleanup-seam extraction.

## Context

`apps/workers/src/provisioning/connections-provisioning-service.ts:1-8395` is now 8,395 lines, up
from 3,859 when issue #166 was filed. Its principal characterization test,
`apps/workers/src/provisioning/__tests__/connections.test.ts:1-12154`, is 12,154 lines and
constructs `GatewayAdminConnectionsProvisioningPort` directly 123 times (the helper starts at
`connections.test.ts:956`; direct construction continues throughout the file, for example at
`connections.test.ts:2413`). The size is not merely cosmetic: one class now coordinates catalog
projection, Gateway snapshots, model-provider credentials, connect and disconnect state machines,
model routing, orchestrator reconciliation, GitHub connections, audit, and concurrent mutation.

Four architecture issues therefore converge on this service:

- #166 must split the service without changing its behavior.
- #163 must stop workers from independently reimplementing the Gateway frame protocol and Ed25519
  signing already implemented by the broker.
- #164 is complete: `GatewayRuntimePort` now exposes opaque interactive-login handles and typed
  state, keeping Docker execution IDs and filesystem paths private to its adapter (#350).
- #162 must remove inline SQL and `TenantTransaction` from bounded-context application layers. The
  current dependency is visible, for example, in
  `packages/project-management/src/application/issues.ts:1` and
  `packages/runtime-control/src/application/assistant-conversation-lifecycle.ts:5`.

Issue #161, the BFF authenticated-action prerequisite, is merged. This allows #162 to proceed as a
separate program, but does not make it part of the provisioning-service split.

The highest-risk seam is Gateway config mutation. The current service constructs generic patch
parameters at multiple distant sites, including model routability
(`connections-provisioning-service.ts:4644-4665`), credential removal and auth-order replacement
(`connections-provisioning-service.ts:6335-6366`), and canonical agent writes
(`connections-provisioning-service.ts:6924-6940`). Those call sites can independently choose patch
shape and `replacePaths`. A long disconnect can therefore retain a parsed config or base hash across
awaits unless the architecture makes that impossible.

OpenClaw defines the required write protocol: read `config.get` and its hash, then use
`config.patch`; merge-patch `null` deletes object keys, and arrays require their exact paths in
`replacePaths` when entries are removed (`docs/openclaw/gateway/configuration.md:596-606,623-643`).
The modularization must preserve those semantics and make fresh-snapshot mutation the only available
config-write path.

## Decision

### Freeze behavior and preserve one public facade

After this ADR is approved, freeze new behavior in `connections-provisioning-service.ts` until the
modularization program completes. Each extraction PR must first characterize the behavior it moves
and must not combine extraction with product changes.

Replace the current class internally with approximately seven to nine cohesive modules behind a
`ConnectionsProvisioningFacade` of approximately 300-500 lines. The facade owns the public
`ConnectionsProvisioningPort`, audit wrapping, operation lookup, and an organization-scoped mutation
scheduler. The earlier four-module thesis — catalog, credential flows, disconnect, and config patch
— is rejected as insufficient because it omits snapshot and health projection, orchestrator
reconciliation, and GitHub flows.

Extract these modules, each absorbing approximately 300-1,500 lines as its behavior permits:

- `gateway-config-writer.ts`: the typed `config.get → snapshot → plan → config.patch` capability
  boundary defined below.
- `provider-read-model.ts` / `provider-catalog.ts`: pure provider identity, catalog,
  profile-ownership, and projection logic with no I/O.
- `connections-snapshot.ts`: Gateway health, session, channel, and agent projection.
- `model-provider-credentials.ts` / `model-provider-connect.ts`: API-key, setup-token, and
  device-flow state machines; model-flow registries; liveness proof; and rollback.
- `model-provider-disconnect.ts`: the paced disconnect protocol, including ownership planning,
  logout fan-out, restart-window waiting, and fail-closed post-checks.
- `model-routing.ts`: model enable/disable and provider-registry mutation.
- `orchestrator-reconciler.ts`: canonical agent config, election queue, and serialized
  reconciliation.
- `github-connections.ts`: GitHub device flow and vault behavior. GitHub does **not** share a
  generic flow registry with model-provider flows.

The facade owns all shared mutable state: flow maps, the organization-wide write reservation,
orchestrator queue, generation/finalization deduplication, clock, and sleeper. Extracted modules
receive an immutable `ConnectionProvisioningPrincipal`, opaque operation or flow handles, and a
scoped mutation lease. They do not receive maps or mutable service state. No extracted module may
import the facade. Credential-to-disconnect rollback crosses the seam through an injected narrow
callback, not a circular dependency.

### Make config mutation a capability-typed boundary

Replace the generic `configPatchParams({ raw, baseHash, replacePaths })` mechanism with this
capability:

```ts
type ConfigRevision = string & { readonly __brand: "ConfigRevision" };

interface GatewayConfigSnapshot {
  readonly revision: ConfigRevision;
  readonly config: GatewayConfigView;
}

interface GatewayConfigWriter {
  read(): Promise<Result<GatewayConfigSnapshot>>;
  commit(snapshot: GatewayConfigSnapshot, plan: ConfigPatchPlan): Promise<Result<ConfigCommit>>;
}
```

`ConfigPatchPlan` is a closed, named union such as `PluginAllowListPlan`, `CanonicalAgentGraphPlan`,
`ProviderDisconnectPlan`, and `ModelRoutabilityPlan`. It is not a generic `{ patch, replacePaths }`
escape hatch. The writer alone:

1. reads and validates the current Gateway config and opaque revision;
2. serializes `raw`;
3. inserts the revision as `baseHash`; and
4. compiles the exact replacement paths for the named capability.

A stale-hash retry **must call `read()` again and rebuild the plan from the new snapshot**. It must
never reuse an old plan, parsed config, revision, or hash.

The plans encode these verified replacement semantics:

- `auth.profiles`: delete object keys with `null`;
- `auth.order.<provider>`: replace the exact provider array;
- `agents.list`: replace the full canonical tuple array;
- `plugins.allow`: replace the allow-list array; and
- `agents.defaults.models`: delete object keys with `null`.

The authority for merge-patch deletion and exact array replacement is
`docs/openclaw/gateway/configuration.md:603-605,637-643`. Current examples of these shapes are
`connections-provisioning-service.ts:6339-6353` and `connections-provisioning-service.ts:4644-4658`;
those examples are evidence, not reusable write APIs.

### Share the Gateway wire before splitting the service (#163)

First extract a neutral `@opzava/openclaw-wire` workspace package containing frame codecs, protocol
constants, Ed25519 signing, and hello/challenge validation. The broker and workers consume this same
package. Workers must not depend on the broker application.

This package **shares the wire, not the credential**. Hot-path WebSocket ownership, events, retries,
backpressure, and runtime policy remain broker-side. The short-lived `operator.admin` JIT credential
and audited provisioning policy remain worker-side. No credential, ACL, tenant-routing policy, or
application orchestration belongs in `@opzava/openclaw-wire`.

### Make interactive runtime operations opaque (#164)

Reshape `GatewayRuntimePort` around opaque handles and typed login states:

- `beginDeviceLogin`, `pollDeviceLogin`, and `cancelDeviceLogin`;
- `beginSetupTokenLogin`, `pollSetupTokenLogin`, `submitSetupTokenCode`, and
  `cancelSetupTokenLogin`.

The Docker adapter alone owns FIFO, PTY, script, ANSI parsing, output redaction, process cleanup,
and filesystem cleanup. The worker receives typed states and opaque handles, never execution IDs,
log paths, or stdin paths. Cancellation resolves only after the adapter verifies process termination
and secure cleanup, preserving the existing intent documented at
`packages/ports/src/gateway-runtime.ts:217-224`.

### Move SQL behind bounded-context stores as a separate program (#162)

Do not create a universal `TenantStore` and do not expose `TenantTransaction` to application code.
Define bounded-context stores such as `TaskStore`, `RuntimeConversationStore`, and `IdentityStore`
with domain-typed methods and explicit tenant/workspace scope. Adapters are the only SQL owners.

Each store gets an in-memory fake and a shared contract suite. Retain real-Postgres tests for the
RLS denial invariant: an in-memory fake cannot prove PostgreSQL RLS. An RLS denial remains a hard
403, never an empty result.

Issue #162 starts independently after its own ADR. It uses a separate worktree and does not modify
this workers service. Its prerequisite #161 is already merged.

### Split tests through one shared harness

Extract `createConnectionsHarness({ admin, runtime, vault, clock, … })` into
`apps/workers/src/provisioning/__tests__/connections-harness.ts`. It owns the existing
`RecordingAdminClient`, `RecordingGatewayRuntime`, config-merge simulator, and setup-token port
helper. Add a `createPort({...})` harness operation and mechanically replace the 123 constructor
sites in `connections.test.ts`; do not rewrite its 12,154 lines of fixtures.

Move each `describe` block with the production module whose behavior it characterizes. Keep
cross-module facade tests for scheduler, audit, operation lookup, and end-to-end state transitions.

### Preserve the safety invariants in every slice

Each PR must add or retain focused characterization tests for every invariant it can affect:

- reject cross-organization poll and cancel;
- reject stale generations after every relevant `await`;
- prevent setup-token double submission;
- log out every agent, including `main`;
- preserve sibling-profile ownership and prevent over-deletion;
- do not charge the planned 20-second logout pacing against the 150-second transient budget;
- fail closed when durable-store or routable-model post-checks fail;
- preserve RLS denial as a hard 403, never an empty result; and
- never report disconnect success while a shared or inherited credential, or any routable model,
  survives.

### Deliver in this order

1. Approve this ADR, freeze behavior, and freeze characterization tests. No new behavior enters the
   service until the program completes.
2. #163: extract `@opzava/openclaw-wire`; migrate the broker, worker admin client, and bootstrap
   together; add direct bootstrap-handshake tests.
3. #166 foundation: introduce `GatewayConfigWriter` and its characterization/contract tests; move
   only composition helpers and confirmed fossils.
4. #164: introduce the opaque interactive-login contract; migrate the Docker adapter and harness.
5. #166: land sequential, single-purpose PRs with their tests in this order: provider read-model and
   snapshot → connect flows → disconnect protocol → orchestrator reconciler → GitHub flow → thin
   facade.
6. #162: begin independently after its own ADR and merged prerequisite #161, in a separate worktree,
   without touching this workers service.

## Owner decisions required before acceptance

### Amend ADR-003 for the audited admin/JIT path

**Recommended: Option 1 — amend ADR-003.** ADR-003 says that workers do not call OpenClaw directly
(`docs/adr/ADR-003-gateway-broker-acl-two-token.md:21-24`), but separately assigns the short-lived
JIT `operator.admin` credential and admin-only config writes to the provisioning worker
(`docs/adr/ADR-003-gateway-broker-acl-two-token.md:61-69`). Amend ADR-003 so the broker is
explicitly the only **hot-path** ACL and the provisioning worker is explicitly the audited
**admin/JIT** ACL. This resolves the textual contradiction while preserving the two-token
architecture already stated in ADR-003.

**Alternative: Option 2 — route worker admin operations through the broker.** This would centralize
all OpenClaw calls in the broker, but would move admin credentials and provisioning orchestration
into the hot-path boundary. It is a substantially larger redesign and is not recommended.

### Approve the `@opzava/openclaw-wire` package boundary

Approve a neutral package containing only frame codecs, protocol constants, Ed25519 signing, and
hello/challenge validation. Explicitly exclude credentials, ACL decisions, tenant policy,
retry/event policy, and broker or worker application behavior. This approval prevents “shared wire”
from growing into a shared privileged client or an application dependency in the wrong direction.

## Consequences

- Config mutation becomes reviewable by named capability instead of by arbitrary patch construction.
- The facade remains the stable public contract while concurrency, audit, and shared state have one
  owner.
- Pure catalog/projection logic can be tested without runtime infrastructure; state machines and
  protocols retain focused adapter and characterization tests.
- Broker and worker handshake behavior cannot silently drift, while their credentials and ACL roles
  remain separate.
- Docker mechanics stop leaking through an application port.
- The extraction requires several deliberately sequential PRs. During the program, contributors must
  accept a behavior freeze and temporary coexistence between facade and extracted modules.
- #162 remains a separate architectural migration; combining it with #166 would broaden the blast
  radius and obscure failures.

## Alternatives

- **Retain the monolith and divide it with comments.** Rejected: it preserves shared mutable state,
  broad dependencies, generic config writes, and a 12,154-line test bottleneck.
- **Use only catalog / credential flows / disconnect / config-patch modules.** Rejected: that split
  leaves snapshot projection, orchestrator reconciliation, and GitHub behavior in a residual
  coordinator that remains a second monolith.
- **Pass facade maps into extracted modules.** Rejected: it distributes concurrency ownership,
  permits cross-organization state access, and makes stale-generation checks optional.
- **Expose generic patch objects from `GatewayConfigWriter`.** Rejected: callers could still choose
  replacement paths or reuse a stale plan; the highest-risk seam would merely be renamed.
- **Share the broker application or one privileged OpenClaw client with workers.** Rejected: it
  couples hot-path and JIT policy and risks sharing credentials rather than wire mechanics.
- **Create a universal tenant repository.** Rejected: it recreates `TenantTransaction` under a new
  name, erases bounded-context language, and cannot make tenant/workspace scope explicit per domain
  operation.
- **Replace all database tests with in-memory fakes.** Rejected: fakes cannot prove PostgreSQL RLS
  denial or its required hard-403 mapping.
- **Rewrite the provisioning tests during extraction.** Rejected: fixture churn would destroy the
  characterization baseline precisely when behavior must remain frozen.

## Residual risk

The largest provisioning risk is a stale or partially migrated config-mutation path that reuses a
parsed config, plan, revision, or base hash after a long disconnect. The ADR and contract tests must
make fresh-snapshot mutation through `GatewayConfigWriter` the **only** available write path before
behavior is moved. Until all direct `config.patch` construction is removed and enforced by tests or
an import boundary, this risk remains.

## Related decisions and issues

- ADR-003: gateway-broker ACL and two-token model; owner amendment required above.
- ADR-018: web-to-broker principal trust; unchanged by this decision.
- Issues #161, #162, #163, #164, and #166.
- OpenClaw config mutation authority: `docs/openclaw/gateway/configuration.md:596-606,623-643`.
