# Opzava ubiquitous language (canonical glossary)

Use these terms EXACTLY. If a doc, issue, or conversation uses a term differently, this file wins;
if a new term crystallises, add it here in the same slice. Definitions only — design detail lives in
`ARCHITECTURE.md`, current PRDs/ADRs, and their current foundation decision ledgers.

| Term | Means | Not to be confused with |
| --- | --- | --- |
| **OpenClaw** | The upstream open-source agent runtime (github.com/openclaw/openclaw). | Our fork of it (Mainframe). |
| **Mainframe** | The Opzava-owned tracked fork of OpenClaw at `mainframe/` (ADR-016). Source code we build and patch. | The running container (Platform Gateway). |
| **Platform Gateway** | The one running OpenClaw gateway container (`openclaw-platform-gateway` Compose service), built from `mainframe/`. | Dynamic per-tenant Gateways (deferred, ADR-002 amendment). |
| **Customization ladder** | Rungs 0–3 for changing Mainframe: config → extension points → additive `extensions/opzava-*` modules → logged source patches (`mainframe/PATCHES.md`). Lowest rung that works, always. | Free editing of upstream files. |
| **gateway-broker (broker)** | The ONLY hot-path ACL to OpenClaw (ADR-003): browser/app → broker → gateway. | provisioning-worker (admin/JIT path). |
| **provisioning-worker (worker)** | The admin/JIT-token path for config, onboarding, pairing, and (later) dynamic Gateway lifecycle. | The broker hot path. |
| **Two-token model** | Hot-path device token (`operator.write`+`approvals`) vs short-lived job-scoped `operator.admin` (ADR-003). | Any single-credential shortcut. |
| **Admin Control Center** | The admin-only Opzava shell and composition surface for platform development, runtime, operations, security, and setup; it is not a bounded context. It never contains CRM, Marketing, or Finance destinations, although operational Usage & Costs belongs here. | The user dashboard; a new source of domain truth; the former generic “admin dashboard” label. |
| **Admin Overview** | The read-only, cross-context landing composition of the Admin Control Center. | Dev Board Summary; a mutation authority; a competing OpenClaw Overview route. |
| **User dashboard** | The future user-facing product surface family and permanent home of the deferred CRM rebuild. CRM currently has no surface; it returns here, not in the Admin Control Center (GitHub issue #200, 2026-07-15). | Admin Control Center. |
| **Dev Board** | The Opzava-primary developer-operations surface that unifies planning, execution, review, GitHub Issue synchronization, Sprints, Docs, Development evidence, and Releases for the Opzava repository. | The legacy `/tasks` and `/issues` routes; OpenClaw's Control-UI Workboard; customer-support tickets. |
| **DevTicket** | The aggregate owned by the Dev Board bounded context. It holds the governed work contract, workflow state, dependencies, Sprint membership, approvals, assignments, evidence references, and GitHub synchronization identity. | A GitHub Issue, a generic PM task, an OpenClaw task-ledger entry, or the visual Card. |
| **Card** | The visual projection of one DevTicket in Board, List, Sprint, or detail views. | The persisted aggregate itself; a duplicated Sprint copy. |
| **Proposal** | An agent-discovered candidate that stays Opzava-only until a Human Owner accepts, merges, rejects, or archives it. Acceptance creates a DevTicket in Backlog and its GitHub Issue mirror. | An executable Todo item or an already-created GitHub Issue. |
| **Human Owner** | The accountable human who shapes the DevTicket, supplies required human inputs, approves governed changes, and resolves policy or synchronization conflicts. | Execution Assignee, Lead Orchestrator, or Reviewer. |
| **Execution Assignee** | The optional single human or agent identity selected to implement a DevTicket. Todo may be unassigned; an atomic claim assigns it before work begins. | Human Owner, Lead Orchestrator, Runner, or Reviewer. |
| **Lead Orchestrator** | The Personal Assistant / coordination role that dispatches, communicates, pauses, escalates, and keeps the human informed without silently granting approval or becoming the Execution Assignee. | The independent Reviewer or the machine-running Runner. |
| **Reviewer** | The separately configured, fresh local agent-tool/model identity that evaluates a locked commit and evidence package against the approved contract in the local Docker stack. | Lead Orchestrator, Execution Assignee, or Human Owner. |
| **Runner** | An explicitly selected execution location and control endpoint: the user's enrolled local machine or an admitted orchestrator/cloud runner. It owns a fenced lease, branch/worktree, process state, and checkpoint/reconciliation protocol; only the local Runner owns the required local Docker Review access. | The agent/model identity operating through it; an automatic failover target; an OpenClaw Node or Device. |
| **OpenClaw Node** | An OpenClaw-native capability-bearing companion runtime endpoint. | A paired Device; a Dev Board Runner, even when one physical machine hosts both. |
| **OpenClaw Device** | An OpenClaw-native paired client identity with its own role/token record. | A Node; a Dev Board Runner, even when one physical machine holds both identities. |
| **Sprint** | One versioned goal and ordered DevTicket plan executed as `autonomous_serial`; at most one Sprint is Active, while Drafts and one Approved/Queued Sprint may exist. | A Kanban lane, an Epic, or every collection of ordinary work. |
| **Ready Contract** | The version-bound contract required before Backlog can become Todo: outcome, bounded scope, sad paths, edge cases, acceptance criteria, dependency state, user-level E2E expectations, final behavioral contract, required human inputs, and governance metadata. | A title-only task, free-form description, or permanent approval after material edits. |
| **GitHub Mirror** | The durable synchronized GitHub Issue representation of an accepted DevTicket, including managed labels, readable contract block, comments, milestone/worklog history, and native delivery links. Opzava owns workflow and gates; GitHub owns its native issue number/URL and PR, commit, check, and merge facts. | A second independent workflow authority or a disposable cache. |
| **Sync Conflict** | A visible unresolved conflict when concurrent Opzava/GitHub changes target the same governed field. Contract, dependency, assignment, or approval conflicts pause affected execution until the Human Owner resolves them in Opzava. | A harmless different-field auto-merge or temporary integration-health failure. |
| **Runner execution ledger** | The append-oriented operational record of leases, fencing tokens, command nonces, signed receipts, monotonic sequences, heartbeats, checkpoints, worktree/branch/SHA state, Docker state, and reconnect reconciliation. | Planning rationale, accepted Card activity/history, or the GitHub synchronization/outbox/conflict ledger. |
| **Incident** | A separate operational aggregate/projection with lifecycle `Detected → Triaged → Mitigating → Monitoring → Resolved → Postmortem`; permanent remediation is a linked Bug or Technical Task DevTicket. | A Sprint-eligible DevTicket type or an ordinary Board lane. |
| **Ask Admin Opzava** | The admin-facing Personal Assistant and Lead-Orchestrator chat surface in the Admin Control Center, scoped to platform development and operations. | **Ask Opzava** (user-facing); OpenClaw's native WebChat UI; the subset of skills allowed for Ask Admin. |
| **Ask Opzava** | The user-facing assistant surface — user-dashboard family only (like CRM), never in the Admin Control Center. The two Ask surfaces are bounded strictly by audience (user directive 2026-07-04). | **Ask Admin Opzava** (admin-facing). |
| **Engineering Skills** | The Opzava-governed, upstream-tracked or fork-derived catalog of engineering workflow skills available to the orchestrator and allowed enrolled local harnesses. | Runtime Skills; MCP Servers; the narrower Ask Admin skill subset. |
| **Runtime Skills** | OpenClaw-native skills installed or available in the runtime for agent execution. | Engineering Skills; MCP Servers; the narrower Ask Admin skill subset. |
| **Ask Admin skill subset** | The policy-approved subset of skills that Ask Admin Opzava may invoke for its admin-facing responsibilities. | The full Engineering Skills or Runtime Skills catalogs. |
| **MCP Servers** | Policy-governed configured MCP endpoints and their projected tools. | Engineering Skills, Runtime Skills, or a skill category. |
| **Port program** | Frozen historical and OpenClaw-parity evidence from the earlier Control-UI port plan. | Current Admin placement authority, which belongs to PRD-020 and the capability-parity map. |
| **Mockup-revision-first (historical)** | Frozen process evidence from the earlier Control-UI port effort, where an OpenClaw view supplied capability parity and a mockup supplied visual direction. | Current design authority, which requires a prototype/mockup linked by the active PRD and approved issue. |
| **Real-world validation (verify posture)** | The default proof a change works: drive the affected flow on the real local stack (real login, real seeded data, real visuals) with the `/verify` skill plus the `tests/e2e/` drives, and observe the exact changed behavior. Lean and high-signal, not a mandatory blocking gate. | TDD/unit/mock/mutation tests (development-time only); the retired senior-qa gate. |
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
