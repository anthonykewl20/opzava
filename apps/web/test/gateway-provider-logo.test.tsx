import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderLogo } from "../components/gateway/provider-logo";

describe("Gateway ProviderLogo", () => {
  it.each([
    ["openai", "openai"],
    ["anthropic", "anthropic"],
    ["deepseek", "deepseek"],
    ["glm", "zai"],
    ["zai", "zai"],
    ["qwen", "qwen"],
    ["alibaba", "qwen"],
    ["google", "google"],
    ["opencode", "opencode-go"],
  ] as const)("maps %s to the %s brand emblem", (providerId, expectedBrand) => {
    const html = renderToStaticMarkup(
      createElement(ProviderLogo, { providerId, label: providerId }),
    );

    expect(html).toContain(`data-provider-brand="${expectedBrand}"`);
    expect(html).toContain('data-provider-icon="brand"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("uses a deterministic monogram fallback for unknown providers", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderLogo, { providerId: "nova-runtime", label: "Nova Runtime" }),
    );

    expect(html).toContain('data-provider-brand="unknown"');
    expect(html).toContain('data-provider-icon="monogram"');
    expect(html).toContain(">N<");
  });
});
