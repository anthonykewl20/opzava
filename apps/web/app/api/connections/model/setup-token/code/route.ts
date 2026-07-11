import { NextResponse } from "next/server";

import { submitModelProviderSetupTokenCodeForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface CodeBody {
  readonly flowId?: unknown;
  readonly code?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json(
      { message: "Unauthorized", code: "web.unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as CodeBody | null;
  if (
    body === null ||
    typeof body.flowId !== "string" ||
    body.flowId.trim() === "" ||
    typeof body.code !== "string" ||
    body.code.trim() === "" ||
    body.code.length > 512
  ) {
    return NextResponse.json(
      { message: "flowId and authorization code are required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await submitModelProviderSetupTokenCodeForContext({
    context,
    flowId: body.flowId,
    code: body.code,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
