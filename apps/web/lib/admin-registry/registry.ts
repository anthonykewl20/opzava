import { admitsAdminControlCenter } from "./capability";
import { adminDestinations, type AdminDestination, type AdminGroup } from "./destinations";
import type { AdminPrincipal } from "./types";

export interface AdminDestinationGroup {
  readonly group: Exclude<AdminGroup, "pinned">;
  readonly label: string;
  readonly destinations: readonly AdminDestination[];
}

export interface AdminNavModel {
  readonly pinned: readonly AdminDestination[];
  readonly groups: readonly AdminDestinationGroup[];
}

const groupOrder = ["develop", "ai-runtime", "operate", "configure"] as const;

export const NAVIGABLE_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/ask-opzava",
  "/dev-board",
  "/connections",
]);

const groupLabels: Readonly<Record<(typeof groupOrder)[number], string>> = {
  develop: "Develop",
  "ai-runtime": "AI Runtime",
  operate: "Operate",
  configure: "Configure",
};

export function listDestinations(principal: AdminPrincipal): readonly AdminDestination[] {
  return admitsAdminControlCenter(principal.roleKeys) ? adminDestinations : [];
}

export function buildAdminNavModel(context: AdminPrincipal): AdminNavModel {
  const admitted = listDestinations(context);
  if (admitted.length === 0) {
    return { pinned: [], groups: [] };
  }

  return {
    pinned: admitted.filter((destination) => destination.group === "pinned"),
    groups: groupOrder.map((group) => ({
      group,
      label: groupLabels[group],
      destinations: admitted.filter((destination) => destination.group === group),
    })),
  };
}

function matchingDestination(pathname: string): AdminDestination | undefined {
  return adminDestinations
    .filter((destination) => destination.external !== true)
    .filter((destination) => {
      if (destination.href === "/") {
        return pathname === "/";
      }

      return pathname === destination.href || pathname.startsWith(`${destination.href}/`);
    })
    .sort((left, right) => right.href.length - left.href.length)[0];
}

export function isRouteAdmitted(principal: AdminPrincipal, pathname: string): boolean {
  const matched = matchingDestination(pathname);
  return matched !== undefined && admitsAdminControlCenter(principal.roleKeys);
}
