# Opzava — IMPLEMENTATION STARTABLE-FRONTIER report

**Synthesis of the three landed delivery graphs:** Dev Board (`wf237`), Admin Control Center
(`wf246`), Ask Admin v1 (`wf220`). READ-ONLY consolidation. No git/GitHub writes; no ticket
created or closed. Every TB cites its graph + section.

**Scope of "startable."** A tracer bullet (TB) is *startable* when its open blockers reduce
entirely to foundation TBs (or nothing) and its critical path does **not** pass through the three
external gates named in this task: **#229** (Review Gate), **#253** (Done-gate server-side
attestation), **#194** (broker trusts caller-asserted principals). TBs gated by #229/#253/#194 are
in §3; TBs gated by *other* open owner amendments (ADR-003, PRD-013/#192, PRD-006, PRD-012/#193)
are surfaced in §2-note + §A so nothing is silently dropped, but they are not the three gates this
report sequences around.

**Headline.** Three independent program roots, **no shared blocker** between them:
- **Dev Board** — `TB-01` (Frontier 0; the single true start) — **SUB-SLICES ALL LANDED**: `TB-01b-1` (atomic command spine + four-ledger skeleton, merged) and `TB-01b-2` (DevTicket aggregate + DraftProposal/SubmitProposal/AcceptProposal/ApproveReadyToTodo + `0021` state schema, merged via #331) `TB-01b-3` (MergeProposal/RejectProposal/ArchiveProposal + fail-closed Claim/Start/SubmitForReview/AdmitDone + savepoint-mapped FK/unique terminal receipts + wf230 event-routing alignment, merged via #333), and `TB-01b-4` (AddDependency/RemoveDependency + cycle detection + completion lock + todo-lane Ready invalidation, merged via #334), and `TB-01b-5` (authoritative Todo lane queue + ReorderTodo, migration 0022, merged via #336), and `TB-01b-6` (classifications/roles: classification vocabulary + versioned change-risk policy + trusted human Ready-authorization + active-membership gating + closed actor vocabulary, migration 0024, via this PR), and `TB-01b-7` (reversible archive/restore + Historical Projection reads, migration 0025, via this PR), and `TB-01b-8` (legacy import + alias preservation + admission rules + `ReconcileHistoricalCompletion`, migration 0026, landed) have landed. All eight TB-01 sub-slices are landed; the #305 skeleton/command/alias/admission scope is complete, and migration/cutover work continues in `TB-MG1`/`TB-MG2`.
- **Admin CC** — `TB-F1` (Wave-0 frontier).
- **Ask Admin** — `A0` (de-risk GATE), `A4` (data layer), `A7` (hard gate; closes #253), all
  unblocked.

P0 Foundations audit (2026-08-14): ADR umbrellas #88 (ADR-001) and #89 (ADR-002, as amended by Q18) closed as landed; #90–#94 carry named gap-slice records (see issues). Docs accuracy sweep landed via #344; the ADR-004 same-transaction outbox defect fixed via #345/#346.

#229 gates exactly **6 Dev Board TBs** + **2 Admin CC leaves** (execution-semantics only).
#253 and #194 are **code bugs whose fixes are already spec'd** (`wf218`/ADR-018) and **slot INTO
the foundation slice** (§5) — they do not block the frontier.

---

## 1. FOUNDATION TBs FIRST (the true starting points)

These are the TBs everything else transitively blocks on. Each has no open external gate on its
own critical path. Acceptance criteria quoted/condensed from the owning graph.

### Dev Board (`wf237`)

| Foundation TB | Deliverable | Acceptance (condensed) | Cite |
| --- | --- | --- | --- |
| **`TB-01`** | DevTicket command spine + planning lifecycle on real Postgres: `CommandEnvelope`, idempotency receipt store, authorization version, Secret-Safe Ingress gate, `withTenant` transaction-first outbox, DevTicket aggregate (Backlog/Todo), Ready Contract + exact-hash Ready Approval, Proposal lifecycle, dependency graph w/ cycle detection + completion lock, ReorderTodo, classifications, roles, reversible archive + Historical Projection, legacy import. `Claim/Start`, `SubmitForReview`, `AdmitDone` *defined here but wired fail-closed* until TB-02/TB-RN/TB-RV1. | One winning claim semantics; duplicate/stale commands replay identically; outbox atomicity under crash; tenant-RLS denial = hard 403, never empty success. **Frontier 0, deps: none.** | `wf237` §2 Vertical A; §1 ("safe executable frontier = { TB-01 }") |
| **`TB-GH1`** | GitHub App bootstrap + Bindings + dimensional health + secure install proof. One App; signed-state/PKCE install flow; expiring user-access-token proof; immutable provider IDs; one production Repository Binding. | Setup fail-closed when expiring-user-token disabled; tenant API/DTO/RLS/browser contain **no** platform secret ref/version. **Deps: TB-01.** | `wf237` §2 Vertical B |
| **`TB-MG1`** | Expand-contract target storage + deterministic backfill + dual-read reconciliation (`ImportLegacyDevTicket`/`ReconcileHistoricalCompletion`). | Forward-only fixtures: every source row ends migrated/merged/frozen/archived/quarantined ("Skipped" = cutover blocker); preserve Task UUIDs/card numbers/GitHub links/comments/evidence/worklogs; never bulk-promote legacy evidence. **Deps: TB-01, TB-GH9.** (Foundational for cutover `TB-MG2` + reciprocal #147–#157 mapping.) | `wf237` §2 Vertical J |

### Admin Control Center (`wf246`)

| Foundation TB | Deliverable | Acceptance (condensed) | Cite |
| --- | --- | --- | --- |
| **`TB-F1`** | Admin destination & admission registry + capability gate + hard-403. `listDestinations(principal, route)` deep module replaces hard-coded nav/palette. | Registry drives sidebar + palette + topbar + route guards; denied deep link → 403 with indistinguishable body for foreign-existing vs random ID; `admin_control_center:view` admitted for Owner. **Frontier, deps: none.** | `wf246` §4 Wave 0 |
| **`TB-F2`** | Shared evidence/freshness envelope + composition cache + `observationGeneration` CAS. | Every admitted result carries the full envelope (source/owner/id/version/timestamp/observedAt/staleAfter/availability/LKG); overlapping reads complete older-last + CAS rejects; composite `live` only if every required fact live (strictest budget). **Deps: F1.** | `wf246` §4 Wave 0 |
| **`TB-F3`** | Shared command lifecycle + receipt vocabulary. | Every typed mutation returns durable pending receipt → reconciled outcome with fresh readback; receipt has browser-safe op id + audit link, never a credential; job acceptance never displayed as final success. **Deps: F1.** | `wf246` §4 Wave 0 |
| **`TB-F4`** | Shell parallel adoption (registry-driven, legacy preserved). | Shared shell renders around existing pages without changing domain semantics; nav/palette/health lists from registry; no nav jump on cross-context load. **Deps: F1.** | `wf246` §4 Wave 0 |

### Ask Admin v1 (`wf220`)

| Foundation slice | Deliverable | Acceptance (condensed) | Cite |
| --- | --- | --- | --- |
| **`A0`** | De-risk spike (throwaway, GATE): prove tool-policy recipe + the 2 `#217` memory gates on a real per-tenant Gateway. | `tools.effective` prints **exactly** the 25-name surface; `appendMemoryFlushContent` writes under write-denied policy (CRITICAL); `memory_get`/`memory_search` scoped to own workspace; workspace-escape `read` rejected. **Deps: none.** | `wf220` Part 2, Slice A0 |
| **`A4`** | Conversation-history data model + lifecycle (Postgres truth; `title` column, retention, soft-delete+grace+purge, re-bind/re-seed, compaction divider, idempotent send coalescing). | Admin sends a turn, reloads after simulated session loss, sees full transcript restored from PG; rename persists; deleted chat disappears then purges after grace. **Deps: none (data layer).** | `wf220` Part 2, Slice A4 |
| **`A1`** | Agent tool surface: port card tools + net-new platform/conversation reads onto the runtime-control session-principal registry. | Ask Admin turn calls `opzava_tasks_get` + `opzava_conversations_search` through broker, receives RLS-scoped results; agent comment labeled AI; projected tool names pinned. **Deps: A0.** | `wf220` Part 2, Slice A1 |
| **`A2`** | Tool policy: `minimal → coding` + exact keep-only `allow` (25 names) + surgical `deny` + broker inventory, landed atomically. | `tools.effective` on live gateway = exactly 25 names; broker session admitted (no `toolInventoryMismatch`); skills/memory/delegation tools now model-visible. **Deps: A0, A1.** | `wf220` Part 2, Slice A2 |

---

## 2. STARTABLE NOW (blockers ⊆ foundations; NOT gated by #229/#253/#194)

Every TB below becomes claimable as its foundation deps merge; none is held by the three external
gates. "Blockers" lists only the unmerged *internal* deps (all are foundation-or-startable TBs).

### 2.A Dev Board — 27 of 33 TBs startable (`wf237` §2 + §3 adjacency)

| TB | One-line deliverable | Blockers | Acceptance (condensed) |
| --- | --- | --- | --- |
| `TB-01` | DevTicket command spine (see §1; `TB-01b-1` and `TB-01b-2` landed) | — | (§1) |
| `TB-02` | Execution lifecycle: assignment, two-phase Claim/Start saga, Blocked + ResolveOrSupersedeBlock, Material Revision interruption, Review Handoff skeleton (WIP=3), Absolute Stop, loss/containment. `AdmitDone` *fail-closed* until TB-RV1. | TB-01 (+TB-RN5 real / TB-RN2 fake-runner path) | Review WIP hard cap ≤3; fresh-claim recovery uses new lease/fence/nonce; DB lease fencing alone insufficient |
| `TB-GH1` | GitHub App bootstrap (see §1) | TB-01 | (§1) |
| `TB-GH2` | Verified webhook HTTP inbox + Secret-Safe receipt + Postgres RLS/dedupe | TB-GH1 | Real signed raw fixtures through real HTTP route + real Postgres RLS/worker; nothing parses before HMAC |
| `TB-GH3` | Create/link Mirror Outbox Intent + unknown-outcome recovery + `ResolveUnknownMirrorEffect` | TB-GH1, TB-01 | `AcceptProposal(create)` → one Backlog DevTicket + stable pending-create identity before provider Issue exists; ambiguous effect stays visibly unknown across zero-match scans |
| `TB-GH4` | Managed body/labels + comment/worklog identity + Mirror Shadows + `ResolveSyncConflict` | TB-GH3 | Managed-contract edit becomes a Revision not an overwrite; same-field Sync Conflict resolved in Opzava then mirrored back; truthful human/App/bot/unknown attribution |
| `TB-GH5` | Provider development-fact projection + PR/base/head/SHA correlation | TB-GH1 | Card shows PR/CI/behavioral/approval/merge status without opening GitHub |
| `TB-GH6` | OIDC Actions request translation + Needs Human Approval Request | TB-GH2, TB-01 | Corroborated native check/deployment fact appends one Provider Observation; `ready.validate` commits its command receipt |
| `TB-GH8` | `#232`-governed merge-conflict remediation *(shared w/ Vertical C)* | TB-RN7, TB-GH5 | Agent-authored conflicts resolved in isolated worktree, affected checks rerun, fresh Review |
| `TB-GH9` | Reconciliation/health recovery + legacy OAuth/PAT/outbox cutover | TB-GH2, TB-GH3, TB-GH4 | Complete reconciliation detects a deleted bound comment even when its webhook was missed (two identical full traversals) |
| `TB-GH10` | `DisconnectGitHub` saga | TB-GH1, TB-GH9 | Disconnect with lost provider response → `disconnecting`/`provider_outcome_unknown`/`revocation_required`; reconnect disabled until terminal → new binding generation |
| `TB-GH11` | `Authorized Git Ref Update` response-loss reconciliation *(shared w/ Vertical C)* | TB-RN7, TB-GH5 | Fault-inject response loss → intended-new/old/third-SHA → confirmation/escalation/conflict, exactly one remediation run |
| `TB-RN1` | Runner enrollment (local+cloud) + Registry + WSS role/path + capability admission | TB-01 | Real browser → Admin enrollment → CLI bootstrap/fingerprint → pinned Codex CLI → challenge-bound Capability Admission → Todo claim/start → In Progress |
| `TB-RN2` | Runner Protocol signed frames + delivery/inbox + fact admission + golden vectors | TB-RN1 | Cross-language byte-identical golden-vector suite + real loopback WSS enrollment/delivery/reconnect |
| `TB-RN3` | Harness Supervisor + Adapters + per-attempt worktree/process mechanics | TB-RN2 | Real OS repo + `git worktree` + spawned process group; checkpoint; kill/restart; reconcile; stop/quarantine |
| `TB-RN4` | Lease Enforcer (arm/renew/fence) + OS-supervised containment + time anchor | TB-RN2 | Independent Enforcer containment when daemon, Enforcer, or both die |
| `TB-RN5` | Pre-spawn Process Registration + Lease Secret Broker + start ordering | TB-RN3, TB-RN4 | Secret canary absent from every WSS frame/Postgres row/outbox/inbox/journal/log/Slack/GitHub/diff/checkpoint/evidence |
| `TB-RN6` | Reconnect reconciliation + fresh `ClaimAndStart` + disconnect containment + no-failover | TB-RN4, TB-02 | Cut network mid-run → liveness expires → Blocked/Execution Unknown → preview revoked → Slack summary → reconnect → fresh claim (old lease/process never resumed) |
| `TB-RN7` | Artifact ingress + exact-ref handoff → `#231` broker publication *(shared w/ Vertical B)* | TB-RN3, TB-GH1 | Admit + scan one immutable object bundle; reject changed/expired/cross-tenant refs; Runner has no GitHub write credential |
| `TB-RN8` | Slack / Ask Admin / MCP provenance adapters + `human_input_required` / `policy_denied` | TB-RN2, TB-01 | Real Slack handler + signed raw-body fixtures + real Ask Admin route + real MCP link w/ token hash/scope/expiry/revocation/role/cross-tenant checks |
| `TB-SP1` | Sprint aggregate + `autonomous_serial` + activation preflight + history + Milestone mirror | TB-02, TB-GH4, TB-RN6 | Many Drafts, one Approved/Queued, one Active; exactly one in-flight Sprint DevTicket; next item waits for Review Handoff finalization |
| `TB-SP2` | Incident projection + governed interruption + ordinary claiming + fresh-claim recovery | TB-02, TB-SP1 | Incident visible as attention projection + optional BlockedEpisode annotation; permanent fix → linked Bug/Technical Task through normal gates; stale lease never resumed |
| `TB-DC1` | Governed Docs aggregate + Planning Session Log + invalidation matrix + Markdown mirror | TB-01, TB-GH4 | Author PRD/ADR/Sprint Plan in Opzava → deterministic Markdown mirror; material revision invalidates dependent Ready/Sprint approval via pin mismatch; Planning Session Log append-only *(revision-envelope half startable after TB-01; mirror-conflict half after TB-GH4)* |
| `TB-AR1` | Retention/TTL + tombstone schema + exceptional redaction + governed restore + revocation confirmation | TB-01, TB-GH10, TB-RN5 | Archive/restore; raw-log expiry; GitHub coordinated redaction with non-sensitive tombstone; secret-canary absence |
| `TB-UI1` | Dev Board shell + Summary/List/Board/Card detail (Board B / Card A, light+dark, keyboard parity) | TB-01, TB-02, TB-GH5 | Shape Proposal/Backlog, synced GitHub Issue, approve Ready, claim, observe worklogs + repo facts, submit evidence, reach Done after merge — light+dark, keyboard, narrow viewport |
| `TB-UI3` | Local Machines enrollment UI + Runners/Health/Environments projections + Slack surface + preview tunnel | TB-RN1, TB-RN8 | Admin enrolls local machine, selects Codex Desktop/CLI/Claude Code, observes revocable keys + health + Docker readiness |
| `TB-MG1` | Expand-contract migration + backfill + dual-read (see §1) | TB-01, TB-GH9 | (§1) |

**Dev Board TBs NOT here → §3 (gated by #229):** `TB-RV1`, `TB-GH7`, `TB-RL1`, `TB-RL2`,
`TB-UI2` (its Releases-view portion), `TB-MG2` (terminal cutover).

### 2.B Admin CC — foundation + startable leaves (`wf246` §4–§5)

| TB | One-line deliverable | Blockers | Acceptance (condensed) |
| --- | --- | --- | --- |
| `TB-F1` | Admission registry + capability gate + hard-403 (see §1) | — | (§1) |
| `TB-F2` | Evidence/freshness envelope + CAS (see §1) | F1 | (§1) |
| `TB-F3` | Shared command lifecycle + receipts (see §1) | F1 | (§1) |
| `TB-F4` | Shell parallel adoption (see §1) | F1 | (§1) |
| `TB-X1` | Authorization versioning + step-up + sensitive-record anti-enumeration | F1 | `authorizationVersion` changes atomically w/ membership/role/grant; foreign-existing vs random-ID denial indistinguishable in status/body/size/headers/timing |
| `TB-X2` | Secret storage/ingress hardening + browser-safe Secret Reference Inventory projection | F1, X1 | Sentinel secret through every flow → not present in HTML/RSC/JSON/URL/logs/audit/notifications/Slack/exports/screenshots |
| `TB-R1` | Connections decomposition: Health/Gateway/Models/Integrations typed read projections | F1, F2 | Each owner projection typed + browser-safe + envelope-bearing; legacy + target dual-read identical projection |
| `TB-R2` | Overview composition query (Variant A four sections) | F1, F2, R1 | Exact order Needs Your Attention → Active Delivery → Development Readiness → Recent Activity; every row carries envelope + owner deep link |
| `TB-R3` | Health/attention top-bar split + bridge | F1, F2 | Two controls w/ separate names/destinations; all four state combinations driven; unknown health never green |
| `TB-A6` | Automations leaf (**reserved/unavailable, all v1**) | F1 | Admitted navigation renders reserved heading; page performs **no** source fanout whether or not an adapter exists |
| `TB-D1` | Overview leaf destination | R2 | Overview is admitted, composed, rendered; never persisted |
| `TB-A5` | Sessions & Runs leaf (Run Trace + bounded session evidence) | F1, F2, R1 | Run Trace index + bounded session context + detail w/ sanitized milestones + owner links; no raw transcript |
| `TB-O1` | Health leaf | F1, F2, R1, R3 | Evidence-rich readiness per-source envelope + drill-downs; top-bar pill rolls up *(O-open: PRD-012 tiers may tighten; composition publishable now)* |
| `TB-O2` | Incidents leaf | F1, F2 | Incident lifecycle projected; lasting fixes link to PRD-019 DevTickets *(O-open: actionability predicate; composition publishable now)* |
| `TB-O3` | Logs leaf (redacted operational evidence + correlation) | F1, F2 | No raw payloads/secrets/DTOs *(ext #193 only for runtime-activity deep-link; composition publishable now)* |
| `TB-O4` | Usage & Costs leaf (operational visibility) | F1, F2 | Operational consumption/quota/spend + actionable thresholds; three-way split *(O-open: Usage split model; composition publishable now)* |

> **Admin CC owner-gated set (NOT #229/#253/#194 — separate open amendments; surfaced, not
> silently dropped).** These sit in the frontier only to expose their blocker:
> - `TB-X3` (JIT-admin remediation) → **BLOCKED on ADR-003 owner amendment**; gates A1/A2/A4/C2/C3
>   privileged mutations (`wf246` §4 X3).
> - `TB-X4` (Governance Audit owner-contract) → **BLOCKED on PRD-013/#192 audit-field amendment**;
>   gates C5 (`wf246` §4 X4; §6.2).
> - `TB-R4` (Notification/attention delivery + Notification Center + alert rules) → **BLOCKED on
>   PRD-012/#193 split amendment**; gates C6/M3 (`wf246` §4 R4; §6.5).
> - `TB-A3` (Agents leaf) → **BLOCKED on PRD-006 v1 operating-scope amendment** (`wf246` §4 A3;
>   §6.3).
> - `TB-C3` (MCP Servers leaf) → **BLOCKED on SecretRef-safe adapter gap = X2** (`wf246` §4 C3).
> - Leaves chained only through those: `TB-A1`/`TB-A2`/`TB-A4` (need X3; A2 also X2),
>   `TB-C1` (X2), `TB-C2` (X3), `TB-C4` (X2), `TB-C5` (X4 + ext #192/#193), `TB-C6` (R4).
> - Wave-3 migration `TB-M1`/`M2`/`M3`/`M4` are terminal (post-parity cutover); M2 also ext
>   #228/#237.

### 2.C Ask Admin — 11 slices fully startable + 3 with interim/partial notes (`wf220` Part 2)

| Slice | One-line deliverable | Blockers | Acceptance (condensed) |
| --- | --- | --- | --- |
| `A0` | De-risk spike (see §1) | — | (§1) |
| `A4` | Conversation-history data model (see §1) | — | (§1) |
| `A7` | **Server-side hard gate (closes #253)** — `assertTerminalTransitionAuthorized` in both `moveTask`+`createTask`, reject+redirect tool-path Done, create-with-terminal rejected, two-sink audit, S1–S12 | **none** (BFF-side; does **not** depend on #194 per `wf218` §3E) | Ask Admin turn / direct web call / MCP call attempting `status:'done'` is rejected + redirected to governed `AdmitDone`; attempt appears in security sink, never the activity ledger |
| `A1` | Agent tool surface (see §1) | A0 | (§1) |
| `A2` | Tool policy `coding`+exact-allow (see §1) | A0, A1 | (§1) |
| `A6` | Memory architecture: allowlist + AGENTS.md discipline + cross-agent layout | A0, A2 | Admin says "remember X" → persists at next flush → later `memory_search` recalls it; deleting chat leaves memory intact |
| `A5` | WebChat-parity transport (`chat.*` RPCs through broker) + `/ask-opzava` rename | A4 | Sidebar lists past chats from PG; sending produces exactly one durable turn across retries/reconnect; re-opening re-seeds a live session |
| `A9` | UI: Variant A dual rail + chat surface (screenshot parity) | A4, A5, A3 | Side-by-side screenshot matches `orchestrator-chat.html`; real streamed turn renders w/ Stop/retry; sidebar shows live PG conversations w/ auto-titles |
| `A10` | UI: six sad-path states + #252 error sanitization | A9, A3 | Each of six states reproducible from a real degraded dependency; upstream error renders as actionable semantic message, no `cf-ray`/raw JSON |
| `A11` | Skills: 3 `SKILL.md` + AGENTS.md governance | A2, A1, A7 | Card-authoring turn loads `opzava-card-authoring`; PM turn loads `opzava-pm`; reporting turn loads `opzava-reporting`; subagents load zero skills |
| `A13` | Cost governance: account-limits UI + usage visibility | A3, A10 | Connections UI shows Claude/GPT plan limits live; quota turn fails over w/ A10 marker; GLM/Kimi show "not available" |
| `A3` ⚠️ | Brain model: provisioner `{primary,fallbacks}` serialization + auth + **interim GLM-5.2 primary** | **#251/#193 fork bump** (real `gpt-5.6-sol` head only) | Streamed Ask Admin turn runs on interim primary (GLM-5.2); provisioned config carries `{primary,fallbacks}`; subagent resolves to cheaper routable model. **Ships GLM interim now; pins 5.6-sol after #193 bump.** |
| `A8` ⚠️ | Admin access & session binding + audit attribution | **ADR-018 owner pick** (#194) | Non-admin 403'd at gate; human-commanded action audited "admin X via Ask Admin"; autonomous as agent identity. **BFF-side Option 0 startable now; full ADR-018 Option 2/3 deferred (§5).** |
| `A12` ⚠️ | Delegation path: `AskAdminCommandAdapter` + verbs + delegation card | A2, A5, A9, A7, A8 | Admin delegates a Card → delegation card tracks `requested → … → submitted_for_review`; Done/merge verb rejected; disconnect pauses (no cloud Runner). **Ships non-execution subset (no `ClaimAndStart` until #232/#230 target arch); proven-attribution audit half waits on A8/#194.** |

> **No Ask Admin slice is gated by #229.** `AdmitDone`/approve-merge are deferred *by design*
> (D-GATE-2: "out of scope for v1; lands with #229") — A7 ships reject+redirect regardless, so v1
> never writes Done. #229 only gates the *later* system-owned Done chain, not an Ask Admin slice.

---

## 3. GATED — blocked by #229 / #253 / #194

### #229 — Review Gate (parallel session; gates the Review vertical)
- **Dev Board** (`wf237` §3, §9.2):
  - `TB-RV1` — Review Gate implementation (**direct** named dependency on #229 contract); deps #229, TB-02, TB-RN4. Until it ships, `AdmitDone`/merge stay fail-closed and no DevTicket may reach Done.
  - `TB-GH7` — `#229`-governed merge + external-merge/Post-Merge Review → deps **TB-RV1**, TB-GH5.
  - `TB-RL1` — Release aggregate + staging → deps TB-02, **TB-RV1**.
  - `TB-RL2` — Production promotion saga → deps **TB-RL1**, TB-GH5.
  - `TB-UI2` — Sprints/Docs/Development/**Releases** views → deps TB-SP1, TB-DC1, TB-GH5, **TB-RL2** (Releases-view portion gated; Sprints/Docs portions could ship earlier but the slice as cut is blocked by TB-RL2).
  - `TB-MG2` — Terminal cutover → deps TB-MG1, TB-UI1, *all target-write verticals* (incl. Review); cannot complete until #229 resolves.
- **Admin CC** (`wf246` §4 D2/D3, §5; marked `[ext]` — composition publishable now, execution-semantics gated):
  - `TB-D3` — Environments leaf → ext **#229** (Review identity/lease; Docker Review = evidence only).
  - `TB-D2` — Runners leaf → ext **#229/#233** for selector/capacity *mutation*; #232 trust contract for attestation (enrollment presentation + capacity projection ship now).

### A7/#335 — Done-gate reconciliation status (2026-08-14)

Consensus-terra HYBRID verdict (recorded in full on #335, closed): Contract B (`markTaskDone`) stands as a **time-boxed legacy exception** — web session paths only, retired at verified Dev Board cutover in favor of wf229's proof-bound `AdmitDone`; never a template for agent surfaces. **A7-AF landed** (PR #337, migration 0023): append-only terminal-transition rejection audit floor — closed 12-value reason vocabulary, own-tx never-masking adapter, RLS append-only. **A12 widening is gated on the floor being present (now satisfied) plus its own readiness gate.** Remaining #335 steps: boundary-layer (zod/parse) audit decision (deferred — pre-auth malformed input); retire `markTaskDone` + legacy terminal APIs at cutover; carry attestation PROPERTIES (not the token) into human Merge Authorization. A12's readiness gate is recorded as #341 (verdict: not ready to implement; A0→A1→A2 chain + A5 chat.* half + A9 outstanding; owner decision pending on dep ordering vs a thinner first cut).

### #253 — Done-gate server-side attestation (spec'd by #218)
- **#253 is not a TB blocker — it is the code bug that Ask Admin `A7` closes** (`wf220` §1.10;
  `wf218` "Primary evidence"). It is sequenced into the foundation slice in **§5**, not held here.
- The *system-owned* `AdmitDone` it redirects to is itself disabled until #229 (so the redirect
  target is fail-closed by design); that dependency is #229, recorded above, not a separate #253
  gate on a TB.

### #194 — broker trusts caller-asserted principals (dep of #216/#222/delegation)
- Per `wf218` §3E / `wf220` §1.12, §4.5: **#194 does NOT gate the hard gate or BFF-local tool
  execution** — the gate runs in the web BFF under a verified Better Auth session where the broker
  is only stream transport. #194 is a *latent* trap (single-broker topology; only `tenantId` read)
  gating **broker-crossing** authority.
- What it actually gates (deferred halves, BFF-side ships now):
  - `A8` — trustworthy **broker-side** userId attribution ("admin X via Ask Admin" *proven*, not
    asserted) → ADR-018 Option 2. BFF-side Option 0 (delete four unread broker principal fields)
    ships now.
  - `A12` — the proven-attribution **audit** half of delegation (the Adapter itself derives
    principal from the Better Auth session, so core delegation ships BFF-side now).

---

## 4. RECOMMENDED FIRST SLICE

**Start with Dev Board `TB-01` — the DevTicket command spine & planning lifecycle** (`wf237` §2
Vertical A; §1 frontier).

Why it is the single highest-value start:
1. **Foundations in place (none needed).** `TB-01` is Frontier 0 — zero open blockers, not gated by
   #229/#253/#194. It is the one TB whose preconditions are already fully met.
2. **Unblocks the most.** It is the root of the largest fan-out in any of the three graphs: after
   `TB-01` the next claimable set is `{ TB-GH1, TB-RN1, TB-DC1(partial) }` (`wf237` §3), and from
   there 24 of 33 Dev Board TBs become reachable without touching #229. It is also the seam the
   Ask Admin delegation path (`A12`/`#216`) and the Admin CC Dev Board redirect (`TB-M2`) consume.
3. **Provable end-to-end on the real stack.** Per `wf230:2092-2097` + the manifest sequencing
   rule, it ships first on **real Postgres with no runner and no GitHub** — and its acceptance is a
   real user flow: *admin shapes a Proposal, accepts to Backlog, completes + approves Ready → Todo,
   edits managed contract → material edit returns to Backlog; dependency lock visible in Todo*
   (`wf237` §2 TB-01 e2e-evidence; PRD-019:957-963). That is a complete, falsifiable product
   vertical, not a horizontal layer.
4. **Establishes the load-bearing invariants every later TB inherits:** trusted `CommandEnvelope`,
   idempotency, authorization-version, `withTenant` transaction-first outbox, four-ledger skeleton,
   tenant-RLS-denial-as-hard-403.

**Parallel tracks (no shared blocker — a team can run all three at once):** while `TB-01` proceeds,
Admin CC `TB-F1` and Ask Admin `A0`→`A4`→`A7` are independent frontiers and may advance concurrently.

---

## 5. FOUNDATION-BUG SEQUENCING — where #253 and #194 fixes slot in

Both are **code bugs already spec'd/analyzed** (`#218` governed-card-authority → `wf218`;
`#216`/`#222` principal trust → ADR-018 Proposed). Recommendation: **fix them as part of the
foundation slice, not as deferred gates.**

### #253 → Ask Admin `A7` (server-side hard gate) — ship in the foundation slice
- **What:** `assertTerminalTransitionAuthorized` in `packages/project-management`, invoked by **both**
  `moveTask` (`tasks.ts:1745`) and `createTask` (`tasks.ts:1386`), after `authorizeTask`, before the
  `withTenant` mutation/insert. Reject+redirect every tool-path `done` (`done-is-system-owned`);
  reject create-with-terminal; two-sink audit (accepted → activity ledger DBF-174; rejected/bypass →
  separate security/telemetry sink); closed S1–S12 vocabulary; atomic consume+mutate+ledger in one
  tx (`wf220` §1.10, Slice A7).
- **Why now:** it closes a real, live authority gap — today *any* caller (agent, web, MCP) reaches a
  terminal transition by passing only the role check, because tool policy is per-tool not
  per-argument (`wf218` Primary evidence; #212 §F). It is the terminal-transition guard every
  DevTicket/Ask Admin write depends on, and it is the safety precondition for delegation (`A12`).
- **No external dep:** A7 runs **BFF-side under a verified Better Auth session and does NOT depend on
  #194** (`wf218` §3E). Throwaway prototype already PASS (`prototypes/wf218-hard-gate/`, `028ec317`).
- **Sequence:** land A7 alongside/after `A0`→`A1`→`A2` (it needs the tool surface + policy to guard
  against, but the guard itself is server-side and independent). The `AdmitDone` it redirects to
  stays fail-closed until #229 — by design, not a defect.

### #194 → Ask Admin `A8` ADR-018 Option 0 (no-regret narrowing) — ship now; full pick deferred
- **What now:** ADR-018 **Option 0** — delete the four unread broker principal fields, making BFF
  routing correctness *stated, not implicit* (`wf220` §1.12, Slice A8; ADR-018:64-68,107-108). This
  is the no-regret move; it costs nothing and removes the latent single-broker trap.
- **What deferred:** ADR-018 **Option 2** (audience-bound signed assertion → trustworthy
  broker-side "admin X via Ask Admin" *proven* attribution) and **Option 3** (per-tenant scoped
  token, required before a broker fleet). These ride with the first real user-identity consumer /
  the per-tenant fleet, not the foundation slice.
- **Why now (Option 0):** the hard gate (A7), BFF-local tool execution, and audit attribution all
  proceed on the verified Better Auth session today; #194 only gates broker-crossing authority, so
  the no-regret narrowing unblocks A8/A12 without waiting on the ADR-018 owner pick.

**Net:** the foundation slice = `TB-01` (Dev Board spine) **+** `A7` (closes #253) **+** `A8`
Option 0 (no-regret half of #194). #229 remains the one true external gate, sequencing the Review
vertical (§3) after the fix lands.

---

## Appendix A — the #192 / #193 / #199 sibling gates (accounted, not #229/#253/#194)

The task names these as open external gates; they are accounted here for completeness. None is one
of the three gates this report sequences around.

- **#192 — Connections-mutation audit coverage** (audit rows: PRD-013 old/new safe summaries vs
  #192 immutable config-version refs). Gates Admin CC **`TB-X4`** and **`TB-C5`** (ext) (`wf246`
  §4 X4/C5; §6.2). Owner: PRD-013.
- **#193 — Mainframe fork bump + Platform Gateway rebuild + broker harness of native audit
  ledger.** Gates Admin CC **`TB-R4`** (reciprocal Runtime-Activity link), **`TB-O3`** (runtime-
  activity deep-link), **`TB-C5`** (Runtime Activity ledger view) (`wf246` §4; §6.5–6.6); **also
  gates Ask Admin `A3`'s real `gpt-5.6-sol` head** via #251 (`wf220` §1.7, §4.1 — A3 ships GLM-5.2
  interim now; pins 5.6-sol after the bump → `v2026.7.1`, app-server 0.144.3).
- **#199 — tenant-id guard.** **Not a TB gate.** It is the production report of the broker's
  tenant-binding guard firing (`connection-manager.ts:87` + `operator-client.ts:346` reject
  `actingPrincipal.tenantId !== route.tenantId` with `gatewayBroker.tenantMismatch`) against a stale
  `OPENCLAW_GATEWAY_TENANT_ID` — cited in ADR-018 (`:37`, `:89`, `:108`) as *evidence* that the
  broker's defence-in-depth tenant check works. It informs the #194/ADR-018 resolution; it gates no
  tracer bullet.

---

*Sources read this pass (READ-ONLY): `docs/plan/research/wf237-devboard-implementation-graph.md`,
`docs/plan/research/wf246-admin-control-center-delivery-graph.md`,
`docs/plan/research/wf220-ask-admin-v1-assembled-spec.md`, plus confirmatory grep of
`docs/adr/ADR-018-web-broker-principal-trust.md` and `wf244`/`wf247` for #192/#193/#199. No product
code, PRD/ADR, glossary, or tracker state changed.*

---

## Cross-check (Codex gpt-5.3-spark, 2026-07-18)

**Verdict: the frontier holds** — no hard cycle in the reviewed frontier slices/edges; Dev Board
`TB-01` is genuinely the sole startable Frontier-0 foundation. **One caveat:** Ask Admin `A7`
(server-side hard gate) depends on prior Ask Admin slices completing despite its local "no blockers"
wording — treat it as sequenced after `A0→A4`, not a cold-start. `TB-MG1` and `TB-DC1` are
partial/bounded, not fully startable at layer 0. Dual-provider (GLM synthesis + Codex-spark check),
read-only; no locked decision changed.
