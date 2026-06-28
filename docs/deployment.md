# Deployment Guide

## Prerequisites

- **Node.js** >= 20 (LTS recommended)
- **pnpm** (installed via corepack: `corepack enable && corepack prepare pnpm@latest --activate`)

### Ubuntu / Debian

`better-sqlite3` requires native compilation tools:

```bash
sudo apt-get update
sudo apt-get install -y python3 make g++
```

### macOS

Xcode command line tools are required:

```bash
xcode-select --install
```

## Quick Start (Development)

```bash
cp .env.example .env
pnpm install
make up dev
```

Open http://opzava.localhost:3080 through Traefik. Login with `AUTH_USER` / `AUTH_PASS` from your `.env`.

## App Runtime Contract

ARD 0031 makes Docker the only supported app-runtime lane. Do not use host
`pnpm dev`, host `pnpm start`, host `next dev/start`, or bare
`node .next/standalone/server.js` to prove app behavior; those paths bypass the
Traefik/OpenClaw/Hermes parity stack and cannot predict Dokploy behavior. Host
`pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` remain valid
dev-tooling/build-check commands.

The deliberate host escape hatch is `MC_HOST_CLI_ENABLED=1 make up <dev|parity>`
or `docker-compose.host-cli.yml` when host CLI/session sharing is intentional
and auditable.

## Production (Docker)

Requires Docker Engine with Docker Compose v2. The mode-aware operator workflow
also requires GNU Make (`sudo apt-get install -y make` on Debian/Ubuntu).

Preferred operator flow (Make controls docker compose):

```bash
# 1) choose mode in .env
#    MC_MODE=parity   # or dev

# 2) run universal verbs
make up
make restart
make down
make status
```

### Mode-aware Make workflow (minimal commands)

For day-to-day operations, see the [Daily Ops Cheatsheet](./ops-cheatsheet.md).

Use `.env` + `.env.openclaw` as the single source of truth for mode/host/port/token values.

- `MC_MODE=parity` → `docker-compose.yml` + `docker-compose.parity.yml`
- `MC_MODE=dev` → `docker-compose.yml` + `docker-compose.dev.yml`
- `MC_HOST_CLI_ENABLED=1` → includes `docker-compose.host-cli.yml` so MC can use authenticated host CLIs

Command grammar:

```text
make <verb> [all|mc|openclaw] [dev|parity]
```

- `all` is default scope.
- `dev` / `parity` override `MC_MODE` for one command invocation.
- Why no `--dev` / `--prod`: GNU Make consumes unknown `--xxx` tokens as Make options before Makefile goals are parsed, so mode overrides use positional tokens for deterministic behavior.
- `make restart [scope]` is deterministic and always executes `make down [scope]` followed by `make up [scope]`.
- With default `all` scope, the app and OpenClaw gateway run from the same base Compose topology.

Primary operator commands:

| Workflow | Command |
|---|---|
| Start selected component(s) | `make up [all|mc|openclaw]` |
| Restart selected component(s) | `make restart [all|mc|openclaw]` |
| Stop selected component(s) | `make down [all|mc|openclaw]` |
| Mode + endpoint health summary | `make status [all|mc|openclaw]` |
| Refresh source/state only | `make update [all|mc|openclaw]` |
| Force rebuild selected component(s) | `make rebuild [all|mc|openclaw]` |
| Full maintenance (`update` + `rebuild` + `restart`) | `make upgrade [all|mc|openclaw]` |

Mode override examples:

```bash
make restart dev
make restart mc dev
make status openclaw
make upgrade parity
```

### `update` vs `upgrade`

- `make update [scope]`
  - Fast-forwards the current Opzava branch from origin.
  - For `scope=all`, also refreshes OpenClaw gateway image state.
  - For `scope=openclaw`, refreshes OpenClaw gateway image state only.
  - Does **not** force an MC image rebuild and does **not** force restart.

- `make upgrade [scope]`
  - Runs update + rebuild + restart for selected scope.
  - `scope=mc`: MC-only flow.
  - `scope=openclaw`: OpenClaw gateway update flow.
  - `scope=all`: both app and gateway flows.

Minimum `.env` / `.env.openclaw` keys for this flow:

```env
# .env
MC_MODE=parity
MC_URL_SCHEME=http
MC_HOST=127.0.0.1
OPENCLAW_GATEWAY_TOKEN=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_NUMERIC_USER_ID=123456789
TELEGRAM_DM_POLICY=pairing
TELEGRAM_ALLOW_FROM=
TELEGRAM_OWNER_ALLOW_FROM=
# .env.openclaw (or keep in .env)
OPENCLAW_GATEWAY_IMAGE=ghcr.io/openclaw/openclaw:latest
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_CONTROL_UI_PORT=18791
OPENCLAW_GATEWAY_INTERNAL_PORT=18789
OPENCLAW_STATUS_HOST=127.0.0.1
```

```bash
make up dev                # local development behind Traefik
make up parity             # Dokploy-parity shape behind Traefik
```

### Local Dokploy-Parity Stack

Use this path before deploying to Dokploy when you need local Docker to behave
like the Dokploy Compose runtime rather than like a direct `localhost:3000`
developer container.

Dokploy-specific assumptions this stack models:

- Dokploy Compose environment variables are written to a `.env` file, but they
  only reach the container when the Compose file uses `env_file` or explicit
  `${VAR}` references.
- Dokploy domains route through Traefik labels/networking at deployment time.
- A routed Compose service should expose its container port to the Docker
  network; Traefik owns the host-published HTTP/HTTPS port.

Source docs: [Dokploy Docker Compose](https://docs.dokploy.com/docs/core/docker-compose),
[Dokploy Compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains),
and [Dokploy troubleshooting](https://docs.dokploy.com/docs/core/troubleshooting).

Local parity command:

```bash
pnpm test:docker:dokploy
```

This runs `docker-compose.dokploy.yml`: a production Opzava image behind a
local Traefik service on `http://opzava.localhost:3080`, with no direct
host-published app port. The local Traefik default is pinned to
`traefik:v3.7.5`; older `v3.1` images can fail against Docker 29+ daemons by
serving 404s while logging Docker API `1.24` negotiation errors. The local
Traefik entrypoint also trusts forwarded headers so the smoke test can simulate
Dokploy's HTTPS-terminated request path on a plain local HTTP port. The smoke
test verifies:

- Traefik-routed `/api/status?action=health` is healthy
- `mission-control` has no direct host port for `3000`
- runtime user is uid `1000`, `HOME=/home/nextjs`
- `/app` is read-only while `/app/.data` is writable
- `X-Forwarded-Proto: https` causes a secure `__Host-mc-session` cookie
- `/api/events` streams the SSE contract through Traefik
- `/ws/pty` upgrades through Traefik and reaches the app wrapper

PTY terminal attach uses local `tmux`/`node-pty` state. The Dokploy-parity
Traefik service enables sticky cookies so `/api/pty/attach` and `/ws/pty` stay
on the same app replica. The app service intentionally omits a fixed
`container_name`, so local `docker compose --scale mission-control=N` checks are
not blocked by Compose. For multi-host or non-sticky scaling, deploy an external
PTY broker instead of relying on container-local tmux.

Run deeper E2E through the same stack:

```bash
DOKPLOY_PARITY_RUN_E2E=1 pnpm test:docker:dokploy
```

The deep path uses `playwright.dokploy.config.ts`, which intentionally does
not start a Node web server; it targets the already-running Docker stack.

The OpenClaw gateway is part of the base topology. Browser gateway discovery is
runtime-injected, so operators set the browser-reachable host with
`PUBLIC_GATEWAY_HOST` / `PUBLIC_GATEWAY_PORT` rather than rebuilding an image
with `NEXT_PUBLIC_GATEWAY_*` values:

```bash
PUBLIC_GATEWAY_HOST=opzava-gateway.localhost \
PUBLIC_GATEWAY_PORT=3080 \
make up parity
```

For Dokploy itself, configure domains in the Dokploy UI where possible and use
the Preview Compose output to confirm the service, internal port, labels, and
network match the local parity shape.

The Docker image:
- Builds from `node:22-slim` with multi-stage build
- Compiles `better-sqlite3` natively inside the container (Linux x64)
- Uses Next.js standalone output for minimal image size
- Runs as the non-root Node base-image user (uid/gid 1000) with `HOME=/home/nextjs`
- Exposes port 3000 (override with `-e PORT=8080`)

### Gateway Connectivity from Docker

OpenClaw runs only as the Docker sidecar for Opzava. Do not install or start a
host `openclaw` binary for app-runtime work. Start the Docker app-runtime lane
with:

```bash
make up dev
# or:
make up parity
```

There are **two** connections:

1. **Server-side** (Opzava backend → gateway): Set `OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway`.
   The base Compose topology puts Opzava and the sidecar on the same Docker network.
2. **Browser-side** (user's browser → gateway WebSocket): For remote access, set
   runtime `PUBLIC_GATEWAY_HOST` to the public hostname that routes to the gateway
   and `PUBLIC_GATEWAY_PORT` to the browser-reachable port. Local parity uses
   `opzava-gateway.localhost:3080`; leaving `PUBLIC_GATEWAY_HOST` empty locally
   lets the app auto-detect and still honors the browser localStorage override.

### Local Security Scan Expectations (HTTP dev vs HTTPS prod)

For local Docker development over plain `http://`, the following defaults are expected:

- Keep `MC_COOKIE_SECURE` unset
- Keep `MC_ENABLE_HSTS` unset
- Use `OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway` in the Docker app-runtime lane

`MC_COOKIE_SECURE=1` and `MC_ENABLE_HSTS=1` are HTTPS-only hardening flags. Enabling them on plain HTTP can break login/session behavior and create misleading local warnings.

### Persistent Data

SQLite database is stored in `/app/.data/` inside the container. Mount a volume to persist data across restarts:

```bash
docker run -v /path/to/data:/app/.data ...
```

### Automatic backups + restore

- **Backups are ON by default** (scheduler task `auto_backup`, ~3 AM UTC daily, WAL-safe
  SQLite Online Backup API, retained to 10 files under `<data-dir>/backups/`). Toggle via
  the scheduler UI or the `general.auto_backup` setting. (`MC_AUTO_BACKUP=1` in `.env` is
  still honored for compatibility but is no longer required.)
- The backup directory is created automatically when the task first runs, so the
  no-backup warning clears once it executes.

**Restore (cold procedure — the writer MUST be stopped):**

1. Stop Opzava (the single writer): `make down parity` or the matching Makefile mode.
2. In the data dir (`MISSION_CONTROL_DATA_DIR`, default `.data/`), locate the backup to
   restore — `backups/mc-backup-<timestamp>.db` — and **verify the timestamp** is the
   point you want to return to.
3. Replace the live DB and **discard the WAL/SHM sidecars** (they belong to the old DB):
   ```bash
   cd "$MISSION_CONTROL_DATA_DIR"
   mv mission-control.db mission-control.db.pre-restore   # keep the pre-restore copy
   rm -f mission-control.db-wal mission-control.db-shm     # stale; never reuse across DBs
   cp backups/mc-backup-<timestamp>.db mission-control.db
   ```
4. Restart (`make up parity` or the matching Makefile mode). On boot Opzava opens the DB and any pending
   migrations apply to the restored file.
5. Confirm row counts / the dashboard match the expected point in time. `PRAGMA
   integrity_check` can be run against the file before step 3 to validate the backup.

> Restore loses everything written since the backup. Always prefer the newest viable
> backup and verify its timestamp before overwriting the live DB.

### Self-contained Operator Setup (Linux host with existing Claude Code / Codex CLIs)

For an operator running MC on a Linux/Docker host who already has authenticated
`claude` / `codex` / `opencode` CLIs in `~/.local/bin`, the opt-in
`docker-compose.host-cli.yml` overlay projects the host configuration into the
container so MC can drive those same authenticated CLIs without re-login. This
path is a deliberate Docker override for host CLI/session sharing:

```bash
MC_HOST_CLI_ENABLED=1 make up mc parity
```

What the host CLI overlay does for this case:

- **Image bakes `claude` and `codex` as a fallback** — if the host doesn't
  have them in `~/.local/bin`, the container's installed copies are used.
  The host's `~/.local/bin` comes first in `PATH`, so an authenticated host
  install transparently shadows the baked one.
- **Host home is bind-mounted** — `${HOME}/.local/bin`, `${HOME}/.bun`,
  `${HOME}/.claude`, `${HOME}/.claude.json`, and `${HOME}/.local/share/claude`
  are mounted under `/home/nextjs/...` inside the container, plus `${HOME}`
  itself and `/mnt` are mounted at the same absolute paths so file paths the
  user sees on the host work identically inside the container.
- **Container runs as uid 1000** (the slim image's existing `node` user, with
  `HOME=/home/nextjs`) so bind-mounted host files (typical Linux uid 1000) are
  read/written without `chown`.

**Ports.** `docker-compose.yml` maps `${MC_PORT}` on the host to `${PORT}` in
the container. The bundled `Makefile` computes its readiness/status URL from
`MC_URL_SCHEME`, `MC_HOST`, and `MC_PORT` loaded from `.env`.

**uid mismatch.** If your host user has uid ≠ 1000 (common on macOS, or
multi-user Linux), add a user override to your local compose overlay:

```yaml
user: "$(id -u):$(id -g)"   # or hard-code your uid:gid
```

Otherwise bind-mounted files in `${HOME}` will be read-only inside the
container and Claude Code will fail to write its config.

**Memory.** The compose file sets `memory: 2G` deploy limit. The upstream
default of 512M OOM-kills MC when `/chat` opens a `node-pty` terminal and the
task-dispatch loop is running concurrently. Do not lower this limit unless
you are sure neither feature is in use.

#### Direct API dispatch (gateway-free)

When OpenClaw is not present, MC dispatches tasks via direct provider APIs.
Provider is picked by the agent's `dispatchModel` prefix:

| `dispatchModel` pattern                                          | Provider           | Auth |
|------------------------------------------------------------------|--------------------|------|
| `claude-*`, `anthropic/*`                                        | Anthropic API      | `ANTHROPIC_API_KEY` |
| `gpt-*`, `o1-*`, `o3-*`, `openai/*`                              | OpenAI API         | `OPENAI_API_KEY` |
| `local/*`, `ollama/*`, `lmstudio/*`, `litellm/*`                 | OpenAI-compatible  | `LOCAL_LLM_ENDPOINT` (+ optional `LOCAL_LLM_API_KEY`) |

The "local" provider speaks the OpenAI `/v1/chat/completions` REST shape, so
LMStudio, Ollama, vLLM, and a [liteLLM](https://github.com/BerriAI/litellm)
proxy all work behind it. For multiple local backends behind one endpoint,
run liteLLM as a sidecar container and point `LOCAL_LLM_ENDPOINT` at it.

#### Shared host Claude Code session (`MC_HOST_SESSION_MODE`)

`/chat` can drive a Claude Code session that the operator has open in a host
terminal — both processes share the same `~/.claude/projects/<encoded>/<id>.jsonl`
transcript. Pick the policy via env:

| Mode | Behaviour |
|------|-----------|
| `coexist` (default) | Both MC and the host CLI append to the jsonl. Each side picks up the other's writes on its next prompt. Possible interleaving on simultaneous writes — fine for a single operator switching between the two surfaces. |
| `block-active` | Returns `409` from `/api/sessions/continue` if the jsonl was touched in the last 60s (heuristic: a live host CLI updates mtime frequently). Forces MC to act only on idle sessions. |
| `nudge` | Same as `coexist` plus a best-effort `utimes()` on the jsonl after the reply, so a tail-watching host CLI sees a fresh mtime. |

### Production Hardening

```bash
docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d
```

This adds: JSON logging, strict hostname allowlist, secure cookies, HSTS, internal-only network.

### Host hardening (Ubuntu quick actions)

- **Firewall (ufw)**: `sudo apt-get install -y ufw && sudo ufw allow OpenSSH && sudo ufw enable && sudo ufw status`
- **Time sync (NTP)**: `timedatectl set-ntp true && timedatectl status` (ensures systemd-timesyncd is active)
- **Automatic security updates**: `sudo apt-get install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades && sudo unattended-upgrade -d`
- **Brute-force protection (fail2ban)**: `sudo apt-get install -y fail2ban && sudo systemctl enable --now fail2ban` (tune `/etc/fail2ban/jail.local` as needed)
- **/tmp noexec**: add `tmpfs /tmp tmpfs defaults,noexec,nosuid,nodev 0 0` to `/etc/fstab`, then `sudo mount -o remount /tmp`
- **Encrypted data (LUKS)**: create/attach a LUKS volume for data (`sudo cryptsetup luksFormat /dev/sdX && sudo cryptsetup open /dev/sdX mc-data && sudo mkfs.ext4 /dev/mapper/mc-data`) and mount it for `.data/` or backups
- **MAC framework**: keep AppArmor enabled (`sudo systemctl enable --now apparmor && sudo aa-status`); 
  Ubuntu SELinux users can install `selinux-basics selinux-policy-default` and enable per Ubuntu guidance
  - sudo apt update
  - sudo apt install selinux-basics selinux-policy-default
  - sudo selinux-activate
  - sudo reboot
  - sudo apt install policycoreutils; sestatus # check status

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_USER` | Yes | `admin` | Admin username (seeded on first run) |
| `AUTH_PASS` | Yes | - | Admin password |
| `AUTH_PASS_B64` | No | - | Base64-encoded admin password (overrides `AUTH_PASS` if set) |
| `API_KEY` | Yes | - | API key for headless access |
| `PORT` | No | `3000` (Docker) | Container server port exposed to Traefik. |
| `MC_MODE` | No | `parity` | Makefile Docker mode: `parity` uses base + parity override; `dev` uses base + dev override. |
| `MC_HOST_CLI_ENABLED` | No | `0` | When truthy, Makefile includes `docker-compose.host-cli.yml` for host CLI/session sharing. |
| `INSTALL_AGENT_CLIS` | No | `1` | Bake Claude Code and Codex CLI fallback binaries into the Docker runtime image. |
| `OPENCLAW_HOME` | No | - | Legacy read path only. Do not use for new Docker sidecar deployments. |
| `OPENCLAW_STATE_DIR` | No | `/home/nextjs/.openclaw` in Docker | Exact path to the sidecar-mounted OpenClaw state directory. |
| `OPENCLAW_CONFIG_PATH` | No | `/home/nextjs/.openclaw/openclaw.json` in Docker | Exact path to the sidecar-mounted OpenClaw config. |
| `OPENCLAW_GATEWAY_HOST` | No | `mc-openclaw-gateway` in Docker | Host Opzava's backend dials for the sidecar gateway. |
| `OPENCLAW_GATEWAY_PORT` | No | `18789` | Port Opzava's backend dials for the sidecar gateway. |
| `OPENCLAW_GATEWAY_TOKEN` | No | - | Optional gateway auth token; never commit a real token. |
| `OPENCLAW_GATEWAY_IMAGE` | No | `ghcr.io/openclaw/openclaw:latest` | Image used by the base `mc-openclaw-gateway` service. |
| `OPENCLAW_TOOLS_PROFILE` | No | `coding` | Tool profile projected into OpenClaw config when the env var is present (compose injects the default) |
| `OPENCLAW_SECURITY_WORKSPACE_ONLY` | No | `1` | Restrict filesystem tools to the workspace when set (env-driven) |
| `OPENCLAW_SECURITY_DENY_AUTOMATION` | No | `1` | Deny automation tool group via env-driven bootstrap |
| `OPENCLAW_SECURITY_DENY_RUNTIME` | No | `1` | Deny runtime tool group via env-driven bootstrap |
| `OPENCLAW_SECURITY_DENY_FS` | No | `0` | Deny filesystem tool group (opt-in; can block file workflows) |
| `OPENCLAW_SECURITY_SANDBOX_ALL` | No | `0` | Optional sandbox-all mode. Disabled by default because the sidecar does not mount the host Docker socket. |
| `MISSION_CONTROL_DATA_DIR` | No | `.data/` | Directory for all Opzava data files (DB, tokens, etc.). Use an absolute path for persistent Docker deploys. |
| `MC_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Allowed hosts in production |
| `MC_PORT` | No | `3000` | Legacy direct-host port for inherited tooling. Docker app-runtime traffic uses `DOKPLOY_HTTP_PORT` through Traefik. |
| `DOKPLOY_HTTP_PORT` | No | `3080` | Local Traefik host port for dev/parity app-runtime. |
| `PUBLIC_GATEWAY_HOST` | No | - | Runtime container env for the browser-reachable gateway hostname; empty locally means auto-detect plus localStorage override. |
| `PUBLIC_GATEWAY_PORT` | No | `18789` | Browser-reachable gateway port; local Traefik parity uses `3080`. |
| `GATEWAY_OPTIONAL` | No | `false` | Explicit gateway-free standalone/dashboard mode. |
| `ANTHROPIC_API_KEY` | No (Yes for direct dispatch) | - | Used when `dispatchModel` matches `claude-*` / `anthropic/*` and no gateway is available. |
| `OPENAI_API_KEY` | No | - | Used when `dispatchModel` matches `gpt-*` / `o1-*` / `o3-*` / `openai/*`. |
| `LOCAL_LLM_ENDPOINT` | No | `http://host.docker.internal:1234/v1` | OpenAI-compatible base URL (LMStudio default shown). Override for Ollama (`:11434/v1`) or a liteLLM proxy. |
| `LOCAL_LLM_API_KEY` | No | - | Bearer token sent to `LOCAL_LLM_ENDPOINT`. Only needed for proxies that require auth (e.g. liteLLM with master key). |
| `MC_HOST_SESSION_MODE` | No | `coexist` | Policy when MC `--resumes` a host Claude Code session that may have a live CLI attached. One of `coexist`, `block-active`, `nudge`. |
| `NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS` | No | `1500` (code) / `1000` (docker-compose) | `/chat` transcript poll cadence (ms) when the SSE channel drops. **Baked at build time**, so changing it requires `make rebuild`. |

> **Sandbox runtime note**
>
> The bundled OpenClaw sidecar does not mount `/var/run/docker.sock`. Keep
> `OPENCLAW_SECURITY_SANDBOX_ALL=0` unless you intentionally provide a hardened sandbox runtime.

> **Note — `OPENCLAW_HOME` vs `OPENCLAW_STATE_DIR`**
>
> Opzava still reads two env vars for compatibility:
>
> - `OPENCLAW_HOME` — legacy parent-home path. Avoid it for new deployments.
> - `OPENCLAW_STATE_DIR` — exact state directory path. Use this for the Docker sidecar.
>
> **Recommended `.env` for a standard install:**
> ```env
> OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway
> OPENCLAW_GATEWAY_PORT=18789
> OPENCLAW_STATE_DIR=/home/nextjs/.openclaw
> OPENCLAW_CONFIG_PATH=/home/nextjs/.openclaw/openclaw.json
> MISSION_CONTROL_DATA_DIR=/absolute/path/to/.data
> ```
> Using an absolute path for `MISSION_CONTROL_DATA_DIR` ensures your
> database and data survive Docker rebuilds.

## Kubernetes Sidecar Deployment

When running Opzava alongside a gateway as containers in the same pod (sidecar pattern), agents are not discovered via the filesystem. Instead, use the gateway's agent registration API.

### Architecture

```
┌──────────────── Pod ────────────────┐
│  ┌─────────┐     ┌───────────────┐  │
│  │   MC    │◄───►│   Gateway     │  │
│  │ :3000   │     │   :18789      │  │
│  └─────────┘     └───────────────┘  │
│       ▲                  ▲          │
│       │ localhost        │          │
│       └──────────────────┘          │
└─────────────────────────────────────┘
```

### Required Configuration

**Environment variables** for the MC container:

```bash
AUTH_USER=admin
AUTH_PASS=<secure-password>
API_KEY=<your-api-key>
OPENCLAW_GATEWAY_HOST=127.0.0.1
PUBLIC_GATEWAY_HOST=<browser-reachable-gateway-host>
PUBLIC_GATEWAY_PORT=18789
```

### Agent Registration

The gateway must register its agents with MC on startup. Include the `agents` array in the gateway registration request:

```bash
curl -X POST http://localhost:3000/api/gateways \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sidecar-gateway",
    "host": "127.0.0.1",
    "port": 18789,
    "is_primary": true,
    "agents": [
      { "name": "developer-1", "role": "developer" },
      { "name": "researcher-1", "role": "researcher" }
    ]
  }'
```

To update the agent list on reconnect, use `PUT /api/gateways` with the same `agents` field.

Alternatively, each agent can register itself via the direct connection endpoint:

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "openclaw-gateway",
    "agent_name": "developer-1",
    "agent_role": "developer"
  }'
```

### Health Checks

Agents must send heartbeats to stay visible:

```bash
curl http://localhost:3000/api/agents/<agent-id>/heartbeat \
  -H "Authorization: Bearer <API_KEY>"
```

Without heartbeats, agents will be marked offline after 10 minutes (configurable via `general.agent_timeout_minutes` setting).

## Troubleshooting

### "Internal server error" on login / NODE_MODULE_VERSION mismatch

`better-sqlite3` is a native addon compiled for a specific Node.js version.
If you switch Node versions (e.g. via nvm), the compiled binary won't load.

```bash
pnpm rebuild better-sqlite3
```

The health endpoint (`/api/status?action=health`) will report this error explicitly.

### "Module not found: better-sqlite3"

Native compilation failed. On Ubuntu/Debian:
```bash
sudo apt-get install -y python3 make g++
rm -rf node_modules
pnpm install
```

### Docker: gateway unreachable / WebSocket not connecting

**Checklist:**

1. Verify the sidecar is running:
   ```bash
   make status openclaw parity
   ```

2. Verify the gateway is reachable from inside the Opzava container:
   ```bash
   docker exec mission-control curl -s http://mc-openclaw-gateway:18789/health
   ```

3. Check env vars are set:
   ```bash
   docker exec mission-control env | grep -i gateway
   ```
   You should see `OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway`.

4. **Browser WebSocket**: set runtime `PUBLIC_GATEWAY_HOST` to a hostname your browser can reach.

### AUTH_PASS with "#" is not working

In dotenv files, `#` starts a comment unless the value is quoted.

Use one of these:
- `AUTH_PASS="my#password"`
- `AUTH_PASS_B64=$(echo -n 'my#password' | base64)`

### "pnpm-lock.yaml not found" during Docker build

If your deployment context omits `pnpm-lock.yaml`, Docker build now falls back to
`pnpm install --no-frozen-lockfile`.

For reproducible builds, include `pnpm-lock.yaml` in the build context.

### "Invalid ELF header" or "Mach-O" errors

The native binary was compiled on a different platform. Rebuild:
```bash
rm -rf node_modules .next
pnpm install
pnpm build
```

### Database locked errors

Ensure only one instance is running against the same `.data/` directory. SQLite uses WAL mode but does not support multiple writers.

### "Gateway error: origin not allowed"

Your gateway is rejecting the Opzava browser origin. Add the Control UI origin
to your gateway config allowlist, for example:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["http://YOUR_HOST:3000"]
    }
  }
}
```

Then restart the gateway and reconnect from Opzava.

### "Gateway error: device identity required"

Device identity signing uses WebCrypto and requires a secure browser context.
Open Opzava over HTTPS (or localhost), then reconnect.

### "Gateway shows offline on VPS deployment"

Browser WebSocket connections to non-standard ports (like 18789/18790) are often blocked by VPS firewall/provider rules.

Quick option:

```bash
GATEWAY_OPTIONAL=true
```

This runs Opzava in standalone mode (core features available, live gateway streams unavailable).

Production option: reverse-proxy gateway WebSocket over 443.

nginx example:

```nginx
location /gateway-ws {
  proxy_pass http://127.0.0.1:18789;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Then point UI to:

```bash
PUBLIC_GATEWAY_URL=wss://your-domain.com/gateway-ws
```

Opzava now retries common reverse-proxy websocket paths (`/gateway-ws`, `/gw`) automatically when root-path handshake fails, but setting runtime `PUBLIC_GATEWAY_URL` is still recommended for deterministic production behavior.

## Next Steps

Once deployed, set up your agents and orchestration:

- **[Quickstart](quickstart.md)** — Register your first agent and complete a task in 5 minutes
- **[Agent Setup](agent-setup.md)** — SOUL personalities, heartbeats, config sync, agent sources
- **[Orchestration Patterns](orchestration.md)** — Auto-dispatch, quality review, multi-agent workflows
- **[CLI Reference](cli-agent-control.md)** — Full CLI command list for headless/scripted usage
