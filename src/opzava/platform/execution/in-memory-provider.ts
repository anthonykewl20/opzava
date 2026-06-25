import type { ProviderInvokeInput, ProviderPort, ProviderResult } from './contracts'

/**
 * In-memory `ProviderPort` — the test double (and the seam's first adapter). The 4 production
 * adapters (gateway / direct-anthropic / openai-compatible / claude-cli) are the follow-on; they
 * satisfy the same interface, so the executor's tests never need a real provider.
 */
export function makeInMemoryProvider(
  respond: (input: ProviderInvokeInput) => ProviderResult | Promise<ProviderResult>,
  options: { available?: boolean } = {},
): ProviderPort {
  return {
    invoke: (input) => Promise.resolve(respond(input)),
    isAvailable: () => options.available ?? true,
  }
}
