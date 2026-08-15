"use client";

function bytes(value: string): ArrayBuffer {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output.buffer;
}
function base64url(value: ArrayBuffer): string {
  let binary = ""; for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function responseJson(credential: PublicKeyCredential): Readonly<Record<string, unknown>> {
  if (typeof credential.toJSON === "function") return credential.toJSON() as Readonly<Record<string, unknown>>;
  const response = credential.response;
  if (response instanceof AuthenticatorAttestationResponse) return { id: credential.id, rawId: base64url(credential.rawId), type: credential.type, response: { clientDataJSON: base64url(response.clientDataJSON), attestationObject: base64url(response.attestationObject), transports: response.getTransports?.() ?? [] }, clientExtensionResults: credential.getClientExtensionResults() };
  const assertion = response as AuthenticatorAssertionResponse;
  return { id: credential.id, rawId: base64url(credential.rawId), type: credential.type, response: { clientDataJSON: base64url(assertion.clientDataJSON), authenticatorData: base64url(assertion.authenticatorData), signature: base64url(assertion.signature), userHandle: assertion.userHandle === null ? undefined : base64url(assertion.userHandle) }, clientExtensionResults: credential.getClientExtensionResults() };
}
export async function createPasskey(options: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
  const source = options as { challenge: string; user: { id: string }; excludeCredentials?: Array<{ id: string; transports?: AuthenticatorTransport[] }> };
  const credential = await navigator.credentials.create({ publicKey: { ...source, challenge: bytes(source.challenge), user: { ...source.user, id: bytes(source.user.id) }, excludeCredentials: source.excludeCredentials?.map((item) => ({ ...item, id: bytes(item.id) })) } as PublicKeyCredentialCreationOptions });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey enrollment was cancelled.");
  return responseJson(credential);
}
export async function getPasskey(options: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
  const source = options as { challenge: string; allowCredentials?: Array<{ id: string; transports?: AuthenticatorTransport[] }> };
  const credential = await navigator.credentials.get({ publicKey: { ...source, challenge: bytes(source.challenge), allowCredentials: source.allowCredentials?.map((item) => ({ ...item, id: bytes(item.id) })) } as PublicKeyCredentialRequestOptions });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey sign-in was cancelled.");
  return responseJson(credential);
}
