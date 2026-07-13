import { NextResponse } from "next/server";

import { startModelProviderDisconnectForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface DisconnectBody {
  readonly providerId?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json(
      { message: "Unauthorized", code: "web.unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as DisconnectBody | null;
  if (body === null || typeof body.providerId !== "string" || body.providerId.trim() === "") {
    return NextResponse.json(
      { message: "providerId is required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await startModelProviderDisconnectForContext({
    context,
    providerId: body.providerId,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
