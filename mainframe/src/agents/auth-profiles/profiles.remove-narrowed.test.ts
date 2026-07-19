import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeProviderAuthProfilesWithLock } from "./profiles.js";
import type { AuthProfileStore } from "./types.js";

type UpdateAuthProfileStoreParams = Parameters<
  typeof import("./store.js").updateAuthProfileStoreWithLock
>[0];

const mocks = vi.hoisted(() => ({
  updateAuthProfileStoreWithLock: vi.fn(),
}));

vi.mock("./store.js", async () => {
  const actual = await vi.importActual<typeof import("./store.js")>("./store.js");
  return {
    ...actual,
    updateAuthProfileStoreWithLock: mocks.updateAuthProfileStoreWithLock,
  };
});

// One API key can be registered under several provider ids (OpenCode shares a key across the
// `opencode` and `opencode-go` catalogs). Revoking the SHARED profile off one of them must not take
// that provider's unrelated credentials with it — a provider-wide wipe there would destroy a key the
// operator never asked to revoke.
function storeWithSharedAndPersonalOpenCodeKeys(): AuthProfileStore {
  return {
    version: 1,
    profiles: {
      "opencode:default": { provider: "opencode", type: "api_key", key: "shared" },
      "opencode:personal": { provider: "opencode", type: "api_key", key: "personal" },
    },
    order: { opencode: ["opencode:default", "opencode:personal"] },
    lastGood: { opencode: "opencode:default" },
    usageStats: {
      "opencode:default": { lastUsed: 1 },
      "opencode:personal": { lastUsed: 2 },
    },
  };
}

describe("removeProviderAuthProfilesWithLock", () => {
  let store: AuthProfileStore;

  beforeEach(() => {
    store = storeWithSharedAndPersonalOpenCodeKeys();
    mocks.updateAuthProfileStoreWithLock.mockReset();
    mocks.updateAuthProfileStoreWithLock.mockImplementation(
      async (params: UpdateAuthProfileStoreParams) => {
        params.updater(store);
        return store;
      },
    );
  });

  it("removes only the named profile and leaves the provider's other credentials intact", async () => {
    await removeProviderAuthProfilesWithLock({
      provider: "opencode",
      profileIds: ["opencode:default"],
    });

    expect(Object.keys(store.profiles)).toEqual(["opencode:personal"]);
    // The survivor keeps its place in the order rather than having the whole entry dropped.
    expect(store.order?.opencode).toEqual(["opencode:personal"]);
    expect(store.usageStats?.["opencode:personal"]).toBeDefined();
    expect(store.usageStats?.["opencode:default"]).toBeUndefined();
  });

  it("keeps lastGood while the provider still has a credential", async () => {
    await removeProviderAuthProfilesWithLock({
      provider: "opencode",
      profileIds: ["opencode:personal"],
    });

    // lastGood points at a surviving profile — clearing it would strand a working credential.
    expect(store.lastGood?.opencode).toBe("opencode:default");
  });

  it("clears lastGood when narrowed removal deletes the exact profile it names", async () => {
    // lastGood is "opencode:default". Removing THAT profile while "opencode:personal" survives must
    // clear lastGood so it does not dangle at a deleted credential.
    await removeProviderAuthProfilesWithLock({
      provider: "opencode",
      profileIds: ["opencode:default"],
    });

    expect(store.profiles["opencode:personal"]).toBeDefined();
    expect(store.lastGood?.opencode).toBeUndefined();
  });

  it("removes everything for the provider when no narrowing is given", async () => {
    await removeProviderAuthProfilesWithLock({ provider: "opencode" });

    expect(store.profiles).toEqual({});
    expect(store.order?.opencode).toBeUndefined();
    expect(store.lastGood?.opencode).toBeUndefined();
  });

  it("clears the provider's order and lastGood once narrowing removes its last profile", async () => {
    await removeProviderAuthProfilesWithLock({
      provider: "opencode",
      profileIds: ["opencode:default", "opencode:personal"],
    });

    expect(store.profiles).toEqual({});
    expect(store.order?.opencode).toBeUndefined();
    expect(store.lastGood?.opencode).toBeUndefined();
  });
});
