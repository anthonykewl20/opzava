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
| **Admin dashboard** | The internal operator app: Opzava-native surfaces (Tasks, Issues, Ask Admin) + the ported OpenClaw Control-UI views (port program rows 1–14). | The user dashboard. CRM is NEVER an admin-dashboard surface (user directive 2026-07-04). |
| **User dashboard** | The future user-facing product surface family; permanent home of CRM (current `/crm/*` admin routes are a temporary Slice-3 parking spot). | Admin dashboard. |
| **Tasks** | Opzava's own task board (Slice 1 + Q17 AI-Workforce pipeline). Tasks IS the workboard. | OpenClaw's Control-UI "workboard" view (deliberately NOT ported). |
| **Ask Admin Opzava** | Opzava's admin chat surface = the WebChat-parity port (program row #14; `chat.*` RPCs via the broker). | A generic chatbot box; OpenClaw's native WebChat UI itself. |
| **Port program** | The authoritative view-by-view port of OpenClaw's Control UI into the admin dashboard (`docs/plan/consensus/port-openclaw-control-ui-program.md`). | Hand-inventing admin surfaces. |
| **Mockup-revision-first** | For ported views: the OpenClaw view defines WHAT, the mockup defines LOOK; on conflict the mockup is corrected FIRST, then implemented to screenshot parity. | Treating either source alone as the full contract. |
| **Real-world validation (gate)** | The MANDATORY final Done gate: `node real-world-validate.local.mjs` on the real local stack — real login, real data, real visuals, loop until 2 consecutive clean passes, exit 0. | TDD/unit/mock/mutation tests (development-time only). |
| **Break-glass** | Emergency gateway ops via the fork's internal-only Control UI over an SSH tunnel. Never Traefik-routed. | A public admin fallback. |
| **Projections are cache** | Postgres projections of OpenClaw state are rebuildable; RPC snapshots are truth, WS events are hints. Reconnect = re-snapshot. | Treating projections or WS events as truth. |
| **dokploy-network** | The shared external Docker network both local and the Dokploy VPS use; internal legs ride it as plain `ws://`/`http://`. | A public network; nothing internal gets TLS or public listeners. |
| **UPSTREAM.md / PATCHES.md** | `mainframe/`'s pin record (repo, tag, commit, import date) and the rung-3 patch ledger. | Optional documentation — both are load-bearing for upstream bumps. |
