import { NextResponse } from "next/server";

import { pollModelProviderSetupTokenFlowForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PollBody {
  readonly flowId?: unknown;
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
  if (body === null || typeof body.flowId !== "string" || body.flowId.trim() === "") {
    return NextResponse.json(
      { message: "flowId is required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await pollModelProviderSetupTokenFlowForContext({
    context,
    flowId: body.flowId,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
