# OpenClaw Gateway Setup

How to connect Opzava to an **OpenClaw gateway** so it can manage a fleet of agents over a
WebSocket control plane — register/discover gateways, sync agents, spawn and control sessions, and
monitor gateway health.

> **OpenClaw / Hermes are SERVER-ONLY.** The OpenClaw gateway and its **Hermes** agent runtime run as
> the `mc-openclaw-gateway` Docker sidecar for this app. Do not install or start `openclaw` on an
> operator laptop or host shell. This is the two-plane split: the **local plane** is the operator's own
> CLIs (Claude Code / Codex / OpenCode) reached via MCP or device-auth; the **server plane** is the
> Docker OpenClaw/Hermes fleet. Because subscription auth is detected **by-file** (e.g. GPT-Plus →
> `~/.codex/auth.json`, `auth_mode:"chatgpt"`), the sidecar, its state volume, and Opzava must be
> co-located on the deploy host (ARD 0026 GP2; CONTEXT.md two-plane split).

> **Do you even need the gateway?** For a single local CLI (Claude Code / Codex / OpenCode) you do
> **not** need a gateway — use the MCP server or a direct connection (see
> [Connect a Local Agent](connect-local-agents.md)). Reach for the gateway when work runs as the
> **server-side OpenClaw/Hermes fleet** (the 24/7 substrate). Opzava also runs fully **gateway-free**
> in explicit standalone/dashboard mode (`GATEWAY_OPTIONAL=true`).

The server↔gateway RPC is **v3** (the browser path negotiates 3/4); keep the gateway on a compatible
build. Opzava warns on `/api/gateways/health` when a gateway version risks a tools-profile mismatch.

---

## 1. Configuration

Gateway connection settings come from the environment (defaults shown):

| Variable | Default | Purpose |
|---|---|---|
| `OPENCLAW_GATEWAY_HOST` | `mc-openclaw-gateway` in Docker | Host Opzava's backend dials for the sidecar gateway. |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Gateway port. |
| `OPENCLAW_GATEWAY_TOKEN` | — | Auth token for the gateway, when required. |
| `OPENCLAW_STATE_DIR` | `/home/nextjs/.openclaw` in Docker | Read-only sidecar state mount visible to Opzava. |
| `OPENCLAW_CONFIG_PATH` | `/home/nextjs/.openclaw/openclaw.json` in Docker | Path to the sidecar-mounted `openclaw.json` (used by agent config sync, §3). |
| `GATEWAY_OPTIONAL` | `false` | `true` means deliberate standalone/dashboard mode with no gateway connectivity. |
| `PUBLIC_GATEWAY_HOST` | — | Runtime container env for the public hostname the **browser** uses for the gateway WebSocket. Empty locally lets the app auto-detect and still honors the browser localStorage override. |
| `PUBLIC_GATEWAY_PORT` | `18789` | Browser-reachable gateway port; local Traefik parity uses `3080`. |

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
  -d '{"name":"primary","host":"mc-openclaw-gateway","port":18789,"token":"...","is_primary":true}'

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

`GET/POST /api/gateways/control` covers gateway-level diagnostics. Start, stop, restart, and upgrade
operations are Docker Compose actions, not local `openclaw` commands.

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

## 6. Docker Sidecar

OpenClaw is part of the Docker app-runtime topology. Start the app through the
same base+override stack humans and Dokploy parity use:

```bash
make up dev
# or:
make up parity
```

Use these container-side defaults:

```env
OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_STATE_DIR=/home/nextjs/.openclaw
OPENCLAW_CONFIG_PATH=/home/nextjs/.openclaw/openclaw.json
```

The gateway writes Hermes state at `/home/node/.hermes`; Opzava reads the shared
Docker `hermes-data` volume at `/home/nextjs/.hermes` read-only. The browser-side
WebSocket uses runtime `PUBLIC_GATEWAY_HOST` / `PUBLIC_GATEWAY_PORT` when remote
access needs a public hostname; do not use baked `NEXT_PUBLIC_GATEWAY_*` values
for normal Docker parity. Full detail + troubleshooting (origin-not-allowed,
device-identity, VPS offline) is in
[Deployment → Gateway Connectivity](deployment.md#gateway-connectivity-from-docker).

---

## Troubleshooting

- **Gateway shows offline / WebSocket won't connect** — confirm `OPENCLAW_GATEWAY_HOST/PORT`, then run
  `POST /api/gateways/health`. If the sidecar is down, run `make up parity` or `make up dev`.
- **"origin not allowed" / "device identity required"** — gateway-side auth/posture; see the dedicated
  sections in [deployment.md](deployment.md).
- **Running without a gateway** — set `GATEWAY_OPTIONAL=true`; the
  gateway health check will report not-running, which is expected in standalone mode.

## See also
- [Connect a Local Agent](connect-local-agents.md) — MCP / direct connection / adapters (no gateway)
- [Agent Setup](agent-setup.md) — registration, config sync, SOUL/personality
- [Deployment](deployment.md) — Docker, env, gateway connectivity, hardening
