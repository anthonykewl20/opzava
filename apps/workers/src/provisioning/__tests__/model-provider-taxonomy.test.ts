import { existsSync, readFileSync, readdirSync } from "node:fs";

import {
  canonicalModelProviderAuthId,
  classifyModelProvider,
  MODEL_PROVIDER_AUTH_ALIASES,
} from "@opzava/ports";
import { describe, expect, it } from "vitest";

const mainframeProviderAuthAliasParity = [
  ["byteplus-plan", "byteplus"],
  ["gmi-cloud", "gmi"],
  ["gmicloud", "gmi"],
  ["minimax-cn", "minimax"],
  ["minimax-portal-cn", "minimax-portal"],
  ["moonshot-ai", "moonshot"],
  ["moonshotai", "moonshot"],
  ["novita-ai", "novita"],
  ["novitaai", "novita"],
  ["volcengine-plan", "volcengine"],
  ["x-ai", "xai"],
] as const;

function bundledMainframeProviderAuthAliases(): Readonly<Record<string, string>> {
  const extensionsDirectory = new URL("../../../../../mainframe/extensions/", import.meta.url);
  const aliases: Record<string, string> = {};
  for (const entry of readdirSync(extensionsDirectory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestUrl = new URL(`${entry.name}/openclaw.plugin.json`, extensionsDirectory);
    if (!existsSync(manifestUrl)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
      readonly providerAuthAliases?: Readonly<Record<string, string>>;
    };
    for (const [providerId, authProviderId] of Object.entries(manifest.providerAuthAliases ?? {})) {
      expect(aliases[providerId]).toBeUndefined();
      aliases[providerId] = authProviderId;
    }
  }
  return aliases;
}

describe("model provider taxonomy", () => {
  it.each(["moonshot-ai", "moonshotai"])(
    "folds the Moonshot catalog alias %s under the canonical provider",
    (providerId) => {
      expect(classifyModelProvider(providerId)).toMatchObject({
        category: "llm",
        parentId: "moonshot",
        runtimeLabel: null,
      });
    },
  );

  it("matches the bundled Mainframe providerAuthAliases manifests", () => {
    const expected = Object.fromEntries(mainframeProviderAuthAliasParity);
    expect(MODEL_PROVIDER_AUTH_ALIASES).toEqual(expected);
    expect(bundledMainframeProviderAuthAliases()).toEqual(expected);
  });

  it.each(mainframeProviderAuthAliasParity)(
    "keeps the shared auth identity for %s in Mainframe manifest parity",
    (providerId, expected) => {
      expect(canonicalModelProviderAuthId(providerId)).toBe(expected);
    },
  );

  it("does not conflate auth identities that only share a catalog group", () => {
    expect(canonicalModelProviderAuthId("qwen")).toBe("qwen");
    expect(canonicalModelProviderAuthId("qwen-oauth")).toBe("qwen-oauth");
    expect(canonicalModelProviderAuthId("codex")).toBe("codex");
    expect(canonicalModelProviderAuthId("openai")).toBe("openai");
    expect(canonicalModelProviderAuthId("minimax")).toBe("minimax");
    expect(canonicalModelProviderAuthId("minimax-portal")).toBe("minimax-portal");
  });

  it("preserves OpenAI as a canonical provider while folding its Codex runtime", () => {
    expect(classifyModelProvider("openai").parentId).toBeNull();
    expect(classifyModelProvider("codex").parentId).toBe("openai");
  });
});
