# WF-237 — Final Dev Board implementation ticket graph + reciprocal Q17 mapping

**Status:** Synthesis artifact for Wayfinder TASK #237 (parent map #228). READ-ONLY research
synthesis produced by the delegated GLM worker. **No git/GitHub writes; no ticket created or
closed.** This document freezes the canonical tracer-bullet schema and publishes the audited
Dev Board implementation graph and the reciprocal `#147–#157` mapping. It is planning authority
only — it authorizes no product code, schema, migration, or route cutover
(`CLAUDE.md` Q17 quarantine; `#237` body; map `#228` "Out of scope").

**Schema owner: `#237` (map #228) / Adopter: `#246` (map #241).** Per the 2026-07-18
`#237 ↔ #246` layered-ownership resolution
(`#237` comment `…5010325286`), `#237` defines the canonical tracer-bullet format, audit
criteria, and assembly rules **once**; `#246` adopts it for Admin Control Center slices and does
**not** define an independent schema. `#237` publishes and freezes this schema first; `#246`
consumes it. The two maps remain sibling synthesis nodes (Dev Board vs Admin CC).

**Authority consumed (not reopened):** `PRD-019` (185 stories + Implementation/Testing
Decisions), `ADR-017` (authority/sync/execution + Releases + Runner amendments),
`docs/plan/dev-board-foundation-decisions.md` (`DBF-001…DBF-249`), migration manifest, and the
six current-input memos `wf230…wf236`. Every claim below cites its source.

**Named dependencies (not reopened here):**
- `#229` (Review Gate) is **still open in a parallel session**; its contract is a **named
  dependency**, not a topic this graph re-derives. `AdmitDone` and the merge outbox stay
  fail-closed until `#229` resolves and `TB-RV1` ships (`wf230:1538-1547`, `wf230:2104-2106`;
  `DBF-134`; `PRD-019:949`).
- `#230/#231/#232/#233/#234/#235/#236` are resolved memos designated current input until `#237`
  consumes and freezes them (map `#228` "Current Wayfinder inputs"; manifest §5).

---

## 0. Canonical tracer-bullet schema (frozen by #237; #246 adopts)

Every implementation tracer bullet (TB) in the Dev Board program is a single independently
grabbable slice that MUST carry the fields below. A TB missing any field is **not cuttable** and
stays out of Todo (`PRD-019:27-34, 484-487`; `wf231:1418-1425`; `DBF-019, DBF-033`).

| Field | Requirement |
| --- | --- |
| `id` | Stable `TB-<vertical><n>` identifier; never renumbered. |
| `title` | One-line outcome (what is true when this lands). |
| `owner` / `seams` | Authoritative bounded owner + named module/port/records (`ADR-017` authority matrix; `wf230:182-204`; `wf231` ownership table). |
| `classification` | Type, Work Areas, Priority, Severity (if applicable), Change Risk; policy-minimum risk (`DBF-057..066`; `PRD-019:52-59`). |
| `human-owner` | Required named Human Owner (`DBF-049`). |
| `secret-refs` | Named secret references or explicit `none`; never values (`DBF-121..125`). |
| `outcome` / `scope` | Clear, falsifiable outcome + bounded scope (`DBF-033`; `PRD-019:27-28`). |
| `deps` / `blocking-edges` | Explicit dependency state + blocker TB IDs (acyclic); unsafe-start prevention (`DBF-044..048`; `PRD-019:32, 47-48`). |
| `sad-paths` | First-class sad-path + edge-case inventory, not afterthoughts (`PRD-019:29-30`; `#210` quality bar). |
| `acceptance` | Objective, falsifiable acceptance criteria (`PRD-019:31`). |
| `e2e-evidence` | User-level E2E expectations: what a user sees/does on the real local Docker stack (`PRD-019:33`; `PRD-019:957-963`). |
| `behavioral-contract` | Final contract at HTTP/DB/provider/browser seams — the shared definition of "correct" for implementation + Review (`PRD-019:34`; `wf231:1418-1424`). |
| `migration` / `rollback` | Expand-contract notes + rollback where the TB touches legacy (`manifest §8`; `DBF-182..186`). |
| `coverage` | PRD-019 story numbers + DBF decision IDs covered exactly once or by explicit shared ownership. |

**Schema-freeze owner:** `#237`. **Schema version:** `wf237-tracer-bullet-v1`. `#246` cites this
exact version when cutting Admin CC slices.

---

## 1. Program graph overview

The graph decomposes the complete Dev Board program into **33 tracer bullets across 10
verticals**, derived from the map `#228` "Not yet specified" clusters, the `wf231` 11 downstream
implementation constraints (`wf231:1395-1416`), the `wf232` build-order constraints
(`wf232:3315-3332`), and the `wf230` six module seams (`wf230:182-204`).

| Vertical | TBs | Source memo / authority |
| --- | --- | --- |
| A. DevTicket command model | `TB-01`, `TB-02` | `wf230` |
| B. GitHub mirror | `TB-GH1…TB-GH11` | `wf231` (11 seams) |
| C. Runner execution | `TB-RN1…TB-RN8` | `wf232` |
| D. Sprint / Incident | `TB-SP1`, `TB-SP2` | `wf233` |
| E. Governed Docs | `TB-DC1` | `wf234` |
| F. Archive / retention / redaction | `TB-AR1` | `wf235` |
| G. Review Gate (impl of `#229`) | `TB-RV1` | `#229` (named dependency) |
| H. Releases Gate | `TB-RL1`, `TB-RL2` | `wf236` |
| I. UI / IA | `TB-UI1`, `TB-UI2`, `TB-UI3` | `PRD-019` views; `DBF-151..163` |
| J. Migration / cutover / Q17 cleanup | `TB-MG1`, `TB-MG2` | manifest §6–§10; `DBF-182..189` |

**Acyclic guarantee + executable frontier.** Edges flow strictly: foundation → integration →
execution → governance gates → UI → cutover. The **safe executable frontier** (no unmet
blockers) is `{ TB-01 }` alone — the DevTicket command spine ships first on real Postgres with
no runner and no GitHub, exactly as `wf230:2092-2097` and the manifest sequencing rule require
(manifest §5: "implementation tracer bullets remain unassigned and unpublished until the Review
Gate and every planning child resolve and `#237` passes an independent audit"). The full
adjacency list is in §3.

---

## 2. Tracer bullets

> Compact schema instances. Each is independently grabbable. "Shared ownership" is stated
> explicitly where a story/decision is covered jointly.

### Vertical A — DevTicket command model (`wf230`)

#### `TB-01` — DevTicket command spine & planning lifecycle
- **owner/seams:** `DevBoard` bounded context; Work Contract module + Dependency module +
  Activity module + Projection module; `DevBoardMirrorPort` + `RunnerControlPort` *port
  contracts* (interfaces only) (`wf230:182-204`). **Four-ledger persistence skeleton**
  (`wf230:69-71, 1778-1807`).
- **classification:** Feature; Backend/API, Data/Database; P1; Risk Medium.
- **human-owner:** Platform lead. **secret-refs:** `none`.
- **outcome/scope:** A real Postgres command seam: trusted `CommandEnvelope`, idempotency
  receipt store, authorization version, Secret-Safe Ingress gate, `withTenant` transaction-first
  outbox, DevTicket aggregate (Backlog/Todo), Ready Contract Version + exact-hash Ready
  Approval, Proposal lifecycle, dependency graph with cycle detection + completion lock,
  ReorderTodo, classifications, roles, reversible archive + Historical Projection, legacy
  import. The `Claim/Start`, `SubmitForReview`, `AdmitDone` commands are **defined here but
  wired fail-closed** until `TB-02`/`TB-RN`/`TB-RV1` land (`wf230:1538-1547`).
- **deps:** none. **Frontier 0.**
- **sad-paths:** same-key/different-hash `idempotency_conflict` (`wf230:1900`); unauthorized key
  probe → 403 before reservation (`wf230:1901`); expected-version drift rejects whole command,
  zero partial writes (`wf230:1903`); dependency cycle rejected (`wf230:1993`);
  `dependency_locked` on incomplete blocker (`wf230:1067-1071`); archive rejects on live
  lease/Review/Sprint/containment (`wf230:2052-2057`); legacy import lacks Human Owner →
  Historical Projection only (`wf230:2059`); tenant RLS denial = hard 403, never empty success
  (`wf230:2094-2095`).
- **acceptance:** one winning claim semantics; duplicate/stale commands replay identically;
  outbox atomicity under crash; RLS denial non-empty.
- **e2e-evidence:** Admin shapes a Proposal, accepts to Backlog, completes + approves Ready →
  Todo, edits managed contract → material edit returns to Backlog; dependency lock visible in
  Todo (`PRD-019:957-963`).
- **behavioral-contract:** lane is Opzava-owned; GitHub/Runner/projection cannot move a Card;
  same authorized key returns original result; stale projection snap-back with precise gate
  reason (`wf230:1898-1902, 2058`).
- **migration/rollback:** expand-contract target storage alongside legacy Task/Issue; legacy IDs
  preserved as aliases (`manifest §8`; `DBF-182-183`).
- **coverage:** PRD-019 `1-7, 24-59, 137, 147-149, 153, 156-157, 160-163, 185` partial;
  DBF `001-048, 057-066, 173-177, 182-186`.

#### `TB-02` — DevTicket execution lifecycle (claim/start/Blocked/Review-handoff/containment)
- **owner/seams:** Execution Admission module (`wf230:190-192`); consumes `RunnerControlPort`.
- **classification:** Feature; Backend/API, Agent Runtime; P1; Risk High (requires human
  approval per `DBF-065`).
- **human-owner:** Platform lead. **secret-refs:** `none`.
- **outcome/scope:** Assignment; two-phase Claim/Start saga (Phase A `PrepareClaim` →
  registration + Enforcer-arm + typed grant-activation → Phase B `AcceptExecutionStarted`);
  Blocked + `BlockedEpisode` + `ResolveOrSupersedeBlock`; Material Revision interruption
  (`Finalize`/`Abort`); Review Handoff skeleton + Review WIP=3 + changes-requested top/bottom
  ranking; `AdmitDone` fail-closed until `TB-RV1`; Absolute Stop + Policy Exception; loss /
  containment (`DetectExecutionLoss`, `ReconcileRunnerContainment`, `FinalizePreStartAdmissionLoss`)
  (`wf230:1098-1547, 1867-1888`).
- **deps:** `TB-01`; `TB-RN5` (for real-runner start; may ship first against the deterministic
  fake Harness Adapter per `wf232` suite 4).
- **sad-paths:** no false In Progress (Card stays Todo `Starting` until `AcceptExecutionStarted`)
  (`wf230:1968, 1971`); verified start receipt loses race to fence/loss → evidence-only
  (`wf230:1977`); accepted-start vs loss vs rejection vs Revision → exactly one finalizer
  (`wf230:1921`); external merge → Sync Conflict + Post-Merge Review, never ordinary `AdmitDone`
  (`wf230:1957`); material Finalize lacking exact `#229` proof retains Review/WIP
  (`wf230:1986`); Absolute Stop over finalized Review Handoff preserves handoff + opens `#229`
  containment requirement (`wf230:2031`).
- **acceptance:** Review WIP hard cap ≤3; fresh-claim recovery uses new lease/fence/nonce
  (`wf230:1435-1443`); DB lease fencing alone insufficient (`wf230:2079`).
- **e2e-evidence:** claim → start → disconnect → `Blocked — Connection Lost / Execution Unknown`
  with branch-accurate Slack summary → fresh claim, old lease never resumed (`PRD-019:99-104`).
- **behavioral-contract:** work actually started before In Progress; Blocked is reasoned (last
  checkpoint or explicit `execution_unknown`); recovery never resurrects an old lease.
- **migration/rollback:** legacy `in_progress` → Blocked/legacy-execution-reconciliation, never a
  minted lease (`manifest §6`; `DBF-110`).
- **coverage:** PRD-019 `8-23, 60-69, 79-95, 99-104, 129-136, 164-176` partial; DBF `049-056,
  103-113, 126-133, 190-207`.

### Vertical B — GitHub mirror (`wf231`, 11 seams)

#### `TB-GH1` — GitHub App bootstrap + Bindings + dimensional health + secure install proof
- **owner/seams:** `DevBoard.GitHubIntegration` module; `CodeHostInstallationPort`; App
  Registration Ref (platform-owned); Installation/Repository/Issue Bindings (tenant RLS)
  (`wf231:159-216`).
- **classification:** Feature; GitHub Integration, Security, Backend/API; P1; Risk High.
- **human-owner:** Platform lead. **secret-refs:** platform vault refs (App private-key /
  client-secret / webhook-secret); tenant rows carry only opaque public App config/rotation
  version (`wf231:218-229`).
- **outcome/scope:** one GitHub App; secure install flow (signed state, PKCE, bounded
  client-secret exchange, ephemeral user-access-token installation proof, mandatory expiring
  user tokens); immutable provider IDs; one production Repository Binding; dimensional health
  (`wf231:250-360, 1034-1084`).
- **deps:** `TB-01` (DevTicket aggregate to attach Issue Bindings).
- **sad-paths:** spoofed `installation_id` rejected until same Admin's user token proves access
  (`wf231:1089`); Admin demoted mid-round-trip → fail closed, no binding (`wf231:1090`); lost
  cleanup response / refresh `202 Accepted` → quarantined handle, `refresh_revocation_accepted_unconfirmed`,
  no local zeroing (`wf231:1091`); second production repo rejected (`wf231:1093`); tenant
  projection requesting secret-ref version denied (`wf231:1092`).
- **acceptance:** setup fail-closed when expiring-user-token disabled; tenant API/DTO/RLS/browser
  contain no platform secret ref/version (`wf231:1164-1171, 1337-1338`).
- **e2e-evidence:** Admin installs App without entering a token; sees truthful
  healthy/degraded/unhealthy/unverifiable health (`wf231:1296-1299, 1332`).
- **behavioral-contract:** App authentication alone never binds a tenant; recovery needs restored
  capability **and** a complete reconciliation, not one API call (`wf231:52-53, 1073-1084`).
- **migration/rollback:** retires `GITHUB_TOKEN`/PAT + OAuth device flow; credential destruction
  only on documented `204`/`404`/expiry (`wf231:1364-1371`).
- **coverage:** PRD-019 `70-71, 95`; DBF `079-081`.

#### `TB-GH2` — Verified webhook HTTP inbox + Secret-Safe receipt + Postgres RLS/dedupe
- **owner/seams:** Integration module webhook inbox; `wf230` Secret-Safe Ingress; dedupe key
  `(opaque_public_app_config_key, X-GitHub-Delivery)` (`wf231:408-480`).
- **classification:** Feature; GitHub Integration, Security, Backend/API; P1; Risk High.
- **deps:** `TB-GH1`.
- **sad-paths:** invalid signature rejected before parse/route/persist (`wf231:1094`);
  malformed minimal envelope rejected (`wf231:1095`); actionless `create/delete/push/status`
  admitted with no invented action (`wf231:1096`); schema/action disagreement → unhealthy
  capability (`wf231:1097-1098`); same delivery/different valid hash → unverifiable + scoped stop
  (`wf231:1101`); durable inbox commit fails → non-2xx so GitHub re-delivers (`wf231:1102`); secret
  in content → no raw value, secret stop (`wf231:1106`).
- **acceptance/e2e:** real signed raw fixtures through the real HTTP route + real Postgres
  RLS/worker (`wf231:1159-1189`).
- **behavioral-contract:** nothing parses before HMAC; raw payloads never persist; workers only
  translate authenticated facts into the same command boundary (`wf231:430-450`).
- **coverage:** PRD-019 `84, 90-91`; DBF `080, 095-097`.

#### `TB-GH3` — Create/link Mirror Outbox Intent + unknown-outcome recovery + `ResolveUnknownMirrorEffect`
- **owner/seams:** Integration mirror outbox; `WorkItemMirrorPort`; `GitHubIssueBinding`
  (`wf231:481-560, 800-832`).
- **classification:** Feature; GitHub Integration, Backend/API; P1; Risk High.
- **deps:** `TB-GH1`, `TB-01`.
- **sad-paths:** create response lost → `outcome_unknown`; zero matches never auto-reissue
  (`wf231:1107-1108`); duplicate exact App-created Issues → earliest canonical, cross-link/close
  later (`wf231:1109`); create marker dropped/changed → identity conflict, no fallback to mutable
  `event` UUID (`wf231:1110-1113`); copied marker under non-App actor → not confirmed
  (`wf231:1114, 1120`); Human-Owner reattempt races late provider object → one receipt, deterministic
  containment (`wf231:1118`).
- **acceptance/e2e:** `AcceptProposal(create)` shows one Backlog DevTicket + stable pending create
  identity before provider Issue exists, later attaches exactly one Issue (`wf231:1182-1186,
  1300-1302`); ambiguous effect stays visibly unknown across zero-match scans, then Human Owner
  keeps waiting / abandons / approves one numbered reattempt (`wf231:1315-1318`).
- **behavioral-contract:** identity-bearing effects require stable correlation + verified
  App/provider identity; absence is never inferred from zero scans.
- **coverage:** PRD-019 `2-7, 72-73`; DBF `081-083`.

#### `TB-GH4` — Managed body/labels + comment/worklog identity + Mirror Shadows + `ResolveSyncConflict`
- **owner/seams:** Integration canonical renderer/parser; managed-label deltas; per-field
  Mirror Shadows; `ResolveSyncConflict` (`wf231:561-735, 834-889`).
- **classification:** Feature; GitHub Integration, Backend/API; P1; Risk Medium.
- **deps:** `TB-GH3`.
- **sad-paths:** GitHub body edit inside final no-CAS window → no lossless claim,
  `potential_body_overwrite` side-by-side recovery (`wf231:1122`); singleton label multiple
  values → field conflict (`wf231:1124`); multiple mapped GitHub assignees → block start,
  unmapped collaborators preserved (`wf231:1126-1127`); AI-agent assignee with zero mapped users
  → converged, no fabricated mapping (`wf231:1127`); two Human Owners resolve one conflict → one
  winner under locks (`wf231:1130`); accepted conflict choice needing separate Revision →
  `decision_required`, blocking, no mirror write (`wf231:1131`); provider drifts while resolution
  pending → supersede, refresh conflict (`wf231:1132`).
- **acceptance/e2e:** managed-contract edit becomes a Revision not an overwrite; same-field
  Sync Conflict resolved in Opzava then mirrored back; truthful human/App/bot/unknown comment
  attribution (`wf231:1303-1320`).
- **behavioral-contract:** GitHub edits to governed fields are proposed revisions, never
  authoritative; whole-body no-CAS limitation is stated plainly (`wf231:596-625`).
- **coverage:** PRD-019 `72-93`; DBF `082-094, 098-102`.

#### `TB-GH5` — Provider development-fact projection + PR/base/head/SHA correlation
- **owner/seams:** `DevelopmentFactsPort`; provider observations; PR binding
  (`wf231:892-923`).
- **classification:** Feature; GitHub Integration, Frontend; P2; Risk Medium.
- **deps:** `TB-GH1`.
- **sad-paths:** force-push/base-head drift → append fact, invalidate SHA evidence
  (`wf231:1143`); mergeability unknown → refresh, no remediation inference (`wf231:1144`);
  free-text `#123`/branch/commit hints → correlation proposals only, never auto-attach.
- **acceptance/e2e:** Card shows PR/CI/behavioral/approval/merge status without opening GitHub
  (`PRD-019:149`; `wf231:1327`).
- **behavioral-contract:** green/native approval is never independent Review; provider fact never
  owns Runner execution (`wf231:908-912`).
- **coverage:** PRD-019 `93, 144-145, 149`; DBF `093`.

#### `TB-GH6` — OIDC Actions request translation + Needs Human Approval Request
- **owner/seams:** Actions OIDC verifier; `Actions Request Receipt`; exactly-one downstream
  result (`wf231:924-977`).
- **classification:** Feature; GitHub Integration, Security; P2; Risk High.
- **deps:** `TB-GH2`, `TB-01`.
- **sad-paths:** OIDC `jti`/nonce reuse → one atomic receipt, mismatch loses (`wf231:1149`);
  replay/claim drift → same-hash replay or reject (`wf231:1150`); uncorroborated deployment fact
  → zero receipt (`wf231:1148`); generic governed command or deployment/rollback/release
  mutation → rejected outside exhaustive `wf230` source policy (`wf231:1147`).
- **acceptance/e2e:** corroborated native check/deployment fact appends one Provider Observation;
  `ready.validate` commits its command receipt; eligible failed gate opens one Needs Human
  Approval Request — each shows only its designated receipt (`wf231:1198-1204, 1321-1325`).
- **behavioral-contract:** Actions may not approve its own request, claim a human identity, or
  widen authority via adapter config (`wf231:962-977`).
- **coverage:** PRD-019 `17, 77`; DBF `017`.

#### `TB-GH7` — `#229`-governed merge + external-merge / Post-Merge Review  *(shared with `TB-RV1`)*
- **owner/seams:** `CodeHostMergePort`; merge outbox — dispatches **only** a `#229`-authorized
  exact merge (`wf231:186-187, 912-923`).
- **classification:** Feature; GitHub Integration, Security; P1; Risk High.
- **deps:** `TB-RV1` (Review Gate must authorize the merge), `TB-GH5`.
- **sad-paths:** external/early merge → retain Review/WIP, open conflict, require Post-Merge
  Review, never ordinary `AdmitDone` (`wf231:1145`; `wf230:1957`).
- **acceptance/e2e:** governed merge observed only after `#229` Review Exit Containment Proof;
  external merge requires Post-Merge Review and shows no false Done (`wf231:1326`).
- **behavioral-contract:** merge outbox exists only after `#229` locks proof+authorization;
  GitHub's exact merged state must be observed/correlated before `AdmitDone` (`wf231:912-922`).
- **coverage:** PRD-019 `18-19, 149`; DBF `133`. **Shared ownership with `TB-RV1`.**

#### `TB-GH8` — `#232`-governed merge-conflict remediation  *(shared with Vertical C)*
- **owner/seams:** Integration observes PR conflict evidence → requests remediation; `#232`
  provisions fenced Runner attempt; `Authorized Git Ref Update` record (`wf231:978-1033`).
- **classification:** Feature; Agent Runtime, GitHub Integration; P2; Risk High.
- **deps:** `TB-RN7` (artifact ingress + exact-ref handoff), `TB-GH5`.
- **sad-paths:** base/head drift before push → cancel/supersede; new remediation SHA invalidates
  stale evidence → returns through independent Review (`wf231:992-996`); bounded-attempt
  exhaustion → visible, notify Human Owner.
- **acceptance/e2e:** agent-authored conflicts resolved in isolated worktree, affected checks
  rerun, fresh Review (`PRD-019:94`; `wf231` seam 8).
- **behavioral-contract:** conflict agent never gets general GitHub write/merge authority; new
  SHA never inherits an earlier verdict (`wf231:996`; `ADR-017:331-342`).
- **coverage:** PRD-019 `94`; DBF `094`. **Shared ownership with `TB-RN7`.**

#### `TB-GH9` — Reconciliation/health recovery + legacy OAuth/PAT/outbox cutover
- **owner/seams:** `Reconciliation Epoch`; three-way per-field algorithm; legacy credential
  drain (`wf231:737-833, 1345-1375`).
- **classification:** Feature; GitHub Integration, Backend/API; P1; Risk High.
- **deps:** `TB-GH2`, `TB-GH3`, `TB-GH4`.
- **sad-paths:** partial epoch cannot declare absence/health (`wf231:1154`); stale outbox
  finalizer → claim token/generation rejects (`wf231:1155`); `404` not deletion until repo
  capability proven (`wf231:1140`); `410` → Issues capability unavailable (`wf231:1141`);
  rate `403`/`429` → distinct backoff, no retry storm (`wf231:1139`); missed delivery → periodic
  full reconciliation discovers drift (`wf231:1104`).
- **acceptance/e2e:** complete reconciliation detects deletion of an old bound comment even when
  its webhook was missed — two consecutive identical complete traversals required
  (`wf231:1105`; `PRD-019:1004-1007`).
- **behavioral-contract:** a successful probe never resolves unhealthy/unverifiable state;
  recovery requires complete post-repair reconciliation + drained unknown/dead work
  (`wf231:1073-1084`).
- **coverage:** PRD-019 `90-91`; DBF `080, 095-097, 102`. **Shared ownership with `TB-MG1`.**

#### `TB-GH10` — `DisconnectGitHub` saga
- **owner/seams:** `GitHub Disconnect Saga`; binding-generation uniqueness; outbound fence
  (`wf231:366-406, 1186-1211`).
- **classification:** Feature; GitHub Integration, Security; P2; Risk High.
- **deps:** `TB-GH1`, `TB-GH9`.
- **sad-paths:** replayed disconnect → one saga; mismatch rejects; fenced generation admits no
  new mint/claim (`wf231:1135`); provider uninstall/revoke response lost →
  `provider_outcome_unknown`, reconcile, never infer success from local deletion (`wf231:1136`);
  account-owner action needed → `revocation_required`, reconnect disabled (`wf231:1137`).
- **acceptance/e2e:** disconnect through secure UI with lost provider response; Card/Admin shows
  `disconnecting`/`provider_outcome_unknown`/`revocation_required`; reconnect disabled until
  terminal disconnect → new binding generation (`wf231:1242-1246, 1329-1331`).
- **behavioral-contract:** local deletion never proves provider revocation; platform App
  registration secrets are never tenant-deleted by disconnect (`wf231:397-402`).
- **coverage:** PRD-019 `70`; DBF `079`.

#### `TB-GH11` — `Authorized Git Ref Update` response-loss reconciliation  *(shared with Vertical C)*
- **owner/seams:** `Authorized Git Ref Update` compare-and-reconcile lifecycle; trusted Git
  transport broker (`wf231:1000-1029, 1395-1416`).
- **classification:** Feature; GitHub Integration, Security; P2; Risk High.
- **deps:** `TB-RN7`, `TB-GH5`.
- **sad-paths:** lost push + ref == intended new SHA → confirm existing record, no second run
  (`wf231:1151`); ref == old SHA → bounded unresolved, no blind repush (`wf231:1152`); ref ==
  third SHA → `ref_conflict`, fresh authorization required (`wf231:1153`).
- **acceptance/e2e:** fault-inject response loss; observe intended-new / old / third-SHA →
  confirmation / bounded escalation / conflict, exactly one remediation run (`wf231:1282-1286,
  1339-1341`).
- **behavioral-contract:** no reconciliation path launches a duplicate remediation run or blind
  push.
- **coverage:** PRD-019 `94`; DBF `094`. **Shared ownership with `TB-RN7`.**

### Vertical C — Runner execution (`wf232`)

#### `TB-RN1` — Runner enrollment (local + cloud) + Registry + WSS role/path + capability admission
- **owner/seams:** Runner Registry + Runner Protocol + transport Adapter; `RunnerControlPort`
  server side; outbound `wss://broker.<domain>/v1/runner` on the single public ingress
  (`wf232:222-240, 242-289`).
- **classification:** Feature; Agent Runtime, Security, Infrastructure; P1; Risk Critical.
- **human-owner:** Platform lead. **secret-refs:** Runner Ed25519 private key (platform keystore);
  Cloud Workload Issuer Policy (OIDC).
- **deps:** `TB-01` (`RunnerControlPort` contract).
- **sad-paths:** cloud enrollment missing `jti`/wildcard subject/replay/stale issuer → fail
  closed, Unavailable (`wf232:2964-2966`); no verified issuer policy → cloud Unavailable
  (`wf232:347-348`); capability drift after claim → block admission, invoke containment
  (`wf232:2976`); unsupported platform/version/mode → renders unavailable, not silently healthy
  (`wf232:3279-3292`).
- **acceptance/e2e:** real-user browser → Admin enrollment → CLI bootstrap/fingerprint → explicit
  pinned Codex CLI selection → challenge-bound Capability Admission → Todo claim/start → In
  Progress (`wf232:3251-3277`).
- **behavioral-contract:** enrollment is key-possession, **not** hardware attestation — product
  says "compatible/verified Adapter" not "trusted device" (`wf232:826-828`); trust graph is
  non-transitive — MCP link / OpenClaw Node / vendor login / Runner enrollment / process
  registration are distinct identities (`wf232:209-220`).
- **coverage:** PRD-019 `96-98, 104`; DBF `103-107, 238-239`.

#### `TB-RN2` — Runner Protocol signed frames + delivery/inbox + fact admission + golden vectors
- **owner/seams:** Runner Protocol canonical bytes/signatures; Server Command Trust Bundle; Fact
  Admission ACK snapshot/delivery (`wf232:1256-1551, 1552-1754`).
- **classification:** Feature; Agent Runtime, Security; P1; Risk High.
- **deps:** `TB-RN1`.
- **sad-paths:** sequence gap → `pending_gap`, never applied; if unrecoverable → execution
  unknown, loss containment (`wf232:2210-2215, 2985`); lost ACK → fact remains journaled, latest
  signed snapshot replays (`wf232:1730-1743, 2986`); command delivered twice → exact original
  disposition, one local action (`wf232:2986`); key revoked mid-flight → after-cutover frame
  rejected, lease contained (`wf232:2971`).
- **acceptance/e2e:** golden-vector suite (cross-language byte-identical) + real loopback WSS
  enrollment/connection/delivery/reconnect (`wf232:3021-3136`).
- **behavioral-contract:** transport ACK proves only bytes; a receipt is trusted only under
  enrolled key + lease + nonce + monotonic sequence + exact contract version + repo/worktree/
  branch/SHA + admitted capability (`wf232:447-466`).
- **coverage:** PRD-019 `99, 103`; DBF `107-108, 240-242`.

#### `TB-RN3` — Harness Supervisor + Adapters + per-attempt worktree/process mechanics
- **owner/seams:** Harness Supervisor; Harness Adapters (Codex Desktop/CLI, Claude Code);
  per-attempt worktree generation + branch namespace (`wf232:2473-2644`).
- **classification:** Feature; Agent Runtime; P1; Risk High.
- **deps:** `TB-RN2`.
- **sad-paths:** symlink escape / `..` / NUL / nested repo / worktree outside root / branch
  collision → rejected + quarantined (`wf232:2481-2486`); PID-reuse defense; 11 crash/race
  windows with explicit contracts (`wf232:2452-2471`).
- **acceptance/e2e:** real OS repo + `git worktree` + spawned process group; checkpoint;
  kill/restart daemon; reconcile; stop/quarantine (`wf232:3193-3216`).
- **behavioral-contract:** every execution uses its own worktree + branch; generic remote-shell
  strings forbidden (`wf232:241`; `DBF-106`).
- **coverage:** PRD-019 `100`; DBF `106, 245`.

#### `TB-RN4` — Lease Enforcer (arm/renew/fence) + OS-supervised containment + time anchor
- **owner/seams:** Lease Enforcer module (outside daemon + harness); signed NTP-style time
  anchor (`wf232:2246-2451`).
- **classification:** Feature; Agent Runtime, Security; P1; Risk Critical.
- **deps:** `TB-RN2`.
- **sad-paths:** daemon death / Enforcer death / DB fencing / socket loss alone never prove stop
  (`wf232:2460-2471`); DB fencing cannot stop a process with FS/network access (`wf232:2248-2250`);
  clock-skew handled by conservative monotonic deadline (`wf232:2352-2378`).
- **acceptance/e2e:** independent Enforcer containment when daemon, Enforcer, or both die
  (`wf232:3193-3216`).
- **behavioral-contract:** loss of renewal/control authority removes grants and
  stops/quarantines the containment set; the seven authority-reducing autonomous facts survive
  Runner-key revocation (`wf232:1805-1818, 2380-2417`).
- **coverage:** PRD-019 `99, 102`; DBF `107-108, 243`.

#### `TB-RN5` — Pre-spawn Process Registration + Lease Secret Broker + start ordering
- **owner/seams:** Process Registration reservation; Lease Secret Broker (outside harness
  process tree); typed `activate_secret_grants` (`wf232:2165-2191, 2594-2625, 2645-2822`).
- **classification:** Feature; Agent Runtime, Security; P1; Risk Critical.
- **human-owner:** Platform lead. **secret-refs:** named secret-reference → Lease Credential
  Access Grant → opaque grant handle (values never returned to Opzava).
- **deps:** `TB-RN3`, `TB-RN4`.
- **sad-paths:** partial/failed grant activation → typed safe failure, dispose grants, forbid
  spawn (`wf232:245-246`); concurrent Broker last-use race → one reservation wins, loser never
  resolves secret (`wf232:3007`); local disposal ≠ upstream revocation (`wf232:2694-2697`).
- **acceptance/e2e:** secret canary absent from every WSS frame/Postgres row/outbox/inbox/
  journal/log/Slack/GitHub/diff/checkpoint/evidence (`wf232:3218-3232`).
- **behavioral-contract:** spawn structurally impossible until registration + Enforcer-arm +
  grant-activation accepted, then one `start_execution`; values never enter frames/prompts/args/
  paths/receipts/logs (`wf232:2620-2624`; `DBF-121-125`).
- **coverage:** PRD-019 `99, 110-112`; DBF `121-125, 246`.

#### `TB-RN6` — Reconnect reconciliation + fresh `ClaimAndStart` + disconnect containment + no-failover
- **owner/seams:** `request_reconciliation_observation`; Pre-Start Admission Loss vs Blocked
  selection; loss detector (`wf232:45-47, 2329-2339, 2925-2933`).
- **classification:** Feature; Agent Runtime; P1; Risk High.
- **deps:** `TB-RN4`, `TB-02`.
- **sad-paths:** host powered off → preserve last checkpoint or `execution_unknown`, fence/revoke,
  branch-accurate Slack summary, no "safely stopped" inference from socket drop (`wf232:3000`);
  local disconnect never triggers cloud failover (`wf232:3306`).
- **acceptance/e2e:** cut network mid-run → liveness expires → Blocked/Execution Unknown →
  preview revoked → Slack summary → reconnect → fresh claim (old lease/process never resumed,
  verified worktree may be adopted) (`wf232:3251-3277`).
- **behavioral-contract:** reconnect uploads Reconciliation Observation + contains old authority;
  continuation uses fresh claim/lease/fence/nonce/start receipt (`wf232:45-47`).
- **coverage:** PRD-019 `101-104`; DBF `110-113, 192, 207, 244`.

#### `TB-RN7` — Artifact ingress + exact-ref handoff → `#231` broker publication  *(shared with Vertical B)*
- **owner/seams:** signed/scanned artifact ingress; `prepare_object_bundle_upload` →
  `prepare_exact_ref_publication`; trusted Git transport broker (consumer) (`wf232:2487-2587`).
- **classification:** Feature; Agent Runtime, GitHub Integration, Security; P2; Risk Critical.
- **deps:** `TB-RN3`, `TB-GH1`.
- **sad-paths:** artifact admission expiry / digest mismatch / object-graph invalid → fail
  without handoff (`wf232:2577-2579, 3214-3216`); Runner never obtains raw write-capable token or
  pushes outside broker-authorized exact old/new SHA (`wf231:1287-1288`).
- **acceptance/e2e:** admit + scan one immutable object bundle; reject changed/expired/cross-tenant
  refs + digest/graph substitutions; fault-inject lost push → intended-new/old/third-SHA
  outcomes (`wf231:1282-1288`).
- **behavioral-contract:** neither upload nor WSS submission is provider acceptance; Runner has
  no GitHub write credential (`wf232:2491-2501`; `DBF-246`).
- **coverage:** PRD-019 `94`; DBF `094`. **Shared ownership with `TB-GH8`/`TB-GH11`.**

#### `TB-RN8` — Slack / Ask Admin / MCP provenance adapters + `human_input_required` / `policy_denied`
- **owner/seams:** Slack approval Adapter; Ask Admin command Adapter; MCP command Adapter; typed
  governed outcomes (`wf232:2074-2191, 2828-2871`).
- **classification:** Feature; Agent Runtime, Backend/API; P1; Risk High.
- **deps:** `TB-RN2`, `TB-01`.
- **sad-paths:** Slack free text/"approve" → not approval without server-owned action token
  (`wf232:2851-2853`); stale target/version/expired-replayed nonce → rejected; Ask Admin
  receives no implied `operator.admin`; Lead Orchestrator may recommend/dispatch/pause/escalate
  but never becomes Human/assignee/Runner/Reviewer/secret-broker (`wf232:2867-2871`).
- **acceptance/e2e:** real Slack handler + signed raw-body fixtures + real Ask Admin route +
  real MCP link with token hash/scope/expiry/revocation/role/cross-tenant checks
  (`wf232:3234-3249`).
- **behavioral-contract:** all request sources enter the same server-owned command seam;
  adapters authenticate provenance only, never authority (`wf232:55-57, 247`).
- **coverage:** PRD-019 `105-112`; DBF `114-120, 247`. **Cross-link: feeds `#216`, `#218`,
  `#219`.**

### Vertical D — Sprint / Incident (`wf233`)

#### `TB-SP1` — Sprint aggregate + autonomous_serial + activation preflight + history + Milestone mirror
- **owner/seams:** Sprint context (separate from DevTicket; DevTicket stores membership ref only)
  (`wf230:177-180`); Sprint Plan revision/binding carry-forward.
- **classification:** Feature; Backend/API; P1; Risk High.
- **deps:** `TB-02`, `TB-GH4` (Milestone/tracking-issue mirror), `TB-RN6` (Sprint lease under
  preset).
- **sad-paths:** standalone material revision/dependency on nonterminal Sprint member → reject
  (`wf230:1995`); Sprint controller stale Plan/non-next/second item → reject (`wf230:1967`);
  topological-order violation → reject approval/activation (`wf230:1997`); Sprint automation
  borrowing ordinary capacity for a second Sprint DevTicket → forbidden (`DBF-204`); second
  Active Sprint → rejected globally (`DBF-204`).
- **acceptance/e2e:** many Drafts, one Approved/Queued, one Active; exactly one in-flight Sprint
  DevTicket; next item waits for Review Handoff finalization; blocking discovery proposes Plan
  revision, non-blocking stays Backlog (`PRD-019:118-137, 1057-1062`).
- **behavioral-contract:** `autonomous_serial` serial order is preserved even when the Runner has
  separate ordinary capacity; Sprint history immutable; tracking issue closes only when all
  remaining Plan items Done (`ADR-017:513-528`; `DBF-148-149`).
- **coverage:** PRD-019 `118-137`; DBF `135-150, 190-191, 204`.

#### `TB-SP2` — Incident projection + governed interruption + ordinary claiming + fresh-claim recovery
- **owner/seams:** Incident projection (read-only); governed interruption command path
  (`wf233:9-65`).
- **classification:** Feature; Backend/API, Security; P2; Risk High.
- **deps:** `TB-02`, `TB-SP1`.
- **sad-paths:** Incident never mutates lane/lease/claim directly (`wf233:117`); no silent
  preemption even for P0 (`wf233:119`); `BlockedEpisode` not auto-cleared on incident close
  (`wf233:63`); cloud execution overlap risk if failover treated as implicit (`wf233:130`).
- **acceptance/e2e:** Incident visible as attention projection + optional BlockedEpisode
  annotation; permanent fix → linked Bug/Technical Task through normal gates; pause/reopen
  matrix per state row (`PRD-019:61-64, 71`; `wf233:55-65`).
- **behavioral-contract:** Incident is projection only; governed, audited, command-path
  interruption; explicit claim-on-command ordinary work; stale lease never resumed
  (`wf233:115-122`).
- **coverage:** PRD-019 `61-64, 71`; DBF `067-071`. **Carries `wf233` OPEN #1-#6 to lock
  (§8).**

### Vertical E — Governed Docs (`wf234`)

#### `TB-DC1` — Governed Docs aggregate + Planning Session Log + invalidation matrix + Markdown mirror
- **owner/seams:** Docs module; nine-type closed taxonomy + five-state enum (`In Review`, not
  freeform `Review`); Ready→doc-version pin; `ResolveSyncConflict` extended to Docs Markdown
  (`wf234:31-86`).
- **classification:** Feature; Documentation, Backend/API, Frontend; P2; Risk Medium.
- **deps:** `TB-01` (revision envelope reuse — `wf234` O-4), `TB-GH4` (mirror conflict model —
  `wf234` O-5).
- **sad-paths:** material doc revision after dependent Done → no retroactive un-Done, follow-up
  remediation (`wf234:147`); secret in doc body → stop/redact/tombstone (`wf234:148`); concurrent
  Opzava+GitHub Docs edit → same-field conflict, no LWW (`wf234:149`); archive of relied-upon doc
  with live pins → reject unless override (`wf234:151`); GitHub actor deletes mirrored comment →
  provider deletion + tombstone, no Opzava rewrite (`wf234:157`).
- **acceptance/e2e:** author PRD/ADR/Sprint Plan in Opzava → deterministic Markdown mirror;
  material revision invalidates dependent Ready/Sprint approval via pin mismatch; Planning
  Session Log append-only (`PRD-019:143-156`).
- **behavioral-contract:** Review/Release Evidence are **not** Docs types (owned aggregates
  projected as summaries); Opzava is source-of-truth, GitHub is proof never authority
  (`wf234:38-39, 76-86`).
- **coverage:** PRD-019 `143-156`; DBF `164-172`. **Carries `wf234` O-1..O-6 to lock (§8).**

### Vertical F — Archive / retention / redaction (`wf235`)

#### `TB-AR1` — Retention/TTL + tombstone schema + exceptional redaction + governed restore + revocation confirmation
- **owner/seams:** cross-ledger retention matrix; four-ledger tombstone schema (Releases
  contamination model as template, `DBF-226`); idempotent terminal-disposition revocation
  (`wf235:39-100`).
- **classification:** Feature; Backend/API, Security; P2; Risk High.
- **deps:** `TB-01`, `TB-GH10` (GitHub managed-comment tombstone path), `TB-RN5` (grant
  disposal).
- **sad-paths:** expirable raw referenced by durable relied-upon ref at TTL → block expiry /
  promote (`wf235:168`); `ResolveAbsoluteStop` with unconfirmed revocation leg → rejects until
  every leg confirmed incl. `#229` proof where applicable (`wf235:163`); refresh `202 Accepted`
  → unconfirmed, quarantine handle (`wf235:164`); ambiguous uninstall →
  `provider_outcome_unknown`, fail closed (`wf235:165`); re-issue terminal revoke → return
  recorded disposition, no resurrection (`wf235:166`); DB error mid-redaction → roll back all
  (`wf235:170`).
- **acceptance/e2e:** archive/restore; raw-log expiry; GitHub coordinated redaction with
  non-sensitive tombstone; secret-canary absence (`PRD-019:161-163`; `wf235:153-173`).
- **behavioral-contract:** archive is reversible per-aggregate overlay (ledgers don't archive);
  partial ledger inconsistency is normal, not error; redaction/revocation complete only when
  every affected ledger leg confirmed (`wf235:75-100`).
- **coverage:** PRD-019 `161-163`; DBF `178-181, 195`. **Carries `wf235` OPEN-1..OPEN-8 to lock
  (§8).**

### Vertical G — Review Gate implementation (consumer of `#229`)

#### `TB-RV1` — Review Gate implementation  *(named dependency on `#229`)*
- **owner/seams:** `#229`-owned Review context; independent Reviewer; exclusive shared-Docker
  lease; `ReviewExitContainmentProof` / `ReviewContainmentProof`; governed merge authorization.
- **classification:** Feature; Agent Runtime, Security; P0 (unblocks Done); Risk Critical.
- **deps:** **`#229` contract (parallel session, still open — named dependency, NOT reopened
  here)**, `TB-02`, `TB-RN4`.
- **sad-paths:** Reviewer independence (implementer cannot be its Reviewer); stale/contaminated
  evidence rejected; Reviewer provisioning only after Handoff finalization; material Revision
  after finalization preserves handoff + requires exact `#229` proof (`wf230:1986, 2031`;
  `DBF-132, 143`).
- **acceptance/e2e:** accepted exact checkpoint → Review / Preparing Review (WIP+1) → lease/
  capacity/worktree retained until no-process/stopped/quarantined + every credential/tunnel
  confirmation → fresh Reviewer → evidence locked to exact contract version + SHA →
  changes-requested returns to Todo (top if blocking) or `AdmitDone` after merge (`PRD-019:1098-1119`).
- **behavioral-contract:** until this lands, `AdmitDone` is fail-closed and no DevTicket may
  reach Done (`DBF-134`; `PRD-019:949`); Reviewer capacity + Review WIP=3 + one shared-Docker
  lease are independent resources (`DBF-205-206`).
- **coverage:** PRD-019 `18-19, 69, 112-117, 129-131`; DBF `126-134, 205-207`. **Shared
  ownership with `TB-GH7`.**

### Vertical H — Releases Gate (`wf236`)

#### `TB-RL1` — Release aggregate + build-once manifest + fenced staging + Staging Occupancy
- **owner/seams:** Release aggregate; immutable Release Manifest / Candidate / Trusted Build
  Request; `StagingOccupancy` CAS+fence (`wf236:157-251, 296-351`).
- **classification:** Feature; Infrastructure, Backend/API; P1; Risk Critical.
- **human-owner:** Release manager. **secret-refs:** named secret refs/versions (never values)
  in manifest.
- **deps:** `TB-02` (Done), `TB-RV1` (Done preconditions).
- **sad-paths:** RC-tag/build freeze — partial/unknown → reject abandonment, quarantine + same
  request reconciliation (`wf236:332-351`); tag exists/may-exist/moved/unverifiable → frozen, no
  successor RC (`wf236:332-338`); non-ancestor candidate / force rewrite / missing commit →
  absolute GitHub-trust stop (`wf236:279-291`); unknown attempt retains fence, blocks mutation
  (`wf236:566-578`).
- **acceptance/e2e:** Draft from Done DevTickets → requested/observed/confirmed RC → staging
  deploy/verify/occupancy → staging approval (`wf236:777-787`).
- **behavioral-contract:** build once, promote the same immutable artifact bundle; Compose parity
  is semantic not value-identical (`wf236:129-132, 316-320`).
- **coverage:** PRD-019 `145, 177-179, 181-183`; DBF `162, 208-218`.

#### `TB-RL2` — Production promotion saga + distinct approvals + publication + rollback + Incident boundary + Releases view
- **owner/seams:** protected-main FF + stable tag + same-digest prod deploy + GitHub Release
  publication; `DeploymentLease`; `CurrentEnvironmentDeployment` / `LastKnownGood`; Release
  Evidence Package; Releases view (`wf236:417-525, 649-742`).
- **classification:** Feature; Infrastructure, Backend/API, Frontend; P1; Risk Critical.
- **human-owner:** Release manager. **secret-refs:** provider deployment/registry credentials
  (server-held).
- **deps:** `TB-RL1`, `TB-GH5` (protected-main/tag/native Release facts).
- **sad-paths:** `ProtectedMainPromotionRequested`/`StableTagCreationRequested` committed →
  permanently forbids Cancel/Supersede + version reuse even on failed/unknown provider outcome
  (`wf236:199-204, 548-564`); production live but publication pending → `ProductionReady` +
  `PublicationPending`, retry same request only (`wf236:522-525`); mixed per-service digest
  projection never collapses to success (`wf236:586-589`); suspected secret / unhealthy GitHub →
  absolute stop, no bypass, safety containment only (`wf236:591-612`); contaminated evidence →
  quarantine + new sanitized linked package, no raw replication (`wf236:638-647`); failed prod
  rollback → critical Incident (`wf236:649-667`).
- **acceptance/e2e:** build-once flow through both human approvals → protected-main → stable tag
  → same-digest prod deploy → GitHub publication → `Released`; rollback changes only env pointer,
  never rewrites main/tags/history (`wf236:777-787`).
- **behavioral-contract:** a provider `2xx` is never success; callbacks never confirm; Cards
  remain Done through release state (`wf236:222-232, 744-748`).
- **coverage:** PRD-019 `145, 177-185`; DBF `219-237`. **Carries `wf236` validation backlog to
  lock (§8).**

### Vertical I — UI / IA (`PRD-019` views; `DBF-151..163`)

#### `TB-UI1` — Dev Board shell + Summary/List/Board/Card detail (Board B / Card A, light+dark, keyboard parity)
- **owner/seams:** Projection module (rebuildable); Card activity tabs Comments/History/Worklog/
  Agent Execution/Review Evidence (`DBF-151-160`; prototype commits `27aa4660`, `a4ecf553`).
- **classification:** Feature; Frontend, UI/UX; P1; Risk Medium.
- **deps:** `TB-01`, `TB-02`, `TB-GH5`.
- **sad-paths:** invalid drop snaps back with precise reason (`DBF-031`); every drag has
  keyboard/menu equivalent (`DBF-032`); stale projection snap-back; degraded state not disguised
  (`wf230:2100-2101`).
- **acceptance/e2e:** shape Proposal/Backlog, obtain synced GitHub Issue, approve Ready, claim,
  observe worklogs + repo facts, submit evidence, reach Done after merge — light+dark, keyboard,
  narrow viewport (`PRD-019:957-968`).
- **behavioral-contract:** UI is an adapter to the same command/policy layer; drag/keyboard/menu
  route through identical commands (`DBF-016`).
- **coverage:** PRD-019 `8, 21-23, 138-141, 146-149`; DBF `151-160, 163`.

#### `TB-UI2` — Sprints / Docs / Development / Releases views
- **owner/seams:** Sprints Variant A (`8ebfecf5`); Docs first-class view; Development aggregate;
  Releases view.
- **classification:** Feature; Frontend, UI/UX; P2; Risk Medium.
- **deps:** `TB-SP1`, `TB-DC1`, `TB-GH5`, `TB-RL2`.
- **sad-paths:** Sprint shown as distinct view not a second Board (`DBF-160`); Development ends
  at merge into `development`, Releases separate (`DBF-161-162`).
- **acceptance/e2e:** authenticated Releases view against real local Docker + deterministic
  provider seams — lifecycle, simultaneous attention, per-service digest/health, current vs LKG,
  evidence, Incident link, publication pending, safe degraded/forbidden states (`wf236:773`).
- **behavioral-contract:** global light/dark theme; no per-Card theme selector (`DBF-163`).
- **coverage:** PRD-019 `142-145`; DBF `160-163`.

#### `TB-UI3` — Local Machines enrollment UI + Runners/Health/Environments projections + Slack surface + preview tunnel
- **owner/seams:** Admin Runners/Environments/Health projections (projections only, never
  admission authority); preview tunnel UI.
- **classification:** Feature; Frontend, UI/UX, Infrastructure; P1; Risk High.
- **deps:** `TB-RN1`, `TB-RN8`.
- **sad-paths:** PRD-020 Admin Overview projection cannot mutate admission state outside the
  command boundary (`DBF-207`; `wf232:3325-3332`); preview tunnel revoked on disconnect/lease
  loss/expiry/Absolute Stop/close (`DBF-131-132`); Unknown never rendered Healthy (`wf232:3327`).
- **acceptance/e2e:** Admin enrolls local machine, selects Codex Desktop/CLI/Claude Code,
  observes revocable keys + health + Docker readiness (`PRD-019:96-98, 112-117`).
- **behavioral-contract:** projection is read-only; admission is a Dev Board command.
- **coverage:** PRD-019 `96-98, 112-117, 176`; DBF `103-107, 207`. **Cross-link: feeds `#218`
  governed Card authority surface.**

### Vertical J — Migration / cutover / Q17 cleanup

#### `TB-MG1` — Expand-contract target storage + deterministic backfill + dual-read reconciliation  *(shared with `TB-GH9`)*
- **owner/seams:** migration service; `ImportLegacyDevTicket` / `ReconcileHistoricalCompletion`
  (`wf230:1611-1616, 1891-1892`; manifest §6–§8).
- **classification:** Maintenance; Data/Database, Backend/API; P1; Risk Critical.
- **deps:** `TB-01`, `TB-GH9`.
- **sad-paths:** every source row ends migrated/merged/frozen/archived/quarantined — "Skipped"
  is a cutover blocker (`manifest §6`); legacy `todo` never executable without new Ready
  Approval; legacy `done` → Historical Projection, `completionGate=legacy_unverified`
  (`manifest §6`; `wf230:1604-1609`); legacy `in_progress` → Blocked/legacy-reconciliation, no
  minted lease.
- **acceptance/e2e:** forward-only fixtures representing Tasks/issue projections/comments/steps/
  watchers/evidence/quality/outbox/card numbers/external refs/activity; every record mapped or
  quarantined before cutover (`PRD-019:1126-1129`).
- **behavioral-contract:** preserve Task UUIDs/card numbers/GitHub links/comments/evidence/
  worklogs; never bulk-promote or bless legacy evidence (`DBF-182-186`).
- **coverage:** PRD-019 `157-160`; DBF `182-189`. **Shared ownership with `TB-GH9`.**

#### `TB-MG2` — Cutover + route/tool/worker retirement + reciprocal `#147–#157` tracker cleanup
- **owner/seams:** command/nav cutover; `/tasks`+`/issues` → `/dev-board` redirect; legacy
  write/tool/worker/OAuth-PAT retirement; reciprocal tracker cleanup.
- **classification:** Maintenance; Infrastructure, Data/Database; P1; Risk Critical.
- **deps:** `TB-MG1`, `TB-UI1`, and all verticals producing target write authority.
- **sad-paths:** redirect only after verified cutover flag/completed migration (`PRD-019:1130`);
  rollback restores legacy **reads**, never two write owners (`wf231:1372`).
- **acceptance/e2e:** `/tasks`/`/issues` redirects resolve to correct migrated DevTicket or
  explicit archived/quarantined explanation; cutover gates (manifest §9) all green.
- **behavioral-contract:** no active plan instructs Q17 implementation; no indefinite dual-write
  (`manifest §10`; `DBF-184`).
- **coverage:** PRD-019 `158-160`; DBF `185-189`. **CRITICAL GATE — see §6 + §9.**

---

## 3. Blocking-edge adjacency list (acyclic) + frontier

Edges read `A → B` = "B blocks A" (A depends on B). No cycles. Verified against `wf231` 11 seams
(`wf231:1395-1416`), `wf232` build-order (`wf232:3315-3332`), and `wf230` module seams
(`wf230:182-204`).

```
Frontier 0 (executable first, no blockers):
  TB-01

Vertical A:
  TB-02            → TB-01, TB-RN5(real runner) | TB-RN2(fake runner path)
Vertical B:
  TB-GH1           → TB-01
  TB-GH2           → TB-GH1
  TB-GH3           → TB-GH1, TB-01
  TB-GH4           → TB-GH3
  TB-GH5           → TB-GH1
  TB-GH6           → TB-GH2, TB-01
  TB-GH7 (merge)   → TB-RV1, TB-GH5            (#229 named dep)
  TB-GH8 (remed.)  → TB-RN7, TB-GH5
  TB-GH9 (recon)   → TB-GH2, TB-GH3, TB-GH4
  TB-GH10(disconn) → TB-GH1, TB-GH9
  TB-GH11(ref upd) → TB-RN7, TB-GH5
Vertical C:
  TB-RN1           → TB-01
  TB-RN2           → TB-RN1
  TB-RN3           → TB-RN2
  TB-RN4           → TB-RN2
  TB-RN5           → TB-RN3, TB-RN4
  TB-RN6           → TB-RN4, TB-02
  TB-RN7           → TB-RN3, TB-GH1
  TB-RN8           → TB-RN2, TB-01
Vertical D:
  TB-SP1           → TB-02, TB-GH4, TB-RN6
  TB-SP2           → TB-02, TB-SP1
Vertical E:
  TB-DC1           → TB-01, TB-GH4
Vertical F:
  TB-AR1           → TB-01, TB-GH10, TB-RN5
Vertical G:
  TB-RV1           → #229(contract), TB-02, TB-RN4
Vertical H:
  TB-RL1           → TB-02, TB-RV1
  TB-RL2           → TB-RL1, TB-GH5
Vertical I:
  TB-UI1           → TB-01, TB-02, TB-GH5
  TB-UI2           → TB-SP1, TB-DC1, TB-GH5, TB-RL2
  TB-UI3           → TB-RN1, TB-RN8
Vertical J:
  TB-MG1           → TB-01, TB-GH9
  TB-MG2           → TB-MG1, TB-UI1, (all target-write verticals)
```

**Frontier expansion as blockers resolve:** after `TB-01`, the next claimable set is
`{ TB-GH1, TB-RN1, TB-DC1(partial) }`. `TB-RV1` is **not** executable until `#229` resolves;
until then `AdmitDone`/merge/`TB-GH7`/`TB-RL1` all stay fail-closed. `TB-MG2` is terminal — it
runs only after the target is the sole write authority.

---

## 4. PRD-019 story coverage matrix

Every PRD-019 story (`1-185`) maps to ≥1 TB. Shared coverage marked `(shared)`.

| Stories | Primary TB(s) |
| --- | --- |
| `1-7` (one board, mirror, UUID hidden, Proposal) | `TB-01`, `TB-GH1`, `TB-GH3` |
| `8-17` (six lanes, Backlog/Todo shaping, claim atomic, dependency, Review, Done meaning) | `TB-01`, `TB-02`, `TB-RV1` |
| `18-23` (Review/Done system-controlled, drag=command, keyboard, snap-back) | `TB-02`, `TB-RV1`, `TB-UI1` |
| `24-36` (Ready approval, revisions, dependencies, human inputs, Human Owner, grilling-needed) | `TB-01` |
| `37-52` (Approve/Approve&Start, version-bound approval, material invalidation, revisions, dependency edges, rework ranking) | `TB-01`, `TB-02` |
| `53-60` (Work Areas, Priority, Severity, Risk, policy-minimum risk, High/Critical approval) | `TB-01` |
| `61-69` (Incident boundary, roles, avatars, independent Reviewer) | `TB-SP2`, `TB-01`, `TB-RV1` |
| `70-78` (GitHub App, health, body, managed labels, comments, status-label request) | `TB-GH1`, `TB-GH2`, `TB-GH4` |
| `79-86` (worklogs, Review summary, telemetry, corrections, attribution, dedupe, field merge) | `TB-GH4`, `TB-GH5` |
| `87-94` (conflicts pause execution, resolve in Opzava, outbox, sequence gap, unhealthy stop, secret stop, Needs Human Approval, merge-conflict remediation) | `TB-GH4`, `TB-GH9`, `TB-GH8`, `TB-01` |
| `95-104` (one repo, enroll local machine, tool selector, revocable keys, fenced lease, worktree, disconnect choice, reconnect) | `TB-GH1`, `TB-RN1`, `TB-RN5`, `TB-RN6` |
| `105-112` (Slack Assistant, Slack approvals, ordinary approvals, secure-UI-only, no secrets in Slack, named secret refs, lease-only secret access) | `TB-RN8`, `TB-RN5`, `TB-01` |
| `113-117` (Reviewer config, local Docker Review, locked SHA, evidence package, preview tunnel) | `TB-RV1`, `TB-UI3` |
| `118-137` (Sprint Goal, ordinary outside Sprint, one Active, membership, revisions, preflight, serial, Review WIP=3, blocking discovery, pause, history, Milestone) | `TB-SP1` |
| `138-145` (Summary, List, Board, Sprints, Docs, Development views) | `TB-UI1`, `TB-UI2` |
| `146` (light+dark) | `TB-UI1` |
| `147-149` (Card detail reading flow, activity tabs, PR/CI status on Card) | `TB-UI1`, `TB-GH5` |
| `150-156` (Docs authoring/mirror, doc types, metadata relations, Planning Session Log, lifecycle, material-revision invalidation) | `TB-DC1` |
| `157-160` (migration preserve IDs, bounded dual-read, redirect, four ledgers) | `TB-MG1`, `TB-MG2`, `TB-01` |
| `161-163` (archive reversible, retention, exceptional redaction+tombstone) | `TB-AR1` |
| `164-176` (per-Runner capacity presets Focused/Balanced/Custom, ordinary eligibility, scope collision, downgrade, Sprint waiting, no second Active Sprint, preset audit) | `TB-RN1`, `TB-SP1`, `TB-02` |
| `177-185` (Release aggregate, build-once, staging/prod approvals, protected-main, current vs LKG, rollback, secret stop, Incident boundary, history, Card stays Done) | `TB-RL1`, `TB-RL2` |

**Gap check:** all 185 stories covered; no orphan story and no double-owned story except explicit
shared-ownership noted (Review `TB-RV1`/`TB-GH7`; remediation `TB-RN7`/`TB-GH8`/`TB-GH11`;
reconciliation `TB-GH9`/`TB-MG1`).

---

## 5. DBF decision coverage matrix

`DBF-001-249` map to TBs by section. Shared coverage marked.

| DBF section | IDs | TB(s) |
| --- | --- | --- |
| §1 language/boundary | `001-009` | `TB-01` |
| §2 authority | `010-017` | `TB-01`, `TB-GH6` |
| §3 board lifecycle | `018-032` | `TB-01`, `TB-02` |
| §4 Ready/revisions | `033-043` | `TB-01`, `TB-DC1` (`043`) |
| §5 dependencies | `044-048` | `TB-01`, `TB-SP1` |
| §6 roles | `049-056` | `TB-01` |
| §7 classification/policy | `057-066` | `TB-01` |
| §8 Incident | `067-071` | `TB-SP2` |
| §9 Proposal | `072-078` | `TB-01`, `TB-GH3` |
| §10 GitHub App/mirror/health | `079-094` | `TB-GH1…GH5` |
| §11 sync/conflicts | `095-102` | `TB-GH2`, `TB-GH4`, `TB-GH9` |
| §12 enrollment/execution | `103-113` | `TB-RN1`, `TB-RN5`, `TB-RN6` |
| §13 Slack/approval | `114-120` | `TB-RN8` |
| §14 secrets/human inputs | `121-125` | `TB-RN5`, `TB-01` |
| §15 Review/Docker | `126-134` | `TB-RV1`, `TB-UI3` (`131-132`) |
| §16 Sprint | `135-150` | `TB-SP1` |
| §17 views/UX | `151-163` | `TB-UI1`, `TB-UI2` |
| §18 Docs | `164-172` | `TB-DC1` |
| §19 four ledgers | `173-177` | `TB-01` |
| §20 archive/retention | `178-181` | `TB-AR1`, `TB-01` (archive overlay) |
| §21 migration | `182-189` | `TB-MG1`, `TB-MG2` |
| §22 closure | `190-207` | `TB-02`, `TB-SP1`, `TB-RV1`, `TB-RN6`, `TB-UI3` |
| §23 Releases | `208-237` | `TB-RL1`, `TB-RL2` |
| §24 Runner protocol | `238-249` | `TB-RN1…TB-RN7` |

---

## 6. Reciprocal `#147–#157` old↔new mapping table

> **CRITICAL GATE — HUMAN-APPROVAL-REQUIRED.** Per `CLAUDE.md` ("Q17 and GitHub issues
> `#147–#157` are superseded/quarantined historical evidence — never an executable brief...
> Replacement tickets require explicit human approval before publishing") and the migration
> manifest §5 ("Only that mapping and audit authorize closing these issues as `not planned`; they
> must never be closed as 'implemented by Dev Board'"), this table is the **mapping + audit**. It
> does **not** close any issue. Closing `#147–#157` as `not planned` requires **explicit human
> approval** after this graph is independently audited and the reciprocal pointers are added to
> every historical issue and every replacement TB. `#237` explicitly does **not** authorize
> closure.
>
> **Tracker-state drift to reconcile (surfaced, not acted on):** the `#237` readiness note
> (`#237` comment `…4995321853`) records that `#147–#157` are currently `closed` with
> `state_reason=completed` (closed 2026-07-15), which **contradicts** the manifest requirement
> that they remain open until this mapping publishes and then close only as `not planned`. This
> contradiction is preserved here for the owning human; no issue was reopened during this
> synthesis (reopening requires explicit human approval per the same note).

| Old | Old slice (manifest §5) | Retired intent | Surviving intent → replacement TB(s) | Salvage |
| --- | --- | --- | --- | --- |
| `#147` | Five-lane Task data model; Blocked flag | five-lane/Blocked-flag data model | six-lane DevTicket aggregate, versioned contracts, dependencies, Proposals, Sprints, four ledgers → `TB-01`; migration → `TB-MG1` | preserve RLS/projection test intent (`TB-MG1`) |
| `#148` | Task transitions and ownership | old transition/ownership model | Ready + atomic claim/lease + Blocked recovery + independent Review + Done-after-merge → `TB-01`, `TB-02` | preserve command/audit + fail-closed intent |
| `#149` | Governed task/review tools | Lead-Orchestrator-only Review; caller-selected human provenance | one Dev Board command seam (`TB-01`), trusted provenance, independent Reviewer (`TB-RV1`), Slack commands (`TB-RN8`), runner receipts (`TB-RN2`) | none (intent recut) |
| `#150` | Issue/Task/PR port | close-only issue port | GitHub App two-way sync, managed body/labels/comments, PR/check facts, health, outbox, conflicts, one repo → `TB-GH1…TB-GH5`, `TB-GH9` | salvage heavily (`TB-GH1..5`) |
| `#151` | Hosted MCP and OAuth | **hosted-MCP / OAuth-server-only design RETIRED** (`#237` body; manifest §5) | governed connectivity/control intent **survives**, reallocated across: GitHub App install/auth (`TB-GH1`), Runner enrollment (`TB-RN1`), MCP provenance adapter (`TB-RN8`), Lease Secret Broker (`TB-RN5`), command surface (`TB-01`). **`#237` records this final ownership split before any closure.** | none (design retired; intent redistributed) |
| `#152` | Dispatcher worker, push/poll | org-global dispatcher/push-poll | Runner-local Focused/Balanced/Custom admission, ordinary explicit claims vs Sprint `autonomous_serial`, governed pause/preemption, durable outbox, fenced leases, runner selection → `TB-RN1`, `TB-RN6`, `TB-SP1`, `TB-02` | preserve durable-outbox/claim lessons (`TB-RN2`, `TB-MG1`) |
| `#153` | Gateway-side sandboxed subagent | automatic cloud failover from local | explicit orchestrator/cloud Runner capability, never automatic failover; local-only Review + Docker mandatory → `TB-RN1` (cloud), `TB-RN6` (no-failover), `TB-RV1` (local Review) | none (failover rejected) |
| `#154` | Evidence gate + Lead Orchestrator Quality Review | Lead Orchestrator as Reviewer | independent Review, adversarial/evidence reality, evidence bound to contract version/SHA/local Docker → `TB-RV1` | preserve adversarial/evidence goals |
| `#155` | Human-only Done and merge | old Done/merge model | Done only after Review + confirmed merge into `development`; staging/production = Releases → `TB-02` (`AdmitDone`), `TB-RV1` (merge), `TB-RL1`/`TB-RL2` | none |
| `#156` | Five-lane Tasks UI | five-lane UI | Dev Board IA, six lanes, Board B, Card A, Sprints A, global themes, List/Docs/Development/Releases → `TB-UI1`, `TB-UI2` | preserve keyboard/a11y intent (`TB-UI1`) |
| `#157` | E2E and MCP compatibility proof | broad E2E + client-compat conflation | one real authenticated local-Docker browser vertical + Postgres/outbox, signed GitHub webhook/conflict, deterministic runner-protocol seams → `TB-MG1`, `TB-MG2`, `TB-RN2` (golden vectors), `TB-GH2`. **Client compatibility is a separate Connections concern (PRD-013), not a Dev Board TB** | preserve real-seam E2E intent |

**Many-to-many note:** every old issue maps to multiple new TBs, and several new TBs absorb
intent from multiple old issues (e.g. `TB-RN1` absorbs `#151`/`#152`/`#153`). This is the
reciprocal mapping the manifest and `CLAUDE.md` require before closure.

---

## 7. Active dependent cross-links (`#210` / `#216` / `#218` / `#219` / `#220`)

Per `#237` body and manifest §5 "Capture and active dependent issues". These are **Ask Admin map
`#210`** tickets that consume the canonical Dev Board terms this graph produces — they are
**not** implementation children of this graph.

| Dependent | Scope | Dev Board terms it consumes (TB pointer) |
| --- | --- | --- |
| `#210` (Ask Admin Opzava v1 map) | Lead-Orchestrator chat spec | DevTicket/Card/Proposal/Sprint vocabulary; governed Dev Board authority; replace "consume Q17" with "consume `PRD-019`/`ADR-017`" (`TB-01` terms) |
| `#216` (delegation path: Ask Admin consuming dispatch) | delegation tools + etiquette | explicit Runner identity, fenced per-Runner capacity, Focused/Balanced/Custom, ordinary claim vs serial Sprint, offline pause/no-failover, worklog/checkpoint ledgers → `TB-RN1`, `TB-RN6`, `TB-SP1`. **Must not inherit `#152`/`#153` unchanged.** |
| `#218` (governed Card authority + hard-gate confirm flow) | commanded-vs-autonomous action matrix | `ADR-017` authority matrix, version-bound Slack confirmation, Absolute Stops, independent Review, Done-after-merge → `TB-01`, `TB-RN8`, `TB-RV1`. Uses DevTicket/Card terms. |
| `#219` (three v1 skills) | `opzava-pm` / `opzava-card-authoring` / `opzava-reporting` | rename task-authoring → DevTicket/Ready Contract/Proposal/Sprint; skills guide behavior, server commands enforce gates → `TB-01`, `TB-SP1` |
| `#220` (assembled Ask Admin v1 spec) | PRD-style assembly + EXECUTION.md slice plan | cite canonical Dev Board docs not Q17; keep Ask Admin slices **separate** from Dev Board decomposition; **its slice plan must adopt this tracer-bullet schema (`wf237-tracer-bullet-v1`)** via the `#237`/`#246` layered ownership |

**Boundary:** Ask Admin implementation slices are **separate** from the Dev Board TBs above. The
Dev Board graph is the authority for Dev Board terms those slices consume.

---

## 8. Owner decisions to lock (consolidated OPEN items)

These are **not** locked by `#237`. They are carried forward from the resolved memos with a
recommended default. Each must be locked by the **owning TB** at implementation, with human
sign-off where the readiness review requires. `#237` records and surfaces them; it does not
decide them.

### From `#233` (Sprint/Incident) — own by `TB-SP1`/`TB-SP2`
1. **Incident-driven work-pressure bridge** — whether every P0/P1 incident auto-opens a
   `BlockedEpisode`. *Default:* incidents are bounded attention projections by default; Dev Board
   entry only via explicit governance commands (`wf233:85-88`).
2. **Preemption command boundary + approver set** — whether P0/P1 changes who approves
   interruption. *Default:* priority changes ranking only, not approver authority
   (`wf233:90-93`).
3. **SLO of resumed Sprint coordinator selection** — when system auto-resumes. *Default:*
   system-induced pauses may auto-resume after fresh-claim preconditions; human/governed pauses
   require explicit Resume (`wf233:95-98`).
4. **Resume/reopen command shape.** *Default:* `ResolveOrSupersedeBlock`/reopen with required
   revocation/fence proofs; never implicit auto-unpause (`wf233:100-103`).
5. **Ordinary-work tie-break at equal priority.** *Default:* deterministic ordering
   (priority → dependency readiness → FIFO) → explicit claim (`wf233:105-108`).
6. **Permanent-fix channel for incident root causes.** *Default:* persistent prevention altering
   repo/config/schema/dependency/deployment → Bug/Technical Task; pure runtime mitigation →
   `RemediationAction` (`wf233:110-113`).
- **Shared with `#230`/`#232`:** detailed timeout/pause/preemption policy (`wf230:1013-1015`).

### From `#234` (Docs) — own by `TB-DC1`
1. **Approval class** for Planning Brief / Postmortem / Sprint Report (`wf234` O-1). *Default:*
   Planning Brief + Postmortem require Human Owner approval; Sprint Report auto-finalized
   immutable snapshot.
2. **Unapproved Research Notes / Planning Logs in Ready pins** (O-2). *Default:* only Approved
   docs qualify as dependency pins.
3. **Canonical state name + shorthand** (O-3). *Default:* enum `{Draft, In Review, Approved,
   Superseded, Archived}`; forbid freeform `Review`.
4. **Docs revision authority + command names** (O-4). *Default:* reuse `wf230` trusted revision
   envelope (`Propose/Accept/RejectRevision` + expected-version guard).
5. **Docs Markdown mirror conflict handling** (O-5). *Default:* extend `wf231`
   `ResolveSyncConflict` three-way field model; same no-wholesale-merge limitation.
6. **Retention for generated planning artifacts** (O-6). *Default:* sanitized Planning Session
   Log durable; configurable TTL only on large raw/transient outputs.

### From `#235` (Archive/retention/redaction) — own by `TB-AR1`
1. **Numeric retention durations/TTL windows** (OPEN-1) — runner telemetry; preview artifact/
   tunnel; sync diagnostic replay window; GitHub webhook raw-body. *Default:* operator-
   configurable with fail-safe ceiling; relied-upon facts promoted out of expirable class; durable
   classes TTL = none. **No numbers exist in any source.**
2. **Legal/policy redaction authority chain** (OPEN-2). *Default:* Request = Human Owner or Lead
   Orchestrator; Approve/Execute = Secure-UI Admin only.
3. **Field-level tombstone schema** (OPEN-3) — one row schema across four ledgers (Releases
   contamination model template, `DBF-226`).
4. **Restore authority matrix + revocation coupling** (OPEN-4). *Default:* same authority as
   archive; restored Done stays view-only.
5. **Retention-expiry partial-failure rule** (OPEN-5). *Default:* relied-upon evidence promoted
   the moment it becomes relied-upon; expiry acts only on raw with no durable ref.
6. **Idempotency domain + replay keying for revocation** (OPEN-6). *Default:* shared key
   `{ledger, action, actor, subject, nonceOrRevision}`; persist terminal disposition per subject.
7. **Conflict-failure UX + owner alerting** (OPEN-7). *Default:* explicit hard-fail conflict +
   owner notification; unresolved conflicts cannot auto-resolve.
8. **Scope boundary** (OPEN-8) — Sprint Archive/Restore is `#233`'s; Docs archive semantics are
   `#234`'s. `TB-AR1` supplies only retention/redaction/tombstone/restore-gating/revocation
   policy.

### From `#230` (DevTicket) — own by `TB-01`/`TB-02`
- **Timeout/pause/preemption detailed policy** (shared `#232`/`#233`) (`wf230:1013-1015`).
- **Sprint Archive/Restore internals** → `#233` (`wf230:1597-1600`).
- **`AdmitDone` disabled until `#229` ships** (`wf230:1538-1547, 2104-2106`).
- **V1 Admin-only capability granularity** — distinct command capabilities, not one coarse
  `member:update` (`wf230:248-274`).

### From `#232` vendor evidence — own by `TB-RN1`/`TB-RN3`/`TB-RN5`/`TB-RN8`/`TB-UI3`
- Supported harness/version matrix; terms/account delegation; controller transport; no-hardware-
  attestation residual-risk claim; Codex experimental protocols; Claude stream/hook compat;
  OpenClaw parity; **preview tunnel** (audience/TTL/revocation/DNS-cert/teardown);
  **secret-broker provider**; **Slack topology** (HTTP Events vs Socket Mode); **GitHub health
  probe set**; **cloud Runner boundary** (`wf232-ev:786-825`).

### From `#236` (Releases) — own by `TB-RL1`/`TB-RL2`
- Git-graph edge cases vs real GitHub App; Dokploy API behavior/cancellation/digest-health;
  Admin roles/Slack identity/expiry/revocation; registry/signing/SBOM/vulnerability/backup-restore
  adapters; migration compatibility/restore + immediate safety-containment policy;
  retention/redaction-tombstone/GitHub Release formatting; initial baseline revalidation
  (found no tags/Releases; `origin/main` ~320 commits ahead — evidence to revalidate);
  contaminated-evidence retention defaults. **Unknown provider behavior stays fail-closed**
  (`wf236:809-825`).

---

## 9. Critical gates & non-claims

1. **`#147–#157` closure is HUMAN-APPROVAL-REQUIRED.** This document is the mapping + audit only.
   No issue is closed or reopened here. Closure as `not planned` (never `completed`/`implemented`)
   requires explicit human approval after independent audit + reciprocal pointers added
   (`CLAUDE.md`; manifest §5; `#237` body). The current `closed/completed` tracker state is a
   **drift to reconcile**, surfaced in §6, not acted on.
2. **`#229` (Review Gate) is a named dependency, not reopened.** It is open in a parallel
   session. `TB-RV1` consumes its contract; `AdmitDone`/merge/`TB-GH7`/`TB-RL1` stay fail-closed
   until `#229` resolves and `TB-RV1` ships.
3. **Releases fail-closed.** No release behavior inferred from Done until `TB-RL1`/`TB-RL2` ship
   (`PRD-019:949-951`; `DBF-134`).
4. **Schema freeze owner = `#237`; adopter = `#246`.** This document freezes
   `wf237-tracer-bullet-v1`. `#246` (map #241) cites this version for Admin CC slices; it does
   not define a parallel schema (`#237` comment `…5010325286`).
5. **No implementation authority.** This graph authorizes no product code, schema, migration, or
   route cutover. A planning issue being open does not authorize implementation work; a future TB
   is not claimable merely because its shape appears here (manifest §5).
6. **Memos freeze on consumption.** On `#237` resolution, `wf230…wf236` become frozen planning
   evidence, not parallel implementation authority (map `#228`; manifest §5).

---

## 10. How `#237` knows it is done (audit checklist)

- [x] Canonical tracer-bullet schema defined and versioned (`§0`).
- [x] 33 TBs published, each carrying every required schema field (`§2`).
- [x] Acyclic blocker graph with explicit edges + safe executable frontier (`§3`).
- [x] Every PRD-019 story (`1-185`) covered exactly once or by explicit shared ownership (`§4`).
- [x] Every DBF decision (`001-249`) covered (`§5`).
- [x] Reciprocal `#147-#157` many-to-many mapping published, with `#151` hosted-MCP/OAuth retired
      vs governed-intent-survives split recorded (`§6`).
- [x] Closure of `#147-#157` marked **HUMAN-APPROVAL-REQUIRED**; tracker-state drift surfaced,
      not acted on (`§6`, `§9.1`).
- [x] Active dependents `#210`/`#216`/`#218`/`#219`/`#220` cross-linked with the Dev Board terms
      they consume (`§7`).
- [x] `#229` recorded as named dependency, not reopened (`§9.2`).
- [x] Consolidated "Owner decisions to lock" carrying open decisions from `#230`/`#232`/`#233`/
      `#234`/`#235`/`#236` (`§8`).
- [x] Every claim cited to `PRD-019`, `ADR-017`, `DBF-*`, a `wf2xx` memo, `#228`, the manifest,
      `CLAUDE.md`, or a `#237` comment.

**Remaining before `#237` may close** (per the 2026-07-18 readiness review, `#237` comment
`…5010329157`): (a) `#229`, `#233`, `#234`, `#235` must resolve; (b) `#147-#157` closure
migration to `not planned` under human approval; (c) an independent audit of this graph. This
synthesis does not perform those steps — it produces the auditable artifact they consume.
