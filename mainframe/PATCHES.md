# Rung-3 patch ledger (ADR-016 customization ladder)

Every change to Mainframe lands on the LOWEST rung that can express it:

- **Rung 0** — config (gateway config, env, flags). No source change.
- **Rung 1** — official extension points (extensions/skills/hooks).
- **Rung 2** — first-party additive modules in our namespace (`extensions/opzava-*`); upstream files untouched.
- **Rung 3** — source patches to UPSTREAM files. Each one MUST be logged here and is re-reviewed at every
  upstream bump (`UPSTREAM.md`). Expected near-empty. Opzava product features are NEVER rung-3 patches —
  they live in the Opzava app and use the gateway via the broker.

| # | Files touched | What / why | Upstream status |
| --- | --- | --- | --- |
| 1 | `Dockerfile` | Optional `OPZAVA_CLAUDE_CODE_VERSION` build arg installs a pinned `@anthropic-ai/claude-code` in the runtime stage, so Anthropic setup-token / claude-cli auth flows can run inside the gateway container (in-browser Claude Max connect). Default empty = upstream-identical image. | Local only; candidate to upstream as a generic extra-globals build arg. |
| 2 | `src/plugins/types.ts`, `src/plugins/provider-api-key-auth.ts`, `src/gateway/server-methods/models-auth-status.ts` | Report auth-profile OWNERSHIP over RPC. An auth method may write profiles under provider ids other than its own — OpenCode deliberately shares one key across the `opencode` (Zen) and `opencode-go` (Go) catalogs (`src/plugin-sdk/opencode.ts`) — and `models.authLogout` removes profiles by provider id, so a consumer revoking a credential cannot derive the full profile set and orphans the siblings, leaving a live key behind (Opzava #174). Adds optional `ProviderAuthMethod.ownedProfileIds`, populates it in `createProviderApiKeyAuthMethod` from the same `resolveProfileIds` the write path uses, and surfaces `ownership` (providerId -> profile ids) on the existing `models.authStatus` result. Purely additive + read-only: no provider ids in core, no change to `authLogout` semantics, and the block is optional so older clients are unaffected. | Local only; strong upstream candidate — any API consumer revoking a shared-profile credential hits this. Upstream would likely prefer a dedicated ownership/disconnect RPC; re-review at each bump and drop this patch if upstream lands an equivalent. |
