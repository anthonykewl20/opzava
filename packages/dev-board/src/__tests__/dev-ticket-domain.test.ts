import { describe, expect, it } from "vitest";
import {
  computeReadyContractContentHash,
  parseDevTicketLane,
  parseOriginKind,
  parseReadyContractContent,
  parseReadyState,
} from "../domain/dev-ticket.js";
import {
  normalizeDiscoverySummary,
  parseBlockingAssessment,
  parseProposalLifecycleState,
} from "../domain/proposal.js";

describe("Dev Board planning domain", () => {
  it("validates proposal fields", () => {
    expect(normalizeDiscoverySummary("  Found   gap ")).toEqual({ ok: true, value: "Found gap" });
    expect(normalizeDiscoverySummary(" ").ok).toBe(false);
    expect(parseBlockingAssessment("blocking").ok).toBe(true);
    expect(parseBlockingAssessment("unknown").ok).toBe(false);
    expect(parseProposalLifecycleState("awaiting_decision").ok).toBe(true);
  });
  it("validates DevTicket fields", () => {
    expect(parseDevTicketLane("todo").ok).toBe(true);
    expect(parseDevTicketLane("queued").ok).toBe(false);
    expect(parseReadyState("approved").ok).toBe(true);
    expect(parseOriginKind("proposal").ok).toBe(true);
    expect(parseReadyContractContent({ outcome: "safe" }).ok).toBe(true);
    expect(parseReadyContractContent([]).ok).toBe(false);
  });
  it("hashes canonical contract content stably", () => {
    const first = { scope: { paths: ["a", "b"] }, outcome: "Ship" };
    const ordered = { outcome: "Ship", scope: { paths: ["a", "b"] } };
    expect(computeReadyContractContentHash(first)).toBe(computeReadyContractContentHash(ordered));
    expect(computeReadyContractContentHash(first)).not.toBe(
      computeReadyContractContentHash({ outcome: "Ship" }),
    );
  });
});
