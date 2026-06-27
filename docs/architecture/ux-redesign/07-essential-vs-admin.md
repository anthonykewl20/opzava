# 07 — Audience Modes: Essential (everyday users) vs Admin / Super-admin

> **Directive:** *Essential* is for the **normal, non-technical user** — optimize for them. No technical jargon, no raw technical surfaces. Technical depth is for **admins** (Full mode) and **super-admins** only. And the interface must be **proven user-friendly** — built from conventions people already know, not novel experiments.

This is a product-defining principle, so it gets its own document. It governs IA (`03`), copy, default routing, and which components render per role.

---

## Two audiences, one product

| | **Essential** (default) | **Full / Admin** | **Super-admin** |
|---|---|---|---|
| Who | Everyday operator / non-technical user | Technical admin running the fleet | Platform owner / multi-tenant |
| Mental model | "Get my work done; is everything OK?" | "Operate, debug, tune the system" | "Provision, govern, audit tenants" |
| Language | Plain, human, task-oriented | Technical terms allowed | Full technical + infra terms |
| Surfaces | Home, Assistants, Work, Activity, Messages, Spending, Settings | + Logs, Monitoring, Connections, Cron, Webhooks, Integrations, Security, Audit | + Tenants, Provisioning, Nodes, Gateways, Debug |
| Default for | All non-admin users | Users with the admin role | Users with the super-admin role |

**Rule of thumb:** if a label needs the user to know what a *gateway*, *SSE stream*, *exit code*, *exec-approval*, or *node* is, it does **not** belong in Essential.

---

## Why this is also an accessibility/clarity fix

The visual audit (`06`) caught the current product **leaking raw technical strings into the everyday UI**:

- Absolute file paths rendered as body text (`/home/anthony/devtony/anito-opzava/.next/standalone/AGENTS.md`).
- A verbatim CLI error in an amber banner: *"openclaw mock: unsupported args: doctor"*.
- ~25 panels showing a bare *"X is available in Full mode."* dead-end (jargon + no next step).

None of that is meaningful to a normal user; all of it erodes trust. Removing it from Essential is both the audience requirement **and** a clarity/quality fix.

---

## Essential design tenets (optimize for the normal user)

1. **Plain language only.** Task verbs, human nouns. "Connection" not "gateway", "Approve action" not "exec-approval", "Assistant" not "agent runtime".
2. **Show status, not internals.** "Everything's running" / "1 thing needs attention" — never queue depths, retry counts, or process IDs.
3. **One obvious next step per screen.** A single primary action; everything else secondary or hidden.
4. **No dead-ends.** Technical panels are simply **absent** from Essential navigation — never shown as a gated "Full mode" stub. Fewer, clearer destinations (Hick's Law).
5. **Friendly empty & error states.** "No tasks yet — create your first" / "We couldn't reach the service. Retry." Never a stack trace, file path, exit code, or CLI string. A **"Technical details"** disclosure is available to admins only.
6. **Progressive disclosure to power.** A normal user who needs more can be switched (or self-switch, if permitted) to Full; the door is visible but unobtrusive.
7. **Proven patterns, not novelty** (see below).

---

## "Real, proven user-friendly" — the conventions we use (Jakob's Law)

The redesign deliberately reuses patterns users already understand from the products they use daily. Nothing here is experimental:

| Pattern | Where users know it from | Used in Opzava for |
|---|---|---|
| Left sidebar nav, logo top-left → Home | Slack, Linear, Notion, GitHub | Primary navigation |
| ⌘K / Ctrl-K command palette | Linear, GitHub, Raycast, VS Code | Jump-to anything (power users; novices ignore it) |
| Cards + KPI stat tiles | Stripe, Vercel, Datadog dashboards | Overview at a glance |
| Kanban board | Trello, Jira, Linear | Tasks |
| Tabs for an entity's facets | Every settings/profile screen | Agent/assistant detail |
| Toasts bottom-right, severity-colored | Gmail, GitHub, macOS | Transient notifications |
| Settings = left section list + form | macOS/iOS Settings, Stripe, GitHub | Settings |
| Inline status pill: dot + word | Vercel deployments, GitHub Actions | Health & run status |
| Bell with unread count → inbox | Every social/SaaS app | Notifications |

Because the patterns are conventional, the interface is *predictable* — the strongest, most "proven" form of user-friendliness. We measure it (see Acceptance) rather than assert it.

---

## Surface visibility matrix

Friendly Essential label in **bold**; underlying panel in `code`.

| Surface | Essential (everyday) | Full / Admin | Super-admin |
|---|:---:|:---:|:---:|
| **Home** (`overview`) | ✅ | ✅ | ✅ |
| **Assistants** (`agents`, `team`) | ✅ | ✅ | ✅ |
| **Work** (`tasks`, `approval-queue`) | ✅ | ✅ | ✅ |
| **Activity** (`activity`) | ✅ | ✅ | ✅ |
| **Messages** (`chat`) | ✅ | ✅ | ✅ |
| **Spending** (`cost-tracker`/`costs` merged) | ✅ (summary) | ✅ (detailed) | ✅ |
| **Settings** (`settings`) | ✅ (simplified) | ✅ (full) | ✅ |
| Notifications & Alerts (`notifications`,`alerts`) | ✅ (notifications) | ✅ (+ alert rules) | ✅ |
| Monitoring (`monitor`, `system-monitor`) | — | ✅ | ✅ |
| Logs (`logs`, `log-viewer`) | — | ✅ | ✅ |
| Connections (`gateways`, `gateway-config`, `channels`) | — | ✅ | ✅ |
| Automation (`cron`, `webhooks`, `integrations`, `campaigns`) | — | ✅ | ✅ |
| Security & Audit (`security`, `audit`, `exec-approvals`) | — | ✅ | ✅ |
| Memory / Skills / Artifacts (`memory`,`skills`,`artifacts`) | — | ✅ | ✅ |
| Debug (`debug`) | — | ✅ (collapsed) | ✅ |
| Tenants / Provisioning / Nodes (`super-admin`,`nodes`,`maintenance`) | — | — | ✅ |

Essential = **7 friendly destinations**. Everything technical is one switch away, never a dead-end.

---

## Jargon → plain language (Essential copy map)

| Technical (Full/Admin) | Essential (everyday) |
|---|---|
| Agent / agent runtime | Assistant |
| Gateway / OpenClaw sidecar | Connection |
| Exec-approval | Action to approve |
| SSE stream disconnected | Live updates paused — reconnecting |
| Node / worker | (hidden; rolled into "system status") |
| Token usage / spend | Spending |
| OpenClaw sidecar health warnings | A setup check needs attention |
| Exit code 1 / stack trace | Something went wrong — Retry · *(Technical details — admins)* |
| Cron job | Schedule |
| Webhook | Automation |
| Memory store / embeddings | Knowledge |
| Heartbeat / liveness | Online / Offline |

**Error/empty copy rule:** user-facing message is plain + actionable; any raw technical detail (paths, args, codes) is hidden behind an admin-only **"Technical details"** expander. Never render absolute file paths or CLI output in Essential.

---

## Mode-switch UX

- **Default by role:** non-admins start in Essential; admins in Full; super-admins see the super-admin surfaces.
- **Switch:** a clear control in the user menu — "View: **Essential** ▾ / Full" (admins only). Persisted per user (`general.interface_mode`). Plain tooltip: *"Full view adds technical tools for admins."*
- **No jargon gate:** removing a surface from Essential means it's **absent from nav**, not shown as a "available in Full mode" stub.

---

## Acceptance criteria (so it's *proven*, not asserted)

- [ ] Zero raw file paths, CLI strings, exit codes, or stack traces appear anywhere in Essential (automated string scan in CI).
- [ ] Essential nav ≤ 7 destinations; every label passes a "would a non-technical user understand this?" review.
- [ ] Every Essential empty/error state has a plain message + a next action; technical detail is admin-gated.
- [ ] Each screen maps to a named convention in the table above (no novel interaction without a documented reason).
- [ ] Task-success usability test: ≥ 5 non-technical users complete "create a task", "check spending", "see what an assistant is doing" unaided (SUS target ≥ 80).

---

> **The Essential view is realized as a calm adaptation of Basecamp** — projects-as-workspaces, To-dos, and a Card Table (swim lanes), in plain language. The full teardown + mapping is in [`08-basecamp-teardown.md`](08-basecamp-teardown.md); the screens are `essential-home`, `essential-project`, `essential-todos`, `essential-card-table`.

*See [`03-ia-navigation.md`](03-ia-navigation.md) for the full panel→nav mapping and [`08-basecamp-teardown.md`](08-basecamp-teardown.md) for the Basecamp blueprint.*
