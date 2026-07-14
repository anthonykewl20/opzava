import type { ProviderCategory } from "./connections-provisioning.js";

/**
 * Canonical Model-Provider taxonomy (Slice 3.7 view #1 "Models & Providers").
 *
 * This is a CLASSIFICATION overlay, not a provider catalog: providers still come from the LIVE
 * OpenClaw gateway (`models.list` + `onboard --help` auth-choices). This module only answers, per
 * provider id the gateway advertises:
 *   - is it a canonical LLM provider, or a non-LLM (speech/image/video) provider to hide?
 *   - is it a CLI runtime that folds UNDER a parent LLM provider (Codex→OpenAI, Claude CLI→
 *     Anthropic, Gemini CLI→Google)?
 *   - is it an auth/plan variant that folds under a parent (qwen-oauth→qwen)?
 *
 * Grounded in `docs/openclaw/providers/*` + mainframe `src/agents/auth-profiles/external-cli-sync.ts`.
 * Pure data (string ids only) so both the provisioning-worker ACL and the web projection share it
 * with zero OpenClaw types leaking anywhere.
 */

/** CLI runtimes that fold under a parent LLM provider. Never rendered as their own top-level row. */
const RUNTIME_PARENTS: Readonly<Record<string, { parentId: string; runtimeLabel: string }>> = {
  "claude-cli": { parentId: "anthropic", runtimeLabel: "Claude CLI" },
  codex: { parentId: "openai", runtimeLabel: "Codex CLI" },
  "codex-cli": { parentId: "openai", runtimeLabel: "Codex CLI" },
  "codex-app-server": { parentId: "openai", runtimeLabel: "Codex CLI" },
  "google-gemini-cli": { parentId: "google", runtimeLabel: "Gemini CLI" },
  "gemini-cli": { parentId: "google", runtimeLabel: "Gemini CLI" },
};

/** Non-runtime provider ids that are auth/plan variants of a parent (folded, no runtime label). */
const PROVIDER_PARENT_ALIASES: Readonly<Record<string, string>> = {
  "claude-max-api-proxy": "anthropic",
  "moonshot-ai": "moonshot",
  "qwen-oauth": "qwen",
  "anthropic-vertex": "anthropic",
  "gemini-vertex": "google",
  "vertex-gemini": "google",
};

const PROVIDER_TIER_IDS = [
  "frontier",
  "bundles",
  "best-subagents",
  "other",
] as const;

export type ProviderTier = (typeof PROVIDER_TIER_IDS)[number];

const PROVIDER_TIER_LABELS: Readonly<Record<ProviderTier, string>> = {
  frontier: "Frontier",
  bundles: "Bundles",
  "best-subagents": "Best Subagents",
  other: "Other providers",
};

const PROVIDER_TIERS: Readonly<Record<string, Exclude<ProviderTier, "other">>> = {
  openai: "frontier",
  anthropic: "frontier",
  "opencode-go": "bundles",
  openrouter: "bundles",
  qwen: "bundles",
  "cloudflare-ai-gateway": "bundles",
  zai: "best-subagents",
  moonshot: "best-subagents",
  minimax: "best-subagents",
  xiaomi: "best-subagents",
};

/**
 * Non-LLM providers (speech-to-text, TTS, image/video/avatar generation) — excluded from the
 * Models & Providers surface, which is LLM-only. Deliberately conservative: only ids that are
 * unambiguously non-LLM. Multi-modal LLM providers (minimax, mistral) stay LLM.
 */
const NON_LLM_PROVIDER_IDS: ReadonlySet<string> = new Set([
  "azure-speech",
  "deepgram",
  "elevenlabs",
  "senseaudio",
  "comfy",
  "fal",
  "runway",
  "pixverse",
  "vydra",
  "gradium",
  "inworld",
]);

/** Nicer display labels for providers the gateway advertises with raw/lowercase ids. */
const CANONICAL_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  zai: "Z.AI (GLM)",
  "opencode-go": "OpenCode Go",
  openrouter: "OpenRouter",
  moonshot: "Moonshot (Kimi)",
  qwen: "Alibaba Model Studio",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  deepseek: "DeepSeek",
  groq: "Groq",
  xai: "xAI",
  mistral: "Mistral",
  cerebras: "Cerebras",
  together: "Together AI",
  fireworks: "Fireworks",
  perplexity: "Perplexity",
  minimax: "MiniMax",
  xiaomi: "Xiaomi MiMo",
};

/**
 * Canonical LLM provider roots the Models & Providers surface ENSURES are discoverable *when the
 * live gateway can back them* (i.e. its `onboard --auth-choice` list advertises a matching choice).
 * This is NOT a static catalog: a provider here only renders if the live gateway advertises an auth
 * choice for it, so presence stays gateway-driven while the well-known connect targets never get
 * lost just because they have no bundled models yet (zai/openrouter have no models until connected).
 */
const CANONICAL_LLM_PROVIDER_IDS: readonly string[] = Object.keys(CANONICAL_PROVIDER_LABELS);

export function listProviderTierIds(): readonly ProviderTier[] {
  return Object.freeze([...PROVIDER_TIER_IDS]);
}

export function providerTierLabel(id: ProviderTier): string {
  return PROVIDER_TIER_LABELS[id];
}

export function listCanonicalLlmProviderIds(): readonly string[] {
  return Object.freeze([...CANONICAL_LLM_PROVIDER_IDS]);
}

export function canonicalProviderLabel(id: string): string {
  return CANONICAL_PROVIDER_LABELS[id] ?? id;
}

export interface ModelProviderClassification {
  readonly category: ProviderCategory;
  /** Canonical parent id this folds under; null when this IS a top-level LLM parent. */
  readonly parentId: string | null;
  /** Runtime display label when this is a folded CLI runtime; null otherwise. */
  readonly runtimeLabel: string | null;
  /** Preferred display label when the gateway id is raw; null to keep the gateway-provided label. */
  readonly canonicalLabel: string | null;
}

/**
 * Classify a live provider id. Default is LLM parent (so a provider the gateway advertises that we
 * do not explicitly know still surfaces, honoring "driven by the live catalog, no invented list").
 * Only the explicit non-LLM denylist and runtime/alias maps override that default.
 */
export function classifyModelProvider(providerId: string): ModelProviderClassification {
  const id = providerId.trim().toLowerCase();

  const runtime = RUNTIME_PARENTS[id];
  if (runtime) {
    return {
      category: "llm",
      parentId: runtime.parentId,
      runtimeLabel: runtime.runtimeLabel,
      canonicalLabel: null,
    };
  }

  const aliasParent = PROVIDER_PARENT_ALIASES[id];
  if (aliasParent) {
    return { category: "llm", parentId: aliasParent, runtimeLabel: null, canonicalLabel: null };
  }

  if (NON_LLM_PROVIDER_IDS.has(id)) {
    return { category: "non-llm", parentId: null, runtimeLabel: null, canonicalLabel: null };
  }

  return {
    category: "llm",
    parentId: null,
    runtimeLabel: null,
    canonicalLabel: CANONICAL_PROVIDER_LABELS[id] ?? null,
  };
}

/** True when the provider should render as its own top-level row (LLM parent, not a folded child). */
export function isTopLevelLlmProvider(providerId: string): boolean {
  const c = classifyModelProvider(providerId);
  return c.category === "llm" && c.parentId === null;
}

export function providerTier(providerId: string): ProviderTier {
  const id = providerId.trim().toLowerCase();
  const parentId = classifyModelProvider(id).parentId;
  return PROVIDER_TIERS[parentId ?? id] ?? "other";
}
