import { NextResponse } from "next/server";

interface RouteError {
  readonly message: string;
  readonly code?: string;
}

/**
 * Map a connections mutation failure to the JSON error contract the browser mutation client
 * understands: 403 for role denials, 502 for provisioning/gateway failures. The payload always
 * carries { message, code } so the dialog can render an actionable, redacted reason.
 */
export function connectionsMutationErrorResponse(error: RouteError): NextResponse {
  const code = typeof error.code === "string" ? error.code : "web.connectionsProvisioningFailed";
  const status = code === "web.connectionsForbidden" ? 403 : 502;
  return NextResponse.json({ message: error.message, code }, { status });
}
