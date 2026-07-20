import { listDestinations } from "./registry";
import type { AdminPrincipal } from "./types";

export type LegacyAdminNavGroup = "pinned" | "operate" | "automate";

export interface LegacyAdminNavItem {
  readonly id: string;
  readonly sourceDestinationId: string;
  readonly label: string;
  readonly href: string;
  readonly group: LegacyAdminNavGroup;
  readonly icon: string;
}

export interface LegacyAdminNavModel {
  readonly pinned: readonly LegacyAdminNavItem[];
  readonly operate: readonly LegacyAdminNavItem[];
  readonly automate: readonly LegacyAdminNavItem[];
}

interface LegacyMapping {
  readonly id: string;
  readonly sourceDestinationId: string;
  readonly label?: string;
  readonly href?: string;
  readonly group: LegacyAdminNavGroup;
  readonly icon?: string;
}

// This compatibility projection preserves the pre-F4 shell exactly while
// making every visible destination traceable to the canonical registry.
const legacyMappings: readonly LegacyMapping[] = [
  { id: "ask-opzava", sourceDestinationId: "ask-admin-opzava", group: "pinned" },
  { id: "overview", sourceDestinationId: "overview", group: "operate" },
  {
    id: "tasks",
    sourceDestinationId: "dev-board",
    label: "Tasks",
    href: "/tasks",
    group: "operate",
  },
  {
    id: "issues",
    sourceDestinationId: "dev-board",
    label: "Issues",
    href: "/issues",
    group: "operate",
    icon: "CircleDot",
  },
  {
    id: "connections",
    sourceDestinationId: "integrations",
    label: "Connections",
    href: "/connections",
    group: "automate",
    icon: "Waypoints",
  },
] as const;

export function buildLegacyAdminNavModel(principal: AdminPrincipal): LegacyAdminNavModel {
  const byId = new Map(
    listDestinations(principal).map((destination) => [destination.id, destination] as const),
  );
  const items = legacyMappings.flatMap((mapping): readonly LegacyAdminNavItem[] => {
    const source = byId.get(mapping.sourceDestinationId);
    if (source === undefined) {
      return [];
    }

    return [
      {
        id: mapping.id,
        sourceDestinationId: source.id,
        label: mapping.label ?? source.label,
        href: mapping.href ?? source.href,
        group: mapping.group,
        icon: mapping.icon ?? source.icon,
      },
    ];
  });

  return {
    pinned: items.filter((item) => item.group === "pinned"),
    operate: items.filter((item) => item.group === "operate"),
    automate: items.filter((item) => item.group === "automate"),
  };
}
