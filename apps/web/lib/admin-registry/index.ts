export { admitsAdminControlCenter } from "./capability";
export type { AdminCapability } from "./capability";
export type { AdminDestination, AdminGroup } from "./destinations";
export { buildLegacyAdminNavModel } from "./legacy-shell-adapter";
export type { LegacyAdminNavItem, LegacyAdminNavModel } from "./legacy-shell-adapter";
export { buildAdminNavModel, isRouteAdmitted, listDestinations } from "./registry";
export type { AdminDestinationGroup, AdminNavModel } from "./registry";
export type { AdminPrincipal } from "./types";
