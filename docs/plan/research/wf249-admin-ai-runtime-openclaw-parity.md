# WF-249 — Admin AI Runtime and OpenClaw parity

Status: **Wayfinder research evidence for
[#249](https://github.com/anthonykewl20/opzava/issues/249)**

Date: 2026-07-16

Scope: route ownership, page composition, evidence freshness, command boundaries, and drill-down
rules for **Gateway**, **Models & Providers**, **Agents**, **Runtime Skills**, **Sessions & Runs**,
and **Automations**. This memo resolves the AI Runtime family for final Admin synthesis
[#246](https://github.com/anthonykewl20/opzava/issues/246); it does not implement pages, select
production URLs, or edit canonical PRDs, ADRs, or the glossary.

Authority: active Admin map #241 designates this memo as **current Wayfinder planning input until
#246 consumes it**, after which it freezes unless an active map explicitly redesignates it. It does
not authorize implementation by itself. #246 and the named canonical-document owners must consume,
accept, or amend its proposed vocabulary and boundaries before implementation tickets treat them as
authority.

## Resolution

The six locked AI Runtime destinations are six owner-governed product views, not aliases for six
OpenClaw Control UI screens and not six slices of the current `ConnectionsSnapshot`.

1. **Admin Control Center composes; it does not own runtime state.** Each leaf keeps the product,
   runtime, configuration, authorization, and command owner named below.
2. **Fresh Platform Gateway RPC snapshots remain running-runtime truth.** They report the configured
   models, agent artifacts, installed Runtime Skills, sessions, tasks, and cron jobs running from
   the pinned Mainframe source. Task rows may carry an optional Flow association, but the current
   RPC surface does not expose Task Flow state or artifacts; upstream OpenClaw describes their
   native lineage but is not an observed Opzava runtime.
3. **Opzava remains product and workflow truth.** Agent employees, curated skill policy, automation
   definitions, assignments, workflow runs, DevTickets, approvals, audit receipts, and durable run
   traces remain Opzava records.
4. **Reconciliation is explicit.** A product record and its runtime artifact may be healthy,
   awaiting provisioning, missing, drifted, duplicated, or orphaned. Native artifacts never silently
   create product records, and product records never pretend a runtime artifact exists.
5. **Every browser contract is typed and redacted.** The generic `OpenClawAdminRpcPort` may remain
   an internal provisioning adapter, but it is never a page interface. Server responses never send
   raw Platform Gateway DTOs, Mainframe config, session keys, paths, prompts, transcripts, tool
   arguments, secrets, or reasoning into the browser; the bounded write-only secret-ingress rule is
   defined below.
6. **A command succeeds only after reconciliation.** Job acceptance is `pending`, not `configured`,
   `effective`, or `healthy`. A fresh authoritative readback must prove the result.
7. **The current monolithic Connections surface stays live until owner-by-owner parity is proven.**
   Final synthesis chooses target URLs and compatibility windows. The permanently redirected
   `/connections/gateway` path must not become the canonical Gateway destination.

This resolution follows the owner map in
[PRD-020](../../prd/PRD-020-admin-control-center.md#L251-L286), the Connections migration boundary
in [PRD-013](../../prd/PRD-013-connections-tools.md#L3-L19), the product/runtime split in
[PRD-006](../../prd/PRD-006-agent-roster-automation.md#L165-L229), and the internal-only Control UI
decision in [ADR-016](../../adr/ADR-016-mainframe-tracked-fork.md#L36-L65).

## Decision precedence and exclusions

The following precedence applies throughout this memo:

1. Semantic-owner PRDs and ADRs own product records, runtime/configuration commands, workflow state,
   security, and durable storage.
2. PRD-020 and the Admin foundation ledger own destination names, order, shell placement, and
   composition behavior.
3. Current code proves what is implemented and supplies migration seams.
4. Upstream OpenClaw docs describe native lineage; the tracked Mainframe source proves the pinned
   fork capability Opzava can build. Neither proves Opzava exposure or a live runtime observation.
5. Frozen prototypes and the old Control-UI port program are parity evidence only.

This memo intentionally does not:

- select production URL paths or API namespaces; #246 owns that synthesis;
- select exact capability-key strings or step-up policy; #247 owns those names and mechanisms;
- expose native Workflow or Node editors; ACC-D07 defers them;
- redefine Dev Board Runner enrollment, Docker review, or DevTicket workflow;
- turn Ask Admin history into a generic session store;
- make the native Control UI public, embeddable, or a normal Opzava command path;
- implement product code.

## Proposed relationship vocabulary — non-canonical until consumed

The following distinctions are required planning constraints, but the added names are proposed
vocabulary until #246 or the named canonical PRD/ADR/glossary owner accepts them. Implementations
must not treat capitalization here as creation of a canonical record type.

| Concept                         | Authority and relationship                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AgentEmployee**               | Opzava AI Workforce product identity, lifecycle, human-facing name, role, assignment policy, and governance. It may link to one managed runtime agent artifact through an opaque server-side reference.                                                                                                                                                                            |
| **Runtime agent artifact**      | Agent configuration plus its workspace, agent directory, auth/profile bindings, policy, and session store, observed through fresh Platform Gateway RPC snapshots. It is not an employee identity. An unmapped artifact is an authorized **Unmanaged Runtime Orphan**, not a new employee.                                                                                          |
| **Runtime Session**             | Platform Gateway conversation/context row owned by one agent. A stored session is not proof of liveness. One session can host multiple runs and can outlive them. Its raw key, transcript, overrides, and filesystem paths are internal.                                                                                                                                           |
| **Agent run**                   | One execution/turn in a Runtime Session. Fresh Platform Gateway `tasks.list/get` and typed session snapshots, where available, plus owner execution evidence supply runtime lifecycle facts; task/session events only invalidate and trigger an authoritative reread. No generic run RPC is assumed. A run is not an Assignment, WorkflowRun, DevTicket, or Automation definition. |
| **Runtime task-ledger item**    | Platform Gateway runtime activity over an ACP, subagent, cron, CLI, or media execution. It can reference requester/child sessions and a run. The running Platform Gateway retains terminal task records for a bounded period defined by Mainframe behavior; Opzava cannot rely on them as durable product history.                                                                 |
| **Run Trace**                   | Browser-safe Opzava projection that links an owning product record to opaque runtime evidence, approvals, artifacts, timing, and sanitized outcomes. It preserves durable history after native runtime detail is pruned.                                                                                                                                                           |
| **Automation definition**       | Opzava Department Workflows product record: trigger, schedule, approvals, budget, concurrency, retry, failure, and lifecycle policy.                                                                                                                                                                                                                                               |
| **Runtime Automation Artifact** | Provisioned Platform Gateway cron, Task Flow, or related runtime artifact that executes on behalf of an Opzava automation definition. It may be managed, missing, drifted, duplicated, or orphaned.                                                                                                                                                                                |
| **Runtime Skill**               | Instruction/code asset supplied by the OpenClaw-native skill capability in Mainframe and observed installed/effective through fresh Platform Gateway RPC snapshots. Installation scope, version, eligibility, allowlists, session snapshot, and callability remain separate facts.                                                                                                 |
| **Engineering Skill**           | Opzava-managed planning/engineering workflow skill. It is configured elsewhere and is not a Runtime Skill row merely because an agent harness can consume it.                                                                                                                                                                                                                      |
| **OpenClaw Node**               | Capability-bearing companion endpoint/host connected to the Platform Gateway with a node role. It can expose commands subject to pairing, Platform Gateway policy, and node-local approvals. It is not an AgentEmployee, Runtime Session, automation graph node, or Dev Board Runner.                                                                                              |
| **Dev Board Runner**            | Separately enrolled machine/tool identity governed by PRD-019/ADR-017. The same physical computer may also host an OpenClaw Node, but identity, authority, revocation, health, lease, worktree, and review access do not transfer between them.                                                                                                                                    |

OpenClaw documents the native separation directly: sessions are conversation context while tasks
track activity on top of them, and a task may link requester and child sessions plus a run
([OpenClaw tasks lines 341–367](../../openclaw/automation/tasks.md#L341-L367)). A Node is a
peripheral command surface rather than a Gateway or agent
([Nodes lines 10–25](../../openclaw/nodes/index.md#L10-L25)). Runtime Skills have separate
installation precedence, visibility, per-agent allowlists, and session snapshots
([Skills lines 32–106](../../openclaw/tools/skills.md#L32-L106),
[lines 473–516](../../openclaw/tools/skills.md#L473-L516)).

## Upstream parity and exact current-versus-target inventory

“Native” means the tracked Mainframe source at the pinned upstream OpenClaw lineage has a
capability. It does not mean that a fresh Platform Gateway RPC snapshot, Opzava adapter, BFF,
projection, authorization boundary, or page exists.

| Leaf                   | OpenClaw native capability                                                                                                                                             | Current Opzava adapter and browser coverage                                                                                                                                                                                                                                                                                                                  | Target v1 surface                                                                                                                                                                                                                                                      | Intentionally unavailable until a later owner contract                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gateway**            | Protocol handshake, health/status, config/schema/apply, update, instances, diagnostics; native `/overview`, `/instances`, `/config`, `/infrastructure`, `/debug`.      | `/connections` summary and `/connections/system` details consume a coarse `ConnectionsSnapshot`. `OpenClawGatewayPort` exposes assistant streaming, unsupported effective-tool read in the web adapter, and non-tenant-proof socket/circuit ops health. The worker has generic admin reads and configuration mutations.                                      | Dedicated readiness, compatibility, route/auth-scope readiness, safe effective-config summary, drift, setup/repair receipts, and owner-command launch.                                                                                                                 | Raw config editor, secrets, shared-token material, generic RPC console, embedded Control UI, or cross-component Health incident detail.                                          |
| **Models & Providers** | Configured/all model catalogs, auth profile/status, usage, routing and per-agent model state; no distinct native Models route is required for those RPCs.              | `/connections/providers`, provider setup dialogs, model enable/disable, device/setup-token flows, and disconnect are materially implemented through `ConnectionsProvisioningPort` and `/api/connections/model/*`. Legacy lead-orchestrator selection is co-housed in the snapshot and `/api/connections/orchestrator/set-main`, but is not Models authority. | Extracted provider catalog, credential health, enabled/routable models, tenant and per-agent effective projections, entitlement/usage evidence, setup flows, command receipts, and conflict state. Model-policy mutation routes to the owning Agent/Ask Admin command. | Raw credential stores, arbitrary config patch, tenant-wide “healthy” inferred from one agent/profile, unsupported rows, or cloned Ask Admin/Agent model-policy mutation.         |
| **Agents**             | Agent list/create/update/delete/files, tools catalog/effective, native `/agents` and `/ai-agents`.                                                                     | No AgentEmployee roster page, read port, or lifecycle application command. `/connections/system` can show `agent` health components. `ConnectionsSnapshot.orchestrator` and `ask-admin-agent.ts` describe Ask Admin lead/subagent runtime configuration, not a general employee roster.                                                                      | AI Workforce roster/detail joined to safe runtime reconciliation, model/policy summaries, provisioning receipts, drift, and authorized links to related run evidence.                                                                                                  | Direct native agent create/edit/delete, workspace or agentDir browser access, arbitrary tool-policy edits, or another assignment/task lifecycle.                                 |
| **Runtime Skills**     | Status/detail/search/install/update/enable/disable/upload, workshop and native `/skills`/`/skills/workshop`.                                                           | No Opzava page, BFF, typed runtime-skill projection, or provisioning port. Ask Admin currently has `skills: []`; that is not evidence that the tenant has no Runtime Skills. The web Gateway adapter cannot read effective tools.                                                                                                                            | Approved catalog/provenance joined to installed version/scope, runtime eligibility, per-agent permission, per-session snapshot/effectiveness, verification, provisioning receipts, and drift.                                                                          | Native ClawHub browser, source/file editor, install payloads, raw API-key updates, upload by default, or any implication that installation grants tools.                         |
| **Sessions & Runs**    | Session list/create/patch/delete and message subscriptions; task ledger list/get/cancel via RPC and audit via CLI/local registry only; run events; native `/sessions`. | `/connections/system` has only session count plus recent agent/time/age. Ask Admin persists its own conversations/turns and opaque runtime refs. The hot broker streams Ask Admin work only. No general typed session/run/task query or owner-routed operation port exists.                                                                                  | Cross-owner run index and detail using browser-safe Opzava IDs, bounded runtime session evidence, durable Run Traces, retention/pruned states, approvals/artifacts, and source-owner links.                                                                            | Raw transcript/log/reasoning/tool payloads, native session patch/delete, or generic abort/retry/steer controls that bypass the owning workflow.                                  |
| **Automations**        | Cron status/list/add/update/enable/run/remove/history, Task Flow state/CLI, task ledger, native `/cron` and `/automation`.                                             | No Opzava page, projection, workflow application package, BFF, or command was found. Mainframe contains the upstream-native Cron/Task Flow capability, but the v1 destination performs no runtime observation.                                                                                                                                               | **Reserved / unavailable in this version** destination only. V1 performs no Automation inventory, runtime fanout, reconciliation, execution history, attention query, or operational command even if an adapter happens to exist.                                      | All Automation data/commands, workflow designer, Nodes editor, arbitrary cron JSON, and workflow-definition lifecycle until a later canonical owner contract supersedes ACC-D07. |

The current coarse transport proves the gaps. `ConnectionsSnapshot` combines Gateway, Platform
Gateway health, providers, device flows, GitHub, and Ask Admin orchestrator state
([port lines 227–235](../../../packages/ports/src/connections-provisioning.ts#L227-L235)). Gateway
is only `active | unavailable`; sessions are only count/recent rows
([lines 97–103](../../../packages/ports/src/connections-provisioning.ts#L97-L103),
[lines 138–161](../../../packages/ports/src/connections-provisioning.ts#L138-L161)). Provider state
is much deeper ([lines 37–88](../../../packages/ports/src/connections-provisioning.ts#L37-L88)).

The hot Gateway port currently exposes only assistant streaming, effective-tool lookup, and coarse
ops health; its comments explicitly state that the shared internal caller is trusted and the ops
health capability is not tenant-proof
([OpenClaw Gateway port lines 115–142](../../../packages/ports/src/openclaw-gateway.ts#L115-L142)).
The generic admin port is stringly typed and returns `unknown`
([admin port lines 15–26](../../../packages/ports/src/openclaw-admin.ts#L15-L26)). Neither is an
acceptable leaf-page interface.

## Shared page-composition contract

Every AI Runtime leaf uses the same reading order while retaining owner-specific content:

1. **Leaf header and purpose** — title, one-sentence owner question, navigation breadcrumbs, and the
   effective access mode (`view`, `read-only while suspended`, or mutation-capable).
2. **Current evidence strip** — aggregate state, last observed and server-evaluated times, source
   count, stale/last-known-good (LKG) label, and Refresh. Aggregate state never hides contradictory
   per-source states.
3. **Attention and reconciliation summary** — owner-safe counts and actionable conditions; no count
   is queried or rendered for a denied source.
4. **Inventory/list** — filterable, paginated, keyboard navigable, and based on stable browser-safe
   product IDs. Empty, not configured, unknown, and unavailable are different admitted states.
   Unauthorized access is an accessible hard-403 admission response, never a row, count,
   placeholder, or admitted page state.
5. **Selected detail** — a same-route panel or canonical product detail route chosen by #246. It
   shows source-qualified evidence and authorized owner links; it does not expose native keys.
6. **Receipts and recent activity** — safe command status, reconciliation result, actor, and audit
   reference. This is not a raw log viewer.

ACC-D07 Automations is the explicit v1 exception to steps 2–6: after the shared header it renders
only the accessible reserved/unavailable explanation, performs no source fanout, and exposes no
inventory, evidence strip, attention, detail, receipts, or activity.

Leaf pages may summarize sibling-owner evidence only through a browser-safe projection. The linked
owner route remains the place for details and mutation. Partial failure renders locally; it does not
replace the page with a global error or mark another source healthy.

**Health**, **Usage & Costs**, and **Security & Audit** are separate PRD-020 destinations outside
this AI Runtime memo. References to them define a drill-out boundary, not a promise that #249 ships
those pages. A link appears only when the destination registry says the actor can enter an
implemented target; otherwise the AI Runtime leaf keeps a local safe summary without a dead or
unauthorized link. Their own Wayfinder/semantic-owner contracts govern their layout and commands.

## Deterministic evidence and freshness

### Required envelope

Evidence is a discriminated union; a failed read is not forced to pretend it has a source snapshot:

```text
SuccessfulSnapshotBase {
  kind: snapshot
  sourceOwner
  sourceId              # browser-safe Opzava classification, never a raw Platform Gateway ref
  provenance            # safe label and authorized owner link
  observationGeneration # server-issued monotonic generation allocated at read admission
  checkpoint            # source identity/causality token; may be an unordered hash
  sourceTimestamp?      # nullable; only when the source supplies a trustworthy timestamp
  observedAt            # trusted server time acquired; must be <= evaluatedAt
}

SuccessfulSnapshotEvidence = SuccessfulSnapshotBase &
  | {
      roleState:
        | { evidenceRole: current; currentState: live | not-configured }
        | { evidenceRole: last-known-good; lastKnownGoodState: within-budget }
      freshnessEvaluation: {
        kind: evaluated-within-budget
        evaluatedAt       # current trusted server time for this response/composition
        freshnessBudget   # valid duration selected from owner policy
        staleAfter        # valid absolute boundary = observedAt + freshnessBudget
      }
    }
  | {
      roleState:
        | { evidenceRole: current; currentState: stale }
        | { evidenceRole: last-known-good; lastKnownGoodState: stale }
      freshnessEvaluation: {
        kind: evaluated-stale
        evaluatedAt
        freshnessBudget
        staleAfter
      }
    }
  | {
      roleState:
        | { evidenceRole: current; currentState: unknown }
        | { evidenceRole: last-known-good; lastKnownGoodState: unknown }
      freshnessEvaluation: {
        kind: unknown
        evaluatedAt
        safeUnknownReason
        freshnessBudget?  # only when a valid policy duration is known
        staleAfter?       # only when a valid absolute boundary can be computed
      }
    }

ReadAttemptBase {
  kind: read-attempt
  evidenceRole: current
  sourceOwner
  sourceId
  observationGeneration # same server-issued ordering domain used by snapshots
  attemptId             # correlation/idempotency only; never an ordering token or source revision
  observedAt            # trusted server attempt-observation time; must be <= evaluatedAt
  evaluatedAt           # current trusted server time for this response/composition
}

ReadAttemptEvidence = ReadAttemptBase &
  | { state: pending }
  | { state: unavailable | unknown; safeFailureCode }
```

Multi-source rows retain **exactly one current envelope plus at most one LKG snapshot per source**;
they do not inherit a page-level timestamp. Cardinality is enforced by
`(tenant/workspace, sourceOwner, sourceId, evidenceRole)`, while serialized evidence keys include
`(tenant/workspace, sourceOwner, sourceId, kind, evidenceRole, observationGeneration)`. A current
failed read and a prior successful LKG are therefore two separate envelopes with independent
attempt/snapshot checkpoints and timestamps, not two current facts. State is derived server-side
after evidence-cache retrieval and immediately before every final composition/RSC serialization:

- **live** — the latest authoritative current snapshot succeeded, is interpretable, and
  `evaluatedAt <= staleAfter` (equivalently, `evaluatedAt - observedAt <= freshnessBudget`);
- **stale** — the latest authoritative current snapshot is interpretable and
  `evaluatedAt > staleAfter`;
- **pending** — the newest admitted read attempt has not completed; any prior successful current
  snapshot is retained only as the optional LKG;
- **unavailable** — the current authorized read-attempt failed; any prior LKG remains a separate
  successful snapshot envelope;
- **unknown** — the current read/snapshot cannot be interpreted, evidence conflicts without a safe
  resolution, source-clock validation failed, or the freshness policy/boundary is missing/invalid;
- **not-configured** — a within-budget current authoritative snapshot confirms absence; an error,
  denied read, empty payload, or missing adapter can never infer this state.

The union couples role and freshness evaluation so invalid pairs such as `live + stale` or
`not-configured + unknown` are unrepresentable. A current snapshot never also carries an LKG state,
and an LKG snapshot never carries a current state. An LKG renders as
`last-known-good (within budget)`, `last-known-good (stale)`, or `last-known-good (unknown)` from
its `lastKnownGoodState`, and it never enables a mutation or contributes “healthy,” “effective,” or
“running” truth.

`sourceTimestamp` is nullable and remains transport/source-clock plausibility evidence only; a
source without a trustworthy timestamp leaves it null rather than copying `observedAt`. When
present, validate it against source-specific monotonic rules and bounded skew, including rejection
of a timestamp beyond `observedAt + allowedSourceClockSkew`; never use its delta as cached freshness
age. Server-owned time must satisfy `observedAt <= evaluatedAt`. A future server observation or an
implausible source clock makes the affected interpretation `unknown` and can never produce `live`,
even when the cache is recent. Evidence caches may retain immutable source snapshots, but
`evaluatedAt`, `staleAfter` comparison, and derived state are recomputed after cache retrieval
immediately before serialization. Final composed/RSC responses cannot reuse a cached derived state
or old `evaluatedAt`, so an old snapshot cannot remain `live` forever.

`reserved / unavailable in this version` is a page-capability availability state outside the runtime
evidence enum. Use it when the destination is intentionally present but its safe owner adapter is
not implemented. It carries no runtime absence claim. `not-configured` remains available only after
an implemented adapter completes a fresh authorized read that proves configuration is absent.
Automations is additionally policy-reserved by ACC-D07 for all of v1, so adapter existence does not
remove this state or authorize a read.

Every authorized source read receives a strictly increasing, server-issued `observationGeneration`
at admission, shared by read-attempt and successful-snapshot variants in that source's ordering
domain. Admission compare-and-swaps the single current slot to the new attempt and may demote the
prior successful current snapshot to the optional LKG. Completion may replace the current attempt
only when its generation still equals the latest admitted generation; an older slow completion is
rejected even if its wall clock, source timestamp, attempt ID, or source checkpoint appears newer.
`attemptId` is correlation/idempotency only, while `checkpoint` proves source identity/causality and
may be a non-orderable hash. An accepted failed completion preserves the optional prior LKG; an
accepted success becomes current and may replace LKG only under the owner's retention rule.
Realtime/WS events are hints only: they invalidate the affected cache and trigger a new authorized
source read, but never enter the observation-generation/CAS path as authoritative evidence. An owner
may normalize an event directly only after its contract defines authoritative ordered-event
semantics and a separate safe admission rule. The browser does not order evidence, reinterpret
clocks, or promote a separately enveloped LKG snapshot.

Freshness budgets apply per evidence item/class, never per page. A composite summary may be `live`
only while every fact required for that summary is live; its effective budget is the strictest
applicable required fact. For example, an Agent detail can retain a two-minute agent-reconciliation
row while its active-run summary becomes stale after 60 seconds. The page shows those local states
separately and cannot use the looser agent budget to keep the aggregate “active” label live.

### Default maximum freshness budgets

These are target maximums for #246's implementation graph; an owner may require a stricter value.
Loosening them requires an approved owner-contract change. Each duration becomes a snapshot's
`freshnessBudget`; the server computes its absolute `staleAfter` boundary from `observedAt`. Poll
cadence is independent—the current 30-second Connections refresh is an implementation detail
([auto-refresh lines 6–30](../../../apps/web/components/connections/connections-auto-refresh.tsx#L6-L30)).

| Evidence class                                                            | Default maximum `freshnessBudget` | Authoritative clock/checkpoint                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway reachability, protocol, scope readiness, circuit and active route | 60 seconds                        | Fresh Platform Gateway RPC readiness snapshot plus broker route generation; connected socket alone is not health.                           |
| Active session/run/task execution state                                   | 60 seconds                        | Fresh typed Platform Gateway task/session evidence or owner execution query; stored session timestamp is not liveness.                      |
| Agent runtime reconciliation                                              | 2 minutes                         | Fresh Platform Gateway `agents`/effective-policy RPC snapshot plus AgentEmployee version.                                                   |
| Provider auth/routing and per-agent effective model                       | 5 minutes                         | Source-qualified, fresh Platform Gateway config/routing/auth RPC snapshots; each source keeps its own checkpoint.                           |
| Runtime Skill installed/eligible/effective state                          | 5 minutes                         | Fresh Platform Gateway skill inventory plus agent/session RPC snapshot revision.                                                            |
| Provider usage/quota                                                      | 15 minutes                        | Fresh provider/Platform Gateway usage snapshot; never reused as auth or routing health.                                                     |
| Opzava product records and provisioning/audit receipts                    | 5 minutes                         | Postgres record version/outbox/audit checkpoint invalidates cached evidence earlier; their runtime projections still use the budgets above. |

When a source cannot declare a trustworthy clock or budget, the state is `unknown`; the UI does not
guess. Refresh on focus or manual request is allowed, but repeated failures must back off and
preserve the prior snapshot only in a separate LKG envelope.

## Shared authorization, caching, and identifier rules

Exact capability-key strings remain #247's work. #249 locks these semantic actions:

| Semantic action                   | Meaning                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `view`                            | Enter the leaf and read its authorized summaries. Requires root Admin admission plus leaf admission.              |
| `configure`                       | Change an Opzava-owned configuration draft or policy through its owner service.                                   |
| `provision`                       | Apply an approved configuration/identity/artifact change to the Platform Gateway through the provisioning worker. |
| `operate`                         | Perform a bounded runtime action such as owner-authorized pause/cancel/retry; never a generic session mutation.   |
| `inspect trace`                   | Read a resource-level, redacted Run Trace or runtime evidence detail.                                             |
| `repair`                          | Launch an explicit diagnosis/remediation job with impact, approval, audit, and readback.                          |
| `install/update runtime software` | Install/update/disable a Runtime Skill or runtime component through supply-chain and install-policy gates.        |

Rules:

- Authorize root, leaf, tenant/workspace, and resource before any upstream fanout. An expected
  denial performs no query and reveals no existence, ID, count, LKG, or timestamp.
- Expected root, leaf, resource, foreign-ID, and random-safe-ID denial on an admitted route is a
  hard 403 response, not a redirect, empty list, or owner-selected 404. Foreign existing and random
  IDs use an indistinguishable disclosed body and bounded timing/error class, so 403 reveals no
  existence. Unexpected downstream 403 after successful admission is a security/contract failure.
- Uniform hard 403 is the target Admin admission/resource contract selected by #249 from PRD-020's
  denied deep-link rule. #246 and the affected semantic owners must adopt it canonically before
  implementation; until then the implementation ticket stays blocked rather than silently choosing
  an owner-specific 404.
- Reauthorize every command; a rendered button is not authority. Suspended tenants are readable only
  where the owner contract permits and are never mutable.
- Cache keys include tenant/workspace, actor, effective capability/authorization version,
  destination schema version, parameters, observation generation, and source checkpoint where
  applicable. Capability revocation invalidates route and data caches.
- Public URLs and browser DTOs use owner-classified Opzava IDs. Raw session keys, run IDs, route
  IDs, agentDir/workspace paths, tenant IDs, cron IDs, Task Flow IDs, and provider profile keys are
  resolved server-side with tenant/resource checks. This is mandatory IDOR protection.
- SecretRef values, provider access/refresh tokens, prompts, commands, environment, transcripts,
  tool inputs/outputs, and hidden reasoning are never returned into HTML, RSC payloads, browser
  JSON, query strings, telemetry, errors, or cache entries.
- Provider API keys and secret setup/access tokens are allowed only as **write-only browser
  ingress** in a protected form. The server never echoes them; after submission the client clears
  the input and retains no value in DOM state, storage, history, cache, telemetry, error detail, or
  receipt.
- A provider-classified OAuth device **user code** and verification URL are displayable,
  short-lived, non-secret flow instructions. They are not credentials, are removed on
  completion/expiry, and are never confused with the secret device access/refresh token returned to
  the server-side flow.

The current Connections read path redirects a forbidden read to `/`, and mutations use a fixed
Owner/Admin role check. Both are migration inputs, not target behavior. The worker internal route
also trusts claims supplied by a shared bearer caller; new typed endpoints need defense-in-depth
authorization rather than relying only on the BFF.

## Shared command lifecycle

Every mutable leaf uses this lifecycle:

```text
authorize + tenant/resource admission
  -> validate schema, base hash, SecretRefs, policy, and approval
  -> accept idempotent job
  -> durable pending receipt
  -> execute with least privilege
  -> fresh authoritative readback
  -> applied | failed | drifted | indeterminate
```

Additional rules:

- Job acceptance is never displayed as final success.
- The pending receipt contains a browser-safe operation ID, owner, actor, requested effect, accepted
  time, and authorized audit link; never a credential or raw Platform Gateway payload.
- Readback binds the expected base hash/version and resulting checkpoint. A restarted Platform
  Gateway or ambiguous timeout remains pending/indeterminate until reconciled.
- Failure preserves prior evidence only in a separately checkpointed/timestamped LKG envelope and
  explains a safe recovery action.
- Concurrent commands against one resource carry the expected product version and runtime base hash.
  The owner serializes or compare-and-swaps them; one compatible idempotent replay may reuse its
  receipt, while a conflicting second intent fails with a safe conflict and fresh state. Last writer
  wins is forbidden.
- Repairs are explicit jobs. Diagnostics may be non-mutating; any `doctor --fix`-equivalent work is
  a separate approved mutation with impact and receipt.
- Browser and ordinary page services never hold `operator.admin`. Only the provisioning worker may
  acquire job-scoped, short-lived admin authority.

There is a current contract violation that blocks blindly reusing the admin client for new leaf
commands: the worker bootstraps/caches a durable admin device profile and can fall back to a shared
Platform Gateway token, while ADR-003 requires short-lived, job-scoped, audited JIT admin. #246 must
place a credential-lifecycle remediation ticket before any new Gateway, Agent, or Runtime Skill
mutation; the same prerequisite applies to any post-v1 Automation mutation after ACC-D07 is
superseded. Reads must fail closed rather than broaden scopes when paired-device or exact-scope
health is unverifiable.

## Leaf contracts

### Gateway

**Owner question:** Is this tenant's Platform Gateway reachable, protocol-compatible, authorized,
correctly routed, and safely configured for Opzava runtime use?

**Composition**

- readiness summary: lifecycle, reachability, circuit, protocol/version compatibility, route
  generation, entitlement/suspension, expected operator scopes, last heartbeat, and evidence age;
- redacted effective configuration: region/exposure label, auth mode label, reload/restart impact,
  config checkpoint/base hash, declared route, and drift—never endpoints containing credentials or
  raw config;
- setup/repair receipts and last safe diagnosis;
- local runtime dependencies required for Gateway operation, with cross-component detail linked to
  **Health** rather than duplicated;
- authorized Refresh, Configure, Provision/Repair launch, safe break-glass status, and links only to
  an authorized Opzava runbook, receipt, or out-of-band procedure.

**Gateway versus Health**

Gateway owns whether its runtime capability can be used now and the safe configuration needed to
make it usable. Health owns cross-component diagnostic topology, incidents, historical operational
health, remediation evidence, and topbar aggregation. A Gateway degradation may create Health
attention, but neither page becomes the other's source of truth.

**Drill-down boundary**

The detail may show safe protocol mismatch, missing scope, restart impact, or configuration drift.
It links to Health for component incidents and to Security & Audit for audit detail. It never
renders native `/config`, `/debug`, logs, raw DTOs, or a general RPC console.

The native Control UI connects directly to the Platform Gateway WebSocket and already exposes broad
config, agent, session, cron, skill, and node controls
([Control UI lines 10–15](../../openclaw/web/control-ui.md#L10-L15),
[lines 98–155](../../openclaw/web/control-ui.md#L98-L155)). Actual SSH/port-forward Control UI
access remains an out-of-band operator procedure: Opzava never publishes product navigation, launch,
iframe, proxy, or deep link to it. The Gateway leaf may show safe break-glass readiness and link to
an authorized Opzava runbook/receipt/procedure that explains the separate operator action. Actions
performed out of band are not falsely labeled Opzava-audited. If readiness is unverifiable, show
that status without offering a product launch path.

### Models & Providers

**Owner question:** Which providers and models are configured, authenticated, entitled, routable,
allowed, and effective for each relevant agent?

**Separate axes**

- catalog availability and provenance;
- configured/enabled model state;
- credential presence and source-scoped auth health;
- tenant routing/defaults;
- per-agent profile, allowed models, and effective model;
- entitlement and usage/quota evidence;
- setup/provisioning receipt and last reconciliation.

A catalog row never implies authentication, a credential never implies a routable model, a
tenant-wide default never proves a per-agent profile is usable, and usage data never proves auth.

**Evidence conflict resolution**

- Fresh Platform Gateway RPC config/routing snapshots are running-runtime routing truth.
- Opzava provisioning receipts are command/audit truth.
- `models.authStatus`, agent profile evidence, provider probes, and CLI-derived store evidence
  retain separate source labels and scopes.
- The current port comment calls `models.authStatus` primary while the worker notes that CLI model
  status can see stores the RPC under-reports. No arbitrary winner is selected. Contradiction at the
  same scope produces `unknown/conflict`, blocks health/effectiveness claims, and offers a safe
  refresh/repair path.
- The worker may read sensitive native payloads internally to produce a typed redacted DTO, but it
  never forwards an `includeSensitive` result.

**Composition and commands**

Preserve current provider discovery, API-key/device/setup-token connect, disconnect, model
enablement, and routability semantics while extracting them behind a Models owner interface. Setup
remains a guided form; credentials are write-only. Every configure/provision operation follows the
shared receipt/readback lifecycle. Existing `/api/connections/model/*` may remain a compatibility
namespace until consumers move; #249 does not rename it prematurely.

The target lead-orchestrator action is **split, not cloned** into Models & Providers, but this
reassignment is proposed and blocked on explicit PRD-005/006/013 alignment. PRD-013 remains the
canonical owner of the live legacy provider-routing/`set-main` action until that amendment lands;
Models exposes no replacement mutation in the interim.

- after canonical alignment, Ask Admin primary/fallback chain mutation routes to the PRD-005 Ask
  Admin owner command informed by #210/#223, even when Models displays its effective projection;
- after canonical alignment, general AgentEmployee model-policy mutation routes to the PRD-006 AI
  Workforce owner command;
- `/api/connections/orchestrator/set-main` remains a bounded legacy compatibility action until that
  owner migration lands; it remains PRD-013-owned and is not adopted by the Models interface.

**Reviewer tool/model ownership boundary**

Models & Providers supplies catalog, authentication, entitlement, and routability evidence only. A
model being routable does not select a Reviewer or prove that local Review can run.

| Concern                                                  | Authority                                                          | Models & Providers role                                      | Forbidden shortcut                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Candidate tool/model catalog and routability             | PRD-013 Runtime Control                                            | Own the safe catalog/routability projection                  | Treating catalog enablement as Reviewer selection                                 |
| Reviewer tool/model selection and compatibility          | ACC-058 **Environments**                                           | Supply an authorized catalog reference only                  | Models writing the selected Reviewer tool/model                                   |
| Local Docker access/readiness and evidence-upload health | ACC-058 **Environments**                                           | No authority; may link to an authorized readiness projection | Inferring Review readiness from provider/model health                             |
| Enrolled executable and Runner eligibility               | ACC-058 **Runners** placement plus PRD-019/ADR-017 Runner protocol | No authority                                                 | Treating a model row as an installed executable or eligible Runner                |
| Reviewer identity, independence, policy, and verdict     | PRD-019/ADR-017 **Dev Board Review**                               | Display only an owner-authorized effective reference         | Models creating Reviewer identity, changing Review policy, or recording a verdict |

#246 must preserve these owner seams in route composition and downstream tickets; it must not move
Reviewer selection into Models & Providers merely because the selected value references a model.

**Drill-down boundary**

Provider detail may show safe account label, auth method, expiry, scopes, enabled/catalog models,
effective agents, source evidence, and receipts. It never shows tokens, profile files, environment,
raw config, or other agents' credentials. Usage & Costs owns cross-provider spend/quota aggregation;
Models may show only provider-local evidence needed to judge routing readiness.

### Agents

**Owner question:** Which governed AgentEmployees exist, what are their roles/capabilities, and do
their managed runtime agent artifacts match the intended product state?

**Reconciliation states**

- `product-only / awaiting provisioning`;
- `managed / healthy`;
- `runtime missing`;
- `drifted`;
- `duplicate-link conflict`;
- `unmanaged runtime orphan`;
- `deprovisioning / receipt pending`;
- `unknown` when authorized evidence cannot be reconciled.

An orphan is visible only to an authorized operator and never auto-promotes into AgentEmployee.
Duplicate mapping blocks mutation until resolved. Current Platform Gateway `agent` health RPC
snapshots are runtime evidence only; current Ask Admin orchestrator/subagent rows are one managed
configuration, not the roster.

**Composition**

- AgentEmployee roster grouped by Opzava/platform-development role for v1;
- product lifecycle/status plus runtime reconciliation badge;
- safe model/provider, Runtime Skill, tool-policy, node-capability, and session/run summaries;
- provisioning/drift receipts and owner-authorized lifecycle/repair actions;
- resource-authorized links to related Sessions & Runs and Dev Board work.

PRD-006 retains future Marketing, Support, Finance, CRM, and General-VA department values, while
PRD-020 excludes those business destinations from the current Admin shell. V1 Agents must show only
the Opzava/platform-development operating scope and must not reintroduce the deferred business
program through roster rows, search, filters, counts, direct detail/deep links, API payloads,
grouping, or navigation. This needs a canonical PRD-006 clarification, not deletion of future domain
values. Agent leaf implementation tickets are blocked until that scope amendment is approved; #246
may map the dependency but must not encode the proposed filter as settled PRD-006 authority before
then.

**Drill-down boundary**

Agent detail shows product identity, intended policy, safe runtime status, and receipts. It does not
expose workspace/agentDir/auth files, raw prompts/config, native agent file operations, or direct
create/update/delete. Lifecycle begins at AI Workforce application commands and provisions through
the worker. Assigning DevTickets remains Dev Board authority.

### Runtime Skills

**Owner question:** Which runtime skills are approved, installed, verified, eligible, permitted, and
actually effective for the relevant agent/session?

**Separate axes**

- approved catalog identity, source, version, provenance and verification;
- installation scope: workspace, per-agent/project-agent, personal/shared managed, or extra/plugin;
- installed version and precedence winner;
- dependency/install-policy eligibility;
- per-agent skill allowlist visibility;
- per-session skill snapshot version and refresh state;
- tool-policy-permitted and effective/callable state;
- provisioning receipt, drift, and update availability.

Installation does not grant tools. A visible skill may still be non-callable because tool policy
denies required capability. An existing session can use a previous skill snapshot until the running
Platform Gateway applies the skill-refresh behavior defined by the pinned Mainframe source. Ask
Admin's current `skills: []` is an agent-specific intended state, not tenant inventory.

**Composition and commands**

The list defaults to approved product catalog rows joined to runtime installation/effectiveness.
Authorized unmanaged runtime skills appear only as drift/orphan evidence. Detail shows safe
metadata, scope, version, verification, eligibility failures, affected agents/sessions, receipts,
and repair guidance. Install/update/disable/uninstall are supply-chain-sensitive provisioning jobs
that fail closed when policy, provenance, verification, or admin authority is unavailable.

**Drill-down boundary**

No source body, install archive, arbitrary Git URL, API-key field, raw environment, or native
Workshop/ClawHub browser appears here. Engineering Skills and the Ask Admin skill subset remain
separate Configure destinations/policies. Effective tools may be linked as a safe policy summary;
the skill page never mutates tool grants.

### Sessions & Runs

**Owner question:** What executed, for which owning product record, under which governed agent and
policy, and what safe evidence remains?

**Composition**

- paginated Run Trace index with source type, owner record, AgentEmployee, state, timing, approval,
  artifacts, and evidence freshness;
- optional bounded Runtime Session context: safe label, agent, created/updated times, active-run
  count derived from fresh runtime evidence, retention state, and source link;
- Run Trace detail with product events, sanitized runtime milestones, approval/operation receipts,
  artifacts/evidence package, terminal summary, and explicit pruned/unavailable runtime detail;
- owner links to Assignment, WorkflowRun, DevTicket, or Ask Admin conversation when the actor is
  authorized for both resources. Automation-owned executions remain excluded until a later canonical
  contract supersedes ACC-D07.

Runtime sessions, Platform Gateway task rows, Run Traces, Assignments, WorkflowRuns, and DevTickets
never share one generic “task” or “run” identity. Browser IDs are Opzava projections; native IDs
remain opaque server-side. Ask Admin continues to own its conversation transcript. This leaf may
link to it but does not copy or become its history authority.

V1 does not import native cron/Task Flow rows into Sessions & Runs as a back door to Automation
inventory or execution history. Such runtime evidence remains unqueried by Admin product views until
the later Automation owner contract supersedes ACC-D07.

**Retention and control**

Platform Gateway task snapshots follow the terminal-task retention behavior defined by the pinned
Mainframe source; Opzava durable Run Traces must retain the product/audit contract and explicitly
label native detail `pruned` or `unavailable`. A stored session is not “running.” Liveness requires
a fresh run/task/event owner checkpoint.

There is currently no typed general operation port, so #246 must not assume abort, retry, steer,
handoff, session patch, or delete controls. When an owner later exposes a typed operation, the leaf
may launch it only through that Assignment, WorkflowRun, Automation, DevTicket, or runtime owner;
generic `cancel session` can never bypass leases, approvals, gates, or cleanup.

**Drill-down boundary**

No raw transcript, hidden reasoning, provider payload, tool arguments/results, stdout/stderr, or
filesystem paths. Owner-classified sanitized evidence must fail closed if redaction cannot be
proven. Large evidence is paginated or summarized server-side, not shipped and hidden with CSS.

### Automations

**V1 owner question:** Is the reserved Automation destination present and clearly unavailable
without implying that runtime or product Automation data was queried?

ACC-D07 makes Automations **reserved-only for all of v1**. Adapter existence, a future projection,
or native Mainframe capability does not activate inventory, reconciliation, execution history,
attention, receipts, or operations under #246. The page performs no Automation source fanout and
shows only an accessible `reserved / unavailable in this version` explanation; this is never
`not-configured`, empty, healthy, stale, or unavailable runtime evidence. Other AI Runtime leaves
cannot surface Automation inventory/history as a substitute.

**Deferred future reconciliation vocabulary — not a v1 interface**

- `definition awaiting provisioning`;
- `managed runtime artifact`;
- `runtime artifact missing`;
- `drifted`;
- `duplicate artifact conflict`;
- `unmanaged runtime orphan`;
- `provisioning/repair pending`;
- `unknown`.

Platform Gateway cron and task-ledger snapshots are runtime inputs, not product definitions. An
orphan never auto-creates an Automation definition. A task-ledger row may carry an optional Flow
association, but the current Mainframe pin exposes Flow state, inspection, and cancellation only
through the CLI and has no general `flow.*` Platform Gateway RPC; implementations must not infer a
Flow snapshot or invent such an RPC. The states above are preserved only as future planning
vocabulary for a later semantic-owner contract and cannot be emitted by the v1 destination.

PRD-006 describes a future full “New automation,” publish/edit/pause/delete/repair experience, while
PRD-020 and ACC-D07 make v1 reserved-only and defer Workflow/Node modeling. This memo resolves the
conflict for #246 as follows:

- no inventory, reconciliation, history, attention, refresh/readback query, definition/design
  lifecycle, raw cron, Workflow/Node editor, or operational command ships in v1;
- an adapter discovered or implemented during migration remains unused by this destination;
- only a later canonical contract that explicitly supersedes ACC-D07 may activate data or commands;
- the canonical PRD-006/PRD-020 wording must be aligned before that later work is ticketed.

Prompts, commands, environment, trigger secrets, webhook tokens, delivery targets, and raw cron or
Task Flow payloads remain server-side.

## Ownership and command matrix

| Capability / action                 | Product or composition owner                                                                                           | Running-runtime source                                                             | Normal interface                                               | Admin/provisioning interface                                  | Forbidden shortcut                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Compose leaf/navigation             | PRD-020 Admin Control Center                                                                                           | None                                                                               | capability-backed destination registry and owner queries       | None                                                          | storing copied runtime truth in the shell                                      |
| Read Gateway readiness              | PRD-013 + Platform Ops                                                                                                 | fresh Platform Gateway RPC readiness snapshot                                      | tenant-authorized typed readiness query                        | diagnostics job for deeper evidence                           | browser calling non-tenant-proof ops health directly                           |
| Configure/repair Gateway            | PRD-013 + Platform Ops                                                                                                 | fresh Platform Gateway effective-config snapshot                                   | typed draft/receipt query                                      | audited worker job with base hash/schema/SecretRefs/JIT admin | raw `config.patch/apply`, shared token, embedded Control UI                    |
| Read/configure providers and models | PRD-013 Runtime Control                                                                                                | fresh Platform Gateway config/auth/routing snapshots                               | extracted Models query and typed setup/routing commands        | audited worker provisioning + fresh readback                  | raw credential/config/profile access                                           |
| Agent identity/lifecycle            | PRD-006 AI Workforce                                                                                                   | fresh Platform Gateway runtime-agent snapshot                                      | AgentEmployee query and lifecycle command                      | worker provisions/repairs runtime artifact                    | native browser agent CRUD or auto-importing an orphan                          |
| Runtime Skill catalog/policy        | PRD-007 Knowledge/Skills catalog + PRD-013 Runtime Control/Platform Ops for setup, provisioning, and runtime admission | fresh Platform Gateway installed/effective skill snapshot                          | catalog + runtime reconciliation query                         | supply-chain-gated install/update/disable job                 | direct `skills.*`, source/archive exposure, or implied tool grant              |
| Ask Admin primary/fallback chain    | Current: PRD-013 legacy set-main. Proposed after canonical alignment: PRD-005 Ask Admin, informed by #210/#223         | fresh Platform Gateway effective agent/model snapshot                              | typed Ask Admin model-policy query/command after alignment     | owner-directed worker provisioning + readback                 | Models page or legacy set-main action becoming a second authority              |
| AgentEmployee model policy          | Proposed after canonical alignment: PRD-006 AI Workforce                                                               | fresh Platform Gateway effective agent-model snapshot                              | typed AgentEmployee policy query/command after alignment       | owner-directed worker provisioning + readback                 | tenant provider setup directly mutating employee policy                        |
| Read sessions/run traces            | PRD-006/owner context of each execution + Runtime Control/Platform Ops                                                 | fresh Platform Gateway session/task RPC snapshots plus owner execution evidence    | cross-owner safe index; resource-level owner query             | bounded diagnosis only                                        | raw `sessions.list` rows as product identity or transcript/log exposure        |
| Cancel/retry/handoff execution      | owning Assignment/WorkflowRun/DevTicket; Automation only after a later contract supersedes ACC-D07                     | fresh typed Platform Gateway task/session evidence or owner active-execution query | typed owner operation, if implemented and authorized           | runtime cleanup through owner job                             | generic session cancel/patch/delete that bypasses workflow state               |
| Automation definition/lifecycle     | PRD-006 Department Workflows + Runtime Control/Platform Ops, deferred under ACC-D07                                    | none queried by the v1 destination                                                 | reserved/unavailable placeholder only; later contract required | none in v1                                                    | activating inventory/reconciliation/history/commands because an adapter exists |
| Audit/receipt detail                | Security & Audit plus originating owner                                                                                | no generic audit RPC; source-specific typed RPC evidence only where available      | browser-safe Opzava audit reference and receipt projection     | owner audit ingestion/reconciliation                          | claiming CLI/native Control UI activity was Opzava-audited                     |

## Deep-module seam for implementation planning

Do not replace `ConnectionsSnapshot` with one larger “AI Runtime” DTO. The target should use small,
owner-aligned deep modules sharing only the evidence and receipt vocabulary:

- `GatewayReadinessQuery` and `GatewayProvisioningCommand`;
- `ModelProviderQuery` and `ModelProviderCommand` (deepening current provider flows);
- `AgentRosterQuery` and `AgentLifecycleCommand`;
- `RuntimeSkillQuery` and `RuntimeSkillProvisioningCommand`;
- `RuntimeExecutionQuery` plus an owner-dispatched `ExecutionOperationCommand`;
- no Automation query or command in v1; a later owner contract must define any
  `AutomationReconciliationQuery` or Department-Workflow-owned command after superseding ACC-D07.

Names are descriptive, not prescribed TypeScript identifiers. The important interface rules are:

1. each module accepts an authenticated Opzava principal and resource scope;
2. each read returns typed browser-safe projections with per-source evidence envelopes;
3. each command returns a durable pending receipt and later reconciled outcome;
4. Platform Gateway DTO normalization/redaction remains an adapter implementation detail;
5. the generic admin RPC stays behind the provisioning adapters;
6. the hot broker stays non-admin and tenant-routed;
7. no module writes another owner's workflow state.

This is a deeper interface than the current coarse snapshot: a caller asks the owner question and
does not need to understand Platform Gateway RPC methods, Mainframe config shape, scope mechanics,
redaction, retry, checkpoint comparison, or reconciliation.

## Route and compatibility disposition

No target URL is selected here. Use stable destination identities such as
`admin.ai-runtime.gateway`, `models-providers`, `agents`, `runtime-skills`, `sessions-runs`, and
`automations` inside the destination registry; #246 chooses public paths.

| Current route/state                                      | Owner-safe disposition                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/connections`                                           | Keep until Gateway, Models & Providers, Health, and Integrations each reach parity. Do not redirect it wholesale to one leaf.                                                                                                                                                   |
| `/connections/providers`                                 | Models & Providers compatibility consumer. Move the page only after the extracted owner query/commands and all setup/degraded flows pass parity.                                                                                                                                |
| `/connections/system`                                    | Split by semantic section: Gateway/runtime readiness → Gateway; Sessions → Sessions & Runs; agent health → Agents as reconciliation evidence; Channels → Integrations/#245; event-loop/plugins/context-engine diagnostics → Health. Bare/unknown fragment behavior is explicit. |
| `/connections/gateway`                                   | Existing permanent redirect cache trap. Never reuse as the canonical live Gateway path. Leave as bounded compatibility and choose a distinct target.                                                                                                                            |
| `notice` + optional `provider`                           | Translate only allowlisted provider/setup outcomes into owner-scoped target state. Unknown values normalize safely. Never forward credentials, codes, arbitrary return URLs, or unvalidated provider IDs.                                                                       |
| `#system-group-system-core`                              | Mixed Gateway and Health meaning. Preserve until both destination mappings exist, then offer explicit split/landing behavior; do not guess one target.                                                                                                                          |
| `#system-group-channels`                                 | Preserve the bookmark's channel intent and hand it to Integrations/#245 after that owner supplies its target mapping; never absorb it into Gateway or silently drop the fragment.                                                                                               |
| `#system-group-agents`                                   | Map to the authorized Agents reconciliation section, never a Runner or raw native agent view.                                                                                                                                                                                   |
| Sessions/Gateway/Runtime sections without legacy anchors | Do not fabricate compatibility anchors. #246 may define new target anchors independently.                                                                                                                                                                                       |

Migration sequence:

1. add capability-backed destination identities without changing current routes;
2. add typed owner projections and deterministic evidence;
3. make legacy and target consumers use the same owner interfaces;
4. move commands without changing application authority;
5. prove happy, denied, stale, unavailable, conflict, and failure parity on the real stack;
6. activate canonical targets and compatibility translations;
7. observe telemetry and rollback thresholds;
8. retire legacy consumers only after bookmarks, back/forward, refresh, and denied deep links are
   verified.

## Degraded and sad-path contract

| Condition                                                                                               | Required behavior                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root/leaf/resource capability denied                                                                    | Hard 403; no upstream query, resource existence, count, ID, timestamp, cache, or LKG leak.                                                                                                                                                                              |
| Capability revoked while page is open                                                                   | Next query/command reauthorizes, invalidates the authorization-version cache, and denies without preserving sensitive rows in the DOM.                                                                                                                                  |
| Tenant suspended                                                                                        | Owner-permitted read-only evidence; all mutations disabled with a textual reason and server enforcement.                                                                                                                                                                |
| Platform Gateway socket connected but protocol/health unknown                                           | `unknown`, never healthy. Show source evidence and safe diagnosis/refresh.                                                                                                                                                                                              |
| Platform Gateway unreachable/circuit open/protocol mismatch                                             | Current evidence is unavailable/degraded; any LKG is a separate labeled envelope. Sibling navigation remains usable; commands requiring fresh Platform Gateway proof are disabled.                                                                                      |
| Admin device/scopes/JIT lifecycle unverifiable                                                          | Fail closed; no shared-token fallback; block new mutation and show only authorized runbook/procedure guidance. No product Control UI navigation exists.                                                                                                                 |
| Missing/invalid budget/boundary, `observedAt > evaluatedAt`, or source timestamp beyond bounded skew    | `unknown`; reject `live`, and never substitute source time for trusted server observation.                                                                                                                                                                              |
| LKG older than budget                                                                                   | `stale` with its own timestamp/checkpoint; never contributes healthy/effective/running state or enables commands.                                                                                                                                                       |
| Older source-read completion, including a read triggered by a WS hint, loses observation-generation CAS | Reject it for state replacement even if its attempt ID, wall clock, source timestamp, or unordered checkpoint appears newer; retain safe telemetry only.                                                                                                                |
| Provider auth sources disagree                                                                          | Source-scoped conflict/unknown at the affected provider/agent scope; preserve routing truth separately; block readiness claims and offer refresh/repair.                                                                                                                |
| Provider setup accepted but readback fails                                                              | Pending/indeterminate receipt; never connected. Preserve prior state only as a separate LKG envelope plus safe retry guidance.                                                                                                                                          |
| Provider API/setup/access token is echoed or retained after submit                                      | Absolute security failure; clear/redact, stop flow, invalidate affected material, and create governed incident evidence. A provider-classified OAuth device user code/verification URL is allowed only during its short-lived flow and is removed on completion/expiry. |
| AgentEmployee exists but runtime artifact is missing                                                    | `runtime missing`; preserve employee identity, block runtime-dependent actions, offer authorized repair.                                                                                                                                                                |
| Unmapped or duplicate native agent                                                                      | Orphan/duplicate conflict; never auto-import, merge, or mutate until an authorized reconciliation decision.                                                                                                                                                             |
| Runtime Skill installed but unapproved/ineligible                                                       | Drift/blocked state; not effective. Do not expose it to agents or imply tool permission.                                                                                                                                                                                |
| Session retains an older skill snapshot                                                                 | Show session-scoped snapshot revision separately from current inventory; do not claim current configuration is effective in that session.                                                                                                                               |
| Stored session exists with no active run evidence                                                       | Show inactive/unknown liveness; never “running.”                                                                                                                                                                                                                        |
| Native task/run/session detail was pruned                                                               | Durable Run Trace remains; native detail explicitly `pruned`/`unavailable`; no fabricated timeline.                                                                                                                                                                     |
| Redaction cannot classify runtime payload                                                               | Fail closed and omit detail with explicit unavailable reason; do not ship then visually hide raw data.                                                                                                                                                                  |
| Run control owner cannot be resolved                                                                    | No cancel/retry/steer button. Link to safe evidence and require owner reconciliation.                                                                                                                                                                                   |
| Automation adapter/artifact exists or is absent                                                         | Still **reserved / unavailable in this version**. Perform no source fanout and emit no inventory, reconciliation, history, attention, `not-configured`, or operational state.                                                                                           |
| One leaf/source fails during composition                                                                | Local error/unavailable state; other authorized leaves and sources continue. Aggregate summary reports partial evidence without unauthorized counts.                                                                                                                    |
| Control UI break-glass readiness cannot be freshly verified                                             | Show safe unknown/unavailable status and authorized runbook guidance only; never add product launch/navigation or relax device auth from Opzava UI.                                                                                                                     |

## Accessible real-user verification gates

These are downstream acceptance gates, not unit-test suggestions. Drive them on the real local
Docker stack with a real authenticated browser, real Postgres, broker/worker, and a fake or isolated
Platform Gateway only where destructive provider/runtime setup would be unsafe.

### Cross-leaf gate

For all six leaves:

- navigate with keyboard from the shadcn/Radix sidebar in expanded, compact, and mobile modes;
- open the canonical deep link directly, refresh it, use back/forward, and verify exact heading,
  landmark, focus, and selected-nav behavior;
- verify unauthorized entry produces the accessible hard-403 admission response before page/list
  composition, with no row, count, placeholder, or source fanout.

For the five data-bearing leaves—Gateway, Models & Providers, Agents, Runtime Skills, and Sessions &
Runs:

- verify loading/pending, empty, not-configured, live, stale, current-unavailable plus separately
  enveloped LKG, unknown, and local-error states with status text/icons not conveyed by color alone;
- announce refresh/pending/result through a polite live region without stealing focus;
- give disabled actions a visible and machine-readable reason;
- prove a failed source does not break sibling navigation or mislabel the page healthy;
- overlap two reads and complete the older one last; prove the monotonic observation-generation CAS
  rejects it across attempt/snapshot variants even when source checkpoints are unordered hashes;
- prove absent `sourceTimestamp` is accepted without invention, a future source timestamp beyond
  bounded skew becomes unknown, and no response with `observedAt > evaluatedAt` can become live;
- inspect HTML, RSC payloads, browser JSON, query strings, console, network responses, worker/web
  logs, telemetry, and cache behavior for returned/persisted secrets, raw
  config/transcripts/reasoning, and internal IDs;
- revoke access mid-session and prove cache invalidation, reauthorization, hard 403, and no
  stale-row leak;
- use tenant A browser-safe IDs and random syntactically valid IDs under tenant B; prove both return
  hard 403 with an indistinguishable disclosed body and bounded timing/error class, without an
  existence leak.

For Automations only:

- verify admitted navigation renders the reserved/unavailable-in-this-version heading and
  explanation without an inventory, count, attention summary, state badge, refresh control, or
  operational action;
- prove page admission and shell rendering make no Automation source call or runtime fanout, whether
  or not an adapter or native runtime artifact happens to exist.

### Leaf-specific gate

| Leaf               | Real user-level proof                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway            | See live readiness from fresh evidence; stop/disconnect or protocol-mismatch the isolated Platform Gateway; observe a current unavailable envelope plus a separately timestamped/checkpointed LKG; verify Health link separation; run safe diagnosis; prove configure/repair remains pending until readback; prove no product Control UI launch/navigation exists.                                                            |
| Models & Providers | Complete each supported setup method; show write-only provider secrets cleared after submit with no echo/persistence while a provider-classified OAuth device user code/verification URL remains visibly usable only until completion/expiry; enable/disable a model; verify effective routing and Reviewer ownership links; prove Models cannot select a Reviewer; force auth conflict and prove fresh readback/leak checks. |
| Agents             | Render product-only, managed, missing, drifted, duplicate, and orphan fixtures sourced through real owner adapters; prove an orphan cannot be edited/imported; verify lifecycle receipt/readback; prove deferred business departments are absent from roster rows, search, filters, counts, direct detail/deep links, API payloads, grouping, and navigation while future domain values remain preserved.                     |
| Runtime Skills     | Show approved-but-not-installed, installed-but-ineligible, permitted/effective, older session snapshot, drifted version, and unmanaged orphan; prove installation never changes effective tools without policy; fail install when verification/install policy/admin authority is unavailable.                                                                                                                                 |
| Sessions & Runs    | Link a real owner record to a safe Run Trace; distinguish stored session from active run; paginate; revoke resource access; prune/unavailable native detail while preserving product trace; prove no raw transcript/tool payload; prove no generic control appears without a typed owner command.                                                                                                                             |
| Automations        | Show **reserved / unavailable in this version** with an accessible explanation; prove no Automation source fanout, inventory, counts, reconciliation, history, attention, receipts, raw cron, designer, or operation appears there or through Sessions & Runs whether an adapter/native artifact exists or not, and never label the destination `not-configured`.                                                             |

For each in-scope typed mutation on a mutation-capable data-bearing leaf—never Automations—tests
additionally prove idempotent retry, duplicate submission, base-hash conflict, timeout after
acceptance, Platform Gateway restart, stale readback, failed repair, receipt/audit linkage, and that
a later success signal cannot overwrite a stronger failed/aborted owner state.

## Proposed canonical amendments — not applied here

The following changes must be made by the canonical document owner before implementation tickets
rely on them:

1. **PRD-006:** clarify that Admin v1 Agents shows only Opzava/platform-development operating scope
   while future business department values remain deferred domain capability; align Automations with
   PRD-020/ACC-D07's reserved-only v1 boundary. Any inventory, reconciliation, history, or operation
   belongs to a later contract that explicitly supersedes that boundary.
2. **PRD-007:** make the approved catalog/installed/eligible/permitted/session-snapshot/effective
   Runtime Skill axes and orphan/drift states explicit.
3. **PRD-005, PRD-006, and PRD-013:** split the legacy Connections projection by semantic owner,
   explicitly align current PRD-013 lead-orchestrator provider-routing/`set-main` authority with the
   proposed Ask Admin and AgentEmployee model-policy owners, adopt deterministic evidence/receipt
   rules, and resolve source-scoped provider auth conflict without choosing an arbitrary winner.
4. **PRD-020:** consume this leaf composition, evidence, and drill-down contract while retaining
   composition-only authority.
5. **ADR-003 or successor:** reconcile the current durable admin device/shared-token fallback with
   the required short-lived job-scoped JIT admin lifecycle before new runtime mutations.
6. **CONTEXT glossary:** add **Runtime Session**, **Run Trace**, **Runtime Automation Artifact**,
   **Managed Runtime Artifact**, **Unmanaged Runtime Orphan**, and **Reconciliation State**. Avoid a
   generic unqualified “Run.” Align the existing **Projections are cache** row to the canonical
   source split: OpenClaw is upstream/native lineage, Mainframe is tracked fork source, and fresh
   Platform Gateway RPC snapshots are running-runtime truth.

## Binding constraints for final synthesis #246

#246 must:

1. preserve the exact six destination names/order and use capability-backed destination identities;
2. choose distinct canonical target URLs without reusing poisoned `/connections/gateway`;
3. keep current Connections routes until typed owner parity and real-stack sad-path verification;
4. translate only allowlisted `notice`/`provider` state and define fragment/bookmark/back-forward
   behavior;
5. create typed owner query/command tickets rather than a larger shared snapshot or browser-facing
   generic RPC;
6. schedule JIT-admin/shared-token remediation before new privileged runtime mutation work;
7. require deterministic per-source evidence, the maximum freshness budgets above, server-issued
   monotonic observation generations/CAS, stale-completion rejection, source checkpoints that may be
   unordered hashes, server-refreshed `evaluatedAt`, `observedAt <= evaluatedAt`, nullable source
   timestamps with bounded skew validation, separate current-failure/LKG envelopes, and
   partial-failure rendering;
8. require root/leaf/resource authorization before fanout, authorization-versioned caches, safe IDs,
   and hard-403/no-leak behavior;
9. preserve the shared receipt/readback command lifecycle and suspended-tenant read-only behavior;
10. keep Gateway local readiness separate from cross-component Health;
11. implement Agent, Runtime Skill, and Session/Run reconciliation states without auto-importing
    native artifacts; keep Automation reconciliation vocabulary deferred and inactive;
12. keep Automations reserved/unavailable for all of v1 with no source fanout, inventory,
    reconciliation, history, attention, receipts, or commands regardless of adapter existence;
13. keep native Control UI access out-of-band private break-glass and never expose product
    navigation, launch, deep link, iframe, or proxy to it; link only to authorized Opzava
    runbooks/receipts/procedures;
14. include the accessible real-user gates and security payload inspection above in downstream issue
    acceptance criteria;
15. block cutover if any required adapter returns raw DTO/config, lacks freshness policy, relies on
    broad durable admin authority, or masks unknown/unavailable evidence as healthy/empty.
16. keep Agents implementation blocked until the canonical PRD-006 v1 operating-scope amendment is
    approved, and treat Health, Usage & Costs, and Security & Audit links as capability-checked
    dependencies rather than hidden AI Runtime subpages.
17. keep Models free of Ask Admin/AgentEmployee model-policy mutation, preserve PRD-013 authority
    for the live legacy `set-main` action, and block the proposed owner split until explicit
    PRD-005/006/013 alignment is approved.
18. preserve ACC-058 Reviewer ownership: Environments owns tool/model selection, compatibility,
    local Docker access/readiness, and evidence-upload health; Runners owns enrolled executable and
    eligibility placement; PRD-019/ADR-017 Review owns Reviewer identity, independence, policy, and
    verdict. Models & Providers supplies catalog/routability evidence only.

## Primary evidence

- [PRD-020 Admin Control Center](../../prd/PRD-020-admin-control-center.md)
- [Admin Control Center foundation decisions](../admin-control-center-foundation-decisions.md)
- [PRD-006 Agent roster and automation](../../prd/PRD-006-agent-roster-automation.md)
- [PRD-007 Knowledge and skills](../../prd/PRD-007-knowledge-skills.md)
- [PRD-013 Connections and tools](../../prd/PRD-013-connections-tools.md)
- [PRD-005 Assistants chat](../../prd/PRD-005-assistants-chat.md)
- [PRD-019 Dev Board](../../prd/PRD-019-dev-board.md)
- [ADR-003 Gateway broker ACL and two-token model](../../adr/ADR-003-gateway-broker-acl-two-token.md)
- [ADR-016 tracked Mainframe fork](../../adr/ADR-016-mainframe-tracked-fork.md)
- [ADR-017 Dev Board authority, sync, and execution](../../adr/ADR-017-dev-board-authority-sync-execution.md)
- [WF-242 route ownership and migration audit](wf242-admin-route-ownership-migration-audit.md)
- [Capability parity](../capability-parity.md)
- [OpenClaw Gateway protocol](../../openclaw/gateway/protocol.md)
- [OpenClaw operator scopes](../../openclaw/gateway/operator-scopes.md)
- [OpenClaw Control UI](../../openclaw/web/control-ui.md)
- [OpenClaw Runtime Skills](../../openclaw/tools/skills.md)
- [OpenClaw sessions](../../openclaw/concepts/session.md)
- [OpenClaw runtime tasks](../../openclaw/automation/tasks.md)
- [OpenClaw cron](../../openclaw/automation/cron-jobs.md)
- [OpenClaw Task Flow](../../openclaw/automation/taskflow.md)
- [OpenClaw Nodes](../../openclaw/nodes/index.md)
- [current Connections port](../../../packages/ports/src/connections-provisioning.ts)
- [current OpenClaw Gateway port](../../../packages/ports/src/openclaw-gateway.ts)
- [current generic admin port](../../../packages/ports/src/openclaw-admin.ts)
- [current provisioning service](../../../apps/workers/src/provisioning/connections-provisioning-service.ts)

Research process: independent read-only scouts traced the current Opzava adapters, tracked Mainframe
source, running Platform Gateway boundaries, and upstream OpenClaw capability documentation. Two
independent plan audits agreed the owner split was sound and required deterministic freshness, typed
seams, explicit reconciliation states, command readback, source-scoped auth conflicts,
cache/identifier hardening, and degraded-state accessibility. Those corrections are incorporated
above.
