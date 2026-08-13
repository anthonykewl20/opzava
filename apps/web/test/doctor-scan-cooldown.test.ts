import { describe, expect, it } from "vitest";

import { doctorScanCooldown } from "@/lib/health/doctor-scan-cooldown";

describe("doctor scan cooldown", () => {
  const checkedAt = "2026-08-13T12:00:00.000Z";
  const checkedAtMs = Date.parse(checkedAt);

  it("states the live elapsed and remaining time inside the 30 second floor", () => {
    expect(doctorScanCooldown(checkedAt, checkedAtMs + 10_100)).toEqual({
      disabled: true,
      secondsRemaining: 20,
      label: "Scanned 10s ago — available again in 20s",
    });
  });

  it("enables re-check at the boundary and for absent or invalid timestamps", () => {
    const enabled = { disabled: false, secondsRemaining: 0, label: "Re-check now" };
    expect(doctorScanCooldown(checkedAt, checkedAtMs + 30_000)).toEqual(enabled);
    expect(doctorScanCooldown(null, checkedAtMs)).toEqual(enabled);
    expect(doctorScanCooldown("invalid", checkedAtMs)).toEqual(enabled);
  });
});
