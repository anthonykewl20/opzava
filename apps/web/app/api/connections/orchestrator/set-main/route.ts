import { NextResponse } from "next/server";

import { setMainOrchestratorForContext } from "@/lib/connections";
import { connectionsMutationErrorResponse } from "@/lib/connections-route-errors";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface SetMainOrchestratorBody {
  readonly providerId?: unknown;
  // Optional: the operator's chosen model. Omitted means "keep deriving it" (the provider's
  // configured model, else its suggested one) — the worker owns that derivation, not this route.
  readonly model?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getAppSessionContext();
  if (context === null) {
    return NextResponse.json({ message: "Unauthorized", code: "web.unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SetMainOrchestratorBody | null;
  if (body === null || typeof body.providerId !== "string" || body.providerId.trim() === "") {
    return NextResponse.json(
      { message: "providerId is required", code: "web.invalidRequest" },
      { status: 400 },
    );
  }

  const model =
    typeof body.model === "string" && body.model.trim() !== "" ? body.model.trim() : undefined;
  const result = await setMainOrchestratorForContext(context, body.providerId, model);
  if (!result.ok) {
    return connectionsMutationErrorResponse(result.error);
  }

  return NextResponse.json(result.value);
}
