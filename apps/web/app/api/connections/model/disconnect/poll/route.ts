import { NextResponse } from "next/server";

import { pollModelProviderDisconnectForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PollBody {
  readonly opId?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json(
      { message: "Unauthorized", code: "web.unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as PollBody | null;
  if (body === null || typeof body.opId !== "string" || body.opId.trim() === "") {
    return NextResponse.json(
      { message: "opId is required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await pollModelProviderDisconnectForContext({
    context,
    opId: body.opId,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
