import { describe } from "vitest";

import { InMemoryRuntimeConversationStore } from "../adapters/in-memory/runtime-conversation-store.js";
import { runtimeConversationStoreContract } from "./contracts/runtime-conversation-store.contract.js";

describe("InMemoryRuntimeConversationStore contract", () => {
  runtimeConversationStoreContract({ createStore: () => new InMemoryRuntimeConversationStore() });
});
