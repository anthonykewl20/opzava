import { NextResponse } from "next/server";

import { setModelProviderModelEnabledForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface SetModelProviderModelEnabledBody {
  readonly providerId?: unknown;
  readonly modelId?: unknown;
  readonly enabled?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json(
      { message: "Unauthorized", code: "web.unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as SetModelProviderModelEnabledBody | null;
  if (
    body === null ||
    typeof body.providerId !== "string" ||
    body.providerId.trim() === "" ||
    typeof body.modelId !== "string" ||
    body.modelId.trim() === "" ||
    typeof body.enabled !== "boolean"
  ) {
    return NextResponse.json(
      {
        message: "providerId, modelId, and enabled are required",
        code: "web.invalidRequest",
      },
      { status: 400 },
    );
  }

  const result = await setModelProviderModelEnabledForContext({
    context,
    providerId: body.providerId,
    modelId: body.modelId,
    enabled: body.enabled,
  });
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
