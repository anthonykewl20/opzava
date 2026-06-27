# OpenClaw Gateway Setup

How to connect Opzava to an **OpenClaw gateway** so it can manage a fleet of agents over a
WebSocket control plane — register/discover gateways, sync agents, spawn and control sessions, and
monitor gateway health.

> **OpenClaw / Hermes are SERVER-ONLY.** The OpenClaw gateway and its **Hermes** agent runtime run
> **server-side only** — on the same host/filesystem as Opzava (the deploy box) — **never on the
> operator's laptop**. This is the two-plane split: the **local plane** is the operator's own CLIs
> (Claude Code / Codex / OpenCode) reached via MCP or device-auth; the **server plane** is the
> OpenClaw/Hermes fleet. Because subscription auth is detected **by-file** (e.g. GPT-Plus →
> `~/.codex/auth.json`, `auth_mode:"chatgpt"`), the gateway, its auth, and Opzava must be co-located
> on that server host (ARD 0026 GP2; CONTEXT.md two-plane split). Running the gateway on a dev machine
> is for local testing only, not the product topology.

> **Do you even need the gateway?** For a single local CLI (Claude Code / Codex / OpenCode) you do
> **not** need a gateway — use the MCP server or a direct connection (see
> [Connect a Local Agent](connect-local-agents.md)). Reach for the gateway when work runs as the
> **server-side OpenClaw/Hermes fleet** (the 24/7 substrate). Opzava also runs fully **gateway-free**
> in standalone mode (`NEXT_PUBLIC_GATEWAY_OPTIONAL=true`).

The server↔gateway RPC is **v3** (the browser path negotiates 3/4); keep the gateway on a compatible
build. Opzava warns on `/api/gateways/health` when a gateway version risks a tools-profile mismatch.

---

## 1. Configuration

Gateway connection settings come from the environment (defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `OPENCLAW_GATEWAY_HOST` | `127.0.0.1` | Host Opzava's backend dials for the gateway. In Docker use `host.docker.internal`. |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Gateway port. |
| `OPENCLAW_GATEWAY_TOKEN` | — | Auth token for the gateway, when required. |
| `OPENCLAW_CONFIG_PATH` | — | Path to your `openclaw.json` (used by agent config sync, §3). |
| `OPENCLAW_ENABLED` | `1` | Set `0` to run Opzava without the OpenClaw stack. |
| `NEXT_PUBLIC_GATEWAY_OPTIONAL` | — | `true` ⇒ standalone deploy with no gateway connectivity. |
| `NEXT_PUBLIC_GATEWAY_HOST` | — | Public hostname the **browser** uses for the gateway WebSocket (remote access). |

Multiple gateways can also be stored in the DB and managed at runtime (next section) — the env vars are
the default/primary target.

---

## 2. Register & connect a gateway

Use **Settings → Gateways** in the UI, or the API:

```bash
# Discover gateways reachable from the server
curl "$MC_URL/api/gateways/discover" -H "Authorization: Bearer $MC_API_KEY"

# Register a gateway (admin)
curl -X POST "$MC_URL/api/gateways" \
  -H "Authorization: Bearer $MC_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"primary","host":"127.0.0.1","port":18789,"token":"...","is_primary":true}'

# Get a browser WebSocket URL + token for a registered gateway
curl -X POST "$MC_URL/api/gateways/connect" \
  -H "Authorization: Bearer $MC_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"primary"}'
```

`GET/POST/PUT/DELETE /api/gateways` manage the gateway list; `POST /api/gateways/connect` returns the
`ws_url` + token the browser uses (it rewrites Docker-internal hosts to a browser-reachable one).

The gateway's own config (`openclaw.json`) is editable through `GET/PUT /api/gateway-config`, which uses
a content hash for optimistic concurrency (a stale `PUT` returns `409`).

---

## 3. Sync agents from `openclaw.json`

Point `OPENCLAW_CONFIG_PATH` at your `openclaw.json` and pull its agents in:

```bash
curl -X POST "$MC_URL/api/agents/sync" \
  -H "Authorization: Bearer $MC_API_KEY" -H "Content-Type: application/json" \
  -d '{"source":"config"}'
```

`{"source":"local"}` instead scans `~/.agents/`, `~/.codex/agents/`, `~/.claude/agents/`,
`~/.hermes/skills/` for agent definitions. See [Agent Setup](agent-setup.md) for the discovery format.

---

## 4. Spawn & control sessions

Once connected, dispatch and control agent sessions through the gateway:

```bash
# Spawn an agent task via the gateway
curl -X POST "$MC_URL/api/spawn" \
  -H "Authorization: Bearer $MC_API_KEY" -H "Content-Type: application/json" \
  -d '{"agent":"scout","task":"..."}'
```

`GET/POST /api/gateways/control` covers gateway-level control actions. (Spawning requires a reachable
gateway; there's no adapter in this path.)

---

## 5. Health & verification

| What | How |
|---|---|
| **Per-gateway probe** | `POST /api/gateways/health` (viewer) — probes every registered gateway's `/health`, records latency + version + any compatibility warning, and stores history (`GET /api/gateways/health/history`). |
| **Is the gateway up at all** | `GET /api/status?action=health` includes a **Gateway** check (process running) alongside DB, disk, memory, direct-connection, and provider checks. |
| **Capabilities** | `GET /api/status?action=capabilities` reports whether the gateway port is reachable, `openclawHome`, and dashboard auto-registration. |

```bash
curl -X POST "$MC_URL/api/gateways/health" -H "Authorization: Bearer $MC_API_KEY" | jq
```

---

## 6. Docker connectivity

Opzava in Docker needs to reach a gateway on the host — there are **two** connections:

1. **Server-side** (Opzava backend → gateway): set `OPENCLAW_GATEWAY_HOST=host.docker.internal`
   (Docker Desktop resolves it; on Linux `docker-compose.yml` maps it via `extra_hosts`).
2. **Browser-side** (user's browser → gateway WebSocket): Opzava auto-rewrites a Docker-internal host
   to the browser's hostname. For remote access set `NEXT_PUBLIC_GATEWAY_HOST` to the public hostname.

If the gateway runs in **another container**, put both on the same Docker network and set
`OPENCLAW_GATEWAY_HOST` to the gateway container name. Full detail + troubleshooting (origin-not-allowed,
device-identity, VPS offline) is in [Deployment → Gateway Connectivity](deployment.md#gateway-connectivity-from-docker).

---

## Troubleshooting

- **Gateway shows offline / WebSocket won't connect** — confirm `OPENCLAW_GATEWAY_HOST/PORT`, then run
  `POST /api/gateways/health`. See [Deployment troubleshooting](deployment.md).
- **"origin not allowed" / "device identity required"** — gateway-side auth/posture; see the dedicated
  sections in [deployment.md](deployment.md).
- **Running without a gateway** — set `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` (and `OPENCLAW_ENABLED=0`); the
  gateway health check will report not-running, which is expected in standalone mode.

## See also
- [Connect a Local Agent](connect-local-agents.md) — MCP / direct connection / adapters (no gateway)
- [Agent Setup](agent-setup.md) — registration, config sync, SOUL/personality
- [Deployment](deployment.md) — Docker, env, gateway connectivity, hardening
