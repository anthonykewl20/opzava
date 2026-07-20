import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttentionInbox, HealthPill } from "../components/shell/topbar-health-attention";

describe("Admin topbar health and attention controls", () => {
  it("renders separate accessible controls with separate rollout destinations", () => {
    const health = renderToStaticMarkup(
      createElement(HealthPill, {
        state: {
          status: "healthy",
          text: "Healthy",
          dotClassName: "dot dot-success",
          ariaLabel: "Health: Healthy; OpenClaw system health; checked 2026-07-20T00:00:00.000Z",
          checkedAt: "2026-07-20T00:00:00.000Z",
          freshnessState: "within-budget",
          gatewayReachable: true,
        },
      }),
    );
    const attention = renderToStaticMarkup(
      createElement(AttentionInbox, {
        state: {
          count: 2,
          hasItems: true,
          state: "available",
          ariaLabel: "Attention: 2 actionable items",
        },
      }),
    );

    expect(health).toContain('href="/connections"');
    expect(health).toContain(
      'aria-label="Health: Healthy; OpenClaw system health; checked 2026-07-20T00:00:00.000Z"',
    );
    expect(health).not.toContain("actionable items");
    expect(attention).toContain('href="/#overview-attention-heading"');
    expect(attention).toContain('aria-label="Attention: 2 actionable items"');
    expect(attention).toContain("Attention 2");
    expect(attention).not.toContain("Health: Healthy");
  });

  it("does not render unavailable attention as zero", () => {
    const attention = renderToStaticMarkup(
      createElement(AttentionInbox, {
        state: {
          count: null,
          hasItems: null,
          state: "unknown",
          ariaLabel: "Attention: actionable items unavailable",
        },
      }),
    );

    expect(attention).toContain("Attention —");
    expect(attention).not.toContain("Attention 0");
  });
});
