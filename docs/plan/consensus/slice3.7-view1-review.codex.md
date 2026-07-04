# Slice 3.7 View 1 Models & Providers Review - Codex

Adversarial review of `git diff HEAD` on `slice/4-marketing-content-pipeline`, focused on the
Slice 3.7 Models & Providers spec.

## Verdict

**UNSOUND**

The grouped table and the primary `models.authStatus` happy path are close, and I did not find an
OpenClaw type imported into `apps/web`. The slice is not ship-safe: provider key material can still
come back in an error result, folded runtime auth choices can be submitted under the wrong provider,
folded child status can mask a broken parent provider, and authStatus-only providers are preserved
by the worker but dropped by the web projection.

## Findings

1. **[HIGH] Provider API keys can leak back to the browser on onboard failure.**
   `apps/workers/src/provisioning/gateway-admin-connections.ts:1090` builds a failure message from
   raw `stderr/stdout`, and `apps/workers/src/provisioning/gateway-admin-connections.ts:1103`
   returns that output as the `DomainError.message`. Concrete failure: `connectApiKey({ apiKey:
   "sk-live-secret" })` runs `onboard`; the gateway exits 1 with `stderr: "invalid key
   sk-live-secret"`; `commandFailureError` returns a result object whose error message contains
   `sk-live-secret`; `apps/web/app/(app)/connections/actions.ts:133` maps that to action state, and
   `apps/web/components/connections/model-providers-panel.tsx:184` renders it in the browser.
   This violates the no-provider-secret-in-result/log/browser rule. Fix: never expose raw onboard
   output for credential-bearing commands. Return a generic failure message with provider/authChoice
   metadata only, and if retaining diagnostics server-side, redact `input.apiKey` and common key
   patterns before constructing/logging any error. Add a failing test where `gatewayRuntime.connectApiKey`
   returns nonzero output containing the submitted key and assert `JSON.stringify(result)` and the
   web action state do not contain it.

2. **[MEDIUM] Folded runtime/alias auth choices submit the parent provider id, so child-only auth
   paths cannot connect.** `apps/web/lib/connections-state.ts:239` merges child auth choices into
   the parent group while preserving `choice.providerId`, but
   `apps/web/components/connections/model-providers-panel.tsx:268` and
   `apps/web/components/connections/model-providers-panel.tsx:298` always post `provider.id`
   instead of the selected `choice.providerId`. Concrete failure: catalog has parent `openai`
   present with no auth choices and child `codex` folded under it with `{ id:"codex-api-key",
   providerId:"codex", mode:"api-key", keyFlag:"codex-api-key" }`; the projected OpenAI row exposes
   that API-key choice; clicking Connect posts `providerId=openai&authChoiceId=codex-api-key`;
   `apps/workers/src/provisioning/gateway-admin-connections.ts:1671` searches auth choices for
   `openai`, does not match the `codex` choice, and returns `authChoiceUnavailable`. The same
   mismatch affects folded provider aliases such as a child-specific Vertex/API-key provider under
   Anthropic/Google. Fix: make the rendered action target explicit, e.g. submit
   `choice.providerId` for connect/start-device-flow and carry a separate display parent id. For
   disconnect, submit the provider id from the connection state that made the row connected, not
   blindly the grouped parent id.

3. **[MEDIUM] A connected folded child can hide a parent provider that needs attention.**
   `apps/web/lib/connections-state.ts:263` prefers any grouped `connected` state before
   `needs_attention`, even when the parent has its own authStatus row. Concrete failure:
   `providerCatalog=[openai,codex]`, `providerConnections=[{providerId:"openai",
   status:"needs_attention", authHealth:"missing"}, {providerId:"codex", status:"connected",
   authHealth:"ok"}]`; `projectModelProviders` returns the OpenAI parent row as `Connected` with
   `authHealth:"ok"`. The documented authStatus mapping for OpenAI is lost, so a missing/expired
   parent appears healthy merely because a folded runtime is connected. Fix: for a group whose
   parent exists in the catalog, use the parent providerConnection as the status/authHealth source;
   only fall back to child states for promoted orphan children or when the parent has no state.
   Keep pending device-flow as the outer precedence override.

4. **[LOW] Provider rows reported only by `models.authStatus` are added to the snapshot and then
   dropped by the web projection.** `apps/workers/src/provisioning/gateway-admin-connections.ts:1604`
   appends `authStatusOnlyConnections` for providers absent from the catalog, but
   `apps/web/lib/connections-state.ts:316` iterates only `snapshot.providerCatalog`. Concrete
   failure: `models.list` returns only `openai`, while `models.authStatus` returns a connected
   `anthropic` provider; the worker snapshot contains `providerConnections[{providerId:"anthropic",
   status:"connected"}]`, but `projectModelProviders` returns no Anthropic row and
   `connectionHealthSummary` does not count it. That misses the spec's sad path for a provider
   present in authStatus but absent from catalog. Fix: either synthesize a minimal, clearly
   no-auth-choice LLM catalog row from authStatus-only connections before projection, or move that
   union into the worker so catalog and connection rows stay aligned. Add a projection test for the
   authStatus-only edge.

## Checks

- No `apps/web` import of an OpenClaw type/module was found in the touched diff; web imports only
  agnostic port types/helpers from `@opzava/ports`.
- `models.authStatus` maps `expiring` to coarse `connected` and `expired|missing` to
  `needs_attention` in the worker happy path.
- The worker does not call the CLI `models status` fallback when `models.authStatus` succeeds, and
  calls it once when `models.authStatus` returns an error.
- I did not run tests or build commands, per the brief's "no build/test runs" instruction.
