# 0003: Inherited Config And Secret Inventory

Date: 2026-06-15
Status: CONFIRMED
Related plan: `docs/plans/opzava-start-plan.md`
Related architecture: `docs/architecture/production-grade-complexity.md`

## Question

What inherited configuration, secret-handling paths, dependencies, and OpenClaw-first assumptions must be kept, replaced, isolated, or moved behind Opzava contracts before durable workflow code and live provider adapters are built?

## Local Experiment

Audited the imported source with targeted searches and file reads for:

```text
process.env
API_KEY
AUTH_PASS
TOKEN
PASSWORD
OPENAI
ANTHROPIC
OPENROUTER
GOOGLE_API_KEY
XAI_API_KEY
NOUS_API_KEY
OpenClaw
Hermes
mc-
MC_
mission-control
localhost
127.0.0.1
```

Primary files inspected:

- `package.json`
- `src/lib/config.ts`
- `src/lib/db.ts`
- `src/lib/auth.ts`
- `src/lib/google-auth.ts`
- `src/lib/gateway-runtime.ts`
- `src/lib/openclaw-gateway.ts`
- `src/lib/agent-runtimes.ts`
- `src/app/api/settings/route.ts`
- `src/app/api/tokens/rotate/route.ts`
- `src/app/api/gateways/route.ts`
- `src/app/api/security-scan/fix/route.ts`

## Dependency Map

Runtime stack confirmed from `package.json`:

- Next.js `^16.1.6`, React `^19.0.1`, TypeScript `^5.7.2`.
- SQLite via `better-sqlite3`.
- Validation via `zod`.
- Logging via `pino`.
- WebSocket support via `ws` and terminal PTY support via `node-pty`/`@xterm/*`.
- UI support via Radix Slot, Tailwind, class variance helpers, charts, markdown, and graph visualization.
- Test stack via Vitest, Testing Library, Playwright, and jsdom.

Operational dependency notes:

- `better-sqlite3` and `node-pty` are runtime-relevant native dependencies; production validation must not bypass their install scripts.
- `node-pty@1.1.0` has no Linux prebuild in this environment and falls back to `node-gyp rebuild`; local setup currently needs the user-space build toolchain recorded in `docs/discovery/0002-base-import-and-local-install.md`.
- The app uses pnpm `10.29.3`; do not use npm or yarn.

## Hard-Coded Setting Inventory

Inherited configuration currently mixes environment variables, in-code defaults, database settings, runtime discovery, and local fallback paths.

Confirmed env-first settings in `src/lib/config.ts`:

- Data and database paths: `MISSION_CONTROL_DATA_DIR`, `MISSION_CONTROL_DB_PATH`, `MISSION_CONTROL_TOKENS_PATH`, plus build-only variants.
- OpenClaw paths: `OPENCLAW_CONFIG_PATH`, `MISSION_CONTROL_OPENCLAW_CONFIG_PATH`, `OPENCLAW_HOME`, `CLAWDBOT_HOME`, `MISSION_CONTROL_OPENCLAW_HOME`, `OPENCLAW_STATE_DIR`, `CLAWDBOT_STATE_DIR`, `OPENCLAW_WORKSPACE_DIR`, `MISSION_CONTROL_WORKSPACE_DIR`, `OPENCLAW_MEMORY_DIR`, `OPENCLAW_SOUL_TEMPLATES_DIR`.
- Gateway defaults: `OPENCLAW_GATEWAY_HOST` defaulting to `127.0.0.1`, `OPENCLAW_GATEWAY_PORT` defaulting to `18789`.
- CLI binaries: `OPENCLAW_BIN`, `CLAWDBOT_BIN`, Windows npm shim discovery.
- Coordinator and GNAP: `MC_COORDINATOR_AGENT`, `GNAP_ENABLED`, `GNAP_REPO_PATH`, `GNAP_AUTO_SYNC`, `GNAP_REMOTE_URL`.
- Retention settings: `MC_RETAIN_ACTIVITIES_DAYS`, `MC_RETAIN_AUDIT_DAYS`, `MC_RETAIN_LOGS_DAYS`, `MC_RETAIN_NOTIFICATIONS_DAYS`, `MC_RETAIN_PIPELINE_RUNS_DAYS`, `MC_RETAIN_TOKEN_USAGE_DAYS`, `MC_RETAIN_GATEWAY_SESSIONS_DAYS`.

Confirmed DB-backed settings in `src/app/api/settings/route.ts`:

- Retention settings are exposed through `/api/settings` using defaults from `config.retention`.
- Gateway host/port are exposed as settings but still default from inherited config.
- General settings include `general.site_name`, cleanup/backup flags, backup retention, subscription overrides, interface mode, and onboarding state.
- Settings are string values with category metadata; they are not yet Opzava `AdminConfig` records with schema version, typed validation status, audit metadata, and redaction policy.

Confirmed hard-coded or source-level defaults requiring future Opzava decisions:

- Local gateway URLs in login/gateway flows default to `127.0.0.1`, `localhost`, and port `18789`.
- Google Identity script uses `https://accounts.google.com/gsi/client` directly in the login page.
- Google token verification calls `https://oauth2.googleapis.com/tokeninfo` directly in `src/lib/google-auth.ts`.
- Ollama status probing uses `http://127.0.0.1:11434/api/tags` in `src/app/api/status/route.ts`.
- Runtime installer AI review in `src/lib/agent-runtimes.ts` calls Anthropic directly and hard-codes model `claude-sonnet-4-20250514` when `ANTHROPIC_API_KEY` is present.

## Secret Handling Inventory

Confirmed safer inherited behavior:

- Session tokens are generated with `randomBytes(32)`, hashed before DB storage, and compared by hash.
- Passwords use the existing password hashing path; insecure bootstrap passwords are rejected for env seeding.
- `AUTH_PASS_B64` is validated before decoding; invalid base64 falls back to `AUTH_PASS`.
- API key display uses masking in `src/app/api/tokens/rotate/route.ts`.
- Gateway list responses redact gateway tokens before returning them.
- Security scan logic includes secret and credential handling tests in the inherited suite.

Confirmed gaps for Opzava contracts:

- Rotated API keys are stored as cleartext setting values under `security.api_key`; they are masked for display but are not represented as `SecretReference`.
- Gateway tokens are stored in the `gateways` table as cleartext `token` values and can be seeded from OpenClaw config or environment.
- `getDetectedGatewayToken()` reads cleartext `OPENCLAW_GATEWAY_TOKEN`, `GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD`, `GATEWAY_PASSWORD`, or OpenClaw config credentials.
- Runtime provider keys accepted by `/api/hermes` include `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `NOUS_API_KEY`, `GOOGLE_API_KEY`, and `XAI_API_KEY`, and are written into Hermes environment files rather than an Opzava secret store.
- `src/app/api/security-scan/fix/route.ts` can write `.env` and `.env.local` values for security remediation. This is inherited operational behavior, not an Opzava admin-config/secret-reference boundary.
- Live provider calls can be activated by ambient env (`ANTHROPIC_API_KEY`, Google client IDs) without an Opzava `AdminConfig` validation layer.

## OpenClaw-First Assumptions

Confirmed inherited assumptions that should be isolated before Opzava workflows depend on them:

- `src/lib/config.ts` treats OpenClaw state, workspace, memory, gateway host, gateway port, logs, and soul templates as first-class runtime paths.
- OpenClaw gateway host defaults to `127.0.0.1` and port defaults to `18789`.
- `src/app/api/gateways/route.ts` seeds a primary gateway from OpenClaw-oriented env/runtime discovery.
- `src/lib/openclaw-gateway.ts` uses OpenClaw RPC framing, scopes, gateway client ID defaults, and `mc-*` request IDs.
- UI and runtime setup flows still intentionally expose OpenClaw/Hermes/OpenCode/Claude/Codex runtime management.
- Scheduler/runtime code still scans OpenClaw config and sessions as inherited operational behavior.
- Static assets still use inherited `mc-logo-*` file names even where alt text and visible labels are Opzava-branded. The file names are not user-facing, but future asset replacement should rename or replace them.

## Opzava Implications

Do not build live provider adapters on top of these inherited settings directly.

Before Opzava durable workflow code or content providers use any external system:

- Define `AdminConfig` as a typed, versioned Opzava contract with validation status and audit metadata.
- Define `SecretReference` as the only way provider credentials, API keys, webhook secrets, gateway credentials, and WordPress credentials cross into provider code.
- Define a secret redaction boundary that proves logs, artifacts, audit events, external-call records, and API responses never serialize cleartext credentials.
- Move operator-tunable workflow limits, retry counts, timeouts, provider endpoints, model choices, and cost thresholds into admin-managed config rather than source constants or ambient env.
- Keep inherited OpenClaw/Hermes runtime management isolated as legacy provider/runtime compatibility until an Opzava provider registry explicitly wraps it.
- Treat `src/lib` config and secret handling as inherited infrastructure to replace or adapt, not as the domain model for Opzava workflows.

## Decision

The next implementation layer should define Opzava contracts before runner behavior:

- `src/opzava/core` primitives and state-machine helpers.
- `src/opzava/platform/admin-config` contracts for typed admin config and `SecretReference`.
- `src/opzava/platform/providers` contracts for mock/live provider boundaries.
- `src/opzava/modules/content/contracts` artifact schemas for the first content workflow.

Do not connect WordPress, live LLMs, search, outreach, or email sending until admin config validation, secret references, redaction tests, approval gates, and mock providers are in place.

## Follow-Ups

- Add Opzava `AdminConfig` and `SecretReference` contract tests before code uses live provider credentials.
- Add a redaction test suite that scans serialized artifacts, audit events, external-call records, and logs for known fake secret values.
- Create a provider registry contract with mock adapters first.
- Classify or hide OpenClaw-first UI panels that are not needed for the first content workflow.
- Replace inherited `mc-logo-*` asset file names when new Opzava image assets exist.
