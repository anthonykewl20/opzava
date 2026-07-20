import { NextResponse } from "next/server";

interface RouteError {
  readonly message: string;
  readonly code?: string;
}

/**
 * Map a connections mutation failure to the JSON error contract the browser mutation client
 * understands: 403 for role denials, 409 for synchronous busy conflicts, and 502 for genuine
 * provisioning/gateway failures. Canary failures happen after the 202 response and are exposed by
 * the existing reconcile snapshot instead of this synchronous error path.
 */
export function connectionsMutationErrorResponse(error: RouteError): NextResponse {
  const code = typeof error.code === "string" ? error.code : "web.connectionsProvisioningFailed";
  const status =
    code === "web.connectionsForbidden"
      ? 403
      : code === "provisioning.connections.providerConnectInFlight" ||
          code === "provisioning.connections.orchestratorElectionInFlight" ||
          code === "provisioning.connections.orchestratorProviderNotConnected" ||
          code === "provisioning.connections.orchestratorModelUnknown" ||
          code === "provisioning.connections.orchestratorModelUnavailable"
        ? 409
        : 502;
  return NextResponse.json({ message: error.message, code }, { status });
}
