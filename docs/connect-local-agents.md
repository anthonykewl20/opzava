# Connect a Local Agent to Opzava

How to wire a local agent client — **Claude Code**, **OpenAI Codex CLI**, **OpenCode**, or any
HTTP-capable framework — into a running Opzava instance.

There are **four** connection paths. They are not interchangeable; pick by *what you want the agent
to do*. Most people want one of the first two.

| If you want the agent to… | Use | Section |
|---|---|---|
| **Operate Opzava** — read/queue tasks, write memory, manage agents, watch events — from inside the agent | **MCP server** | [1](#1-mcp-server-recommended-for-claude-code) |
| **Appear in Opzava as a live agent** that receives assigned work and reports heartbeats/tokens | **Direct CLI connection** (`/api/connect`) | [2](#2-direct-cli-connection) |
| Connect a **framework runtime** (LangGraph, CrewAI, AutoGen, Claude Agent SDK) | **Framework adapter** (`/api/adapters`) | [3](#3-framework-adapters) |
| Manage a fleet through an **OpenClaw gateway** | **Gateway** | [4](#4-openclaw-gateway) |

> The MCP and direct-connection paths are independent — a single Claude Code agent can use **both**:
> MCP to give it Opzava tools, and a direct connection so it shows up as a live, work-receiving agent.

## Prerequisites

1. A running Opzava instance (default `http://127.0.0.1:3000`).
2. **Your API key** — auto-generated on first run, shown in **Settings → API Key**.

Export both for the snippets below:

```bash
export MC_URL=http://127.0.0.1:3000
export MC_API_KEY=your-api-key
```

REST calls authenticate with either `Authorization: Bearer $MC_API_KEY` or `x-api-key: $MC_API_KEY`.
Role floor per route is noted in each section (viewer < operator < admin).

---

## LLM install prompt (copy-paste)

The fastest path: paste the block below into your agent (Claude Code, Codex, OpenCode, or any
tool-using LLM), fill in the three `<…>` placeholders, and let it wire itself in. It uses only the
APIs documented in the rest of this page.

```text
You are connecting yourself to Opzava, a self-hosted AI operations control plane.

Connection details (I have filled these in):
- Opzava URL:  <MC_URL>          (e.g. http://127.0.0.1:3000)
- API key:     <MC_API_KEY>      (Opzava → Settings → API Key)
- Opzava repo: <OPZAVA_PATH>     (absolute path to the opzava checkout; only needed for MCP)

Do these steps in order and report the result of each:

1. MCP tools (skip if you can't register MCP servers):
   Register Opzava's MCP server so you gain its tools, ensuring MC_URL and MC_API_KEY are set in
   the environment the server runs in.
   - Claude Code:  claude mcp add opzava -- node <OPZAVA_PATH>/scripts/mc-mcp-server.cjs
   - Codex / other MCP clients: add that same command + args under your mcp_servers config,
     with env MC_URL=<MC_URL> and MC_API_KEY=<MC_API_KEY>.
   Then call the `mc_health` tool, then `mc_dashboard`, and report what they return.
   If a tool call fails it's almost always MC_URL/MC_API_KEY not visible to the MCP subprocess,
   or Opzava not running.

2. Register yourself as a live agent (so Opzava can assign you work):
   POST <MC_URL>/api/connect
     header: Authorization: Bearer <MC_API_KEY>
     body:   {"tool_name":"<claude-code|codex|opencode>","agent_name":"<pick-a-name>","agent_role":"developer"}
   Save the returned connection_id and agent_id.

3. Heartbeat every ~30 seconds while you work (this also delivers your assigned tasks/mentions):
   POST <MC_URL>/api/agents/<agent_id>/heartbeat
     header: Authorization: Bearer <MC_API_KEY>
     body:   {"connection_id":"<connection_id>"}

4. Confirm: GET <MC_URL>/api/status?action=health and check that "Direct Connections" is healthy.

Surface any errors verbatim and tell me which steps succeeded.
```

Prefer to do it by hand, or want the detail behind each step? Read on.

---

## 1. MCP server (recommended for Claude Code)

The MCP server (`scripts/mc-mcp-server.cjs`) exposes Opzava's REST API as MCP tools (agents, tasks,
sessions, memory, soul, comments, tokens, skills, cron, status) over stdio. It is the best path when
you want the agent itself to *drive* Opzava.

### Claude Code

```bash
claude mcp add opzava -- node /absolute/path/to/opzava/scripts/mc-mcp-server.cjs
```

Then make sure the server process sees your config — set them in the environment Claude Code launches
the MCP server in:

```bash
MC_URL=http://127.0.0.1:3000
MC_API_KEY=your-api-key
```

`opzava` here is just the local alias you give the server; the server identifies itself as `opzava`.
Verify with `claude mcp list` (it should show `opzava` connected).

### Codex / OpenCode via MCP

If your client supports MCP servers (Codex via its `mcp_servers` config, or any MCP-capable client),
register the same command (`node /abs/path/scripts/mc-mcp-server.cjs`) with `MC_URL` + `MC_API_KEY` in
its environment. The server is client-agnostic — it speaks plain MCP over stdio. If your client does
**not** support MCP, use the direct connection in §2.

> **MCP server health.** The MCP server is a **stdio subprocess your client spawns**, not a network
> service Opzava hosts — so it has no server-side health endpoint and won't appear in
> `/api/status?action=health`. Verify it the MCP way: `claude mcp list` (or your client's MCP status
> view) shows it connected after a successful `initialize` handshake. If a tool call fails, it's
> almost always `MC_URL`/`MC_API_KEY` not being visible to the subprocess, or Opzava not running.

---

## 2. Direct CLI connection

Use this to make any CLI tool show up in Opzava as a **live agent** that receives work and reports
heartbeats — no gateway required. This is the documented path for **Claude Code, Codex, and custom
agents**, and the fallback for **OpenCode**.

### Register (operator)

```bash
curl -X POST "$MC_URL/api/connect" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -d '{
    "tool_name": "claude-code",
    "tool_version": "1.0.0",
    "agent_name": "my-agent",
    "agent_role": "developer"
  }'
```

`tool_name` is free-form — use `claude-code`, `codex`, or `opencode`. If `agent_name` doesn't exist
it's auto-created; a prior connection for the same agent is deactivated. The response includes
`connection_id`, `agent_id`, and the `heartbeat_url` / `sse_url` / `token_report_url`.

### Heartbeat loop (operator) — every ~30s

```bash
curl -X POST "$MC_URL/api/agents/<agent_id>/heartbeat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -d '{
    "connection_id": "<connection_id>",
    "token_usage": { "model": "claude-sonnet-4", "inputTokens": 1500, "outputTokens": 800 }
  }'
```

The response carries pending work items (assigned tasks, @mentions, notifications) so the client can
act on them. **Keep heart-beating** — a connection with no heartbeat in 120s is flagged *stale* by
the health check (§5).

### Subscribe to events (viewer) / report tokens (operator) / disconnect (operator)

```bash
curl -N "$MC_URL/api/events"   -H "Authorization: Bearer $MC_API_KEY"           # SSE stream
curl -X POST "$MC_URL/api/tokens" -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4","sessionId":"my-agent:cli","inputTokens":5000,"outputTokens":2000}'
curl -X DELETE "$MC_URL/api/connect" -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" -d '{"connection_id":"<connection_id>"}'
```

Per-tool notes:
- **Claude Code** — `tool_name: "claude-code"`. Pair with the MCP server (§1) so the same agent can
  also operate Opzava.
- **Codex** — `tool_name: "codex"`. Opzava recognizes the `codex-cli` session kind.
- **OpenCode** — `tool_name: "opencode"`. OpenCode has no first-class integration; the direct
  connection (or the `generic` adapter, §3) is the supported route.

See [docs/cli-integration.md](cli-integration.md) for the full lifecycle reference.

---

## 3. Framework adapters

For agents built on a **framework runtime**, post to a single dispatcher with `{ framework, action,
payload }`. Supported `framework` values: `openclaw`, `generic`, `langgraph`, `crewai`, `autogen`,
`claude-sdk`. Use **`generic`** for anything HTTP-capable that isn't listed (this is the OpenCode
fallback if you prefer adapters over §2).

```bash
curl -X POST "$MC_URL/api/adapters" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -d '{"framework":"generic","action":"register","payload":{"name":"my-agent","role":"developer"}}'
```

`action` is one of `register`, `heartbeat`, `report`, `assignments`, `disconnect`. (A lighter
self-registration also exists at `POST /api/agents/register` — viewer role, rate-limited — but it does
not give you the adapter's heartbeat/assignment plumbing.)

---

## 4. OpenClaw gateway

When agents are managed by an **OpenClaw gateway**, Opzava connects to the gateway over WebSocket and
spawns/controls sessions through it (`POST /api/spawn`). Config syncs via `openclaw.json`. This is the
multi-host fleet path; for a single local CLI, prefer §1 or §2. Gateway connectivity *is* health-checked
(§5). See [docs/agent-setup.md](agent-setup.md) and [docs/deployment.md](deployment.md).

---

## 5. Verify the connection

| What | How |
|---|---|
| **App + all connectivity** | `GET /api/status?action=health` — checks DB, gateway, disk/memory, **direct-connection staleness**, and **provider readiness** (Resend/WordPress: configured + secret resolvable). Public, no auth. |
| **A live agent connection** | `GET /api/connect` (viewer) lists direct connections with status + last heartbeat. |
| **Outbound provider (live)** | `POST /api/connections/test` (admin) `{"provider":"resend"|"wordpress"}` — makes a real reachability/credential call. (The health check above only checks *readiness*, never a live call, since it's polled anonymously.) |
| **Gateway** | `POST /api/gateways/health` (viewer) probes each configured gateway. |
| **MCP server** | `claude mcp list` / your client's MCP status — see the note in §1 (no server-side endpoint). |

```bash
curl -s "$MC_URL/api/status?action=health" | jq '.status, .checks[] | {name, status}'
```

A `Direct Connections: warning` means an agent registered but stopped heart-beating; a
`Provider Connectivity: warning` means a provider is configured in settings but its env secret
(`RESEND_API_KEY` / `WORDPRESS_APP_PASSWORD`) is missing.

---

## Which path, in one line

- **Claude Code** → MCP (§1), optionally + direct connection (§2).
- **Codex** → MCP if your client supports it (§1), else direct connection with `tool_name: "codex"` (§2).
- **OpenCode** → direct connection with `tool_name: "opencode"` (§2), or the `generic` adapter (§3).
