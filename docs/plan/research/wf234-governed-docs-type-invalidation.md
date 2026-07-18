# WF-234 — Governed Docs type, planning-log, and invalidation matrix

**Dual-provider research (GLM + Codex-spark), converged; open decisions carried to #237.**

**Status:** research memo for Wayfinder RESEARCH ticket
[#234 — Complete the governed Docs type, planning-log, and invalidation matrix](https://github.com/anthonykewl20/opzava/issues/234),
part of parent map
[#228 — Wayfinder: Dev Board implementation delivery graph](https://github.com/anthonykewl20/opzava/issues/228).
Read-only spec-grade synthesis. No git, no GitHub writes. Consumes locked #230/#231/#232/#236 decisions; it does not reopen them. Not implementation authority or product code.

**Authoritative inputs read:** `docs/plan/dev-board-foundation-decisions.md` (DBF ledger, governed Docs),
`docs/plan/research/wf230-devticket-command-model.md` (DevTicket revision/invalidation model),
`docs/plan/research/wf231-github-mirror-contract.md` (mirror/copy/conflict, actor attribution),
`docs/plan/research/wf232-runner-control-protocol.md` (authoritative runner/lane controls), `docs/adr/ADR-017-dev-board-authority-sync-execution.md`,
`docs/prd/PRD-019-dev-board.md`, plus #228 and #234 body/comments.

---

## 0. Scope and reading order

#234 asks four things: (a) the governed Docs **TYPE taxonomy** with canonical status set and retention per type; (b) whether the **planning-log / session record** is append-only or immutable; (c) the **invalidation matrix** (append-only logs vs revisioned fields vs dependent-lane invalidators); and (d) **mirroring rules** to GitHub comment/worklog history. It also requires an audit-gap decision for Review and Release evidence treatment without inventing new document types (`IC_kwDOS7Gw788AAAABKqONzw`, "Claims to fix").

The decisive finding is that the foundation docs already settle the contract surface. #234’s novel contribution is narrow: (1) classify Review/Release evidence as owned domain aggregates, not Docs types; (2) close the remaining approval-class and retention gaps across three types; (3) make the append-only/revisioned/invalidating matrix executable; and (4) explicitly tie readiness invalidation to the Ready→doc-version pin. The cross-check confirms this is synthesis-only and not a competing redesign.

---

## 1. Crisp decisions (one per question)

### Decision A — Docs TYPE taxonomy, status set, and retention per type

**A.1 Canonical types (exactly nine, closed set).** Governing Docs are exactly: **PRD, Planning Brief, RFC/Design Spec, Research Note, ADR, Runbook, Postmortem, Sprint Plan, Sprint Report** (`docs/prd/PRD-019-dev-board.md:392-394` US151; `docs/plan/dev-board-foundation-decisions.md:270` DBF-164).

**A.2 Canonical status set (exactly five, closed enum).** Every governed document lifecycle is
**Draft → In Review → Approved → Superseded → Archived** (`docs/prd/PRD-019-dev-board.md:402-403` US155; `docs/plan/dev-board-foundation-decisions.md:276` DBF-170). The canonical enum name is **In Review**, not Review. `docs/plan/dev-board-foundation-decisions.md:49` DBF-018; `docs/prd/PRD-019-dev-board.md:402-403`.

**A.3 Approval class by type (locked for six, open for three).** PRD, RFC/Design Spec, ADR, Sprint Plan, and Runbook require Human Owner approval to enter Approved; Research Note and Planning Session Log may publish without it but remain versioned. `docs/plan/dev-board-foundation-decisions.md:277` DBF-171; `docs/prd/PRD-019-dev-board.md:406-407`.

**A.4 Review and Release contracts are not Docs types.** Review evidence and Release Evidence are
owned by their own domains as immutable, content-addressed aggregates (`docs/plan/dev-board-foundation-decisions.md:155` DBF-089, `:372` DBF-236; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:91`), and are projected into Docs-facing history as read-only summaries/proofs, not as native Docs records.

**A.5 Governing gate spec stays in existing types.** Review/Release gate governance is modeled through process contracts and can be represented as Research Note → ADR where appropriate; ADR-017 already records the Releases Gate governance update in ADR space (`docs/plan/research/wf236-releases-gate-contract.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:5-6,162-163`; DBF-134).

**A.6 Retention per type.** Governed Docs are durable versioned contracts with no routine TTL (`docs/adr/ADR-017-dev-board-authority-sync-execution.md:546-547`; `docs/plan/dev-board-foundation-decisions.md:295-297` DBF-179..180; `docs/prd/PRD-019-dev-board.md:406-418`). The DBF/PRD evidence set is reversible archival with tombstoned redaction; DBF-195 reinforces that only transient channels are retention-managed.

### Decision B — Planning Session Log: append-only, not Approved-immutable

**B.1 Two distinct artifacts from each grilling.** A grilling creates a **Planning Session Log** and a synthesized governed planning artifact (Planning Brief / PRD). They have separate mutability contracts (`docs/plan/dev-board-foundation-decisions.md:274` DBF-168; `docs/prd/PRD-019-dev-board.md:397-398`).

**B.2 Planning Session Log is append-only and versioned.** Entries are written once with metadata (question, recommendation, decision, rejected alternative, unresolved item, participant, timestamp), never edited; corrections append a new entry that names what was superseded. `docs/plan/dev-board-foundation-decisions.md:275,275` DBF-169; `docs/prd/PRD-019-dev-board.md:399-401`; `docs/prd/PRD-019-dev-board.md:234-235` and `docs/plan/research/wf230-devticket-command-model.md:806-811`.

**B.3 Session log is versioned but not governed-content immutable.** It is not the governed lifecycle for Approved-content; revisions are logged as history entries and retain the relied-upon record shape without rewriting (`docs/plan/dev-board-foundation-decisions.md:157,169,277` DBF-091/169/171).

**B.4 Synthesized planning brief/PRD is governed mutable-then-immutable content.** The synthesized artifact follows Draft→In Review→Approved→immutable with new Draft on change (`docs/plan/dev-board-foundation-decisions.md:276`; `docs/prd/PRD-019-dev-board.md:402-405`; `docs/plan/dev-board-foundation-decisions.md:288` DBF-177).

### Decision C — Invalidation matrix (append-only / revisioned / invalidating)

Three classes are active in implementation:

| Class | What is in it | Mutability rule | Invalidates dependent lanes? | Evidence |
| --- | --- | --- | --- | --- |
| Append-only log | Worklogs, comments, Planning Session Log entries, activity/history records, display-only metadata | immutable entries; superseding corrections append with references | **No** | `docs/plan/dev-board-foundation-decisions.md:154,157,169` DBF-088/091/169; `docs/plan/research/wf230-devticket-command-model.md:806-811` |
| Revisioned governed content | PRD, Planning Brief, RFC/Design Spec, ADR, Runbook, Postmortem, Sprint Plan, Sprint Report (and equivalent governed body fields) | Approved immutable; edits create new Draft revision | **Conditional** | `docs/plan/dev-board-foundation-decisions.md:170,172,173` DBF-170/172/173; `docs/plan/research/wf230-devticket-command-model.md:791-796,860-863` |
| Material invalidator | Material revision/field edit to Approved referenced document and execution contract fields (outcome/scope/safety/acceptance behavior) | forces new revision version and reapproval path | **Yes** | `docs/plan/dev-board-foundation-decisions.md:43,47,78,79,88,89,170,172` DBF-043..047; `docs/prd/PRD-019-dev-board.md:404-405`;
`docs/plan/research/wf230-devticket-command-model.md:739,816-821` |

**C.1 Invalidation hinge.** A Ready Contract Version pins approved document IDs/versions/hashes. If any pinned Approved document changes materially, pin mismatch invalidates readiness (`docs/plan/research/wf230-devticket-command-model.md:739`; `docs/plan/dev-board-foundation-decisions.md:79` DBF-043).

**C.2 Downstream effects.** Invalidated material revisions cascade to ready/sprint gates and review context per lane state (Backlog / Needs re-approval) (`docs/plan/dev-board-foundation-decisions.md:75,77,88,140` DBF-039/041/040/140; `docs/plan/research/wf230-devticket-command-model.md:837,845`).

**C.3 Non-semantic edits do not invalidate.** Whitespace/typography-only edits and non-behavioral metadata changes are excluded from materiality (`docs/plan/dev-board-foundation-decisions.md:42,78` DBF-042/043; `docs/plan/research/wf230-devticket-command-model.md:823-827,860-863`).

**C.4 No retroactive un-Done.** Post-Done material edits do not flip historical Done state; they require follow-up remediation work under Review policy (`docs/plan/research/wf230-devticket-command-model.md:845`; `docs/plan/dev-board-foundation-decisions.md:307` DBF-186).

### Decision D — Mirroring rules to GitHub work history

**D.1 Docs bodies mirror deterministically to GitHub Markdown paths, not Issue body authority.** Mirroring is human-readable deterministic Markdown; Opzava is source-of-truth for content and state (`docs/plan/dev-board-foundation-decisions.md:165-166` DBF-165/166; `docs/prd/PRD-019-dev-board.md:390-391`).

**D.2 Human comment sync is one-to-one; bot/provider comments preserve provider attribution.** Mapped humans map as human actors; unknown/App/bot actors preserve external names, and no hidden model identity is inserted (`docs/plan/dev-board-foundation-decisions.md:87,92` DBF-087/092; `docs/plan/research/wf231-github-mirror-contract.md:567-576,719-730`).

**D.3 Worklogs mirror one immutable comment per milestone with append-only correction semantics.** Meaningful milestones, failures, pauses, handoffs, completion are mirrored as immutable comments; corrections append with pointers; raw noise remains local execution ledger (`docs/plan/dev-board-foundation-decisions.md:88,91,90` DBF-088/091/090; `docs/prd/PRD-019-dev-board.md:78-82`; `docs/plan/research/wf231-github-mirror-contract.md:704-735`).

**D.4 Review summary projection.** Review evidence summaries project contract version/locked SHA/verdict/artifact refs; they are a projection of #229-owned evidence, not Docs documents (`docs/plan/dev-board-foundation-decisions.md:89` DBF-089; `docs/prd/PRD-019-dev-board.md:230-231`).

**D.5 Conflict and sync control.** Same-field conflict (Docs Markdown or mirrored history regions) is resolved through conflict workflow; no blind last-write-wins (`docs/plan/dev-board-foundation-decisions.md:169-171,98` DBF-169/171/098; `docs/plan/research/wf231-github-mirror-contract.md:836-889`).

**D.6 GitHub as proof, not authority.** GitHub comments/events enrich human-visible history and cannot authorize transitions by themselves (`docs/plan/dev-board-foundation-decisions.md:85,96` DBF-085/096; `docs/plan/research/wf231-github-mirror-contract.md:704-735`).

---

## 2. Decision tensions (cross-check synthesis)

1. Foundation documents define the target contract and authority split; WF-230 and WF-231 provide command-concurrency and mirror mechanics that must be composed without redesigning the model. `docs/plan/dev-board-foundation-decisions.md`; `docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/research/wf231-github-mirror-contract.md`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md`.

2. #234 remains synthesis-only in map #228 and should not pre-empt final closure work in #237. Open owner decisions are carried forward for freeze/implementation boundaries. `issues/234`; `docs/plan/research/wf236-releases-gate-contract.md`.

3. WF-230 clarifies execution contract materiality and lane behavior, while DBF/PRD clarifies docs projection and ledger boundaries; #234 must reconcile them for a single invalidation matrix. `docs/plan/research/wf230-devticket-command-model.md`; `docs/plan/dev-board-foundation-decisions.md:42-47,79` DBF-042..047;
`docs/prd/PRD-019-dev-board.md:404-405`.

4. WF-231 introduces stricter actor-class and correction semantics than generic claims and therefore #234 must retain those finer mappings for comments, provider edits, and conflict resolution.

5. `wf232-runner-control-protocol.md` confirms lane freeze/resume semantics must align with Ready/Sprint state transitions and does not introduce alternate authority for Docs revisions.

---

## 3. RESOLVED BY EXISTING DECISIONS

These are inherited directly from locked sources and remain unchanged:

1. Closed nine-type taxonomy + five-state lifecycle (`docs/plan/dev-board-foundation-decisions.md:164,170` DBF-164/170; `docs/prd/PRD-019-dev-board.md:392-394,402-407`).
2. Approved immutability and new-Draft revision on change (`docs/plan/dev-board-foundation-decisions.md:170`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:165-170`).
3. Planning Session Log exclusion of model reasoning/secrets/telemetry (`docs/plan/dev-board-foundation-decisions.md:169`; `docs/prd/PRD-019-dev-board.md:399-401`).
4. Append-only corrections and no rewrite of relied-upon history (`docs/plan/dev-board-foundation-decisions.md:88,91` DBF-088/091).
5. Relations stored by metadata and not content duplication (`docs/plan/dev-board-foundation-decisions.md:167`; `docs/prd/PRD-019-dev-board.md:395-396`).
6. Material revision invalidation for dependent Ready/Sprint approvals (`docs/plan/dev-board-foundation-decisions.md:79`; `docs/prd/PRD-019-dev-board.md:404-405`), anchored by `wf230` readiness pin (`docs/plan/research/wf230-devticket-command-model.md:739`).
7. Review and Release evidence ownership split from Docs docs (`docs/plan/dev-board-foundation-decisions.md:89,155,179,212,236` DBF-089/155/179/212/236; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:91`).
8. Retention split: governed contracts durable/reversible, raw logs/telemetry retention-managed with tombstones (`docs/plan/dev-board-foundation-decisions.md:180,181,178,179`; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:546-562`, PRD-019 US162-163).
9. Four-ledger separation between planning versions, approvals/effects, activity, and execution (`docs/plan/dev-board-foundation-decisions.md:173-177`; `docs/plan/research/wf230-devticket-command-model.md:782-785`).

---

## Open decisions for owner

Each decision below carries a default and is a **recommendation carried to synthesis #237 (not an owner-lock)**.

**O-1 Approval class for Planning Brief, Postmortem, Sprint Report.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Planning Brief requires Human Owner approval; Postmortem should require Human Owner approval; Sprint Report stays auto-finalized immutable snapshot without separate in-Review-ready semantics (`docs/plan/dev-board-foundation-decisions.md:167,172,177,168`).

**O-2 Use of unapproved Research Notes / Planning Session Logs in Ready dependency pins.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Treat only Approved docs as dependency pins for invalidation; unapproved references are visible links but do not trigger readiness invalidation (`docs/plan/dev-board-foundation-decisions.md:171`; `docs/plan/research/wf230-devticket-command-model.md:739`).

**O-3 Canonical state name lock and shorthand policy.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Keep the enum as `{Draft, In Review, Approved, Superseded, Archived}` and forbid freeform `Review` in state storage and UI (`docs/plan/dev-board-foundation-decisions.md:170`; `docs/prd/PRD-019-dev-board.md:402-403`).

**O-4 Docs revision authority and command names.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Reuse the wf230 trusted revision envelope (`Propose/Accept/RejectRevision` + expected-version/correctness guard) for Docs revisions, with Human Owner as decision authority and #218/#232 command seam, no parallel authority lane (`docs/plan/research/wf230-devticket-command-model.md:791-811,860-863`; `docs/plan/dev-board-foundation-decisions.md:49,49` DBF-018; `docs/plan/research/wf232-runner-control-protocol.md`).

**O-5 Docs Markdown mirror conflict handling.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Extend wf231 `ResolveSyncConflict` / three-way field-level model to Docs Markdown regions and carry same no-wholesale-merge limitation (`docs/plan/dev-board-foundation-decisions.md:166`; `docs/plan/research/wf231-github-mirror-contract.md:597-625,836-889`; `docs/plan/research/wf230-devticket-command-model.md:813-814`).

**O-6 Retention for generated planning artifacts attached to session records.**
- **Recommendation carried to synthesis #237 (not an owner-lock):** Keep sanitized Planning Session Log durable; apply configurable TTL only to large raw/transient generation outputs and raw telemetry, with durable summaries and non-sensitive tombstones preserved (`docs/plan/dev-board-foundation-decisions.md:169,180,181` DBF-169/180/181; `docs/adr/ADR-017-dev-board-authority-sync-execution.md:552-562`; `docs/plan/dev-board-foundation-decisions.md:195`).

---

## 4. Sad paths and edge cases

1. **Material doc revision after dependent Done ticket:** do not retroactively un-Done; open follow-up remediation route (`docs/plan/research/wf230-devticket-command-model.md:845`).
2. **Secret in Planning Log or document body:** stop, apply redaction/tombstone, and reconcile mirror-side visibility (`docs/plan/dev-board-foundation-decisions.md:125,161,169,181`; `docs/prd/PRD-019-dev-board.md:419-421`).
3. **Concurrent Opzava + GitHub edit of same Docs Markdown region:** same-field divergence opens sync conflict resolved by owner; no last-write-wins (`docs/plan/dev-board-foundation-decisions.md:98,100,166`; `docs/plan/research/wf231-github-mirror-contract.md:836-889`).
4. **Approval pending while GitHub mirror outcome unknown:** Opzava state remains canonical until confirmation; dependent gates wait for confirmed mirror where required (`docs/plan/dev-board-foundation-decisions.md:102,173`; `docs/plan/research/wf231-github-mirror-contract.md:800-832`).
5. **Archive of relied-upon document:** archive is reversible and historical evidence cannot be erased; owner should reject archive when live unexpired pins still reference it unless override path is implemented (`docs/plan/dev-board-foundation-decisions.md:178-181,307`; `docs/prd/PRD-019-dev-board.md:419-421`).
6. **Postmortem dependency to Incident lifecycle:** Postmortem is a Docs artifact related to Incident metadata, not incident type itself (`docs/plan/dev-board-foundation-decisions.md:67,124,167`).
7. **Sprint Report for canceled sprint:** preserve immutable snapshot with full context, with any corrections as new versions (`docs/plan/dev-board-foundation-decisions.md:150,172`).
8. **Worklog memo pointer stale after revision:** worklog stays historically truthful by stored memo pointer; invalidation is enforced by pinned Ready/Sprint contracts (`docs/plan/dev-board-foundation-decisions.md:7,295`; `docs/plan/research/wf230-devticket-command-model.md:739`).
9. **Research Note cited before approval:** treat as non-authoritative; no dependency lock/invalidation until Approved (`docs/plan/dev-board-foundation-decisions.md:171`).
10. **Release/Review gate spec change:** revised governing spec is material doc revision; it invalidates dependent readiness as a governed doc would (`docs/plan/dev-board-foundation-decisions.md:43,47,89,170,236`; `docs/plan/research/wf236-releases-gate-contract.md`).
11. **GitHub actor deletes mirrored comment/review:** record provider deletion and tombstone; never rewrite Opzava source history (`docs/plan/dev-board-foundation-decisions.md:91`; `docs/plan/research/wf231-github-mirror-contract.md:716-717`).
12. **Collision with #218/#232/#246 authority graph:** Docs authority must stay in existing command seam and schema contracts (`{kind,state,version,contentHash,relations}` from A.1/A.2, plus issue graph node shape) to avoid parallel authority (`docs/plan/dev-board-foundation-decisions.md:164,166,168`; `docs/plan/dev-board-foundation-decisions.md:236`; `issues/234`).

---

## 5. What #234 hands to final synthesis #237

1. Closed-type and state contract with explicit approval-class gaps and retention baseline, plus owner locks for those gaps.
2. Audit-gap resolution that Review/Release Evidence remain non-Docs aggregates with Docs only holding relations and projection summaries.
3. Execution matrix across append-only logs, revisioned governed content, and material invalidators with Ready→Doc pin as the cross-lane invalidation hinge.
4. Clean separation of Planning Session Log append-only rationale from revisioned governed planning outputs.
5. Mirroring invariants for Docs Markdown, comments, worklogs, and review summaries, including conflict and no-last-write-wins controls.
6. Forward-only invalidation behavior (never retroactive un-Done).
7. Explicitly carried open decisions for owner/defaults to be locked in #237.

---

## Citation index (every claim above traces to one of these)

- `issues/234` body and comments including `IC_kwDOS7Gw788AAAABKqONzw` and `IC_kwDOS7Gw788AAAABKd747g`.
- `docs/plan/research/wf236-releases-gate-contract.md`.
- `docs/plan/dev-board-foundation-decisions.md`: DBF-018 `:49`, DBF-033 `:33`, DBF-038 `:38`, DBF-039 `:75`, DBF-040 `:79`, DBF-041 `:81`, DBF-042 `:78`, DBF-043 `:79`, DBF-047 `:88`, DBF-049 `:95`, DBF-055 `:101`, DBF-067 `:123`, DBF-068 `:124`, DBF-082 `:148`, DBF-085 `:85`, DBF-087 `:87`, DBF-088 `:88`, DBF-089 `:89`, DBF-090 `:90`, DBF-091 `:91`, DBF-092 `:158`, DBF-094 `:96`, DBF-095 `:97`, DBF-096 `:96`, DBF-098 `:98`, DBF-100 `:100`, DBF-102 `:102`, DBF-125 `:211`, DBF-140 `:236`, DBF-150 `:246`, DBF-164 `:270`, DBF-165 `:271`, DBF-166 `:272`, DBF-167 `:273`, DBF-168 `:274`, DBF-169 `:275`, DBF-170 `:276`, DBF-171 `:277`, DBF-172 `:278`, DBF-173 `:284`, DBF-174 `:285`, DBF-177 `:288`, DBF-178 `:294`, DBF-179 `:295`, DBF-180 `:296`, DBF-181 `:297`, DBF-186 `:307`, DBF-195 `:180`, DBF-208 `:208`, DBF-209 `:209`, DBF-210 `:210`, DBF-212 `:348`, DBF-233 `:369`, DBF-236 `:372`.
- `docs/prd/PRD-019-dev-board.md`: US42 `:150-151`, US72-82 `:213-235` (US78 `:225-227`, US79 `:228-229`, US80 `:230-231`, US81 `:232-233`, US82 `:234-235`), US143 `:373`, US148 `:385-387`, US150 `:390-391`, US151 `:392-394`, US152 `:395-396`, US153 `:397-398`, US154 `:399-401`, US155 `:402-403`, US156 `:404-405`, US157 `:406-407`, US160 `:412-414`, US161 `:415-416`, US162 `:417-418`, US163 `:419-421`.
- `docs/adr/ADR-017-dev-board-authority-sync-execution.md`: `:5-6,17-27,82-96,91,95-121,162-163,165-170,243-247,533-565,546-562`.
- `docs/plan/research/wf230-devticket-command-model.md`: `:153-156,739,782-785,791-796,806-811,813-814,816-827,834-845,860-863`.
- `docs/plan/research/wf231-github-mirror-contract.md`: `:567-576,597-625,669,704-735,716-717,719-730,800-832,836-889`.
- `docs/plan/research/wf232-runner-control-protocol.md`.
