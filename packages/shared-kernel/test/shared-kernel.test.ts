import { describe, expect, it } from "vitest";

import {
  DomainError,
  Money,
  makeOpaqueExternalRef,
  makeTenantId,
  ok,
  parseTaskId,
  parseTenantId
} from "../src/index.js";

describe("@opzava/shared-kernel ids", () => {
  it("brands valid opaque identifiers through public constructors", () => {
    expect(makeTenantId("tenant_123")).toBe("tenant_123");
    expect(parseTenantId("tenant-abc").ok).toBe(true);
  });

  it("rejects empty and malformed opaque identifiers", () => {
    expect(parseTaskId("").ok).toBe(false);
    expect(parseTaskId("bad/id").ok).toBe(false);
  });
});

describe("@opzava/shared-kernel money", () => {
  it("combines money only when currencies match", () => {
    const total = Money.create({ amountMinor: 1250, currency: "usd" }).add(
      Money.create({ amountMinor: 250, currency: "USD" })
    );

    expect(total.toJSON()).toEqual({ amountMinor: 1500, currency: "USD" });
  });

  it("rejects fractional minor units and currency mismatches", () => {
    expect(() => Money.create({ amountMinor: 1.25, currency: "USD" })).toThrow(DomainError);
    expect(() =>
      Money.create({ amountMinor: 100, currency: "USD" }).add(
        Money.create({ amountMinor: 100, currency: "PHP" })
      )
    ).toThrow(/different currencies/);
  });

  it("parses valid money input as a result", () => {
    const parsed = Money.parse({ amountMinor: 1250, currency: "usd" });

    expect(parsed.ok).toBe(true);
    expect(parsed).toEqual({ ok: true, value: Money.create({ amountMinor: 1250, currency: "usd" }) });
  });

  it("returns errors for invalid money input", () => {
    expect(Money.parse({ amountMinor: 1250, currency: "US" }).ok).toBe(false);
    expect(Money.parse({ amountMinor: 1.25, currency: "USD" }).ok).toBe(false);
    expect(Money.parse({ amountMinor: -1, currency: "USD" }).ok).toBe(false);
    expect(Money.parse("USD 12.50").ok).toBe(false);
  });
});

describe("@opzava/shared-kernel refs and result", () => {
  it("keeps external references opaque while validating their parts", () => {
    expect(
      makeOpaqueExternalRef({
        system: "openclaw",
        kind: "workboard-card",
        value: "card_123"
      })
    ).toEqual({
      system: "openclaw",
      kind: "workboard-card",
      value: "card_123"
    });

    expect(() =>
      makeOpaqueExternalRef({ system: "openclaw", kind: "", value: "card_123" })
    ).toThrow(DomainError);
  });

  it("represents successful results without throwing", () => {
    expect(ok("ready")).toEqual({ ok: true, value: "ready" });
  });
});
