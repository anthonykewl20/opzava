export const ADMIN_CONTROL_CENTER_VIEW_CAPABILITY = "admin_control_center:view" as const;

export type AdminCapability = typeof ADMIN_CONTROL_CENTER_VIEW_CAPABILITY;

/**
 * V1 admission mirrors the existing tenant-admin role semantics. Keeping the
 * predicate isolated makes a later modular-RBAC adapter a one-file change.
 */
export function admitsAdminControlCenter(roleKeys: readonly string[]): boolean {
  return roleKeys.includes("owner") || roleKeys.includes("admin");
}
