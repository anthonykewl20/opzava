# Slice 3.7 View 1 — Models & Providers: fresh second-opinion review

Independent adversarial re-read of `git diff HEAD` on
`slice/4-marketing-content-pipeline`, against
`docs/plan/consensus/slice3.7-view1-models-providers-spec.md` and the two prior
memos (`slice3.7-view1-review.codex.md`, `slice3.7-view1-rereview.codex.md`).
This pass deliberately hunts for defects the prior reviewer may have missed; it
does not repeat resolved items except to confirm convergence. No code was
modified; no build/test was run, per the brief.

## Verdict

**SOUND — ship-ready on the brief's explicit axes, with one open thread now
closed and a short tail of LOW-severity polish items.**

On every axis the brief called out, the change is correct:

- **Security / ACL.** The HIGH secret-leak in `commandFailureError`
  (`gateway-admin-connections.ts:1127-1158`) is genuinely fixed: the returned
  `DomainError.message` is one of three code-derived strings and the metadata is
  limited to `providerId`/`authChoiceId`/`exitCode`; raw `stderr`/`stdout` is
  only read internally for code selection. I traced every other command-output
  and credential path in the worker (`connectApiKey` exec, `modelStatus`,
  `listAuthChoices`, `config.get` profile extraction, snapshot error messages)
  and found **no** second path that returns key material or raw onboard output
  to the result/browser/logs. The `console.log` at `:1230` logs only
  `providerId`/`authChoiceId`, never the key. `authChoiceFromUnknown` and
  `providerConnectionFromConfig` extract only structural/id fields, never a key
  value. No OpenClaw vendor type is imported into `apps/web` (the two `openclaw`
  hits in web are Opzava's own `openclaw-gateway-broker` port, untouched here;
  `connections-state.ts` imports only `@opzava/ports`). Two-token boundary holds:
  `requiredScope: "operator.admin"` is attached to exactly the three write sites
  (`:1757` connect allowlist patch, `:1894` disconnect, `:1969` orchestrator
  delegation); the snapshot reads do not require it, and the broker hot path is
  not touched by this diff.
- **`ensureCanonicalLlmProviders`** (`gateway-admin-connections.ts:858-892`)
  correctly gates each canonical root on a **live** `authChoicesForProvider`
  match (no phantom providers), dedupes against the existing catalog, and stamps
  `category:"llm"`, `parentId:null`, `runtimeLabel:null`, `models:[]`.
- **`projectModelProviders` grouping/curation** (`connections-state.ts:308-403`)
  folds runtime/alias children under catalog parents, excludes non-LLM, promotes
  orphans, and `providerStateForGroup` (`:259-283`) satisfies **both** stated
  rules — a `not_connected` parent no longer masks a connected folded runtime,
  and a `needs_attention` parent still wins over a connected child.
- **Connect/disconnect targeting** (`model-providers-panel.tsx:230-235, 291-293,
  326-327, 434-435`) submits the choice's own `providerId` for connect and
  `connectionProviderId` for disconnect, so folded children target their raw id.

## Convergence — the rereview's open item is RESOLVED

The rereview closed on **NOT FULLY CONVERGED** with one open MEDIUM: in real
worker snapshots the worker synthesizes a `not_connected` row for every catalog
parent (`providerConnectionFromConfig`, `:502-521`), so a connected folded
runtime (e.g. `claude-cli`) could fail to back its parent (`anthropic`) because
the parent's `not_connected` row was treated as authoritative.

That is fixed in the code under review. `providerStateForGroup`
(`connections-state.ts:269-272`) now returns the parent state **only when its
status is not `not_connected`**, and otherwise falls through to the grouped
child states:

```
const parentState = states.find((state) => state.providerId === parentId) ?? null;
if (parentState !== null && parentState.status !== "not_connected") {
  return parentState;
}
```

It is also covered by a regression test
(`connections-page.test.ts:422-439`) that uses the realistic worker shape
(`anthropic:not_connected` + `claude-cli:connected`) and asserts the Anthropic
row renders **connected** with `connectionProviderId === "claude-cli"` and no
standalone `claude-cli` row. **This thread can be closed.**

## Findings the prior reviews did not raise

None are blockers. Ranked by severity; each is concrete.

### 1. [LOW] `not_connected` (config) and `missing` (authStatus) mean the same
thing — "no direct credential" — but are treated as *opposites* for runtime
masking, so a connected-runtime-backed parent can flip between Connected and
Needs-attention depending only on whether the gateway advertises
`models.authStatus`.

The #5 protection special-cases exactly `"not_connected"`. But the worker maps
an authStatus `missing` parent to `needs_attention`
(`connectionStatusFromAuthHealth`, `gateway-admin-connections.ts:1027-1035`) and
then overlays it onto the connection (`status: authState.status`, `:1646-1659`).
`providerStateForGroup` (`connections-state.ts:269-272`) then treats that
`needs_attention` as authoritative and returns it, masking any connected folded
child.

This masking is **deliberate and test-encoded** for the "direct key
expired/missing" case (`connections-page.test.ts:406-420`: openai
`needs_attention`/`missing` + codex connected → openai stays needs_attention).
So it is not an oversight. The defect is the **inconsistency**: the *same*
real-world state — "no direct Anthropic credential, Claude CLI connected" —
renders as **Connected** when authStatus is unadvertised (parent row is
config-derived `not_connected` → child backs it) but as **Needs attention** when
authStatus is advertised *and* enumerates the parent as `missing`. Whether a
working runtime backs the parent thus depends on gateway capability, not on
reality.

- Failing input (conditional): `catalog=[anthropic(parent), claude-cli(child)]`;
  `models.authStatus = { providers: [ {provider:"anthropic", status:"missing"},
  {provider:"claude-cli", status:"ok"} ] }`. Worker emits
  `anthropic:needs_attention`, `claude-cli:connected`; projection returns the
  Anthropic row as **Needs attention** (masking the connected CLI), whereas with
  authStatus unadvertised the same topology renders **Connected**.
- Precondition: authStatus must enumerate the parent as `missing`. If authStatus
  only reports profiled providers this does not fire — but the spec explicitly
  allows a `missing` status, so the gateway *can* emit it, and nothing here
  defends against it.
- Fix (pick one, and document the choice): either (a) treat authHealth
  `missing` on a parent that has a connected folded child like `not_connected`
  for masking (i.e. only let `expired`/`expiring` "real-break" parents win), or
  (b) keep the current behavior and assert in a test that a connected runtime
  backed by a `missing` parent intentionally surfaces needs_attention, so the
  flip is a known consequence rather than a silent one. Recommended: (a), since
  it makes "is there a working credential for this provider" the single truth.

### 2. [LOW] Provider-id case is not normalized; `authStatus.get(provider.id)`
and `ensureCanonicalLlmProviders` dedupe assume lowercase.

`providerCatalogFromModels` reads ids verbatim with no lowercasing
(`gateway-admin-connections.ts:358`). `classifyModelProvider` and the
runtime/alias maps lowercase internally, so *classification* survives a mixed-case
id — but two lookups do not: (a) `authStatus?.get(provider.id)` (`:1646`) is
keyed by the raw authStatus provider string, and (b) `ensureCanonicalLlmProviders`
dedupes with `present.has(rootId)` against lowercase `CANONICAL_LLM_PROVIDER_IDS`
(`:862-866`).

- Failing input: gateway `models.list` returns a provider with id `"OpenAI"`.
  Catalog id = `"OpenAI"`. authStatus reports `provider:"openai"`.
  `authStatus.get("OpenAI")` → `undefined` → the OpenAI row silently loses
  authStatus enrichment and falls back to the config-derived state. Separately,
  `present.has("openai")` is false, so `ensureCanonicalLlmProviders` *also*
  appends a lowercase `"openai"` → duplicate OpenAI rows.
- Likelihood: low — OpenClaw emits lowercase provider ids in practice (the
  taxonomy is grounded on that). Latent, not active.
- Fix: lowercase catalog ids once in `providerCatalogFromModels` (or normalize
  at both lookup sites), so catalog, authStatus map, and canonical dedupe share
  one key space.

### 3. [LOW] When a parent and a folded child are BOTH connected, Disconnect
removes only one credential and the row stays "Connected".

`connectionProviderId` resolves to the parent when the parent is connected
(parent state wins, `connections-state.ts:269-272`), so the disconnect form
posts the parent id (`model-providers-panel.tsx:434-435`). The worker nulls only
that profile (`gateway-admin-connections.ts:1867-1877`). The child runtime stays
connected, so on refresh the row re-renders still **Connected**, now backed by
the child (`connectionProviderId` flips to the child id).

- Failing input: `openai` direct (connected) + `codex` (connected). User clicks
  Disconnect on the OpenAI row → only the direct OpenAI profile is removed; the
  row remains Connected via Codex. The user must click Disconnect again to
  remove Codex.
- Fix: when a group has more than one connected providerId, either disconnect
  all of them, or make the disconnect target explicit (e.g. a per-credential
  menu) so "Disconnect" matches the user's mental model of disconnecting the
  row.

### 4. [LOW] A folded group exposes only one connectable auth method even when
several are merged.

`connectChoice` returns `apiKeyChoices[0] ?? deviceFlowChoices[0]`
(`model-providers-panel.tsx:50-52`). A folded parent can merge multiple api-key
choices (parent direct + runtime). The dialog connects via whichever is first;
the user cannot choose. This is **not** a correctness bug — each choice carries
its own `providerId`, so targeting stays valid (MED-2 stays fixed) — but it is a
curation gap versus the spec's "merged auth choices" intent: the auth *badges*
show every method, while the connect dialog only offers one.

- Fix: offer the merged choice set in the dialog (selectable), or document the
  "first api-key wins" rule as intentional.

### 5. [LOW / observation] The web `orchestratorPlan` preview and the worker's
persisted delegation use different id spaces for folded runtimes.

`buildOrchestratorConfigPlan` (`connections-state.ts:430-474`) builds subagents
from projected **parent** views (`subagent-anthropic`), but
`applyOrchestratorRolesForContext` sends `connectedProviderIds(snapshot.value)`
(`connections.ts:493-496`), which is deliberately **raw** ids
(`connectedProviderIds`, `connections-state.ts:405-412`), so the worker persists
`subagent-claude-cli` (`gateway-admin-connections.ts:1928-1945`). Agent ids are
internal, so nothing breaks today, but the preview and the persisted config can
drift for folded runtimes; if the preview is ever surfaced as "what will be
applied", it will not match.

- Fix: derive the preview from the same raw-id set the worker consumes, or
  document that the preview is illustrative.

## Edge cases explicitly checked and found sound

- **Empty catalog** (models.list empty, no auth-choices): `ensureCanonicalLlmProviders`
  adds nothing, projection returns `[]`, health tiles count only gateway+github,
  panel renders its "Provider catalog unavailable" empty state. OK.
- **`models.list` failure**: `providerCatalogFromModels({}, config)` still yields
  config-profile + canonical providers; snapshot degrades, does not throw.
  Gateway message surfaces the RPC error (operational, not credential-bearing). OK.
- **authStatus empty/unparseable**: `modelAuthStatusMap` size 0 → `modelAuthStatus`
  returns null → CLI `modelStatus` fallback runs once, providers not dropped
  (verified by test at `connections.test.ts:920-941`). OK.
- **Orphan promotion**: a child whose parent is absent from the catalog is
  promoted to its own top-level row (`connections-state.ts:334-344`); not lost. OK.
- **Models dedupe/cap**: worker caps at 8 per provider, projection merges+dedupes
  by id and caps at 6; empty allowed, never faked. OK.
- **Idempotency**: snapshot is a pure read; disconnect is a merge-patch of null
  profile values (re-runnable). `getConnectionsSnapshot` parallelizes reads and
  only sequences the CLI fallback when authStatus is null — no race. OK.
- **usageLabel**: takes the lowest-remaining window (`100 - round(usedPercent)`,
  clamped), matching the spec's "lowest-remaining" rule. OK.

## Checks performed

- Full `git diff HEAD` plus targeted reads of the worker, web projection, panel,
  page, ports, taxonomy, and both test files (current-file line ranges).
- Grep for every `stderr`/`stdout`/`console.`/`apiKey`/`provisioningError` site
  in the worker to enumerate all secret/output paths.
- Grep for OpenClaw/mainframe imports in `apps/web` source (none in the
  connections surface) and for `requiredScope` write sites (three, all
  `operator.admin`).
- I did not run build or test commands, per the brief.
