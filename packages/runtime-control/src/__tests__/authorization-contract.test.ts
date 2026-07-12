import { assertAuthorizationPortContract } from "@opzava/ports";
import { describe, it } from "vitest";

import { defaultRuntimeControlAuthorizationPort } from "../application/authorization.js";

describe("AuthorizationPort contract", () => {
  it("matches the shared role-key authorization behavior", async () => {
    await assertAuthorizationPortContract(defaultRuntimeControlAuthorizationPort);
  });
});
