# Ask Admin Opzava — pinned brain model + failover chain

Date: 2026-07-15
Origin: wayfinder map #210, ticket #223 (grilling). Feeds #224 (cost governance) and #220 (v1 spec).
Method: dual-model research — an independent Claude scout (web-enabled) and an independent Codex `gpt-5.6-sol` (high, read-only) scout, neither seeing the other's output — plus a Codex `gpt-5.6-sol` consensus adjudication of the primary split. Every OpenClaw-connectability claim host-verified against the repo. Final model choices are the user's decisions (recorded below).

## Decision

Ask Admin Opzava gets a **pinned** model (not the platform-elected default), expressed as the agent's own `agents.list[ask-admin-opzava].model = { primary, fallbacks: [...] }` — because in OpenClaw an agent primary is **strict** (no fallback) unless it carries its own non-empty `fallbacks` array (`docs/openclaw/concepts/model-failover.md:59`, host-verified).

## The chain (user-decided 2026-07-15)

| Tier | Model | Provider | Status |
|---|---|---|---|
| **PRIMARY** | `openai/gpt-5.6-sol` | OpenAI | Needs the 5.6 ref verified on a Codex-authorized account (repo docs predate 5.6 GA — see OQ1) |
| **T1 failover** | `anthropic/claude-opus-4-8` | Anthropic | Ref documented; auth-wiring only. Snappy (thinking-off default), $5/$25 |
| **T2 failover** | `zai/glm-5.2` | Z.AI | The only tier live+routable on the dev stack today |
| **T3 failover** | `moonshot/kimi-k2.6` | Moonshot | 4th distinct provider for outage resilience |

Four distinct providers → no single outage/rate-limit collapses the chain (OpenClaw walks the chain on auth/rate-limit/overload/timeout/billing failures; `model-failover.md`).

**Interim deployable primary:** until the Codex (OpenAI) and Anthropic auth paths are wired and the 5.6-sol ref is verified, **GLM-5.2 stands in as the interim primary** (it is the only authenticated multi-model provider today) with Kimi K2.6 as its fallback. Do NOT pin an unreachable primary.

### Why this chain

- **Primary = GPT-5.6-sol (user decision).** The user runs GPT-5.6-sol as their trusted daily-driver frontier agentic model; reliable tool/function-calling is the top criterion for an orchestrator and is sol's strength. Cost ~$5/$30; 1M ctx. The dual-model research + consensus had marginally preferred Opus 4.8 as primary (connectability certainty + snappier default), but the two frontier models are near-even (~$5 input each) and the user's preference is a fair tiebreaker on their own platform. Opus 4.8 sits directly behind as the already-documented T1 safety net.
- **Anthropic variant = Opus 4.8, NOT Fable 5** (both scouts agreed). Fable 5 has always-on `high` thinking → minutes-long turns that hurt an interactive chat, plus 2× cost ($10/$50) and 30-day-retention + refusal-handling burden. Opus 4.8: most-capable Opus tier, fast mode, thinking-off by default, $5/$25. Fable 5 is kept only as a manual hard-reasoning escalation, never the pinned brain.
- **Pool picks = GLM-5.2 + Kimi K2.6** (both scouts independently agreed — this is the "other 2" the user asked to research). GLM-5.2: top pool agentic score, cheap ($0.93/$3.00), only tier live today. Kimi K2.6: 4th distinct provider, open-weight multi-provider resilience, strong agentic + native multi-agent.
- **Cuts** (both scouts): Qwen3.7-Max (strong but pricier + less turnkey — best alternate); DeepSeek V4 (cheapest but documented peak-time 503s / low reliability — wrong trait for a *failover* tier); Xiaomi MiMo-V2-Pro (high tool-call accuracy but less production-proven); MiniMax M2.x (agentic quality a clear step down).

Full per-candidate benchmark/pricing detail (the scouts' web-sourced claims): `scratchpad/wf223-brain-model-claude.md` (Claude scout) — retained as the evidence appendix; the numbers there are web-sourced, not host-verified.

## Subagent model policy (agnostic — user directive)

Subagents Ask Admin spawns do **NOT** inherit the premium primary by default. The subagent model is the **cheapest capable routable model in the tenant's currently-connected provider set, resolved dynamically at provision time — never a hardcoded string** (honors the agnostic-ports invariant). Case-to-case:
- Multiple providers connected → cheapest capable routable tier (e.g. GLM-5.2 or a fast GPT tier).
- Only Anthropic connected → a cheaper Claude tier (Haiku/Sonnet) if routable, else the same model.
- Only OpenAI connected → a cheaper GPT tier (luna/terra) if routable, else the same model.
- **Per-role escalation:** a specific subagent role may be pinned to a premium model when its task demands it.

Rationale: fan-out multiplies token spend, and most delegated work (drafting a card, gathering evidence, a scoped edit) doesn't need frontier judgment. This is the biggest lever on cost governance → feeds #224.

## Connectability — host-verified facts

- **Pin/failover mechanism:** `agents.list[].model` is strict unless it carries its own `fallbacks` (`docs/openclaw/concepts/model-failover.md:59`). Configured-default fallbacks live on `agents.defaults.model`; a per-agent pin needs its own `fallbacks`.
- **All four providers have native OpenClaw plugins:** `docs/openclaw/providers/{anthropic,openai,zai,moonshot}.md` (also deepseek, minimax, qwen present).
- **Fork parity:** `mainframe/PATCHES.md` has NO model-selection/failover patch — the fork honors upstream fallback semantics unchanged. (Resolves the scout's fork-parity open question.)
- **Anthropic auth:** API key / Claude-CLI reuse / setup-token; `mainframe/PATCHES.md` rung 3 confirms the `setup-token` path (`runAnthropicSetupTokenNonInteractive` reads `ctx.opts.token`) and that Opzava connects providers by exec'ing `onboard --credential-stdin` inside the tenant Gateway container.
- **OpenAI auth:** Codex OAuth app-server harness (default for `openai/*`) or `OPENAI_API_KEY`.

## Implementation findings (→ #220 spec / the slice)

1. **The provisioner cannot serialize the chain today.** `apps/workers/src/provisioning/ask-admin-agent.ts`: `AskAdminAgentEntryInput.model` is typed `readonly model?: string` (line 289) and the base fragment `ASK_ADMIN_AGENT_CONFIG_FRAGMENT.agents.list[0]` has **no `model` field** (host-verified). `buildAskAdminAgentEntry` writes a string. To provision `{ primary, fallbacks: [...] }`, widen the input type + serialization to accept the object form. (Codex scout caught this; host-verified.)
2. **Subagent-model resolution must be dynamic/agnostic**, driven by the connected/routable set (`agents.defaults.models`), not a hardcoded string — per the user directive above.
3. **The chain is not operational today** (consensus verdict = WARNING on readiness, not composition): only Z.AI/GLM is authenticated. The slice must wire the OpenAI (Codex OAuth) and Anthropic (setup-token) auth paths, verify the 5.6-sol ref, and stage on GLM-5.2 as interim primary meanwhile.

## Open questions / deploy-time actions

1. **Verify `openai/gpt-5.6-sol` in OpenClaw's Codex catalog** — repo docs (2026-07-06) predate GPT-5.6 GA (2026-07-09) and only document `openai/gpt-5.5`. Run `openclaw models list --provider openai` on a Codex-authorized account before pinning 5.6-sol. If absent, `gpt-5.5` is the repo-proven interim OpenAI ref.
2. **Wire Anthropic auth** on the per-tenant Gateway (setup-token path not yet wired on this stack) before Opus 4.8 T1 is reachable.
3. **Smoke-test each non-GLM tier live** on the actual per-tenant Gateway (only GLM-5.2 proven today) — needs a credential + a real round-trip per provider.
