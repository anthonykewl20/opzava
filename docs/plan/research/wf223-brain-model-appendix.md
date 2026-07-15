# WF-223 — "Ask Admin Opzava" Lead-Orchestrator brain: model pin + failover chain

**Date:** 2026-07-15
**Author:** Claude (research agent)
**Repo:** /home/soultransit/devtony/opzava
**Scope:** Pick the model pinned to the ADMIN-only "Ask Admin Opzava" Lead-Orchestrator chat agent (its `model` override in the per-tenant OpenClaw Gateway's `agents.list` entry) + a 3-tier failover chain.

---

## Decision & criteria

**Decision:** Pin one primary model to the "Ask Admin Opzava" agent, plus a 3-tier failover chain that spans different providers. This is an interactive ADMIN chat orchestrator whose job is PM reasoning ("sprint progress?", "should X be a sprint?"), planning/prioritization judgment, writing Dev Board task cards and dev/sprint/stage **reports**, platform-state Q&A, and **reliable agentic tool/function-calling** under a locked-down tool policy (`opzava_tasks_*`, memory search, delegation). NOT primarily a coding agent.

**Criteria, in priority order:**
1. **Quality for the PM-orchestrator role** — agentic tool/function-calling reliability (MOST important: a model that mis-calls tools is useless as an orchestrator), reasoning/planning judgment, structured report/card writing, instruction-following, long context.
2. **OpenClaw gateway connectability (HARD GATE for failover)** — can the Gateway actually route to it, via which provider plugin + auth path. A model OpenClaw can't connect to cannot be a failover tier.
3. **Cost** — approx per-1M in/out; an orchestrator spawns subagents and writes reports, so cost compounds.
4. **Latency/throughput** — interactive chat; minutes-long turns hurt UX.
5. **Provider diversity for failover** — chain must span different providers so one outage/rate-limit doesn't kill all tiers.

**How the pin works (load-bearing mechanism):** In OpenClaw, `agents.list[].model` (a per-agent pin) is **strict** — no fallback — **unless that agent's model object carries its own `fallbacks` array** (`docs/openclaw/concepts/model-failover.md:61-62`). So the failover chain for this one agent is expressed as:

```json5
agents: {
  list: [{
    id: "ask-admin",              // the Lead Orchestrator
    model: {
      primary:  "anthropic/claude-opus-4-8",
      fallbacks: ["openai/gpt-5.6-terra", "zai/glm-5.2", "moonshot/kimi-k2.6"]
    }
  }]
}
```

A non-empty `fallbacks` opts this pinned agent into the failover walk; `fallbacks: []` would make it strict. Auto-fallback is sticky with a 5-min primary re-probe and emits a user-visible "Model Fallback" notice on each state change (`model-failover.md:63,68,91-105`).

---

## Anchor variant resolutions

### Anchor B (Anthropic): Opus 4.8 vs Fable 5 → **Claude Opus 4.8**
- **Opus 4.8** (`anthropic/claude-opus-4-8`): most-capable Opus tier, SOTA long-horizon agentic/knowledge/**memory**, **fast mode**, 1M ctx / 128K out, **$5/$25** (ground truth). In OpenClaw: thinking **off by default** (good for snappy chat), `/think high|xhigh|max` opts into adaptive effort; documented 1M-context ref (`docs/openclaw/providers/anthropic.md:71,177-184,355-356`).
- **Fable 5** (`anthropic/claude-fable-5`): Anthropic's most capable overall, but **always-on adaptive thinking defaulting to `high`** (`anthropic.md:177-182`) → **minutes-long turns** that hurt an interactive chat, **$10/$50** (2x in / 2x out vs Opus), and needs 30-day retention + refusal-handling operational burden.
- **Verdict: Opus 4.8 wins for THIS role.** Memory + agentic tool-use SOTA is exactly the orchestrator's strength; fast mode fits chat; half the cost; no minutes-long turns; no extra retention/refusal wiring. Fable 5's "most capable overall" edge is dominated by its latency and cost for an interactive PM chat. Keep Fable 5 only as a deliberate "hard-reasoning escalation" the admin can invoke manually, not the pinned brain.

### Anchor A (OpenAI): GPT-5.5 vs GPT-5.6, and which tier → **GPT-5.6 Terra** (Sol = premium alternate)
- GPT-5.6 family went **GA 2026-07-09**, **1M ctx on all three tiers**; **Sol $5/$30, Terra $2.50/$15, Luna $1/$6** ([aipricing.guru](https://www.aipricing.guru/openai-pricing/), [benchlm.ai](https://benchlm.ai/openai/api-pricing), [finout.io](https://www.finout.io/blog/gpt-5.6-pricing-2026-sol-terra-and-luna-tiers-explained)). Sol matches GPT-5.5's $5/$30 while adding the 1M window; **Terra is positioned as competitive with GPT-5.5 on quality at ~half the cost** ([eesel.ai](https://www.eesel.ai/blog/gpt-5-6-pricing), [lushbinary](https://lushbinary.com/blog/gpt-5-6-terra-vs-gpt-5-5-cost-performance-comparison/)).
- **Tier fit:** Sol = frontier agentic brain (max quality, priciest). Terra = balanced, near-frontier quality at half Sol's cost. Luna = fast/cheap, a step down in judgment — too light to be the safety net when the Opus primary is down. For a **failover tier** that fires only when the primary is out, you want near-parity quality without paying frontier prices on every compounding subagent call → **Terra**. If the org wants zero-compromise parity and can absorb $5/$30, swap Terra→**Sol**.
- **Verdict: GPT-5.6 Terra** (over GPT-5.5 — newer, 1M ctx, cheaper tiering; over Luna — too light; Sol is the premium upgrade).

---

## Per-candidate assessment

### Claude Opus 4.8 — PRIMARY (Anthropic)
- **Quality:** SOTA long-horizon agentic tool-calling + memory + strong instruction-following — the ideal PM-orchestrator brain. Anthropic models are the reliability benchmark for tool-calling. Ground-truth: 1M ctx / 128K out.
- **Connectability (repo-verified):** `anthropic/claude-opus-4-8`, provider `anthropic`, auth `ANTHROPIC_API_KEY` **or** Claude-CLI reuse (`claude -p`, now sanctioned) **or** Anthropic setup-token (`model-providers.md:110-131`, `anthropic.md:71,314-356`). **On THIS dev stack the setup-token path is "not yet wired"** (task context) — must wire an auth path before go-live. **OPEN QUESTION #2.**
- **Cost:** $5 / $25. **Latency:** fast mode + thinking-off-by-default = good chat UX. **Provider:** Anthropic.

### GPT-5.6 Terra — FAILOVER TIER 1 (OpenAI)
- **Quality:** frontier-adjacent agentic + reasoning at half Sol's cost; 1M ctx; strong structured output. Solid near-parity brain when Opus is down.
- **Connectability (repo-verified mechanism, model-ref UNVERIFIED):** provider `openai` via native **Codex OAuth app-server harness** (default for `openai/*`) or direct `OPENAI_API_KEY` (`model-providers.md:29-42,87-163`). **The repo docs (dated Jul 6) predate 5.6 GA (Jul 9) and only document `openai/gpt-5.5`** — the exact 5.6 tier refs (`openai/gpt-5.6-terra` / `-sol`) are **not confirmed in OpenClaw's Codex catalog**. Task context: Codex OAuth is "mechanism-ready but no account authorized yet." **OPEN QUESTION #1** — run `openclaw models list --provider openai` on a Codex-authorized account to confirm the 5.6 tier IDs. Auth path = ChatGPT/Codex OAuth (or OpenAI API key).
- **Cost:** $2.50 / $15 (Sol $5/$30). **Latency:** interactive-grade. **Provider:** OpenAI (diversity vs Anthropic ✓).

### Z.AI GLM-5.2 — FAILOVER TIER 2 (Z.AI) — the only tier LIVE today
- **Quality:** **top agentic index of the pool (74.9)**, 1M ctx, tool use + function calling; SWE-bench Pro **62.1 (beats GPT-5.5's 58.6)**, MCP-Atlas tool-use **77.0 (> GPT-5.5 75.3)**, FrontierSWE long-horizon **74.4 — near-tie with Claude Opus 4.8 (75.1)** ([designforonline GLM-5.2](https://designforonline.com/ai-models/z-ai-glm-5-2/), [venturebeat](https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost)). Excellent tool-use judgment for an orchestrator.
- **Connectability (repo-verified, LIVE):** `zai/glm-5.2` (Coding-Plan default, 1M ctx), provider `zai`, auth `ZAI_API_KEY` Bearer, bundled official plugin, turnkey onboarding (`docs/openclaw/providers/zai.md:17-23,100,117,142`; `model-providers.md:265-272`). **Task context: Z.AI/GLM is the ONLY live+routable multi-model provider on the dev stack today** → the single failover tier proven to work right now.
- **Cost:** **$0.93 / $3.00** (cheap). **Latency:** interactive-grade. **Provider:** Z.AI (diversity ✓).

### Moonshot Kimi K2.6 — FAILOVER TIER 3 (Moonshot)
- **Quality:** strong agentic — SWE-Bench Pro **58.6 (ties GPT-5.5)**, leads Humanity's-Last-Exam-with-tools at **54.0**, native **multi-agent orchestration ("Agent Swarm": 300 sub-agents, 12+ hr autonomous)** — directly relevant to a delegating orchestrator ([llm-stats](https://llm-stats.com/models/kimi-k2.6), [miraflow](https://miraflow.ai/blog/kimi-k2-6-explained-moonshot-ai-open-source-model-ties-gpt-5-5-coding)). Open-weight → available across 9+ providers, which **improves failover resilience** (not tied to one endpoint's uptime).
- **Connectability (repo-verified):** `moonshot/kimi-k2.6`, provider `moonshot`, auth `MOONSHOT_API_KEY`, **bundled official plugin** (`model-providers.md:291,334-354`). Also reachable via Vercel AI Gateway / Ollama Cloud / Volcengine / BytePlus as alternates. Not yet proven live on this stack — needs a key + smoke test (**OPEN QUESTION #3**).
- **Cost:** **$0.95 / $4.00** direct ($1.15–2.15 blended across providers). **Latency:** interactive-grade. **Provider:** Moonshot (diversity ✓ — 4th distinct provider).

### Pool candidates CUT

**Qwen3.7-Max (Alibaba) — strong, cut on price + turnkey-ness (close 5th / alternate):** agentic index 72.7, 1M ctx, 35-hr autonomous demo w/ 1,158 tool calls, top-15 globally ([datacamp](https://www.datacamp.com/blog/qwen3-7-max), [designforonline](https://designforonline.com/ai-models/alibaba-qwen3-7-max/)). BUT **$1.25/$3.75 promo (list $2.50/$7.50)** — pricier than GLM and Kimi — and OpenClaw's default catalog ref is `qwen-oauth/qwen3.5-plus`; 3.7-Max would likely need an explicit `models.providers` entry (less turnkey than GLM/Kimi). Loses to GLM on price+live-status and to Kimi on provider-diversity value. Keep as a bench alternate. Connectable via `qwen-oauth` (`QWEN_API_KEY`) or Alibaba DashScope (`model-providers.md:296`).

**DeepSeek V4 (DeepSeek) — cheapest + native support, but cut on RELIABILITY:** V3.2 was first to integrate thinking into tool-use with a Thinking-Retention Mechanism for tool-calling; V4 flash/pro now default; **$0.28/$0.42** ([api-docs.deepseek.com](https://api-docs.deepseek.com/news/news251201/), [haimaker](https://haimaker.ai/blog/best-deepseek-models-for-openclaw/)). Natively supported: `deepseek/deepseek-v4-flash|v4-pro`, auth `DEEPSEEK_API_KEY` (`docs/openclaw/providers/deepseek.md:14,82-84`). **Disqualifier for a failover tier:** documented **API reliability problems — 503s at peak (≈9am-6pm Beijing), shared infra "noticeably less reliable than Anthropic, OpenAI, or Google."** A failover tier's whole job is to be UP when the primary is down; a low-reliability endpoint is the wrong safety net. Fine as a cost-optimized bulk-analysis lane elsewhere, not the orchestrator's brain.

**Xiaomi MiMo-V2-Pro (Xiaomi) — great tool-calling, cut on standing/proof (bench alternate):** 1T-MoE/42B-active, 1M ctx, **tool-calling accuracy 97.0% in thinking mode**, AA Intelligence Index rank ~8th worldwide, general-agent (ClawEval) approaching Opus 4.6 ([mimo.xiaomi.com](https://mimo.xiaomi.com/mimo-v2-pro), [a2aprotocol](https://a2aprotocol.ai/insights/mimo-v2-series-guide-2026)). Connectable: `xiaomi`/`xiaomi-token-plan`, `XIAOMI_API_KEY` (`model-providers.md:302`). Strong on paper but less production-proven and lower overall standing than GLM/Qwen; keep as a bench alternate to watch.

**MiniMax M2.x (MiniMax) — cheapest agentic, cut on quality tier:** M2 agentic index 56.3 (below GLM 74.9 / Qwen 72.7 / Kimi), 204K ctx, **$0.255/$1.00** — great price/perf but a clear step down in orchestration judgment; M2.5/M2.7 newer but still mid-tier ([pricepertoken](https://pricepertoken.com/pricing-page/model/minimax-minimax-m2), [designforonline](https://designforonline.com/ai-models/minimax-minimax-m2/)). Connectable via `minimax`/`minimax-portal` (`model-providers.md:289,500-522`). Best as a cheap high-volume lane, not the brain's safety net.

---

## Comparison matrix (candidates × criteria)

| Model (provider) | Agentic tool-calling (C1a, top) | Reasoning / report-writing (C1b) | Long ctx | OpenClaw connectability + auth (C2, HARD GATE) | Cost in/out $/1M (C3) | Chat latency (C4) | Role verdict |
|---|---|---|---|---|---|---|---|
| **Opus 4.8** (Anthropic) | SOTA — reliability benchmark | SOTA + memory | 1M | `anthropic/claude-opus-4-8`; API key / Claude-CLI / setup-token. **Not wired on this stack yet (OQ#2)** | 5 / 25 | Fast mode, thinking-off default ✓ | **PRIMARY** |
| **GPT-5.6 Terra** (OpenAI) | Frontier-adjacent | Strong | 1M | `openai/gpt-5.6-terra` via Codex OAuth harness. **5.6 ref unverified in repo (OQ#1); Codex acct not authorized** | 2.50 / 15 (Sol 5/30) | Interactive ✓ | **FAILOVER T1** |
| **GLM-5.2** (Z.AI) | Top pool (idx 74.9; MCP-Atlas 77.0) | Long-horizon near-Opus (FrontierSWE 74.4 vs 75.1) | 1M | `zai/glm-5.2`; `ZAI_API_KEY`; bundled plugin. **LIVE+routable on stack today ✓** | 0.93 / 3.00 | Interactive ✓ | **FAILOVER T2** |
| **Kimi K2.6** (Moonshot) | Strong (SWE-Pro 58.6=GPT-5.5; HLE-tools 54.0); native multi-agent | Strong; open-weight multi-provider | 256K+ | `moonshot/kimi-k2.6`; `MOONSHOT_API_KEY`; bundled plugin. Not yet smoke-tested (OQ#3) | 0.95 / 4.00 | Interactive ✓ | **FAILOVER T3** |
| Qwen3.7-Max (Alibaba) | Strong (idx 72.7) | Strong | 1M | `qwen-oauth` / Alibaba DashScope; `QWEN_API_KEY`. 3.7-Max likely needs explicit entry | 1.25 / 3.75 promo | Interactive | CUT — pricier, less turnkey (alt) |
| DeepSeek V4 (DeepSeek) | Good (thinking-in-tool-use) | Good | 1M | `deepseek/deepseek-v4-*`; `DEEPSEEK_API_KEY`; native | 0.28 / 0.42 | **503s at peak; low reliability** | CUT — unreliable for a safety net |
| Xiaomi MiMo-V2-Pro | 97% tool-call acc (thinking) | Approaching Opus 4.6 | 1M | `xiaomi`/`xiaomi-token-plan`; `XIAOMI_API_KEY` | ~low | Interactive | CUT — less proven (alt) |
| MiniMax M2.x (MiniMax) | Mid (idx 56.3) | Mid | 204K | `minimax`/`minimax-portal`; OAuth or API key | 0.255 / 1.00 | Interactive | CUT — quality step down |
| Fable 5 (Anthropic) | SOTA overall | SOTA overall | 1M | `anthropic/claude-fable-5` (same auth as Opus) | 10 / 50 | **Always-on thinking → minutes-long turns ✗** | Not pinned — manual escalation only |

---

## FINAL RANKED RECOMMENDATION

**Primary pin → `anthropic/claude-opus-4-8`** (Anthropic Opus 4.8)
- Why: best quality for THIS role — SOTA long-horizon agentic tool-calling + memory + instruction-following, fast mode + thinking-off-by-default for snappy chat, 1M ctx, $5/$25.
- Connectability: documented ref; auth via `ANTHROPIC_API_KEY` / Claude-CLI reuse (`claude -p`) / Anthropic setup-token. **Action before go-live:** wire an auth path on the per-tenant Gateway (setup-token path "not yet wired" on this stack — **OQ#2**).

**Failover Tier 1 → `openai/gpt-5.6-terra`** (OpenAI GPT-5.6 Terra; Sol if parity budget exists)
- Why: different provider (OpenAI), frontier-adjacent agentic/reasoning at half Sol's cost, 1M ctx.
- Connectability: Codex OAuth app-server harness (or direct `OPENAI_API_KEY`). **Action:** authorize a Codex account and confirm the 5.6 tier ref via `openclaw models list --provider openai` — repo docs predate 5.6 GA and only list `openai/gpt-5.5` (**OQ#1**).

**Failover Tier 2 → `zai/glm-5.2`** (Z.AI GLM-5.2)
- Why: different provider (Z.AI), **top pool agentic index (74.9)**, long-horizon near-Opus, cheap ($0.93/$3.00), and **the only tier live+routable on the dev stack today** — the dependable safety net.
- Connectability: `ZAI_API_KEY`, bundled plugin, turnkey. **Verified live.**

**Failover Tier 3 → `moonshot/kimi-k2.6`** (Moonshot Kimi K2.6)
- Why: 4th distinct provider (Moonshot), strong agentic (ties GPT-5.5 on SWE-Bench Pro; leads HLE-with-tools), native multi-agent orchestration, open-weight/multi-provider availability adds resilience, cheap ($0.95/$4.00).
- Connectability: `MOONSHOT_API_KEY`, bundled plugin. **Action:** add key + smoke test (**OQ#3**).

**Provider diversity check:** Anthropic → OpenAI → Z.AI → Moonshot = 4 distinct providers, so no single outage or rate-limit collapses the chain. ✓

**Config shape** (per `model-failover.md:61-62` — non-empty `fallbacks` opts the pinned agent into failover):
```json5
agents: { list: [{
  id: "ask-admin",
  model: {
    primary:  "anthropic/claude-opus-4-8",
    fallbacks: ["openai/gpt-5.6-terra", "zai/glm-5.2", "moonshot/kimi-k2.6"]
  }
}]}
```

**Bench alternates (not in chain):** Qwen3.7-Max (if budget for a 5th premium tier), Xiaomi MiMo-V2-Pro (watch — very high tool-call accuracy). Fable 5 = manual hard-reasoning escalation only, never the pinned chat brain.

---

## Open questions (connectability claims I could NOT fully verify from the repo)

1. **GPT-5.6 tier refs in OpenClaw's Codex catalog.** Repo docs (dated 2026-07-06) predate GPT-5.6 GA (2026-07-09) and only document `openai/gpt-5.5`. The exact refs `openai/gpt-5.6-terra` / `openai/gpt-5.6-sol` are **not confirmed** present in OpenClaw's Codex app-server catalog. Verify with `openclaw models list --provider openai` on a Codex-authorized account. Codex OAuth mechanism is ready but no account authorized on this stack yet.
2. **Opus 4.8 auth wiring on THIS tenant Gateway.** The ref and three auth paths (API key / Claude-CLI reuse / setup-token) are documented, but task context says the setup-token path is "not yet wired" on the dev stack. Decide and wire which auth path the per-tenant Gateway uses before go-live.
3. **Kimi K2.6 (and any non-Z.AI tier) not yet proven live on this stack.** GLM-5.2 is the only tier verified live+routable today. Moonshot/Kimi (and GPT via Codex) are "bundled/mechanism-ready" per docs but need an auth credential + a smoke test on the actual per-tenant Gateway.
4. **Mainframe fork parity.** Confirm the per-tenant Gateway (Opzava's `mainframe/` OpenClaw fork) honors `agents.list[].model.fallbacks` identically to upstream — check `mainframe/PATCHES.md` for any patch to the model-selection / failover path before relying on the exact config shape above.

## Sources
- OpenClaw connectability (repo): `docs/openclaw/concepts/model-providers.md`, `docs/openclaw/concepts/model-failover.md` (esp. lines 61-68), `docs/openclaw/providers/anthropic.md`, `docs/openclaw/providers/zai.md`, `docs/openclaw/providers/deepseek.md`, `docs/openclaw/providers/moonshot.md`.
- GPT-5.6: aipricing.guru, benchlm.ai, finout.io, eesel.ai, lushbinary.com (pricing/GA/tier positioning).
- GLM-5.2: designforonline.com, venturebeat.com, ufukozen.com (agentic index, benchmarks, pricing).
- Kimi K2.6: llm-stats.com, miraflow.ai, deepinfra.com (SWE-Bench Pro, HLE-with-tools, Agent Swarm, pricing).
- Qwen3.7-Max: datacamp.com, designforonline.com, tokenmix.ai (agentic index, pricing).
- DeepSeek V3.2/V4: api-docs.deepseek.com, haimaker.ai, nxcode.io (tool-use, reliability, pricing).
- Xiaomi MiMo-V2-Pro: mimo.xiaomi.com, a2aprotocol.ai, computertech.co (tool-call accuracy, standing).
- MiniMax M2.x: pricepertoken.com, designforonline.com (agentic index, pricing).
