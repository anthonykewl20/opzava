# WF-243 — Engineering Skills, Runtime Skills, the Ask Admin skill subset, and MCP placement

Status: **Resolved Wayfinder design input for
[#243](https://github.com/anthonykewl20/opzava/issues/243)**

Date: 2026-07-16

Scope: the exact current and target authority boundaries, Admin placement, setup, health, update,
rollback, policy, and local-harness projection contracts for Engineering Skills, OpenClaw Runtime
Skills, the Ask Admin skill subset, and MCP Servers. This memo is design evidence for final Admin
synthesis [#246](https://github.com/anthonykewl20/opzava/issues/246); it does not authorize product
implementation or change the canonical PRDs, ADRs, or `CONTEXT.md`.

## Executive finding

The four concepts must stay separate even when one screen links to another:

1. **Engineering Skills** is an Opzava-governed, upstream-tracked catalog of engineering workflow
   skills. Opzava owns approved sources and versions, verification, rollout intent, receipts, and
   drift. An upstream change is only an update candidate; it never activates silently.
2. **Runtime Skills** are OpenClaw-native skills implemented by the Opzava-owned **Mainframe**
   source fork and executed by the running **Platform Gateway**. The Platform Gateway owns current
   installed, discovered, eligible, filtered, and execution observations; the Admin surface projects
   those facts. Opzava owns desired versions, governance, provisioning decisions, and receipts.
3. **Ask Admin skill subset** is a versioned, fail-closed target policy. It is neither a third
   catalog nor a navigation destination. Pinning Ask Admin in the shell grants no skill or tool. The
   effective subset is computed from approved catalog versions, installed/eligible runtime state,
   the exact agent allowlist, tool prerequisites, tenant/RBAC policy, and denials.
4. **MCP Servers** is an Opzava registry of external endpoint definitions and their per-consumer
   bindings. It is not a skill category, a hosted Opzava MCP service, or local-machine enrollment.
   One logical definition may be projected to the Lead Orchestrator and an enrolled Codex or Claude
   harness, but each consumer has its own credential reference, tool policy, setup receipt, and
   health result.

The shared enforcement invariant is:

> Skills describe procedure; MCP servers expose tools; neither grants authority. The effective tool
> and skill set is computed server-side under tenant, identity, client, target, and deny-wins
> policy. Secret values never enter product DTOs, logs, audits, setup commands, or browser state.

This split follows the locked Admin placement: **Runtime Skills** belongs under **AI Runtime**;
**Engineering Skills** and **MCP Servers** belong under **Configure**; **Ask Admin Opzava** remains
pinned, with a read-only view of its effective skill set rather than a duplicate catalog
([PRD-020](../../prd/PRD-020-admin-control-center.md),
[Admin foundation decisions](../admin-control-center-foundation-decisions.md)).

## Authority and precedence

This memo applies the following precedence:

1. [PRD-007](../../prd/PRD-007-knowledge-skills.md) owns skill catalog, provenance, verification,
   provisioning, receipt, and drift semantics.
2. [PRD-013](../../prd/PRD-013-connections-tools.md) owns MCP, tool policy, integration setup,
   SecretRef, and local-harness projection semantics.
3. [PRD-005](../../prd/PRD-005-assistants-chat.md) and the Ask Admin Wayfinder map
   [#210](https://github.com/anthonykewl20/opzava/issues/210) own Ask Admin behavior and authority.
   In particular, [#219](https://github.com/anthonykewl20/opzava/issues/219) owns the exact semantic
   membership and content of the Ask Admin v1 skill set.
4. [PRD-020](../../prd/PRD-020-admin-control-center.md) and its foundation ledger own Admin
   admission, placement, shell composition, and presentation. They do not acquire skill, runtime,
   MCP, or assistant authority.
5. Current Mainframe source and the running Platform Gateway prove what exists today. OpenClaw is
   the upstream lineage, Mainframe is Opzava's source fork, and the Platform Gateway is installed
   runtime/observation truth. None permits exposing internal Gateway authority or copying the native
   Control UI into the product.

The canonical terms **Engineering Skills**, **Runtime Skills**, **Ask Admin skill subset**, and
**MCP Servers** already exist in [`CONTEXT.md`](../../../CONTEXT.md). This memo does not rename or
merge them.

## Locked decisions

| Question                                                            | Resolved decision                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is Engineering Skills another runtime?                              | No. It is Opzava's governed catalog and rollout control plane over supported execution targets.                                                                                                                                                                                                                                                                                                                                            |
| Does Opzava fork or copy the Matt Pocock engineering catalog?       | The user-approved canonical source is one **platform-owned** Opzava GitHub fork with immutable upstream provenance. It is shared platform authority, never a per-tenant fork. Tenant policy selects approved versions and rollout targets. A mirror/cache may support availability internally but is never alternative authority. No such fork currently exists in the inspected GitHub organization, so initial enrollment is setup work. |
| Are upstream changes automatic?                                     | Detection may be scheduled or webhook-driven. Assessment, approval, activation, and rollout are always explicit. “Automatic update” means automatic candidate detection only.                                                                                                                                                                                                                                                              |
| Are all user-approved engineering names upstream names?             | No. Preserve canonical frontmatter names and provenance. Names absent from the pinned upstream snapshot, including current user-approved `grilling`, `qa`, and `to-issues`, must be modeled as explicit fork-derived or Opzava-authored entries rather than silently aliased.                                                                                                                                                              |
| Is Runtime Skills a duplicate catalog?                              | No. Runtime Skills are OpenClaw-native skills; the Admin surface projects their observed installed/discovered/eligible state and links them to the approved catalog version when applicable.                                                                                                                                                                                                                                               |
| Is the Ask Admin skill subset a page?                               | No. It is target policy. Agents → Ask Admin may show the effective set and denial reasons, then deep-link to the owning skill or policy surface.                                                                                                                                                                                                                                                                                           |
| Is Ask Admin's exact v1 list settled here?                          | No. Current state is empty. #219 owns the exact content and required tool-policy changes. This memo locks the mechanism and boundary that #219 must satisfy.                                                                                                                                                                                                                                                                               |
| Can a skill grant a tool named in its prose?                        | Never. Tool availability is independently admitted and deny-wins.                                                                                                                                                                                                                                                                                                                                                                          |
| Is MCP Servers the old hosted-MCP proposal?                         | No. The hosted MCP/OAuth design in closed issue #151 remains superseded. The Admin page manages outbound external definitions and per-consumer projections; it creates no public Opzava MCP endpoint.                                                                                                                                                                                                                                      |
| Is `openclaw mcp serve` the Admin MCP registry?                     | No. It is a local stdio bridge for channel conversations. It is not the external endpoint catalog and must not be presented as one.                                                                                                                                                                                                                                                                                                        |
| Is local harness enrollment part of MCP Servers?                    | No. Runner enrollment and harness selection are owned by local execution setup. MCP Servers may target an already-enrolled, compatible managed harness profile.                                                                                                                                                                                                                                                                            |
| Can the same MCP server be used by orchestrator and local tools?    | Yes as one logical definition with separate consumer bindings. “Same” never means shared credentials, identical policy, or shared health.                                                                                                                                                                                                                                                                                                  |
| Can Opzava overwrite a user's global Codex or Claude configuration? | No. Opzava manages an isolated Opzava harness profile. An execution pins its effective profile revision.                                                                                                                                                                                                                                                                                                                                   |
| How does rollback work?                                             | Rollback is a new audited deployment/config revision pointing to a retained previous verified version. It is never history deletion or an unverified file restore. Revoked, compromised, incompatible, or credential-invalid targets are ineligible.                                                                                                                                                                                       |

## Current-state inventory

The distinction between **current** and **target** is mandatory. The locked pages are not already
implemented.

| Area                   | Current repository truth                                                                                                                                                                                                                                                                                                                                                                                                  | Gap to target                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Engineering Skills     | No Opzava catalog route, catalog service, approved version store, rollout receipt, or managed local-harness projection exists. Project-local `.claude/skills` contains repository guidance, not a product catalog.                                                                                                                                                                                                        | Build the Opzava governance/catalog seam and enrollment flow.                                                        |
| Upstream source        | The inspected `mattpocock/skills` `main` tree at commit `9603c1cc8118d08bc1b3bf34cf714f62178dea3b` contains the engineering catalog listed below. No `anthonykewl20/skills` fork was found.                                                                                                                                                                                                                               | Create the single platform-owned canonical Opzava fork; tenants select approved versions but never own source forks. |
| Runtime Skills         | The Mainframe source fork implements discovery, precedence, agent filtering, eligibility, status, search/detail, security verdicts, install, and update; Skill Workshop proposals also support reject/quarantine actions. The running Platform Gateway supplies installed/observed truth. `OpenClawGatewayPort` does not expose an Opzava product adapter for those lifecycles, and no Opzava Runtime Skills page exists. | Add bounded adapters and projections without reimplementing the runtime.                                             |
| Ask Admin skill subset | Ask Admin is provisioned with `skills: []`, `profile: "minimal"`, and filesystem/read restrictions. It cannot currently load any OpenClaw skill. Current `buildSubagentAgentEntry` emits explicit tools but omits `skills`, so descendants can inherit Gateway defaults.                                                                                                                                                  | #219 defines content; #216/#219 must use the explicit default/descendant fail-closed mechanism below.                |
| MCP Servers            | The Mainframe source fork implements an outbound MCP registry and Codex/Claude bundle support; the Platform Gateway and harness adapters provide target observations. Opzava has no generic Admin registry or provisioning adapter.                                                                                                                                                                                       | Add the Opzava registry, policy projection, per-consumer binding, SecretRef, health, revision, and receipt seams.    |
| Legacy Opzava MCP      | `apps/mcp-server` is a local stdio server exposing legacy Task tools through an Opzava link token.                                                                                                                                                                                                                                                                                                                        | It is migration evidence for Dev Board mapping #237, not the target MCP Servers registry or a hosted service.        |
| Admin UI               | Current `/connections/add` explicitly defers MCP until a live backend seam exists; the current shell has none of the three target leaves.                                                                                                                                                                                                                                                                                 | #246 must place the new leaves without growing legacy Connections into a generic setup bucket.                       |

### Pinned upstream Engineering Skills evidence

The immutable upstream snapshot used for this investigation is
[`mattpocock/skills@9603c1c`](https://github.com/mattpocock/skills/tree/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/engineering).
At that snapshot the engineering directories are:

- `ask-matt`
- `code-review`
- `codebase-design`
- `diagnosing-bugs`
- `domain-modeling`
- `grill-with-docs`
- `implement`
- `improve-codebase-architecture`
- `prototype`
- `research`
- `resolving-merge-conflicts`
- `setup-matt-pocock-skills`
- `tdd`
- `to-spec`
- `to-tickets`
- `triage`
- `wayfinder`

The source repository is MIT-licensed and active. Future synthesis must not hard-code this list as
eternal membership: source identity, canonical name, immutable version, content hash, provenance,
and compatibility are data. The user-approved workflow also mentions `grilling`, `qa`, and
`to-issues`; because those names are not directories in this pinned upstream tree, Opzava must
record their actual source class and content rather than invent equivalence.

### Dated official OpenClaw documentation check

The current official OpenClaw documentation was rechecked on **2026-07-17 (Asia/Manila)**:

- [Official Skills documentation](https://docs.openclaw.ai/tools/skills) states that a session
  snapshots eligible skills but can refresh mid-session when the skill watcher detects a `SKILL.md`
  change or an eligible remote node connects; the next turn receives the refreshed list.
- [Official MCP documentation](https://docs.openclaw.ai/cli/mcp) distinguishes `mcp serve` from the
  outbound registry, documents `status`/`doctor`/`probe`, and states that dynamic MCP tool-list
  changes invalidate a session's cached catalog. It also documents `logout`, `reload`, and `unset`
  as distinct teardown/configuration actions.

As-built evidence remains the repository's Mainframe source and the running Platform Gateway.
[`mainframe/UPSTREAM.md`](../../../mainframe/UPSTREAM.md) pins the Mainframe fork to OpenClaw
`v2026.6.11` / `bd2740fedc`, imported 2026-07-04. Current upstream documentation is compatibility
research, not proof that the installed fork already behaves identically. Any divergence requires an
explicit Mainframe adapter/patch and real Platform Gateway proof.

## Target authority matrix

| Capability                                                                 | Desired-state authority                                           | Runtime/observed authority                                                 | Mutation path                                                   | Product placement                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| Engineering source, canonical name, provenance, platform-approved versions | Platform-owned `SkillCatalogPort` and canonical Opzava fork       | Canonical fork and upstream status are evidence only                       | Platform-operator application service → audited worker job      | Configure → Engineering Skills source status (tenant read-only)       |
| Tenant Engineering Skill selection and rollout                             | Tenant policy selects platform-approved versions/targets          | Selection/deployment receipts                                              | Tenant owner/admin application service                          | Configure → Engineering Skills                                        |
| Engineering skill deployment to orchestrator/local harness                 | Opzava deployment revision and target binding                     | Platform Gateway or managed-harness adapter reports materialized version   | Audited worker; short-lived target authority; idempotent apply  | Engineering Skills detail and target rollout view                     |
| OpenClaw-native installed/discovered skill                                 | `SkillCatalogPort` is the sole approval authority                 | Running Platform Gateway                                                   | Audited worker calling Mainframe-native lifecycle behind a port | AI Runtime → Runtime Skills                                           |
| Ask Admin skill selection                                                  | Ask Admin target policy owned by PRD-005/#219                     | Platform Gateway agent config plus effective-policy observation            | Versioned policy mutation; runtime reprovision through worker   | Not a top-level page; read-only effective view under Ask Admin/Agents |
| Skill tool prerequisite                                                    | Effective capability policy                                       | Gateway/tool inventory and consumer policy                                 | Independent tool/MCP/integration setup; never skill prose       | Owning tool/integration pages                                         |
| MCP server definition                                                      | Opzava MCP registry                                               | Endpoint definition is desired state; endpoint metadata is untrusted input | Owner/admin application service                                 | Configure → MCP Servers                                               |
| MCP consumer binding                                                       | Opzava binding and target policy                                  | Orchestrator or enrolled harness adapter reports applied revision          | Audited worker; per-consumer apply/rollback                     | MCP Server detail → Targets                                           |
| MCP reachability/capability health                                         | No durable command authority; Opzava stores observations/receipts | Per-consumer live probe is observation truth                               | Read/probe with safe rate limit and explicit freshness          | MCP Server detail, Health projection, Overview readiness              |
| Secret material                                                            | Secret subsystem/provider                                         | Consumer only receives resolved value at execution/provision boundary      | SecretRef selection/rotation; no browser retrieval              | Configure → Secrets; reference-only elsewhere                         |

## Provisional, non-canonical vocabulary for #246

These working terms sharpen the existing canonical four without editing `CONTEXT.md`. They remain
explicitly provisional and non-canonical everywhere in this memo, even when capitalized for
readability. #246 must either promote them through the normal `CONTEXT.md` domain-modeling change or
replace them with equally precise canonical terms before implementation tickets rely on them.

| Proposed term                           | Meaning and invariant                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skill Catalog Entry**                 | A canonical skill identity with source class, provenance, allowed scopes, and policy. It is not installed state.                                       |
| **Skill Version**                       | Immutable, verified skill content identified by source revision and content hash. Mutable branch names are candidate locators, not versions.           |
| **Skill Set Revision**                  | Immutable ordered selection of Skill Versions and policy used by a workflow or target. Active executions pin one revision.                             |
| **Skill Deployment**                    | Desired materialization of a Skill Version or Skill Set Revision to one execution target plus its apply receipt.                                       |
| **Managed Harness Profile**             | Isolated Codex/Claude configuration owned by Opzava for Opzava work. It is distinct from the user's global tool configuration.                         |
| **MCP Server Definition**               | Logical external server identity, transport metadata, declared source, and safe non-secret configuration. It is not a live connection.                 |
| **MCP Consumer Binding**                | One server definition projected to one target client with its SecretRefs, tool filters, policy, and applied revision.                                  |
| **Capability Probe Receipt**            | Timestamped, target-specific, non-secret observation of config validation, connection, advertised tools, and policy result. It is not permanent truth. |
| **Effective Capability Set**            | Final skills and tools admitted for a tenant, actor, target, client, and execution revision after deny-wins policy.                                    |
| **Capability Admission Manifest**       | Version-addressed skill/MCP/tool/policy inputs pinned by one owner-specific run or session admission. It is not a new lease/session authority.         |
| **Skill/Tool Digest Fields**            | Interoperable content/schema hashes using the versioned canonical encoding below; field names are not yet canonical domain terms.                      |
| **Managed Harness Enforcement Adapter** | Runner-owned call-time enforcement integration whose server-verified attestation trust contract belongs to #232.                                       |
| **Update Candidate**                    | Immutable upstream/source change detected for assessment. Detection never implies approval or activation.                                              |

Two overloaded phrases must be prohibited in implementation briefs:

- **“Automatic skill update”** means automatic candidate detection only unless the brief names an
  explicit, human-approved activation policy. The v1 contract never silently activates upstream
  changes.
- **“Same MCP on local and cloud”** means the same logical MCP Server Definition. Each consumer has
  a separate binding, SecretRefs, effective tools, apply receipt, and health result.

## Deep-module boundaries

The target should expose narrow, policy-bearing modules rather than one broad “skills and
connections” service.

### 1. Skill Catalog

Use the existing `SkillCatalogPort` direction as the authoritative interface for catalog entries,
immutable versions, provenance, verification, source status, allowed scopes, and selection policy.
It must not install files or query live runtime state directly.

Representative operations:

- register or reconcile a governed source;
- detect immutable update candidates;
- verify source identity, manifest, content hash/signature, license, dependencies, requested tools,
  and compatibility;
- approve, reject, quarantine, or revoke a version;
- compose and publish a Skill Set Revision.

### 2. Skill Deployment/Reconciler

Own target-specific plan/apply/observe/rollback behavior. Its adapters are the actual variation:
OpenClaw Runtime Skills, local Codex harness, local Claude harness, and any later cloud harness.

Representative interface shape:

```text
plan(target, desiredSkillSetRevision, observedDeploymentReceipt) -> DeploymentPlan
apply(plan, idempotencyKey) -> DeploymentReceipt
observe(target) -> ObservedSkillState
rollback(target, previousVerifiedSkillSetRevision, idempotencyKey) -> DeploymentReceipt
```

The module consumes approved catalog data. It does not decide skill approval or effective tool
authority.

### 3. Effective Capability Policy

Compute both skill and tool admission in one deny-wins policy boundary. This prevents catalog,
runtime, Ask Admin, and MCP UIs from each inventing a different “enabled” meaning.

The calculation must be explainable: every excluded capability returns a safe reason such as
`not-approved`, `not-installed`, `agent-filtered`, `missing-dependency`, `policy-denied`,
`credential-unhealthy`, `target-offline`, `approval-required`, or `stale-observation`.

Admission is not only a setup-time calculation. The server-side broker/runtime dispatch boundary
must evaluate the pinned policy revision immediately before every tool invocation. A skill loader,
MCP transport, local harness, or cached advertised-tool list cannot bypass that check. Each allowed
or denied invocation carries the tenant, actor, client, target, execution revision, capability,
policy revision, and safe decision reason into the audit envelope.

### 4. MCP Registry

Own MCP Server Definitions, versions, validation, consumer binding plans, probe receipts,
activation, and rollback. Keep transport adapters and consumer adapters behind it.

Representative interface shape:

```text
draft(input, principal) -> DefinitionDraft
validate(draft) -> ValidationReport
planBindings(definitionVersion, targets) -> BindingPlan[]
probe(bindingPlan) -> CapabilityProbeReceipt
activate(bindingPlan, approval, idempotencyKey) -> BindingReceipt
rollback(binding, priorVerifiedBindingRevision, idempotencyKey) -> BindingReceipt
```

### 5. Secret and target adapters

Secret resolution stays behind the Secret subsystem. OpenClaw and local Runner adapters receive
resolved values only at the narrow provisioning/execution boundary and return redacted receipts.
They do not return values to the application service. Runner enrollment, target ownership, and
online/lease state remain Runner responsibilities rather than MCP Registry data.

## Engineering Skills contract

### Source and provenance model

Every entry records:

- platform catalog/source scope plus separate tenant selection/rollout policy;
- canonical frontmatter name and collision key;
- source class: `upstream`, `fork-derived`, or `opzava-authored`;
- upstream repository and immutable commit when applicable;
- platform-owned canonical Opzava fork identity and immutable commit;
- optional mirror/cache observation linked to that fork, never treated as authority;
- content hash, license, manifest, dependency set, requested tools, and compatibility declaration;
- verification report and security verdict;
- approved, active, revoked, or quarantined lifecycle state;
- rollout eligibility by orchestrator and managed harness type;
- update-candidate relationship and safe diff summary.

Canonical names are stable identities. A fork may carry patches, but it does not silently rename an
upstream skill. Two sources claiming the same canonical name are a collision requiring an explicit
owner decision; source precedence must never choose invisibly.

### First setup

The platform has a one-time source bootstrap: an authorized platform operator establishes the
canonical Opzava fork, records upstream provenance, verifies the platform GitHub App/installation
and SecretRefs, and optionally provisions an internal mirror/cache. A tenant owner cannot create,
replace, or credential a source fork.

The tenant's first Engineering Skills visit is instead a simple guided form that requires no other
tab for planning information:

1. Show canonical platform-fork/upstream health and immutable approved versions. If platform source
   health is blocked, tenant setup is read-only with a platform-owned repair reason.
2. Let the owner/admin select allowed entries, versions, and orchestrator/managed-harness rollout
   targets under tenant policy.
3. Show manifest/content/license/dependency/tool-impact verification and the exact tenant selection
   diff.
4. Produce an immutable Skill Set Revision, per-target deployment plans, and an approval summary.
5. Apply atomically per target. Record receipts; partial multi-target success is `partial`, never
   “healthy.”
6. Probe the resulting installation and effective policy, then activate only verified target
   bindings.

If a fork cannot be created, upstream is unavailable, GitHub health is unverifiable, or immutable
source identity cannot be proven, platform bootstrap remains blocked and every tenant selector is
read-only. No tenant fallback source and no direct execution from a mutable branch is allowed.

### Update and rollback

An update passes through `detected → assessed → approved → staged → activated`, with `rejected`,
`quarantined`, and `revoked` as explicit outcomes. Detection can be scheduled or webhook-driven; the
other transitions require authorized policy and receipts.

Before approval the UI must show:

- canonical name and provenance changes;
- old/new immutable source revisions and content hashes;
- source diff summary;
- permissions, tool prerequisites, dependencies, install-policy, and compatibility changes;
- affected Skill Set Revisions, targets, workflows, and active runs;
- reprovisioning/restart needs and rollback eligibility.

Activation creates a new Skill Set Revision and affects new executions only. An already-running
workflow remains pinned unless an explicit reconciliation action passes its own safety gate.

Rollback creates a new deployment revision that references a retained previous verified Skill
Version. It must be blocked when the prior version is revoked, compromised, incompatible with the
target, no longer retrievable, or requires an unhealthy credential/dependency. A rollback is
target-atomic; failures preserve the last observed state, report partial fleet drift, and create a
repair action rather than claiming success.

## Runtime Skills contract

The Mainframe source fork implements the runtime mechanics inherited from OpenClaw upstream:
discovery across bundled/managed/personal/project/workspace sources, explicit precedence, per-agent
filtering, eligibility, dependency checks, security verdicts, installation, refresh, and session
snapshots. The running Platform Gateway supplies installed/observed facts. The Admin surface
projects them; it does not create a second skill loader.

The Runtime Skills page should expose:

- canonical name, runtime source, source precedence, and observed content identity;
- installed/discovered/eligible/filtered/disabled state;
- allowed agents and the exact safe reason an agent cannot use it;
- missing binaries, environment references, configuration, platform, or tool dependencies;
- security verdict, install-policy result, and quarantine/revocation status;
- desired approved catalog version when linked to Engineering Skills;
- observed runtime version, drift, last reconciliation, and receipt freshness;
- actions allowed by RBAC: inspect, plan install/update/uninstall, repair, disable, or rollback.

An Engineering Skill materialized into OpenClaw appears here as one Runtime Skill linked to the same
catalog identity/version. The page must not clone it as a new catalog record or let the runtime
silently promote an observed version to approved truth.

Native reads require `operator.read`; install/update/upload mutations require `operator.admin`.
Product mutations therefore use audited worker jobs and short-lived admin authority. Browser code
never receives Gateway DTOs, configuration, or tokens.

The Runtime Skills lifecycle uses the same reconciler contract rather than native mutation buttons
with hidden side effects:

1. select a version approved through `SkillCatalogPort`;
2. plan the target-specific install/update/disable/uninstall/repair and disclose
   `security.installPolicy`, dependency, requested-tool, compatibility, restart, data-removal, and
   rollback effects;
3. approve and apply through an idempotent audited worker using short-lived `operator.admin`;
4. observe native installed/discovered/eligible/filter state and persist a target receipt;
5. require a fresh observation of the applied revision plus effective-policy evaluation before
   rendering it active/callable;
6. repair drift or roll back through a new deployment revision to a retained eligible version.

Missing, incompatible, expired, unavailable, or denied `security.installPolicy` fails closed. A
native filesystem change without a matching deployment receipt is drift, not an implicit update.
Bulk native updates are not treated as transactional: Opzava records each target/version result and
keeps the aggregate partial until every planned installation is reconciled.

Runtime Skills has no independent approval path. A Platform Gateway may discover a bundled, managed,
workspace, node-hosted, or otherwise uncataloged native skill, but that entry is a read-only
candidate and remains non-effective for Opzava-managed execution until `SkillCatalogPort` records
its verified version and approval. Runtime discovery cannot promote itself to catalog truth, even
for a skill supplied by the Mainframe fork.

### Runtime Skill teardown

Disable/uninstall is target deployment teardown; it never deletes the `SkillCatalogPort` approval
record or immutable source history. The reconciler first removes the skill from effective admission,
then handles active owners separately: PRD-019/ADR-017 checkpoints/fences affected DevTicket runs,
while PRD-005 denies/drains affected assistant turns and requires a new session manifest.

The teardown plan inventories and receipts all target-owned material: version-addressed skill files
and workspace projections, discovery/snapshot/cache entries, skill-attributable managed processes,
environment/SecretRef attachments, and installed dependency references. It removes only files and
processes attributable to that deployment. Shared binaries, packages, caches, dependencies, and
SecretRefs use reference/dependency checks and are never deleted or rotated because one skill was
removed.

An offline target records desired disable/uninstall plus a non-secret tombstone and remains
`pending-cleanup`; it is non-effective immediately but cannot claim filesystem/process cleanup.
Files removed but cache still visible, process still alive, dependency cleanup failed, SecretRef
still attached, target offline, or receipt persistence failed are explicit `partial-cleanup` states.
Every step is idempotent and replayable; reconnect observes actual files/cache/process/dependencies,
continues from the last receipt, and reaches `removed` only after verification. Repair/retry and
rollback create new receipts and never erase failed attempts.

Runtime teardown tests cover disable with each active admission class, offline target, file removal
with stale cache, surviving attributable process, shared dependency/SecretRef reference counts,
partial receipt failure, idempotent retry, reconnect observation, tombstone retention, and rollback.

Runtime status and product status are deliberately distinct:

| Layer      | Example states                                                          | Meaning                                               |
| ---------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Catalog    | approved, update candidate, revoked, quarantined                        | Whether Opzava permits a version.                     |
| Deployment | pending, applying, applied, partial, failed, rollback available         | Whether desired content was provisioned to a target.  |
| Runtime    | discovered, installed, eligible, filtered, disabled, missing dependency | What the running Platform Gateway currently observes. |
| Effective  | callable, denied, approval required, stale/unverifiable                 | What this actor/agent/client may actually invoke now. |

## Active-session and run capability stability

“Updates affect new runs” is not enforceable by documentation alone. Current official behavior can
refresh skills on the next turn and can invalidate/refetch a dynamic MCP catalog within an active
session. Every invocation therefore belongs to exactly one owner-specific admission class and pins
an equivalent version-addressed **capability manifest** (provisional, non-canonical working term).
WF-243 does not turn every Platform Gateway session into a DevTicket Execution Lease.

### Common manifest and digest rules

Both admission classes pin Skill Set Revision/content hashes, MCP Consumer Binding revisions, an
exact model-facing tool-name → approved schema-hash map, effective-policy revision, model/tool
selection, tenant/actor/client, and target identity.

`SkillVersionDigest` and `ToolSchemaDigest` are provisional, non-canonical field names. Their
interoperable v1 encoding is nevertheless exact:

- Structured values use RFC 8785 JSON Canonicalization Scheme (JCS) and UTF-8. A skill manifest has
  protocol version plus path-sorted entries; each regular-file entry contains normalized path,
  normalized mode (`0644`/`0755`), and lowercase SHA-256 of the unmodified file bytes, while each
  symlink entry contains normalized path and target. It also contains sorted declared dependencies,
  runtime requirements, and requested-tool requirements. `SkillVersionDigest` is SHA-256 of the
  literal UTF-8 domain separator `opzava.skill-version.v1\0` followed by the JCS manifest bytes.
- Skill paths are Unicode NFC, relative POSIX `/`; absolute paths, `.`/`..`, backslashes, duplicate
  normalized paths, and root-escaping symlinks are rejected. Entries sort by unsigned UTF-8 path
  bytes. File content and symlink targets receive no newline or semantic normalization.
- A tool-schema object contains protocol version, projected/source names, input/output schemas,
  annotations, and capability metadata. Object keys follow JCS; arrays preserve source order.
  `ToolSchemaDigest` is SHA-256 of the literal UTF-8 domain separator `opzava.tool-schema.v1\0`
  followed by its JCS bytes. Digest output is lowercase `sha256:<hex>`.
- Endpoint, transport, SecretRef identity, filters, and policy remain separately pinned by
  binding/policy revision; a schema digest never substitutes for connection identity.

Every producer/consumer advertises the digest protocol version and must reproduce the same bytes in
a conformance fixture before activation. Unknown protocol, normalization disagreement, duplicate
path, or hash mismatch fails closed.

Managed skills use version-addressed immutable paths. On a watcher refresh, remote-node arrival,
source-precedence change, allowlist change, MCP `list_changed`, reconnect, cache invalidation, or
freshness expiry, the trusted adapter revalidates hashes before another turn/call. Added
capabilities are denied. Removed/revoked capabilities are denied immediately. Changed name, content,
or schema is denied immediately. Only independently unchanged, hash-approved capabilities may remain
effective under the pinned manifest. Cached model context or a previously returned tool list grants
nothing.

### Class A — DevTicket implementation runs

PRD-019/ADR-017 owns DevTicket Runner admission. Its **Execution Lease** attaches the capability
manifest and also pins Managed Harness Profile revision, DevTicket/contract revision, repository,
worktree, branch, starting SHA, command nonce/receipt sequence, target, and fence.

The Runner-owned call-time hook verifies the active unfenced lease, manifest/binding/policy
revisions, exact name/current hash, tenant/actor/client/target policy, entitlement/suspension, and
approval immediately before dispatch. A changed required capability checkpoints and pauses the
DevTicket through PRD-019/ADR-017's existing admit/active/checkpoint/pause/fence/reconcile/release
protocol. “Drain/restart” means that owner fences the old capability revision and admits a
reconciled new lease; it never kills an unrecorded process or invents a second lease lifecycle.

### Class B — Ask Admin and other assistant/Gateway sessions

PRD-005 owns Ask Admin and assistant/Gateway session and turn admission. These sessions do **not**
receive a PRD-019 Execution Lease. At Platform Gateway session admission, PRD-005 pins an assistant
**session manifest** (provisional, non-canonical working term using the common capability-manifest
schema) containing assistant/agent configuration revision, model, Skill Set Revision and hashes, MCP
binding/name/schema map, exact positive tool allowlist, effective-policy revision,
tenant/actor/client, Platform Gateway target, session identity, and admission receipt.

Every turn reauthorizes the actor/tenant/session, entitlement/suspension state, assistant policy,
and pinned manifest before model execution. Every tool call then revalidates the exact name/hash,
binding, policy, approval, and current session/turn admission. A dynamic refresh cannot add a tool
or skill to the existing assistant session. If required content/schema changes, becomes
unverifiable, or is removed, the current call is denied and PRD-005 drains/aborts the affected turn
safely. The conversation/transcript may remain, but execution resumes only through PRD-005
reconciliation and a newly admitted Platform Gateway runtime session/manifest; old tool context is
not reused.

Ordinary revision rollout may coexist across unaffected sessions. Security revocation, tenant
suspension, credential revocation, or explicit policy denial blocks the affected assistant call and
turn immediately. If the Platform Gateway cannot enforce version-addressed materialization, per-turn
admission, and call-time proof, the assistant remains tool/skill-empty or must start a new verified
runtime session; no best-effort hot swap is allowed.

### Required tests by admission class

Shared tests cover skill watcher change, remote-node arrival, source-precedence replacement,
agent-allowlist change, MCP `list_changed`, silent reconnect/catalog refresh, added/removed/changed
schemas, unchanged approved hash continuity, digest-protocol/path-order conformance fixtures,
normalization disagreement, stale receipt, and revocation.

DevTicket tests prove the real Runner/managed-harness adapter attaches the manifest to the correct
Execution Lease, checkpoints/fences only the affected run, and reconciles a new lease without moving
assistant sessions into PRD-019. PRD-005 tests prove the real Platform Gateway pins the assistant
manifest at session admission, reauthorizes each turn, validates every call, denies mid-session
widening, drains/aborts the affected turn, preserves allowed transcript continuity, and requires a
newly admitted runtime session before changed capabilities return. Delegation tests omit parent and
child `skills` fields deliberately, exercise default inheritance, inject extra descendant tools, and
prove `agents.defaults.skills: []` plus explicit descendant manifests/effective equality fails
closed.

## Ask Admin skill subset contract

Current truth is an empty set: Ask Admin is provisioned with `skills: []` and cannot load skill
bodies while `read` remains denied. That is a safe, explicit state—not a defect to bypass by adding
the full runtime catalog.

The target subset is a versioned target-policy reference. For a candidate skill `s`, Ask Admin may
invoke it only when all terms hold:

```text
effectiveAskAdminSkill(s) =
  catalogVersionApproved(s)
  AND targetPolicyIncludes(s)
  AND deployedToAskAdminRuntime(s)
  AND runtimeEligibleForAskAdmin(s)
  AND everyToolPrerequisiteIndependentlyAdmitted(s)
  AND tenantActorClientPolicyAllows(s)
  AND NOT deniedRevokedQuarantinedOrDrifted(s)
```

An empty intersection is valid. A skill may be **visible** in the catalog or runtime inventory
without being **callable** by Ask Admin. The product must show this distinction and the safe denial
reason.

[#219](https://github.com/anthonykewl20/opzava/issues/219) remains the owner of exact semantic
membership and skill content. Existing research proposes `opzava-card-authoring`, `opzava-pm`, and
`opzava-reporting`, while `opzava-platform-status` remains unresolved
([WF-221 memo](wf221-ask-admin-v1-skills.md)). This memo does not canonize that proposal or widen
tools for it. #219 must reconcile it with the later user-approved planning flow and prove every
required product-tool seam independently.

### Exact Ask Admin tool-projection safety mechanism

#219 owns skill membership/content, but it does **not** own or weaken this safety mechanism. The
current Mainframe policy pipeline makes `allow` a positive keep-only intersection, applies the
profile first, and lets `coding`/`messaging` admit `bundle-mcp` as every configured bundled MCP tool
([WF-212](wf212-ask-admin-tool-inventory.md)). Ask Admin therefore must never rely on wildcard,
group, bare `bundle-mcp`, or deny-only authority.

The activated policy contains one exact positive keep-only allowlist of every intended model-facing
tool name, including the final projected `<safe-server>__<tool>` names when bundle-MCP projection is
chosen. No other bundled server/tool name survives. `alsoAllow` may be used only to carry those same
exact names through the profile stage; it is not a wildcard or a second authority. An independent
deny-wins list remains defense in depth and cannot be removed merely because the positive allowlist
exists.

Before activation—and after agent policy, profile, projection, MCP definition, schema, Gateway, or
Mainframe changes—a real Platform Gateway `tools.effective` read for the exact Ask Admin agent and
session must equal the pinned expected set, with no unknown, unavailable, or additional tool. The
keep-only allowlist enforces; `tools.effective` proves. A mismatch blocks activation/reconciliation
and leaves the last verified or empty effective set. No catalog or skill text can bypass it.

### Delegated descendant containment

Ask Admin delegation must not widen through omitted configuration. The managed Mainframe config sets
`agents.defaults.skills: []`. The Ask Admin entry and **every** permitted descendant/subagent entry
must then carry an explicit `skills: []` or exact approved skill-name list; omission/inheritance is
invalid. Each descendant also has its own exact positive keep-only model-facing tool allowlist and
independent deny-wins policy. It never inherits the parent's tool or skill surface merely because
the parent can delegate.

Each spawn/delegation admission pins the descendant agent/config revision, explicit skill list,
exact tool-name/schema map, policy revision, parent session/turn, tenant/actor/client, and expiry in
its PRD-005-owned capability manifest. Before its first turn and after any policy/runtime refresh,
the Platform Gateway proves that the descendant's resolved skill snapshot equals the explicit list
and `tools.effective` equals the exact tool set. Missing child config, omitted `skills`, default
inheritance, unknown names, extra capabilities, or an unprovable equality blocks delegation. #216
may own delegation orchestration and #219 skill content, but neither may weaken this containment.

The UI consequence is:

- no “Ask Admin Skills” sidebar leaf;
- the **one canonical edit location** is **AI Runtime → Agents → Ask Admin Opzava → Skill policy**,
  an authorized Agent/Ask Admin target-policy editor semantically owned by PRD-005/#219;
- every other Ask Admin agent-detail summary, capability badge, or effective-state panel is
  read-only; only the explicitly named **Skill policy** subpanel mutates the target policy;
- the pinned Ask Admin chat exposes only a read-only capability/effective-state projection with
  missing prerequisites, last reconciliation, and deep links to that canonical editor or the owning
  catalog/runtime record;
- catalog/version changes deep-link to Engineering Skills or Runtime Skills;
- Engineering Skills, Runtime Skills, Overview, and the chat cannot edit the Ask Admin skill subset;
- a chat request to change its own skills or tools can draft an approval request but cannot execute
  an admin mutation with the hot-path assistant credential.

## MCP Servers contract

### Definition versus consumer binding

An MCP Server Definition contains safe logical identity and connection metadata. A separate MCP
Consumer Binding projects one immutable definition revision to one consumer:

- Lead Orchestrator / Platform Gateway;
- enrolled local Codex managed harness profile;
- enrolled local Claude managed harness profile;
- a later supported cloud harness only when explicitly designed.

Each binding records its own:

- tenant, actor/client scope, target identity, and target compatibility;
- SecretRefs or consumer-native OAuth state reference;
- enabled state, allow/deny tool filters, approvals, concurrency/timeouts, and policy revision;
- applied definition/config revision and idempotency key;
- static validation, connection, advertised-tool, schema-diff, and effective-policy results;
- probe freshness and redacted receipt;
- previous verified revision and rollback eligibility.

One healthy orchestrator binding does not make a local binding healthy. One target's OAuth token or
SecretRef is not copied to another target. One consumer may admit a read-only tool while another
denies it.

### Supported transports and the secret gap

Mainframe's outbound registry supports stdio, SSE/HTTP, streamable HTTP, OAuth, TLS/mTLS, tool
filters, and Codex projection. That is capability evidence, not permission to persist raw values.

The inspected core `mcp.servers` schema still represents stdio environment values and HTTP headers
as literal strings. A consumer-specific ACPX configuration supports `SecretInput`, but that does not
make the universal registry SecretRef-safe. Therefore:

> Opzava must fail closed for authenticated core MCP provisioning until the adapter can resolve
> SecretRefs at the consumer boundary or use a consumer-native secure OAuth store. Plaintext env,
> headers, URLs, copied JSON, or generated setup commands are not an acceptable fallback.

This is an explicit downstream implementation seam, not a reason to weaken PRD-013.

### Setup flow

The Add MCP Server form follows one top-to-bottom flow:

1. **Identity** — name, purpose, source/vendor, documentation, ownership, and transport.
2. **Endpoint/command** — safe non-secret URL or allowlisted stdio package/command/cwd. Remote HTTPS
   is the default. Stdio is treated as code execution and requires package/source/hash/command
   allowlisting plus target sandboxing.
3. **Targets** — select orchestrator and/or already-enrolled compatible managed harness profiles.
4. **Authentication** — select existing SecretRefs or complete consumer-native OAuth. Never display
   or round-trip values.
5. **Tool policy** — inspect declared tools as untrusted input; set deny-wins filters and approvals
   per consumer. New or materially changed tool schemas are quarantined until assessed.
6. **Validate** — schema, transport, target compatibility, SSRF/DNS/redirect/TLS, executable,
   working-directory, auth-reference health, and policy checks.
7. **Dry-run plan** — show exact per-consumer config diff, tools added/removed/changed, permissions,
   restart needs, and rollback eligibility without resolving secrets into the response.
8. **Approve and apply** — authorized, idempotent worker jobs apply each consumer binding.
9. **Probe and activate** — run a live per-consumer connection/capability probe; activate only the
   verified binding. Partial outcomes remain partial and actionable.

The form contains every explanation, requirement, validation error, and approval consequence the
human and assistant need to agree. A documentation link may be offered, but setup cannot require
tab-juggling to understand Opzava's contract.

Remote probes and calls resolve DNS under the target's egress policy on each connection and
redirect, reject loopback/link-local/private/metadata destinations unless an explicit private
endpoint policy permits them, cap redirects and response sizes, and preserve TLS hostname and
certificate validation. Stdio bindings run only inside the target sandbox with a minimal
environment, bounded CPU/memory/time/output, no implicit shell expansion, and the exact approved
executable/package hash. These controls are enforced by transport adapters; a form validation result
alone is not a security boundary.

### Health model

Never collapse health into one green/unknown pill. For each consumer show:

| Dimension                   | Questions answered                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Definition/config health    | Is the selected immutable revision valid for this transport and target? Is observed config drifted?  |
| Credential-reference health | Does the SecretRef/OAuth reference exist, remain authorized, and need rotation? No value is exposed. |
| Connection health           | Did this consumer connect successfully, when, and with what bounded error category?                  |
| Capability health           | Were tools listed? Did names or schemas change? Are new tools quarantined?                           |
| Effective-policy health     | Which advertised tools are effective, denied, approval-gated, or incompatible for this actor/client? |
| Freshness                   | When was the observation made, what revision did it test, and is it now stale?                       |

`status`-style saved-configuration classification, `doctor`-style static checks, and live `probe`
evidence are different facts. “Healthy” requires a fresh live receipt for the active revision and a
non-denied effective state; stale, unknown, or unverified must not render healthy.

### Update and rollback

Editing creates a new immutable MCP Server Definition revision and new consumer-binding plans. It
does not mutate active bindings in place. The preview names endpoint/transport/auth-reference/tool
schema/policy/restart changes separately.

Activation is target-atomic. DevTicket runs pin the binding through their Execution Lease; PRD-005
assistant/Gateway sessions pin it through their assistant session manifest and session/turn
admission. Neither active class acquires newly advertised tools silently. On partial multi-target
rollout, successful bindings retain their explicit revision and failed bindings retain the last
known applied revision; the aggregate is `partial` with repair/rollback choices.

Rollback creates a new binding revision from a retained previous verified definition and policy. It
is blocked when credentials are revoked or missing, the old endpoint is unsafe/unreachable, the
target is incompatible, the artifact/command is no longer verifiable, or the previous tool schema
would violate current policy. Rollback never restores secret values from logs or history.

### Teardown and credential cleanup

Teardown is a first-class, per-consumer state machine rather than “delete the row”:

1. **Disable** denies new admission for the binding while retaining its definition and receipts. A
   DevTicket Execution Lease may drain only when policy, entitlement, credential, and security state
   still allow it and an explicit deadline exists; otherwise it is fenced. A PRD-005 assistant
   session denies the binding at its next turn/call check and safely drains/aborts an affected
   in-flight turn under PRD-005.
2. **Revoke or unbind** immediately removes the binding from effective policy, denies new calls,
   fences dependent DevTicket leases, drains/aborts dependent assistant turns/sessions, retires the
   target MCP runtime/process tree, and records why the hard stop occurred.
3. **Logout/detach credentials** distinguishes local credential removal from upstream revocation.
   Clearing consumer-native OAuth state produces `local-credential-cleared`; it may claim
   `upstream-token-revoked` only after a supported provider revocation call is independently
   verified. Unsupported/failed upstream revocation remains explicit while the binding stays
   non-effective. Detaching a SecretRef does not delete or rotate a shared secret; destructive
   secret action requires its own dependency check and approval.
4. **Remove/unset** is allowed only after dependent DevTicket leases and PRD-005 assistant
   sessions/turns are drained, fenced, or reconciled and target cleanup is observed. It removes
   desired target config but retains a non-secret tombstone, revision history, receipts, and audit
   references.
5. **Reconcile** observes the target after reload/restart/cleanup. Config removed but process alive,
   process stopped but OAuth retained, target offline, credential cleanup failed, or receipt write
   failed are explicit `partial-cleanup` states with idempotent retry from the last confirmed step.

Every step is tenant/target scoped, idempotent, audited, and safe to replay. Aggregate removal is
not complete until every selected consumer has a verified teardown receipt. No cleanup path
resurrects an older binding, exposes a credential, or silently lets an active run/session keep
calling a removed tool.

Teardown tests cover both admission classes, graceful disable and hard revoke, offline consumers,
process/config cleanup disagreement, shared SecretRef protection, local OAuth clear with successful,
unsupported, and failed upstream revocation, partial receipt persistence, idempotent retry,
tombstone retention, and reconnect reconciliation.

### Explicit exclusions

- Do not revive the closed hosted MCP/OAuth authorization-server design from issue #151.
- Do not expose `openclaw mcp serve` as the product registry.
- Do not register `apps/mcp-server` as if it were the generic Admin catalog. Its legacy Task tool
  migration is owned by Dev Board mapping #237.
- Do not issue Gateway operator/admin tokens to Codex, Claude, a browser, or a third-party MCP
  server.
- Do not treat MCP setup as proof that its tools are effective.
- Do not use the MCP Servers page to enroll a machine, choose the local agent tool, or manage a
  user's global harness configuration.

## Managed local-harness projection

Runner enrollment owns machine authorization, supported tool selection, capability attestation,
lease/heartbeat, and local execution availability. After enrollment, Opzava may materialize an
isolated Managed Harness Profile for Opzava work.

The profile contract is:

- owns immutable capability/configuration revisions for one compatible tool kind/version and Opzava
  workspace scope;
- is generated only after compatibility and policy checks and contains references or narrow runtime
  injection, not browser-visible secret values;
- is fully managed for Opzava work and never overwrites user-global Codex/Claude configuration or
  adopts arbitrary local MCP entries;
- does **not** own Runner identity, lease/heartbeat, repository/process state, or receipts.

The **Execution Lease**, not the profile, pins the profile revision plus model/tool selection, Skill
Set Revision, MCP bindings/schema hashes, effective policy, DevTicket/contract revision, repository,
worktree, branch, starting SHA, target, fence, nonce, and receipt sequence. An offline machine may
retain encrypted cached configuration for later reconciliation, but connectivity loss or lease
expiry fences and pauses execution immediately. There is no offline continuation and no remote
authority expansion. The Runner preserves a checkpoint/summary and triggers the locked Slack
notification; resume requires full lease/process/worktree/SHA/config reconciliation.

This permits the same governed planning and implementation workflow on local or supported cloud
targets later without pretending their files, credentials, tools, or health are the same.

### Trusted local per-call enforcement

An enrolled Runner must launch a **Runner-owned Managed Harness Enforcement Adapter** (provisional,
non-canonical term) for the exact supported Codex/Claude client and version. The adapter is outside
model control and owns the isolated Opzava harness config. It intercepts every local tool call
through a verified native pre-call hook or a Runner-resident loopback policy proxy, and direct
bypass routes are absent or blocked. The proxy is local execution infrastructure for that Runner—not
a public, shared, or hosted Opzava MCP service.

Before forwarding a call, the adapter proves the active unfenced Execution Lease, profile/binding
and policy revisions, exact projected tool name, current approved schema hash, tenant/actor/client,
target, entitlement/suspension state, and required approval. It emits a signed monotonic decision
receipt. Activation depends on server-verified proof of the adapter build, supported client/mode,
configuration ownership, bypass resistance, and real call-time denial canaries.

Self-assertion is insufficient. Opzava issues a single-use, expiring challenge bound to tenant,
Runner enrollment/machine key, proposed adapter build hash, client kind/version, enforcement mode,
profile/policy revision, and nonce. The adapter returns a machine-key-signed response containing
measured build identity and challenge-specific allow/deny canary receipts. The server verifies the
signature, nonce/replay state, enrollment, measurements, and an approved adapter-build ×
client/version × enforcement-mode compatibility matrix before activation.
[#232](https://github.com/anthonykewl20/opzava/issues/232) owns that attestation protocol, trust
matrix, and rotation/revocation lifecycle. #244 consumes the resulting contract and owns only its
Admin enrollment/setup/status/compatibility presentation and repair journey. A
missing/stale/replayed/unapproved challenge or unsupported client/version/mode is incompatible and
cannot receive MCP or skill-dependent execution.

Attestation tests use a real enrolled Runner to prove valid challenge activation and reject forged
machine signatures, replayed/expired nonces, unapproved build hashes, unsupported client versions,
mode mismatch, absent hook/proxy coverage, failed deny canaries, revoked enrollment, and direct
bypass attempts.

### Managed output requirements for #232/#237

Opzava management covers output as well as configuration. The detailed protocol below is an explicit
downstream requirement for Runner/trust Wayfinder
[#232](https://github.com/anthonykewl20/opzava/issues/232) and final Dev Board ticket-graph
synthesis [#237](https://github.com/anthonykewl20/opzava/issues/237); WF-243 does not claim
ownership of the Runner output protocol.

Those owners must specify that the Runner captures typed, tenant/workspace/execution-scoped
envelopes for status transitions, agent worklog entries, command and test evidence, summaries,
failures, and bounded artifact references. Dev Board/execution-ledger owners remain durable product
truth; the harness is only the producer and local retry buffer.

Every envelope carries a monotonically ordered producer sequence, stable event/artifact ID, pinned
harness/skill/MCP/policy revision, timestamp, redaction result, and content hash. Upload is
idempotent and deduplicated. A disconnected Runner may buffer within an encrypted bounded quota and
replay in order after lease revalidation; gaps remain visible and the run cannot claim complete
until required evidence is acknowledged durably. Oversize or disallowed artifacts are rejected with
an explicit safe receipt rather than silently truncated.

Secret detection/redaction runs before persistence or upload. A suspected secret quarantines the
affected envelope/artifact, marks evidence incomplete, stops any gate that requires it, and creates
an attention event without copying the value into logs, Dev Board, Slack, or an audit payload.
Partial upload, duplicate replay, out-of-order delivery, corrupt hashes, revoked leases, and tenant
mismatch are normal fail-closed states with resume/reconcile behavior.

## Cross-cutting security and audit contract

Every read and mutation derives tenant and principal server-side and applies active-tenant, RBAC,
entitlement, target ownership, client, and deny-wins policy. V1 owner/admin permissions may be
expressed through capabilities, but code must not hard-code a forever two-role model. Unauthorized
or cross-tenant reads are hard denials, not empty lists.

### Secrets

- Persist opaque SecretRefs and safe labels/health/rotation metadata only.
- Resolve values only inside the authorized consumer/provisioning boundary after deriving tenant,
  target, and principal server-side; a caller-supplied tenant or cross-target reference is never
  accepted as lookup authority.
- Never return values in DTOs, setup JSON, CLI snippets, copied configuration, validation errors,
  job payloads, audit payloads, logs, telemetry, screenshots, or assistant messages.
- Rotation produces a new binding/deployment revision and a fresh probe; it never mutates history.
- A missing, expired, denied, or unverifiable reference fails closed.

### Untrusted content

Skill source, manifests, documentation, MCP tool names/descriptions/schemas, endpoint redirects, and
installation output are untrusted input. Verification and display must resist prompt injection,
HTML/script injection, path traversal, symlink escape, archive bombs, obfuscation, environment
harvesting, exfiltration, tool-policy bypass, and pipe-to-shell behavior.

### Audit

Record who/what/tenant/target acted, request and idempotency IDs, old/new safe revision IDs and
hashes, policy/approval result, redacted diff summary, timestamps, worker/consumer receipts, and
failure category. Do not record hidden reasoning or secret values. Detection, assessment, approval,
rejection, apply, activation, probe, repair, rollback, revocation, and quarantine are distinct
auditable events.

### Plan, entitlement, and suspension

The entitlement/billing owner supplies decisions; none of these pages invents plan semantics.
Catalog visibility, configured definitions, target bindings, active skill counts, MCP limits, probe
admission, and execution admission consume the current tenant entitlement and safe denial reason. At
a limit, existing owner-permitted metadata may remain visible, but new source detection that would
create candidates, approval, provisioning, binding, activation, or invocation fails closed.

For a suspended tenant, the system fences affected DevTicket Execution Leases, denies new PRD-005
assistant session/turn admission, drains/aborts affected assistant turns under PRD-005, and denies
ordinary skill/MCP mutation, source refresh, install/update/repair/rollback, live probe, runtime
start, and tool invocation. Only redacted safe read-only metadata explicitly allowed by the semantic
owner may be shown; no “read-only” screen may cause a live probe or lazy runtime connection.

Suspension never blocks mandatory platform/security revocation or deprovisioning. A tenant owner may
also request a narrowly authorized, monotonic risk-reducing **cold teardown**: disable/unbind,
revoke admission, clear local credentials or request verified upstream revocation, detach
SecretRefs, and remove desired config. Cold teardown cannot enable/rotate/add a capability,
start/reconnect a runtime, or probe the target. Offline/unclean target work stays `pending-cleanup`
for later reconciliation. Platform/security actions and tenant-requested cold teardown use distinct
audited decision reasons. Suspension does not erase definitions, receipts, or history.

Recovery is never automatic resume. After the entitlement owner restores eligibility, Opzava
reauthorizes the actor/target, reconciles Runner and Platform Gateway state, revalidates SecretRefs,
reruns fresh configuration and capability probes, re-evaluates effective policy, and requires a new
DevTicket Execution Lease or new PRD-005 assistant session/turn admission before work continues.
Stale pre-suspension health cannot become healthy merely because the billing flag cleared.

Suspension tests prove ordinary tenant mutation/probe/invocation denial, owner-permitted redacted
reads without lazy connections, mandatory platform security revocation, tenant-authorized cold
disable/unbind/credential clear/remove without runtime start, offline pending cleanup, rejection of
any enabling/rotation action, and fresh owner-specific readmission after restoration.

## Sad-path matrix

| Area               | Sad path                                                                                                       | Required behavior                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering source | Upstream is unreachable, deleted, rewritten, or returns mutable identity only                                  | Preserve current approved revision, mark source/update check degraded, and block new candidate activation.                                                                              |
| Engineering source | Fork diverges or update conflicts with Opzava patches                                                          | Produce an explicit conflict/diff assessment; no automated merge into the active catalog.                                                                                               |
| Catalog            | Two sources claim the same canonical name                                                                      | Quarantine the candidate and require an explicit ownership/provenance resolution.                                                                                                       |
| Catalog            | Checksum, signature, license, manifest, dependency, requested-tool, or install-policy verification fails       | Fail closed; show a safe report; do not stage or materialize content.                                                                                                                   |
| Catalog            | Upstream candidate adds a tool prerequisite                                                                    | Keep candidate inactive until that tool is independently configured and policy-approved; approval of the skill cannot grant it.                                                         |
| Deployment         | One target applies and another is offline/fails                                                                | Record per-target receipts and aggregate `partial`; never roll the successful target forward or back invisibly.                                                                         |
| Deployment         | Local Runner disconnects mid-apply                                                                             | Do not assume the file state. Mark unknown/stale, preserve desired revision, require observe/reconcile after reconnect, and notify through the owning attention path.                   |
| Deployment         | DevTicket run is pinned to the old skill set but a watcher/remote-node/precedence refresh occurs               | Continue only from immutable content matching its Execution Lease manifest; otherwise deny the change and checkpoint/fence through PRD-019/ADR-017.                                     |
| Deployment         | Runner connectivity or Execution Lease is lost                                                                 | Fence and pause immediately. Cached configuration may remain for recovery, but no offline continuation is allowed.                                                                      |
| Assistant session  | Ask Admin/assistant session sees a skill or MCP refresh during/between turns                                   | Revalidate the PRD-005 session manifest; deny widening/changed calls, safely drain/abort the affected turn, and require a newly admitted runtime session before changed capability use. |
| Harness output     | Output is duplicated, out of order, partially uploaded, corrupt, oversize, or contains a suspected secret      | Deduplicate/order by stable envelope identity, keep required evidence incomplete, quarantine secret-bearing content, and resume/reconcile without leaking or silently truncating it.    |
| Rollback           | Previous version is revoked, compromised, incompatible, or missing                                             | Block rollback and offer a new verified candidate/repair path.                                                                                                                          |
| Runtime            | Gateway unavailable or receipt stale                                                                           | Show unavailable/stale, not disabled or healthy; mutation remains retryable through the worker path.                                                                                    |
| Runtime            | Native source precedence shadows an approved version                                                           | Report drift/collision and make the skill non-effective until reconciled.                                                                                                               |
| Runtime            | Platform Gateway discovers an uncataloged native skill                                                         | Show a read-only candidate; keep it non-effective until `SkillCatalogPort` verifies and approves an immutable version.                                                                  |
| Runtime            | Skill is installed but agent-filtered, dependency-missing, or policy-denied                                    | Show installed separately from callable and provide the exact safe denial reason.                                                                                                       |
| Runtime teardown   | Target is offline or file/cache/process/dependency/SecretRef cleanup is partial                                | Make the skill non-effective, preserve tombstone/per-step receipts, protect shared resources, and reconcile idempotently before `removed`.                                              |
| Ask Admin          | Exact subset has not been approved                                                                             | Effective set remains empty. Do not fall back to all Runtime or Engineering Skills.                                                                                                     |
| Ask Admin          | Skill body requests shell/filesystem/tool access                                                               | Ignore prose as authority; independent deny-wins policy decides. Draft an approval request only if the workflow allows it.                                                              |
| Ask Admin          | Chat asks to mutate its own skill/tool policy                                                                  | The hot-path assistant cannot self-escalate; route to an audited human approval/job flow.                                                                                               |
| Ask Admin          | `bundle-mcp`, wildcard/group policy, unknown projection name, or `tools.effective` mismatch would widen tools  | Block activation; require the exact positive keep-only projected-name allowlist, independent deny-wins policy, and exact live effective-set proof.                                      |
| Ask delegation     | Parent/descendant omits `skills`, inherits defaults, or resolves extra skill/tool names                        | Require `agents.defaults.skills: []`, explicit child policies, pinned descendant manifest, and exact effective equality; otherwise block delegation.                                    |
| MCP secret         | SecretRef missing, expired, unauthorized, or unsupported by the target adapter                                 | Fail closed before apply/probe. Never substitute a literal value.                                                                                                                       |
| MCP transport      | URL resolves to private/loopback metadata space, changes DNS, redirects unsafely, or fails TLS/mTLS validation | Reject or quarantine under SSRF/DNS/redirect/TLS policy; never follow blindly.                                                                                                          |
| MCP stdio          | Executable/package/hash/cwd is missing, changed, or not allowlisted                                            | Block apply; treat as code execution; show a safe validation result.                                                                                                                    |
| MCP capability     | Server adds, removes, or changes a tool during a DevTicket run or assistant session                            | Deny added/removed/changed names immediately; only independently re-listed, unchanged, schema-hash-approved tools may remain under that class's pinned manifest.                        |
| MCP consumer       | Orchestrator is healthy but local harness fails                                                                | Show separate results. Do not infer, copy credentials, or call the definition globally healthy.                                                                                         |
| MCP policy         | Advertised tool is denied or approval-gated                                                                    | Preserve the server connection while projecting the correct effective tool status.                                                                                                      |
| MCP apply          | Target disconnects or config write succeeds but metadata/receipt write fails                                   | Mark outcome unknown/partial, preserve idempotency and observed revision, and reconcile before retry.                                                                                   |
| MCP teardown       | Config, runtime/process, OAuth/SecretRef detach, or receipt cleanup succeeds only partly                       | Preserve per-step/per-consumer receipts, deny/fence the binding, and idempotently reconcile; never report removed while a call path or credential binding remains.                      |
| MCP logout         | Local OAuth state clears but upstream token revocation is unsupported or fails                                 | Keep the binding non-effective; report local clear/upstream revocation separately; never claim upstream revocation without verification.                                                |
| MCP rollback       | Prior credential has been revoked or prior endpoint now violates policy                                        | Block rollback; do not resurrect secret material or unsafe configuration.                                                                                                               |
| Local enforcement  | Signed challenge is stale/replayed, build/client/mode is unapproved, or a bypass canary fails                  | Server rejects attestation/activation; never accept Runner self-assertion or fall back to model-owned config.                                                                           |
| Authorization      | User lacks tenant/target capability or attempts cross-tenant reference                                         | Hard deny and audit safely; do not return an empty inventory or leak existence.                                                                                                         |
| Entitlement        | Skill/MCP count, target, probe, or execution exceeds the tenant plan                                           | Preserve owner-permitted read-only metadata, block the new admission/mutation/probe/invocation, and show the safe entitlement reason.                                                   |
| Suspension         | Tenant becomes suspended while bindings, DevTicket runs, or assistant sessions exist                           | Fence/deny work; allow mandatory security deprovision and authorized cold risk-reducing teardown without runtime/probe; require owner-specific readmission after restoration.           |
| Freshness          | Probe tested an old definition/policy revision                                                                 | Render stale/unverified and require a probe of the active revision before healthy/active status.                                                                                        |

## User-level acceptance contract

This Wayfinder child is resolved only if downstream specifications preserve all of the following:

1. A fresh Admin can open Engineering Skills and select approved versions from the single
   platform-owned canonical Opzava fork, with immutable upstream provenance and no tenant fork, PAT,
   or mutable-branch execution. Any mirror/cache is invisible as authority.
2. Upstream change detection creates a candidate with a meaningful security/tool/dependency diff; it
   does not change active skills, new executions, or current runs until explicit approval and target
   activation.
3. An owner/admin can stage one verified Skill Set Revision to the orchestrator and an enrolled
   managed local harness, see separate receipts, detect partial rollout, and roll back each eligible
   target without deleting history.
4. Runtime Skills shows OpenClaw-native source, installation, eligibility, agent filtering,
   dependency, security, drift, and effective-callability state without claiming catalog authority.
5. A skill installed/discovered by the Platform Gateway is linked to the same catalog
   identity/version; an uncataloged native entry is read-only and non-effective until approved only
   through `SkillCatalogPort`. Disable/uninstall protects shared dependencies/SecretRefs and reaches
   `removed` only after file/cache/process cleanup is observed, including offline/partial retry.
6. Ask Admin begins with the real current empty subset. After #219 approves content, only the exact
   pinned and effective intersection appears. A skill cannot acquire a denied tool by naming it.
7. Ask Admin activation uses an exact positive keep-only list of pinned model-facing projected tool
   names, independent deny-wins policy, and an exact real `tools.effective` equality proof;
   wildcard, group, bare `bundle-mcp`, unknown, unavailable, or leaked names block activation.
   `agents.defaults.skills: []` plus explicit descendant skill/tool policies prevent delegated
   subagents from widening through omission or inheritance.
8. The sole Ask Admin skill subset editor is AI Runtime → Agents → Ask Admin Opzava → Skill policy.
   The pinned chat is read-only, cannot grant itself skills/tools or receive `operator.admin`, and
   can only explain/deep-link/draft a separately authorized request.
9. A human can add one logical MCP Server Definition and target both Lead Orchestrator and an
   enrolled local Codex/Claude Managed Harness Profile while seeing different SecretRefs, policies,
   receipts, effective tools, and health for each binding.
10. MCP setup validates endpoint/command, SecretRef, SSRF/TLS, target compatibility, tool schemas,
    policy, dry-run diff, apply receipt, and live probe before activation. It never prints a secret.
11. A healthy connection with policy-denied tools is not misrepresented as fully effective; stale or
    old-revision probe data is not healthy.
12. A DevTicket Execution Lease pins its exact capability manifest. A watcher/remote-node/precedence
    refresh or dynamic MCP catalog cannot widen it; changed required capability checkpoints/fences
    only the affected run through PRD-019/ADR-017. Provisional digest fields use the specified
    versioned RFC-8785/path-ordering protocol and conformance fixtures.
13. A PRD-005 Ask Admin/assistant Platform Gateway session pins an equivalent manifest at session
    admission, reauthorizes it each turn, and validates each call. Changed capabilities deny and
    drain/abort the affected turn; use resumes only through a newly admitted runtime session.
14. Disable/revoke/unbind/logout/remove tears down each MCP consumer, credential binding, runtime,
    dependent DevTicket lease, and assistant session/turn safely, with idempotent partial-cleanup
    reconciliation and non-secret history. Local OAuth credential clearing is distinct from
    independently verified upstream-token revocation.
15. The Managed Harness Profile contains immutable capability/config only. The Execution Lease pins
    profile/model/tool/skill/MCP/policy/repository/worktree/branch/SHA/receipt state.
16. A local Runner outage or lease loss fences and pauses immediately with a checkpoint, observed
    summary, and Slack attention. Cached configuration may remain, but there is no offline
    continuation or automatic cloud failover.
17. A local harness receives capabilities only after Opzava verifies a machine-key-signed one-time
    challenge against the #232-owned adapter-build × client/version × enforcement-mode matrix and
    denial canaries. #244 consumes that trust contract for Admin enrollment/setup/status,
    compatibility presentation, and repair. The provisional Runner-local adapter then proves lease,
    name, schema, policy, entitlement, and approval on every call; it is not a hosted MCP service.
18. The output-envelope requirements are handed to #232/#237: status, worklogs, command/test
    evidence, summaries, failures, and bounded artifacts are redacted, revision-pinned, durably
    acknowledged, idempotently replayable, and visibly incomplete when required evidence is missing.
19. Opzava never overwrites the user's global local-agent configuration and never exposes Gateway
    operator/admin credentials to browsers, harnesses, skills, or MCP servers.
20. No public hosted Opzava MCP/OAuth service is created; `openclaw mcp serve` and the legacy Task
    MCP remain explicitly outside this target registry.
21. Plan limits block excess approval/provisioning/binding/probe/invocation while preserving only
    owner-permitted safe metadata and a clear entitlement reason.
22. Suspension fences DevTicket leases, denies new assistant session/turn admission, drains/aborts
    affected assistant turns, and blocks ordinary mutation, live probe, runtime start, and
    invocation. Mandatory security deprovision and authorized monotonic cold teardown remain
    available without starting/probing runtime. Restoration requires fresh proof and owner-specific
    readmission—never automatic resume.
23. Unauthorized, cross-tenant, revoked, compromised, drifted, partially applied, and unverifiable
    states fail closed and have explicit repair/rollback/approval behavior.
24. Every later implementation slice separately proves DevTicket Execution Lease manifests, PRD-005
    assistant/descendant session/turn manifests, digest conformance, server-verified local
    attestation, Runtime Skill and MCP teardown, OAuth local-clear/upstream-revoke distinction,
    active refresh fencing, suspension/cold teardown/recovery, health, denial, and rollback on the
    real local Docker stack with user-level E2E and redaction assertions; mock-only proof is
    insufficient.

## Inputs required by final synthesis #246

#246 should carry forward the following as hard boundaries:

- keep the four canonical concepts separate and retain their locked Admin placement;
- keep the memo's working subterms explicitly provisional until #246 either adds them to the domain
  glossary through the normal domain-modeling change or selects equally unambiguous canonical terms;
- preserve `SkillCatalogPort` and introduce explicit deployment/reconciliation, effective-policy,
  MCP-registry, SecretRef, Mainframe/Platform-Gateway, and managed-harness seams;
- treat upstream automation as detection only, with immutable provenance and explicit activation;
- reconcile canonical skill membership and the single platform-owned Opzava fork setup, including
  tenant version/rollout selection and user-approved names absent from the pinned upstream tree;
- consume #219 for exact Ask Admin skill membership/content and do not use this memo to bypass its
  tool-policy dependencies or the exact positive-allow/deny-wins/`tools.effective` mechanism;
- require `agents.defaults.skills: []`, explicit Ask Admin descendant skill/tool policies, pinned
  child manifests, and exact skill/tool effective equality across #216/#219 delegation work;
- give Engineering Skills, Runtime Skills, and MCP Servers distinct page contracts and keep Ask
  Admin skill subset projections read-only/deep-linked rather than creating another page;
- design the core MCP adapter gap for SecretRef-safe provisioning before supporting authenticated
  external servers; never fall back to literal config;
- preserve per-consumer MCP bindings and per-target deployment receipts, health, update, partial,
  repair, rollback, disable/revoke/unbind/logout/remove, credential cleanup, and active-lease plus
  assistant-session teardown semantics;
- preserve Runtime Skill file/cache/process/shared-dependency/SecretRef teardown and distinguish
  local OAuth credential clear from verified upstream-token revocation;
- carry two version-addressed admission contracts into downstream tickets: capability manifests
  attached to PRD-019/ADR-017 DevTicket Execution Leases, and equivalent PRD-005-owned Ask
  Admin/assistant session-and-turn manifests. Both require schema/content hashes, call-time
  enforcement, unchanged-only continuity, owner-specific drain/reconciliation, and real tests;
- keep Managed Harness Profile configuration separate from Execution Lease/Runner state; require
  #232's server-verified signed-challenge, approved-build/client/mode matrix, and attested
  Runner-owned local enforcement adapter before activation; and constrain #244 to consuming that
  trust contract for Admin enrollment/setup/status/compatibility presentation and repair;
- carry the Managed Harness output-envelope, durable acknowledgment, replay, artifact-limit,
  ordering/deduplication, redaction/quarantine, and incomplete-evidence contract into Runner and Dev
  Board tickets #232/#237 as a downstream requirement, not a WF-243-owned protocol;
- consume plan/entitlement/suspension decisions from their owner and include read-only, hard-denial,
  mandatory security deprovision, tenant-authorized cold teardown without runtime/probe, recovery,
  and real E2E contracts;
- explicitly retire hosted-MCP issue #151 and route legacy Task MCP disposition through Dev Board
  mapping #237;
- include the sad paths and user-level acceptance gates above in implementation tickets, with real
  Docker-stack E2E proof and audit/redaction checks.

## Evidence inspected

Primary repository evidence used for this resolution:

- [`CONTEXT.md`](../../../CONTEXT.md)
- [PRD-005 — Assistants Chat](../../prd/PRD-005-assistants-chat.md)
- [PRD-007 — Knowledge & Skills](../../prd/PRD-007-knowledge-skills.md)
- [PRD-013 — Connections & Tools](../../prd/PRD-013-connections-tools.md)
- [PRD-019 — Dev Board](../../prd/PRD-019-dev-board.md)
- [PRD-020 — Admin Control Center](../../prd/PRD-020-admin-control-center.md)
- [ADR-017 — Dev Board authority, sync, and execution](../../adr/ADR-017-dev-board-authority-sync-execution.md)
- [Admin foundation decisions](../admin-control-center-foundation-decisions.md)
- [WF-212 Ask Admin tool inventory and exact-allow analysis](wf212-ask-admin-tool-inventory.md)
- [WF-221 Ask Admin skills research](wf221-ask-admin-v1-skills.md)
- [WF-242 Admin route audit](wf242-admin-route-ownership-migration-audit.md)
- `apps/workers/src/provisioning/ask-admin-agent.ts`
- `apps/mcp-server/src/server.ts` and `apps/mcp-server/src/tools.ts`
- `packages/ports/src/openclaw-gateway.ts`
- `mainframe/src/skills/**`
- `mainframe/src/gateway/server-methods/skills.ts`
- `mainframe/src/gateway/methods/core-descriptors.ts`
- `mainframe/src/config/types.mcp.ts`, `mainframe/src/config/mcp-config.ts`, and
  `mainframe/src/config/zod-schema.ts`
- `mainframe/src/agents/cli-runner/bundle-mcp-codex.ts` and
  `mainframe/src/agents/cli-runner/bundle-mcp-claude.ts`
- `mainframe/docs/tools/skills.md`, `mainframe/docs/cli/mcp.md`, and
  `mainframe/docs/gateway/secrets.md`
- [`mainframe/UPSTREAM.md`](../../../mainframe/UPSTREAM.md), including its 2026-07-04 fork pin;
- current [official OpenClaw Skills](https://docs.openclaw.ai/tools/skills) and
  [MCP](https://docs.openclaw.ai/cli/mcp) documentation, checked 2026-07-17;
- the immutable upstream Engineering Skills snapshot linked above.

No product code, canonical PRD/ADR, domain glossary, or tracker state is changed by this memo.
