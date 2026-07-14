import { NextResponse } from "next/server";

import { cancelModelProviderDeviceFlowForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface CancelBody {
  readonly flowId?: unknown;
}

const modelDeviceFlowIdPattern =
  /^model:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json(
      { message: "Unauthorized", code: "web.unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as CancelBody | null;
  if (
    body === null ||
    typeof body.flowId !== "string" ||
    !modelDeviceFlowIdPattern.test(body.flowId)
  ) {
    return NextResponse.json(
      { message: "A valid model device flow id is required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await cancelModelProviderDeviceFlowForContext({
    context,
    flowId: body.flowId,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
