# Slice 3.7 view #1 — CORRECTNESS FIX + segmentation (reuse OpenClaw's real logic)

User directive: reuse OpenClaw's (`mainframe/`) real working code/logic so OUR Opzava admin
dashboard behaves correctly. The current view #1 is flaky. Fix the concrete defects below by
grounding in OpenClaw's actual gateway RPCs, and re-segment providers. EVERY fix must be verified by
DRIVING THE REAL INTERACTION live (click Manage / Disconnect), not a route sweep.

## Defect 1 — Disconnect → 404 (OpenAI/Codex OAuth)
Root cause: `disconnectModelProvider` (apps/workers/src/provisioning/gateway-admin-connections.ts)
disconnects via `config.patch` deleting `auth.profiles[<key>]` + clearing `auth.order`. An OAuth
connection (OpenAI/Codex) stores creds in an OAuth/device store, NOT `config.auth.profiles`, so the
patch is a no-op/failure and the action errors.
Fix: use OpenClaw's REAL logout RPC **`models.authLogout {provider}`** (handler confirmed at
`mainframe/src/gateway/server-methods/models-auth-status.ts:404`; returns
`{provider, removedProfiles[], abortedRunIds[]}`) as the PRIMARY disconnect for the provider id.
Keep the `config.patch` profile-delete only as a fallback for pure api-key providers if authLogout
is unavailable. `models.authLogout` is a mutation → still requires the JIT `operator.admin` scope
(worker path), never the broker. On success return the refreshed ProviderConnectionState. Ensure the
web disconnect action does not surface a 404: the `disconnectModelProviderAction` void server action
must resolve cleanly (revalidate) on success and map errors to the notice redirect, never a bare
throw that renders not-found.

## Defect 2 — Manage shows an "API key" field for an OAuth connection
Root cause: `connectChoice` = `apiKeyChoices[0] ?? deviceFlowChoices[0]` blindly prefers api-key, so
a provider CONNECTED via OAuth (OpenAI/Codex) shows a key-paste field.
Fix: expose the REAL connected auth type. OpenClaw `models.authStatus.providers[].profiles[].type`
is `"oauth" | "token" | "api_key"` (`mainframe/src/gateway/server-methods/models-auth-status.ts:68`).
- Worker: in `modelAuthStatusMap`, capture the connected profile's `type` and surface it on
  `ProviderConnectionState` as a new optional field `connectedAuthMode: "oauth" | "token" |
  "api_key" | null` (add to @opzava/ports). Prefer the type of the healthy/active profile.
- Web (`model-providers-panel.tsx` Manage dialog): drive the dialog by connection state, not by
  `connectChoice`:
  - CONNECTED + connectedAuthMode oauth/token → NO api-key input. Show "Connected via
    <ChatGPT/OAuth/subscription>", the real model, and a Disconnect (+ re-authenticate hint). Never
    ask to paste a key.
  - CONNECTED + connectedAuthMode api_key → show the rotate-key field.
  - NOT connected → Connect, offering the provider's real auth choice(s); prefer the featured/OAuth
    method when the provider advertises one, else api-key.

## Defect 3 — Wrong/assumed model ("gpt-5.3-chat-latest")
Root cause: `provider.model` = `state?.model ?? suggestedModel`, and the worker picks an arbitrary
entry from the models-status allowed list.
Fix: show the provider's ACTUAL configured model. Source from gateway `config` (via `config.get`
already fetched): the agent default `agents.defaults.model.primary` when its provider matches, else
the provider's configured `models.providers.<id>` default/primary. Only if config carries no model
for the provider, fall back to a real models.list entry for that provider; never invent one. The
row's Models column already lists real models.list ids — keep that; the single "active model" shown
in Manage must be the configured one.

## Defect 4 — Re-segment the providers surface (was a broken flat list)
Group the providers into THREE labelled sections (in this order), plus a collapsed "Other
providers" for the remaining gateway-advertised LLM providers (nothing connectable is lost):
- **Frontier**: `openai` ("OpenAI"), `anthropic` ("Anthropic") — Anthropic's connect route is the
  Claude Max API proxy (docs/openclaw/providers/claude-max-api-proxy); surface Anthropic in Frontier
  and label its auth accordingly (proxy/subscription), do not force a bare Anthropic API key.
- **Bundles**: `opencode-go` ("OpenCode Go"), `openrouter` ("OpenRouter"), `qwen` ("Alibaba Model
  Studio"), `cloudflare-ai-gateway` ("Cloudflare AI Gateway").
- **Best Subagents**: `zai` ("Z.AI (GLM)"), `moonshot` ("Moonshot (Kimi)"), `minimax` ("MiniMax"),
  `xiaomi` ("Xiaomi MiMo").
Implementation:
- Add a `PROVIDER_TIERS` map + `providerTier(id)` + tier labels to
  `packages/ports/src/model-provider-taxonomy.ts`. Update `CANONICAL_PROVIDER_LABELS` /
  `CANONICAL_LLM_PROVIDER_IDS` to include claude-max-api-proxy, opencode-go, cloudflare-ai-gateway,
  minimax, xiaomi, qwen with the labels above (so `ensureCanonicalLlmProviders` surfaces them,
  gateway-gated on live onboard auth-choices).
- Web projection: return providers grouped by tier (keep curation/folding/status logic). Panel:
  render a section per tier with a heading; runtimes still fold under their parent within a tier.
- Keep the existing search box across all sections.

## Verification (MANDATORY — the reason this slice is being redone)
Extend `connections-drive.local.mjs` (real login) to CLICK the real interactions:
1. Open Manage on OpenAI → assert the dialog contains NO `input[name="apiKey"]` (OAuth), and shows a
   real model string (not "gpt-5.3-chat-latest" unless that is genuinely the configured model).
2. Assert the three section headings render (Frontier / Bundles / Best Subagents) and the named
   providers appear under the correct section (assert via data-provider-id within each section).
3. Disconnect wiring: assert clicking Disconnect does NOT navigate to a 404 (assert the response is
   not 404 and the page stays on /connections). Prefer a non-destructive check (intercept/observe
   the action response status); do not leave OpenAI disconnected.
Rebuild web+worker, run the drive, loop until the real interactions pass, THEN the
real-world-validate gate.
