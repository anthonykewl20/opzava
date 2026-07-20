import { describe, expect, it } from "vitest";

import {
  admitsAdminControlCenter,
  buildAdminNavModel,
  isRouteAdmitted,
  listDestinations,
} from "../lib/admin-registry";

const expectedGroups = [
  {
    group: "develop",
    label: "Develop",
    destinations: ["Overview", "Dev Board", "Runners", "Environments"],
  },
  {
    group: "ai-runtime",
    label: "AI Runtime",
    destinations: [
      "Gateway",
      "Models & Providers",
      "Agents",
      "Runtime Skills",
      "Sessions & Runs",
      "Automations",
    ],
  },
  {
    group: "operate",
    label: "Operate",
    destinations: ["Health", "Incidents", "Logs", "Usage & Costs"],
  },
  {
    group: "configure",
    label: "Configure",
    destinations: [
      "Integrations",
      "Engineering Skills",
      "MCP Servers",
      "Secrets",
      "Security & Audit",
      "Settings",
    ],
  },
] as const;

describe("Admin destination registry", () => {
  it.each([
    [["owner"], true],
    [["admin"], true],
    [["member"], false],
    [["guest"], false],
    [[], false],
  ] as const)("computes root admission from fresh role keys %j", (roleKeys, expected) => {
    expect(admitsAdminControlCenter(roleKeys)).toBe(expected);
  });

  it.each([["owner"], ["admin"]] as const)(
    "lists the pinned destination and all four groups in exact order for %s",
    (roleKey) => {
      const principal = { roleKeys: [roleKey] };
      const destinations = listDestinations(principal);
      const navModel = buildAdminNavModel(principal);

      expect(destinations).toHaveLength(21);
      expect(
        destinations.every(
          (destination) => destination.requiredCapability === "admin_control_center:view",
        ),
      ).toBe(true);
      expect(navModel.pinned.map((destination) => [destination.label, destination.href])).toEqual([
        ["Ask Admin Opzava", "/ask-opzava"],
      ]);
      expect(
        navModel.groups.map((group) => ({
          group: group.group,
          label: group.label,
          destinations: group.destinations.map((destination) => destination.label),
        })),
      ).toEqual(expectedGroups);
    },
  );

  it.each([{ roleKeys: ["member"] }, { roleKeys: ["guest"] }, { roleKeys: [] }] as const)(
    "returns no destinations when the principal has role keys $roleKeys",
    ({ roleKeys }) => {
      const principal = { roleKeys };

      expect(listDestinations(principal)).toEqual([]);
      expect(buildAdminNavModel(principal)).toEqual({ pinned: [], groups: [] });
    },
  );

  it("admits registered routes by exact or segment-safe longest prefix and rejects unknown routes", () => {
    const owner = { roleKeys: ["owner"] };

    expect(isRouteAdmitted(owner, "/")).toBe(true);
    expect(isRouteAdmitted(owner, "/gateway")).toBe(true);
    expect(isRouteAdmitted(owner, "/gateway/status")).toBe(true);
    expect(isRouteAdmitted(owner, "/gateways")).toBe(false);
    expect(isRouteAdmitted(owner, "/random/admin/path")).toBe(false);
  });

  it.each([{ roleKeys: ["member"] }, { roleKeys: ["guest"] }, { roleKeys: [] }] as const)(
    "denies registered and unregistered routes for role keys $roleKeys",
    ({ roleKeys }) => {
      const principal = { roleKeys };

      expect(isRouteAdmitted(principal, "/gateway")).toBe(false);
      expect(isRouteAdmitted(principal, "/random/admin/path")).toBe(false);
    },
  );
});
