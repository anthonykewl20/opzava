import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { base32Decode, base32Encode, decryptTotpSecret, encryptTotpSecret, totpAt, verifyTotp } from "../adapters/better-auth/mfa-crypto.js";
import { symmetricEncrypt } from "better-auth/crypto";

const rfc4226Secret = "12345678901234567890";
const rfc4226Base32Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("MFA crypto", () => {
  it("encodes and decodes the RFC 4648 base32 vector without 32-bit truncation", () => {
    expect(base32Encode(Buffer.from(rfc4226Secret, "ascii"))).toBe(rfc4226Base32Secret);
    expect(base32Decode(rfc4226Base32Secret).toString("ascii")).toBe(rfc4226Secret);

    for (let index = 0; index < 16; index += 1) {
      const bytes = randomBytes(20);
      expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    }
  });

  it("matches the RFC 4226 Appendix D dynamic-truncation vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

    for (const [counter, code] of expected.entries()) {
      expect(totpAt(rfc4226Base32Secret, counter * 30_000)).toBe(code);
    }
  });

  it("never accepts the all-zero code across representative RFC counters", () => {
    for (let counter = 0; counter < 10; counter += 1) {
      expect(verifyTotp(rfc4226Base32Secret, "000000", counter * 30_000)).toBe(false);
    }
  });

  it("writes HKDF-versioned MFA ciphertext and can still decrypt legacy ciphertext", async () => {
    const previous = process.env["BETTER_AUTH_SECRET"];
    process.env["BETTER_AUTH_SECRET"] = "test-mfa-master-secret";
    try {
      const legacy = await symmetricEncrypt({ key: "test-mfa-master-secret", data: "legacy-secret" });
      expect(await decryptTotpSecret(legacy)).toBe("legacy-secret");
      const encrypted = await encryptTotpSecret("new-secret");
      expect(encrypted).toMatch(/^hkdf1:/);
      expect(await decryptTotpSecret(encrypted)).toBe("new-secret");
    } finally {
      if (previous === undefined) delete process.env["BETTER_AUTH_SECRET"];
      else process.env["BETTER_AUTH_SECRET"] = previous;
    }
  });
});
