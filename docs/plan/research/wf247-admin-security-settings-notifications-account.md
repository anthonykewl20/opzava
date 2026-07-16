# WF-247 — Admin security, settings, notifications, and account placement

Status: **Resolved input for
[Admin Control Center Wayfinder #241](https://github.com/anthonykewl20/opzava/issues/241), through
its child
[Reconcile security, settings, notification, and account placement #247](https://github.com/anthonykewl20/opzava/issues/247).**

Authority note: this memo is current only if active map #241 explicitly designates it **current
input** through final synthesis #246, under `CLAUDE.md`'s general active-Wayfinder rule. The links
above identify the map and child; this status line, those links, and the research index do not
confer authority by themselves. After #246 consumes it, the memo becomes frozen planning evidence.
It does not authorize implementation by itself. #246 and the named canonical-document owners must
consume, accept, or amend its proposed placement, vocabulary, and boundaries before implementation
tickets treat them as authority.

Question: Where should Secrets, Security & Audit, Settings, notifications, account controls, and
top-bar actions live, and which source, disclosure, and safe-action boundaries must their Admin
composition preserve?

This memo resolves placement and ownership for Wayfinder child
[#247](https://github.com/anthonykewl20/opzava/issues/247). It is planning evidence for the final
route and implementation synthesis in #246. It does not claim that any target route, page, command,
projection, audit ledger, notification center, or account-security flow is implemented.

## Executive resolution

The locked PRD-020 hierarchy is correct and should not gain another sidebar destination:

- **Configure → Secrets** is the dedicated inventory and health surface for named secret references.
  It never reveals values. The consuming domain owns why a credential is needed and what it may do;
  Platform Ops/Runtime Control owns secure storage, resolution, rotation jobs, and health receipts;
  Identity & Access owns step-up prerequisites.
- **Configure → Security & Audit** is the governance surface for approvals, identity/access review,
  policy changes, secret/configuration denials, remediation evidence, and a federated query/export
  of immutable source-owned Opzava audit records. OpenClaw-native activity appears in a separately
  labeled local view as source evidence, never as the configuration-governance audit.
- **Configure → Settings** is a small federated settings surface for safe workspace defaults and
  platform alert-routing policy that do not have a clearer owner destination. Personal notification
  preferences remain in Profile & Account; Settings only links to the explicitly scoped Account
  default and This device appearance controls. Settings is also an owner-aware index to settings
  that live elsewhere. It must not expose a generic `updateSetting(key, value)` command or absorb
  Gateway, provider, integration, MCP, Runner, Environment, Secret, security, or release authority.
- The **top-bar health control** is readiness only and deep-links to **Operate → Health**. It never
  displays approval or unread counts.
- The adjacent **attention control** opens the authorized, actionable Attention Inbox. A full
  Notification Center is a top-bar utility surface, not another sidebar leaf. Informational unread
  delivery and actionable attention remain distinguishable even when one control opens both views.
- The direct **theme control** follows attention/notifications and precedes profile. It edits the
  same **This device** choice exposed by Profile & Account → Appearance; the account default remains
  a separately labeled Profile command.
- The **profile menu** shows signed-in identity and account/role context, links to a shared
  PRD-001-owned Profile & Account utility surface, exposes the current Appearance choice, and signs
  out. Password, MFA, passkey, session, and deletion commands do not run inside the menu.
- Slack is a configured delivery and Personal Assistant channel. It is not notification truth, audit
  truth, an account-security surface, or a route around the owning command's authorization,
  freshness, approval, and step-up checks.

Every surface is a browser-safe projection over its semantic owner. A visible row or action never
grants authority. Direct requests reauthorize, reload current source state, and fail closed.

## Evidence and authority order

This resolution applies the source precedence in the Admin foundation rather than inventing a new
Admin bounded context:

1. PRD-001 owns identity, profile, account security, session behavior, and user preferences
   ([PRD-001 lines 193–218](../../prd/PRD-001-auth-onboarding.md#L193-L218)).
2. PRD-012 owns Notifications/Admin-Observability, notification delivery, alert rules, operational
   audit projections, and redaction/retention
   ([PRD-012 lines 253–312](../../prd/PRD-012-admin-observability.md#L253-L312)).
3. PRD-013 owns connection/setup commands, secret-reference handling, configuration health, and
   settings touchpoints while PRD-020 distributes their placement
   ([PRD-013 lines 3–19](../../prd/PRD-013-connections-tools.md#L3-L19),
   [lines 338–360](../../prd/PRD-013-connections-tools.md#L338-L360)).
4. PRD-018 owns remediation approvals, destructive confirmation, admin-token execution, and reaper
   audit ([PRD-018 lines 157–205](../../prd/PRD-018-admin-remediation.md#L157-L205)).
5. PRD-020 and the Admin foundation ledger own only shell placement, route admission, readiness and
   attention composition, and cross-context presentation
   ([PRD-020 lines 235–286](../../prd/PRD-020-admin-control-center.md#L235-L286),
   [foundation decisions ACC-053–074](../admin-control-center-foundation-decisions.md#L123-L158)).
6. The as-built route audit is migration evidence. It explicitly rejects a Settings junk drawer,
   native Control-UI publication, and health/attention collapse
   ([WF-242 lines 283–332](wf242-admin-route-ownership-migration-audit.md#L283-L332)).

The relevant audit tickets are complementary:

- [#192](https://github.com/anthonykewl20/opzava/issues/192) owns the missing Opzava
  configuration-governance audit for Connections mutations.
- [#193](https://github.com/anthonykewl20/opzava/issues/193) owns the version bump of the
  **Mainframe** source fork at `mainframe/`, rebuilding/reverifying the deployed **Platform
  Gateway** built from Mainframe, and broker harnessing of OpenClaw upstream's native
  `audit.activity.list` runtime-activity ledger.

Neither may be represented as complete until its own implementation and verification lands.

Detailed lifecycle, ordering, proof, and migration rules in this memo are **downstream constraints**
derived from those owning PRDs/ADRs, not a transfer of their semantic authority to #247 or the Admin
shell. The owning context must expose or ratify the typed command/event contract; #246 and its
implementation tickets may not treat this memo as permission to invent a competing write model. If a
later owner contract conflicts, the owner contract must be amended explicitly and cited.

This memo deliberately does **not** choose the Health or Attention source inventory, criticality,
freshness budgets, roll-up algorithm, or Overview composition. PRD-020 and Wayfinder child #250 own
those decisions. It fixes only the security/settings placement and the boundary between actionable
Attention, durable notification delivery, and readiness so #246 cannot collapse them later.

## Proposed vocabulary for final synthesis

These terms are precise within this memo but are **proposals**, not additions to `CONTEXT.md`:

| Proposed term                  | Meaning                                                                                                                                                                        | Not this                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Secret Reference Inventory** | Authorized browser-safe metadata and resolution health for named secret references and their consumers.                                                                        | A password manager UI or a secret-value browser.                                                                  |
| **Governance Audit**           | A federated query/export over append-only, source-owned Opzava actor/action records for identity, policy, configuration, approval, remediation, and secret-adjacent decisions. | A new universal audit write aggregate, OpenClaw runtime activity, Recent Activity, logs, or mutable work history. |
| **Runtime Activity**           | Source-native metadata-only agent/tool/message lifecycle evidence read from OpenClaw through the broker.                                                                       | Proof that an Opzava configuration command was authorized or completed.                                           |
| **Attention Inbox**            | An authorized composition of source-owned items that require this human to decide or act now.                                                                                  | All unread notifications, health state, or a new workflow.                                                        |
| **Notification Center**        | Opzava-owned delivery projection with read/dismiss state and safe deep links to source-owned detail.                                                                           | The source workflow, an audit ledger, or Slack history.                                                           |
| **Profile & Account surface**  | PRD-001-owned utility surface for the signed-in human's profile, personal preferences, credentials, authenticators, and sessions.                                              | Workspace/platform Settings or Security & Audit governance.                                                       |
| **Owner setting descriptor**   | Browser-safe metadata saying which owner controls a setting, its scope, current safe summary, readiness, and destination.                                                      | A generic key/value setting or duplicated owner state.                                                            |

Final synthesis may rename these, but it must preserve the distinctions.

## Placement and local-view contract

Production URLs remain for #246 to select. This memo fixes destination identity and local
composition, not path strings.

The locked top-bar order is: sidebar trigger; global search/command entry; readiness Health;
adjacent Attention/notifications; direct Theme; Profile. Viewport adaptation may compact controls
without changing their semantic order, ownership, or accessible identity.

| Placement                                 | Required local views / contents                                                                                                                                                                                | Source owner                                                                                                                                                                     | Mutations permitted here                                                                                                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configure → **Secrets**                   | Reference inventory; scope and consumer; storage class; resolution health; rotation/expiry state; last verified time; version-safe history; blocked dependents; secure add/replace/rotate/revoke entry points. | Platform Ops/Runtime Control for vault/provisioning; each consumer owns purpose and required scope; Identity & Access owns step-up.                                              | Only server-mediated write-only ingress, rotation, revoke, or repair commands owned by the vault/provisioning seam. No reveal or copy-value command.                                                                              |
| Configure → **Security & Audit**          | Pending approvals; federated Governance Audit; Runtime Activity; Users & Roles; organization security policy; remediation/reaper/admin-job evidence; export controls.                                          | Identity & Access, Notifications/Admin-Observability, Approvals, Platform Ops; every audit producer retains its write authority; native runtime evidence remains OpenClaw-owned. | Owner commands only: Approve/Deny, role/security-policy/session actions, bounded export, remediation confirmation. Each reauthorizes and applies its own policy.                                                                  |
| Configure → **Settings**                  | Workspace defaults; platform alert-rule/default routing controls; an Appearance shortcut; safe owner setting descriptors and links.                                                                            | Identity & Access for workspace defaults; Notifications for platform alert rules/routing; every domain owner for linked settings. Personal preferences remain Profile-owned.     | Only settings whose owner deliberately exposes a typed command here. Domain configuration runs on its dedicated owner leaf, not through a generic Settings command.                                                               |
| Top bar → **Health**                      | Aggregate readiness label, evidence age, and a link/filter into Health.                                                                                                                                        | PRD-012 Health composition with contributing owner contracts.                                                                                                                    | Read/refresh/navigation only. Repair remains an owner command.                                                                                                                                                                    |
| Top bar → **Attention Inbox**             | Authorized actionable items, action count, source label, reason, age, and safe owner deep link. Optional secondary access to all notifications.                                                                | Notification/attention composition; item state remains source-owned.                                                                                                             | Refresh/navigation only; notification delivery controls live in Notification Center, and source action is launched only through its owner.                                                                                        |
| Top-bar utility → **Notification Center** | Actionable and informational notifications; unread/read/dismiss state; severity; delivery state; safe deep links; preference link.                                                                             | Notifications/Admin-Observability.                                                                                                                                               | Mark read, mark all read, dismiss where policy allows, or retry an eligible failed delivery through the Notifications owner. These never resolve the underlying source record.                                                    |
| Top bar → **Theme**                       | Current effective appearance plus Inherit account/Light/Dark/System device selector.                                                                                                                           | Shell-local current-device override, falling back to PRD-001's server-owned account default.                                                                                     | Call the same current-device preference command as Profile → Appearance → This device; never mutate the account default or create a second device store.                                                                          |
| Profile menu → **Profile & Account**      | Profile; personal notification preferences; Appearance; connected-tools doorway; Security & account.                                                                                                           | Identity & Access, with Notifications and Runtime Control as named contributors.                                                                                                 | Profile/preference commands and PRD-001 security commands on the full surface, never inline in the menu.                                                                                                                          |
| Profile menu → **Sign out**               | Current identity context and current-device logout.                                                                                                                                                            | Identity & Access.                                                                                                                                                               | End this session only; clear cookies and show signed-out confirmation only after the owner confirms the server session is revoked/absent. Ambiguous failure preserves signed-in state and follows the probe/retry contract below. |

No local view becomes a third sidebar level. Tabs, filters, drawers, and record details are local to
their admitted destination or utility route.

## Authority and disclosure matrix

| Fact or action                | Authoritative source                                                                     | Browser-safe projection                                                                                                                                                                                                                                                                                            | Never disclose or infer                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret existence and metadata | `SecretsVaultPort`/provisioning receipts plus consuming-owner registration.              | Opaque reference, label, purpose, scope, consumer, storage class, version label, rotation/expiry warning, resolution state, `observedAt`, `staleAfter`.                                                                                                                                                            | Value, fingerprint, raw provider object, local path, environment variable contents, setup token, old value, or ability to enumerate an unauthorized ref.                  |
| Secret resolution             | Vault at execution time.                                                                 | `healthy`, `unresolved`, `expired`, `unavailable`, or `unknown`, with last verified time and safe reason class.                                                                                                                                                                                                    | A green state derived only from reference existence; a value returned to prove it works.                                                                                  |
| Personal identity/profile     | Identity & Access.                                                                       | Name, verified email state, avatar metadata, locale/timezone, active account/org context.                                                                                                                                                                                                                          | Session token, password/TOTP/passkey material, recovery-code hashes, provider tokens, or other users' private device detail.                                              |
| Active sessions               | Identity & Access/AuthPort.                                                              | Safe device/browser label, approximate location, issued/last-active time, expiry, current-device marker, MFA assurance where policy allows.                                                                                                                                                                        | Session token/hash, exact IP where not required, credential internals, or a row for another user without explicit governance authority.                                   |
| Workspace security policy     | Identity & Access.                                                                       | Policy version, safe settings, non-compliance counts only when authorized, last change, actor ref, next required action.                                                                                                                                                                                           | Provider role strings as authority, restricted member existence, or current state from a stale form.                                                                      |
| Opzava approvals              | Approval owner and source command.                                                       | Type, requester, target safe label, risk, payload/version hash, expiry, state, source link.                                                                                                                                                                                                                        | Secret-bearing payload, approval button enabled against stale target, or runtime approval as substitute.                                                                  |
| Governance Audit              | Federated read/index over immutable audit records written by each Opzava semantic owner. | Source owner, event id/sequence, tenant, source time, actor/type and causal trigger, action, target safe ref, PRD-013's required old/new safe-summary fields until formally amended, decision fields, payload/version hash, command/correlation ref, result, permitted runtime/provisioning refs, retention class. | A page-owned or universal write aggregate, raw or ad hoc config diff, secret, prompt/tool output, mutable row, or missing event treated as proof an action did not occur. |
| Runtime Activity              | OpenClaw native ledger after #193, read through broker ACL.                              | Native event id/sequence, lifecycle timestamp, actor, action family, status, schema/redaction version, safe runtime correlation.                                                                                                                                                                                   | Configuration-governance event, long-term Opzava audit guarantee, raw Gateway DTO, or direct Control-UI link.                                                             |
| Notification                  | Notification record plus immutable source event/ref.                                     | Recipient-scoped severity, safe summary, source owner, source event/version, occurred/observed times, read/dismiss state, authorized deep link.                                                                                                                                                                    | Sensitive detail in Web Push/Slack, workflow state inferred from read state, or unauthorized source identity.                                                             |
| Health                        | Health owner plus admitted capability projections.                                       | Readiness, practical impact, provenance, source version/checkpoint, source time, observation time, freshness, last-known-good marker, owner route.                                                                                                                                                                 | Human-action count, absence of errors as healthy, stale/unavailable as live, or source-owned repair authority.                                                            |
| Settings                      | Each semantic owner.                                                                     | Typed descriptor, scope (`personal`, `device`, `workspace`, `platform`), safe current summary, validation state, version, destination.                                                                                                                                                                             | Generic raw config, hidden owner mutation, secret-backed field value, or one Admin settings blob.                                                                         |

Expected admission denial is handled before fan-out. A denied source is not queried and is not
represented as `empty`, `unknown`, `unavailable`, or `not configured`. A directly requested denied
leaf or record returns 403 without disclosing existence, identity, count, timestamp, last-known-good
state, or deep link. An unexpected downstream 403 is a security/contract failure.

### Sensitive-record anti-enumeration

PRD-020 already requires pre-fan-out denial, hard 403, no existence metadata, and tenant/user/
authorization-version/schema cache isolation. The response-size, header, and timing mechanics below
are a new #247 downstream acceptance decision that makes that disclosure rule testable; they are not
attributed to existing PRD-020 text. #246 must carry them into the Identity & Access/Security owner
ticket and owner contract rather than implementing them as shell-only behavior.

For Secret references, audit/runtime records, approvals, notifications, sessions, and account
security records, an authenticated request for an existing foreign-tenant opaque id and a request
for a well-formed random/nonexistent id use the same externally disclosed denial contract:

- the same PRD-020 hard-403 status, generic error code/body shape and response-size bucket;
- the same security/cache headers, including `Cache-Control: private, no-store`, no shared/CDN
  cache, and no cached authorization result reused across principal, tenant, membership, or
  `authorizationVersion`;
- no existence-dependent title, count, timestamp, owner label, retry hint, redirect, ETag,
  `Last-Modified`, deep link, or client-visible telemetry;
- the same bounded timing class at the application seam. Tests compare distributions under load
  rather than one exact duration and fail when the foreign-existing case is reliably distinguishable
  from the random-id case. Any padding/jitter is bounded and does not replace constant-work
  tenant/resource admission.

Server-only security telemetry may distinguish denial reasons for investigation only after redaction
and access control. It must not influence the response, browser cache, notification, or timing
branch visible to the requester.

## Secrets contract

### Inventory and consumer ownership

A secret reference is not self-describing authority. Every inventory row must identify:

- opaque reference identity and safe label;
- tenant/workspace scope and owner capability;
- purpose and consuming owner(s);
- storage class, such as approved server vault or local-runner keyring, without a filesystem path;
- declared capabilities/scopes, never the credential itself;
- version, created/rotated/expiry metadata, resolution health, and freshness;
- dependents that are blocked, degraded, or awaiting rotation, only where authorized;
- provenance and the audit refs for creation, replacement, rotation, revoke, or denial.

The consuming owner decides that a GitHub, provider, MCP, Runner, tunnel, or other credential is
required and constrains its scope. The vault/provisioning module stores and resolves it. The Secrets
page composes those facts; it does not invent a universal credential policy.

### Secret category and authority matrix

The inventory may compose multiple storage authorities, but never centralizes their plaintext:

| Secret category                                                                                        | Value authority                                                                                                                                                                        | Opzava projection / command boundary                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider, channel, OAuth refresh, webhook, Gateway, and MCP server credentials used by managed runtime | Approved secret/auth store of the deployed Platform Gateway runtime, reached only through provisioning/admin jobs; future dynamic deployments use the selected tenant Gateway's store. | Safe reference, declared scope/consumer, resolution receipt, rotation state, and owning setup command. Browser responses and the hot-path broker never receive the value; user-originated input exists only transiently before secure submission. |
| Opzava broker, provisioning, signing, encryption, and service-to-service material                      | Deployment-managed server vault/KMS or platform secret store.                                                                                                                          | Health and version metadata only for an authorized operator. These are not ordinary tenant-entered Secrets rows.                                                                                                                                  |
| Local Runner/harness credentials, including local agent-tool and Docker access                         | Enrolled machine's OS keyring or approved local secret store.                                                                                                                          | Opaque local reference plus signed enrollment/health receipt. The value does not transit Opzava merely for convenience.                                                                                                                           |
| Password, passkey, MFA, recovery, session, and provider-login material                                 | Identity & Access/AuthPort and its approved identity provider storage.                                                                                                                 | Profile & Account safe metadata and typed auth commands. Never copied into the Secrets inventory.                                                                                                                                                 |

### Secret command and risk matrix

Exact capability names remain for #246, but the operation families and proof burden are fixed:

| Operation                 | Minimum admission                                                         | Additional gates and terminal behavior                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List/read metadata        | Admitted Secrets leaf plus tenant/resource-scoped read authority.         | RLS/record admission, safe field projection, provenance/freshness. A denied reference is not enumerable.                                                                            |
| Create/import/replace     | Resource-scoped secret-mutate authority and fresh step-up.                | CSRF/origin protection, write-only ingress, scope/consumer validation, idempotency, secure storage receipt, bounded validation, append-only source audit. No value echo or prefill. |
| Validate/resolution check | Metadata read plus the consuming owner's diagnostic authority.            | Bounded use through the owner, rate limit, no returned value/fingerprint, classified result only.                                                                                   |
| Rotate                    | Secret-mutate authority and fresh step-up bound to the exact ref/version. | Versioned saga, consumer/dependency checks, idempotent retry, approval when owner policy marks service impact/high scope, old version retained until verified cutover.              |
| Disable/revoke            | Secret-mutate authority and fresh step-up.                                | Reload dependencies; require owner approval/typed confirmation when service- or tenant-impacting; reject stale/in-use requests unless the explicit containment path applies.        |
| Delete reference metadata | Destructive secret authority after revoke.                                | Fresh step-up, exact typed confirmation, no active dependents, retention/audit policy satisfied, single-use proof. Deletion never erases immutable lifecycle evidence.              |
| Reveal/copy value         | Unsupported in v1.                                                        | No capability, approval, debug mode, or diagnostic turns this into a browser response.                                                                                              |

Create/import/replace and rotate are safe under concurrency only when bound to the exact base
reference version. Duplicate idempotency keys return the same safe receipt; a different payload
under the same key is rejected. Racing rotations cannot silently choose a winner, and revoke/delete
cannot overtake an unconfirmed cutover.

### Write-only ingress

There are two valid ingress classes:

1. **Server-managed credential:** an authenticated, freshly stepped-up form or OAuth callback passes
   the value directly to the owning server/provisioning command. Browser sessions use the approved
   SameSite cookie posture, explicit Origin checks, and a server-issued CSRF nonce; bearer/session
   presence alone is insufficient. The value is never returned, prefilled, copied into client state
   after submit, included in a URL, logged, or persisted in an Opzava product row. The response
   contains only the reference and safe receipt.
2. **Local-only credential:** the Opzava action requests a local harness/keyring enrollment. The
   local Runner receives the value directly and reports only reference health and a signed receipt.
   The value must not transit the Opzava browser/server merely to simplify setup.

There is no Reveal action. A narrowly approved diagnostic checks resolvability/use through the
owning job and returns only a classified result. A secret-read approval policy does not authorize a
browser value response.

### Rotation and revoke

Rotation is a versioned saga rather than a blind overwrite:

1. authorize and step up the human;
2. write a new version through the owning vault;
3. validate only its required consumers through bounded checks;
4. atomically switch owner metadata/desired version where possible;
5. verify consumer adoption and health;
6. revoke or quarantine the old version according to policy;
7. append audit and notification evidence for every terminal or ambiguous state.

Failure before cutover keeps the last confirmed version active. Ambiguous cutover exposes both the
desired and last-confirmed state, blocks dependent high-risk work, and requires reconciliation.
Revocation is rejected while an owner contract requires the reference unless the user confirms the
owner-defined destructive/containment path.

### Current implementation warning

The only current adapter is explicitly named `LocalFileSecretsVault`. The provisioning worker
defaults it to `/tmp/opzava-openclaw-dev-secrets.json`
([worker lines 7132–7145](../../../apps/workers/src/provisioning/connections-provisioning-service.ts#L7132-L7145)).
Its file writer currently applies mode `0644`
([adapter lines 271–280](../../../packages/adapters/src/secrets/local-file-secrets-vault.ts#L271-L280)).
That is as-built development behavior, not an acceptable production or browser-facing Secrets
contract. Until the storage posture is hardened and verified, it must be labeled development-only or
unhealthy for production admission; building the target page must not legitimize it by omission.

Suspected secret exposure is an actionable security stop. It creates safe attention and audit
evidence, blocks affected credential-dependent operations according to their owner contract, and
routes to containment/rotation without displaying the suspected value.

An unresolved, expired, unavailable, or unverified Secret reference blocks every Gateway, provider,
integration, MCP, Runner, or other owner write whose result depends on resolving that reference. The
consuming command must not accept desired config and hope later resolution makes it safe. Secret
values and derived fingerprints never return through browser DTOs, cards, Slack, GitHub, logs,
exports, evidence packages, Activity, audit, notifications, or screenshots.

## Security & Audit contract

### Local views

Security & Audit should provide five local views:

1. **Approvals** — summary cards for pending, approved today, and denied today; development-platform
   remediation, node/device pairing, GitHub/integration, role/session/security approvals where
   configured; and clearly labeled runtime gate mirrors. User-dashboard business/product approvals
   do not enter this Admin surface.
2. **Governance Audit** — immutable Opzava actor/action evidence with source, scope, result,
   retention, export, correlation filters, and the complete safe indicator set below.
3. **Runtime Activity** — OpenClaw-native agent/tool/message lifecycle evidence after #193, with
   native provenance and retention disclosed.
4. **Access & Sessions** — Users & Roles, explicit Role Matrix and Manage Sessions entry points,
   organization members, role grants, pending invites, MFA posture, and links to owner-authorized
   session actions. Personal sessions remain in Profile & Account.
5. **Security Policy** — organization MFA and other approved security policies, recent denials, and
   safe links to secret/remediation controls.

These are local views, not sidebar children.

Pending approval rows include action, requester, risk, age, exact target/payload version, expiry,
and decision state/actions. Governance Audit rows include source owner, event id/sequence, tenant,
actor and actor type, causal trigger, action, target and safe refs, authorization/policy/entitlement
decision fields, payload/version hash, command/correlation ref, result, source time,
runtime/provisioning refs where permitted, retention class, and observation or index checkpoint.
Export preserves the same field-level authorization/redaction and is itself audited by its owner.

### Audit owner-contract blocker

PRD-013 currently says audit rows **must include old/new safe summaries**, and the original #192
scope repeats that requirement. #192's later readiness finding argues that producing inline config
summaries is itself a secret-leak anti-pattern and proposes immutable configuration-version refs
instead. A readiness comment does not amend PRD-013, and #247 does not silently choose between them.

Therefore the Governance Audit implementation is blocked until the PRD-013 owner contract is
explicitly amended to configuration-version refs or #192 is narrowed to a structurally defined,
provably secret-safe summary representation. Until that decision, tickets must preserve PRD-013's
required field in their gap analysis, must not claim refs have replaced it, and must not invent an
ad hoc diff. Whichever option is accepted, command idempotency happens before append; audit rows
remain append-only and are never upserted by idempotency key.

### Two audit sources, no false unification

| Property          | Governance Audit                                                                                                                                                                                                             | Runtime Activity                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner             | Each Opzava semantic context owns and appends its audit record; Security & Audit is a federated query/index/export over those records.                                                                                       | OpenClaw upstream defines the ledger semantics; the deployed Platform Gateway built from Mainframe is the observed runtime source after Mainframe and broker support expose the ledger.               |
| Required coverage | Configuration and model governance, secret-adjacent actions/denials, identity/session/role policy, approvals, remediation, provisioning/admin jobs, exports.                                                                 | Native agent runs, tool actions, and opt-in message lifecycle families supported upstream.                                                                                                            |
| Truth             | Durable, source-owned Opzava control-plane evidence, normally persisted in Opzava Postgres through context-owned append seams.                                                                                               | Source-native runtime evidence.                                                                                                                                                                       |
| Current state     | No complete audit subsystem; #192 confirms Connections mutations are unaudited.                                                                                                                                              | The pinned Mainframe source, deployed Platform Gateway built from it, and broker contract do not expose the ledger; #193 owns the Mainframe bump, runtime rebuild/reverification, and broker harness. |
| Presentation      | Append-only event history; actor and causal trigger separated; safe target refs plus either the still-required old/new safe summaries or formally accepted config-version refs; requested/terminal events for remote writes. | Native event id and monotonic sequence; metadata-only redaction; native timestamp/status/schema version.                                                                                              |
| Prohibited claim  | Runtime activity or logs reconstruct the authorization/configuration change.                                                                                                                                                 | Governance audit proves the tool/agent actually ran when no native event exists.                                                                                                                      |

The Security & Audit UI may correlate these sources but never rewrites them into one synthetic
event. An Opzava command and a resulting native tool action can be shown as related rows with
separate identities, clocks, sequences, retention, and availability.

#192's readiness findings constrain future implementation: automated reconcilers need a `system`
actor plus causal `triggeredBy`; remote deployed Platform Gateway (and future tenant Gateway) writes
need append-only requested/completed/failed events rather than a mutable outcome; command
idempotency happens before audit append rather than by upserting the audit log. The unresolved
old/new-summary versus configuration-version contract is recorded below. This memo assigns
placement, not the final audit schema.

Security & Audit is therefore a read composition, not a universal write aggregate. Identity & Access
writes identity/session/policy evidence; Approvals writes decision evidence; Platform Ops and each
configuration owner write their command/job evidence; Notifications writes delivery evidence. The
federated query may maintain a rebuildable index/checkpoint, but it cannot become the authority that
makes those actions real. A new cross-context audit write aggregate would require an explicit
architecture decision rather than being smuggled in through page implementation.

Runtime Activity has explicit source states: `unsupported` before #193 means the currently deployed
Platform Gateway, built from the pinned Mainframe source, and the Opzava broker contract do not
expose the known OpenClaw upstream ledger; `unavailable` means that a supported deployed source
could not be queried; `stale` means its evidence exceeded the disclosed window; `cursor-gap` means
sequence continuity is broken; `partial-history` means only a bounded range is known; and
`reconciled` means a detected gap was successfully backfilled to a named checkpoint. An empty state
may say **No activity in this verified range** only after the source is supported, admitted,
reachable, within freshness, and queried across a known cursor range. It must never claim that no
historical activity exists.

There is no trusted total order between Governance Audit and Runtime Activity. Each source preserves
its own identity, cursor/sequence, timestamp, observation time, and clock qualification. A combined
visual timeline is a presentation sort only; correlation may relate rows but cannot declare one
cross-source sequence authoritative.

### Approvals and owner actions

Approve/Deny reloads the source target, payload/version hash, expiry, current policy, tenant, and
actor authority. A stale or changed request disables decisions and produces a safe conflict. Runtime
approval can never override a missing or denied Opzava approval. Destructive remediation requires
the separate PRD-018 confirmation after approval; the table does not execute it directly.

Role, membership, MFA-policy, and session commands are Identity & Access commands. They require
fresh step-up at the risk levels in PRD-001, update authorization/session versions atomically,
revoke stale access, directly append the required context-owned audit record, and separately enqueue
any transactional outbox event needed for downstream notification/projection delivery. The page
cannot treat its last render as permission.

## Settings, Profile, and Appearance contract

### Settings is a federation, not a store

The Settings module exposes a small interface: list authorized owner setting descriptors and launch
the typed owning command or route. Its interface hides owner discovery, authorization, freshness,
validation, and presentation mapping. It does **not** provide `getAllConfig`,
`updateSetting(key, value)`, or a generic JSON editor.

The deletion test is deliberate: removing this federation should make navigation and cross-owner
discovery repeat across callers, but it must not remove any domain's stored setting or command. That
makes Settings a useful deep module without becoming a shallow pass-through command bus.

| Settings local section     | Included                                                                                                                                                                                             | Explicitly excluded                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**              | Identity-owned organization/workspace display defaults such as name, timezone, locale, and other approved low-risk defaults; source version and scope are visible.                                   | Membership/role changes, tenant lifecycle, deployment mutation, or raw provisioning config.                               |
| **Notifications & alerts** | Platform alert-rule defaults, configured delivery-route references, escalation/cooldown, and links to personal notification preferences.                                                             | Ad hoc recipient secrets, Slack OAuth, notification records, or source workflow state. Slack setup stays in Integrations. |
| **Appearance**             | The effective Light/Dark/System choice and an explicit link to the Profile & Account appearance surface.                                                                                             | A second theme store, hidden high-contrast state, or a copy of sidebar compact settings.                                  |
| **Owner setting index**    | Safe descriptors and deep links for Gateway, Models & Providers, Integrations, Engineering/Runtime Skills, MCP Servers, Secrets, Security & Audit, Runners, Environments, and other admitted owners. | Inline copies of those owners' forms or generic raw configuration.                                                        |

Models & Providers owns provider authentication, catalog, enabled/available/routable model facts,
and provider/platform routing primitives; it does **not** own every consumer's model selection.
Agents/AI Workforce owns each Agent's primary/fallback and policy, Ask Admin owns its separately
versioned brain/failover selection under PRD-005 and its active Wayfinder, and Environments owns the
Reviewer tool/model choice under ACC-058. The Gateway destination presents exposure and effective
runtime state, while Tenant Provisioning/Platform Ops owns Opzava draft/apply commands; GitHub/Slack
enrollment belongs to Integrations; MCP auth/policy belongs to MCP Servers; Runner and Docker setup
belong to Runners/Environments; secret lifecycle belongs to Secrets. A Settings card may show safe
status and route, not mutate any of these owner choices.

PRD-013's legacy Settings touchpoints remain requirements, but PRD-020 changes their homes:

| PRD-013 legacy group | Target owner / placement                                                                                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General              | Safe workspace display defaults may remain Settings → Workspace. A true provider/platform routing default moves to Models & Providers; an Agent, Ask Admin, or Reviewer selection moves to that consumer owner rather than being relabeled generic default.                                                                                  |
| Agents               | Agent identity, primary/fallback model selection, and per-Agent policy move to Agents/AI Workforce; execution region/concurrency/timeout moves to Runners or the workflow/runtime owner; follow-up policy moves to Dev Board/Workflows. Settings may link to them.                                                                           |
| Connections          | Operational setup is distributed across Integrations, Gateway, MCP Servers, Runners, Models & Providers, and Secrets. No replacement Connections blob is created.                                                                                                                                                                            |
| Security             | Personal credentials/sessions move to Profile & Account; organization access/policy/audit to Security & Audit; secret-read/rotation policy and references to Secrets.                                                                                                                                                                        |
| Notifications        | Personal channels, quiet hours, pause, and digest remain Profile → Notifications. Workspace/platform alert rules, routing defaults, escalation, and cooldown may live in Settings → Notifications & alerts; Slack/email connection setup remains Integrations.                                                                               |
| Billing              | Do not migrate business Billing/Finance, invoices, subscriptions, dunning, or bookkeeping into Admin. Only operational consumption, quota, spend visibility, and actionable threshold controls may route to Operate → Usage & Costs through their semantic owners.                                                                           |
| Advanced             | Token rotation goes to the token/secret owner; config export/import to Tenant Provisioning/Platform Ops; archive/developer mode to their semantic owner. No generic danger drawer.                                                                                                                                                           |
| Config & schema      | Tenant Provisioning/Platform Ops owns Opzava config drafts/apply, base hash, SecretRef state, and safe validation/reload-impact projections over the deployed Platform Gateway or a future tenant Gateway's runtime schema and effective config. Raw config is an exceptional owner-authorized escape hatch, never Settings' default editor. |
| Deployment           | Private deployed Platform Gateway/future tenant Gateway posture and deployment checks belong Platform Ops, Gateway, Environments, or Releases according to the operated target; credentials never appear.                                                                                                                                    |

This distribution is a migration contract, not scope deletion. Each retained control must preserve
PRD-013 validation, entitlement, redaction, audit, stale-base, and applicable private Platform
Gateway/future tenant Gateway requirements at its new owner destination.

### Personal account versus workspace/platform scope

| Scope                            | Home                                                     | Examples                                                                                                           | Admission                                                                                   |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Personal identity/account        | Profile & Account utility surface from the profile menu. | Profile, email verification, password, MFA, passkeys, recovery codes, sessions, connected-tools doorway, deletion. | Authenticated current user; each sensitive action uses PRD-001 step-up and resource checks. |
| Personal notification preference | Profile & Account → Notifications.                       | Quiet hours, preferred channels, pause/digest preferences. This is the canonical personal preference editor.       | Current user; Notifications owner validates routing.                                        |
| Personal appearance default      | Profile & Account → Appearance.                          | Server-synced account fallback: Light, Dark, or System, used by devices set to inherit.                            | Current user; Profile owns the explicit account-default command.                            |
| Device presentation state        | Top-bar Theme and Profile → Appearance → This device.    | Current-device override: Inherit account, Light, Dark, or System; plus Admin sidebar compact/disclosure state.     | Current device only; both entry points call the same device-preference command.             |
| Workspace default                | Configure → Settings → Workspace.                        | Workspace name/timezone/locale and future approved safe defaults.                                                  | Owner/Admin compatibility now; typed capability later; owner command reauthorizes.          |
| Runtime/platform configuration   | Its dedicated owner leaf.                                | Gateway, provider, integration, MCP, Runner, Environment, Secret, remediation policy.                              | Semantic owner capability, policy, step-up/approval as required.                            |

PRD-001's user-scoped default, PRD-020/ACC-033's per-device persistence, and ACC-031's
one-preference entry-point wording do not currently define precedence. The following is a new #247
composition decision, not a claim that those sources already say it; #246 must carry the exact
two-scope model into the PRD-001/PRD-020 owner amendments before implementation.

V1 locks both appearance scopes rather than deferring the PRD-001 default:

- Profile → Appearance exposes **Account default** and invokes one typed
  `setAccountAppearanceDefault(Light | Dark | System)` command. This server-synced preference
  affects only devices whose current-device choice is **Inherit account**.
- The top-bar Theme control and Profile → Appearance → **This device** invoke the same
  `setCurrentDeviceAppearance(InheritAccount | Light | Dark | System)` device command. They mutate
  one local device state and must reflect each other's result immediately.
- Effective appearance is `explicit device choice → account default → System`. Clearing the device
  override sets **Inherit account**; an account with no stored default falls back to System. System
  follows operating-system changes live. Temporary account-source unavailability follows the
  last-confirmed fallback rule below.
- An account-default change does not overwrite explicit device choices. A failed server command
  leaves the confirmed account default unchanged; a failed device write leaves the current effective
  choice unchanged. If the account source is temporarily unavailable, an inheriting device may use
  its last-confirmed cached default with a stale indicator on the Profile surface; without one it
  uses System. No preference failure changes authorization or route admission.

The two controls are visibly labeled by scope. Two unlabeled theme values or two device stores are
forbidden.

Profile identity includes full name, display name, verified email state, job title, timezone,
language, bio, and avatar/photo metadata. Changing email requires fresh step-up and verification;
the new address cannot become sign-in identity or notification destination before verification, and
failure leaves the old verified identity authoritative. Profile reads/writes remain scoped to the
current human and active Organization where applicable.

### Profile menu and session actions

The menu contains only:

- identity, verified account label, active Organization/workspace, and role/account context;
- **Profile & account** link;
- **Appearance** shortcut with the current effective Light/Dark/System value;
- **Sign out**.

The trigger must be a semantic button and the menu must implement expected menu keyboard behavior,
focus return, accessible names, and mobile positioning. It must not inline password, MFA, passkey,
role, revoke-other-session, logout-all, deletion, or organization-security controls.

The full PRD-001 surface lists only safe session metadata. Revoking another session invalidates its
push binding and access on the next request/reconnect. Current-device Sign out remains reachable but
must replace the defective as-built action with the owner recovery contract below; Logout all other
devices preserves only the current session when policy permits. Account deletion is stepped-up,
typed-confirmed, explicit about scheduling, and preserves shared Organization/Project records.

### Session projection and current sign-out recovery

`AuthPort.listSessions()` currently returns server-only `AuthSession[]`, and each `AuthSession`
contains a live `sessionToken`. That port result is categorically unsafe to serialize, spread,
cache, log, place in a React payload, or return from a route. Profile uses a separate explicit
browser-safe session projection containing only opaque non-token row id, device/browser label,
approximate location, issued/last-active/expiry times, current-device marker, and permitted MFA
assurance. A compile-time DTO mapper plus response/artifact sentinel test must prove the token field
cannot cross the server seam.

PRD-001 locks the invariant that current-device logout ends/revokes the server session before the
signed-out confirmation, but it does not define failure recovery. The following probe/preserve/retry
algorithm is a new #247 safe-action decision that #246 must place into the Identity & Access owner
contract; it is not a shell-owned workaround.

Current-device sign-out has an explicit recovery contract:

1. invoke the Identity & Access revoke command for the current server-derived session;
2. on confirmed success, clear browser session cookies and show the signed-out confirmation;
3. on error or ambiguous response, server-probe that exact current session without returning its
   token: if it is confirmed revoked/absent, clear cookies and complete; if it is still active,
   preserve the cookies and signed-in state and offer an idempotent Retry; if the probe is
   unavailable, preserve the cookies and show **Could not confirm sign out** with Retry;
4. never show the signed-out confirmation, claim server revocation, or say other sessions are safe
   while the current server session outcome is unknown.

Errors expose only an allowlisted reason class/correlation ref. Retry re-derives current identity,
session, tenant, and policy; it never replays a browser-supplied session token. A separate
deliberately labeled local-cookie clear escape hatch is out of v1 because it would leave the server
session live while appearing signed out.

## Notifications, Attention, deep links, and Slack

Four adjacent concepts remain intentionally separate:

| Concept                           | Canonical home                                                                                | State changed there                                                                                                        | Never means                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Attention                         | Top-bar Attention Inbox over source-owned actionability.                                      | No delivery mutation here; the source-owner command resolves actionability. Delivery controls live in Notification Center. | Unread count, health, or durable history.                    |
| Notification Center               | Top-bar utility surface for recipient-scoped delivery history.                                | Mark read, mark all read, dismiss eligible delivery, retry/inspect authorized channel state.                               | Source workflow resolution or configuration audit.           |
| Personal notification preferences | Profile & Account → Notifications.                                                            | Current human's channels, quiet hours, pause, digest, and personal severity preferences.                                   | Workspace alert policy or Slack credential setup.            |
| Platform alert routing            | Configure → Settings → Notifications & alerts, federating Notifications-owned typed controls. | Workspace/platform defaults, escalation, cooldown, admitted delivery-route references.                                     | Personal preferences, connection secrets, or an event inbox. |

### Alert-rule management placement

Full Notifications-owned alert-rule management lives in **Configure → Settings → Notifications &
alerts**, not in Notification Center and not in Integrations. It includes Create, edit,
enable/disable, test/validate where safe, and archive/delete through typed owner commands. A rule
exposes name, owner, tenant/platform scope, condition/predicate, severity, admitted delivery channel
references, enabled state, cooldown, escalation, version, last evaluation/delivery safe summary, and
audit refs. This #247 resolution chooses the visible Admin severity labels Critical, Warning, Info,
and Done, plus future route-specific severities.

The local view renders loading, empty, no-match, forbidden, stale, unavailable, validation-error,
conflict, approval-required, and retry states. Delivery destinations reference configured
Integrations or personal preferences; alert rows never store ad hoc channel secrets. Notification
Center remains delivery/history and offers a typed Notifications-owner retry only when a failed
delivery is eligible; it does not create or edit alert policy.

### Placement amendments required before implementation

This resolution changes placement only while retaining Notifications/Admin-Observability ownership
and behavior:

- PRD-012's `notifications-alerts.html` mapping currently presents Notification Center and Alert
  rules on one page. #247 separates the durable Notification Center into a top-bar utility and puts
  full alert-rule management in Settings → Notifications & alerts. Loading/empty/error states,
  fields, delivery receipts, owner commands, redaction, and audit remain required.
- PRD-012 currently writes the terminal severity as `Success/Done`; #247 selects the single Admin
  label **Done**. This is a vocabulary/placement refinement, not a new notification state.
- #193 currently describes Runtime Activity as Admin monitoring/logs work. #247 places its canonical
  ledger view as the separately labeled **Runtime Activity** local view inside Security & Audit.
  Logs may correlate and deep-link to an authorized runtime row, but does not become the canonical
  native-ledger view.

Before implementation, #246 must arrange explicit PRD-012 mockup/vocabulary amendments and a
reciprocal #193 tracker amendment/link. Until those owner artifacts acknowledge the new placement,
Notification/Alert and Runtime Activity implementation tickets remain blocked; this memo alone does
not silently override them.

### Attention is not unread delivery

The top-bar badge counts authorized source items that require this human now. It does not count
every unread notification, every Incident, health degradation, inventory total, or Activity event.

- Healthy readiness may coexist with non-zero attention.
- Degraded readiness may coexist with zero attention.
- One root cause may visually cluster related items only through an authorized tenant-scoped
  `(rootAuthorityNamespace, opaqueRootId)` correlation. The count remains the number of source-owned
  actionable items, not the number of clusters.
- Mark read and dismiss mutate notification delivery state only. They do not approve, resolve,
  unblock, reconnect, rotate, or otherwise mutate the source record.
- An attention item leaves the inbox only when its source owner reports that the current principal
  no longer has an actionable decision. Dismissing a Notification delivery may hide that delivery
  presentation where policy permits, but it never removes or suppresses the still-actionable
  Attention item.

The popover prioritizes Attention and may expose a secondary unread-updates view plus **Open
Notification Center**. Its accessible name communicates the actionable count; informational unread
count, if shown, has a separate label.

### Delivery deduplication and supersession

Notification identity is idempotent by the exact tuple
`(tenant, recipient, source owner, source event id, source event version, notification kind)`. A
channel delivery intent adds the channel and route version. Retrying the outbox, websocket, push,
email, or Slack adapter cannot create a second notification or a second source action for that
identity. A channel collapse/group key may reduce visual noise but can never merge different source
identities.

A later source state may supersede an earlier notification, but history remains attributable:

- a changed approval creates/updates delivery for the new exact version and makes the old action
  stale;
- a resolved Incident or repaired integration removes actionable attention but may leave the
  resolved notification in history;
- correlation may cluster related rows but cannot merge unlike events or suppress source-specific
  actions;
- each source keeps a sequence/checkpoint where it provides one; duplicates are idempotent,
  out-of-order events cannot regress a newer source version, and a stale version is preserved as
  history or rejected rather than replacing current actionability;
- a detected sequence/cursor gap marks the affected history partial, records the last verified
  checkpoint, and triggers owner-specific reconciliation/backfill before the UI claims completeness;
- per-channel delivery receipts and attempts are children of the notification identity, so one Slack
  failure cannot turn a successful in-app receipt into a different notification;
- display ordering uses source event time plus a deterministic owner/source-id tie-breaker;
  `observedAt` is shown separately when material, and presentation order is never audit authority.

Notification durability also does not prove current actionability. Every action reloads the owner;
resolution removes the item from Attention while preserving eligible Notification Center history.
Mark read/dismiss never resolves the owner. Delivery retries and reconciliation preserve stable
source identity, tenant/recipient guards, and version binding across all channels.

### Safe deep links

Every notification/attention link carries only an owner-classified browser-safe route and opaque
record identity. It contains no secret, setup token, approval capability, raw Gateway/OpenClaw ref,
tenant supplied as authority, or state-changing query. Opening the link re-runs route and record
authorization. A revoked or cross-tenant link returns 403 without disclosing the target.

### Slack relationship

Slack connection/auth health and delivery setup live in Integrations. Notifications owns whether and
how an admitted source event is delivered to Slack. Ask Admin/Dev Board own conversation and
version-bound workflow semantics.

A Slack payload contains only a safe summary and an expiring fetch/action reference. Opening or
acting reloads authorized detail in Opzava. A Slack approval is one-time, attributable, expiring,
and bound to the exact contract/payload/evidence version, then executes the owning command after
reauthorization. Stale/replayed actions fail closed. Machine enrollment, security/integration
changes, secret entry/reveal, and raw credentials never run through Slack.

Slack delivery failure does not erase the in-app Notification record. It records a channel-specific
delivery failure, applies retry/cooldown policy, and may create safe in-app attention when human
repair is required.

## Health, readiness, and attention semantics

The four-state language below restates the locked PRD-020 relationship needed by #247. It does not
select sources, required-versus-optional criticality, freshness windows, or aggregate thresholds;
Wayfinder child #250 owns that inventory and exact composition.

The top-bar health result uses PRD-020's four labels:

| Result        | Meaning                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Healthy**   | Every capability required for the admitted scope has live, verified, within-freshness evidence that it can safely perform its intended operation.                                                    |
| **Degraded**  | Verified evidence shows the platform can continue within a named reduced capability or bounded limitation.                                                                                           |
| **Unhealthy** | Verified evidence shows a required capability cannot safely perform its intended operation or an owner contract has asserted an absolute stop.                                                       |
| **Unknown**   | Required evidence is missing, unverifiable, stale beyond an allowed last-known-good window, unavailable, or otherwise insufficient to make a complete readiness assertion. Unknown is never Healthy. |

If a known Unhealthy fact and unknown sibling facts coexist, the top bar may say Unhealthy because
there is positive stop evidence, while detail still exposes every unknown sibling. In the absence of
known Unhealthy evidence, any required unknown prevents Healthy and ordinarily rolls up to Unknown.
The owner declares whether a not-configured optional capability affects the admitted readiness
scope; the shell does not guess.

Every detail result carries source owner/id, source version/checkpoint, source timestamp,
`observedAt`, `staleAfter`, availability, last-known-good marker, practical effect, and owner route.
Health clicking opens Health with the relevant evidence context. It does not open Connections by
default and does not run repair.

An audit event timestamp proves only when a recorded action/decision occurred; it is not a readiness
probe and cannot satisfy `observedAt`/`staleAfter`. Likewise, a durable Notification record proves
delivery history, not that its source remains actionable. Health always requires the owner-defined
live evidence, and Attention always reloads current owner actionability.

## Safe owner-action boundary

All visible mutations follow one rule: **display authorizes nothing**.

Before execution, the owning command must:

1. derive the principal, tenant, active Organization/workspace, and session from trusted server
   context;
2. reauthorize the exact action and resource through `AuthorizationPort` and tenant/RLS admission;
3. verify the current membership/authorization version and tenant lifecycle;
4. require fresh MFA/passkey step-up for PRD-001 high-risk actions;
5. reload the target, version/checkpoint, policy, approval, expiry, and dependency state;
6. validate CSRF/origin for unsafe browser actions and idempotency at the command seam;
7. use the provisioning/admin job path for Gateway/runtime/config and server-managed secret
   mutations, never the hot broker or browser; local-only credentials use the separately enrolled
   Runner/keyring path and return only a safe receipt;
8. directly append the context-owned governance audit record without secret-bearing payloads; when
   downstream notification/projection delivery needs a transactional outbox, enqueue that as a
   separate event rather than using an outbox as the audit record;
9. return a typed success, stale/conflict, forbidden, approval-required, blocked-by-policy, unknown,
   unavailable, or reconciliation state.

PWA/service-worker callers do not receive a special credential path. They use server-mediated
session probes and the same cookie, Origin/CSRF, tenant, capability, step-up, and version gates as
the browser surface; cached application state never authorizes an offline mutation.

High/destructive remediation additionally follows PRD-018 dry-run, approval, target-scoped admin
credential, and second-confirmation rules. Secret exposure and unhealthy/unverifiable GitHub trust
remain owner-defined unbypassable stops; prominence in Overview or Attention does not add a bypass.

### Capability and proof matrix

#246 may choose canonical capability names, but it must preserve these separately authorizable
operation families:

| Operation family                 | Resource/scope                                                                     | Extra proof                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| View Secrets metadata            | Tenant/workspace and individual Secret reference.                                  | Leaf admission plus resource-scoped read; no value authority.                                             |
| Mutate Secret lifecycle          | Exact Secret ref, consumer, base version, requested operation.                     | Fresh step-up; approval/confirmation where impact policy requires; idempotency.                           |
| View/export Governance Audit     | Exact source contexts, tenant, time range, fields, retention class.                | Separate read and export authority; export is stepped-up when policy or breadth requires it.              |
| View Runtime Activity            | Admitted runtime/agent scope and native cursor range.                              | Broker ACL plus metadata-redaction policy; not implied by audit access.                                   |
| Approve/Deny                     | Exact owner request and payload/evidence version.                                  | Approval authority, fresh state, expiry, one-time decision proof; destructive execution remains separate. |
| Manage users/roles/org policy    | Exact member, role grant, session, or policy version.                              | Identity & Access authority and PRD-001 step-up; authorization-version invalidation.                      |
| Manage personal security/session | Current user's authenticator or exact safe session ref.                            | Authenticated resource ownership and PRD-001 step-up by risk.                                             |
| Manage alert policy              | Personal preference or exact workspace/platform alert rule, never both implicitly. | Corresponding personal or platform authority, source version, validated delivery-route refs.              |
| View Health/Attention            | Admitted scope and each authorized source item.                                    | Read admission only; repair/resolve uses the owner command and its proof.                                 |

A step-up proof is not a reusable boolean. It is server-verified and bound to actor, session,
tenant, action family, exact target, source/base version, issued/expiry time, and a nonce. High-risk
or destructive proofs are single-use; changing target, version, tenant, action, or session
invalidates them. Approval and confirmation are independent proofs and cannot substitute for step-up
or current authorization.

## Deep-module seams for implementation planning

These are design constraints, not required package names:

| Module seam                      | Small interface                                                  | Complexity hidden behind it                                                                                                   | Explicit non-owner behavior                             |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Admin destination registry       | `listDestinations(principal, route)`                             | Exact IA/order, root/leaf capability admission, active state, legacy compatibility, authorized search metadata.               | Does not authorize leaf commands or store domain state. |
| Secret Reference Inventory query | `listSecretReferences(scope)`, `getSecretReference(ref)`         | Consumer joins, storage/provenance classification, health/freshness, blocked dependents, redaction.                           | Does not resolve or return values.                      |
| Secret lifecycle commands        | Typed add/replace/rotate/revoke/validate commands.               | Step-up, write-only ingress, vault/provisioning, version saga, consumer verification, audit.                                  | No generic reveal or key/value mutation.                |
| Security Governance query        | `getGovernanceSnapshot(filters)`                                 | Approval, audit, access-policy, remediation, and native-runtime source adapters with separate provenance.                     | Does not merge source identities or execute decisions.  |
| Owner settings registry          | `listOwnerSettings(scope)`                                       | Owner discovery, typed descriptor mapping, source version/freshness, destination and capability checks.                       | No generic config read/write interface.                 |
| Notification/attention query     | `getAttention(principal)`, `getNotifications(principal, filter)` | Recipient admission, delivery dedupe, source correlation, source actionability, read/dismiss projection, deep-link filtering. | Does not mutate source workflow.                        |
| Health composition query         | `getReadiness(principal, scope)`                                 | Per-source admission, freshness, last-known-good, rollup, practical impact, owner links.                                      | Does not count attention or run repair.                 |
| Profile & Account application    | Typed profile/preference/session/security commands.              | Auth adapter, step-up, session invalidation, push binding, audit, safe metadata projection.                                   | Does not own workspace/runtime configuration.           |

Tests cross the same interfaces as callers. Adapters remain source-specific: context-owned Postgres
audit append/read seams plus a rebuildable federated index, brokered OpenClaw Runtime Activity,
vault/provisioning, Notifications, and Identity & Access. The composition modules do not expose
their adapters as a browser interface.

## As-built current state and gaps

The current app has no target Secrets, Security & Audit, Settings, Notification Center, or Profile &
Account route. The shell exposes only Overview, Tasks, Issues, and a Connections group
([AdminNav lines 42–46](../../../apps/web/components/shell/admin-nav.tsx#L42-L46),
[lines 347–360](../../../apps/web/components/shell/admin-nav.tsx#L347-L360)).

| Current behavior                                                                                                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                           | Target disposition                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell admission checks only setup completion and authentication.                                                                                                                                                                        | [App layout lines 37–48](<../../../apps/web/app/(app)/layout.tsx#L37-L48>); [proxy lines 17–41](../../../apps/web/proxy.ts#L17-L41).                                                                                                                                               | Add root and per-leaf capability admission; preserve Owner/Admin compatibility; denied direct routes return 403.                                                                                                   |
| The top bar renders Ask stream status, Theme, Health, Notification Bell, then Account; this is as-built order rather than the target readiness/attention/account contract.                                                              | [App layout lines 59–70](<../../../apps/web/app/(app)/layout.tsx#L59-L70>).                                                                                                                                                                                                        | Migrate to PRD-020's locked trigger, search, Health, Attention/notifications, Theme, Profile order. #246 selects paths/compatibility, not a different order; Ask status remains owned by its admitted Ask surface. |
| Health pill links to `/connections` and uses `healthy`, `attention`, or `unknown`; attention is embedded in the health shape.                                                                                                           | [layout lines 20–34](<../../../apps/web/app/(app)/layout.tsx#L20-L34>); [shell-state lines 143–184](../../../apps/web/lib/shell-state.ts#L143-L184).                                                                                                                               | Split readiness Health from Attention. Introduce Healthy/Degraded/Unhealthy/Unknown and provenance/freshness.                                                                                                      |
| Shell health uses only the current OpenClaw Connections snapshot.                                                                                                                                                                       | [shell-state lines 274–331](../../../apps/web/lib/shell-state.ts#L274-L331).                                                                                                                                                                                                       | Health composes admitted owner facts; OpenClaw is one source, not global authority.                                                                                                                                |
| Notification bell is a fixture with zero unread and both links point to Tasks.                                                                                                                                                          | [notification bell lines 85–139](../../../apps/web/components/shell/notification-bell.tsx#L85-L139).                                                                                                                                                                               | Replace with real Attention/Notification projections and owner deep links only after the domain seam exists.                                                                                                       |
| Profile menu shows identity, a two-state Appearance toggle, and Sign out; Profile/Settings are descope comments.                                                                                                                        | [account menu lines 197–222](../../../apps/web/components/shell/account-menu.tsx#L197-L222).                                                                                                                                                                                       | Add account/role context and a Profile & Account link; keep sensitive actions on the full surface.                                                                                                                 |
| Theme supports only Light or Dark, stored under `opzava-mock-theme`; there is no System choice.                                                                                                                                         | [theme toggle lines 5–35](../../../apps/web/components/shell/theme-toggle.tsx#L5-L35); [root layout lines 12–35](../../../apps/web/app/layout.tsx#L12-L35).                                                                                                                        | Migrate to the explicit Account default and This device commands, locked precedence/inheritance, all Light/Dark/System states, and live OS following.                                                              |
| AuthPort already lists/revokes/logs out sessions, but the adapter deletes rows and only current-device sign-out is surfaced. Current sign-out does not branch on a revoke result before clearing cookies and redirecting.               | [AuthPort lines 43–84](../../../packages/ports/src/auth.ts#L43-L84); [adapter lines 189–261](../../../packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts#L189-L261); [sign-out action lines 10–22](<../../../apps/web/app/(auth)/signout/actions.ts#L10-L22>). | Add safe session UI, push-binding invalidation, step-up, durable audit, and PRD-001 state semantics; define an explicit idempotent partial-failure contract so the UI cannot falsely claim server revocation.      |
| `AuthPort.listSessions()` returns `AuthSession[]`, and every server session object includes its live `sessionToken`.                                                                                                                    | [AuthSession and AuthPort lines 22–84](../../../packages/ports/src/auth.ts#L22-L84); [adapter list lines 216–235](../../../packages/identity-access/src/adapters/better-auth/auth-port-adapter.ts#L216-L235).                                                                      | Treat this as a server-only port result. Introduce an allowlisted browser-safe session projection and prove tokens cannot enter DTOs, React payloads, logs, caches, notifications, exports, or screenshots.        |
| Current auth/session DTOs expose membership version but no separate authorization-policy version and no browser-safe device/browser/location projection contract.                                                                       | [AuthPort lines 4–84](../../../packages/ports/src/auth.ts#L4-L84); [session principal lines 43–84](../../../packages/identity-access/src/adapters/better-auth/session-principal.ts#L43-L84).                                                                                       | Add the exact authorization invalidation/version and safe device metadata needed by session/governance UI before enabling sensitive commands.                                                                      |
| Connections mutation errors serialize `error.message` directly into browser JSON.                                                                                                                                                       | [route error mapper lines 3–16](../../../apps/web/lib/connections-route-errors.ts#L3-L16).                                                                                                                                                                                         | Replace with allowlisted safe reason classes/messages; prove secret/provider/upstream payloads cannot reach browser errors, logs, notifications, or exports.                                                       |
| The audited custom provider API-key mutation handler authenticates the session and parses raw secret input, but this audit did not locate an explicit route-level Origin/CSRF proof in that handler.                                    | [provider API-key route lines 13–44](../../../apps/web/app/api/connections/model/api-key/route.ts#L13-L44).                                                                                                                                                                        | Treat CSRF/origin enforcement as unproven until a shared server seam and real browser test demonstrate it; target secure ingress must fail closed.                                                                 |
| No complete Opzava Governance Audit implementation was found; Connections mutations are unaudited.                                                                                                                                      | [#192](https://github.com/anthonykewl20/opzava/issues/192).                                                                                                                                                                                                                        | Build context-owned append evidence plus the federated read/index contract before moving mutation parity. Do not substitute logs or Runtime Activity.                                                              |
| The current Mainframe pin, deployed Platform Gateway built from it, and broker path expose no native audit-ledger path.                                                                                                                 | [#193](https://github.com/anthonykewl20/opzava/issues/193).                                                                                                                                                                                                                        | Bump/reverify Mainframe, rebuild/reverify the Platform Gateway, then harness the native RPC through the broker as separately labeled Runtime Activity.                                                             |
| `SecretReference` currently carries tenant, purpose, label, and optional version but not consumer/owner, rotation/expiry, dependency, or resolution-health metadata; the server port also exposes fingerprint/value resolution methods. | [vault port lines 4–46](../../../packages/ports/src/secrets-vault.ts#L4-L46).                                                                                                                                                                                                      | Add a separate browser-safe inventory projection rather than serializing the server vault port. Fingerprints and values never enter product DTOs.                                                                  |
| Provider/GitHub credentials use the development local-file vault; the Secrets page does not exist.                                                                                                                                      | [vault port lines 4–46](../../../packages/ports/src/secrets-vault.ts#L4-L46); worker/adapter evidence above.                                                                                                                                                                       | Harden storage and ingress before exposing target lifecycle commands. Values never enter browser responses.                                                                                                        |
| Connections/API compatibility namespace owns current setup paths.                                                                                                                                                                       | [WF-242 route inventory](wf242-admin-route-ownership-migration-audit.md#exact-as-built-opzava-page-route-inventory).                                                                                                                                                               | Extract shared owner projections first; keep current routes until target parity and #246 cutover criteria.                                                                                                         |

The current UI is valid migration evidence only. Labels, empty fixtures, localStorage keys, and
Connections grouping are not target authority.

## Bounded migration sequence

1. **Install route/admission registry.** Preserve current routes while adding root and leaf
   capabilities, authorized palette/search entries, hard-403 direct links, and Owner/Admin migration
   compatibility. No new target leaf is a placeholder in the production sidebar.
2. **Create owner read seams.** Build browser-safe queries for Secret references, Governance Audit,
   Runtime Activity availability, Settings descriptors, Notification/Attention, Profile/Account, and
   Health provenance. Legacy and target consumers read the same owner projections during overlap.
3. **Harden prerequisites before commands move.** Resolve production secret-storage/ingress posture;
   first resolve the PRD-013/#192 old/new-safe-summary versus config-version-ref owner-contract
   blocker, then build the accepted governance-audit coverage for affected commands; add
   authorization versioning and step-up; complete notification dedupe and safe delivery. #193 may
   land independently because Runtime Activity is not command-audit authority.
4. **Migrate account and appearance utility paths.** Add Profile & Account, session-safe views, and
   the explicit Account default and This device appearance scopes. Replace the mock key only after
   precedence, inheritance, offline behavior, and rollback are verified. Keep current sign-out
   reachable throughout.
5. **Split top-bar Health and Attention.** Dual-read old health only as a compatibility source. The
   new Health control routes to Health; the new Attention control uses source actionability and real
   notification delivery. Never convert old task/issue counts into attention automatically.
6. **Introduce Secrets, Security & Audit, and Settings read views.** Label unavailable sources and
   current gaps honestly. Runtime Activity remains unavailable until #193. Connections audit remains
   incomplete until #192 coverage lands.
7. **Move typed commands one owner at a time.** Both old and new UI call one application command.
   Verify reauthorization, step-up, idempotency, audit, secret safety, partial failure, and deep
   links before removing an old command entry point.
8. **Cut over routes in #246's graph.** Select canonical URLs, safe aliases, query/fragment mapping,
   route telemetry, rollback windows, and retirement gates. Remove duplicate presentation only after
   real-stack parity; retain audit/history and owner ports.

| Legacy surface/state                                 | Coexistence rule                                                                                                                                                                                                                                                                                                                                                                    | Removal gate                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/connections` setup and mutation routes             | Legacy and target leaves call the same typed owner query/command; no copied state or dual write.                                                                                                                                                                                                                                                                                    | Target owner route passes source parity, redaction, command idempotency, audit, rollback, and saved/deep-link migration.                                                                                                                                |
| `/connections/system` drilldown and anchors          | Preserve each admitted semantic anchor through an explicit owner-destination/fragment mapping; unknown or unauthorized anchors fail safely instead of opening a generic page.                                                                                                                                                                                                       | Every saved anchor has a tested target, safe fallback, telemetry, and rollback; #246 owns exact paths/fragments.                                                                                                                                        |
| Cached permanent `/connections/gateway` redirect     | Do not change its destination casually: inventory browser/intermediary caching, introduce the target Gateway route additively, and measure old-link traffic.                                                                                                                                                                                                                        | A cache-aware transition/rollback window proves old cached redirects cannot strand users or bypass target admission.                                                                                                                                    |
| Health pill → `/connections` with embedded attention | Keep as compatibility presentation only while target Health/Attention projections are shadow-compared; never translate fixture counts into source actionability.                                                                                                                                                                                                                    | #250 readiness composition and real Attention projection pass all four independent state combinations; old links have measured-safe redirects.                                                                                                          |
| Notification fixture → `/tasks`                      | Do not redirect to an unimplemented center. Introduce source-owned delivery identities first, then map safe current links.                                                                                                                                                                                                                                                          | Real recipient/tenant admission, dedupe/order/reconciliation, read-versus-resolve, accessible utility route, and rollback verified.                                                                                                                     |
| Account menu / current sign-out                      | Keep current sign-out reachable while Profile & Account is introduced additively.                                                                                                                                                                                                                                                                                                   | Session list/revoke/logout-all/step-up/audit/partial-failure and accessibility contracts pass in multiple real browser contexts.                                                                                                                        |
| `opzava-mock-theme` light/dark                       | Run a versioned one-time conversion only when the new This device value is absent: legacy `light` → `Light`, `dark` → `Dark`, and missing/invalid/obsolete → `InheritAccount`. A present new-format value always wins. Persist the converted device value atomically, retain but stop reading the legacy key for the rollback window, and never infer or overwrite Account default. | Account-default/current-device precedence, exact conversion, one-time/new-value-wins overlap, inheritance, all Light/Dark/System states, OS following, no-flash, obsolete-value repair, rollback, and dated legacy-key retirement pass before deletion. |
| Development local-file secret adapter                | May remain explicitly development-only for controlled local stack use; target inventory must expose its unsafe/unverified production posture.                                                                                                                                                                                                                                       | Approved production vault/keyring/ingress, file/transport/artifact no-secret checks, rotation/revoke reconciliation, and rollback are verified.                                                                                                         |

Every migration row needs before/after source identity, read and command seam, version/checkpoint,
query/fragment/deep-link mapping, telemetry, rollback owner, and a dated retirement decision. A new
target shell entry is not proof that the old semantic path is safe to remove.

## Sad-path contract

| Failure                                                                          | Required behavior                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root or leaf capability denied                                                   | Do not query the denied source. Direct request returns 403 with no existence/count/timestamp/deep-link disclosure. Navigation, search, cached state, and notification links cannot admit it.                    |
| Authorization revoked while menu/page is open                                    | Owning command rejects on current `authorizationVersion`; cached composition is a miss; stale form cannot execute.                                                                                              |
| Tenant becomes suspended while a page/action is open                             | Preserve only policy-authorized safe reads during the grace posture; block runtime starts, sends, provider/tool/MCP/skill use, and configuration/secret mutations with a clear non-leaking state.               |
| Secret reference exists but does not resolve                                     | Show unresolved/unknown with evidence time and affected owner capabilities. Never mark healthy from existence and never reveal the value as troubleshooting.                                                    |
| Secret storage posture is unsafe or unverifiable                                 | Fail closed for production admission, raise safe security attention, and route to containment/hardening. Do not normalize the current development file adapter as production.                                   |
| Secret rotation fails before cutover                                             | Keep last-confirmed version, append failed attempt, expose safe reason and retry. No partial consumer switch.                                                                                                   |
| Secret rotation outcome is ambiguous                                             | Show desired versus last-confirmed versions, block affected high-risk operations, and reconcile. Never guess which credential is live.                                                                          |
| Secret revoke has active dependents                                              | Reject or require the owner-defined destructive/containment path; name safe affected capabilities without exposing secrets.                                                                                     |
| Suspected secret exposure                                                        | Create a security stop/attention item, block owner-defined dependent operations, revoke/rotate through secure commands, and keep every payload redacted.                                                        |
| A context-owned required audit append is unavailable                             | The governed mutation fails or enters that owner's durable pending/reconciliation state. A command that requires audit never silently succeeds unaudited.                                                       |
| One Governance Audit producer/index is unavailable                               | Other admitted producers remain usable and separately labeled. The federated view marks the affected range/source partial; it never treats a missing index row as proof that the source action did not occur.   |
| Runtime Activity unsupported/unavailable/stale/cursor-gapped                     | Governance Audit and other pages remain usable. Label the exact source state and known cursor range; never infer no activity. Reconciliation appends checkpoint evidence rather than rewriting native identity. |
| Governance and runtime rows disagree                                             | Show separate source identities/clocks and a correlation warning. Do not overwrite one with the other or choose the newest observed UI value.                                                                   |
| Approval target changed or expired                                               | Disable decision; owning command returns stale/expired conflict; create safe new attention only if the source still requires action.                                                                            |
| Notification delivery retries/outbox replays                                     | Deduplicate by delivery intent. Preserve attempt history without duplicating the user notification or source action.                                                                                            |
| Notification event is duplicate, out of order, stale-version, or sequence-gapped | Keep the stable source identity; never regress current actionability; mark partial history and reconcile from the last verified source checkpoint before claiming completeness.                                 |
| User marks a notification read/dismissed                                         | Only delivery state changes. Underlying approval, Incident, DevTicket, setup need, or security stop remains actionable until its owner resolves it.                                                             |
| Slack is unavailable                                                             | In-app record remains; Slack attempt retries/cools down; human repair attention appears only when policy says action is needed. No approval silently succeeds.                                                  |
| Slack action is replayed, stale, or cross-tenant                                 | Fail closed, disclose no target detail, append safe denial audit, and require an authorized fresh action.                                                                                                       |
| Notification deep link is revoked/forbidden                                      | Target returns 403. Notification view removes or genericizes inaccessible delivery without disclosing the record.                                                                                               |
| Health source is stale/unknown/unavailable                                       | Prevent Healthy at the affected required scope. Show last-confirmed evidence and practical effect; keep shell/navigation usable.                                                                                |
| Attention source unavailable                                                     | Do not render zero/clear as if verified. Show partial/unknown feed state while retaining verified sibling items.                                                                                                |
| Healthy with attention, or degraded with no attention                            | Render both truths independently; no synthetic cross-control state change.                                                                                                                                      |
| Personal session revoke races with current request                               | Server-side current session/version wins; revoked device loses access/push on next request/reconnect; UI reconciles without exposing tokens.                                                                    |
| Current-device sign-out revoke/probe is failed or ambiguous                      | Preserve cookies and signed-in state unless the server session is confirmed absent; show a generic retryable **Could not confirm sign out** state and never show signed-out confirmation.                       |
| Logout-all partially fails                                                       | Preserve explicit current session policy, report bounded failure, retry idempotently, and never claim all devices were signed out.                                                                              |
| Device appearance storage is unavailable or obsolete                             | Leave the confirmed effective choice unchanged where possible; otherwise inherit the last-confirmed account default or System, repair obsolete values, avoid flash, and never affect route admission.           |
| Account appearance source is unavailable                                         | An explicit device choice remains effective. An inheriting device uses the last-confirmed cached account default with stale state, or System when none exists; no silent account-default write occurs.          |
| Owner setting source is unavailable                                              | Keep other Settings sections usable, label the descriptor unavailable/stale, and do not offer a generic fallback editor.                                                                                        |

## Accessibility and responsive contract

- Secrets inventory, approvals, audit/activity tables, session rows, notifications, alert rules, and
  Settings descriptors have semantic headings, captions or accessible names, and text/glyph states.
- Secret health, approval risk, readiness, unread/actionable state, delivery failure, and session
  currentness never rely on color alone.
- Filters, tabs, menus, disclosures, mark-read/dismiss, Approve/Deny, export, session revoke, theme,
  and confirmation dialogs work by keyboard with visible focus in Light/Dark/System.
- Icon-only top-bar controls have separate accessible names: readiness label with freshness;
  actionable attention count; appearance; account. Health and attention cannot share one ambiguous
  label.
- The Attention popover and profile menu support expected Escape, arrow/Home/End behavior where menu
  semantics apply, outside-click dismissal, and focus restoration. A full mobile surface uses a
  focus-trapped dialog/Sheet and inert background.
- At 320 CSS pixels, the primary status, target, age/freshness, risk, and next action remain
  visible; tables reflow or scroll within a labeled region without creating whole-page horizontal
  overflow.
- Async refresh does not steal focus or announce every poll. Live regions announce meaningful action
  outcomes, connection loss requiring action, and completed preference/security commands.
- Secret input uses clear password-manager-safe labeling, paste support, validation without echo, no
  value in error copy, and explicit one-way save language.
- Destructive confirmation identifies the exact safe target in text, requires deliberate input, and
  explains session/account/shared-record consequences.

## User-level behavior and validation contracts

These are implementation-ticket gates, not claims about the current app:

1. **No-secret contract:** with sentinel credentials entered/rotated through every supported flow,
   inspect rendered HTML, React payloads, network responses after submit, URLs, logs, audit,
   notifications, Slack stubs, exports, screenshots, Activity, and debug bundles. No sentinel value
   or fingerprint appears; only approved reference metadata does.
2. **Cross-tenant contract:** an authenticated tenant A admin cannot enumerate or deep-link tenant B
   Secret refs, notifications, audit events, settings, sessions, or health source detail. Direct
   requests return 403, never 200 empty.
3. **Step-up contract:** expire the step-up window after rendering a high-risk action. Submit is
   rejected and routes through fresh MFA/passkey proof; replaying the old response cannot execute.
4. **Audit-split contract:** execute one Opzava configuration command that triggers one runtime
   action. Security & Audit shows separate Governance Audit and Runtime Activity rows with their own
   source IDs, clocks, sequences, and availability; either source may be unavailable without forging
   the other.
5. **Remote-write contract:** interrupt an owner command after request but before remote
   confirmation. Governance Audit shows requested/pending, then a later completed/failed/reconciled
   event; it never rewrites history or declares a guessed outcome.
6. **Notification-dedupe contract:** replay the same outbox event and websocket/push/Slack delivery.
   The user has one notification and one source action; delivery-attempt evidence remains
   inspectable.
7. **Read-versus-resolve contract:** mark an approval or Incident notification read/dismissed. Its
   source attention remains until the source workflow is resolved, and the top-bar count follows the
   source actionability rather than unread state.
8. **Slack contract:** send a version-bound approval, change the backing target, then invoke the old
   Slack action. It fails as stale, changes no owner state, and emits a safe denial record.
9. **Health/attention contract:** render and drive all four combinations: Healthy with zero
   attention, Healthy with attention, Degraded with zero attention, and Unhealthy/Unknown with
   attention. Controls keep separate names, counts, routes, and meanings.
10. **Unknown contract:** remove a required health source and an attention source independently.
    Neither becomes Healthy nor zero/clear; verified siblings remain usable.
11. **Session contract:** from two real browser contexts, revoke the other session and verify its
    next request/reconnect is denied and push binding is invalidated while the current session
    remains.
12. **Account contract:** logout-all retains only the explicitly permitted current session; account
    deletion requires typed confirmation plus fresh step-up and preserves shared
    Organization/Project records.
13. **Appearance contract:** set Account default to each Light/Dark/System value; set This device to
    Inherit account and each explicit value from both top-bar and Profile. Prove exact precedence,
    cross-entry synchronization, account changes affecting only inheriting devices, Clear returning
    to inheritance, System following an OS change, stale/offline fallback, reload without flash, and
    no second device store.
14. **Settings ownership contract:** change one workspace default from Settings and one provider,
    Gateway, integration, MCP, Runner, and Secret setting from their owner leaves. All call typed
    owner commands; no generic Settings endpoint can mutate the latter group.
15. **Migration contract:** while old and new consumers overlap, force their read state to disagree.
    The owner projection/version wins, both commands share one owner seam, and the UI exposes stale
    compatibility state rather than copying whichever value looks newer.
16. **Accessibility contract:** complete Secrets add/rotate, approval decision, notification review,
    session revoke, appearance selection, and mobile navigation using keyboard and screen reader at
    320, 390, 768, 1024, and 1440 CSS pixels with no lost decision context.
17. **Federated-audit failure contract:** make one source context append successfully while its
    federated index is unavailable, then make another source fail its required append before commit.
    The first action remains real and later reconcilable; the second follows its owner-defined
    fail/pending contract. The page never creates a substitute universal event or reports a verified
    complete range.
18. **Runtime cursor contract:** exercise unsupported, unavailable, stale, out-of-order, cursor-gap,
    partial-history, and reconciled Runtime Activity states. Empty is rendered only for a supported,
    admitted, reachable, fresh, verified cursor range, and no cross-source total order is claimed.
19. **Notification ordering contract:** deliver duplicate, out-of-order, stale-version, and gapped
    source events through in-app, websocket, push, and Slack adapters. One tenant/recipient/source
    identity remains; current actionability never regresses; per-channel receipts remain distinct;
    reconciliation restores a named checkpoint before completeness is shown.
20. **Secure-ingress contract:** submit a sentinel API key with missing/foreign Origin/CSRF proof,
    replayed idempotency key with changed payload, stale base version, concurrent rotation, provider
    error containing the sentinel, and storage failure. Every unsafe request fails closed and the
    sentinel appears in no browser error, log, audit, notification, export, screenshot, or debug
    artifact.
21. **Proof-binding and logout contract:** reuse a valid step-up proof against a different tenant,
    session, action, target, or source version and replay it after success; every request is denied.
    Then force current-session revoke failure and an unavailable confirmation probe: cookies and
    signed-in state remain, the UI shows **Could not confirm sign out**, Retry re-derives the
    current server session, and signed-out confirmation appears only after confirmed termination.
22. **Destructive-confirmation contract:** approve a destructive remediation, open its second
    confirmation, then change the target/version and let the confirmation expire. Execution is
    blocked; no stale approval or step-up proof substitutes for a new exact-target confirmation.
23. **PWA/session contract:** from an installed PWA and service-worker/offline context, attempt safe
    reads and unsafe writes with stale cache, missing/foreign Origin, absent/replayed CSRF nonce,
    and revoked session. Only a fresh server-mediated session probe and the normal authorization
    path can admit the request; cached state never executes a mutation.
24. **Suspension contract:** suspend the tenant after rendering setup/security forms. Safe allowed
    metadata remains available where policy permits, while runtime starts, sends, provider/tool/MCP/
    skill use, and every affected config/secret mutation fail closed with no cross-tenant
    disclosure.
25. **Alert-rule contract:** create, edit, enable, disable, and archive one tenant alert rule with a
    real condition, severity, configured channel ref, cooldown, escalation, owner, scope, and
    version. Reject stale/conflicting edits and ad hoc channel secrets; verify audit and delivery;
    then drive loading, empty, no-match, forbidden, stale, unavailable, and validation-error states.
26. **Security/Profile parity contract:** seed pending, approved-today, and denied-today approvals,
    organization roles/sessions, and context-owned audit rows with every authorized safe indicator;
    verify the summaries, Role Matrix, Manage Sessions, filters, and redacted export. Edit every
    Profile identity field, then change email with expired step-up and failed verification; the old
    verified sign-in identity and notification destination remain authoritative until both gates
    pass.
27. **Record anti-enumeration contract:** repeatedly request an existing foreign-tenant id and a
    well-formed random id for every sensitive record family. Compare disclosed status/code/body and
    size bucket, headers/cache behavior, redirects/metadata, and timing distributions under load;
    neither case is distinguishable, neither denied source is fanned out, and membership/
    `authorizationVersion` changes invalidate every cached admission result.
28. **Session-token quarantine contract:** seed sentinel session tokens and call the real
    session-list port through Profile. Inspect browser DTOs, HTML/React payloads, network responses,
    caches, logs, audit, notifications, exports, screenshots, and debug bundles; only safe session
    summaries cross the seam and no token/hash/sentinel appears.
29. **Owner-amendment gate:** before creating implementation tickets, verify PRD-013 and #192 agree
    on old/new safe summaries versus immutable config-version refs; PRD-012 acknowledges the split
    Notification/Alert placement and Done label; and #193 points Runtime Activity to Security &
    Audit. Any missing reciprocal amendment keeps the affected slice blocked.

Real acceptance runs against `http://web.opzava.localhost:18088` with a real authenticated Owner,
real Postgres/RLS, seeded source data, controlled broker/vault/Slack/GitHub adapters, and the local
Docker stack. Fixture-only prototype states are insufficient. Security assertions inspect actual
responses and artifacts, not merely visible text.

## Downstream constraints for #246

Final route and implementation synthesis must:

1. retain these three distinct Configure destinations within PRD-020's complete six-leaf Configure
   group: Secrets, Security & Audit, and Settings;
2. keep Profile & Account and Notification Center as top-bar utility surfaces rather than adding
   sidebar leaves or hiding them inside generic Settings;
3. choose canonical paths and safe aliases only after mapping current `/connections`, top-bar,
   `/tasks`, sign-out, query, fragment, and cached-link consumers;
4. route Health to Operate → Health and Attention to its authorized inbox/Notification Center, never
   to Connections or legacy Tasks by default;
5. make the destination registry the shared shell/search/palette source while preserving owner
   authorization on every route and command;
6. resolve PRD-013's old/new safe-summary requirement against #192's config-version-ref owner
   proposal, then sequence the accepted governance-audit contract and safe secret ingress before
   migrating commands that would otherwise succeed without required evidence;
7. keep #192 configuration governance and #193 native Runtime Activity separate, amend #193's
   placement to Security & Audit with an authorized Logs correlation link, and dependency-link both
   to their consuming slices;
8. add implementation tickets for Profile & Account/session parity, Notification/Attention delivery,
   Health/Attention split, Secret storage/ingress hardening, Settings federation, Security & Audit,
   and source-specific migration rather than one Admin mega-ticket;
9. include exact current/target route, source projection, command seam, capability, redaction,
   provenance/freshness, query/fragment, coexistence, rollback, and removal gates in every slice;
10. treat the current 0644 local-file vault posture, missing Governance Audit, missing native
    Runtime Activity, fixture notification bell, and two-state mock theme as explicit gaps, not
    accepted baseline behavior;
11. preserve source histories and owner ports when legacy presentation is retired;
12. require real-stack behavior, foreign-existing/random-id anti-enumeration, session-token
    quarantine, cross-tenant denial, no-secret artifact inspection, and accessible user-level
    evidence before redirect/removal;
13. amend PRD-012's combined notifications/alerts placement and `Success/Done` copy to the split
    Notification Center, Settings alert-rule surface, and canonical Admin label Done without losing
    any Notifications-owned behavior;
14. preserve Models & Providers catalog/routability ownership, Agents/AI Workforce per-Agent model
    policy, PRD-005 Ask Admin selection, and ACC-058 Reviewer selection in Environments;
15. carry the exact account-default/current-device appearance commands and sign-out failure recovery
    into their Identity & Access owner contract rather than implementing shell-local substitutes.

## Rejected alternatives

- Add Notifications, Profile, Account, or Appearance as new sidebar destinations.
- Put all account, Gateway, provider, integration, MCP, Runner, Secret, audit, and deployment
  controls into Settings.
- Make Security & Audit a raw log viewer or show native Runtime Activity as the Opzava governance
  ledger.
- Treat OpenClaw's activity ledger as configuration audit, or rebuild native agent/tool activity as
  Opzava audit when the harness is available.
- Expose a Reveal secret action, raw-value health check, browser-visible setup command, local path,
  fingerprint, or secret-bearing before/after diff.
- Use the current local dev JSON vault/file mode as production proof.
- Count unread notifications as attention, count attention as health, or treat `no rows` as healthy.
- Resolve a source workflow when its notification is read/dismissed.
- Let a Slack button, notification deep link, Overview card, menu item, or cached page state stand
  in for current authorization and approval.
- Copy OpenClaw Control UI routes such as `/config`, `/activity`, `/appearance`, or `/debug` into
  the product shell, or expose the deployed Platform Gateway as a browser destination.
- Create one Admin-owned durable snapshot for settings, health, attention, audit, or source state.

## Remaining decisions / fog

The following belong to #246 or later implementation tickets, not this placement resolution:

- canonical production URLs and compatibility duration;
- exact destination capability names beyond the root capability;
- final page layouts and visual prototype selection for these leaves/utilities;
- the production vault/keyring adapters, storage service, and deployment-specific secret ingress;
- PRD-013/#192 owner amendment choosing structurally defined old/new safe summaries or immutable
  configuration-version refs, plus final per-context audit schema/append-port, federated-index, and
  repository-versus-port decisions;
- native audit retention/export behavior after #193's actual upstream version is pinned;
- notification retention durations, severity taxonomy evolution, email provider, and exact
  escalation defaults;
- detailed workspace-setting catalog and future modular RBAC;
- audit and notification retention/redaction decisions owned by the Dev Board/observability
  investigations where they overlap.

None of these gaps permits a target implementation to infer authority from current UI fixtures.
