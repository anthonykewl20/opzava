# Slice 3.7 — In-browser device-flow OAuth connect (worker-driven)

Goal: the admin connects an OAuth/device-flow provider (OpenAI/Codex/GPT, and any provider that
supports `--device-code`) entirely from the browser: click Connect → see a verification URL + code →
authorize out-of-band → the provider shows Connected. Agnostic across device-flow providers.

## PROVEN feasibility (do NOT re-investigate — verified live against the running gateway)
- Command (inside the gateway container): `node openclaw.mjs models auth login --provider <providerId>
  --device-code`. It REQUIRES a TTY ("requires an interactive TTY" otherwise). With
  `--provider <id> --device-code` it goes STRAIGHT to device-code (no menu) and needs NO further
  stdin — authorization is out-of-band. It emits the verification URL + user code, then polls until
  the user authorizes (~15 min), then stores creds and exits 0.
- Captured output (openai), after ANSI-strip: `https://auth.openai.com/codex/device` and
  `Code: NRK5-7IPKG`. The device-code request can take ~20-40s to emit (network to auth.openai.com);
  output is a fancy TTY prompter (ANSI + spinners) — strip ANSI (`s/\x1B\[[0-9;?]*[a-zA-Z]//g`).
- Drivable primitive: `/usr/bin/script -qfc "<cmd>" <logfile>` allocates a REAL PTY, runs the
  command, tees output to <logfile>. Run it DETACHED (docker exec Detach:true) so it keeps polling in
  the container while the worker reads <logfile>.
- OpenAI rate-limits repeated device-code starts; surface a clean retry error, don't spin forever.

## Worker (apps/workers/src/provisioning/gateway-admin-connections.ts)
GatewayRuntimePort + DockerOpenClawGatewayRuntime additions:
- `startDeviceCodeLogin(providerId): Promise<Result<{ execId: string; logPath: string }>>` —
  logPath = `/tmp/opzava-df-<random>.log`; docker exec create + start (Detach:true), Cmd:
  `["sh","-lc","script -qfc \"node openclaw.mjs models auth login --provider <id> --device-code\" <logPath>"]`.
- `readDeviceCodeLog(logPath): Promise<Result<string>>` — one-shot `["sh","-lc","cat <logPath> 2>/dev/null || true"]`.
- `stopDeviceCodeLogin(execId, logPath)` best-effort cleanup: `pkill -f "auth login"` is too broad —
  instead just `rm -f <logPath>`; leave the process (it self-expires). (Keep it simple + safe.)

`startModelProviderDeviceFlow(input)` (device-flow choices only):
  1. providerArg = base provider for the auth choice (openai for openai-device-code, etc.).
  2. startDeviceCodeLogin(providerArg) -> execId, logPath.
  3. Poll readDeviceCodeLog every 1.5s up to 45s; ANSI-strip; parse:
     - verificationUri = first `https?://[^\s"']*device[^\s"']*`, else first `https?://auth\.[^\s"']+`.
     - userCode = `/Code:\s*([A-Z0-9][A-Z0-9-]{3,})/i`, else `/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/`.
     - both found -> DeviceFlowChallenge { flowId(new), kind:"model_provider", providerId, authChoiceId,
       verificationUri, userCode, expiresAt: now+15min, intervalSeconds: 5 }; store in the existing
       modelDeviceFlows map: flowId -> { providerId, execId, logPath, expiresAt }.
     - not found in 45s -> err `provisioning.connections.deviceFlowStartTimeout` (clear message); rm log.
`pollDeviceFlow(flowId)` (model-provider branch):
  1. flow missing/expired (now>expiresAt) -> "expired" (rm log, drop flow).
  2. re-check the provider's connection (modelStatus/config): if it now has a usable profile ->
     "connected" + the refreshed ProviderConnectionState; cleanup.
  3. else if the log tail matches `/error|failed|denied|expired|invalid/i` -> "failed".
  4. else "pending".
Never log/return secrets: tokens are stored by the CLI inside the gateway volume, never transit the
worker. The log may contain the user_code (not a secret post-auth) — do not echo full raw log to the
browser; return only the parsed verificationUri + userCode.

## Web (apps/web/components/connections/model-providers-panel.tsx)
Restore the working device-flow connect: the dialog's device-flow branch submits
`startModelProviderDeviceFlowStateAction` again (re-add the import + the useActionState). On the
returned challenge, render the existing `DeviceFlowPoller` (URL + code + poll-to-connected), same as
GitHub. Keep the `openclaw onboard --auth-choice <id>` line only as a SECONDARY fallback shown if the
start action errors (e.g. rate-limited). Remove the "no in-browser device flow" copy — it IS
supported now.

## Tests
Worker: RecordingGatewayRuntime gains a canned device-code log (with the URL+code) + a
running/connected toggle. Assert: startModelProviderDeviceFlow parses URL+code -> challenge with
expected verificationUri/userCode; timeout (empty log) -> err; pollDeviceFlow -> pending while no
profile, "connected" once the provider shows a profile; no secret in any result. Keep existing
device-flow-honest tests updated to the new working behavior.

## Verify (Claude, live)
Real login -> Connect on OpenAI (device-flow) -> Start device flow -> URL+code appear in the dialog
-> (user authorizes at the URL) -> provider flips to Connected. Then real-world-validate gate.
