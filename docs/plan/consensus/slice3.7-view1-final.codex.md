# Slice 3.7 View 1 Models & Providers Final Review - Codex

FINAL adversarial review of `git diff HEAD` after the two prior memos:

- `docs/plan/consensus/slice3.7-view1-review.codex.md`
- `docs/plan/consensus/slice3.7-view1-rereview.codex.md`

Scope was intentionally narrow: the newest changes to canonical LLM provider surfacing in the
worker and the revised grouped provider-state resolution in the web projection.

## Verdict

**FULLY CONVERGED / SHIP-READY**

No new correctness, security, or regression finding remains in the two newest changes. The four
original findings remain resolved, and the one convergence finding from the re-review is resolved.

## Severity-Ranked Findings

No open findings.

## Canonical LLM Provider Gate

`ensureCanonicalLlmProviders` is gateway-gated and does not create a static provider catalog.

- Presence is gated on live onboard auth choices: `getConnectionsSnapshot` reads
  `gatewayRuntime.listAuthChoices()` into `runtimeChoices`, first uses those choices to fill auth
  choices for live catalog entries, then passes the same live choices into
  `ensureCanonicalLlmProviders` (`apps/workers/src/provisioning/gateway-admin-connections.ts:1613`,
  `:1628-1635`).
- Additions are skipped when the provider id is already present in the catalog, so exact duplicate
  root rows are avoided (`apps/workers/src/provisioning/gateway-admin-connections.ts:862-868`).
- A canonical provider is added only when `authChoicesForProvider({ providerId: rootId, choices })`
  returns at least one live choice (`apps/workers/src/provisioning/gateway-admin-connections.ts:870-872`).
- Added rows are explicitly classified as top-level LLM parents with `category: "llm"`,
  `parentId: null`, `runtimeLabel: null`, and empty real models (`apps/workers/src/provisioning/gateway-admin-connections.ts:875-888`).
- The canonical source list is derived from `CANONICAL_PROVIDER_LABELS`, whose ids are LLM roots and
  do not overlap the explicit non-LLM denylist (`packages/ports/src/model-provider-taxonomy.ts:43-75`,
  `:84`).

Conclusion: this cannot inject a known non-LLM provider through the canonical path, and it cannot
inject a provider with no live gateway auth surface. It can add a provider with no models, but only
as an honest connect target backed by live onboard auth choices; that is the intended Slice 3.7
behavior. Coverage now exercises the no-models-yet OpenRouter/xAI path
(`apps/workers/src/provisioning/__tests__/connections.test.ts:943-985`).

## Grouped State Truth Table

`providerStateForGroup` now treats only a real parent signal as authoritative. A bare synthesized
parent `not_connected` row no longer masks a folded child that is actually connected or unhealthy
(`apps/web/lib/connections-state.ts:259-282`).

Result selected by `providerStateForGroup` for one parent plus one folded child:

| parent status | child not_connected | child pending | child needs_attention | child connected |
| --- | --- | --- | --- | --- |
| not_connected | parent not_connected | child pending | child needs_attention | child connected |
| pending | parent pending | parent pending | parent pending | parent pending |
| needs_attention | parent needs_attention | parent needs_attention | parent needs_attention | parent needs_attention |
| connected | parent connected | parent connected | parent connected | parent connected |

Notes:

- If the parent row is absent, behavior matches the child fallback side of the `not_connected` row:
  a child `connected`, `needs_attention`, or `pending` can back the group.
- A view-level pending device flow still overrides the displayed status after state selection via
  `pendingFlowForGroup`; that is separate from child connection-state precedence.
- Tests now cover both critical cases: parent `needs_attention` over connected Codex, and
  synthesized parent `not_connected` yielding to connected Claude CLI
  (`apps/web/test/connections-page.test.ts:406-438`).

## Prior Findings Status

1. **Provider API-key leak on onboard failure - remains resolved.**
   `commandFailureError` still classifies raw gateway output internally, but returned messages are
   code-derived and metadata-safe (`apps/workers/src/provisioning/gateway-admin-connections.ts:1132-1158`).

2. **Folded child auth submits parent provider id - remains resolved.**
   The re-review-verified UI path still uses the auth choice provider id for connect and
   `connectionProviderId` for disconnect; the newest state change does not regress that contract.

3. **Connected folded child masks parent needs_attention - remains resolved.**
   Any parent state other than `not_connected` returns before child states are considered
   (`apps/web/lib/connections-state.ts:269-272`).

4. **authStatus-only providers appended then dropped - remains resolved.**
   Provider connections remain catalog-aligned, and the worker does not synthesize standalone
   authStatus-only connection rows (`apps/workers/src/provisioning/gateway-admin-connections.ts:1636-1663`).

5. **Convergence finding: synthesized parent not_connected masks connected folded runtime - resolved.**
   Parent `not_connected` is no longer authoritative; connected child state wins before the parent
   fallback (`apps/web/lib/connections-state.ts:269-280`).

## Checks

- Reviewed current `git diff HEAD`, the two prior memos, the changed worker projection path, the
  shared taxonomy, and the updated web projection tests.
- Per brief, I did not modify application code and did not run build/test commands.
