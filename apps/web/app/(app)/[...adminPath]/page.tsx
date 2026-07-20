import { forbidden, notFound } from "next/navigation";

import { isRouteAdmitted } from "@/lib/admin-registry";
import { getAppSessionContext } from "@/lib/session";

interface UnmatchedAdminPathPageProps {
  readonly params: Promise<{
    readonly adminPath: readonly string[];
  }>;
}

/**
 * This is an admission boundary for unmatched Admin paths, not a destination
 * leaf. It ensures an unknown path participates in the same root denial flow
 * instead of bypassing the `(app)` layout as a framework 404.
 */
export default async function UnmatchedAdminPathPage({ params }: UnmatchedAdminPathPageProps) {
  const context = await getAppSessionContext();
  if (context === null) {
    forbidden();
  }

  const { adminPath } = await params;
  const pathname = `/${adminPath.join("/")}`;

  if (isRouteAdmitted(context, pathname)) {
    notFound();
  }

  forbidden();
}
