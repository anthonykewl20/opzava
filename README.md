<div align="center">

# Opzava

**Self-hosted AI operations control plane for building an internal AI team.**

Run durable content, outreach, and operational workflows with structured artifacts, human approval gates, source provenance, and anti-slop review — all from one dashboard. Forked from the open-source agent-orchestration base and heavily customized under the `src/opzava/` namespace.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-1783%20passing-brightgreen)](https://opzava.anito.ai)

</div>

---

> **Note** — Opzava is a self-hosted product under active development. APIs, database schemas, and configuration formats may change between releases. Review the [security considerations](#security) before deploying to production.

## Contents

- [Quick Start](#quick-start)
- [What Opzava does](#what-opzava-does)
- [Architecture](#architecture)
- [Agent Control Interfaces](#agent-control-interfaces)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

<table>
<tr><td><b>Durable workflows</b></td><td>Versioned workflow definitions, step-level runs, structured artifacts, approval gates, dead-letter replay, and exactly-once external calls.</td></tr>
<tr><td><b>Internal AI team</b></td><td>SEO Researcher, Content Writer, Editor/Fact Checker, Outreach Researcher, Cold Email Writer, Campaign Operator, and a Human Approver — modeled as department agents.</td></tr>
<tr><td><b>Real-time everything</b></td><td>WebSocket + SSE push updates with smart polling that pauses when you're away. Zero stale data.</td></tr>
<tr><td><b>Zero external deps</b></td><td>SQLite database, single <code>pnpm start</code> to run. No Redis, no Postgres, no Docker required.</td></tr>
<tr><td><b>Source of truth</b></td><td>Structured database artifacts are the source of truth — not agent memory, prompts, or logs. Admin settings own provider configuration.</td></tr>
<tr><td><b>Quality gates</b></td><td>Source provenance, fact-check, brand review, anti-slop review, and human approval block external side effects like WordPress drafts and email sends.</td></tr>
<tr><td><b>Role-based access</b></td><td>Viewer, operator, and admin roles with session + API key auth.</td></tr>
<tr><td><b>Cost & audit</b></td><td>Per-run cost events, audit trails, and external-call records for every provider interaction.</td></tr>
</table>

---

## Quick Start

### One-Command Install

```bash
git clone https://github.com/anthonykewl20/opzava.git
cd opzava
bash install.sh --local     # or: bash install.sh --docker
```

After installation:

```bash
open http://localhost:3000/setup    # create your admin account
```

The installer handles Node.js 22+, pnpm, dependencies, and auto-generates secure credentials. For Windows, use `.\install.ps1 -Mode local` in PowerShell.

### Manual Setup

```bash
git clone https://github.com/anthonykewl20/opzava.git
cd opzava
nvm use 22 && pnpm install
pnpm dev                    # http://localhost:3000/setup
```

Secrets (`AUTH_SECRET`, `API_KEY`) auto-generate on first run if not set. Visit `http://localhost:3000/setup` to create an admin account, or set `AUTH_USER`/`AUTH_PASS` in `.env` for headless/CI seeding.

### Docker Zero-Config

```bash
docker compose up           # Opzava only; auto-generates credentials, persists across restarts
```

OpenClaw does **not** install on the host. To run the server-side OpenClaw fleet, enable the bundled
Docker sidecar:

```bash
OPENCLAW_ENABLED=1 make up openclaw
# or:
docker compose -f docker-compose.yml -f docker-compose-openclaw.yml up -d --build
```

For production hardening (read-only filesystem, capability dropping, HSTS, network isolation):

```bash
docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d
```

Project home: **[opzava.anito.ai](https://opzava.anito.ai)**

---

## What Opzava does

Opzava coordinates an internal AI team across departments. The system owns sequence, validation, retries, approvals, external actions, source provenance, cost tracking, admin-managed configuration, and audit trails — agents are workers, not the brain.

### Content Department workflow

```text
Idea intake
→ topic and keyword research
→ SERP and competitor research
→ source capture
→ SEO brief
→ outline
→ article draft
→ fact check
→ brand and style review
→ anti-slop review
→ human approval
→ WordPress draft
```

The first workflow ends at a **WordPress draft**. It does not publish live content automatically. Every step writes a structured, versioned artifact with lineage; generated content cannot reach the WordPress draft step without source provenance, fact-check, brand review, anti-slop review, and human approval.

### Outreach Department workflow

```text
Lead source intake
→ prospect research
→ lead qualification
→ enrichment
→ cold email draft
→ compliance and tone review
→ human approval
→ send or schedule
→ reply tracking
```

Outreach (email campaigns via Resend) starts only after the content workflow proves the durable runner, artifact model, approvals, and audit trail. Email sending requires explicit human approval.

### Operator dashboard

Inherited agent-orchestration surfaces are preserved: agent registry, task board, memory browser, skills hub, cost tracking, security audit, cron/scheduling, webhooks, and framework adapters. New Opzava product logic lives under `src/opzava/` and is surfaced through `/api/ops/*`, `/api/campaigns/*`, and `/api/team/*` plus dedicated panels.

---

## Architecture

```
opzava/
├── src/
│   ├── app/
│   │   ├── page.tsx           # SPA shell — routes all panels
│   │   ├── login/page.tsx     # Login page
│   │   ├── setup/page.tsx     # First-run admin setup
│   │   └── api/               # 165 REST API routes
│   │       └── ops/ campaigns/ team/ connections/   # Opzava-native surfaces
│   ├── components/
│   │   ├── layout/            # NavRail, HeaderBar, LiveFeed
│   │   ├── dashboard/         # Overview dashboard
│   │   └── panels/            # 44 feature panels
│   ├── lib/                   # Inherited application logic, database, utilities
│   ├── opzava/                # Opzava product namespace (new domain code)
│   │   ├── core/              # workflows, artifacts, approvals contracts
│   │   ├── modules/           # content, team, social, general-va feature modules
│   │   └── platform/          # runner, providers, admin-config, audit, costs
│   └── store/index.ts         # Zustand state management
└── .data/                     # Runtime data (SQLite DB, token logs)
```

New product code goes under `src/opzava/modules/<feature>/`; route handlers and panels stay thin and call into `@/opzava/...`. See [`docs/architecture/folder-structure.md`](docs/architecture/folder-structure.md).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 3.4 |
| Language | TypeScript 5.7 |
| Database | SQLite via better-sqlite3 (WAL mode), Postgres-compatible schema |
| State | Zustand 5 |
| Charts | Recharts 3 |
| Real-time | WebSocket + Server-Sent Events |
| Validation | Zod 4 |
| Testing | Vitest (1783 unit) + Playwright (E2E) |

## Authentication

| Method | Details |
|--------|---------|
| Session cookie | `POST /api/auth/login` — 7-day expiry |
| API key | `x-api-key` header |

| Role | Access |
|------|--------|
| `viewer` | Read-only |
| `operator` | Read + write (tasks, agents, chat) |
| `admin` | Full access (users, settings, system ops) |

---

## Agent Control Interfaces

Opzava provides three interfaces for autonomous agents:

### MCP Server (recommended for agents)
```bash
# Add to any Claude Code agent:
claude mcp add opzava -- node /path/to/opzava/scripts/mc-mcp-server.cjs

# Environment config:
MC_URL=http://127.0.0.1:3000 MC_API_KEY=<key>
```
Tools cover agents, tasks, sessions, memory, soul, comments, tokens, skills, cron, status. See [`docs/cli-agent-control.md`](docs/cli-agent-control.md).

### CLI
```bash
pnpm mc agents list --json
pnpm mc tasks queue --agent Aegis --max-capacity 2 --json
pnpm mc events watch --types agent,task
```

### REST API
OpenAPI spec: [`openapi.json`](openapi.json). Interactive docs at `/docs` when running. Opzava-native operational surfaces are under `/api/ops/*` (runs, artifacts, approvals, costs, dead-letters, maintenance), `/api/campaigns/*`, and `/api/team/*`.

---

## API Reference

Opzava exposes 165 REST endpoints documented via OpenAPI 3.1. Browse the interactive API docs at `/docs` (Scalar UI) when running locally, or see [`openapi.json`](openapi.json).

<details>
<summary><strong>Core endpoints at a glance</strong></summary>

| Area | Key Endpoints |
|------|---------------|
| **Ops — runs** | `GET /api/ops/runs`, `GET /api/ops/artifacts`, `GET /api/ops/approvals` |
| **Ops — failures** | `GET /api/ops/dead-letters`, `POST /api/ops/maintenance/prune` |
| **Ops — costs** | `GET /api/ops/costs` |
| **Campaigns** | `GET/POST /api/campaigns`, `POST /api/campaigns/[id]/run`, `POST /api/campaigns/[id]/approve` |
| **Team** | `GET/POST /api/team/agents`, `PUT /api/team/agents/[id]` |
| **Connections** | `POST /api/connections/test` (WordPress, Resend) |
| **Agents** | `GET/POST /api/agents`, `POST /api/agents/register` |
| **Tasks** | `GET/POST /api/tasks`, `GET /api/tasks/queue` |
| **Monitoring** | `GET /api/status`, `GET /api/tokens`, `GET /api/activities` |
| **Webhooks** | `GET/POST/PUT/DELETE /api/webhooks` |

</details>

## Environment Variables

Key variables (see [`.env.example`](.env.example) for the full list):

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_USER` | No | Initial admin username (default: `admin`) |
| `AUTH_PASS` | No | Initial admin password (auto-generated if unset) |
| `API_KEY` | No | API key for headless access (auto-generated if unset) |
| `MISSION_CONTROL_DATA_DIR` | No | Directory for all data files (DB, tokens, etc.). Use an absolute path with the standalone server. |
| `MISSION_CONTROL_DB_PATH` | No | Override the SQLite database path. |
| `OPENCLAW_ENABLED` | No | `1` enables the Docker OpenClaw sidecar overlay. Keep `0`/unset for gateway-free standalone mode. |
| `OPENCLAW_GATEWAY_HOST` | No | Docker sidecar host. Use `mc-openclaw-gateway` when `OPENCLAW_ENABLED=1`. |
| `MC_ALLOWED_HOSTS` | No | Host allowlist for production |
| `NEXT_PUBLIC_GATEWAY_OPTIONAL` | No | Run without gateway connection |

> The `MISSION_CONTROL_*` / `MC_*` env-var names are inherited from the upstream base and still used by the code.

---

## Development

```bash
pnpm dev              # Dev server
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm test             # Vitest unit tests (1783)
pnpm test:e2e         # Playwright E2E
pnpm quality:gate     # All checks
```

Governance checks (branding, folder-structure, code-simplicity, complexity, ARD presence) live in `test/*.test.mjs` and run via `node --test`.

### Diagnostics

```bash
bash scripts/station-doctor.sh     # Installation health check
bash scripts/security-audit.sh     # Security configuration audit
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Internal server error" on login | `pnpm rebuild better-sqlite3` (Node version mismatch) |
| Docker: gateway not connecting | Start the sidecar with `OPENCLAW_ENABLED=1 make up openclaw` and use `OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway` |
| 404 on all pages | Clear Next.js cache: `rm -rf .next && pnpm dev` |
| `AUTH_PASS` with `#` ignored | Quote it: `AUTH_PASS="my#pass"` or use `AUTH_PASS_B64` |
| Standalone mode | Use `pnpm start:standalone` or `scripts/mc-server.cjs` so `/ws/pty` is served |

See [docs/deployment.md](docs/deployment.md) for detailed troubleshooting.

## Security

- **Change all default credentials** before deploying
- **Deploy behind a reverse proxy with TLS** for any network-accessible deployment
- **Do not expose to the public internet** without configuring `MC_ALLOWED_HOSTS` and TLS
- No hard-coded secrets, provider credentials, model choices, or endpoints in source — operator-controlled values live in admin settings with secret references and redaction
- See [SECURITY.md](SECURITY.md) for vulnerability reporting and [docs/SECURITY-HARDENING.md](docs/SECURITY-HARDENING.md) for the hardening guide

---

## Documentation

| Guide | What You'll Learn |
|-------|-------------------|
| [Quickstart](docs/quickstart.md) | Register an agent, create a task, complete it — 5 minutes |
| [Agent Setup](docs/agent-setup.md) | SOUL personalities, config, heartbeats, agent sources |
| [Orchestration](docs/orchestration.md) | Multi-agent workflows, auto-dispatch, quality review gates |
| [CLI Reference](docs/cli-agent-control.md) | Full CLI command list for headless/scripted usage |
| [CLI Integration](docs/cli-integration.md) | Connect Claude Code, Codex, or any CLI tool directly |
| [Deployment](docs/deployment.md) | Production deployment, reverse proxy, VPS setup |
| [Security Hardening](docs/SECURITY-HARDENING.md) | Docker hardening, CSP, network isolation |

### Project health files

- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow and development standards
- [SECURITY.md](SECURITY.md) — vulnerability disclosure and security policy
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community conduct expectations
- [CHANGELOG.md](CHANGELOG.md) — release history
- [RELEASE.md](RELEASE.md) — release process and checklist
- [LICENSE](LICENSE) — MIT license

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) © 2026 Opzava
