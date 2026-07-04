# Slice 3.7 View 1 Models & Providers Re-review - Codex

CONVERGENCE re-review of `git diff HEAD` against the prior memo
`docs/plan/consensus/slice3.7-view1-review.codex.md`, focused only on the Slice 3.7 Models &
Providers fixes and the new-change regression probes requested in the brief.

## Verdict

**NOT FULLY CONVERGED**

The four prior findings are addressed in the code under review. One new medium correctness
regression remains: the parent-authoritative projection fallback works for a synthetic snapshot that
omits the parent connection row, but the worker now emits a `not_connected` connection row for every
catalog parent, so a connected folded runtime can still fail to back its parent in production
snapshots.

## Prior Findings

1. **[HIGH] Provider API-key leak on onboard failure - RESOLVED.**
   `apps/workers/src/provisioning/gateway-admin-connections.ts:1085-1116` still classifies the raw
   `stderr/stdout` internally, but the returned `DomainError.message` is now one of three generic,
   code-derived strings and metadata is limited to `providerId`, `authChoiceId`, and `exitCode`.
   It no longer returns raw onboard output to the browser. Added coverage at
   `apps/workers/src/provisioning/__tests__/connections.test.ts:999-1034` asserts a failing onboard
   result containing `sk-live-secret-provider-key` does not leak that key through
   `JSON.stringify(result)` or the error message.

2. **[MEDIUM] Folded child auth submits parent provider id - RESOLVED.**
   `apps/web/components/connections/model-providers-panel.tsx:230-235` resolves
   `connectProviderId` from `choice.providerId`, and both API-key and device-flow forms submit that
   value at `:291-293` and `:325-327`. `ProviderActionResult` now matches against the submitted raw
   provider id at `:160-169`. Disconnect submits `provider.connectionProviderId` at `:433-435`, not
   the grouped display id.

3. **[MEDIUM] Connected folded child masks parent needs_attention - RESOLVED.**
   `apps/web/lib/connections-state.ts:259-270` now returns an explicit parent state before checking
   child states, so a parent `needs_attention` state wins over a connected folded runtime. Added
   coverage at `apps/web/test/connections-page.test.ts:406-420` asserts OpenAI remains
   `needs_attention` with `connectionProviderId: "openai"` when Codex is connected.

4. **[LOW] authStatus-only providers appended then dropped - RESOLVED.**
   The worker no longer appends authStatus-only connection rows. `getConnectionsSnapshot` builds
   `providerConnections` only by mapping catalog rows at
   `apps/workers/src/provisioning/gateway-admin-connections.ts:1590-1614`, with the comment at
   `:1615-1617` making catalog alignment explicit. This removes the dead snapshot row that the web
   projection could never render.

## New Findings

1. **[MEDIUM] Connected folded runtime can still fail to back a parent in real worker snapshots.**
   `providerStateForGroup` correctly falls back to child states only when no parent state exists
   (`apps/web/lib/connections-state.ts:259-280`), and the added test covers that synthetic case by
   passing only `{providerId:"claude-cli", status:"connected"}`
   (`apps/web/test/connections-page.test.ts:422-436`). In production, however,
   `getConnectionsSnapshot` creates a connection row for every catalog provider
   (`apps/workers/src/provisioning/gateway-admin-connections.ts:1590-1614`), and
   `providerConnectionFromConfig` returns an explicit `not_connected` row when the parent has no
   profile (`:500-518`). Concrete failure: catalog contains `anthropic` and folded child
   `claude-cli`; only `claude-cli` is connected. The worker emits `anthropic:not_connected` and
   `claude-cli:connected`; `providerStateForGroup` treats the parent `not_connected` row as
   authoritative, so the Anthropic parent renders `Not connected` instead of the required
   `Connected`, and `connectionProviderId` becomes `anthropic` instead of `claude-cli`. Fix by
   distinguishing synthesized empty parent state from real parent auth/config state, or by letting a
   connected folded child outrank a parent `not_connected` state while still allowing parent
   `needs_attention` to remain authoritative.

## Regression Probe Results

- Parent-authoritative status resolution does not break the pure projection fallback test, but it
  does break the real worker-shaped "runtime backs parent with no state" case described above.
- `connectionProviderId` equals the resolved state's `providerId` at
  `apps/web/lib/connections-state.ts:367-370`; the remaining issue is that the resolved state can be
  the wrong synthetic parent row.
- `hasConnectedProviderOrGitHub` now scans raw `providerConnections` and filters through
  `classifyModelProvider` at `apps/web/lib/connections-state.ts:412-425`; the taxonomy excludes
  explicit non-LLM ids such as `deepgram` and includes LLM parents/runtimes by default at
  `packages/ports/src/model-provider-taxonomy.ts:92-119`.
- The `models.authStatus` empty/unparseable fallback degrades to the CLI path:
  `modelAuthStatus()` returns `null` when `map.size === 0` at
  `apps/workers/src/provisioning/gateway-admin-connections.ts:1541-1547`, and
  `getConnectionsSnapshot` calls `gatewayRuntime.modelStatus()` when `authStatus === null` at
  `:1580-1584`.

## Checks

- I reviewed the current `git diff HEAD` and targeted current-file line ranges for the changed
  worker, web projection, UI, ports taxonomy, and added tests.
- I did not run build/test commands, per the brief's explicit "Do NOT run build/test" instruction.
