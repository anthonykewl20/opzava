// The connections provider card's element type and tier wrapper, named once so a future port cannot
// rot every drive in silence.
//
// #181 ported /connections/providers from an HTML <table> to a card grid: each provider renders as
// `article[data-provider-id="<id>"]` (provider-card.tsx) inside `[data-provider-tier="<tier>"]`
// (provider-grid.tsx). Two drives that had each hardcoded the old `tr` + text-match selector stayed
// green while pointing at nothing, because the miss was swallowed into an empty string — the literal
// rot this module exists to prevent. New and fixed drives import these instead, so the element type
// lives in one place and a change breaks loudly here first.

/**
 * Structural selector for one provider's card. `id` is the provider id (e.g. "zai", "moonshot"),
 * NOT the display label — resolve the label to the id at the call site, never text-match the DOM.
 */
export const providerCard = (id) => `article[data-provider-id="${id}"]`;

/**
 * Structural selector for one tier's card list (e.g. "best-subagents", "bundles"). Pair it with
 * providerCard when a drive must scope a lookup to a single tier.
 */
export const providerTier = (tier) => `[data-provider-tier="${tier}"]`;
