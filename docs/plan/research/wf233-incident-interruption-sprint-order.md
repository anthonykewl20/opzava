# WF-233 research memo — reconcile incident projections, governed interruption, strict Sprint order, and ordinary-work preemption

Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #237.

**Scope:** planning reconciliation for Wayfinder research ticket #233 (`wf233-incident-interruption-sprint-order.md`) with no implementation claims. The memo consumes locked Dev Board governance artifacts (`docs/plan/dev-board-foundation-decisions.md`, DBF-001…DBF-249), ADR-017, PRD-019, PRD-012, PRD-018, ADR-013, and current-input memos #230, #231, #232. It also reflects constraints and implementation boundaries already confirmed in GitHub Wayfinder ticket #233.

## 0) Coordination model

Dev Board remains the sole authority for lane, lease, pause/preemption/fence, claim, Sprint, and recovery transitions (`ADR-017:389-390`, `DBF-240`). An Operational **Incident/ErrorGroup** is visible to the admin control surfaces and may project work context, but it is not itself a DevTicket or Sprint plan member (`DBF-067`, `DBF-068`, `DBF-069`, `ADR-013:3-8`, `ADR-013:75-87`, `PRD-019:190-198`). Governing interruption behavior is handled by Dev Board + command/protocol paths, not by Incident model alone (`DBF-197`, `DBF-040`, `DBF-066/125`, `DBF-147`, `wf232:2976`).

## 1) Core decisions per domain

### (a) Incident projections and their lane effect

**Decision 1:** Incident/ErrorGroup influence is three-way and explicit:
1) **Attention projection only**: shown in Incident list/visibility views with severity, lifecycle (`Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem`), and context; no automatic DevTicket lane mutation.
2) **Blocked-episode annotation** only when the incident is the concrete blocker for that specific DevTicket (`wf230:145`, `DBF-024`, `ADR-013:93-96`).
3) **Governed interruption** for severe live conditions (`P0/P1`) through pause/checkpoint/fence commands; still no Incident-owned Sprint lane.

Evidence: `DBF-153`, `DBF-155`, `PRD-012:48-49`, `ADR-013:75-78`, `PRD-012:53`, `wf230:145`, `wf232:55-62`, `wf232:2976`, `#233 issue body`, `wf231:657-670`.

**Decision 2:** Wait/Blocked are distinct:
- *Wait* means ordinary gating (dependency lock, capacity, or Sprint gate), not explicit failure-to-proceed (`DBF-026`, `wf230:148`, `DBF-201`, `ADR-017:440-445`).
- *Blocked* means an active `BlockedEpisode` state (`DBF-024`).

Evidence: `DBF-026`, `wf230:52`, `wf230:145`, `DBF-201`, `ADR-017:440-445`.

### (b) Governed interruption semantics

**Decision 3:** Pause/resume authority is split by actor and command type, all gated by command protocol and audit (`DBF-197`, `PRD-019:455-457`):
- **System-initiated pause/disconnect paths**: `Runner disconnect/lease loss`, contract revision, capability drift/invalidation, absolute stop, Review-WIP saturation, or capacity transitions can all induce pause/checkpoint/fence behaviors (`DBF-110`, `DBF-147`, `DBF-192`, `DBF-207`, `DBF-040`, `DBF-066`, `DBF-147`, `DBF-125`, `wf230:160`, `wf230:164`, `wf232:3306`, `wf232:2998`).
- **Human/assistant command-initiation**: pause/reopen/reconciliation always flow through command handlers (`wf230:151`, `wf230:1410-1414`, `PRD-019:437-440`, `PRD-019:455-457`).

**Decision 4:** Reconciliation never resumes under old authority. Interrupted work must clear stale lease/fences and perform fresh `ClaimAndStart` (where applicable); old `in_progress` states are never silently resurrected (`DBF-025`, `DBF-112`, `DBF-244`, `ADR-017:408-413`, `wf230:1431-1434`, `wf232:2239-2242`, `wf230:161-163`).

### (c) Strict `autonomous_serial` Sprint ordering

**Decision 5:** A single Active Sprint is enforced and in-flight Sprint claim surface is serialized:
- Max one active Sprint DevTicket in progress at once (`DBF-137`, `DBF-143`, `PRD-019:339-341`, `PRD-019:329-331`).
- next Sprint item may run only after prior item review/handoff finalize and topology dependency checks pass (`DBF-142`, `DBF-205`, `PRD-019:342-345`, `wf232:3327-3328`).
- Sprint and ordinary work must obey capacity and waiting semantics; ordinary work is never preempted silently by Sprint internals, and Sprint never auto-borrows ordinary capacity (`DBF-199`, `DBF-201`, `DBF-203`, `DBF-204`, `ADR-017:440-445`).

Evidence: `DBF-139`, `DBF-140`, `DBF-142`, `DBF-143`, `DBF-204`, `PRD-019:320-322`, `PRD-019:329-345`, `PRD-019:437-439`, `wf232:2936-2941`.

### (d) Ordinary work preemption (including P0/P1)

**Decision 6:** Claim-on-command remains explicit; there is no implicit preemption for priority labels alone (`DBF-022`, `DBF-025`, `DBF-061`, `PRD-019:178`, `PRD-019:440-442`, `ADR-017:427-429`).

**Decision 7:** Preemption/interruption is command-based and auditable. Interruption path fences live lease/authority, then lands in wait/blocked transitions as defined by state:
- reconnect/contract-loss branches go to todo (non-blocked) or blocked (`DBF-110`, `DBF-192`, `PRD-019:100-101`, `wf230:161`, `wf230:162`, `wf232:2988`).
- capacity or WIP saturation does not kill existing ordinary leases (`DBF-203`, `DBF-201`, `wf230:151`).

Evidence: `wf230:630-634`, `wf230:1410-1424`, `wf230:1870-1873`, `wf232:2239-2241`, `wf232:219-227`, `PRD-019:776-779`, `PRD-019:802-823`.

## 2) Pause/resume/reopen matrix (authoritative state view)

| State | Pause owner | Resume/reopen owner | Reversible? | Transition note |
|---|---|---|---|---|
| Active Sprint (one in-flight item) | system (`disconnect`, revision, absolute-stop, capacity, WIP-3) or human/assistant command | fresh claim & coordinator authorization | Yes | pause/blocked via command only |
| Sprint Paused — system-induced | system | fresh claim after revalidation | Yes | wait/activate by preconditions |
| Sprint Paused — human-governed | human/assistant with bounded Slack approval | explicit Resume command | Yes | no implicit claim |
| Active ordinary work interrupted | command system or governed command | fresh claim (`ClaimAndStart`) | Yes | cleared through reopen/Resolve path |
| BlockedEpisode on incident-linked item | command actor (DevTicket owner / authorized command) | manual reopen command (`resolved`/`superseded`) | Yes | incident close does not auto-clear |

Sources: `DBF-040`, `DBF-147`, `DBF-197`, `DBF-025`, `DBF-112`, `wf230:145`, `wf230:151`, `wf230:1410-1424`, `wf232:2995`, `wf232:2999`.

## 3) Decision tensions gathered from cross-check reconciliation

### T1 — Incident priority bridge to interruption controls
Primary sources confirm incidents are attention-only and never Sprint lanes. The unresolved tension is the exact bridge point where P0/P1 incident state should route into governed interruption commands with bounded boundaries (`wf230:620-624`, `wf231:657-670`, `DBF:119-127`, `ADR-017:95-103`, `PRD-019:190-196`, `#233 issue body`).

### T2 — Pause owner alignment across sources
#230 and #232 separate concerns by authority and outcome; #233 must preserve a single handoff edge so one pause command, one pause reason, and one resume authority are used (`wf230:1410-1424`, `wf232:219-227`, `wf232:3305`, `#233 issue comment`).

### T3 — Ordered Sprint governance edge behavior
Ordered transitions across active/pending/paused/wait states must be explicit and one-to-one with transition table contracts (`PRD-019:838-840`, `PRD-019:839-845`, `ADR-017:513-528`, `DBF:139-141`, `wf232:61-62`, `wf232:2936`).

### T4 — Dependency/disposition sequencing with neighboring maps
Ticket #233 explicitly references dependency ordering with #216/#218 boundaries for ready dependencies and implementation order, so these are scope and sequencing dependencies, not direct design contradictions (`#233 issue comment`, `wf230:2088-2110`).

## 4) Open decisions for owner

Each item below is explicitly marked as **recommendation carried to synthesis #237 (not an owner-lock)**.

### OPEN #1 — **Incident-driven work pressure bridge** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** whether to allow every P0/P1 incident to auto-open a `BlockedEpisode`.

**Recommended default:** keep incidents as bounded attention projections by default; incident enters DevBoard work only through explicit governance commands (`AbsoluteStop`, `BlockedEpisode`, or `Checkpoint/Pause` command) with proof/authorities aligned to affected dependency/runner/resource (`wf230:620-624`, `DBF:119-127`, `ADR-017:95-103`, `PRD-019:190-196`, `wf230:151`).

### OPEN #2 — **Preemption command boundary and approver set** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** whether P0/P1 severity changes who approves interruption.

**Recommended default:** priority changes ranking only (work urgency ordering), not approver authority. Interruption of a live lease always uses governed command/Slack approval path and a fenced authority transition (`DBF-198`, `DBF-061`, `ADR-017:427-429`, `PRD-019:440-442`, `wf230:1870-1873`, `PRD-019:802-823`).

### OPEN #3 — **SLO of resumed Sprint coordinator selection** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** when and whether the system auto-resumes selection after reconciliation.

**Recommended default:** system-induced pauses may resume through automatic ordered selection after fresh claim precondition checks succeed; explicitly paused incidents (human/governed) require explicit resume command; no transition under stale lease (`DBF-150`, `DBF-142`, `PRD-019:354-359`, `wf232:3327-3328`, `wf230:151`).

### OPEN #4 — **Resume/reopen command shape** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** whether reopening occurs via direct auto-transition versus `ResolveOrSupersedeBlock`.

**Recommended default:** use `ResolveOrSupersedeBlock`/reopen command with required revocation/fence proofs; never implicit auto-unpause (`wf230:1410-1434`, `wf230:630-633`, `wf230:1412-1414`, `ADR-017:410-413`, `wf232:2239-2242`).

### OPEN #5 — **Ordinary work tie-break under equal priority** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** priority tie resolution ordering for next ordinary claim.

**Recommended default:** preserve deterministic ordering (priority → dependency readiness → FIFO), then explicit claim; incident-based gating remains separate (`DBF-022`, `DBF-061`, `PRD-019:96-97`, `wf230:145`).

### OPEN #6 — **Permanent fix channel for incident root causes** *(recommendation carried to synthesis #237 (not an owner-lock))*
**Decision:** when to synthesize remediation into Bug/Technical Task versus process-only action.

**Recommended default:** persistent prevention changes that alter repo/config/schema/dependency or deployment setup become Bug/Technical Task through normal DevBoard workflows; pure runtime mitigations remain RemediationAction unless persistence is required (`DBF-070`, `ADR-013:85-87`, `PRD-018:43-44`, `PRD-018:83-99`, `wf232:3306`, `wf230:620-624`).

## 5) Resolved/confirmed for #237 handoff

1. **Incident is not lane authority** — projection + optional `BlockedEpisode` only.
2. **No automatic local/cloud failover** — local recovery uses checkpoint/reconciliation, not implicit cloud takeover (`DBF-111`, `DBF-244`, `ADR-017:593-595`, `wf232:2925-2928`, `wf232:3306`, `DBF-105`, `DBF-113`, `DBF-248`).
3. **No silent preemption** — even P0 routes through command + pause protocol.
4. **One Active Sprint + one in-flight Sprint DevTicket** — ordered transitions only.
5. **Claims are explicit and non-resumptive** — stale lease never resumed.
6. **Pause/reopen commands are authority-bound and audited**.

## 6) Risks if not decided before #237

1. **Wrong interruption bridge** from Incident priority to execution authority causes either over-blocking or under-blocking of critical work (`wf230:620-624`, `wf231:657-670`, `#233 issue comments`).
2. **Authority drift** can leak workspaces if reopen/fence ownership is not single-source (`wf230:1410-1414`, `wf232:45-47`).
3. **Sprint ordering violation** if wait/paused states are underspecified and coordinator auto-resume is not harmonized (`ADR-017:513-525`, `DBF-139`, `DBF-140`, `wf232:3327-3328`).
4. **Silent preemption/regression** if incident events are consumed outside governance command path (`ADR-017:427-430`, `wf230:636-643`, `wf232:219-227`).
5. **Cloud execution overlap risk** if failover is treated as implicit and not explicit command-bound (`wf232:485-486`, `PRD-019:794-800`).

