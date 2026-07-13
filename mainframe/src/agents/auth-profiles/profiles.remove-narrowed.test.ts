import { describe, expect, it } from "vitest";
import { removeProviderAuthProfilesFromStore } from "./profiles.js";
import type { AuthProfileStore } from "./types.js";

// One API key can be registered under several provider ids (OpenCode shares a key across the
// `opencode` and `opencode-go` catalogs). Revoking the SHARED profile off one of them must not take
// that provider's unrelated credentials with it — a provider-wide wipe there would destroy a key the
// operator never asked to revoke.
function storeWithSharedAndPersonalOpenCodeKeys(): AuthProfileStore {
  return {
    profiles: {
      "opencode:default": { provider: "opencode", type: "api_key", key: "shared" },
      "opencode:personal": { provider: "opencode", type: "api_key", key: "personal" },
    },
    order: { opencode: ["opencode:default", "opencode:personal"] },
    lastGood: { opencode: "opencode:default" },
    usageStats: {
      "opencode:default": { lastUsedAt: 1 },
      "opencode:personal": { lastUsedAt: 2 },
    },
  } as unknown as AuthProfileStore;
}

describe("removeProviderAuthProfilesFromStore", () => {
  it("removes only the named profile and leaves the provider's other credentials intact", () => {
    const store = storeWithSharedAndPersonalOpenCodeKeys();

    const changed = removeProviderAuthProfilesFromStore(store, {
      provider: "opencode",
      profileIds: ["opencode:default"],
    });

    expect(changed).toBe(true);
    expect(Object.keys(store.profiles)).toEqual(["opencode:personal"]);
    // The survivor keeps its place in the order rather than having the whole entry dropped.
    expect(store.order?.opencode).toEqual(["opencode:personal"]);
    expect(store.usageStats?.["opencode:personal"]).toBeDefined();
    expect(store.usageStats?.["opencode:default"]).toBeUndefined();
  });

  it("keeps lastGood while the provider still has a credential", () => {
    const store = storeWithSharedAndPersonalOpenCodeKeys();

    removeProviderAuthProfilesFromStore(store, {
      provider: "opencode",
      profileIds: ["opencode:personal"],
    });

    // lastGood points at a surviving profile — clearing it would strand a working credential.
    expect(store.lastGood?.opencode).toBe("opencode:default");
  });

  it("removes everything for the provider when no narrowing is given", () => {
    const store = storeWithSharedAndPersonalOpenCodeKeys();

    const changed = removeProviderAuthProfilesFromStore(store, { provider: "opencode" });

    expect(changed).toBe(true);
    expect(store.profiles).toEqual({});
    expect(store.order?.opencode).toBeUndefined();
    expect(store.lastGood?.opencode).toBeUndefined();
  });

  it("clears the provider's order and lastGood once narrowing removes its last profile", () => {
    const store = storeWithSharedAndPersonalOpenCodeKeys();

    removeProviderAuthProfilesFromStore(store, {
      provider: "opencode",
      profileIds: ["opencode:default", "opencode:personal"],
    });

    expect(store.profiles).toEqual({});
    expect(store.order?.opencode).toBeUndefined();
    expect(store.lastGood?.opencode).toBeUndefined();
  });
});
