# WF-245 — Admin GitHub placement and Connections migration contract

**Status:** prepared resolution candidate for Wayfinder ticket
[Reconcile GitHub integration setup placement and Connections migration](https://github.com/anthonykewl20/opzava/issues/245).
It becomes a current planning input only after that ticket's verified closure **and** the active
[Admin Control Center map](https://github.com/anthonykewl20/opzava/issues/241) explicitly designates
this memo current for the named
[final Admin synthesis](https://github.com/anthonykewl20/opzava/issues/246), plus the
[Admin leaf-page prototype](https://github.com/anthonykewl20/opzava/issues/248) only if the map
names that additional consumption. Each designation is consumer-specific: consumption or explicit
removal ends authority only for that consumer, while every other named designation remains current.
The memo becomes frozen evidence only after every designated consumer has recorded consumption or
the map has explicitly removed it. A link, comment, or closed ticket without that active-map
designation does not make it authority. This is a documentation contract, not a claim that routes,
callbacks, projections, commands, migrations, or tests are implemented.

**Date:** 2026-07-17

**Scope:** the Admin placement, secure browser setup/repair/disconnect entry points, browser-safe
read projections, integration-history composition, and legacy Connections migration for the one
Opzava GitHub repository. This memo relies on the synchronization, reconciliation, health, and
disconnect semantics already locked by [WF-231](wf231-github-mirror-contract.md); it does not
redefine them. The setup and migration analysis exposes source-contract gaps not present in WF-231's
required-record inventory: crash-safe authorization-code exchange attempt/fencing,
callback-independent provider quarantine and unbound-installation cleanup, and the durable legacy
device-flow fence/unknown-loss cohort. This memo gives those gaps provisional semantic identifiers
only so Admin placement, denial, migration, and validation can be bounded. Neither #245 closure nor
Admin synthesis may create those Dev Board records or commands. An owning
PRD-019/ADR-017/WF-231-successor amendment, explicitly approved by the active Dev Board map, must
authorize them before any dependent projection, command, migration, prototype truth, or
implementation slice proceeds. This memo also preserves the independent Runner identity, enrollment,
capability, command, and receipt trust boundary locked by
[WF-232](wf232-runner-control-protocol.md).

## Executive decision

GitHub setup lives under the single **Configure → Integrations** sidebar leaf. The leaf presents an
integration inventory and links to page-local GitHub detail and history views. It does not own a
GitHub credential, binding, health ledger, synchronization state, configuration audit, or workflow
decision.

This memo recommends the following route family and semantic IDs for ratification by the final Admin
route synthesis. It does **not** override the route-authority deferral in
[WF-242](wf242-admin-route-ownership-migration-audit.md) or pre-approve the final synthesis.

| Semantic ID                             | Recommended route              | Visible role                                                            | Sidebar status                                |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| `configure.integrations`                | `/integrations`                | Inventory and secure setup entry for admitted platform integrations     | The one **Integrations** leaf under Configure |
| `configure.integrations.github`         | `/integrations/github`         | GitHub identity, lifecycle, health, attention, and command-entry detail | Page-local child; never another sidebar level |
| `configure.integrations.github.history` | `/integrations/github/history` | Federated, browser-safe GitHub integration-history projection           | Page-local view; never another sidebar level  |

Only `configure.integrations` is a shell destination. The nested semantic IDs let route admission,
deep links, telemetry, and compatibility mappings name the local views without breaking PRD-020's
two-level sidebar limit. The final synthesis may ratify different paths, but it must preserve these
three distinct semantic roles and direct old-route mappings.

## Inputs and precedence

This decision relies on the following current or canonical inputs without consuming, shortening, or
otherwise advancing any consumer-specific active-map designation:

- [PRD-020](../../prd/PRD-020-admin-control-center.md) and the
  [Admin foundation ledger](../admin-control-center-foundation-decisions.md) for Admin placement,
  admission, shell behavior, and the Integrations leaf;
- [PRD-013](../../prd/PRD-013-connections-tools.md) for secure setup, repair, disconnect,
  projection, authorization, secrets, audit-reference, and integration-control semantics;
- [PRD-019](../../prd/PRD-019-dev-board.md),
  [ADR-017](../../adr/ADR-017-dev-board-authority-sync-execution.md), and
  [WF-231](wf231-github-mirror-contract.md) for DevTicket/GitHub authority, bindings,
  reconciliation, synchronization, conflicts, health, Absolute Stops, and disconnect;
- [WF-232](wf232-runner-control-protocol.md) for the independent Runner enrollment, capability,
  command-key, delivery/receipt, containment, and reconciliation trust boundary that GitHub setup
  must neither own nor satisfy;
- [WF-242](wf242-admin-route-ownership-migration-audit.md) for the exact as-built route inventory
  and the rule that final URLs belong to the final synthesis;
- [WF-247](wf247-admin-security-settings-notifications-account.md) and
  [PRD-001](../../prd/PRD-001-auth-onboarding.md) for hard-403 anti-enumeration and target-bound
  fresh step-up;
- [Connections OpenClaw health evidence](../connections-overview-health.md) for the as-built
  three-state health/freshness lessons, not for target placement or global health meaning.

As of 2026-07-17,
[Reconcile GitHub bootstrap, two-way sync, delivery facts, Actions exceptions, and conflict remediation](https://github.com/anthonykewl20/opzava/issues/231)
is closed and the active
[Dev Board implementation delivery graph](https://github.com/anthonykewl20/opzava/issues/228)
explicitly designates WF-231 current until the named
[Dev Board final synthesis](https://github.com/anthonykewl20/opzava/issues/237) consumes it. The
same active map designates closed WF-232 current for #233, #235, and #237 until #237 consumes and
freezes it. This memo relies on the already-locked GitHub/Runner trust separation without becoming a
named WF-232 consumer, consuming that designation, or redefining Runner behavior. Likewise,
[Reconcile security, settings, notification, and account placement](https://github.com/anthonykewl20/opzava/issues/247)
is closed and the active Admin Control Center map explicitly designates WF-247 current until the
final Admin synthesis consumes it. This memo relies on that current map input to keep #245
consistent, but #245 is not a named WF-247 consumer and does not consume or shorten #246's
designation. The file or ticket links alone would not establish authority. Stale, non-terminal
migration-manifest wording does not demote an explicit current designation; an explicit frozen or
consumed disposition always wins.

WF-231's current designation does **not** authorize the provisional
`AuthorizationCodeExchangeAttempt`, `ProviderObservedInstallationQuarantine`,
`UnboundInstallationCleanupSaga`, `LegacyDeviceFlowFence`, `LegacyFlowUnknownLossCohort`, or their
commands/fences. Those names express required setup/migration safety capabilities discovered while
resolving Admin placement. They remain an explicit unresolved Dev Board source-contract dependency
until an owning amendment is approved and designated by the active Dev Board map. #241, #245, #246,
#248, PRD-013, and the Admin UI cannot satisfy or bypass that dependency.

When these inputs appear to overlap, the semantic owner wins on behavior, PRD-020 wins only on
placement/admission, and the final Admin synthesis wins on production URL ratification and migration
ordering.

## Authority and record ownership

| Owner / surface                                                          | Owns                                                                                                                                                                                                                                                                                                                                                                                          | Must not own or infer                                                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-020 Admin Control Center                                             | Integrations placement, route admission/presentation, shell links, accessible responsive shell behavior, and owner-projection composition                                                                                                                                                                                                                                                     | Integration records, setup semantics, health truth, commands, workflow, credentials, synchronization, audit truth, or a durable history ledger                      |
| PRD-013 semantic owners                                                  | Secure setup/repair/disconnect interface semantics; typed command entry; browser-safe inventory/detail projections; authorization, idempotency, confirmation, secret-handling, and audit-ref requirements                                                                                                                                                                                     | GitHub synchronization or workflow authority; a monolithic Connections aggregate; an Admin-owned copy of source records                                             |
| `DevBoard.GitHubIntegration`                                             | WF-231's currently authorized tenant GitHub Installation Binding, GitHub Repository Binding, setup/disconnect lifecycle records, dimensional Integration Health Snapshots, Reconciliation Epochs, synchronization/conflict/stop semantics, GitHub Disconnect Saga, and append-only command/configuration audit records                                                                        | Platform App Registration Ref/secrets; Admin placement; federated Security & Audit index/export; direct workflow gate/lane/approval/Done decisions                  |
| Required Dev Board setup/migration source extension — unresolved gate C2 | **Would own only after an approved PRD-019/ADR-017/WF-231-successor amendment:** provisional `AuthorizationCodeExchangeAttempt`, `ProviderObservedInstallationQuarantine`, `UnboundInstallationCleanupSaga`, `LegacyDeviceFlowFence`, `LegacyFlowUnknownLossCohort`, their typed commands/fences/lifecycles, tenant/platform audit identities, migration dispositions, and source projections | No authority from this memo, Admin synthesis, PRD-013, a UI fixture, or a route; no implementation/migration before the owning amendment is approved and designated |
| Platform provisioning/security                                           | Canonical public App slug/client ID, exact provider/callback configuration, App Registration Ref, private-key/client/webhook-secret refs/versions/rotation, vault access, and its append-only platform configuration audit records                                                                                                                                                            | Tenant GitHub bindings, tenant sync state, tenant health truth, or browser-visible App/vault/SecretRef identities                                                   |
| Security & Audit                                                         | Authorized federated query/index/export composition over semantic-context-owned append-only governance audit records, with source attribution; any index/checkpoint is rebuildable                                                                                                                                                                                                            | Source audit truth or writes, raw secret values, raw provider payloads, synchronization history, Card worklogs, or a universal mutable audit aggregate              |
| Configure → Integrations UI                                              | Presentation and secure command-entry leaf over admitted owner projections                                                                                                                                                                                                                                                                                                                    | Direct GitHub/Gateway calls, durable command receipts, lifecycle transitions, health classification, audit writes, or a second integration store                    |
| GitHub integration History view                                          | Rebuildable federated read projection over authorized source-owned records                                                                                                                                                                                                                                                                                                                    | A new ledger, missing-event proof, mutable worklog, raw provider DTO store, or replacement for Security & Audit, Card, Development, Health, or source history       |

The Integrations page delegates commands and renders source envelopes. Presentation never transfers
authority. A browser-visible action is not authorization to execute it, and a History row is not the
record from which a source lifecycle can be reconstructed.

Every later use of these provisional source identifiers in this memo is conditional on unresolved
gate C2. It specifies the safety, migration, and Admin-boundary evidence the owning Dev Board
amendment must provide; it does not assert that WF-231 already contains the records or that #245 can
authorize them.

### Governance Audit owner-contract dependency

WF-247 records a separate unresolved owner-contract conflict: PRD-013 still requires
`old/new safe summary`, while [#192](https://github.com/anthonykewl20/opzava/issues/192) proposes
immutable configuration-version refs unless a structurally defined, provably secret-safe summary is
accepted. This memo does not choose between them. Before any GitHub setup, exchange, cleanup,
repair, disconnect, or migration mutation is implemented or enabled, PRD-013 and #192 must agree on
one exact audit payload contract, each semantic owner must expose approved append ports for the
source-owned remote-write lifecycle, and #246 must sequence that dependency. Idempotency admission
must precede an append-only `requested` event; that event and the durable sender fence/claim must
commit before provider I/O. A known provider result appends a later `completed` or `failed` event in
the source transaction that records the result. An indeterminate response appends a non-terminal
`outcome_unknown` event and later appends `completed` or `failed` only after admissible
reconciliation proof. An append failure before provider I/O prevents the provider call. An append
failure after a provider effect prevents false local terminalization and retries only the
deterministic audit append/finalizer, never the provider mutation. Read-only placement/projection
work may proceed under its other gates, but no mutation may invent an ad hoc summary, silently
substitute a ref, omit any required lifecycle event, or treat Security & Audit as the writer. The
DAG names this unresolved dependency gate D.

## Page information architecture

### Integrations inventory

`configure.integrations` answers which admitted external platform integrations exist, which need
setup or repair, and where to continue. V1 includes GitHub and may include Slack Personal Assistant
delivery when its owner contract is ready. It does not absorb Gateway, Models & Providers, MCP
Servers, Runners, Environments, Secrets, Security & Audit, or future customer/business connections.
GitHub App/OAuth setup and Runner Enrollment may coexist for one physical machine, but their
identities, credentials, epochs, revocation, health, and authority never merge or transitively
authorize one another.

The GitHub inventory row contains only a safe display identity, lifecycle summary, dimensional
health summary, freshness/last-known-good marker, derived human-attention summary, and a link to the
GitHub detail. It does not contain Card comments/worklogs, PR/check activity, raw provider payloads,
raw errors, credentials, or setup proof values.

### GitHub detail reading flow

`configure.integrations.github` reads top to bottom in this exact order:

1. **Identity and lifecycle** — safe App display identity, verified GitHub account/installation
   label, exact bound Opzava repository display name plus immutable-reference-safe label, binding
   generation, and setup/disconnect lifecycle state.
2. **Dimensional health and evidence freshness** — the WF-231 dimensions, aggregate health state,
   source/observation times, freshness boundary, last-known-good marker, and current reconciliation
   proof. Unknown, stale, unavailable, and not configured remain explicit.
3. **Required attention** — an authorized, derived explanation of what the Human Owner can or must
   do now. This is separate from health and never reclassifies an Absolute Stop as approval.
4. **Setup, repair, and disconnect** — typed owner-command affordances with current eligibility,
   target/version, step-up/confirmation requirements, and safe pending/result receipts. There is no
   token form and no direct provider mutation.
5. **Recent integration history** — a bounded set of source-attributed setup, lifecycle, health,
   reconciliation, repair, disconnect, and safe configuration-audit projections. It links to the
   full local History view.
6. **Owning views** — explicit links to Dev Board Card/Development for work and provider-delivery
   facts, Operate → Health for evidence-rich readiness, and Security & Audit for an authorized
   federated query over source-owned immutable governance/configuration audit records.

The order is a vertical reading flow at every width. On narrow screens, metadata reflows below its
label; actions do not move ahead of identity, evidence, or required-attention context.

### GitHub integration history

`configure.integrations.github.history` is a filtered, paginated/cursor-based read view with source,
actor safe label, action/type, source time, observation time, result, provenance link, and
freshness. It can compose:

| Row family                                             | Authoritative source                                                                                              | Local display limit                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup association, binding generation, lifecycle       | `DevBoard.GitHubIntegration` setup/binding records                                                                | Safe identity/lifecycle summary and source record ref                                                                                                                                                               |
| Health dimension, reconciliation, drift, repair        | Integration Health Snapshot and Reconciliation Epoch records                                                      | Safe dimension/reason/evidence refs; no raw provider response                                                                                                                                                       |
| Installed-but-unbound containment and cleanup          | CAS-attributed `ProviderObservedInstallationQuarantine` plus Unbound Installation Cleanup Saga                    | Tenant History admits only a safe exact-pending/tenant-attached state, phase/result/remediation ref; unattributed platform quarantine is excluded; never expose installation ID, verifier, token, or cleanup handle |
| Disconnect request, fence, provider outcome, cleanup   | GitHub Disconnect Saga                                                                                            | Safe phase/result and remediation pointer; no credential/cleanup handle                                                                                                                                             |
| App configuration/rotation or secret-access governance | Platform provisioning/security's append-only audit record, exposed through authorized Security & Audit projection | Safe configuration version/action and Security & Audit link; never App Registration Ref/ID or SecretRef metadata                                                                                                    |
| Admin command decision                                 | Source-owned immutable governance audit/command receipt                                                           | Safe request/result/idempotency receipt ref; no secret-bearing payload                                                                                                                                              |

DevTicket contract edits, Card comments/worklogs, Issue mirror events, PR/commit/check/review/merge
activity, Sync Conflict detail, and Actions observations remain in Card/Development/source views.
The History page may link to those records but cannot duplicate them. A temporarily unavailable
source yields a source-scoped unavailable row/section with its last confirmed boundary; it never
becomes an empty or complete history claim.

A truly unattributed `ProviderObservedInstallationQuarantine` has no tenant component for the
composite identity below and therefore never enters tenant Integrations, tenant History, tenant
search, tenant notifications, or a tenant prototype fixture. Only an exact admissible callback that
attaches one pending generation and tenant by compare-and-set makes its later safe source rows
eligible for that tenant's authorized projection. Platform remediation is a separate source command
and attention path defined below; it does not manufacture a tenant History identity.

#### Deterministic row identity, order, and pagination

Every federated row has one composite identity derived from the exact tuple:

`(scopeNamespace, scopeRef, tenantOrNull, sourceOwner, stableSourceRecordOrEventIdentity, sourceVersionOrEventVersion, rowKind)`.

A tenant-scoped source row uses the exact tenant scope namespace/ref and requires the same tenant in
`tenantOrNull`. An exact enumerated platform-scoped source row uses its platform namespace and
opaque platform target ref with `tenantOrNull = null`; it is authored once and is never copied into
source truth per tenant or relabeled as tenant activity. A tenant-facing History query may admit a
safe platform row only through explicit current read policy for that platform row family. The query
envelope and cursor still bind the viewing tenant and principal, while the row remains visibly
platform-scoped and retains its platform composite identity. Truly unattributed quarantine remains
excluded under the rule above. A supplied/guessed tenant or a duplicated tenant-specific rewrite is
invalid.

The composer deduplicates exact composite-key matches only. It never deduplicates by timestamp,
content hash, actor, title, correlation, or visual similarity. Append-only corrections use a new
source event/version and therefore a new row identity. Correlated records from different owners stay
separate; the UI may visually cluster them only when each row carries the same admitted,
scope-compatible, browser-safe `correlationRef`. Clustering never merges, suppresses, or replaces
row identity, state, provenance, or owner action, and a tenant correlation cannot attach to a
platform-scoped row without an explicit source-owned attribution event.

Rows sort by this total order:

1. source event time;
2. scope namespace;
3. scope ref;
4. tenant-or-null with null first;
5. source owner;
6. stable source record/event identity;
7. source version/event version; then
8. row kind.

The sort direction is selected once by the contract and encoded in the cursor; v1 uses newest source
event time first and ascending deterministic tie-breakers. `observedAt` is transport/projection
time, never source event time and never an ordering substitute.

The first authorized page establishes a read snapshot containing the admitted source set, one
owner-supplied high-watermark/checkpoint or equivalent read boundary per source, and the total-order
boundary. An opaque signed cursor binds the viewing tenant, user, `authorizationVersion`, admitted
scope set, projection schema, source set, snapshot identifier, per-source high-watermarks and
continuations, ordering boundary, page contract, issued time, and expiry. It reveals none of those
internal values to the client and cannot be replayed across another principal, viewing tenant,
authorization version, admitted scope set, schema, source set, or sort order.

Later pages read only rows at or below the captured per-source boundaries. Newly appended events
wait for an explicit refresh, which starts a new authorized snapshot. If a source cannot establish
or honor its boundary, becomes unavailable, or changes a row inside the boundary during pagination,
that source is returned as `partial`/`unstable` with its last safe checkpoint; the composer neither
advances past an unproven gap nor fabricates completeness. A cursor refresh starts a new snapshot.
Authorization or source-set change invalidates the old cursor rather than silently omitting or
adding rows.

## Four independent state axes

The UI and projection contracts must never flatten the following axes into one badge:

| Axis                                              | Source / allowed values                                                                                                                                                                                                                                                                                       | Rules                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup, binding, cleanup, and disconnect lifecycle | `not_configured`, `installation_pending`, `authorization_pending`, `provider_observed_quarantine`, `awaiting_final_step_up`, `exchange_outcome_unknown`, `cleanup_pending`, `unbound_cleaned`, `reconciling`, `connected`, `disconnecting`, `provider_outcome_unknown`, `revocation_required`, `disconnected` | Provider-observed quarantine, unknown exchange, or unbound cleanup fences the immutable association pending exact terminal proof; unknown/revocation states are lifecycle, never health. |
| WF-231 integration health                         | `healthy`, `degraded`, `unhealthy`, `unverifiable`, plus exact health dimensions and scope                                                                                                                                                                                                                    | `healthy` requires every required capability and a complete current reconciliation. Unknown/stale evidence cannot yield healthy.                                                         |
| Freshness / availability                          | `live`, `stale`, `unknown`, `unavailable`, `not-configured`; `lastKnownGood` is an independent marker                                                                                                                                                                                                         | `not-configured` is not unhealthy. A stale or last-known-good value is labeled and cannot authorize a fresh-fact gate.                                                                   |
| Derived authorized human attention                | `clear` or `action_required`, with exact source reason, safe action family/destination, target version, and current authorization                                                                                                                                                                             | It is a request-scoped projection, not a lifecycle or workflow record. No permitted action means no fake button. Attention never means a bypass or changes source state.                 |

An unhealthy or unverifiable integration and suspected secret exposure remain unbypassable Absolute
Stops. They cannot become **Needs Human Approval**. Human approval, a prominent button, or a
successful single probe cannot resolve them. `ResolveAbsoluteStop` is allowed only after the owner
contract's complete recovery proof and restores ordinary retry eligibility only; it grants no Ready,
claim, Review, merge, lane, Release, or Done transition.

## Browser-safe projection contracts

Every inventory, detail, health, attention, and history result uses an owner envelope containing:

- `sourceOwner` and opaque browser-safe `sourceRecordRef`;
- source version/revision/sequence/checkpoint and projection schema version;
- `sourceAt`, `observedAt`, and `staleAfter`;
- availability/freshness state and explicit `lastKnownGood` marker;
- safe provenance sufficient for an authorized owner-view deep link;
- safe attention reason/action descriptor only when current authorization admits it.

The page-level projections are:

| Projection                           | Browser-safe payload                                                                                                                                                                                                                          | Explicit exclusions                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IntegrationInventoryProjection`     | Kind, safe display label, lifecycle summary, health/freshness/attention summaries, admitted detail link                                                                                                                                       | Credential state inferred from presence; raw refs; raw provider error; Card/work activity                                                                                              |
| `GitHubIntegrationDetailProjection`  | Opaque public App configuration/rotation version, safe account/repository labels, binding generation, lifecycle, dimensional health, reconciliation summary, admitted action descriptors, owner links                                         | App Registration Ref/ID, provider token, installation token, persisted/reflected signed state, PKCE verifier, callback parameter, cleanup handle, webhook body, raw provider DTO/error |
| `GitHubHealthProjection`             | Each WF-231 dimension, scope, state, safe evidence ref, last success/current failure summary, reconciliation checkpoint, freshness/LKG                                                                                                        | Guessed aggregate, raw probes, provider credentials, gate mutation                                                                                                                     |
| `GitHubAttentionProjection`          | Derived reason, practical impact, exact admitted owner command/destination, target version/expiry where applicable                                                                                                                            | Durable approval, workflow transition, secret value, action hidden behind an unauthorized row                                                                                          |
| `GitHubIntegrationHistoryProjection` | Composite row identity, authorized snapshot ID, opaque signed cursor, per-source boundary/continuation status, deterministic order, source-attributed safe rows, source/observation clocks, result, owner link, partial/unstable source state | New event ledger, heuristic dedupe, raw payload, Card comment/worklog, PR/check activity, audit replacement                                                                            |

Projection caches are keyed at minimum by tenant, user, `authorizationVersion`, and schema version.
They do not outlive their source freshness without changing to stale/LKG. Membership, role,
capability, tenant, policy, or authorization-version changes invalidate admission and cached
results.

## Command-entry contract

The browser calls Opzava application commands for every API read or mutation. It may perform only
the exact allowlisted top-level GitHub web navigation defined below; it never calls a GitHub API or
performs a direct provider mutation, and it never calls the Gateway, an OpenClaw Control UI route,
or a vault directly.

| UI intent                                  | Delegated owner command                                                                                                                                                                 | Result rendered by Integrations                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start setup                                | `BeginGitHubInstallation`                                                                                                                                                               | Source-owned pending proof/command receipt; the controlled test target exists only after C2 + D + Slice 3, and the production provider-navigation target only after C3 promotes that exact version |
| Recheck current evidence                   | Owner-defined safe health recheck/reconciliation request, using the existing WF-231 capability rather than a page-owned generic refresh mutation                                        | Request receipt plus refreshed/stale/unavailable projection                                                                                                                                        |
| Repair                                     | Owner-defined, typed repair command selected from current dimension/lifecycle evidence                                                                                                  | Pending/completed/failed/reconciliation-required receipt; never a generic `repair everything` provider call                                                                                        |
| Abandon/remediate attributed unbound setup | After gate C2, the approved owner-defined typed command that creates or resumes the one `UnboundInstallationCleanupSaga` for an admitted pending generation and CAS-attached quarantine | Safe saga ref/phase and admitted tenant Human Owner action; never tenant inference, local-delete, or not-configured success                                                                        |
| Disconnect                                 | `DisconnectGitHub`                                                                                                                                                                      | Existing or newly admitted GitHub Disconnect Saga safe ref/phase; never local-delete success                                                                                                       |

Command receipts, request-hash idempotency, lifecycle transitions, and audit events are
source-owned. Unsafe browser actions require same-origin/Origin and CSRF protection, a canonical
request hash bound to the idempotency key, live tenant/session/membership/policy reauthorization,
and current target reload. Setup, repair, unbound abandon/uninstall, and disconnect require fresh
MFA/passkey step-up bound to actor, session, tenant, action family, exact target, source/base
version, nonce, and expiry. High-risk/destructive actions additionally require a separate
exact-target confirmation or approval when the semantic owner's policy requires it. Approval and
confirmation never substitute for step-up, live authorization, or an Absolute Stop's recovery proof.

An unattributed quarantine is not a tenant UI intent. Only after gate C2 approves its exact source
contract may `DevBoard.GitHubIntegration` expose the approved semantic equivalent of
`RemediateUnattributedGitHubInstallation` to a current platform-scoped Human Owner capability. The
request binds the platform authority namespace, platform actor, exact opaque quarantine/
association-observation generation, action, canonical request hash/idempotency key, policy version,
fresh target-bound step-up, and destructive confirmation where applicable. It returns only a
platform-safe saga/result ref. A platform-scoped attention/read projection may be composed through
an authorized platform remediation surface and linked from Security & Audit, but Security & Audit
does not execute or own the command. Tenant routes, DTOs, History, search, notifications, and caches
cannot query or infer it. Before C2, no such command or projection exists from this memo.

## Secure GitHub App browser-navigation contract

The final route synthesis should ratify two separate fixed registered browser-navigation GET Route
Handlers. They are callback endpoints, not page destinations or sidebar entries:

| Handler semantic ID                                    | Recommended fixed path                            | Purpose                                                                      |
| ------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `configure.integrations.github.callback.installation`  | `GET /integrations/github/callback/installation`  | Receive the GitHub App installation/setup return under one-time state        |
| `configure.integrations.github.callback.authorization` | `GET /integrations/github/callback/authorization` | Receive separate user-authorization code return under state plus PKCE `S256` |

The registered path is exact; there is no browser-supplied `returnTo`, `redirect_uri`, tenant path,
or callback variant.

GitHub's web protocol requires a narrow transient browser-navigation exception to the normal
no-secret/no-provider-parameter rule. Opzava may place only these server-generated or
provider-required values on an exact allowlisted GitHub-origin navigation request:

- the public GitHub App slug or public `client_id` required by the selected provider endpoint;
- one opaque signed state value;
- the PKCE `code_challenge` plus the fixed `code_challenge_method=S256` for user authorization,
  never the verifier or the unsupported `plain` method; and
- the exact registered callback URI selected from server configuration.

Only the two registered Opzava **browser callback requests** may receive the provider-returned
`code`, `state`, or `installation_id` needed by their exact protocol step. Those values are
transient request inputs, not tenant data or browser projections. No other browser origin, route,
request, query, fragment, form, page DTO, or client storage receives them. No state, authorization
code, installation claim, verifier, code challenge, challenge method, or other transient protocol
value enters **any** cookie. Only the pre-existing opaque authenticated session cookie may accompany
a callback; the callback must not rewrite or repurpose it to carry or derive a transient value. A
provider error parameter is classified and discarded without reflection; it is never an allowed
application-state carrier.

The sole non-browser exception is one bounded server-to-server exchange from the source-owned
provider adapter to the exact configured GitHub token endpoint. After callback admission and the
durable send fence below, that POST may carry only the canonical public `client_id`,
platform-resolved `client_secret`, one callback authorization code, the exact registered redirect
URI, and the generation-bound PKCE `code_verifier` required by GitHub. The endpoint/origin is closed
server configuration, never browser or tenant input; TLS verification is mandatory, redirects are
not followed, and the adapter cannot call an arbitrary provider URL. Request/response bodies and
headers are excluded from logs, traces, metrics, audit payloads, errors, retries, and evidence.
Returned user, access, or refresh credentials enter only the protected WF-231 proof/cleanup path and
are never a browser response.

After consuming the callback request, the handler immediately issues `303 See Other` to the fixed
same-origin `/integrations/github?focus=setup` with `Cache-Control: private, no-store` and
`Referrer-Policy: no-referrer`. That page reloads safe proof state server-side. Signed state, code
challenge/method, authorization code, and the raw callback `installation_id` claim do not enter a
tenant-queryable row, page/DTO, rendered error, referrer, log, trace, metric, analytics event,
application-controlled storage, cookie, or the fixed post-303 URL/history entry. The independently
fetched and corroborated immutable installation ID persists only in the protected Installation
Association Proof and source-owned binding required by WF-231. This prohibition does **not** forbid
the canonical platform-owned configuration source from storing the public App slug/client ID, exact
provider endpoint, or registered callback URI; tenant/browser surfaces still receive only the opaque
configuration/rotation version except on the exact outbound navigation above. A browser may retain
the already visited cross-origin provider or callback URL in user-agent-managed session history; the
303/no-store/no-referrer contract does not claim to erase it. The callback never reflects or
re-emits a provider error, flow ID, user code, token, verifier, or secret-bearing value.

### Pending proof binding

Before navigation, `BeginGitHubInstallation` durably binds the pending proof to:

- actor, authenticated session, tenant, workspace, and current authorization version;
- opaque public App configuration/rotation version, never App Registration Ref/ID;
- the exact one permitted production repository's immutable provider identity and expected safe
  display name;
- action family, nonce hash, signed-state hash, issued time, expiry, single-use state, and fixed
  return destination identifier; and
- an opaque/hash step-up proof reference plus its version metadata, bound to this actor, session,
  tenant, action family, exact target, source/base version, nonce, issue time, and expiry—never an
  MFA/passkey assertion, secret, or reusable credential.

Only after gate C2 approves the exact verifier and exchange-attempt source contract may the separate
user-authorization navigation generate a high-entropy PKCE verifier and store it as an encrypted,
non-exportable, generation-scoped server-only handle bound to the second signed-state hash, pending
generation, actor/session/tenant, exact association target, issue time, and expiry. The browser
receives only its `S256` challenge. Only the exact current sender claim may release the verifier
once to the in-process provider adapter. Expiry, supersession, `cancelled_before_send`, successful
response persistence, `exchange_outcome_unknown`, or any terminal cleanup compare-and-sets the
handle to zeroed; retry, export, tenant query, and recovery after zeroing are impossible. The
encrypted handle survives an ordinary worker restart before callback and is never placed in a
cookie, URL, DTO, log, audit row, notification, evidence package, or debug bundle. Before C2, this
memo authorizes neither the verifier handle nor the user-authorization navigation.

The installation callback verifies signature, expiry, single use, current authenticated session,
actor/tenant/workspace match, pending-proof state, and current route admission. Its raw
`installation_id` is attacker input and cannot create a tenant binding or global fence. The
source-owned App-authenticated adapter must independently fetch that exact installation, verify the
expected App/configuration version and one permitted repository, and record only the independently
returned immutable App-installation-repository association key in the protected proof. Only that
corroborated key creates the cross-actor/cross-tenant association fence and may advance to the
separately recorded same-user authorization proof.

Under the approved C2 contract, the user-authorization callback uses a second signed state and a
separate PKCE verifier bound to the same proof, with the outbound challenge fixed to `S256`. The
bounded server exchange resolves the App client secret only inside platform provisioning/security.
The resulting ephemeral GitHub App user token proves that the exact GitHub user can access the
claimed installation and exact repository. Server-side App authentication then independently fetches
and corroborates App identity, installation/account, immutable repository ID, granted access,
permission/event/config versions, and uniqueness. A signed webhook cannot replace same-user
association proof.

Immediately before binding, the owner command reauthorizes the live Opzava session, tenant
membership, authorization/policy versions, one-repository rule, and the same exact-target step-up
proof. The proof must still be fresh, unconsumed, and bound to this pending generation and current
target/source version. Gate C1 may build this current-WF-231 proof and binding transaction only as a
non-routable foundation for the Admin setup path. The controlled test path cannot exercise provider
navigation or callback finalization until slice 3 integrates gate C2's approved callback-loss
extension; the production path cannot enable provider navigation, callback finalization, or a
Connected result until C3 promotes that exact version. After C2, the finalizer also locks the
provider-observed quarantine for the exact corroborated association and may consume it into the
binding only when that same proof generation is attached and every condition passes. If step-up
expires after provider navigation, finalization pauses and creates no binding. The admitted actor
must complete a fresh stepped-up Opzava POST bound to the same pending generation and still-current
target/version. A generation/version compare-and-set replaces only the opaque step-up reference
metadata, then finalization revalidates every condition. Step-up expiry alone never repeats a
provider installation or authorization exchange. Demotion, tenant switch, session expiry, revoked
membership, policy drift, second repository, or any identity mismatch creates no binding. Credential
cleanup follows WF-231's exact documented-proof/expiry rules; pending cleanup or ambiguous
revocation blocks final binding.

Both handlers emit `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. They
redact authorization codes, signed state, installation IDs, provider errors, token values, and proof
identifiers from logs, traces, metrics labels, analytics, error pages, and client telemetry. Safe
security telemetry retains only classified reason codes and server-side correlations.

Back, refresh, replay, and multi-tab behavior is deterministic:

- same admitted session plus already-consumed state performs no mutation and lands at the fixed
  setup view with a safe consumed/continue result;
- an expired or superseded admitted proof performs no mutation and renders a safe restart action;
- concurrent tabs contend on the one proof generation; exactly one transition wins;
- different actor/session/tenant, malformed state, or unauthorized direct proof access follows the
  hard-403 anti-enumeration contract and reveals no proof or installation existence;
- response loss follows the operation-specific contract below; a browser refresh reloads persisted
  safe state and never applies a generic retry rule to an unknown provider mutation.

### Operation-specific response-loss contract

“Provider response lost” is not one state. Each operation uses only the proof and retry behavior its
owner can justify:

| Operation whose response is lost or indeterminate | Required behavior                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe provider read/probe                          | A bounded policy-aware retry is allowed because no provider mutation occurred. Freshness remains unknown/unavailable until a read succeeds; retry does not manufacture health.                                                                          |
| Installation callback handling                    | The callback is a local pending-proof transition only. It performs no tenant binding and no provider mutation whose outcome must be guessed; a lost browser response reloads the one local proof state safely.                                          |
| User authorization-code exchange after C2         | Record explicit `exchange_outcome_unknown`; do not replay the code blindly, invent token introspection, or create a binding. Follow source security cleanup, recorded credential expiry, and Human Owner remediation policy only with admissible proof. |
| Access/user/refresh credential cleanup            | Follow WF-231 exactly: documented applicable `204`, optional access-token `404`, later documented proof, or deterministic recorded provider-issued expiry. Refresh revoke `202 Accepted` stays unconfirmed.                                             |
| Unbound installation uninstall after C2           | Keep one `UnboundInstallationCleanupSaga` in scoped `provider_outcome_unknown`; retain global association fence and token/webhook/outbound containment; never blind-retry or infer success from no local binding.                                       |
| Disconnect uninstall/revoke                       | Keep the one GitHub Disconnect Saga in `provider_outcome_unknown`; reconcile exact provider identity, never blind-retry/local-delete success, and keep reconnect disabled.                                                                              |
| Mirror/outbox provider mutation                   | Retain WF-231's source-owned `outcome_unknown` reconciliation and Human Owner resolution. Integrations may link its safe status but implements no page-local retry or absence inference.                                                                |

An unknown authorization-code exchange cannot be “reconciled” merely because the callback proof
record exists. It creates no GitHub Installation Binding unless the source contract obtains all
required provider, cleanup, session, authorization, and repository proof through an admissible path.

WF-231 authorizes the Installation Association Proof and bounded secret exchange but does not
enumerate the durable exchange-attempt state machine below. `AuthorizationCodeExchangeAttempt` is a
provisional gate-C2 semantic identifier, not current WF-231 authority. The owning source amendment
must approve it or an equivalent crash-safe model before Slice 2 implements or enables this flow.
Under that approved contract, the authorization-code exchange has a crash-safe durable send fence:

1. The callback validates state, PKCE, session, tenant, authorization, pending generation, and route
   admission before preparing an exchange.
2. In one transaction it locks that pending generation, consumes the one callback transition, and
   creates one durable exchange attempt in `prepared`, keyed by proof generation, keyed
   authorization-code digest, canonical request hash, and the independently corroborated immutable
   App-installation-repository association key. The transaction commits before any provider network
   call. It never persists the raw authorization code.
3. The one process that still holds the raw code must compare-and-set `prepared` to `sending` with a
   generation/association-bound sender claim/fence, atomically mark the encrypted verifier handle
   single-use claimed, and commit both before calling GitHub. Only that committed claim releases the
   verifier once to the in-process provider adapter. The provider port structurally refuses an
   exchange without the exact current committed sender claim; no code path may combine “mark
   sending” and “send” without that durable boundary.
4. A crash before the `prepared` commit produces no provider send or durable transition. A crash
   after `prepared` but before the `sending` commit is provably unsent; recovery terminalizes it as
   `cancelled_before_send` and requires fresh setup because the raw code was never stored. The same
   compare-and-set zeroes the verifier handle and proves no credential-exchange cleanup is needed.
   If a provider installation already exists, lifecycle remains `cleanup_pending` under the unbound
   installation saga below and cannot return to `not_configured` until that saga terminalizes.
5. Once `sending` commits, a crash before the socket send, a timeout, a send with lost response, or
   a restart after claim expiry is conservatively indeterminate. Recovery compare-and-sets that
   exact attempt/generation to `exchange_outcome_unknown` and zeroes the verifier handle; it never
   retries the code or infers non-issuance from code expiry.
6. A timely response finalizer may commit protected `response_received` proof and zero the verifier
   handle only while its exact sender claim, attempt, and proof generation remain current; final
   binding still requires every separate proof above. A stale finalizer loses by compare-and-set. If
   a credential-bearing response arrives after the attempt became unknown, a cleanup-only
   compare-and-set retains it solely as protected, encrypted, non-exportable WF-231 cleanup state
   and starts governed cleanup; it can never create or complete a binding. Missing token, expiry, or
   grant facts are not invented.

Every `sending` or unknown attempt fences binding finalization and fresh setup for the corroborated
immutable App-installation-repository association across **all** actors and tenants. An untrusted
raw callback claim cannot create that global fence. Callback replay, restarted workers, a different
actor/tenant setup, and stale or late finalizers lose by association/attempt/generation/claim
compare-and-set.

`exchange_outcome_unknown` terminalizes only through source-admissible proof that no
credential/grant exists or that the exact App authorization/credential was revoked and any retained
cleanup handle was safely zeroed under WF-231. When account-owner action is the only admissible
path, lifecycle moves to `revocation_required`; code expiry alone is insufficient because a
credential may already have been issued. After exact authorization/credential terminal proof, the
old pending proof records its disposition; if a provider installation exists, the unbound cleanup
saga must also terminalize before lifecycle returns to `not_configured` and a new
`BeginGitHubInstallation` generation may start. Until both applicable proofs exist, setup remains
fenced and cannot become connected, healthy, approval-bypassed, or silently abandoned.

## Authorization, anti-enumeration, and secret boundary

Root shell admission requires `admin_control_center:view`. That capability is not blanket access.
Before any source fan-out, the server also requires the semantic equivalent of:

- view Integrations inventory;
- view this tenant's GitHub integration detail and permitted history sources;
- manage GitHub setup/repair;
- after gate C2, abandon/remediate a CAS-attributed unbound installation and, separately, authorize
  provider uninstall;
- disconnect this GitHub binding; and
- view any separately linked Health or Security & Audit record.

These tenant scopes never admit an unattributed quarantine. After gate C2, its read/remediation path
requires the approved separate platform-scoped capability corresponding to
`RemediateUnattributedGitHubInstallation`, an admitted platform actor/service principal, and the
exact platform authority namespace and observation generation. A tenant grant, shell admission,
tenant Owner role, guessed tenant, or absence of a tenant cannot satisfy that capability. Before C2,
this memo creates no such capability or path.

The final synthesis may choose canonical capability names for already-authorized owner contracts.
For the provisional unbound-cleanup extension it must use only the identities approved by gate C2;
Admin synthesis cannot invent or authorize them. The combined target must preserve separate tenant
read, manage, attributed-unbound-cleanup/uninstall, disconnect, and audit/history scopes; the
distinct platform-unattributed-remediation scope; and owner reauthorization. Navigation, the
authenticated session cookie accompanying a callback, a rendered action, a prior step-up, or an
Admin shell grant is never command authority.

Expected denial occurs before a denied adapter/source is queried. A directly requested denied root,
leaf, nested view, proof, binding, history source, or action returns a hard 403. It does not
redirect to the Admin root, return `200` empty, claim not configured, or disclose existence,
identity, safe label, count, timestamp, LKG, reason, or deep link. Tenant RLS remains active behind
application admission.

For an existing foreign-tenant opaque identifier and a well-formed random/nonexistent identifier,
the response follows WF-247's same anti-enumeration class: same 403, generic code/body shape and
response-size bucket, security/cache headers, absence of existence-dependent metadata or redirect,
and bounded timing distribution. Server-only redacted telemetry may distinguish reasons but cannot
affect the browser response. Cache keys include tenant, user, `authorizationVersion`, and schema;
authorization changes invalidate them.

Outside the exact transient browser-navigation and callback requests allowed above, tenant-queryable
rows, application DTOs, and browser-rendered/client state may see only an **opaque public App
configuration/rotation version**. Those queryable/browser surfaces must never persist, render,
reflect, infer, or receive:

- App Registration Ref/ID, or a tenant/browser copy of provider App/client ID outside the one
  allowlisted outbound protocol request;
- vault reference, SecretRef identity, SecretRef version, private-key/client-secret/webhook-secret
  reference, storage locator, or environment-variable identity;
- user, refresh, installation, OAuth, PAT, setup, callback, or broker token values;
- credential fingerprints, cleanup handles, encrypted-handle identifiers, signed state outside the
  two exact browser protocol requests, PKCE verifier in any tenant/browser surface, authorization
  code outside its exact callback request in those surfaces, user code, or flow identifier;
- raw webhook body, raw provider/Gateway DTO, unredacted provider error, provider stack trace, or
  arbitrary provider URL.

This query/projection prohibition does not erase the protected server-only records required by
WF-231. Platform provisioning/security may retain the canonical public App slug/client ID, fixed
GitHub endpoint and registered callback URI, plus the protected App Registration Ref and secret
references, under its dedicated role. These are canonical configuration, not callback-derived tenant
state; tenant/browser projections still expose only the opaque configuration/rotation version.

Under dedicated service roles and tenant RLS, the current WF-231 Installation Association Proof may
retain only the protected fields its owning contract already admits; this memo does not extend that
inventory. After gate C2 approves the exact exchange/verifier contract, its approved source records
may additionally retain signed-state/PKCE hashes, the encrypted non-exportable generation-scoped
PKCE verifier handle, independently fetched and corroborated immutable GitHub user/account/
installation/repository IDs, safe provider observations, issued expiries, safe credential
fingerprints, and encrypted non-exportable cleanup handles until their exact terminal proof. No
record treats the raw callback `installation_id` claim as truth or returns any protected field to a
tenant query, browser DTO, log, notification, export, or evidence package.

After gate C2 approval and under a separate platform service role,
`ProviderObservedInstallationQuarantine` may retain the corroborated immutable App/installation/
repository IDs, App configuration version, provider-observation generation, safe signed-webhook
receipt reference, and App-inventory checkpoint needed for the global fence and cleanup. It retains
no raw webhook body and no tenant, actor, or pending-proof attribution until an exact admissible
callback attaches that relationship by compare-and-set. Tenant/browser roles cannot query the record
or infer its existence.

After gate C2 approval, the protected exchange-attempt record may retain only proof-generation,
keyed authorization-code digest, canonical-request hash, attempt-state enum, attempt/generation/
claim fences, safe clocks/reason codes, and the encrypted non-exportable cleanup state admitted
above. It never stores the raw authorization code, and no tenant role can query the record or derive
a callback/protocol value from it.

Transient protocol copies appear only on the exact allowlisted GitHub navigation request, the exact
registered callback request, or the one bounded server-to-server token exchange described above.
They are excluded from every other browser/server request and from browser DTOs, rendered HTML/React
payloads, the fixed Opzava post-303 URL/history entry, application-controlled storage, **every
cookie**, logs, traces, metrics, analytics, audit payloads, notifications, Slack, exports,
screenshots, evidence packages, and debug bundles. Only the pre-existing opaque authenticated
session cookie may accompany a callback; it is not rewritten, repurposed, or used to carry or derive
any state, code, installation claim, verifier, challenge, challenge method, or other transient
protocol value. Canonical platform-owned public App configuration and protected proof/cleanup
records remain only in their explicit exceptions above. This does not claim to erase a prior
provider/callback URL retained by the user agent. A safe owner reason code and an opaque
source-record reference are not credentials and cannot be reversibly derived into them. No GitHub
identity, credential, callback proof, or setup state is a Runner setup grant, Runner credential,
server command-key trust bundle, Runner Receipt signature, Lease Enforcer proof, or execution
admission.

## Current-to-target route and state register

The following is a recommendation for final synthesis, not a unilateral URL decision:

| Current consumer / intent                   | Recommended target                                                                     | Compatibility rule                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/connections/github`                       | `/integrations/github`                                                                 | Temporary 307/no-store one-hop only after detail parity. Recompute target admission; forward no legacy query.                                                               |
| `/connections/add`                          | `/integrations?intent=add`                                                             | Temporary 307/no-store to integration-kind-aware catalog, not a permanent GitHub alias. Selected kind comes only from a closed server-owned enum and reauthorized catalog.  |
| GitHub row/card in `/connections`           | `/integrations` inventory, with admitted detail link                                   | Replace only that row/section after projection parity; do not rename the entire monolith.                                                                                   |
| GitHub-not-configured or setup return state | Server-side proof state rendered at `/integrations/github?focus=setup`                 | `focus=setup` is a closed presentation enum. Do not forward `notice`, `provider`, provider errors, state, code, installation ID, flow/user codes, tokens, or secret values. |
| `/connections/system#system-group-channels` | Handoff to final synthesis for an Integrations-local platform-channel evidence section | Preserve the legacy fragment intent until the final synthesis consumes all channel-owner audits; do not publish a native OpenClaw `/channels` route.                        |

This ticket does not select a disposition for bare `/connections`, `/connections/system`, or
`/connections/providers`. Those remain owned by the cross-owner, Operate, and AI Runtime synthesis
inputs. It also does not fabricate fragments for Sessions, Gateway detail, or Runtime, because the
as-built route has no such `system-group-*` anchors.

All compatibility mappings are parity-gated and exact:

1. Target route, projection, commands, denial, freshness, setup, repair, disconnect, and history
   behavior pass their real-stack gates.
2. The legacy source path and every recognized query/fragment are enumerated in a closed mapping.
3. Valid state is translated server-side to a closed target enum or server-held proof reference;
   unknown state lands at an explicit safe target root/setup restart without pretending success.
4. Redirects are one hop, preserve no arbitrary return URL, and have loop/chain tests.
5. Shell, palette, topbar, owner deep links, post-disconnect navigation, and notifications move in
   the same cutover so they do not create redirect chains.
6. A redirect never grants access. Target admission returns hard 403 when current authorization is
   denied.

During the withdrawable compatibility window, every admitted legacy GET/HEAD mapping uses a
temporary `307 Temporary Redirect` with
`Cache-Control: private, no-store, max-age=0, must-revalidate`, `Pragma: no-cache`, `Expires: 0`,
and the existing principal-aware cache variance. A service worker, CDN, reverse proxy, or browser
cache must not retain the mapping. Legacy non-GET methods are rejected rather than redirected.
`301 Moved Permanently` and `308 Permanent Redirect` are forbidden until the rollback window is
explicitly closed and the final synthesis approves an irreversible disposition. Browser back/forward
may retain the old URL as history, but revisiting it must reach the server and re-evaluate the
current cutover/rollback flag and target authorization.

`/connections/add` continues to represent a legacy integration-kind chooser during its compatibility
window. It may translate a recognized safe GitHub kind to the GitHub detail/setup view, but its
permanent target is the Integrations catalog with `intent=add`, not GitHub specifically.

## GitHub App migration and rollback

### Inventory and classification

Before cutover, produce a complete tenant/platform migration register for:

- every `GITHUB_TOKEN` environment/PAT/vault-backed handle and every consumer that can resolve it;
- every `GITHUB_OAUTH_CLIENT_ID`, OAuth App registration dependency, stored user-token handle,
  refresh/access handle, safe provider authorization identity, and device-flow consumer;
- every still-enumerable in-memory pending device flow and unused user/device code at the durable
  legacy device-flow fence;
- every legacy `issue_projection`, `issue_create_intent`, and `issue_close_outbox` row in pending,
  processing, failed, dead, ambiguous, or terminal state, including attempts, claims, errors,
  provider targets, dedupe/idempotency fields, and safe correlation;
- every current page, server action, worker, adapter, job, environment variable, compose/Dokploy
  setting, secret consumer, callback registration, test fixture, and runbook that can start or use a
  legacy GitHub credential path.

Every item ends `migrated`, `merged`, `terminally expired`, `cancelled before use`,
`frozen historical`, `archived`, or `quarantined` with a reason, owner, cleanup proof/expiry, and
next gate. `Skipped`, `probably unused`, or local ref deletion is not terminal.

#### Legacy device-flow fence and unknown-loss cohort

`LegacyDeviceFlowFence` and `LegacyFlowUnknownLossCohort` are provisional gate-C2 semantic
identifiers absent from WF-231's required-record inventory. The owning source amendment must approve
them or equivalent durable migration records before Slice 7 persists or executes this fence. Under
that approved contract, before cutover persist a durable `LegacyDeviceFlowFence` containing the
legacy worker generation, fence time, last possible issuance boundary, observed worker
restart/generation evidence, maximum provider-issued device/user-code TTL, clock-skew allowance, and
the code/poller/write consumers being disabled. The fenced generation stops new device-flow starts,
polls, token writes, and legacy connect completion. Every flow/code still enumerable at the fence is
censused and terminally classified individually.

A worker restart may have irretrievably erased in-memory flows before the fence. Those cannot be
invented as per-item records. Record one explicit `LegacyFlowUnknownLossCohort` aggregate for the
affected worker generations instead. It may terminalize only when all of these are proven:

1. worker-generation/restart evidence bounds the last possible issuance;
2. no reachable poller, callback, token writer, pending-memory entry, or durable consumer can still
   complete a lost flow;
3. the legacy client, OAuth device-flow UI, and every legacy write path are disabled; and
4. trusted time passes the later of the last possible issuance, relevant restart boundary, and
   durable fence time, plus the maximum provider-issued code TTL and clock skew.

The terminal cohort disposition means “all possibly lost codes have expired without a reachable
consumer.” It does not claim individual enumeration, revocation, provider cleanup, or absence. Every
durable OAuth token/handle, PAT/environment handle, Issue record, and outbox item remains an
individual migration record and cannot be hidden inside the cohort.

### Expand, compare, cut over

Steps 2–4 and every later step that exercises an exchange-attempt/verifier, provider-observed
quarantine/unbound cleanup, or legacy-flow fence/cohort remain blocked until gate C2 approves and
designates their owning source contract. The sequence does not authorize those records merely by
naming them. Gate D independently blocks every audit-required mutation and migration step until its
owner contract and source append ports are accepted. These steps first produce C3 evidence through
the controlled non-production boundary. Production setup, migration writes, and cutover remain
disabled until C3 promotes the exact tested version.

1. Add the WF-231 App/binding/proof/health/reconciliation/disconnect records and owner ports while
   legacy reads remain available. No target browser or DevTicket transaction calls GitHub directly.
2. Register the two fixed callbacks and one exact Opzava production repository. Complete spoofing,
   association, state/PKCE `S256`, encrypted-verifier lifecycle, fenced server-token egress,
   secret-boundary, RLS, and callback replay tests before enabling setup.
3. Persist and enforce the durable legacy device-flow fence. Stop new starts, polls, completion
   writes, and legacy consumers; terminally expire/cancel every enumerable pending flow/code and
   wait for the bounded unknown-loss cohort gate. Do not translate a device flow, PAT, environment
   token, OAuth user token, or legacy Connected flag into a GitHub Installation Binding.
4. Install and independently verify the App. Prove signature-verified installation-lifecycle-webhook
   observation plus bounded App-authenticated inventory reconciliation, callback-missing/late
   quarantine, and unbound-installation containment/cleanup before creating one immutable Repository
   Binding. Finish a complete first Reconciliation Epoch before target health can be healthy or
   target writes start.
5. Backfill Issue bindings, Mirror Shadows, comments/worklogs/evidence, create intents, close
   outbox, provider facts, and unknown outcomes under WF-231. Explicitly classify missing, renamed,
   deleted, conflicting, orphaned, possibly sent, and dead rows. Do not infer Done from a close.
6. Run a bounded dual-read comparison for identity, account/repository, lifecycle, health, provider
   Issue identity, body/labels/state/comments, provider facts, queue state, history, and freshness.
   There is exactly one write authority: the App-backed WF-231 path. Never dual-write.
7. Cut setup/repair/disconnect UI to Integrations, workers to the App inbox/outbox/reconciler, and
   source links to the target views. Verify all legacy queues are terminally classified.
8. Disable PAT/environment/OAuth credential use and remove legacy connect/write controls. Revoke or
   uninstall provider credentials where authority and documented proof allow it. Retain only
   encrypted non-exportable cleanup handles needed to reconcile an ambiguous provider outcome.
9. Install one-hop temporary 307/no-store compatibility redirects only after authenticated browser
   parity, cache/back-forward/service-worker/CDN tests, route-use telemetry, and rollback evidence.
   Remove legacy presentation/code or consider a permanent disposition only after the approved
   compatibility window and all cleanup/removal gates pass.

Cutover is blocked by any unclassified credential/outbox row, unfenced or reachable legacy
device-flow start/poller/writer, unexpired or unproven unknown-loss cohort, second write path,
incomplete reconciliation, unresolved identity/mutation outcome, provider-observed unbound
quarantine or cleanup, missing RLS/callback/verifier/server-egress proof, secret leak, unavailable
required command, or target state that masks unknown/stale as healthy.

### Cleanup evidence and rollback

Quarantined cleanup handles remain until WF-231's exact applicable provider proof or deterministic
provider-issued expiry permits compare-and-set destruction. A refresh-credential revoke
`202 Accepted` is unconfirmed, not proof of revocation. An ambiguous response, local ciphertext
delete, absent UI row, or provider `404` without admitted identity is not cleanup success.

Rollback may restore legacy **read presentation** during the bounded window. It never restores:

- the OAuth device-flow connect UI or new device-flow starts;
- PAT/environment/OAuth writes, the manual close worker, or two write authorities;
- a legacy Connected classifier as target health; or
- direct browser/Gateway/GitHub access.

If the target write path cannot operate safely, rollback freezes affected writes and shows the
owner-defined unhealthy/unverifiable or unavailable state while reconciliation continues. It does
not route writes back through legacy credentials. Compatibility redirects may be temporarily
withdrawn to expose legacy reads only when the legacy page remains admitted and clearly read-only;
their 307/no-store contract requires the next request to reach the server and observe that rollback.

Removal requires zero unclassified rows/consumers, an enforced legacy device-flow fence, terminal
individual dispositions for every enumerable flow and durable credential handle, terminal bounded
unknown-loss cohort evidence, one complete App-authenticated installation-inventory reconciliation,
zero unresolved provider-observed quarantine or unbound-installation saga, target real-stack parity,
completed bounded comparison, stable route/cache telemetry, one target write authority, and explicit
migration-owner approval.

## Required unbound-installation source extension — unresolved gate C2

A provider-side App installation can exist before an Opzava GitHub Installation Binding. Failure,
abandonment, expiry, demotion, session loss, policy drift, association mismatch, or unresolved
authorization cleanup must not orphan that installation or let it become an ungoverned sync path.
WF-231 does not currently enumerate the records needed to close that gap. The owning Dev Board
source-contract extension must therefore assign the provisional
`ProviderObservedInstallationQuarantine` and at most one active provisional
`UnboundInstallationCleanupSaga` for each independently corroborated immutable
App-installation-repository association observation generation to `DevBoard.GitHubIntegration`, or
replace those names with equivalent approved source semantics. Until gate C2 approves that
amendment, no Admin projection, command, fixture, or implementation may treat the following contract
as source truth. An admitted callback links the quarantine/saga to its exact pending proof
generation. An installation observed without an admitted callback keeps that link absent rather than
inferring a tenant, actor, or pending proof. The association-level active-saga constraint remains
global. This cleanup lineage is distinct from the GitHub Disconnect Saga, which requires an existing
binding generation.

Gate C2 approves the source contract and proof plan; it cannot require behavior from an
implementation that C2 has not yet authorized. After C2, the exact approved source model may be
implemented behind a non-production, non-routable test boundary and exercised against the scratch
App. Gate C3 separately promotes only that exact implementation/version after the real-provider and
local-stack evidence passes. Until C3, no production Admin navigation, callback finalization,
binding, Connected result, migration writer, or compatibility cutover is enabled.

Callback success is not the discovery boundary. Two source-owned provider observations run without a
browser session or tenant binding:

- a signature-verified GitHub App `installation` lifecycle webhook creates only a provisional
  observation; and
- a bounded, App-authenticated inventory reconciliation enumerates current App installations and
  independently fetches the exact installation and permitted repository facts.

Neither the webhook payload nor an inventory display label is authority. Only App-authenticated
corroboration creates the immutable association key. Under the association lock, an exact current
binding routes the observation to ordinary WF-231 reconciliation; only an association with no
binding creates the globally unique `ProviderObservedInstallationQuarantine`. A binding finalizer
cannot race around that quarantine: it must attach the exact still-admissible proof and consume the
quarantine by generation compare-and-set. The quarantine immediately denies ordinary installation-
token minting, quarantines signed webhook payloads from product projection/mutation, and rejects
outbound Issue/mirror work. It reveals no tenant or pending-proof existence. A missing callback,
closed tab, expired session, lost callback response before admission, disabled/delayed webhook, or
worker restart is recovered by the bounded inventory sweep and cannot leave an unobserved ordinary
sync path.

An admissible later callback may compare-and-set its still-current pending generation onto the
existing quarantine and saga; it never creates a second lineage. An expired, unauthorized,
different-principal, or otherwise inadmissible late callback returns the ordinary safe denial/
restart result and cannot bind, attribute, clear, or bypass the quarantine. When exact attribution
cannot be proven, cleanup remains globally contained and moves to `revocation_required` for a secure
App Human Owner action rather than guessing which tenant introduced the installation.

As soon as either the callback path or provider-observation path corroborates the immutable
association and before binding:

- the association-wide fence blocks another actor or tenant from binding or starting setup for the
  same association;
- installation-token minting is denied except for the exact verification or cleanup operation;
- outbound Issue/mirror work cannot be created or claimed; and
- signed webhooks may be authenticated and safely counted for security telemetry, but their payloads
  are quarantined from inbox projection, DevTicket/Card mutation, and synchronization.

Step-up expiry alone may hold a bounded `awaiting_final_step_up` pause until the pending proof's
fixed expiry. It does not repeat provider work or immediately uninstall an otherwise resumable
setup. The cleanup saga starts when the actor cancels, the pending proof expires, live authority or
policy makes resumption inadmissible, same-user/association proof fails terminally, the owner
explicitly abandons setup, or an unattributed provider observation exceeds its fixed callback-
correlation grace window. Startup/recovery and the bounded App-inventory reconciler create or resume
the saga for every expired, abandoned, or unattributed unbound association; no row may be silently
deleted as “never connected.”

The saga follows one transaction-first generation contract:

1. A source transaction locks the association observation generation plus its optional exact pending
   generation, records `cleanup_pending`, keeps the global association fence, zeroes any linked
   unclaimed verifier handle, and creates one safe saga reference. Same-key replay returns it;
   different-key concurrency returns `unbound_cleanup_already_started`. A later admissible callback
   may attach its pending generation by compare-and-set but cannot replace or duplicate the saga.
2. The source proves there is no binding, cancels only setup work proven unsent, and contains any
   possibly issued user/access/refresh credential under the exact WF-231 cleanup rules. A possibly
   sent authorization exchange remains `exchange_outcome_unknown`; cleanup never invents absence.
3. Automatic provider uninstall is allowed only when protected proof shows an exactly correlated
   attempt introduced or owner-authorized the exact installation and current App/policy authority
   admits uninstall. An unattributed, pre-existing, or adopted installation, or missing uninstall
   authority, never triggers destructive inference; it moves to `revocation_required` with one
   secure App Human Owner instruction.
4. Before an admitted uninstall call, a durable sender claim/fence commits. A lost/ambiguous
   response becomes scoped `provider_outcome_unknown`; the saga never blind-retries, calls local
   deletion success, or lets another setup bypass the fence.
5. Terminal `unbound_cleaned` requires exact provider uninstall/nonexistence proof for the
   corroborated association, terminal credential cleanup, zero usable verifier/credential handles,
   zero admitted webhook/outbound work, and an append-only source-owned audit result in one
   generation compare-and-set that terminalizes the provider-observed quarantine and saga together.
   Stale/late finalizers lose. Only then may a fresh setup generation begin.

For a CAS-attributed lineage, the source audit identity is tenant-scoped and tenant is mandatory.
For an unattributed lineage, every automatic containment/cleanup transition and Human Owner command
uses the explicit platform authority namespace, admitted platform actor/service principal, opaque
quarantine/association-observation generation, and nullable tenant; a supplied or guessed tenant is
rejected. That platform audit remains source-owned and tenant-invisible. Security & Audit may expose
only its authorized platform-scoped query/index/export projection and never writes the result.

Tenant Integrations projects the safe saga phase, practical impact, and admitted owner action only
after exact CAS attribution to that tenant/pending generation. It never renders an unattributed
quarantine, installation ID, cleanup handle, raw provider response, or false Connected/Disconnected
result. The platform-scoped remediation/attention projection is separately authorized and cannot be
reached through a tenant route or cache.

## Disconnect generation contract carried from WF-231

`DisconnectGitHub` is a durable source-owned saga and must be rendered, not reimplemented, by
Integrations:

1. The first authorized command locks the exact Installation/Repository Binding generation, records
   one GitHub Disconnect Saga, marks lifecycle `disconnecting`, advances the outbound fence, rejects
   new token mints/claims, and snapshots every pre-fence Mirror Outbox Intent atomically.
2. A unique binding-generation constraint permits one saga/provider-action lineage even when
   concurrent callers use different idempotency keys. Same key/hash returns the saga; same
   key/different hash rejects; a different key returns `disconnect_already_started` and the existing
   safe saga ref.
3. Every unclaimed pre-fence intent proven unsent becomes `cancelled_before_send`. Claimed or
   possibly sent effects drain to confirmed, conflict-bound, or retained `outcome_unknown`. Ordinary
   workers cannot claim pre-fence work after the fence, and finalization cannot omit an unclaimed
   intent.
4. The saga chooses only an owner-authorized provider action. A lost/ambiguous response becomes
   `provider_outcome_unknown`; required account-owner action becomes `revocation_required` with one
   secure in-product instruction. Neither path blind-retries or claims local deletion as success.
5. Provider-confirmed uninstall/revocation/expiry precedes local cleanup. Platform App registration
   secrets are not tenant-owned and are never deleted by disconnect. Safe binding/history and the
   quarantined cleanup handle remain until terminal proof.
6. Final `disconnected` requires outbound drain, provider outcome, local cleanup, and
   retained-history proof in one compare-and-set finalizer. Stale workers/finalizers lose by
   claim/generation fence.
7. Reconnect is disabled during `provider_outcome_unknown`, `revocation_required`, or incomplete
   local cleanup. A terminal disconnect permits a **new** setup proof and binding generation; it
   never revives or overwrites the old generation or its history.

## Sad paths and edge cases

| Condition / race                                                                                                       | Required observable behavior                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required Dev Board source extension is absent, unapproved, undesignated, or incompatible                               | No provisional exchange-attempt/fence, quarantine/unbound-cleanup record, legacy-flow fence/cohort, command, audit path, tenant projection, History row, migration, prototype truth, or implementation slice is registered from this memo. Already-authorized WF-231 behavior remains available; the dependent Admin state reports a blocked dependency without provider or tenant leakage.                       |
| C2-authorized source candidate exists but C3 promotion is absent, failed, stale, or for another version                | The exact candidate remains test-only and non-routable. Controlled scratch-App/local-stack proof may continue, but production provider navigation, callback finalization, binding, Connected status, migration writes, compatibility cutover, and source rows generated by production remain unavailable. Evidence for another version cannot promote it.                                                         |
| Governance Audit owner contract is unresolved, unapproved, or unavailable                                              | Read-only admitted projections may continue under their other gates, but no setup, exchange, cleanup, repair, disconnect, or migration mutation is implemented or enabled. No ad hoc safe summary, configuration diff, version-ref substitution, source-audit omission, or Security & Audit write is permitted.                                                                                                   |
| Source audit `requested` append fails before provider I/O                                                              | No provider call, sender claim, local success, or terminal audit event occurs. The governed command remains failed/retryable under the same deterministic receipt without changing the provider.                                                                                                                                                                                                                  |
| Source audit terminal append fails after a known or indeterminate provider effect                                      | Preserve the source-owned provider outcome/fence and do not terminalize local workflow state. Retry only the deterministic audit append/finalizer; never repeat the provider mutation. An unknown result stays non-terminal until admissible reconciliation appends the later `completed` or `failed` event.                                                                                                      |
| Root or Integrations capability denied                                                                                 | Pre-fan-out hard 403; no source query, redirect, empty/not-configured disguise, existence metadata, or cached data.                                                                                                                                                                                                                                                                                               |
| Existing foreign-tenant ref versus random well-formed ref                                                              | Same 403/code/body-size/header/cache/timing class; RLS denies both; only redacted server security telemetry differs.                                                                                                                                                                                                                                                                                              |
| Existing platform-quarantine opaque ref versus random ref under tenant-only, wrong-platform, or unauthorized principal | Same hard-403 status/code/body-size/header/cache/timing distribution before source fan-out; no existence, installation, platform-scope, pending-proof, or tenant metadata. Only authorized platform-scope policy may admit the opaque ref.                                                                                                                                                                        |
| Membership, role, policy, or tenant changes after render                                                               | Submit/callback reauthorizes current session/version and fails with no binding/command when stale; cache admission invalidates.                                                                                                                                                                                                                                                                                   |
| Step-up expired or reused for another target/version/action                                                            | Reject before mutation and require fresh target-bound proof; approval/confirmation cannot substitute.                                                                                                                                                                                                                                                                                                             |
| Step-up expires after provider navigation but before final binding                                                     | Pause `awaiting_final_step_up` with no binding. Permit fresh same-generation step-up until fixed proof expiry; then start unbound cleanup. Never repeat provider installation or code exchange.                                                                                                                                                                                                                   |
| Missing/invalid Origin or CSRF on unsafe browser command                                                               | Reject with no command receipt, provider call, or audit success row.                                                                                                                                                                                                                                                                                                                                              |
| Same idempotency key and hash replay                                                                                   | Return the same source receipt/saga; do not repeat a provider effect.                                                                                                                                                                                                                                                                                                                                             |
| Same key with a different canonical request hash                                                                       | Deterministic idempotency collision; zero new command/provider effect.                                                                                                                                                                                                                                                                                                                                            |
| Installation callback state missing, invalid, expired, or consumed                                                     | No binding. Unauthorized/mismatched access uses generic 403; an admitted consumed/expired proof renders safe consumed/restart state at the fixed setup destination.                                                                                                                                                                                                                                               |
| Provider installation succeeds but callback never arrives or arrives after expiry/session loss                         | Verified lifecycle-webhook observation or bounded App inventory creates one unattributed global quarantine and containment lineage without tenant inference. Tenant Integrations, History, search, notifications, and prototype fixtures reveal nothing. Only the platform-scoped remediation surface may act until exact correlation attaches once by CAS; a late inadmissible callback cannot bind or clear it. |
| Authorization callback state/PKCE/code missing or replayed                                                             | No exchange/binding on invalid proof; one winning proof transition; no code/state/verifier in output or telemetry.                                                                                                                                                                                                                                                                                                |
| PKCE verifier handle is missing, expired, already claimed, or cannot decrypt                                           | No token exchange or binding. Atomically zero/quarantine the handle, classify the pending generation, and start unbound cleanup where an installation exists; never recreate a verifier for the old challenge.                                                                                                                                                                                                    |
| Claimed `installation_id` is spoofed                                                                                   | Treat as attacker input; require same-user association plus independent App-authenticated installation/repository proof before binding.                                                                                                                                                                                                                                                                           |
| GitHub user cannot access the claimed installation/repository                                                          | Deny proof, perform governed cleanup, create no binding, disclose no provider-sensitive mismatch details.                                                                                                                                                                                                                                                                                                         |
| Different browser tab completes the same proof                                                                         | One transaction wins; all other tabs render consumed/superseded state without repeated exchange or binding.                                                                                                                                                                                                                                                                                                       |
| Allowlisted outbound provider navigation is built                                                                      | Only public App slug/client ID, opaque signed state, PKCE challenge, fixed `code_challenge_method=S256`, and exact callback URI appear on the GitHub request; verifier, `plain`, and all other state are absent.                                                                                                                                                                                                  |
| Bounded server token exchange is dispatched                                                                            | Only the exact GitHub token endpoint receives canonical client ID, resolved client secret, admitted code, fixed redirect URI, and once-released verifier after the durable sender fence; no redirect or replay.                                                                                                                                                                                                   |
| Back/refresh after callback                                                                                            | Reload safe server proof without mutation replay or Opzava re-emission; a retained prior provider/callback URL is not claimed erased and remains replay-safe.                                                                                                                                                                                                                                                     |
| Safe provider read/probe response is lost                                                                              | Bounded policy-aware read retry is allowed; freshness remains unknown/unavailable until proof returns; no mutation or healthy inference occurs.                                                                                                                                                                                                                                                                   |
| Installation callback browser response is lost                                                                         | Reload the local pending proof; the callback created no binding/provider mutation and is not converted into one.                                                                                                                                                                                                                                                                                                  |
| Authorization exchange crashes before the durable `prepared` commit                                                    | No provider send or durable transition. The callback may retry only through its still-current one-time proof; no outcome is guessed.                                                                                                                                                                                                                                                                              |
| Authorization exchange crashes after `prepared` but before committed `sending`                                         | Recovery proves no token send, records `cancelled_before_send`, zeroes the verifier, and requires fresh setup. Existing unbound installation cleanup remains required before `not_configured`.                                                                                                                                                                                                                    |
| Authorization exchange crashes after committed `sending`, or a late response/finalizer races recovery                  | Conservatively fence `exchange_outcome_unknown`; never retry/bind. Stale success loses; any late credential enters protected cleanup-only state under the exact attempt/generation/claim fence.                                                                                                                                                                                                                   |
| Authorization-code exchange result is indeterminate                                                                    | Fence one `exchange_outcome_unknown`; no binding/restart/replay/code-expiry inference. Credential terminal proof plus applicable unbound cleanup returns `not_configured`; otherwise stay stopped/revocation required.                                                                                                                                                                                            |
| Different actor or tenant starts setup while the same corroborated association is unknown/unbound                      | Reject before proof/provider dispatch under the immutable association fence; reveal no foreign-tenant metadata and create no second setup generation.                                                                                                                                                                                                                                                             |
| Pending proof expires, is abandoned, or becomes inadmissible after provider installation                               | Start/resume one unbound cleanup saga; contain token minting, webhooks, and outbound work; no binding, silent row deletion, or false not-configured terminal state.                                                                                                                                                                                                                                               |
| Unbound uninstall response is lost or uninstall requires a Human Owner                                                 | Keep association fenced in scoped `provider_outcome_unknown` or `revocation_required`; never blind-retry or call local deletion success.                                                                                                                                                                                                                                                                          |
| Failed setup selected a pre-existing/adopted installation without proved uninstall authority                           | Do not auto-uninstall. Retain containment/fence and require exact Human Owner remediation or later admissible proof.                                                                                                                                                                                                                                                                                              |
| Access/user/refresh cleanup response is lost or refresh revoke returns `202`                                           | Require applicable documented `204`, optional access-token `404`, later documented proof, or recorded provider-issued expiry; retain quarantined handle meanwhile.                                                                                                                                                                                                                                                |
| Mirror/outbox provider mutation response is lost                                                                       | Retain WF-231 source-owned `outcome_unknown`; no page-local retry or absence inference.                                                                                                                                                                                                                                                                                                                           |
| Second repository is selected or appears in callback                                                                   | Reject; V1 binds only the exact Opzava repository. No partial second binding or silent repository switch.                                                                                                                                                                                                                                                                                                         |
| GitHub identity, callback proof, credential, or health result is offered as Runner trust                               | Reject before Runner enrollment, command delivery, receipt admission, containment, or execution admission; create no Runner record or state transition.                                                                                                                                                                                                                                                           |
| Repository renamed                                                                                                     | Update display/routing name only after immutable repository-ID verification; preserve binding generation.                                                                                                                                                                                                                                                                                                         |
| Repository transferred, removed, archived, deleted, or Issues `410`                                                    | Health becomes unhealthy/unverifiable at the owner-defined scope; token/outbound capability stops; transfer never silently rebinds.                                                                                                                                                                                                                                                                               |
| Permission/event/config drift                                                                                          | Re-evaluate exact grants. Missing capabilities pause/stop only their defined scopes; unsupported required schema makes the capability unhealthy.                                                                                                                                                                                                                                                                  |
| One probe succeeds after prior failure                                                                                 | Keep health non-healthy until all required probes, ambiguous work, outbox/inbox state, and a complete post-repair reconciliation pass.                                                                                                                                                                                                                                                                            |
| Health evidence is stale, unknown, unavailable, or LKG                                                                 | Label the exact axis and practical effect. Never render healthy/current or authorize a fresh-fact gate from it.                                                                                                                                                                                                                                                                                                   |
| Integration has never been configured                                                                                  | Lifecycle/freshness says not configured and offers admitted setup; do not label unhealthy or open an outage Incident merely for absence.                                                                                                                                                                                                                                                                          |
| Human attempts to approve unhealthy/unverifiable trust                                                                 | Reject as non-bypassable Absolute Stop. No Needs Human Approval Request or approval can convert the health state.                                                                                                                                                                                                                                                                                                 |
| `ResolveAbsoluteStop` succeeds                                                                                         | Restore ordinary command retry eligibility only; do not change Ready, lane, assignment, Review, merge, Release, or Done.                                                                                                                                                                                                                                                                                          |
| Disconnect same/different-key races                                                                                    | One saga for the binding generation; return its safe ref or idempotency mismatch, never a second provider action.                                                                                                                                                                                                                                                                                                 |
| Disconnect fence races unclaimed/claimed outbox work                                                                   | Prove unsent cancellation; drain possibly sent work; no post-fence ordinary claim or omitted pre-fence intent.                                                                                                                                                                                                                                                                                                    |
| Disconnect provider response is ambiguous                                                                              | Lifecycle `provider_outcome_unknown`; outbound stays fenced; no blind retry/local-success claim; reconnect disabled.                                                                                                                                                                                                                                                                                              |
| Human provider action is required to revoke/uninstall                                                                  | Lifecycle `revocation_required`; show exact secure in-product instruction/status; retain history/cleanup handle; reconnect disabled.                                                                                                                                                                                                                                                                              |
| Stale disconnect finalizer arrives after reclaim                                                                       | Claim/generation compare-and-set rejects it; winning saga state remains.                                                                                                                                                                                                                                                                                                                                          |
| Provider returns `401`, permission/rate `403`, `404`, `410`, `422`, `429`, or `5xx`                                    | Classify per WF-231; do not conflate auth, permission, identity, schema, rate, or transient failure; no blind retry storm or false deletion.                                                                                                                                                                                                                                                                      |
| Integration History source is unavailable or changes inside snapshot boundary                                          | Render that source `partial`/`unstable` with its last safe checkpoint, retain other verified rows, and require refresh; do not skip, advance a gap, or claim completeness.                                                                                                                                                                                                                                        |
| New History event arrives during pagination                                                                            | Hold it beyond the captured high-watermark until refresh; keep current pages stable.                                                                                                                                                                                                                                                                                                                              |
| Same content/timestamp appears from two owners                                                                         | Keep both composite identities; never heuristic-deduplicate. Authorized exact correlation may cluster visually without merging rows.                                                                                                                                                                                                                                                                              |
| History cursor is replayed under another principal/tenant/schema/source set                                            | Reject the signed cursor before source fan-out; expose no cursor internals or source existence.                                                                                                                                                                                                                                                                                                                   |
| History row points to a now-forbidden source                                                                           | Omit before fan-out or make direct link return generic 403; do not leak row existence, target label, or timestamp.                                                                                                                                                                                                                                                                                                |
| Legacy route receives unknown query/fragment                                                                           | Do not forward it. Land at an explicit safe admitted root/setup restart or reject; never build a redirect chain/loop.                                                                                                                                                                                                                                                                                             |
| Legacy route target lacks verified parity                                                                              | Keep legacy route admitted and active/read-only as appropriate; a placeholder or prototype is not redirect authority.                                                                                                                                                                                                                                                                                             |
| Withdrawable legacy redirect is cached or requested after rollback flag changes                                        | Temporary 307/no-store response is re-evaluated server-side; 301/308, retained service-worker/CDN mapping, redirect loop, or stale target authorization fails the cutover gate.                                                                                                                                                                                                                                   |
| Prohibited field appears outside its allowed request/protected proof, or Opzava re-emits transient state               | Fail the security gate, quarantine the artifact, and stop cutover; prior user-agent provider/callback history alone is not Opzava persistence.                                                                                                                                                                                                                                                                    |
| Any transient protocol value is written to or derived through a cookie                                                 | Fail the security gate and create no binding. Only the unchanged pre-existing opaque session cookie may accompany callbacks.                                                                                                                                                                                                                                                                                      |

## Behavioral contracts at real seams

Any contract below that exercises a provisional exchange-attempt/fence, quarantine/unbound-cleanup
record, or legacy-flow fence/cohort is executable only after gate C2 approves and designates the
owning source amendment. Before C2, the first sad-path row above is the contract: those records,
ports, commands, migrations, and projections do not exist merely because this memo names them.

| Contract ID | Seam                            | Given / action                                                                                                                                                                                                                      | Required observation                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GH-ADM-001  | HTTP route admission            | Authenticated principal without root or leaf authority requests inventory, detail, history, callback-proof, or command routes                                                                                                       | Hard 403 before denied source fan-out; no redirect/empty/not-configured response and no existence-dependent body/header/cache/timing signal                                                                                                                                                                                                                               |
| GH-ADM-002  | HTTP inventory/detail           | Admitted principal loads `/integrations` and `/integrations/github`                                                                                                                                                                 | Owner envelopes retain provenance/version/source/observation/freshness/LKG; four axes remain distinct; browser receives no prohibited field                                                                                                                                                                                                                               |
| GH-ADM-003  | Installation callback GET       | Valid one-time installation state returns with an attacker-controlled installation claim                                                                                                                                            | State/session/tenant/proof admission advances only to user-authorization proof; zero tenant binding until same-user and App-authenticated corroboration                                                                                                                                                                                                                   |
| GH-ADM-004  | Authorization callback GET      | Valid second state, PKCE `S256`, and code return for the same admitted proof                                                                                                                                                        | Durable fenced exact token-endpoint exchange uses once-released verifier and two-source corroboration; fresh same-generation exact-target step-up, cleanup, and live reauthorization precede one binding; redirect is fixed no-store 303                                                                                                                                  |
| GH-ADM-005  | Callback replay/browser         | Callback is refreshed, replayed, opened in two tabs, or visited after proof expiry                                                                                                                                                  | Exactly one proof transition; no repeated provider mutation; admitted user sees safe consumed/restart state; mismatched principal gets generic 403                                                                                                                                                                                                                        |
| GH-ADM-006  | Unsafe command HTTP             | Setup/repair/disconnect POST has bad Origin/CSRF, stale target, expired step-up, authorization drift, or idempotency collision                                                                                                      | No source mutation/provider call; typed rejection; same-key/same-hash replay returns the existing source receipt; post-navigation step-up refresh resumes only the same still-current pending generation                                                                                                                                                                  |
| GH-ADM-007  | Postgres setup/RLS              | Concurrent valid setup finalizers and cross-tenant reads target the same installation/repository                                                                                                                                    | RLS denies foreign access; unique locks admit one binding/generation; raw callback ID is absent while the protected proof/binding retains only the independently corroborated ID and opaque App rotation version                                                                                                                                                          |
| GH-ADM-008  | Postgres callback proof         | State/PKCE is replayed, verifier access races/restarts/expires, session or authorization changes, or cleanup response is ambiguous                                                                                                  | Single-use/hash/version constraints reject replay; encrypted verifier releases once only to committed sender and is CAS-zeroed on every terminal/unknown path; no binding; cleanup handles remain quarantined until exact proof/expiry                                                                                                                                    |
| GH-ADM-009  | Postgres command receipt        | Same/different hash/idempotency and concurrent repair/disconnect commands execute                                                                                                                                                   | Source-owned canonical request-hash receipts provide deterministic replay/collision behavior; one disconnect saga per binding generation across keys                                                                                                                                                                                                                      |
| GH-ADM-010  | Postgres disconnect fence       | Pre-fence unclaimed and claimed Mirror Outbox Intents race a disconnect request and stale finalizer                                                                                                                                 | Unsent cancellation is proven, possibly sent work drains/retains unknown, no post-fence ordinary claim/mint, and stale finalizer cannot terminalize the winning saga                                                                                                                                                                                                      |
| GH-ADM-011  | Provider association            | Callback supplies a valid-looking installation ID for the wrong GitHub user, App, tenant, or repository                                                                                                                             | Independent user-accessible installation/repository and App-authenticated fetch disagree; no binding or leaked mismatch detail                                                                                                                                                                                                                                            |
| GH-ADM-012  | Provider repository policy      | Provider returns the expected installation with a second repository, permission drift, rename, transfer, removal, archive, or Issues-disabled result                                                                                | One repository only; rename preserves immutable ID; second/transfer/remove/permission drift follows exact fail-closed health/scope policy; no silent rebinding                                                                                                                                                                                                            |
| GH-ADM-013  | Provider health/reconcile       | A probe recovers while snapshots, outbox, mutation outcome, or Reconciliation Epoch remains incomplete                                                                                                                              | Health cannot become healthy and Absolute Stop cannot resolve until the full WF-231 recovery proof is current                                                                                                                                                                                                                                                             |
| GH-ADM-014  | Provider cleanup                | Uninstall/revoke response is lost, provider action requires a Human Owner, or refresh revoke returns `202 Accepted`                                                                                                                 | `provider_outcome_unknown` or `revocation_required`; no blind retry/local deletion success; refresh cleanup remains unconfirmed until later documented proof or deterministic provider-issued expiry                                                                                                                                                                      |
| GH-ADM-015  | Browser/security boundary       | Sentinels cover every App/OAuth/PAT/state/PKCE/cleanup class, server exchange, challenge method, cookie, and UI/setup/history flow                                                                                                  | Fixed `S256`; only exact navigation/callback/token-exchange requests carry admitted values; no transient enters any cookie; opaque session cookie is unchanged; zero re-emission into other request/URL/render/storage/telemetry                                                                                                                                          |
| GH-ADM-016  | Browser state truth             | Each admitted tenant lifecycle × health × freshness × attention combination is rendered, including not configured, CAS-attributed provider-observed quarantine, exchange unknown, stale LKG, disconnect unknown, and unhealthy stop | No unattributed platform quarantine or tenant inference; no conflated badge; no setup absence labeled outage; no unknown/stale rendered healthy; no Absolute Stop labeled Needs Human Approval; only currently admitted actions are enabled                                                                                                                               |
| GH-ADM-017  | Browser accessibility           | Detail/history is driven in light/dark, keyboard-only, screen reader, reduced motion, and 320 CSS-pixel viewport                                                                                                                    | Top-to-bottom reading order, semantic headings/tables/lists, visible focus, named status/actions, no color-only meaning, no horizontal overflow, and usable 44px touch targets                                                                                                                                                                                            |
| GH-ADM-018  | History federation              | Equal-time/correlated/corrected tenant and authorized platform rows, new events, source loss/mutation, and cursor continuation occur across an authorized snapshot                                                                  | Scope-aware composite identities dedupe exact keys only; platform rows retain namespace/opaque ref/nullable tenant and are never duplicated or relabeled per tenant; total order and captured high-watermarks keep pages stable; correlated rows stay separate; source gaps become partial/unstable; refreshed snapshot admits new events; forbidden detail leaks nothing |
| GH-ADM-019  | Compatibility routes/cache      | Old GitHub/add routes and channel fragment are requested before/after parity/rollback with valid, unknown, hostile, cached, back/forward, and service-worker/CDN state                                                              | Before parity legacy remains; withdrawable mapping is one-hop temporary 307 with exact no-store headers and server re-evaluation; no 301/308, unsafe forwarding, stale cached target, loop, or authorization bypass                                                                                                                                                       |
| GH-ADM-020  | Rollback                        | Target UI/worker regression occurs after the App path is the sole writer                                                                                                                                                            | Legacy reads may return read-only; target writes freeze if unsafe; no legacy connect/write path, OAuth device start, PAT/env writer, manual close worker, or dual-write is restored                                                                                                                                                                                       |
| GH-ADM-021  | Safe read loss                  | A provider read/probe response is lost                                                                                                                                                                                              | Bounded safe retry may run; state remains unknown/unavailable until evidence returns; zero provider mutation and no healthy inference                                                                                                                                                                                                                                     |
| GH-ADM-022  | Installation callback loss      | The browser loses the response after the installation callback's local proof transition                                                                                                                                             | Reload returns the same safe local proof state; zero tenant binding/provider mutation and no generic reconciliation claim                                                                                                                                                                                                                                                 |
| GH-ADM-023  | Authorization exchange loss     | The authorization-code exchange outcome is indeterminate and another actor/tenant targets the same corroborated association                                                                                                         | One association-wide fenced `exchange_outcome_unknown`; zero binding/new generation/replay across principals; exact terminal proof returns `not_configured`, otherwise stopped or `revocation_required`                                                                                                                                                                   |
| GH-ADM-024  | Credential cleanup loss         | Access/user/refresh cleanup response is lost or refresh revoke returns `202 Accepted`                                                                                                                                               | Quarantined handle remains until exact applicable documented proof or deterministic recorded provider-issued expiry; no false revocation                                                                                                                                                                                                                                  |
| GH-ADM-025  | Legacy lost-flow cohort         | Worker restarts erased in-memory device flows before the durable fence                                                                                                                                                              | One bounded unknown-loss cohort terminalizes only after zero reachable consumers, disabled legacy path, and maximum code TTL plus skew; durable handles/items remain individually classified                                                                                                                                                                              |
| GH-ADM-026  | GitHub/Runner trust boundary    | A GitHub App/OAuth identity, callback proof, credential, binding, or health result is submitted at a Runner enrollment, command, receipt, containment, or execution-admission seam                                                  | Reject before Runner source dispatch or state mutation; zero Runner Registry, enrollment epoch, capability, command, receipt, containment, or execution-admission effect                                                                                                                                                                                                  |
| GH-ADM-027  | Exchange durable send fence     | Crash/restart occurs before `prepared`, after `prepared`, after committed `sending`, after provider send, or while a late response/finalizer races recovery                                                                         | Zero send before current sender claim; verifier releases once after claim and CAS-zeroes; provably unsent cancels, every possibly sent attempt becomes unknown, stale success loses, late credential is cleanup-only, raw code is never persisted                                                                                                                         |
| GH-ADM-028  | Final binding step-up           | Step-up expires after provider navigation or its target/version/pending generation changes before binding                                                                                                                           | Zero binding. Fresh step-up may resume only the same current generation before expiry; afterward one unbound cleanup saga contains provider effects and no provider operation is repeated                                                                                                                                                                                 |
| GH-ADM-029  | Server token egress             | Browser/tenant/provider values attempt to alter token endpoint/origin/redirects or add request fields                                                                                                                               | Only closed configured GitHub token endpoint receives the exact admitted client ID/secret, code, redirect URI, and once-released verifier over verified TLS after durable fence; no redirects, logs, replay, or arbitrary egress                                                                                                                                          |
| GH-ADM-030  | Unbound installation cleanup    | After gate C2 approves the source extension, setup expires/fails/abandons after App installation, uninstall response is ambiguous, authority is missing, or stale finalizer races recovery                                          | One active saga per corroborated association observation generation with optional exact pending link; global containment; tenant audit/projection only after CAS attribution; otherwise platform authority/audit only; exact cleanup or `revocation_required`; stale finalizer loses; no orphan or false success                                                          |
| GH-ADM-031  | Governance audit ownership      | Tenant-scoped and proven platform-scoped GitHub commands execute while Security & Audit queries them                                                                                                                                | Each semantic context appends its own scope-correct audit truth; tenant is mandatory for tenant scope and nullable only for enumerated platform scope with platform actor/namespace/opaque target; guessed tenant is rejected; Security & Audit only federates/indexes/exports                                                                                            |
| GH-ADM-032  | Provider installation discovery | After gate C2 approves the source extension, GitHub commits an App installation but the callback is missing, late, session-expired, or never admitted; lifecycle webhook may also be delayed or unavailable                         | Signed webhook is provisional; App inventory corroborates one unattributed global quarantine/fence/saga with no tenant; tenant surfaces remain blind; platform-only remediation/audit contains it until exact CAS attribution or exact cleanup/`revocation_required`                                                                                                      |
| GH-ADM-033  | Source audit lifecycle          | After gate D, fault-inject source audit append failure before provider I/O, after a known provider result, and after an indeterminate response for exchange, cleanup, repair, disconnect, and migration commands                    | Idempotency precedes one append-only `requested` event and durable sender fence before I/O; pre-I/O append failure sends nothing; known outcomes later append `completed`/`failed`; unknown appends non-terminal `outcome_unknown`; post-effect append failure blocks local terminalization and retries only the deterministic append/finalizer, never provider I/O       |
| GH-ADM-034  | Platform-ref anti-enumeration   | Tenant-only, wrong-platform, and unauthorized principals request an existing opaque platform-quarantine ref and a random well-formed ref                                                                                            | Both are rejected pre-fan-out with the same status/code/body-size/header/cache/timing distribution and no platform, installation, pending-proof, tenant, or existence metadata; only redacted server security telemetry differs                                                                                                                                           |

The Postgres seam must additionally assert row-level absence of App Registration Ref/ID, vault or
SecretRef identity/version, token/fingerprint/cleanup-handle values, signed state, PKCE verifier,
raw webhook body, and raw provider errors from every tenant-queryable table. Server-only encrypted
association/provider-observed-quarantine/pending-proof/exchange-attempt storage is admitted only
through its dedicated policy/role. It may retain the exact protected fields already admitted by
WF-231 and, only after gate C2, the exact approved exchange fences enumerated above, including
independently corroborated immutable provider IDs, a keyed authorization-code digest, and the
encrypted non-exportable generation-scoped verifier handle, but never the raw code or plaintext
verifier at rest. Single-use release/zeroization and tenant denial are row-level tested; tenant
queries receive safe receipts, never protected fields or handles.

## Authenticated local-Docker end-to-end validation

Implementation acceptance must drive the real product at `http://web.opzava.localhost:18088` with
real login, the seeded authorized tenant, the local Docker stack, and one fixed scratch repository
installed on the real test GitHub App. The scratch repository is provider test infrastructure, not a
second production binding. No model is an assertion oracle.

The real user-level drive must:

1. Verify Integrations inventory/detail/history admission, direct hard-403 deep links,
   foreign-existing versus random-ID anti-enumeration, tenant RLS, cache invalidation after
   role/membership change, and no denied source fan-out.
2. Before gate C2, prove the Admin setup path cannot navigate to GitHub, finalize a callback, or
   register a provisional durable exchange attempt. After gates C2 and D are approved and Slice 3 is
   integrated, exercise the exact version through its controlled non-production promotion boundary
   without entering a token; prove the production route remains non-routable before C3. Inspect the
   exact outbound GitHub navigation and prove it contains only the required public App slug/client
   ID, opaque state, code challenge, fixed `code_challenge_method=S256`, and registered callback
   URI; prove `plain` is never offered. Inspect both callback requests and their
   no-store/no-referrer/fixed-303 behavior. Complete same-user association and independent App
   authentication. At the live provider-adapter seam, prove exactly one post-fence server POST
   reaches the fixed GitHub token endpoint with only the admitted
   client-ID/client-secret/code/redirect-URI/verifier field classes, without persisting their values
   or following a redirect. Complete credential cleanup, fresh exact-target step-up, live
   reauthorization, exact one-repository binding, first full reconciliation, and healthy
   eligibility. Gate C3 may promote only this exact version after the full drive succeeds; then
   repeat the admitted production entry and prove it routes to the same implementation.
3. Under the approved C2 exchange-attempt contract, replay/expire/tamper both signed states,
   mismatch PKCE, spoof installation ID, switch tenant, demote/revoke the Admin, expire the session,
   use back/refresh, and race multiple tabs. Lose the installation callback browser response. For
   authorization exchange, fault-inject crash before the `prepared` commit, after `prepared` but
   before `sending`, after the committed `sending` claim but before socket send, after provider send
   but before response persistence, and during restart recovery. Restart once before callback to
   prove the encrypted verifier survives, then race missing/expired/decrypt-failed/double-claim
   verifier, a stale finalizer, and a late credential-bearing response. Prove zero provider send
   before a committed current sender claim, one verifier release, CAS zeroization on
   success/cancel/unknown/expiry, safe `cancelled_before_send` only for provably unsent work, and
   one explicit `exchange_outcome_unknown` for every possibly sent attempt. Attempt the same
   corroborated immutable association as different actors and tenants and prove the global fence
   rejects every new generation without leaking foreign state. Prove stale success loses, late
   credential is retained only for protected governed cleanup, raw code is never persisted, and
   exact terminal proof or `revocation_required` follows. Prove no transient parameter is re-emitted
   into the fixed Opzava post-303 URL/history entry, rendered state, application storage, or
   telemetry. Treat a prior provider/callback URL retained by the user agent as expected protocol
   history, not proof of application persistence.
4. Attempt a second repository and exercise repository rename, transfer, remove/re-add, archive,
   permission/event drift, App public configuration rotation, and token/cleanup ambiguity. Verify
   exact lifecycle/health/freshness/attention axes and no silent rebind/healthy claim.
5. Fault-inject rate, auth, permission, `404`, `410`, `422`, `429`, `5xx`, outbox lag/dead/unknown,
   webhook freshness/signature failure, partial reconciliation, and nonconvergence. Separately lose
   a safe read/probe response, access/refresh cleanup response (including refresh `202 Accepted`),
   and Mirror Outbox provider-mutation response. Prove bounded safe read retry only, exact
   documented cleanup/expiry proof, WF-231 source-owned `outcome_unknown`, dimensional health,
   LKG/freshness, and Absolute Stop behavior.
6. Drive safe recheck/reconcile and every owner-defined repair. Replay same idempotency key/hash,
   collide a different hash, expire/change the step-up target/version, fail Origin/CSRF, and attempt
   human approval of an Absolute Stop. Separately expire step-up after successful provider
   navigation but before binding: prove no binding, then submit a fresh stepped-up Opzava POST for
   the same pending generation/current target/version before proof expiry and prove it revalidates
   and resumes without repeating provider installation or authorization exchange. Prove source
   receipts and zero bypass/provider duplication. Before gate D, prove every GitHub mutation path is
   unavailable and appends no substitute audit shape. After the PRD-013/#192 owner contract is
   approved, inspect each exchange, cleanup, repair, disconnect, and migration mutation. Prove
   idempotency admission precedes the exact accepted source-owned `requested` event and durable
   sender fence before provider I/O; known results append later `completed`/`failed` events, while
   indeterminate results append non-terminal `outcome_unknown` and only later reconcile to
   `completed`/`failed`. Fault-inject append failure before I/O and after provider effect. Prove the
   former sends nothing, the latter prevents false local terminalization and retries only the
   deterministic append/finalizer, and neither path repeats provider I/O. Prove no Security & Audit
   write and no secret-bearing summary/diff.
7. Before gate C2, prove no provisional quarantine/unbound-cleanup port, command, audit path,
   projection, or fixture can be registered from this memo. Then, against the approved and
   designated source extension on the real scratch App, commit installation while dropping the
   callback entirely; repeat with a late callback after proof/session expiry, delay the installation
   lifecycle webhook, and restart the inventory worker. Prove signed-webhook provisional observation
   plus bounded App-authenticated inventory discovery, one unattributed quarantine/global
   association fence, zero tenant inference, no tenant
   Integrations/History/search/notification/prototype visibility, and no token/webhook/outbound
   product work. Drive automatic containment and an authorized platform Human Owner action; prove
   source audit uses the platform authority namespace, platform actor/service principal, opaque
   observation generation, and nullable tenant. Supply a guessed tenant and use tenant-only
   authority to prove denial before query or mutation. Under tenant-only, wrong-platform, and
   unauthorized principals, request an existing opaque platform-quarantine ref and a random
   well-formed ref; prove identical hard-403 status/code/body-size/header/cache/timing distributions
   before source fan-out with no existence or scope metadata. Attach a later exact pending
   generation by CAS and prove tenant projection/audit begins only after that attachment. Then
   abandon and expire an admitted setup; separately demote the actor, lose the session, fail
   association, select a pre-existing/adopted installation, remove uninstall authority, lose the
   uninstall response, require Human Owner action, restart the worker, and race callback/saga
   finalizers. Prove one cleanup lineage, CAS-only exact late-callback attachment, no auto-uninstall
   without exact authority, no orphan or false local success, and a fresh setup only after provider
   and credential cleanup terminalize.
8. Start disconnect while unclaimed and claimed pre-fence Mirror Outbox Intents exist. Inject
   provider response loss, `revocation_required`, repeated same/different-key requests, browser
   refresh, stale finalizer, and reconnect attempts. Prove one saga/generation, outbound
   fence/drain, no blind retry/local-delete success, reconnect disabled, then a fresh generation
   only after provider proof plus local cleanup terminalize the first.
9. Seed truthful integration-history rows from every allowed source, including equal timestamps,
   identical content from different owners, tenant-scoped and authorized platform-scoped rows,
   authorized same-scope correlation, and an append-only correction. Prove the platform row is
   authored once with platform namespace/opaque ref/nullable tenant, remains labelled platform scope
   in each admitted viewing-tenant query, and is never copied into source truth or relabelled as
   tenant activity. Capture a first page, insert a new event, make one source unavailable/change
   within its boundary, and continue the signed cursor. Assert the exact composite-key sequence and
   total order with each expected scope-aware row once, correlated rows still separate, the new
   event absent until refresh, partial/unstable rather than skipped completeness, and cursor denial
   after authorization/source-set change. Prove no Card comments/worklogs, PR/check activity, raw
   provider payloads, or audit duplication. Prove each semantic context appended its own audit row
   and Security & Audit only queried/indexed/exported those identities without writing synthetic
   truth.
10. Before gate C2, prove no provisional legacy fence/cohort may be persisted or executed from this
    memo. Under the approved C2 migration contract, persist a legacy device-flow fence with
    enumerable flows and a fixture worker generation whose earlier restart lost in-memory flows.
    Prove new starts/polls/writes are rejected, enumerable flows are individually classified, the
    unknown-loss cohort cannot terminalize before the maximum code TTL plus skew and zero-consumer
    proof, and durable tokens/handles/outbox rows remain individually classified.
11. Exercise `/connections/github`, `/connections/add`, recognized/unknown legacy state, and
    `/connections/system#system-group-channels` under the approved compatibility fixture. Prove no
    route chain/loop, no unsafe parameter forwarding, target reauthorization, and integration-kind
    aware Add behavior. Assert temporary 307 plus exact no-store headers, cache-enabled browser
    back/forward, service-worker/CDN non-retention, rejection of non-GET methods, absence of
    301/308, and a rollback-flag change that makes the next request reach the server and restore the
    admitted read-only legacy view.
12. Under the approved C2 contract, enter unique sentinels for every secret/transient class and
    inspect the exact allowlisted GitHub navigation, registered callbacks, and live bounded token
    exchange, then canonical platform App configuration, protected proof/quarantine rows, database
    rows allowed to the tenant, every other browser/server request, fixed Opzava post-303
    URL/history entry, HTML/React payloads, application-controlled storage, every cookie,
    logs/traces/metrics, Security & Audit, notifications/Slack stubs, exports, screenshots,
    evidence, and debug bundles. Prove only the defined transient protocol values appear in their
    exact requests/origins and Opzava does not re-emit them afterward. Prove only the unchanged
    pre-existing opaque session cookie accompanies callbacks and that it neither carries nor derives
    transient values; persistent tenant-queryable/ browser state contains only the opaque public App
    configuration/rotation version. Prove canonical platform configuration alone retains the public
    slug/client ID and fixed endpoints, while protected proof retains only admitted hashes,
    encrypted single-use verifier handle, independently corroborated immutable IDs, safe
    observations/expiries/fingerprints, and encrypted cleanup handles. Prove a tenant cannot query
    or infer the platform quarantine and that the quarantine contains only corroborated IDs, safe
    receipt/checkpoint refs, and its generation—no raw webhook or inferred tenant. Verify terminal
    CAS zeroization. Attempt to substitute each GitHub identity/proof/credential class at Runner
    enrollment/control seams and prove pre-dispatch rejection with no Runner record, epoch,
    capability, command, receipt, containment, or execution-admission effect.
13. Render and operate the detail/history flows in light and dark mode, keyboard-only and screen
    reader, with reduced motion, at 320, 390, 768, 1024, and 1440 CSS pixels. Prove the vertical
    reading order, focus behavior, text/glyph state labels, touch targets, and no horizontal
    overflow.

Use unique provider test records, clean them through governed teardown, and retain only safe
provider IDs/results as evidence. A fake provider `2xx`, fixture-only screenshot, unit mock, or docs
grep cannot satisfy this gate.

## Objective acceptance criteria

The resolution is implementation-ready only when its descendant issues require all of the following:

Any criterion that exercises an exchange-attempt/verifier, provider-observed quarantine/unbound
cleanup, or legacy-flow fence/cohort applies only after gate C2 approves and designates its owning
source contract. Before C2, criteria 4 and 22 require those records, commands, migrations,
projections, fixtures, and provider paths that exercise them to be absent.

1. Configure has exactly one Integrations sidebar destination; GitHub detail/history remain
   page-local and preserve the locked two-level hierarchy.
2. Final synthesis explicitly ratifies or replaces the recommended three semantic IDs and routes;
   this memo is not treated as overriding WF-242's URL deferral.
3. Detail renders the six fixed sections in order and contains links, not copies, for Dev Board
   work/development facts, Health evidence, and the Security & Audit federated source-record query.
4. Authority tests prove PRD-020 owns placement/admission only, PRD-013 owns secure interface
   semantics, `DevBoard.GitHubIntegration` owns tenant integration records/health/sync/disconnect,
   platform provisioning/security owns canonical public App config/secrets plus its audit records,
   each semantic context owns its append-only audit truth, and Security & Audit owns only federated
   query/index/export composition. They prove the provisional exchange-attempt/fence,
   quarantine/unbound-cleanup records and commands, and legacy-flow fence/cohort are absent from
   current WF-231 authority and remain unavailable until gate C2's owning amendment is approved and
   designated; no Admin contract, migration, or fixture can create them. They also prove that no
   GitHub identity, callback proof, credential, or health result can satisfy or mutate WF-232 Runner
   enrollment, capability, command, receipt, containment, or execution-admission authority. Before
   gate D, no mutation or migration slice may implement a substitute audit payload or omit the
   source append; after D, every semantic owner uses the one accepted PRD-013/#192 shape, appends
   `requested` with the durable sender fence before provider I/O, and later appends
   `completed`/`failed` or a non-terminal `outcome_unknown` followed by a reconciled terminal event.
   Append failure prevents provider I/O or false local terminalization and never triggers provider
   replay. Security & Audit remains read-only federation.
5. The five page projections carry owner provenance, source version/checkpoint, source/observation
   clocks, freshness, LKG, and safe authorized owner links without becoming durable truth.
6. Lifecycle, WF-231 health, freshness/LKG, and derived attention remain separately queryable and
   visibly distinct. Not configured is not unhealthy.
7. Healthy is impossible without every required current dimension and complete successful
   reconciliation. Unknown/stale/unavailable/LKG cannot satisfy it.
8. Unhealthy/unverifiable GitHub trust and secret exposure remain Absolute Stops, never Needs Human
   Approval. Recovery grants ordinary retry only.
9. Browser actions delegate only the typed owner commands, reauthorize, verify Origin/CSRF, bind
   request hash to idempotency, reload target/version, and apply target-bound step-up/confirmation.
   Final binding revalidates a fresh proof bound to the same pending generation and current exact
   target/version; an expired post-navigation proof pauses without binding or repeating a provider
   operation and resumes only through a fresh stepped-up Opzava POST before fixed proof expiry;
   abandonment/expiry/inadmissibility starts the unbound installation cleanup saga.
10. The two fixed callback handlers use different one-time signed states; the authorization handler
    also requires PKCE with fixed `code_challenge_method=S256`; `plain` is forbidden. Only the exact
    defined public/transient values appear on the allowlisted GitHub navigation, registered callback
    requests, and sole fenced server-to-server token exchange. The server exchange uses only the
    fixed endpoint and once-released encrypted verifier; both handlers use no-store/no-referrer,
    safe redaction, and fixed same-origin 303 to `?focus=setup`.
11. Installation ID remains untrusted until same-user association and independent App-authenticated
    exact installation/repository proof both pass immediately before a one-repository binding.
12. Setup replay, back/refresh, expiry, multi-tab contention, tenant switch, demotion, revoked
    membership, and session expiry create no duplicate/partial binding. Safe read loss, installation
    callback loss, authorization-exchange unknown, credential-cleanup loss, disconnect unknown, and
    mirror-mutation unknown each follow their separate proof/retry contract. Authorization exchange
    sends only after committed `prepared` and `sending` fences; crash-before-commit,
    provably-unsent, possibly-sent, restart, stale-finalizer, and late-response cases follow their
    exact durable outcomes without storing or replaying the raw code. The encrypted generation-bound
    verifier survives pre-callback restart, releases once only after sender-claim commit, and is
    compare-and-set zeroed on success, cancellation, expiry, or unknown outcome.
13. Direct denied routes and records return hard 403 before fan-out, tenant RLS denies cross-tenant
    access, and foreign-existing/random-ID anti-enumeration is objectively indistinguishable under
    the WF-247 test class. Existing versus random opaque platform-quarantine refs are likewise
    indistinguishable for tenant-only, wrong-platform, and unauthorized principals across
    status/code/body-size/header/cache/timing distributions before source fan-out.
14. Outside the exact transient allowlisted navigation/callback requests and bounded server token
    exchange, tenant/browser outputs expose only the opaque public App configuration/rotation
    version and none of the prohibited identifiers, handles, fingerprints, values, raw bodies,
    errors, or DTOs. Opzava re-emits no transient value into its fixed post-303 URL/history entry,
    rendered/application state, storage, cookie, or telemetry. Only the unchanged pre-existing
    opaque session cookie may accompany a callback, and it carries or derives no transient value.
    The contract does not claim to erase a prior provider/callback URL retained by the user agent.
    Canonical platform-owned public App identifiers/endpoints and protected server-only WF-231
    association/cleanup proof remain permitted only in their dedicated roles. The approved
    verifier/exchange records join that protected exception only after gate C2. All remain
    non-queryable by tenants.
15. `/connections/github` maps directly to the GitHub detail and `/connections/add` maps to the
    integration-kind-aware `intent=add` catalog only after real parity. Unsafe legacy state is never
    forwarded.
16. Bare `/connections`, `/connections/system`, and `/connections/providers` are unchanged by this
    ticket; the live channels fragment is handed to final synthesis without inventing a native
    route.
17. Compatibility redirects are one hop, target-authorized, closed-enum mapped, telemetry-backed,
    temporary 307 responses with exact no-store headers, and free of chains/loops. No 301/308,
    service-worker/CDN/browser cache, or stale target survives a rollback-flag change.
18. A durable legacy device-flow generation/fence stops new starts, polls, completion writes, and
    consumers before cutover; every still-enumerable flow/code is individually classified and never
    translated into an App binding.
19. A bounded aggregate unknown-loss cohort covers only irretrievably lost pre-fence in-memory flows
    and terminalizes only after zero reachable consumer plus maximum code TTL and skew. Every
    durable OAuth/PAT/environment handle, consumer, legacy Issue projection/create intent/close
    outbox row, and callback/write path retains an individual terminal migration disposition.
20. Bounded dual-read comparison has exactly one App-backed write authority. Rollback can restore
    legacy reads only and freezes unsafe writes rather than restoring OAuth/PAT/env writers.
21. Cleanup handles persist across ambiguous responses; no `202 Accepted`, local deletion, absent UI
    row, or uncorroborated `404` is called revoked/cleaned. An indeterminate authorization-code
    exchange creates one immutable-association-wide fenced `exchange_outcome_unknown` across all
    actors/tenants, with no binding/new same-association setup, and no blind
    replay/introspection/code-expiry inference. A durable `prepared` record commits before a sender
    claim, and a committed `sending` claim commits before provider I/O. Recovery cancels only
    provably unsent work; all possibly sent work, stale finalizers, and late responses remain
    fenced, with late credentials admitted only to protected cleanup and the verifier zeroed. It
    returns to `not_configured` only after exact non-issuance/revocation, local credential cleanup,
    and any applicable unbound-installation cleanup proof; otherwise it remains stopped or
    `revocation_required`.
22. Before gate C2 approval, no provisional exchange-attempt/verifier, quarantine/unbound-cleanup
    record, legacy-flow fence/cohort, command, audit path, migration, projection, fixture, or
    provider path that exercises them is admitted. After the owning source amendment is approved and
    designated, every provider installation existing for the configured App is discoverable through
    the lifecycle-webhook path or the bounded App-authenticated inventory reconciliation, including
    callback-missing, late, session-expired, and unattributed installations. Every unbound discovery
    enters one globally unique quarantine/cleanup lineage per corroborated association observation
    generation. Signed lifecycle webhooks remain provisional until App-authenticated corroboration;
    no tenant is inferred. Tenant Integrations, History, search, notifications, and prototype
    fixtures remain blind until an exact pending generation and tenant attach by compare-and-set.
    Before attachment, only the platform-scoped source remediation/attention command and audit path
    may act, using the platform authority namespace, platform actor/service principal, opaque
    observation generation, and nullable tenant; a supplied or guessed tenant is rejected. The saga
    contains token minting, webhooks, and outbound work; auto-uninstalls only with exact authority;
    retains provider-outcome unknown or `revocation_required`; and permits fresh setup only after
    terminal provider/credential/handle proof. All of that behavior remains behind the controlled
    test boundary until gate C3 promotes the exact proven implementation version.
23. Disconnect admits one saga per binding generation across idempotency keys, fences and drains all
    pre-fence intents, reconciles ambiguous outcomes, blocks reconnect, and creates a fresh
    generation only after terminal provider proof and local cleanup.
24. Integration History uses scope-aware composite row identity, exact-key dedupe, the defined total
    order, first-page authorization/read snapshot, per-source high-watermarks,
    principal/viewing-tenant/admitted-scope-bound signed cursors, correction-as-new-row, and
    explicit partial/unstable pagination. Tenant rows require tenant scope; platform rows retain
    nullable tenant, platform namespace, and opaque platform target without per-tenant source
    duplication or manufactured attribution. It neither duplicates Card/Development activity nor
    becomes a new ledger.
25. After gates C2 and D are approved and Slice 3 is integrated, the exact candidate's authenticated
    local-Docker E2E passes all setup, navigation/callback/server-token exceptions, PKCE `S256`
    verifier lifecycle, post-navigation step-up expiry/resume, durable exchange
    crash/restart/late-response, association-wide fencing, unbound cleanup, authorization, RLS,
    idempotency, operation-specific response loss, History/audit composition, compatibility caches,
    legacy-flow fence/cohort, health, drift, disconnect, migration, accessibility, cookie, and
    no-secret scenarios listed above against the real scratch App repository. Gate C3 then promotes
    only that exact version; production provider navigation, callback finalization, binding,
    Connected result, and migration remain unavailable before promotion.
26. Light/dark, keyboard, screen-reader, reduced-motion, and 320-pixel behavior pass with no
    horizontal overflow, color-only meaning, reordered reading flow, inaccessible status, or dead
    action.

## Approval and promotion gates

| Gate                            | Required approval/evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | What it cannot authorize                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final Admin route synthesis     | Ratify semantic IDs, production URLs, callbacks, owner capabilities, compatibility register, route order, and channel-fragment handoff while consuming all sibling audits                                                                                                                                                                                                                                                                                                                                                        | Leaf semantics, GitHub synchronization/workflow, secret access, or a bypass                                                                                                                                                                                      |
| GitHub detail/history prototype | Human acceptance of the exact vertical reading flow and all state fixtures in the approved Admin shell, followed by accessibility/responsive review                                                                                                                                                                                                                                                                                                                                                                              | Fixture facts as product truth, route cutover, or a hidden command                                                                                                                                                                                               |
| Implementation-issue Ready gate | Bounded scope, dependencies, sad paths, behavioral contracts, exact secrets=`none`/named server refs, human inputs, approvals, migration/rollback, and real E2E acceptance                                                                                                                                                                                                                                                                                                                                                       | Moving an incomplete ticket to Todo                                                                                                                                                                                                                              |
| Dev Board source extension      | Gate C2: an owning PRD-019/ADR-017/WF-231-successor amendment approves the exact exchange-attempt/sender-fence/verifier records, callback-independent observation/quarantine/cleanup records, legacy-flow fence/cohort, commands, capabilities, audit identities, ports, migration contracts, and required proof plan; the active Dev Board map designates it for the named implementation consumer                                                                                                                              | Production enablement, any authority from #245/#241/#246/#248, PRD-013, route synthesis, prototype acceptance, an Admin implementation, or migration                                                                                                             |
| Dev Board source promotion      | Gate C3: after C2-authorized non-routable implementation, the real scratch-App/provider, HTTP/Postgres, restart/race, no-secret, audit, and authenticated local-Docker proofs pass against the exact approved source contract; the owning Dev Board promotion authority records the accepted implementation/version                                                                                                                                                                                                              | Changing C2's contract, authorizing a different record/command, bypassing gate D, enabling an unproved production setup/provider path, or treating fixtures/docs as behavior                                                                                     |
| Governance Audit owner contract | PRD-013 and #192 explicitly accept either structurally defined, provably secret-safe old/new summaries or immutable configuration-version refs; every mutation owner has append ports for `requested` before provider I/O, non-terminal `outcome_unknown`, and later `completed`/`failed` source events using that exact shape; #246 sequences the dependency before GitHub command migration                                                                                                                                    | An ad hoc config diff, silent ref substitution, omitted lifecycle event, audit failure followed by unrecorded provider I/O/false terminalization, Security & Audit source write, or implementation of a mutation/migration slice before the owner contract lands |
| Setup / repair command          | Current owner capability, exact target/version, fresh target-bound step-up, and separate confirmation/approval only where owner policy requires                                                                                                                                                                                                                                                                                                                                                                                  | Trusting callback/browser state, creating a second repository, or bypassing health                                                                                                                                                                               |
| Unbound installation cleanup    | After Dev Board source-extension gate C2, App-authenticated association-observation generation plus an optional exactly correlated pending generation, current uninstall authority or secure App Human Owner action, durable sender fence, terminal provider/credential/handle evidence, and source-owned scope-correct audit result; unattributed work additionally requires platform namespace/actor/opaque generation and nullable tenant                                                                                     | Inferring/supplying a tenant for an unattributed installation, using tenant-only authority, auto-uninstalling an adopted installation, treating ambiguity/local deletion as success, or bypassing the association fence                                          |
| Disconnect command              | Current disconnect authority, exact binding generation, request-hash idempotency, fresh target-bound step-up, destructive confirmation, and policy approval if required                                                                                                                                                                                                                                                                                                                                                          | Local deletion as success, blind provider retry, second saga, or early reconnect                                                                                                                                                                                 |
| GitHub App cutover              | Gates C2 and C3 source-contract approval and implementation promotion, complete inventory/classification, enforced legacy device-flow fence, terminal enumerable flows and bounded unknown-loss cohort, secure callbacks/token egress/verifier proof, verified lifecycle-webhook plus App-inventory discovery, zero unresolved quarantine/unbound cleanup, one-repository binding, reconciliation, one writer, dual-read parity, no-secret/RLS and rollback evidence, gate D audit lifecycle proof, and migration-owner approval | Legacy dual-write, device-flow translation, unattributed/unresolved cleanup, unexpired unknown cohort, healthy-from-unknown, or promotion of an unproved implementation                                                                                          |
| Legacy redirect/removal         | Target real-stack parity, exact state map, temporary-307/no-store/cache/rollback and one-hop/loop tests, target authorization, route telemetry, approved compatibility window, rollback proof, zero unclassified consumers/rows, and terminal legacy fence/cohort evidence                                                                                                                                                                                                                                                       | Publishing 301/308 during the rollback window or removing active capability because a placeholder/prototype exists                                                                                                                                               |
| Absolute Stop recovery          | Exact WF-231 current health dimensions, no unresolved ambiguity/conflict, complete reconciliation, drained/contained queue work, current policy/version, and source command                                                                                                                                                                                                                                                                                                                                                      | Needs Human Approval substitution or any Ready/claim/Review/merge/lane/Release/Done transition                                                                                                                                                                   |

Security exposure and unhealthy/unverifiable GitHub trust are unbypassable. No Human Owner, Admin,
GitHub Action, assistant, agent, approval, callback, or route policy may override them.

## Resolved decisions

The placement and safety decisions below are target requirements, not source-record authority. Every
part that names an exchange-attempt/verifier, provider-observed quarantine/unbound cleanup, or
legacy-flow fence/cohort remains conditional on gate C2's approved and designated owning source
contract.

1. GitHub setup, repair, disconnect command entry, dimensional health detail, and bounded
   integration history are page-local views under Configure → Integrations.
2. The recommended route family is `/integrations`, `/integrations/github`, and
   `/integrations/github/history`, subject to final synthesis ratification.
3. PRD-020 owns placement/admission only; PRD-013 retains secure interface semantics;
   `DevBoard.GitHubIntegration` and platform provisioning/security retain their respective product
   records and append-only audit truth; Security & Audit only federates/indexes/exports those audit
   identities.
4. History is a deterministic snapshot/cursor-based federated read projection with composite row
   identity, exact-key dedupe, stable total order, and explicit partial/unstable behavior. It cannot
   become an integration ledger or duplicate Card, Development, Health, or audit activity.
5. Installation and user-authorization callbacks are distinct fixed GET handlers with distinct
   state, PKCE `S256` on authorization, encrypted single-use verifier lifecycle, one fenced exact
   server token exchange, fixed safe return, and current actor/session/tenant authorization.
6. Lifecycle, health, freshness/LKG, and human attention are separate axes. Not configured is not an
   outage, and unknown exchange/saga states are not health labels or approval bypasses.
7. A durable legacy device-flow fence individually classifies enumerable flows and bounds an
   irretrievably lost pre-fence cohort by zero-consumer plus maximum-TTL evidence. OAuth/PAT/
   environment-token writers retire in favor of one GitHub App path; there is no translation or
   dual-write bridge.
8. `/connections/github` and `/connections/add` have direct, different target intents; the latter
   remains integration-kind aware. Withdrawable redirects are temporary 307/no-store and never
   301/308 during rollback; other Connections routes remain outside this ticket.
9. Response loss is operation-specific: safe reads may retry, installation callback state remains
   local, callback-missing installations are independently discovered and globally quarantined,
   authorization exchange unknown fences the immutable association across actors/tenants until exact
   terminal proof, unbound installation uses its cleanup saga, credential cleanup needs exact proof,
   disconnect uses its saga, and mirror mutations remain WF-231-owned unknown outcomes.
10. Authorization exchange uses committed `prepared` and `sending` fences before provider I/O;
    provably unsent attempts cancel safely, while every possibly sent attempt, restart, late
    response, or stale finalizer stays association/generation-fenced and never yields a binding by
    inference. The verifier releases once after sender-claim commit and is zeroed on every terminal
    or unknown path.
11. Final binding requires a still-fresh exact-target step-up bound to the same pending generation;
    expiry/abandonment moves an existing provider installation into one contained unbound cleanup
    saga only after gate C2 approves the owning source extension. Under that approved contract,
    callback-independent lifecycle-webhook/App-inventory observation creates a tenant-neutral
    quarantine and the same unique cleanup lineage when no pending generation can be attributed. It
    remains invisible to tenant routes and uses only the distinct platform-scoped remediation and
    audit path until exact CAS attribution. The provisional names in this memo confer no authority.
    Transient protocol values never enter any cookie, including the unchanged opaque session cookie.
12. Canonical public App slug/client ID and fixed endpoints remain in platform-owned configuration;
    request copies exist only at their exact browser/provider seams and never become tenant state.
13. WF-231's full one-saga-per-binding-generation disconnect contract is mandatory on the Admin UI
    and migration path.
14. Real authenticated local-Docker/provider behavior, not docs or fixtures, is the acceptance seam.

## Rejected alternatives

- Rename the current monolithic `/connections` page to Integrations.
- Add GitHub detail or History as a third sidebar level.
- Let PRD-020, the page, or History own GitHub health/synchronization/audit records.
- Let Security & Audit append semantic-owner command/configuration audit truth, rewrite source rows,
  or combine them into a synthetic universal event.
- Project a truly unattributed provider quarantine into a tenant route, History, notification,
  search result, prototype fixture, or cache, or invent a tenant to satisfy an audit schema.
- Put Card comments/worklogs, PR/check/review/merge activity, or raw provider payloads in
  integration History.
- Use one callback/state for both App installation and GitHub user authorization.
- Use PKCE `plain`, send an authorization code before a durable sender fence, or treat a possibly
  sent exchange as safely retryable/unsent after restart.
- Retain only a PKCE hash with no restart-safe verifier, expose the verifier, or forbid the exact
  fenced server token request required to complete authorization.
- Put transient provider/setup values in a cookie, or repeat a provider operation merely because the
  final-binding step-up expired.
- Scope an unknown association fence to one actor/tenant, silently abandon an installed-but-unbound
  App, auto-uninstall a pre-existing installation without authority, or call local deletion success.
- Publish a cacheable/permanent 301/308 legacy redirect while rollback remains allowed.
- Trust `installation_id`, a signed webhook, provider display name, or browser session alone as the
  tenant binding proof.
- Accept an arbitrary browser return URL or forward callback/legacy provider parameters through a
  redirect.
- Treat not configured, disconnecting, provider outcome unknown, or revocation required as WF-231
  health labels.
- Turn unhealthy/unverifiable or secret exposure into Needs Human Approval.
- Keep OAuth/PAT for humans while the App serves workers, translate device flows into App bindings,
  or use temporary dual-write.
- Declare provider revocation from `202 Accepted`, a lost response, local deletion, an absent UI
  row, or an uncorroborated `404`.
- Restore a legacy writer on rollback or reconnect before terminal disconnect.
- Redirect legacy routes before target command, denial, state, accessibility, and real-provider
  parity.

## Downstream constraints

### Final Admin route and ownership synthesis

The [final route and ownership synthesis](https://github.com/anthonykewl20/opzava/issues/246) must:

- ratify or deliberately replace the recommended semantic IDs/routes and two fixed callback paths;
- keep only Integrations in the sidebar and nested views page-local;
- map already-approved owner capability names without collapsing read/manage/disconnect/audit scopes
  or inventing gate C2 source capabilities;
- consume the `/connections/system#system-group-channels` handoff with sibling AI Runtime/Operate
  audits;
- publish the complete one-hop redirect/state register and route ordering;
- preserve the four axes, source-owned audit split, callback proof, bounded server token exchange,
  encrypted verifier lifecycle, association-wide fence, unbound cleanup, secret boundary, disconnect
  generation, deterministic History, operation-specific unknown outcomes, temporary redirect/cache
  contract, legacy-flow fence/cohort, migration/rollback, and real-seam contracts; and
- preserve the unresolved Dev Board source-extension dependency for the exchange-attempt/verifier,
  provider-observed quarantine/unbound cleanup, and legacy-flow fence/cohort. Final Admin synthesis
  may place or link an approved source projection, but it cannot approve, define, implement, or
  migrate the provisional source records or commands.

### Admin leaf-page prototype

The [Admin leaf-page prototype](https://github.com/anthonykewl20/opzava/issues/248) must include:

- the exact six-section GitHub detail reading flow and separate History view;
- fixtures for not configured, setup pending, awaiting final step-up, exchange outcome unknown,
  CAS-attributed provider-observed quarantine, unbound cleanup pending/unknown/revocation
  required/cleaned, reconciling, healthy, degraded, unhealthy, unverifiable, stale/LKG, unavailable,
  disconnecting, provider outcome unknown, hard-403, partial history, callback consumed/expired, and
  no-match where applicable; a truly unattributed platform quarantine is deliberately absent from
  this tenant leaf prototype;
- every exchange-unknown, quarantine/unbound-cleanup, and legacy-flow fence/cohort fixture only
  after gate C2's owning Dev Board amendment approves its source semantics; before that approval,
  #248 may show the placement as blocked but must not manufacture fixture truth;
- light/dark and 320/390/768/1024/1440 layouts, keyboard/focus behavior, semantic state labels, and
  no dead actions;
- links rather than duplicated Dev Board/Health/Security & Audit content;
- no universal visual winner or route authority beyond the approved prototype question.

### Implementation issue graph

The later implementation graph must slice vertical real seams rather than “build page” layers:

1. Route registry/admission + C1-backed Integrations inventory/detail projections + hard-403/RLS/
   no-secret browser seam, with all C2-only states absent until their approved source projection is
   integrated.
2. C1 pending-association/binding adapters plus C2-approved callback handlers, durable
   authorization-code exchange attempt, encrypted single-use verifier, fenced exact server token
   egress, same-user/App corroboration, cross-principal association fence, dormant one-repository
   binding transaction, and callback/browser security seam. This remains non-routable until Slice 3,
   not production setup activation.
3. Callback-independent lifecycle-webhook/App-inventory discovery plus provider-observed quarantine
   and unbound installation cleanup from missing/late callback or pending expiry/abandonment through
   token/webhook/outbound containment, provider uninstall/unknown/Human Owner path, handle cleanup,
   quarantine-aware final binding and production setup activation, fresh setup, CAS-attributed
   tenant projection, and the distinct platform-scoped remediation/attention/command/audit path with
   nullable tenant only for proven platform scope.
4. Dimensional health/freshness/attention + recheck/repair owner commands + Absolute Stop recovery
   seam.
5. C1-backed federated History + source-owned audit truth + composite identity/ordering + authorized
   read snapshot/signed cursor + partial/unstable source behavior + owner deep links; C2 row
   families are a separately gated completion within this slice.
6. GitHub Disconnect Saga UI from command through fence/drain/provider/local terminal proof and new
   generation.
7. C2-approved legacy device-flow fence/unknown-loss cohort + OAuth/PAT/env/outbox inventory + App
   cutover + bounded dual-read + one writer + rollback-read + temporary-307/no-store/cache-safe
   redirects + telemetry + removal.

The issue graph has this mandatory dependency DAG; ticket authors may refine scope but cannot weaken
an edge:

- **External gate A:** #246 must close after ratifying the semantic route IDs, callback paths, Admin
  capability/placement split, compatibility register, and links to already-approved source owners.
  It must carry gates C2, C3, and D without ratifying the provisional source records, treating test
  evidence as source authority, or choosing an audit payload contract by implication. No production
  route, callback, or compatibility implementation starts from this memo's recommendations alone.
- **External gate B:** #248 must record Human Owner acceptance for the GitHub leaf/history states
  and responsive/accessibility behavior before the visible UI portions of slices 1, 4, 5, or 6 can
  be called complete. Server contracts may proceed after gate A without treating prototype fixtures
  as truth.
- **External gate C — Dev Board source authority and promotion** has three ordered subgates. **C1**
  requires an approved implementation dependency on the applicable current WF-231 provider, binding,
  health, reconciliation, outbox, and disconnect ports. **C2** requires an owning
  PRD-019/ADR-017/WF-231-successor amendment to explicitly approve the durable authorization-code
  exchange attempt/sender fence/verifier lifecycle, callback-independent provider-observation
  quarantine, unbound-cleanup aggregate, legacy device-flow fence/unknown-loss cohort, typed
  commands, tenant/platform audit identities, migration dispositions, and source projections (using
  the provisional names here or approved equivalents). The active Dev Board map must designate that
  amendment for the applicable implementation/synthesis consumer. #245 closure, #241 designation,
  #246 synthesis, #248 fixture acceptance, or PRD-013 cannot confer C2 source authority. Admin
  slices use approved ports and never recreate them. C2 is design/source authority: it permits the
  exact approved implementation behind a non-production, non-routable test boundary, but it does not
  enable the production Admin/provider path. **C3** is the later implementation-promotion gate. It
  requires the exact C2-authorized version to pass the approved HTTP/Postgres, real scratch
  App/provider, crash/restart/race, no-secret, audit, and authenticated local-Docker evidence before
  the owning Dev Board promotion authority records that version as eligible for production routing.
  #245, #241, #246, #248, PRD-013, and Admin cannot confer C3; the owning Dev Board delivery map
  must name the promotion authority and exact version. C3 cannot amend C2, and test evidence cannot
  retroactively authorize the implementation that produced it.
- **External gate D — Governance Audit owner contract** requires PRD-013 and #192 to explicitly
  resolve `old/new safe summary` versus immutable configuration-version refs, approve one exact
  secret-safe payload shape, and expose the applicable semantic-owner append ports for `requested`
  before provider I/O, non-terminal `outcome_unknown`, and later `completed`/`failed` events. An
  audit-append failure must prevent provider I/O or, after a provider effect, prevent false local
  terminalization while retrying only the deterministic append/finalizer. #246 must sequence that
  accepted owner contract before command migration. Gate D does not transfer audit-write authority
  to Security & Audit and does not authorize gate C2 records.
- **Slice 1** depends on gate A for route/admission work and gate C1 for any WF-231-backed
  inventory/detail projection. Gate B is required for visible completion. C2-only states and actions
  remain absent until gate C2 plus slice 3 are complete, and no production setup path is enabled
  until C3 promotion.
- **Slice 2** depends on gates A, C1, C2, and D. Its C1 read/schema/adapter interfaces may be
  prepared earlier, but no command/mutation handler begins before D, no durable
  exchange-attempt/sender-fence implementation begins before C2, and the combined slice remains
  non-routable in production. Its exact C2-authorized candidate may be exercised only through the
  controlled test boundary needed for C3 evidence; production provider navigation, callback
  finalization, binding activation, and Connected results remain disabled until slice 3 integrates
  the rest of C2 and C3 promotes the exact version.
- **Slice 3** depends on gates C2 and D plus slice 2's association-proof schema, App-authenticated
  provider adapter, and global association fence. A callback-missing provider observation adopts
  that foundation without inventing a tenant or pending proof. Slice 3 adds the quarantine-aware
  finalizer. It completes the testable source candidate but may enable the production Admin setup
  path only after C3 promotes that exact version. It cannot start from this memo's provisional names
  alone.
- **Slice 4** depends on slices 2 and 3 plus gate D so health/repair cannot omit unknown exchange,
  quarantine, unbound cleanup, revocation, or its required source-owned audit append.
- **Slice 5** depends on slice 1, gate C1, and the rebuildable Security & Audit federation for its
  base read-only WF-231 and already-authorized audit row families. That bounded read-only base may
  proceed without gate D in parallel with slices 4 and 6; it must explicitly exclude any row family
  whose source write contract is unresolved. Gate D is required before wiring or relying on new
  GitHub mutation-audit lifecycles. C2 quarantine/unbound-cleanup rows remain absent and
  feature-gated; full target completion depends on gate C2, gate D for those source writes, slice
  3's approved source projections, and C3 for any production-generated row family.
- **Slice 6** depends on slices 1 and 2 plus gate C1's binding-generation/disconnect ports and gate
  D's accepted disconnect-audit append contract. Its visible completion also requires gate B; it may
  proceed in parallel with slices 4 and 5.
- **Slice 7** is the terminal cutover/removal slice. It is blocked by completed slices 1–6, gate B
  parity acceptance, gate C2's approved migration records, gate C3's exact implementation promotion,
  gate D's accepted migration-audit append contract, zero unresolved provider-observed
  quarantine/cleanup/disconnect outcome, current health/reconciliation, deterministic History, the
  full legacy inventory/fence/cohort, cache-safe redirect rollback proof, and migration-owner
  approval.

Every issue must declare dependencies; exact command/receipt/record identities; current Human Owner
inputs; secrets; approval/step-up/confirmation; sad paths; HTTP/Postgres/provider/browser behavioral
contracts; objective acceptance; authenticated local-Docker E2E; migration/rollback; provider test
resources and teardown; and the final Ready approval version/hash. Missing any field keeps it out of
Todo.

## Prepared resolution

The Wayfinder ticket may be resolved when the parent verifies this placement and authority split;
the recommended semantic IDs/routes without overstepping final synthesis; the six-section detail and
scope-aware deterministic federated History contract; distinct lifecycle/health/freshness/attention
axes; two distinct signed states plus PKCE `S256` encrypted verifier lifecycle, callback proof,
narrow navigation exception, and fenced server token exchange; canonical public App configuration;
callback-independent signed-webhook/App-inventory discovery subject to gate C2 design authority and
gate C3 implementation promotion, tenant-neutral quarantine, cross-principal association fencing,
CAS-gated tenant visibility, distinct platform-scoped unattributed remediation/audit, and unbound
installation cleanup; source-owned scope-correct requested/outcome-unknown/completed-or-failed audit
composition and append-failure containment; tenant and platform-ref hard-403 anti-enumeration, RLS,
step-up, and no-secret boundaries; operation-specific response-loss outcomes; parity-gated temporary
redirect/cache register; legacy device-flow fence/unknown-loss cohort; OAuth/PAT/env/outbox
migration and read-only rollback; complete WF-231 disconnect-generation carry; preserved WF-232
Runner trust separation; sad paths; real-seam contracts; approval gates; and authenticated
local-Docker acceptance; plus the explicit #246/#248/WF-231 implementation dependency DAG,
unresolved Dev Board source-extension gate, its separate post-implementation promotion gate, and
unresolved PRD-013/#192 Governance Audit owner-contract gate. The parent may record verified #245
closure before #241 designates this memo; designation is not a closure precondition. Verified
closure alone does not make this memo current, does not amend WF-231/PRD-019/ADR-017, and does not
authorize the provisional exchange-attempt/fence, quarantine/unbound-cleanup, or legacy-flow
fence/cohort records, commands, or migration. Before any consumer uses it, the active Admin Control
Center map must explicitly designate it current for the named final Admin synthesis and, only if the
map chooses, separately for the named leaf-page prototype. Each consumer's designation ends on that
consumer's recorded consumption or explicit removal without affecting another current consumer. The
memo freezes only after every designated consumer has consumed it or been removed.

Documentation formatting, link, authority, and terminology checks validate this artifact only. They
do not prove any product behavior described above.
