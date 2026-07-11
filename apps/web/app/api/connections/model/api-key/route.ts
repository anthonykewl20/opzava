import { NextResponse } from "next/server";

import { startModelProviderApiKeyConnectForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface StartBody {
  readonly providerId?: unknown;
  readonly authChoiceId?: unknown;
  readonly apiKey?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json({ message: "Unauthorized", code: "web.unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as StartBody | null;
  if (
    body === null ||
    typeof body.providerId !== "string" ||
    body.providerId.trim() === "" ||
    typeof body.authChoiceId !== "string" ||
    body.authChoiceId.trim() === "" ||
    typeof body.apiKey !== "string"
  ) {
    return NextResponse.json(
      { message: "providerId, authChoiceId, and apiKey are required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const result = await startModelProviderApiKeyConnectForContext({
    context,
    providerId: body.providerId,
    authChoiceId: body.authChoiceId,
    apiKey: body.apiKey,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
