import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderBrandIcon } from "../components/connections/provider-brand-icon";

const svgBrands = [
  "anthropic",
  "openai",
  "google",
  "zai",
  "opencode-go",
  "openrouter",
  "moonshot",
  "qwen",
  "cloudflare-ai-gateway",
  "deepseek",
  "mistral",
  "perplexity",
  "minimax",
  "xiaomi",
] as const;

const knownMonograms = ["groq", "xai", "cerebras", "together", "fireworks"] as const;

function render(providerId: string, label = providerId): string {
  return renderToStaticMarkup(createElement(ProviderBrandIcon, { providerId, label }));
}

describe("ProviderBrandIcon", () => {
  it.each(svgBrands)("renders the licensed local %s brand mark", (providerId) => {
    const html = render(providerId);

    expect(html).toContain('data-provider-icon="brand"');
    expect(html).toContain(`data-provider-brand="${providerId}"`);
    expect(html).toContain("<svg");
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("text-foreground");
    expect(html).toContain("color-mix(in srgb, var(--provider-brand) 12%, var(--muted))");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).toContain(
      providerId === "openai"
        ? 'data-provider-brand-source="mainframe-docs-sponsor"'
        : 'data-provider-brand-source="simple-icons-16.26.0"',
    );
  });

  it.each([
    ["groq", "G"],
    ["xai", "X"],
    ["cerebras", "C"],
    ["together", "T"],
    ["fireworks", "F"],
  ] as const)("renders the deterministic %s monogram", (providerId, monogram) => {
    const html = render(providerId);

    expect(html).toContain('data-provider-icon="monogram"');
    expect(html).toContain(`data-provider-brand="${providerId}"`);
    expect(html).toContain('data-provider-brand-source="monogram"');
    expect(html).toContain(`>${monogram}</span>`);
    expect(html).not.toContain("<svg");
  });

  it.each([
    [" claude-cli ", "anthropic"],
    ["ANTHROPIC-VERTEX", "anthropic"],
    ["codex-app-server", "openai"],
    [" GOOGLE-GEMINI-CLI ", "google"],
    ["qwen-oauth", "qwen"],
    ["Alibaba", "qwen"],
    [" modelstudio ", "qwen"],
    ["DASHSCOPE", "qwen"],
  ] as const)("normalizes %s to %s", (providerId, canonical) => {
    expect(render(providerId)).toContain(`data-provider-brand="${canonical}"`);
  });

  it("uses deterministic unknown-provider fallbacks", () => {
    const labelFallback = render("future-provider", "Beta Models");
    const idFallback = render("123-provider", "");
    const emptyFallback = render("", "");

    expect(labelFallback).toContain('data-provider-brand="unknown"');
    expect(labelFallback).toContain('data-provider-brand-source="fallback"');
    expect(labelFallback).toContain(">B</span>");
    expect(idFallback).toContain(">1</span>");
    expect(emptyFallback).toContain(">?</span>");
  });

  it("covers exactly the 19 canonical taxonomy roots", () => {
    expect([...svgBrands, ...knownMonograms]).toHaveLength(19);
    expect(new Set([...svgBrands, ...knownMonograms]).size).toBe(19);
  });

  it("keeps original brand tint metadata separate from the semantic glyph color", () => {
    expect(render("anthropic")).toContain("--provider-brand:#191919");
    expect(render("zai")).toContain("--provider-brand:#2D2D2D");
    expect(render("opencode-go")).toContain("--provider-brand:#000000");
    expect(render("moonshot")).toContain("--provider-brand:#000000");
    expect(render("anthropic")).not.toContain("text-[#191919]");
  });
});
