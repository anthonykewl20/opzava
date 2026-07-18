# WF-235 — Lock archive, retention, exceptional redaction, tombstone, and revocation across the four ledgers

Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #237.

**Ticket:** [#235 — Lock archive, retention, exceptional redaction, tombstone, and revocation behavior](https://github.com/anthonykewl20/opzava/issues/235) · map [#228](https://github.com/anthonykewl20/opzava/issues/228)
**Status:** resolved research input for final synthesis [#237](https://github.com/anthonykewl20/opzava/issues/237). No product code, schema, or migration is implemented or authorized by this memo.
**Authoritative sources consumed:** `docs/plan/dev-board-foundation-decisions.md` (DBF ledger), `docs/adr/ADR-017-dev-board-authority-sync-execution.md`, `docs/plan/research/wf230-devticket-command-model.md`, `docs/plan/research/wf231-github-mirror-contract.md`, `docs/plan/research/wf232-runner-control-protocol.md`, ticket #235 (+ readiness comment), map #228. Every claim below cites `file:line` or issue.
**Scope boundary (consumed, not reopened):** #230 owns the DevTicket command surface and the **DevTicket/Proposal archive overlay + restore commands** (`wf230:1549-1600`, `wf230:1889-1890`). #231 owns the GitHub mirror, **GitHub Disconnect Saga**, and provider credential cleanup choreography (`wf231:376-406`). #232 owns the Runner trust protocol and the **Lease Secret Broker** grant/disposal contract (`wf232:233`, `wf232:2645-2793`). wf230 explicitly assigns **retention/redaction to #235**, Sprint Archive/Restore to #233, and Docs archive semantics to #234 (`wf230:1597-1600`); wf232 concurs that "#235 owns final retention policy" (`wf232:178`). This memo owns only the **cross-ledger retention, exceptional redaction, tombstone, restore-gating, partial-failure, and revocation policy** that those owners must consume. It does not redefine their internals.

> Map rule honored: #230/#231/#232 are **current input** for #235/#237 until #237 consumes and freezes them (#228 body, "Current Wayfinder inputs"); their decisions are consumed, not reopened. Q17 and #147–#157 are superseded/quarantined historical evidence (`CLAUDE.md`, `dev-board-foundation-decisions.md:308` DBF-187) and are **not** a source of authority here.

---

## The four ledgers and their durability baseline (the substrate)

The four cross-linked ledgers and their per-ledger durability are already locked (`dev-board-foundation-decisions.md:284-288` DBF-173–177; `ADR-017:546-565`):

| # | Ledger | Owns | Durability / retention (locked) | Authority |
|---|---|---|---|---|
| 1 | **Planning decision** | questions, recommendations, human decisions, rejected alternatives, unresolved items, contract/Plan revisions, document versions (DBF-173) | **Durable, no routine TTL**; versioned Markdown mirror (`ADR-017:546-547`) | Opzava planning/Docs |
| 2 | **Dev Board activity/history** | accepted commands, transitions, assignments, dependencies, approvals, comments, Review verdicts, Done facts (DBF-174) | **Immutable and durable**; human-readable GitHub mirror (`ADR-017:548-549`) | Opzava Dev Board |
| 3 | **Runner execution/checkpoint** | leases, fences, nonces, signed receipts, sequences, heartbeats, commands, worktree/branch/SHA, Docker state, checkpoints, reconciliation (DBF-175) | **Accepted receipts/checkpoints/evidence refs relied on by gates or history are durable; high-volume raw telemetry may expire under a defined TTL** (`ADR-017:549-552`) | Runner originates/owns raw local observations; Dev Board persists accepted facts |
| 4 | **Synchronization/outbox/conflict** | webhook deliveries, event dedupe, outbound attempts, provider confirmations, health, reconciliation, conflict decisions (DBF-176) | **Outbox, delivery dedupe, conflict decisions, and final delivery confirmations are durable; non-authoritative normalized diagnostic detail may age out after its named replay/audit window; no raw webhook/retry request body persists** (`ADR-017:553-558`) | Dev Board integration module |

The ledgers "cross-link by stable IDs but do not share a fictional global order or identical retention" (`ADR-017:564-565`; DBF-177). Retention "can expire raw logs without deleting contracts, approvals, relied-upon evidence, or synchronized work history" (`ADR-017:617-618`).

---

## DECISION TENSIONS AND RECONCILIATION

- **Immutability vs command overlay sequencing:** foundation lock requires immutable evidence/durable histories while command docs require explicit restore/overlay guards and execution gating; policy sequencing must first satisfy DevBoard restore/cleanup gates before any runner/provider rerun is considered complete (`dev-board-foundation-decisions.md:173-180`, `wf230:1585-1596`, `wf230:363-369`).
- **Concrete behavior vs unresolved policy details:** PRD requires testable concrete retention and exceptional redaction behavior, while #235 currently holds explicit numeric/shape gaps for TTLs and schema; these remain open to owner lock instead of being inferred from fixed defaults (`docs/prd/PRD-019-dev-board.md` "Retention" and "Exceptional redaction...", `wf230:295-296`, `wf230:297`).
- **Authority split vs operational seams:** ADR-017 requires DevBoard authority for command state and GitHub as a projection target, so execution must not permit command mutations by projection actors even when GitHub mirrors move; this tension is resolved by constraining command authority to secure/board channels and keeping provider synchronization in explicit outbox states (`ADR-017:564-565`, DBF-016 `42`, DBF-118 `199`, `wf230:253-254`, `wf231:667`, `wf231:716-717`).
- **Restore ordering vs clean-up finalization:** governance cleanup must precede or be coupled with re-opened execution readiness; `resolve` / `reconciliation` gates are already modeled as hard-reject when containment or outbox confirmations are missing (`wf230:371-374`, `wf231:400-402`).
- **Dependency ordering:** this policy pass is dependent on #230/#231/#232 as canonical input and must not invert their ordering assumptions; #230 command gates, #231 sync saga idempotence/conflict states, #232 revocation/control-domain semantics are all required before #237 locks final policy (`wf230:1549-1600`, `wf231:376-406`, `wf232:233`, `wf232:2710-2719`, `wf232:2694-2697`).

---

## RESOLVED BY EXISTING DECISIONS

These are settled by the foundation ledger, ADR-017, and #230/#231/#232. #235 inherits and restates them; it does **not** need to re-decide them.

### R1. Archive is a reversible overlay, never a delete or a lane. — `dev-board-foundation-decisions.md:294` DBF-178, `:323` DBF-195; `wf230:625`, `wf230:1551-1583`
Archive is "the normal reversible removal path for Proposals, DevTickets, Sprints, and Docs" (DBF-178) and "the reversible default" (DBF-195). For a DevTicket it is an aggregate lifecycle overlay `archived_at/by/reason/version` that removes the record from active Board queries while preserving `last_active_lane` and all history (`wf230:625`, `wf230:1576-1583`). It is **not** Done, delete, cancelled execution, or a seventh lane (`wf230:625`).

### R2. What stays durable vs. what may expire is fixed by class, not by age. — `dev-board-foundation-decisions.md:295-296` DBF-179/180, `:323` DBF-195
Durable (never expired by retention): approved contracts, comments/worklogs, Sprint history, approvals, conflict decisions, and Review evidence relied on for Done (DBF-179). Expirable under configurable retention: raw logs, token/tool telemetry, temporary previews, large transient artifacts — and expiry "may [occur] without erasing durable summaries" (DBF-180). This maps directly onto the ledger durability table above: planning + activity/history ledgers are durable; runner raw telemetry and sync diagnostic detail are the only expirable classes.

### R3. Exceptional redaction is a coordinated cross-system action that leaves a tombstone; it never rewrites history. — `dev-board-foundation-decisions.md:297` DBF-181, `:323` DBF-195; `ADR-017:560-562`
"Legal or secret-exposure removal coordinates redaction in Opzava and GitHub, revokes affected secrets/tunnels/leases, and leaves a non-sensitive audit tombstone. It does not rewrite history to imply no event occurred" (DBF-181). ADR-017 makes the tombstone obligation concrete: "When legal or security policy requires redaction of a durable record, retain an attributable tombstone and integrity hash rather than silently erasing history" (`ADR-017:560-562`). The obligation therefore has three locked attributes: **attributable**, **integrity-preserving (hash)**, and **non-sensitive/non-erasing**.

### R4. Secret exposure is an Absolute Stop that drives redaction/revocation; it cannot be approved away. — `dev-board-foundation-decisions.md:117` DBF-066, `:211` DBF-125; `wf230:363-369`
Suspected secret exposure is an "absolute unbypassable stop" (DBF-066). DBF-125 fixes the response: pause execution, fence relevant leases, revoke preview and credentials where applicable, notify the Admin, and begin contained redaction/rotation. The DevTicket command model makes this transactional: one Absolute-Stop transaction "marks every affected named credential/secret ref revoked or quarantined; locks and revokes every Lease Credential Access Grant derived from those refs with distinct lease-grant events and external revocation outboxes; and revokes local preview-tunnel authority," and "the stop, local authority revocation, execution fence/Blocked containment, and outbox intents commit together or none commit" (`wf230:363-369`). Resolution requires confirmed revocation/quarantine or safe rotation, confirmed derived lease-grant revocations, preview-tunnel closure, and Runner/worktree/GitHub reconciliation (`wf230:371-374`).

### R5. Provider credential / tunnel / lease revocation is already first-class and idempotent. — `wf232:233`, `wf232:1418-1419`, `wf232:1440-1441`, `wf232:1808-1816`, `wf232:2694-2697`, `wf232:2710-2719`; `wf230:152`, `wf230:363-366`; `wf231:388-406`
- **Lease Secret Broker** exposes `activateGrant`, `revokeGrant`, `confirmDisposition` as first-class operations (`wf232:233`). Grant capability lifecycle is `reserved -> active -> consumed|expired|revoked -> disposed`, where `consumed`/`expired`/`revoked` are terminal authorization states and `disposed` records verified local destruction; "Reboot/disconnect never moves a capability forward by inference" (`wf232:2710-2719`).
- **Lease Credential Access Grant** statuses are explicitly `pending`, `active`, `revocation_pending`, `revoked`, `provision_failed` (`wf230:152`) — revocation is a named state, not an ad-hoc flag.
- **Enforcer orders** `revoke_local_grant` and `close_preview_delivery` are typed, idempotent authority-reducing orders that produce exactly one terminal disposition fact each (`local_grant_disposition_observed`, `preview_delivery_closed`) and replay-safely return the recorded disposition (`wf232:1418-1419`, `wf232:1440-1441`, `wf232:1808-1816`). `fence_lease_enforcer` produces exactly one `lease_enforcer_fenced` (`wf232:1437`).
- **Local disposal and upstream revocation are separate facts**: "`local_grant_disposition_observed` never claims the underlying secret was rotated/revoked. A secret-exposure stop may require both; an ordinary fence normally removes only the derived lease grant" (`wf232:2694-2697`; foundation DBF-246 at `dev-board-foundation-decisions.md:387`). Preview-tunnel authority is revoked on disconnect, lease loss, expiry, Absolute Stop, or explicit close (DBF-132 at `dev-board-foundation-decisions.md:223`; `wf230:365-366`).
- **GitHub provider credential revocation** is a fenced drain saga (R6).

Because every revocation terminates in a recorded disposition and replays return that disposition, revocation is **idempotent by construction** — re-issue is safe and converges. **No new "revocation event type" needs inventing for #235; the policy is to treat each of these as the first-class, idempotent, terminal-disposition events they already are.**

### R6. GitHub credential revocation is a durable, fail-closed saga; a `202` is not "revoked." — `wf231:376-406`; `ADR-017:625-632`; `wf231:203`, `wf231:216`
`DisconnectGitHub` is a durable saga keyed by binding generation, not a local delete. It fences the outbound outbox, drains claimed/possibly-sent intents, chooses uninstall-vs-revoke from credential ownership and policy, and enters `provider_outcome_unknown` on an ambiguous response or `revocation_required` when a human provider action is needed (`wf231:376-402`). Local token/key/ref destruction is permitted **only** on provider-confirmed uninstall/revocation/expiry; a refresh-token revoke `202 Accepted` is an unconfirmed acceptance, so "the refresh cleanup handle remains quarantined until its recorded provider-issued expiry" (`ADR-017:631-632`; `wf231:336-341`). Final `disconnected` requires outbound drain + provider outcome + local cleanup + retained-history proofs in one compare-and-set finalizer (`wf231:400-402`). Reconnect never revives the prior binding (`wf231:403-406`).

### R7. Restore is a governed command; restored active work requires a fresh Ready approval, never reactivation of the old one. — `wf230:1585-1596`, `wf230:1889-1890`, `wf230:649-663`, `wf230:722-726`
- **DevTicket:** `RestoreDevTicket` is an authorized command requiring "authority, safe disposition, exact archive/target queue versions" (`wf230:1890`). A non-Done DevTicket restores to the Backlog anchor "with no current Execution Assignee/preassignment, claim, lease, or active approval. Prior approval and assignment stay historical; restore never reactivates either, and current Ready must be validated and approved again before a fresh governed claim" (`wf230:1587-1590`). A reconciled Done restores **only to the Done history view** and "never becomes executable by restore" (`wf230:1591-1592`). So **"restore requires explicit approval + new revision" is already locked for DevTickets**: the restore command itself is authority-gated, and any post-restore execution demands a brand-new Ready approval/contract version.
- **Proposal:** `RestoreProposal` "only removes its archive overlay" and "never grants a second decision" — terminal Accepted/Merged/Rejected stays terminal; Draft/AwaitingDecision resumes (`wf230:649-655`, `wf230:722-726`).
- **GitHub binding uniqueness survives archive:** the binding registry enforces unique `(repository_id, issue_number)` ownership "across active, archived, and historical DevTickets" (`wf230:671-672`), so archive/restore cannot orphan or double-bind a GitHub Issue.

### R8. Intra-ledger writes are atomic; cross-ledger consistency is eventual via outbox/saga/reconciliation, never a fictional global commit. — `wf230:612-613`, `wf230:363-369`; `wf231:400-402`; `ADR-017:564-565`, `ADR-017:588-591`; DBF-095–102 at `dev-board-foundation-decisions.md:166-173`
A database error "rolls back the receipt and every domain/ledger/outbox write together" (`wf230:612-613`), and the secret-exposure transaction commits local authority revocation + fence + outbox intents atomically or not at all (`wf230:363-369`). Across systems, the durable outbox (DBF-101) and the disconnect saga (`wf231:400-402`) carry effects to providers; "there is no global order across Opzava, GitHub, Slack, OpenClaw, and local runners" and inconsistency "triggers reconciliation" (DBF-097, `dev-board-foundation-decisions.md:168`). GitHub downtime leaves last-confirmed Opzava data readable while gates requiring confirmed history wait (DBF-102). **Therefore partial-failure is structural, not exceptional**: each ledger is independently consistent; cross-ledger drift is reconciled, and a single inconsistent ledger blocks only the capabilities that depend on it (DBF-196 at `dev-board-foundation-decisions.md:324`; R8 of the edge audit).

## Crisp decision for each question in #235

The ticket's own readiness comment asks for "a one-page retention/revocation matrix across ledgers, authority, and partial-failure behavior," a "precise tombstone schema and explicit restore workflow," and "provider credential revocation as first-class, idempotent event flow." Decisions below are the #235-level lock; where authority already settles it, the decision is "consume X"; where it does not, the decision names the locked target and the open residual is filed under OPEN DECISIONS.

### Q-ARCHIVE — Archive behavior across the four ledgers and the command/runner/GitHub seams
**Decision:** Archive is a reversible per-aggregate overlay owned by each aggregate's command boundary — DevTicket/Proposal by #230 (`wf230:1551-1600`), Sprint by #233, Docs by #234 (`wf230:1597-1600`) — and is **never** a ledger operation, a GitHub close, or a delete. The four ledgers do not "archive"; aggregates do, and each overlay append an immutable archive fact to the **activity/history ledger** (DBF-174) with cross-links to the other three ledgers by stable ID (DBF-177). On the seams: archive **must not** close a GitHub Issue as Done — "provider disposition is an explicit sync policy fact" (`wf230:1582-1583`); early close/reopen "never means Done/archive" (`wf231:657`); and `ArchiveDevTicket` rejects any live claim/lease/containment, any containing Pre-Start/Start-Rejection record, any live Review Handoff, any current Blocked Episode, dependents that would be left impossible, any nonterminal Sprint membership, and any Absolute-Stop containment that has not completed its redaction/revocation (`wf230:1553-1571`). **Authority:** Human Owner may "archive safe work" (`wf230:254`); Secure Admin UI + enrolled Admin session owns archive/restore (`wf230:253`); Slack/agent/Runner may not archive directly — they request the same governed command (DBF-016).

### Q-RETENTION — Retention durations and the durable-vs-expirable boundary
**Decision:** Retention is **class-based, not age-based**, fixed by R2 and the ledger table. Durable classes (contracts, comments/worklogs, Sprint history, approvals, conflict decisions, relied-upon Review evidence, planning decisions, accepted runner receipts/checkpoints/evidence refs, outbox/conflict decisions) never expire (`dev-board-foundation-decisions.md:295` DBF-179; `ADR-017:546-558`). Expirable classes (runner raw telemetry, token/tool streams, temporary previews, large transient artifacts, non-authoritative sync diagnostic detail) expire under **configurable retention / defined TTL / named replay-audit window** without erasing durable summaries (`dev-board-foundation-decisions.md:296` DBF-180; `ADR-017:552`, `:557-558`). **The exact numeric durations and TTL windows are not in the authority and are locked as OPEN-1 below** with a recommended default; the policy shape (durable-by-default, expirable-by-named-class, configurable) is decided here.

### Q-REDACTION — Exceptional (legal / secret-exposure) redaction authority and choreography
**Decision:** Two distinct triggers, both fail-closed, both tombstone-leaving (R3):
1. **Secret-exposure redaction** is system-driven from the Absolute Stop (R4): within one Opzava transaction it quarantines/revokes affected secret refs, derived Lease Credential Access Grants, and preview-tunnel authority, enqueues external revocation outboxes, fences execution, and commits atomically (`wf230:363-369`). It is **not** approvable away (DBF-066, DBF-125).
2. **Legal / policy redaction** is a human-driven, secure-UI-only action: "security policy changes … require Opzava's secure UI" (DBF-118 at `dev-board-foundation-decisions.md:199`), and Slack may never carry or authorize it (DBF-120, `:201`). It "coordinates redaction in Opzava and GitHub" and leaves a non-sensitive audit tombstone (DBF-181). Cross-system: a GitHub provider-comment deletion "records provider deletion and a safe tombstone; exceptional cross-system removal is resolved by #235" (`wf231:716-717`), and ordinary deletion "creates safe tombstone/redaction pending #235" (`wf231:667`). **#235 is the named owner of that cross-system removal choreography.** The exact request/approve/audit authority chain for non-secret legal redaction is **OPEN-2**.

### Q-TOMBSTONE — Tombstone schema (sanitized hash/ref)
**Decision:** Every exceptional redaction of a durable record leaves an **attributable, integrity-preserving, non-sensitive tombstone** (R3). The authority fixes the attributes but **no field-level schema exists** for the four Dev Board ledgers (verified: only `ADR-017:560-562`, DBF-181, and the Releases-contamination analogues DBF-226/DBF-236 at `dev-board-foundation-decisions.md:362,372` describe attributes). **#235 therefore owns the ledger tombstone schema; a recommended default is proposed in OPEN-3.** The Releases contamination model is the closest precedent and should be the structural template: "preserves a sanitized attributable tombstone/hash, and creates a new sanitized package linked to its predecessor without raw replication" (DBF-226).

### Q-RESTORE — Restoration access and "explicit approval + new revision"
**Decision (locked by R7):** Restore is an authorized governed command, not an open capability. For DevTickets, restored non-Done work lands in Backlog with **no reactivated approval/assignment/claim/lease**, and a **fresh Ready validation + approval + (if material) new contract revision** is required before any claim (`wf230:1587-1590`); restored Done is view-only history and never executable (`wf230:1591-1592`). For Proposals, restore only removes the overlay and "never grants a second decision" (`wf230:654`). Thus "restore requires explicit approval + new revision" is **already the locked contract** for DevTicket execution; the residual open nuance is the **exact who-may-restore authority matrix** (OPEN-4).

### Q-REVOKE — Provider credential / tunnel / lease revocation as first-class idempotent events
**Decision (locked by R5/R6):** Adopt the existing first-class, idempotent, terminal-disposition revocation events as the canonical mechanism — `revokeGrant`/`confirmDisposition` (Lease Secret Broker), `revoke_local_grant` and `close_preview_delivery` Enforcer orders, `fence_lease_enforcer`, the Lease Credential Access Grant `revocation_pending`/`revoked` states, and the GitHub Disconnect Saga for provider credentials. Each is replay-safe (terminal disposition returned on re-issue) and separates local disposal from upstream revocation. **No new event type is required; the #235 lock is the policy that redaction/retirement flows route through these events and that a redaction/expiry never claims an upstream revocation it did not confirm** (`wf232:2694-2697`; `ADR-017:631-632`).

### Q-PARTIAL — Partial failure when only one ledger is inconsistent
**Decision (locked by R8):** Partial ledger inconsistency is the **normal** state, not an error, because the four ledgers intentionally have no global order (DBF-177; DBF-097). Within one ledger, writes are transactional/all-or-none (`wf230:612-613`); across ledgers, effects travel via the durable outbox (DBF-101) and sagas (`wf231:400-402`) and reconcile (DBF-097, DBF-102). **Failure blocks only the capabilities that depend on the inconsistent ledger** (DBF-196), and a redaction/revocation is complete only when every affected ledger leg is confirmed — e.g., `ResolveAbsoluteStop` rejects until it has consumed "confirmed credential revocation/quarantine or safe rotation plus confirmed derived lease-grant revocations and preview-tunnel closure/revocation and affected Runner/worktree/GitHub reconciliation" (`wf230:371-374`), and `ArchiveDevTicket` rejects while any containment/authority is unreconciled (`wf230:1553-1571`). The specific **retention-expiry partial-failure** case (expirable raw referenced by a durable ref) is **OPEN-5**.

---

## OPEN DECISIONS FOR OWNER

Genuine unresolved choices a human must lock. Each decision contains a recommendation for #237 and is explicitly marked as **recommendation carried to synthesis #237 (not an owner-lock)**. Nothing here reopens #230/#231/#232.

### OPEN-1 — Numeric retention durations / TTL windows (the matrix cells)
**Decision to lock:** Set concrete, configurable durations for each expirable class: (a) runner raw telemetry / token-tool streams TTL; (b) temporary preview artifact + preview-tunnel retention (today bound only to lease/expiry, `dev-board-foundation-decisions.md:223` DBF-132); (c) sync non-authoritative diagnostic detail replay/audit window (`ADR-017:557-558`); (d) GitHub webhook raw-body retention (today "bounded request memory" only, `wf231:414` — confirm it is never persisted).
**Recommended default (carried to synthesis #237, not an owner-lock):** Make all four **operator-configurable with a fail-safe ceiling**, defaulting to the shortest window that still satisfies the named replay/audit purpose, and require that any relied-upon fact (per DBF-179) be promoted out of the expirable class before its TTL can act. Durable classes remain TTL = none. *Authority gap: no numbers exist in any source — this is the central matrix the readiness comment requested.*

### OPEN-2 — Legal / policy redaction authority chain (non-secret)
**Decision to lock:** Name who may **request**, **approve**, **execute**, and **audit** a non-secret legal redaction, what **proof/justification** is required, and the **cross-system choreography** (Opzava record + GitHub comment/issue + Slack notification) that #235 owns per `wf231:667` and `wf231:716-717`.
**Recommended default (carried to synthesis #237, not an owner-lock):** Request = Human Owner or Lead Orchestrator; **Approve/Execute = Secure-UI Admin only** (consistent with DBF-118 `:199` and DBF-066 `:117`); audit tombstone records actor/role/reason/scope in the activity/history ledger; GitHub leg uses the existing managed-comment marker path (`wf231:706-717`) with a `redaction_pending → redacted` outbox state mirroring the disconnect saga's `revocation_required` shape (`wf231:388-402`). Secret-exposure redaction stays system-driven (R4) and is **not** rerouted through this human chain.

### OPEN-3 — Field-level tombstone schema (sanitized hash/ref)
**Decision to lock:** Define one tombstone row schema used by all four ledgers for exceptional redaction, consistent with the Releases template (DBF-226 `:362`).
**Recommended default (carried to synthesis #237, not an owner-lock):**
```
tombstone {
  id, ledger, sourceRecordId, sourceRecordKind,        // attributable: what was redacted, where
  predecessorRef / sanitizedRef,                       // link to prior record or sanitized successor
  integrityHash,        // sha256 of content recorded BEFORE redaction (or content-hash already stored)
  redactionClass,       // secret_exposure | legal_policy | provider_deletion | contamination
  triggerRef,           // Absolute-Stop id / legal-request id / provider-deletion observation id
  actor, role, sourceSurface, reasonCode,
  scopedAffectedRefs,   // secret refs, lease-grant ids, tunnel ids, GitHub bindings revoked
  restorationPolicy,    // none | fresh-approval-required (mirrors R7)
  recordedAt, version
}
```
Raw suspect payload never enters it (mirrors DBF-236 `:372` and `ADR-017:560`). *Authority gap confirmed: only attributes, no schema, exist today.*

### OPEN-4 — Restore authority matrix and revocation coupling
**Decision to lock:** For each restorable aggregate, fix **who may issue the restore command** and whether restore of **archived Done** requires fresh Review evidence (today restored Done is view-only, `wf230:1591-1592`, but the "who" is not enumerated).
**Recommended default (carried to synthesis #237, not an owner-lock):** RestoreDevTicket/RestoreProposal require the same authority as the archive (Secure Admin UI + enrolled Admin, or Human Owner for their own safe work — `wf230:253-254`); Sprint/Docs restore inherit #233/#234 authority; restored Done stays view-only and never re-executes without a new DevTicket through Ready/Review/Done (mirrors Releases forward-fix DBF-229 `:365`). The post-restore **fresh-Ready** requirement is already locked (R7) and needs no decision.

### OPEN-5 — Retention-expiry partial-failure rule (durable ref → expirable raw)
**Decision to lock:** State the behavior when an expirable raw artifact (runner telemetry, preview) is referenced by a durable record (Review evidence, checkpoint) at expiry.
**Recommended default (carried to synthesis #237, not an owner-lock):** Adopt DBF-179/180 strictly: **relied-upon evidence is durable and is promoted out of the expirable class at the moment it becomes relied-upon** (e.g., when a checkpoint/receipt feeds a gate or Done). Expiry may act **only** on raw that no durable ref currently depends on; if a ref would dangle, expiry is blocked and the artifact is promoted (mirrors the Releases "immutable evidence is never edited" stance, DBF-226 `:362`). This closes the one partial-failure hole R8 does not already cover.

### OPEN-6 — Idempotency domain and replay keying for revocation controls across channels
**Decision to lock:** Define deterministic replay/identity contract for revocation actions that span Lease Secret Broker, enforcer orders, and provider disconnect intents so idempotency remains consistent when requests cross channels.
**Recommended default (carried to synthesis #237, not an owner-lock):** Use a shared domain key pattern across channels derived from `{ledger, action, actor, subject, nonceOrRevision}` and persist terminal disposition state per subject; reject ambiguous replays only by returning the existing terminal disposition. This complements existing idempotent terminal states (`revoked`, `local_disposed`) and closes a cross-channel replay determinism gap.

### OPEN-7 — Conflict-failure UX and owner alerting for partial-ledger divergence
**Decision to lock:** Define owner-facing behavior when ledgers diverge (e.g., done in Opzava but pending on GitHub/provider or vice versa).
**Recommended default (carried to synthesis #237, not an owner-lock):** Surface an explicit hard-fail conflict state with owner notification, retain full causal chain in the activity/history ledger, and require deterministic reconciliation before allowing dependent capability transitions; unresolved conflicts cannot auto-resolve.

### OPEN-8 — Scope boundary, not a new choice — Sprint / Docs archive ownership
**Decision (already locked, restated for #237):** Sprint Archive/Restore is #233's; Docs archive semantics are #234's (`wf230:1597-1600`). #235 supplies only the **retention/redaction/tombstone/restore-gating/revocation policy** those owners consume; it must not define their overlay internals. Flagged here so #237 does not misread silence as a gap.

## Sad paths and edge cases (observable contracts for #237)

| Sad path / edge case | Required behavior | Authority |
|---|---|---|
| Archive requested while a claim/lease/containment, live Review Handoff, current Blocked Episode, nonterminal Sprint membership, or unresolved Absolute Stop exists | `ArchiveDevTicket` **rejects**; reconcile/exit/resolve first. Fencing alone is insufficient. | `wf230:1553-1571` |
| Restore of a non-Done DevTicket | Backlog anchor, no reactivated approval/assignment/claim/lease; **fresh Ready + approval required** before any claim | `wf230:1587-1590` |
| Restore of a reconciled Done DevTicket | View-only Done history; **never** executable by restore | `wf230:1591-1592` |
| Restore of a terminal Proposal | Overlay removed only; terminal decision **not** re-granted | `wf230:654`, `wf230:722-726` |
| Archive/restore races a concurrent GitHub binding owner | Unique `(repo, issue_number)` enforced across active/archived/historical; deterministic conflict, never double-bind | `wf230:671-672` |
| Secret-exposure redaction | Atomic quarantine/revoke of secret refs + derived grants + tunnel + outbox; commits together or none; cannot be approved away | `wf230:363-369`, DBF-066/125 |
| `ResolveAbsoluteStop` with an unconfirmed revocation leg | **Rejects** until every leg (credential/quarantine or rotation, derived lease-grant revocations, tunnel closure, Runner/worktree/GitHub reconciliation, finalized-Review #229 proof where applicable) is confirmed | `wf230:371-374` |
| GitHub refresh-revoke returns `202 Accepted` | Treat as **unconfirmed**; quarantine cleanup handle until provider-issued expiry; do not call it revoked | `ADR-017:631-632`, `wf231:336-341` |
| Ambiguous uninstall/revoke response | `provider_outcome_unknown`; fail closed; never infer success from `404` | `wf231:391-395` |
| Re-issue of an already-terminal revoke/dispose | Return the recorded terminal disposition; **no second event**, no resurrection | `wf232:1440-1441`, `wf232:1808-1816` |
| Provider comment deleted on GitHub | Record provider deletion + safe tombstone; exceptional cross-system removal routed to #235 | `wf231:667`, `wf231:716-717` |
| Expirable raw referenced by a relied-upon durable ref at TTL | (OPEN-5 default) **block expiry / promote to durable**; never dangle a relied-upon ref | DBF-179/180, `:362` DBF-226 |
| Only one ledger inconsistent (e.g., sync outbox lags activity/history) | Normal state; gates requiring the lagging ledger wait; unrelated capabilities continue; reconcile via outbox/saga | DBF-097/102 `:168,173`, DBF-196 `:324`, R8 |
| Database error mid-redaction/archive | Roll back the receipt and every domain/ledger/outbox write together; caller may retry same idempotency key | `wf230:612-613` |
| Unauthorized caller (Slack/agent/Runner) attempts archive/restore/redaction | Routed as a governed command request only; Slack free text is not approval; security/redaction changes rejected outside secure UI | DBF-016 `:42`, DBF-118 `:199`, `wf230:253-258` |
| Platform App registration secret during GitHub disconnect | **Never** tenant-deleted by disconnect; not tenant-owned | `wf231:397-398` |
| Conflict state in partial-ledger divergence | Surface explicit conflict and hold dependent transitions for reconciliation | DBF-097; PRD conflict/outbox sections (`docs/prd/PRD-019-dev-board.md`) |

## What #235 hands to final synthesis #237

1. **A cross-ledger retention matrix** (the four-ledger table above) fixing durable-by-class vs. expirable-by-class, with per-class authority for archive/retention/redaction/tombstone/restore/revocation and the **partial-failure** rule (R8 + OPEN-5 default). This is the "one-page matrix" the #235 readiness comment requested.
2. **The locked decisions** Q-ARCHIVE … Q-PARTIAL, each consuming #230/#231/#232 without reopening them, plus the eight R-facts as the resolved baseline.
3. **Open owner decisions** (OPEN-1 … OPEN-8) each with a recommended default, and one explicit scope-boundary note (OPEN-8), so #237 can either accept defaults as tracer-bullet contracts or escalate the few that need a human grilling.
4. **Confirmation that provider credential/tunnel/lease revocation is already first-class and idempotent** (R5/R6) — #237 needs no new event type, only the policy that redaction/retirement flows route through the existing terminal-disposition events and never overclaim upstream revocation.
5. **The tombstone schema proposal** (OPEN-3) as the structural contract the four ledgers (and the GitHub mirror per `wf231:667,716-717`) must implement for exceptional removal.
6. **Explicit non-claims:** #235 does not implement, does not define Sprint/Docs overlay internals (OPEN-8), does not set numeric TTLs (OPEN-1), and does not close #147–#157 (those are superseded/quarantined, DBF-187 `:308`, and out of scope per map #228 "Out of scope").

---

*Verification note: every factual claim above is tied to a `file:line` citation or an issue; where no authority supplies a value (numeric TTLs, tombstone field schema, non-secret redaction authority chain, restore authority matrix, idempotency keying, conflict-failure UX, expiry-dangling rule), the item is explicitly filed as OPEN rather than asserted. This is research authority only; it authorizes no code, schema, or migration.*
