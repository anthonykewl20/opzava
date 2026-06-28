#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${DOKPLOY_PARITY_COMPOSE_FILE:-docker-compose.dokploy.yml}"
PROJECT_NAME="${DOKPLOY_PARITY_PROJECT_NAME:-opzava-dokploy-parity}"
APP_DOMAIN="${DOKPLOY_LOCAL_DOMAIN:-opzava.localhost}"
HTTP_PORT="${DOKPLOY_HTTP_PORT:-3080}"
APP_PORT="${PORT:-3000}"
BASE_URL="${DOKPLOY_PARITY_BASE_URL:-http://${APP_DOMAIN}:${HTTP_PORT}}"
API_KEY_VALUE="${API_KEY:-test-api-key-e2e-12345}"

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  if [[ "${DOKPLOY_PARITY_KEEP_UP:-0}" != "1" ]]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[dokploy-parity] Starting local Dokploy-parity stack..."
compose up -d --build

echo "[dokploy-parity] Waiting for Traefik-routed health at ${BASE_URL}..."
for _ in $(seq 1 90); do
  if curl -fsS "${BASE_URL}/api/status?action=health" >/tmp/opzava-dokploy-health.json; then
    break
  fi
  sleep 2
done

if ! curl -fsS "${BASE_URL}/api/status?action=health" >/tmp/opzava-dokploy-health.json; then
  echo "[dokploy-parity] Health check failed. Recent app logs:" >&2
  compose logs --tail 120 mission-control >&2 || true
  exit 1
fi

node -e "const h=require('/tmp/opzava-dokploy-health.json'); if(h.status!=='healthy'){console.error(h); process.exit(1)}"
echo "[dokploy-parity] Health is healthy."

container_id="$(compose ps -q mission-control)"
published_bindings="$(docker inspect "$container_id" --format '{{json .NetworkSettings.Ports}}')"
if ! node -e '
  const ports = JSON.parse(process.argv[1] || "{}")
  const published = []
  for (const [containerPort, bindings] of Object.entries(ports)) {
    if (!Array.isArray(bindings)) continue
    for (const binding of bindings) {
      if (binding?.HostPort) published.push(`${containerPort}->${binding.HostIp || ""}:${binding.HostPort}`)
    }
  }
  if (published.length > 0) {
    console.error(published.join("\n"))
    process.exit(1)
  }
' "$published_bindings"; then
  echo "[dokploy-parity] mission-control publishes host port(s); Dokploy parity requires Traefik-only exposure." >&2
  exit 1
fi
echo "[dokploy-parity] mission-control has no direct host-published app port."

compose exec -T mission-control sh -lc '
  test "$(id -u)" = "1000"
  test "$HOME" = "/home/nextjs"
  test -w /app/.data
  ! test -w /app
'
echo "[dokploy-parity] Runtime filesystem/user invariants passed."

https_cookie_headers="$(
  curl -fsS -D - -o /dev/null \
    -H "Content-Type: application/json" \
    -H "Origin: ${BASE_URL}" \
    -H "X-Forwarded-Proto: https" \
    -X POST \
    --data "{\"username\":\"${AUTH_USER:-testadmin}\",\"password\":\"${AUTH_PASS:-testpass1234!}\"}" \
    "${BASE_URL}/api/auth/login" || true
)"
if ! printf '%s\n' "$https_cookie_headers" | grep -qi '__Host-mc-session=.*Secure'; then
  echo "[dokploy-parity] HTTPS-forwarded login did not emit a secure __Host session cookie." >&2
  printf '%s\n' "$https_cookie_headers" >&2
  exit 1
fi
echo "[dokploy-parity] Forwarded HTTPS cookie behavior passed."

# Temporal SSE smoke test. The opening-frame checks below would pass against a
# reverse proxy that buffers AFTER the synchronous retry:/connected flush — while
# production chat stalls. So we additionally hold ONE authenticated SSE connection
# open, POST a workspace-scoped broadcast chat event from a SECOND authenticated
# curl, and assert the matching data frame arrives on the SAME open connection
# within the temporal window. A buffering proxy cannot fake this: the live frame
# only exists because our POST just created it.
sse_capture="/tmp/opzava-dokploy-sse.capture"
: > "$sse_capture"
sse_child=""

# Keep the SSE reader alive long enough to cover the opening frames + the temporal
# round-trip with margin; it is killed explicitly once the assertion resolves.
sse_kill() {
  if [[ -n "$sse_child" ]]; then
    kill "$sse_child" >/dev/null 2>&1 || true
    wait "$sse_child" >/dev/null 2>&1 || true
    sse_child=""
  fi
}

# Open the long-lived SSE connection, streaming response headers + body together to
# ONE capture file via curl -i, so a single grep can assert content-type AND the
# opening frames (curl -D to a separate file was not flushed until connection close).
# -fsS would abort on the initial 200 (curl treats the open stream as success), so -sS only.
curl -sS -i -N --max-time 20 \
  -H "x-api-key: ${API_KEY_VALUE}" \
  -H "Accept: text/event-stream" \
  "${BASE_URL}/api/events" >>"$sse_capture" 2>/dev/null &
sse_child="$!"

# Poll the capture for content-type AND the synchronous opening frames together.
# The retry interval is jittered (5000 + rand(0..1999) in realtime-events.ts), so
# match any numeric retry value, not a hardcoded 5000.
opening_ok=0
for _ in $(seq 1 20); do  # 20 x 0.25s = 5s budget for open + flush
  if grep -qi '^content-type: text/event-stream' "$sse_capture" \
     && grep -q '^retry: [0-9]' "$sse_capture" \
     && grep -q 'data: .*"type":"connected"' "$sse_capture"; then
    opening_ok=1
    break
  fi
  sleep 0.25
done
if [[ "$opening_ok" != "1" ]]; then
  echo "[dokploy-parity] SSE did not return text/event-stream with the retry + connected opening frames through Traefik." >&2
  printf '%s\n' "--- captured headers + body ---" >&2
  cat "$sse_capture" >&2 || true
  sse_kill
  exit 1
fi
echo "[dokploy-parity] Traefik-routed SSE opening frames (content-type + retry + connected) passed."

# Temporal assertion: POST a workspace-scoped BROADCAST chat message (to_agent
# unset => workspace-wide, so it bypasses the SSE DM ACL and is delivered to every
# viewer on this workspace — including this connection). The unique sentinel makes
# the match unambiguous and immune to leftover events from prior runs.
sse_sentinel="sse-temporal-probe-$$-$(date +%s%N)"
sse_post_json=$(printf '{"content":"%s"}' "$sse_sentinel")
sse_post_code="$(
  curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: ${API_KEY_VALUE}" \
    -H "Content-Type: application/json" \
    -X POST \
    --data "$sse_post_json" \
    "${BASE_URL}/api/chat/messages" || true
)"
if [[ "$sse_post_code" != "201" ]]; then
  echo "[dokploy-parity] Temporal SSE probe: chat broadcast POST returned HTTP ${sse_post_code}, expected 201." >&2
  sse_kill
  exit 1
fi

sse_delivered=0
for _ in $(seq 1 12); do  # 12 x 0.25s = 3s temporal window
  if grep -q "\"type\":\"chat.message\".*\"content\":\"${sse_sentinel}\"" "$sse_capture"; then
    sse_delivered=1
    break
  fi
  sleep 0.25
done
sse_kill
if [[ "$sse_delivered" != "1" ]]; then
  echo "[dokploy-parity] Temporal SSE FAILED: the live chat.message data frame for sentinel ${sse_sentinel} did not arrive on the open SSE connection within 3s." >&2
  echo "[dokploy-parity] This indicates a reverse proxy is buffering the stream after the initial flush (production chat would stall)." >&2
  printf '%s\n' "--- captured body (tail) ---" >&2
  tail -n 40 "$sse_capture" >&2 || true
  exit 1
fi
echo "[dokploy-parity] Traefik-routed SSE stream passed (temporal probe: live workspace event arrived on the open connection within the window)."

echo "[dokploy-parity] Probing Traefik-routed PTY WebSocket upgrade..."
BASE_URL="$BASE_URL" API_KEY_VALUE="$API_KEY_VALUE" node <<'NODE'
const { WebSocket } = require('ws')

const base = new URL(process.env.BASE_URL)
base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
base.pathname = '/ws/pty'
base.search = 'session=missing-dokploy-probe&kind=claude-code&mode=readonly'

const ws = new WebSocket(base.toString(), {
  headers: { 'x-api-key': process.env.API_KEY_VALUE || '' },
})

let opened = false
let done = false
const finish = (code, message) => {
  if (done) return
  done = true
  clearTimeout(timer)
  if (message) console.error(message)
  try { ws.close() } catch {}
  process.exit(code)
}
const timer = setTimeout(() => finish(1, 'PTY WebSocket probe timed out'), 7000)

ws.on('open', () => {
  opened = true
})
ws.on('message', (data) => {
  let msg
  try {
    msg = JSON.parse(String(data))
  } catch {
    return
  }
  const text = String(msg?.message || '')
  if (msg?.type === 'error' && /tmux session "missing-dokploy-probe" not found/.test(text)) {
    finish(0)
  }
})
ws.on('close', (code, reason) => {
  if (done) return
  if (!opened) {
    finish(1, `PTY WebSocket handshake failed before open: ${code} ${reason}`)
    return
  }
  finish(1, `PTY WebSocket closed before expected tmux-session error: ${code} ${reason}`)
})
ws.on('error', (err) => {
  finish(1, `PTY WebSocket probe error: ${err.message}`)
})
NODE
echo "[dokploy-parity] Traefik-routed PTY WebSocket upgrade passed."

echo "[dokploy-parity] Probing OpenClaw/Hermes Docker parity..."
openclaw_hermes_sentinel_written=0
openclaw_hermes_sentinel_path="/home/node/.hermes/.parity-sentinel"

cleanup_openclaw_hermes_sentinel() {
  if [[ "${openclaw_hermes_sentinel_written:-0}" == "1" ]]; then
    compose exec -T mc-openclaw-gateway sh -lc "rm -f ${openclaw_hermes_sentinel_path}" >/dev/null 2>&1 || true
    openclaw_hermes_sentinel_written=0
  fi
}

openclaw_hermes_fail() {
  local invariant="$1"
  cleanup_openclaw_hermes_sentinel
  echo "[dokploy-parity] OpenClaw/Hermes parity FAILED: ${invariant}" >&2
  echo "[dokploy-parity] Recent gateway logs:" >&2
  compose logs --tail 120 mc-openclaw-gateway >&2 || true
  echo "[dokploy-parity] Recent app logs:" >&2
  compose logs --tail 120 mission-control >&2 || true
  exit 1
}

is_openclaw_healthy_response() {
  # The OpenClaw gateway /health returns {"ok":true,"status":"live"} (or "healthy").
  # Accept any of the gateway's documented healthy shapes; reject empty/unhealthy.
  printf '%s\n' "$1" | grep -Eiq '"ok"[[:space:]]*:[[:space:]]*true|"status"[[:space:]]*:[[:space:]]*"(live|healthy|ok|ready)"|(^|[^[:alnum:]_])healthy([^[:alnum:]_]|$)'
}

gateway_health=""
gateway_health_ok=0
for _ in $(seq 1 30); do
  if gateway_health="$(
    compose exec -T mc-openclaw-gateway node -e 'const http=require("http");const p=process.env.OPENCLAW_GATEWAY_PORT||"18789";http.get("http://127.0.0.1:"+p+"/health",s=>{let d="";s.on("data",c=>d+=c);s.on("end",()=>{process.stdout.write(d);process.exit(s.statusCode===200?0:1)})}).on("error",()=>process.exit(1))' 2>&1
  )" && is_openclaw_healthy_response "$gateway_health"; then
    gateway_health_ok=1
    break
  fi
  sleep 2
done
if [[ "$gateway_health_ok" != "1" ]]; then
  printf '%s\n' "[dokploy-parity] Last gateway /health response:" >&2
  printf '%s\n' "$gateway_health" >&2
  openclaw_hermes_fail "mc-openclaw-gateway /health did not return a healthy response within 60s."
fi
echo "[dokploy-parity] OpenClaw gateway /health passed."

app_gateway_health=""
app_gateway_health_ok=0
for _ in $(seq 1 30); do
  if app_gateway_health="$(
    compose exec -T mission-control sh -lc 'port="${OPENCLAW_GATEWAY_PORT:-${OPENCLAW_GATEWAY_INTERNAL_PORT:-18789}}"; wget -qO- "http://mc-openclaw-gateway:${port}/health" || curl -fsS "http://mc-openclaw-gateway:${port}/health"' 2>&1
  )" && is_openclaw_healthy_response "$app_gateway_health"; then
    app_gateway_health_ok=1
    break
  fi
  sleep 2
done
if [[ "$app_gateway_health_ok" != "1" ]]; then
  printf '%s\n' "[dokploy-parity] Last app-container gateway /health response:" >&2
  printf '%s\n' "$app_gateway_health" >&2
  openclaw_hermes_fail "mission-control could not reach mc-openclaw-gateway by compose service name."
fi
echo "[dokploy-parity] App-container gateway reachability passed."

if ! compose exec -T mc-openclaw-gateway sh -lc 'test "$(id -u)" = "1000"'; then
  openclaw_hermes_fail "mc-openclaw-gateway is not running as uid 1000."
fi
echo "[dokploy-parity] OpenClaw gateway uid sentinel passed."

hermes_sentinel="hermes-volume-probe-$$-$(date +%s%N)"
if ! compose exec -T -e PARITY_SENTINEL="$hermes_sentinel" mc-openclaw-gateway sh -lc 'mkdir -p /home/node/.hermes && printf "%s\n" "$PARITY_SENTINEL" > /home/node/.hermes/.parity-sentinel'; then
  openclaw_hermes_fail "mc-openclaw-gateway could not write the Hermes volume sentinel under /home/node/.hermes."
fi
openclaw_hermes_sentinel_written=1

hermes_bridge_seen=0
for _ in $(seq 1 10); do
  if compose exec -T -e PARITY_SENTINEL="$hermes_sentinel" mission-control sh -lc 'test -f /home/nextjs/.hermes/.parity-sentinel && test "$(cat /home/nextjs/.hermes/.parity-sentinel)" = "$PARITY_SENTINEL"'; then
    hermes_bridge_seen=1
    break
  fi
  sleep 1
done
if [[ "$hermes_bridge_seen" != "1" ]]; then
  openclaw_hermes_fail "Hermes sentinel written by the gateway was not visible to the app at /home/nextjs/.hermes within 10s."
fi
cleanup_openclaw_hermes_sentinel
echo "[dokploy-parity] Hermes shared-volume bridge sentinel passed."

if compose exec -T mc-openclaw-gateway sh -lc 'test -f /home/node/.hermes/state.db'; then
  hermes_ro_read="$(
    compose exec -T mission-control sh -lc 'test -f /home/nextjs/.hermes/state.db && node -e "const Database = require(\"/app/node_modules/better-sqlite3\"); const db = new Database(\"/home/nextjs/.hermes/state.db\", { readonly: true, fileMustExist: true }); db.prepare(\"SELECT 1 AS ok\").get(); db.close(); console.log(\"ro-read-ok\")"' 2>&1
  )" || {
    printf '%s\n' "[dokploy-parity] Hermes state.db read-only probe output:" >&2
    printf '%s\n' "$hermes_ro_read" >&2
    openclaw_hermes_fail "mission-control could not open /home/nextjs/.hermes/state.db read-only."
  }
  if ! printf '%s\n' "$hermes_ro_read" | grep -q 'ro-read-ok'; then
    printf '%s\n' "[dokploy-parity] Hermes state.db read-only probe output:" >&2
    printf '%s\n' "$hermes_ro_read" >&2
    openclaw_hermes_fail "mission-control did not report ro-read-ok for /home/nextjs/.hermes/state.db."
  fi
  echo "[dokploy-parity] Hermes state.db read-only app probe passed."
else
  echo "[dokploy-parity] Hermes state.db not present in gateway volume; skipping read-only state.db probe (shared-volume sentinel already passed)."
fi
echo "[dokploy-parity] OpenClaw/Hermes Docker parity passed."

if [[ "${DOKPLOY_PARITY_RUN_E2E:-0}" == "1" ]]; then
  echo "[dokploy-parity] Running Playwright Docker-mode spec through Traefik..."
  if [[ "$#" -gt 0 ]]; then
    E2E_BASE_URL="$BASE_URL" \
    API_KEY="$API_KEY_VALUE" \
    pnpm exec playwright test -c playwright.dokploy.config.ts "$@"
  else
    E2E_BASE_URL="$BASE_URL" \
    API_KEY="$API_KEY_VALUE" \
    pnpm exec playwright test -c playwright.dokploy.config.ts tests/docker-mode.spec.ts
  fi
fi

echo "[dokploy-parity] OK"
