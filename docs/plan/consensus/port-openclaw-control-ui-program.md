# Program: Port OpenClaw Control UI -> Opzava admin dashboard (authoritative-reference port)

Status: authoritative program spec (user directive 2026-07-04: "cloned OpenClaw into docs/openclaw/clone;
THAT is the admin dashboard; port ALL of it and improve its UI to match our current admin dashboard").
Reason: stop hand-inventing surfaces (which kept drifting on parity); use OpenClaw's OWN Control UI as the
source of truth for what each admin surface must show + do, re-implemented in Opzava's stack.

## The source of truth
- OpenClaw Control UI = `docs/openclaw/clone/ui/` (`openclaw-control-ui`, Lit 3.3.3 + Vite). Views in
  `ui/src/ui/views/`; gateway RPC layer in `ui/src/gateway-methods.ts`; model/auth in
  `ui/src/model-auth-helpers.ts`, `chat-model-*`; config editing in `views/config-form.*`.
- Providers/models are managed via the CONFIG form + `onboard` (there is NO bespoke "connections catalog"
  page in OpenClaw) -> Opzava's provider surface must mirror OpenClaw's real model/config/auth shape + the
  `docs/openclaw/providers` canonical provider list, NOT an invented catalog.

## Port rules (every view)
1. OpenClaw's Control UI view is the AUTHORITATIVE reference for fields, data, states, flows, and the exact
   gateway RPCs it calls (read `ui/src/gateway-methods.ts` for the real method names + shapes).
2. Re-implement in Opzava's stack: Next.js App Router + React + shadcn/ui (`components/ui/*`) + the single
   token source. NOT a Lit copy (framework mismatch) - a faithful re-implementation.
3. DATA GOES THROUGH THE ACL: the UI never talks to the gateway directly. Reads/writes flow through the
   gateway-broker (hot path) or provisioning-worker (admin/JIT) per ADR-003 two-token, exposing the same
   gateway RPCs the Control UI uses, over Opzava's internal endpoints. No OpenClaw types leak into the
   Opzava web layer.
4. TOTAL PARITY with `docs/openclaw` (providers/models/runtimes/scopes) - verified against the live gateway.
5. Restyle to Opzava's admin dashboard (shell/nav, tokens, spacing) - improve on OpenClaw's UX, don't
   regress it. Senior-frontend gates (a11y AA, one canonical component, honest states).
6. Verified the honest way: real login (no minting) + real gateway/worker/broker LOGS as ground-truth + the
   view's real RPCs firing. No "done" without that.

## View backlog (port order - highest-value / current-pain first)
| # | Opzava surface | OpenClaw reference (ui/src/ui/views + helpers) | ACL path |
|---|---|---|---|
| 1 | Models & Providers (fix Connections: correct providers per docs, z.AI/OpenRouter, runtimes UNDER parent, real models, real auth/onboard) | config-form.*, model-auth-helpers, chat-model-*, provider-quota-summary | worker (admin config + onboard exec) |
| 2 | Overview | overview.ts + overview-cards/attention/event-log/hints/log-tail | worker/broker reads |
| 3 | Agents (roster/status/tools/skills) | agents.ts + agents-panels-* | worker (agents config) |
| 4 | Sessions | sessions.ts | broker |
| 5 | Usage / metrics | usage-*.ts | worker |
| 6 | Logs | logs.ts + overview-log-tail | broker/worker |
| 7 | MCP servers | mcp.ts | worker |
| 8 | Cron / automation | cron.ts + cron-quick-create | worker |
| 9 | Nodes / devices | nodes.ts + nodes.devices | worker (pairing) |
| 10 | Skills / skill workshop | skills.ts + skill-workshop | worker |
| 11 | Channels (Slack/WhatsApp/Telegram/...) | channels.* | worker/provisioning (P8 scope) |
| 12 | Config (advanced) | config-form.*, config-presets, config-quick | worker (config.get/patch) |
| 13 | Debug / exec-approval / dreaming | debug.ts, exec-approval.ts, dreaming.ts | broker |

Each view = its own focused slice: read the OpenClaw reference view + gateway-methods, define the ACL
endpoints, re-implement in shadcn/React, verify via real login + logs, commit. Do NOT boil the ocean in one
pass. This program supersedes the hand-built connections catalog approach for surface #1.

## First slice (now): #1 Models & Providers, grounded in OpenClaw + docs/openclaw/providers
- Providers = canonical LLM list (providers/index.md); runtimes (claude-cli/codex/gemini-cli) fold UNDER
  parent (Anthropic/OpenAI/Google); plan variants fold under parent; include z.AI, OpenRouter, Moonshot,
  Qwen, DeepSeek, Groq, xAI, Google. Each shows human label + auth method(s) + REAL current models
  (models list) + real connection state (models status). Connect = real onboard-exec through the worker.
- Acceptance: real-login browser test + snapshot booleans (has-zai, has-openrouter, no standalone
  claude-cli/codex rows, no non-LLM) + worker/gateway logs proving the real RPCs.
