import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AllComponents } from "../components/health/all-components";
import { HEALTH_RING_CIRCUMFERENCE, healthRingSegments } from "../components/health/health-ring";
import type { HealthComponentGroupView } from "../lib/health/health-view-model";

const groups: readonly HealthComponentGroupView[] = [
  {
    id: "system-core",
    label: "System core",
    components: [
      {
        id: "gateway",
        label: "Gateway",
        detail: "Operator session active.",
        status: "healthy",
        statusLabel: "Healthy",
        checkedLabel: "Checked 30s ago",
        href: "/connections/system#system-group-system-core",
      },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    components: [
      {
        id: "channel:slack:default",
        label: "Slack",
        detail: "The configured channel is healthy.",
        status: "healthy",
        statusLabel: "Healthy",
        checkedLabel: "Checked 30s ago",
        href: "/connections/system#system-group-channels",
      },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    components: [
      {
        id: "agent:reviewer",
        label: "Reviewer",
        detail: "No probe yet.",
        status: "not_checked",
        statusLabel: "Unknown · not checked",
        checkedLabel: "Not checked",
        href: "/connections/system#system-group-agents",
      },
    ],
  },
];

describe("Health components", () => {
  it("renders every component inside the All components disclosure", () => {
    const html = renderToStaticMarkup(<AllComponents groups={groups} defaultOpen />);

    expect(html).toContain("All components");
    expect(html).toContain("System core");
    expect(html).toContain("Channels");
    expect(html).toContain("Agents");
    expect(html).toContain("Gateway");
    expect(html).toContain("Slack");
    expect(html).toContain("Reviewer");
    expect(html).toContain("Unknown · not checked");
    expect(html).toContain('data-component-count="3"');
  });

  it("maps truthful ring proportions without counting unknown as healthy", () => {
    const segments = healthRingSegments({ total: 8, healthy: 6, attention: 1, notChecked: 1 });

    expect(segments.map((segment) => segment.status)).toEqual([
      "healthy",
      "attention",
      "not_checked",
    ]);
    expect(segments.map((segment) => segment.startDegrees)).toEqual([-90, 180, 225]);
    expect(segments[0]?.length).toBeCloseTo((6 / 8) * HEALTH_RING_CIRCUMFERENCE, 5);
    expect(segments.reduce((total, segment) => total + segment.length, 0)).toBeCloseTo(
      HEALTH_RING_CIRCUMFERENCE,
      5,
    );
  });
});
