import { NextResponse } from "next/server";

import { pollConnectionDeviceFlowForContext } from "@/lib/connections";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PollBody {
  readonly flowId?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PollBody;
  if (typeof body.flowId !== "string" || body.flowId.trim() === "") {
    return NextResponse.json({ message: "flowId is required" }, { status: 400 });
  }

  const result = await pollConnectionDeviceFlowForContext({
    context,
    flowId: body.flowId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { message: result.error.message, code: result.error.code },
      { status: 502 },
    );
  }

  return NextResponse.json(result.value);
}
