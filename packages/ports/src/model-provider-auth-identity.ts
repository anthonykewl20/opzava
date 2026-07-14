/**
 * Provider ids that share one Gateway authentication identity.
 *
 * Keep this table in parity with the bundled Mainframe plugins' `providerAuthAliases` manifests.
 * This is deliberately separate from the Connections catalog taxonomy: two provider ids can share
 * credentials without being the same provider card (for example `minimax-portal` and `minimax`).
 */
export const MODEL_PROVIDER_AUTH_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "byteplus-plan": "byteplus",
  "gmi-cloud": "gmi",
  gmicloud: "gmi",
  "minimax-cn": "minimax",
  "minimax-portal-cn": "minimax-portal",
  "moonshot-ai": "moonshot",
  moonshotai: "moonshot",
  "novita-ai": "novita",
  novitaai: "novita",
  "qwen-cli": "qwen-oauth",
  "qwen-portal": "qwen-oauth",
  "volcengine-plan": "volcengine",
});

export function canonicalModelProviderAuthId(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  return MODEL_PROVIDER_AUTH_ALIASES[normalized] ?? normalized;
}
