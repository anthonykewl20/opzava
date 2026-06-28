import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Tests that docker-compose.yml and Dockerfile contain the expected
 * configuration for Compose v5+ compatibility and complete runtime assets.
 */

const ROOT = resolve(__dirname, '../../..')

const countServiceDefinitions = (content: string, serviceName: string) => {
  const escapedName = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.match(new RegExp(`^  ${escapedName}:\\s*$`, 'gm'))?.length ?? 0
}

const composeServiceBlock = (content: string, serviceName: string) => {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => line.trimEnd() === `  ${serviceName}:`)

  expect(start).toBeGreaterThanOrEqual(0)

  if (start < 0) {
    return ''
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^(?:[A-Za-z0-9_-]+|  [A-Za-z0-9_-]+):\s*$/.test(lines[index])) {
      end = index
      break
    }
  }

  return lines.slice(start, end).join('\n')
}

const withoutCommentLines = (content: string) =>
  content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

describe('docker-compose.yml schema', () => {
  const content = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')

  it('defines each base runtime service once without a standalone profile', () => {
    expect(countServiceDefinitions(content, 'dokploy-traefik')).toBe(1)
    expect(countServiceDefinitions(content, 'mission-control')).toBe(1)
    expect(countServiceDefinitions(content, 'mc-openclaw-gateway')).toBe(1)
    expect(content).not.toContain('profiles:')
  })

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

  it('injects the browser gateway host at container runtime', () => {
    const missionControl = composeServiceBlock(content, 'mission-control')

    expect(missionControl).toContain('PUBLIC_GATEWAY_HOST: ${PUBLIC_GATEWAY_HOST:-}')
    expect(content).toContain('NEXT_PUBLIC_GATEWAY_HOST: ${NEXT_PUBLIC_GATEWAY_HOST:-}')
  })

  it('exposes gateway-free direct dispatch env to the container', () => {
    expect(content).toContain('ANTHROPIC_API_KEY:')
    expect(content).toContain('OPENAI_API_KEY:')
    expect(content).toContain('LOCAL_LLM_ENDPOINT:')
    expect(content).toContain('MC_HOST_SESSION_MODE:')
  })

  it('advertises local Dokploy hostnames to mission-control', () => {
    const missionControl = composeServiceBlock(content, 'mission-control')

    expect(missionControl).toContain('extra_hosts:')
    expect(missionControl).toContain('"opzava.localhost:127.0.0.1"')
    expect(missionControl).toContain('"opzava-gateway.localhost:127.0.0.1"')
  })

  it('mounts hermes data writable in the gateway and read-only in mission-control', () => {
    const gateway = composeServiceBlock(content, 'mc-openclaw-gateway')
    const missionControl = composeServiceBlock(content, 'mission-control')

    expect(gateway).toContain('- hermes-data:/home/node/.hermes')
    expect(gateway).not.toContain('- hermes-data:/home/node/.hermes:ro')
    expect(missionControl).toContain('- hermes-data:/home/nextjs/.hermes:ro')
  })

  it('declares an OpenClaw gateway healthcheck', () => {
    const gateway = composeServiceBlock(content, 'mc-openclaw-gateway')

    expect(gateway).toContain('healthcheck:')
    expect(gateway).toContain('/health')
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

  it('declares legacy NEXT_PUBLIC build arg placeholders used by existing deployments', () => {
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
    expect(content).toContain('dev) files="-f docker-compose.yml -f docker-compose.dev.yml"')
    expect(content).toContain('parity|prod|\'\') files="-f docker-compose.yml -f docker-compose.parity.yml"')
    expect(content).toContain('MC_HOST_CLI_ENABLED')
    expect(content).toContain('docker-compose.host-cli.yml')
  })

  it('provides a dev compose file for MC_MODE=dev', () => {
    const content = readFileSync(resolve(ROOT, 'docker-compose.dev.yml'), 'utf-8')
    expect(content).toContain('container_name: mission-control-dev')
    expect(content).toContain('pnpm dev --hostname 0.0.0.0')
    expect(content).toContain('- .:/app')
    expect(content).toContain('read_only: false')
    expect(content).toContain('NODE_ENV: development')
  })

  it('defines the OpenClaw gateway in the base compose stack', () => {
    const content = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')
    const gateway = composeServiceBlock(content, 'mc-openclaw-gateway')
    const missionControl = composeServiceBlock(content, 'mission-control')

    expect(countServiceDefinitions(content, 'mc-openclaw-gateway')).toBe(1)
    expect(gateway).toContain('ghcr.io/openclaw/openclaw')
    // base services must NOT hardcode container_name — global names collide with
    // an operator's standalone containers (mission-control, mc-openclaw-gateway)
    // and block the stack. Only the dev override may pin a name (mission-control-dev).
    expect(content).not.toContain('container_name:')
    expect(gateway).toContain('- openclaw-data:/home/node/.openclaw')
    expect(gateway).toContain('- hermes-data:/home/node/.hermes')
    expect(missionControl).toContain('OPENCLAW_STATE_DIR: /home/nextjs/.openclaw')
    expect(missionControl).toContain('OPENCLAW_CONFIG_PATH: /home/nextjs/.openclaw/openclaw.json')
    expect(missionControl).toContain('OPENCLAW_GATEWAY_TOKEN:')
    expect(missionControl).toContain('- openclaw-data:/home/nextjs/.openclaw:ro')
    expect(missionControl).toContain('- hermes-data:/home/nextjs/.hermes:ro')
    expect(withoutCommentLines(content)).not.toContain('/root/.openclaw')
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
    const wrapper = readFileSync(resolve(ROOT, 'docker-compose.dokploy.yml'), 'utf-8')
    const base = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')

    expect(wrapper).toContain('include:')
    expect(wrapper).toContain('- docker-compose.yml')
    expect(wrapper).toContain('- docker-compose.parity.yml')
    expect(wrapper).not.toContain('services:')

    expect(base).toContain('dokploy-traefik')
    expect(base).toContain('image: ${DOKPLOY_TRAEFIK_IMAGE:-traefik:v3.7.5}')
    expect(base).toContain('--entrypoints.web.forwardedHeaders.insecure=true')
    expect(base).toContain('expose:')
    expect(base).toContain('traefik.http.routers.opzava.rule')
    expect(base).toContain('traefik.http.services.opzava.loadbalancer.server.port')
    expect(base).toContain('opzava_dokploy_affinity')
    expect(base).toContain('env_file:')
    expect(base).toContain('read_only: true')
    expect(base).toContain('traefik.http.routers.opzava-gateway.rule')
    expect(base).toContain('mc-openclaw-gateway')
    expect(base).not.toContain('container_name: opzava-dokploy-app')
    expect(base).not.toContain('"${MC_PORT:-3000}:${PORT:-3000}"')
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
