import { NextResponse } from "next/server";

interface RouteError {
  readonly message: string;
  readonly code?: string;
}

/**
 * Map a connections mutation failure to the JSON error contract the browser mutation client
 * understands: 403 for role denials, 409 for an election the gateway's runtime cannot honor
 * (#251 — the model is not runnable, an actionable client condition, NOT a server failure), and
 * 502 for genuine provisioning/gateway failures. The payload always carries { message, code } so
 * the dialog can render an actionable, redacted reason. The model stays electable — the click
 * fails with a clear message rather than the model being greyed out (which would need the
 * vendor-compat table #251 deliberately rejected).
 */
export function connectionsMutationErrorResponse(error: RouteError): NextResponse {
  const code = typeof error.code === "string" ? error.code : "web.connectionsProvisioningFailed";
  const status =
    code === "web.connectionsForbidden"
      ? 403
      : code === "provisioning.connections.modelNotRunnableByGateway"
        ? 409
        : 502;
  return NextResponse.json({ message: error.message, code }, { status });
}
