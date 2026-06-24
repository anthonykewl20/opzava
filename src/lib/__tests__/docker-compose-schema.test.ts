import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Tests that docker-compose.yml and Dockerfile contain the expected
 * configuration for Compose v5+ compatibility and complete runtime assets.
 */

const ROOT = resolve(__dirname, '../../..')

describe('docker-compose.yml schema', () => {
  const content = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')

  it('uses deploy.resources.limits.pids (not service-level pids_limit)', () => {
    // pids limit must be inside deploy.resources.limits for Compose v5+ compatibility.
    // Service-level pids_limit causes "can't set distinct values" errors on some versions.
    expect(content).not.toContain('pids_limit:')

    const deployBlock = content.match(/deploy:[\s\S]*?(?=\n\s{4}\w|\nvolumes:|\nnetworks:)/)?.[0] ?? ''
    expect(deployBlock).toContain('pids:')
  })

  it('still has memory and cpus in deploy.resources.limits', () => {
    expect(content).toContain('memory: 2G')
    expect(content).toContain('cpus:')
  })

  it('passes public Next.js settings as build args', () => {
    expect(content).toContain('build:')
    expect(content).toContain('args:')
    expect(content).toContain('NEXT_PUBLIC_GATEWAY_URL:')
    expect(content).toContain('NEXT_PUBLIC_GATEWAY_HOST:')
    expect(content).toContain('NEXT_PUBLIC_GATEWAY_OPTIONAL:')
    expect(content).toContain('NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS:')
    expect(content).toContain('NEXT_PUBLIC_FORCE_HTTPS:')
    expect(content).toContain('NEXT_PUBLIC_APP_URL:')
  })

  it('exposes gateway-free direct dispatch env to the container', () => {
    expect(content).toContain('ANTHROPIC_API_KEY=')
    expect(content).toContain('OPENAI_API_KEY=')
    expect(content).toContain('LOCAL_LLM_ENDPOINT=')
    expect(content).toContain('MC_HOST_SESSION_MODE=')
  })
})

describe('Dockerfile runtime stage', () => {
  const content = readFileSync(resolve(ROOT, 'Dockerfile'), 'utf-8')

  it('copies public directory to runtime stage', () => {
    expect(content).toContain('COPY --from=build /app/public ./public')
  })

  it('copies standalone output', () => {
    expect(content).toContain('COPY --from=build /app/.next/standalone ./')
  })

  it('copies static assets', () => {
    expect(content).toContain('COPY --from=build /app/.next/static ./.next/static')
  })

  it('copies schema.sql for migrations', () => {
    expect(content).toContain('schema.sql')
  })

  it('runs the production PTY WebSocket wrapper in Docker', () => {
    expect(content).toContain('tmux')
    expect(content).toContain('/app/scripts/mc-server.cjs')
    expect(content).toContain('/app/scripts/pty-websocket-standalone.cjs')
    expect(content).toContain('ws@8.19.0')
    const entrypoint = readFileSync(resolve(ROOT, 'docker-entrypoint.sh'), 'utf-8')
    expect(entrypoint).toContain('node scripts/mc-server.cjs')
  })

  it('runs as the uid-1000 node user with nextjs home paths', () => {
    expect(content).toContain('ENV HOME=/home/nextjs')
    expect(content).toContain('chown -R node:node /home/nextjs')
    expect(content).toContain('USER node')
    expect(content).not.toContain('--uid 1001 nextjs')
  })

  it('can bake Claude Code and Codex CLI fallbacks', () => {
    expect(content).toContain('ARG INSTALL_AGENT_CLIS=1')
    expect(content).toContain('@anthropic-ai/claude-code')
    expect(content).toContain('@openai/codex')
  })

  it('declares every current NEXT_PUBLIC build arg used by the app', () => {
    for (const key of [
      'NEXT_PUBLIC_GATEWAY_URL',
      'NEXT_PUBLIC_GATEWAY_HOST',
      'NEXT_PUBLIC_GATEWAY_PORT',
      'NEXT_PUBLIC_GATEWAY_PROTOCOL',
      'NEXT_PUBLIC_GATEWAY_REVERSE_PROXY',
      'NEXT_PUBLIC_GATEWAY_CLIENT_ID',
      'NEXT_PUBLIC_GATEWAY_OPTIONAL',
      'NEXT_PUBLIC_COORDINATOR_AGENT',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
      'NEXT_PUBLIC_FORCE_HTTPS',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS',
    ]) {
      expect(content).toContain(`ARG ${key}=`)
      expect(content).toContain(`ENV ${key}=`)
    }
  })
})

describe('Docker operator overlays', () => {
  it('provides a mode-aware Makefile', () => {
    const content = readFileSync(resolve(ROOT, 'Makefile'), 'utf-8')
    expect(content).toContain('MC_MODE')
    expect(content).toContain('OPENCLAW_ENABLED')
    expect(content).toContain('MC_HOST_CLI_ENABLED')
    expect(content).toContain('docker-compose-openclaw.yml')
    expect(content).toContain('docker-compose.host-cli.yml')
  })

  it('provides a dev compose file for MC_MODE=dev', () => {
    const content = readFileSync(resolve(ROOT, 'docker-compose-dev.yml'), 'utf-8')
    expect(content).toContain('container_name: mission-control-dev')
    expect(content).toContain('target: deps')
    expect(content).toContain('pnpm dev --hostname 0.0.0.0')
  })

  it('provides an OpenClaw sidecar overlay', () => {
    const content = readFileSync(resolve(ROOT, 'docker-compose-openclaw.yml'), 'utf-8')
    expect(content).toContain('mc-openclaw-gateway')
    expect(content).toContain('ghcr.io/openclaw/openclaw:latest')
    expect(content).toContain('source: /var/run/docker.sock')
    expect(content).toContain('create_host_path: false')
    expect(content).toContain('OPENCLAW_SECURITY_SANDBOX_ALL')
  })

  it('keeps host CLI mounts in an explicit opt-in overlay', () => {
    const base = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')
    const hostCli = readFileSync(resolve(ROOT, 'docker-compose.host-cli.yml'), 'utf-8')

    expect(base).not.toContain('${HOME:?HOME must be set}')
    expect(hostCli).toContain('${HOME:?HOME must be set}/.local/bin')
    expect(hostCli).toContain('/home/nextjs/.claude')
    expect(hostCli).toContain('MC_HOST_SESSION_MODE')
  })

  it('provides a local Dokploy-parity compose stack through Traefik', () => {
    const content = readFileSync(resolve(ROOT, 'docker-compose.dokploy.yml'), 'utf-8')
    expect(content).toContain('dokploy-traefik')
    expect(content).toContain('image: ${DOKPLOY_TRAEFIK_IMAGE:-traefik:v3.7.5}')
    expect(content).toContain('--entrypoints.web.forwardedHeaders.insecure=true')
    expect(content).toContain('expose:')
    expect(content).toContain('traefik.http.routers.opzava-dokploy-local.rule')
    expect(content).toContain('traefik.http.services.opzava-dokploy-local.loadbalancer.server.port')
    expect(content).toContain('traefik.http.services.opzava-dokploy-local.loadbalancer.sticky.cookie=true')
    expect(content).toContain('opzava_dokploy_affinity')
    expect(content).toContain('env_file:')
    expect(content).toContain('read_only: true')
    expect(content).toContain('mc-openclaw-gateway')
    expect(content).not.toContain('container_name: opzava-dokploy-app')
    expect(content).not.toContain('"${MC_PORT:-3000}:${PORT:-3000}"')
  })

  it('provides a Dokploy Playwright config that targets an existing Docker stack', () => {
    const content = readFileSync(resolve(ROOT, 'playwright.dokploy.config.ts'), 'utf-8')
    expect(content).toContain('opzava.localhost')
    expect(content).toContain('3080')
    expect(content).toContain('Intentionally no webServer')
    expect(content).not.toContain('webServer:')
  })

  it('provides a Dokploy parity smoke/deep-test runner', () => {
    const content = readFileSync(resolve(ROOT, 'scripts/dokploy-parity-test.sh'), 'utf-8')
    expect(content).toContain('docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE"')
    expect(content).toContain('docker inspect "$container_id"')
    expect(content).toContain('NetworkSettings.Ports')
    expect(content).toContain('Traefik-routed SSE stream passed')
    expect(content).toContain('/api/events')
    expect(content).toContain('/ws/pty')
    expect(content).toContain('Traefik-routed PTY WebSocket upgrade passed')
    expect(content).toContain('DOKPLOY_PARITY_RUN_E2E')
    expect(content).toContain('playwright.dokploy.config.ts')
  })

  it('starts local standalone through the same PTY wrapper', () => {
    const content = readFileSync(resolve(ROOT, 'scripts/start-standalone.sh'), 'utf-8')
    expect(content).toContain('NEXT_STANDALONE_DIR')
    expect(content).toContain('scripts/mc-server.cjs')
    expect(content).not.toContain('exec node server.js')
  })

  it('keeps production wrapper scripts in the Docker build context', () => {
    const content = readFileSync(resolve(ROOT, '.dockerignore'), 'utf-8')
    expect(content).toContain('scripts/*')
    expect(content).toContain('!scripts/mc-server.cjs')
    expect(content).toContain('!scripts/pty-websocket-standalone.cjs')
  })
})
