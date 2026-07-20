import type { AdminDestinationGroup } from "@/lib/admin-registry";

export const ADMIN_GROUP_STATE_STORAGE_KEY = "opzava.admin.sidebar.groups.v1";

export type AdminGroupOpenState = Readonly<Record<string, boolean>>;

/**
 * Repairs per-device presentation state against the live registry. Unknown or
 * removed groups are discarded; new and malformed groups default open.
 */
export function repairAdminGroupOpenState(
  serialized: string | null,
  groups: readonly AdminDestinationGroup[],
): AdminGroupOpenState {
  let candidate: unknown = null;

  if (serialized !== null) {
    try {
      candidate = JSON.parse(serialized) as unknown;
    } catch {
      candidate = null;
    }
  }

  const persisted =
    typeof candidate === "object" && candidate !== null
      ? (candidate as Readonly<Record<string, unknown>>)
      : {};

  return Object.fromEntries(
    groups.map(({ group }) => [
      group,
      typeof persisted[group] === "boolean" ? persisted[group] : true,
    ]),
  );
}
