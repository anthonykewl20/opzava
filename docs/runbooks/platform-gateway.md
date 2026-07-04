# Runbook — Opzava platform OpenClaw Gateway

Operating the per-tenant platform Gateway (internal single-tenant phase). Every step below was
proven live on OpenClaw `2026.6.11` (2026-07-03). Design record: `docs/plan/grilling-decisions.md`
Q16; live protocol facts: `docs/plan/research/slice2-ask-admin-opzava.md` (live-findings sections).

## Bring-up (local)

```bash
docker compose up -d openclaw-platform-gateway
```

- Image pinned via `OPENCLAW_IMAGE_TAG` (currently `2026.6.11`); local host port 18799
  (`docker-compose.override.yml`; 18789 is the developer's personal OpenClaw).
- The platform Gateway now runs by default with `gateway-broker` for the internal
  single-tenant phase. It is still expose-only in compose, with no Traefik labels.
- First run only: config bootstrap + auth token (gateway refuses lan bind without auth):

```bash
docker compose run --rm --no-deps --entrypoint node openclaw-platform-gateway \
  openclaw.mjs config set --batch-json '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"lan"}]'
# OPENCLAW_GATEWAY_TOKEN must be set in .env (openssl rand -hex 24)
```

- Health: `curl http://127.0.0.1:18799/healthz` -> 200. CLI works in-container via loopback only:
  `docker compose exec openclaw-platform-gateway node openclaw.mjs <cmd>`.

## Broker device pairing (once per environment)

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18799 \
OPENCLAW_DEV_SECRETS_FILE=.dev-secrets/openclaw-secrets.json \
pnpm --filter @opzava/workers bootstrap:platform-gateway
```

Three modes (env-driven): no creds -> registers a pending pairing request; `OPENCLAW_GATEWAY_TOKEN`
-> issuance dial (fresh device token minted in hello-ok, vaulted by ref, then auto-validated);
`OPENCLAW_OPERATOR_DEVICE_TOKEN` -> validation only. Approvals happen in-container:

```bash
docker compose exec openclaw-platform-gateway sh -lc \
  'node openclaw.mjs devices approve "$1" --url ws://127.0.0.1:18789 --token "$OPENCLAW_GATEWAY_TOKEN"' \
  -- <requestId>
```

- Device identity derives from `OPENCLAW_DEVICE_PRIVATE_KEY_PEM(_BASE64)` (ed25519).
- Approvals are METADATA-BOUND: changing client version/platform/userAgent triggers a
  `metadata-upgrade` re-approval and invalidates prior tokens - re-run issuance after approving.
- Hot-path token scopes must validate exactly `operator.write + operator.approvals`
  (+ gateway-materialized `operator.read`). Anything else fails closed.

## Model auth — Codex subscription OAuth (Q16; once per environment, INTERACTIVE)

Run with a TTY (your terminal, repo root):

```bash
docker compose exec openclaw-platform-gateway node openclaw.mjs onboard --auth-choice openai-device-code
```

Accept the wizard, open the printed URL, enter the device code, sign in with the GPT Pro account.
Tokens persist in the `openclaw-platform-auth-profiles` volume; they are NOT portable across
environments (by design) - each environment signs in once.

- API-key fallback (Q16): configure a Codex-compatible API-key profile behind the subscription in
  `auth.order.openai` so quota exhaustion degrades to metered billing instead of a dead
  orchestrator. Watch for silent fallback via auth monitoring
  (`docs/openclaw/gateway/authentication.md`) - "running on API-key fallback" must surface as an
  admin event, not an invoice surprise.
- Re-auth after revocation/expiry: re-run the same onboard command.
- TRIPWIRE: before external users or scheduled marketing automation (P5), move to a dedicated
  account/API-key profile. The OAuth profile is colocated with the gateway the broker reaches;
  acceptable now because the agent has no fs/web/runtime tools and the broker token cannot read
  secrets - revisit at the tripwire.

## Ask Admin agent (installed 2026-07-03)

`agents.list[0]`: id `ask-admin-opzava`, model `openai/gpt-5.5` (native Codex runtime),
`contextInjection: continuation-skip`, per-agent tools `{profile: minimal, allow: opzava_tasks_*,
deny: group:runtime/write/edit/apply_patch/group:fs}`. `minimal` = `session_status` only
(`docs/openclaw/gateway/config-tools.md`) - the deny list is defense-in-depth. Persona files live
in the agentDir; hashes must match the provisioning receipt
(`apps/workers/src/provisioning/ask-admin-agent.ts`).

Consensus trail: `docs/plan/consensus/slice2-agent-install-redteam.mmx.md` (adjudicated) +
`slice2e-agent-config-review.codex.md` (SOUND-WITH-FIXES; fixes applied).

## Sad paths

| Symptom | Meaning | Action |
| --- | --- | --- |
| `exec gateway failed` on start | compose `command` replaced the node invocation | command must be `["node","openclaw.mjs","gateway",...]` |
| `Refusing to bind gateway to lan without auth` | no gateway token | set `OPENCLAW_GATEWAY_TOKEN`, recreate |
| CLI `SECURITY ERROR ... plaintext ws://` | CLI refuses non-loopback ws | exec INSIDE the container (loopback) |
| `device identity mismatch` | device.id != sha256(raw pubkey) | derive identity from the private key (bootstrap does this) |
| `gateway token mismatch` on validation | device token sent in `auth.token` | paired tokens ride in `auth.deviceToken` |
| `device token mismatch (rotate/reissue)` | stale token (metadata rebind) | re-run issuance mode |
| `pairing required: ... more scopes` | CLI/device scope upgrade pending | `devices approve <requestId>` (direct-local fallback works in-container) |
| Orchestrator slow/degraded, invoice climbing | silent fallback to API-key tier | check auth monitoring; re-run OAuth sign-in |
