# Opzava ubiquitous language (canonical glossary)

Use these terms EXACTLY. If a doc, issue, or conversation uses a term differently, this file wins;
if a new term crystallises, add it here in the same slice. Definitions only — design detail lives in
`ARCHITECTURE.md`, the ADRs, and `docs/plan/grilling-decisions.md`.

| Term | Means | Not to be confused with |
| --- | --- | --- |
| **OpenClaw** | The upstream open-source agent runtime (github.com/openclaw/openclaw). | Our fork of it (Mainframe). |
| **Mainframe** | The Opzava-owned tracked fork of OpenClaw at `mainframe/` (ADR-016). Source code we build and patch. | The running container (Platform Gateway). |
| **Platform Gateway** | The one running OpenClaw gateway container (`openclaw-platform-gateway` Compose service), built from `mainframe/`. | Dynamic per-tenant Gateways (deferred, ADR-002 amendment). |
| **Customization ladder** | Rungs 0–3 for changing Mainframe: config → extension points → additive `extensions/opzava-*` modules → logged source patches (`mainframe/PATCHES.md`). Lowest rung that works, always. | Free editing of upstream files. |
| **gateway-broker (broker)** | The ONLY hot-path ACL to OpenClaw (ADR-003): browser/app → broker → gateway. | provisioning-worker (admin/JIT path). |
| **provisioning-worker (worker)** | The admin/JIT-token path for config, onboarding, pairing, and (later) dynamic Gateway lifecycle. | The broker hot path. |
| **Two-token model** | Hot-path device token (`operator.write`+`approvals`) vs short-lived job-scoped `operator.admin` (ADR-003). | Any single-credential shortcut. |
| **Admin dashboard** | The internal operator app. Its target native surfaces are **Dev Board** and Ask Admin alongside the ported OpenClaw Control-UI views (program rows 1–14). | The user dashboard. CRM is NEVER an admin-dashboard surface (user directive 2026-07-04). |
| **User dashboard** | The future user-facing product surface family and permanent home of the deferred CRM rebuild. CRM currently has no surface; it returns here, not in the admin app (GitHub issue #200, 2026-07-15). | Admin dashboard. |
| **Dev Board** | The Opzava-primary developer-operations surface that unifies planning, execution, review, GitHub Issue synchronization, Sprints, Docs, Development evidence, and Releases for the Opzava repository. | The legacy `/tasks` and `/issues` routes; OpenClaw's Control-UI Workboard; customer-support tickets. |
| **DevTicket** | The aggregate owned by the Dev Board bounded context. It holds the governed work contract, workflow state, dependencies, Sprint membership, approvals, assignments, evidence references, and GitHub synchronization identity. | A GitHub Issue, a generic PM task, an OpenClaw task-ledger entry, or the visual Card. |
| **Card** | The visual projection of one DevTicket in Board, List, Sprint, or detail views. | The persisted aggregate itself; a duplicated Sprint copy. |
| **Proposal** | An agent-discovered candidate that stays Opzava-only until a Human Owner accepts, merges, rejects, or archives it. Acceptance creates a DevTicket in Backlog and its GitHub Issue mirror. | An executable Todo item or an already-created GitHub Issue. |
| **Human Owner** | The accountable human who shapes the DevTicket, supplies required human inputs, approves governed changes, and resolves policy or synchronization conflicts. | Execution Assignee, Lead Orchestrator, or Reviewer. |
| **Execution Assignee** | The optional single human or agent identity selected to implement a DevTicket. Todo may be unassigned; an atomic claim assigns it before work begins. | Human Owner, Lead Orchestrator, Runner, or Reviewer. |
| **Lead Orchestrator** | The Personal Assistant / coordination role that dispatches, communicates, pauses, escalates, and keeps the human informed without silently granting approval or becoming the Execution Assignee. | The independent Reviewer or the machine-running Runner. |
| **Reviewer** | The separately configured, fresh local agent-tool/model identity that evaluates a locked commit and evidence package against the approved contract in the local Docker stack. | Lead Orchestrator, Execution Assignee, or Human Owner. |
| **Runner** | An explicitly selected execution location and control endpoint: the user's enrolled local machine or an admitted orchestrator/cloud runner. It owns a fenced lease, branch/worktree, process state, and checkpoint/reconciliation protocol; only the local Runner owns the required local Docker Review access. | The agent/model identity operating through it; an automatic failover target. |
| **Sprint** | One versioned goal and ordered DevTicket plan executed as `autonomous_serial`; at most one Sprint is Active, while Drafts and one Approved/Queued Sprint may exist. | A Kanban lane, an Epic, or every collection of ordinary work. |
| **Ready Contract** | The version-bound contract required before Backlog can become Todo: outcome, bounded scope, sad paths, edge cases, acceptance criteria, dependency state, user-level E2E expectations, final behavioral contract, required human inputs, and governance metadata. | A title-only task, free-form description, or permanent approval after material edits. |
| **GitHub Mirror** | The durable synchronized GitHub Issue representation of an accepted DevTicket, including managed labels, readable contract block, comments, milestone/worklog history, and native delivery links. Opzava owns workflow and gates; GitHub owns its native issue number/URL and PR, commit, check, and merge facts. | A second independent workflow authority or a disposable cache. |
| **Sync Conflict** | A visible unresolved conflict when concurrent Opzava/GitHub changes target the same governed field. Contract, dependency, assignment, or approval conflicts pause affected execution until the Human Owner resolves them in Opzava. | A harmless different-field auto-merge or temporary integration-health failure. |
| **Runner execution ledger** | The append-oriented operational record of leases, fencing tokens, command nonces, signed receipts, monotonic sequences, heartbeats, checkpoints, worktree/branch/SHA state, Docker state, and reconnect reconciliation. | Planning rationale, accepted Card activity/history, or the GitHub synchronization/outbox/conflict ledger. |
| **Incident** | A separate operational aggregate/projection with lifecycle `Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem`; permanent remediation is a linked Bug or Technical Task DevTicket. | A Sprint-eligible DevTicket type or an ordinary Board lane. |
| **Ask Admin Opzava** | The ADMIN-facing chat surface = the WebChat-parity port (program row #14; `chat.*` RPCs via the broker). Lives in the admin dashboard and is Dev Board/platform-ops only. | **Ask Opzava** (user-facing); OpenClaw's native WebChat UI itself. |
| **Ask Opzava** | The USER-facing assistant surface — user-dashboard family only (like CRM), never in the admin dashboard. The two Ask surfaces are bounded strictly by audience (user directive 2026-07-04). | **Ask Admin Opzava** (admin-facing). |
| **Port program** | The authoritative view-by-view port of OpenClaw's Control UI into the admin dashboard (`docs/plan/consensus/port-openclaw-control-ui-program.md`). | Hand-inventing admin surfaces. |
| **Mockup-revision-first** | For ported views: the OpenClaw view defines WHAT, the mockup defines LOOK; on conflict the mockup is corrected FIRST, then implemented to screenshot parity. | Treating either source alone as the full contract. |
| **Real-world validation (gate)** | The MANDATORY final Done gate: `node tests/e2e/gate/real-world-validate.mjs` on the real local stack — real login, real data, real visuals, loop until 2 consecutive clean passes, exit 0. | TDD/unit/mock/mutation tests (development-time only). |
| **Break-glass** | Emergency gateway ops via the fork's internal-only Control UI over an SSH tunnel. Never Traefik-routed. | A public admin fallback. |
| **Projections are cache** | Postgres projections of OpenClaw state are rebuildable; RPC snapshots are truth, WS events are hints. Reconnect = re-snapshot. | Treating projections or WS events as truth. |
| **dokploy-network** | The shared external Docker network both local and the Dokploy VPS use; internal legs ride it as plain `ws://`/`http://`. | A public network; nothing internal gets TLS or public listeners. |
| **UPSTREAM.md / PATCHES.md** | `mainframe/`'s pin record (repo, tag, commit, import date) and the rung-3 patch ledger. | Optional documentation — both are load-bearing for upstream bumps. |

## Legacy route note

The currently implemented `/tasks` and `/issues` routes, their existing Task aggregate/projection,
and their MCP/issue-adapter behavior remain **legacy as-built code until the migration is completed**.
They describe current runtime reality, not the target product vocabulary. New product design and
replacement implementation follow PRD-019, ADR-017, the Dev Board decision ledger, and the migration
manifest; do not use Q17 to extend the legacy model.
