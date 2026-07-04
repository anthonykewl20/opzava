# Slice 3.7 — Device-flow connect: ASYNC redesign (reliable/consistent/efficient)

## Problem with the first cut
`startModelProviderDeviceFlow` blocks the server action up to 45s (30x1.5s) polling the gateway TTY
log for the device code, which OpenAI issues only after ~30s. This races the poll window, ties up
the web->worker request, and risks timeouts (observed: dialog stuck on "Starting..."). Not reliable.

## Redesign: async, browser-polled (mirror the working GitHub device flow)
Keep OpenClaw's CLI authoritative for the OAuth + token storage (do NOT reimplement). Only change
WHERE the ~30s wait happens: move it off the server action and onto the browser poll.

### Ports (packages/ports/src/connections-provisioning.ts)
- `DeviceFlowChallenge` += `readonly codePending?: boolean` (true when the URL+code are not issued
  yet; verificationUri/userCode may be "" until the poll delivers them).
- `DeviceFlowPollState` += optional `verificationUri?: string`, `userCode?: string`,
  `codePending?: boolean` so a "pending" poll can carry the code once ready.

### Worker (apps/workers/src/provisioning/gateway-admin-connections.ts)
- `startModelProviderDeviceFlow`: launch the detached login (unchanged startDeviceCodeLogin), poll
  the log ONLY briefly (<= ~6s, i.e. 4 attempts x 1.5s). Store the flow
  { flowId, providerId, authChoiceId, execId, logPath, expiresAt, verificationUri?, userCode? }.
  Return the challenge IMMEDIATELY:
    - URL+code already parsed -> full challenge (codePending:false).
    - else -> pending challenge: verificationUri:"", userCode:"", codePending:true.
  NEVER block beyond ~6s. Reduce modelDeviceFlowStartMaxAttempts to 4.
- `pollModelProviderFlow(flow)` -> DeviceFlowPollState:
    1. now > expiresAt -> "expired" (stopDeviceCodeLogin cleanup, drop flow).
    2. provider now connected (re-check modelStatus/config, existing logic) -> "connected" + refreshed
       ProviderConnectionState (cleanup, drop flow).
    3. else read the log:
       - if flow lacks URL+code, parse; if found, persist onto the flow (mutate the map entry).
       - terminal failure in the log (deviceCodeLogTerminalFailure) -> "failed" (cleanup).
       - flow now has URL+code -> "pending" + { verificationUri, userCode, codePending:false,
         intervalSeconds }.
       - else -> "pending" + { codePending:true, message:"Requesting device code..." }.
  Never return the raw log or any token; only verificationUri + userCode.

### Web
- `apps/web/components/connections/device-flow-poller.tsx`: accept a possibly-pending challenge;
  when codePending / no URL yet, render a "Requesting device code..." spinner state; when the poll
  returns verificationUri+userCode, render them ("Open <uri> and enter <code>") + "Waiting for you to
  authorize..."; on connected -> success + router.refresh(). Drive polling from the poll state.
- `apps/web/lib/connections-state.ts` deviceFlowReducer/schedule: carry verificationUri/userCode/
  codePending through; keep "connected"/"expired"/"failed" terminal.
- `model-providers-panel.tsx`: the device-flow "Start device flow" submit returns fast now; on the
  challenge, render DeviceFlowPoller (even when codePending). Keep the CLI-command fallback only if
  the START action itself errors.

## Sad paths / edge cases (each a clean, agnostic state)
- code never issued (rate-limit/network): poll returns codePending until expiresAt -> "expired" with
  "Could not get a device code, try again."
- authorized out-of-band -> "connected" on next poll.
- worker restart: in-memory flow lost -> pollDeviceFlow "expired" -> UI: retry. Orphaned CLI
  self-expires; log left in gateway /tmp (harmless; optional TTL sweep).
- concurrent flows: per-flow uuid logPath already isolates.
- folded child (codex under openai): deviceCodeProviderArg maps to base provider.
- secrets: only verificationUri + userCode leave the worker; never the raw log/tokens.
- cleanup on connected/expired/failed (stopDeviceCodeLogin rm log).

## Tests
Worker: start with empty log -> fast pending challenge (codePending, no long block); poll transitions
codePending -> URL+code -> connected; expiry -> expired; terminal-failure log -> failed; no secret in
any result. Web: deviceFlowReducer handles codePending -> code -> connected.

## Verify (live)
Connect OpenAI -> Start -> dialog shows "Requesting device code..." immediately (no long spinner) ->
~30s later the URL+code appear -> authorize -> Connected. Then the real-world gate.
