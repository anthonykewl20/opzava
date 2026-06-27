import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/openclaw/openclaw/releases/latest'
const DOCKER_UPDATE_COMMAND = 'OPENCLAW_ENABLED=1 make upgrade openclaw'

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

const headers = { 'Cache-Control': 'public, max-age=3600' }

function parseGatewayVersion(res: Response, body: string): string | null {
  const direct = res.headers.get('x-openclaw-version') || res.headers.get('x-clawdbot-version')
  if (direct) return direct.trim().replace(/^v/, '')

  const server = res.headers.get('server') || ''
  const fromServer = server.match(/(\d{4}\.\d+\.\d+)/)
  if (fromServer) return fromServer[1]!

  const fromBody = body.match(/(\d{4}\.\d+\.\d+)/)
  return fromBody?.[1] || null
}

export async function GET() {
  let installed: string | null = null

  try {
    const res = await fetch(`http://${config.gatewayHost}:${config.gatewayPort}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    const body = await res.text().catch(() => '')
    if (res.ok) installed = parseGatewayVersion(res, body)
  } catch {
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false, updateMode: 'docker' },
      { headers }
    )
  }

  if (!installed) {
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false, updateMode: 'docker' },
      { headers }
    )
  }

  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { installed, latest: null, updateAvailable: false, updateMode: 'docker' },
        { headers }
      )
    }

    const release = await res.json()
    const latest = (release.tag_name ?? '').replace(/^v/, '')
    const updateAvailable = compareSemver(latest, installed) > 0

    return NextResponse.json(
      {
        installed,
        latest,
        updateAvailable,
        releaseUrl: release.html_url ?? '',
        releaseNotes: release.body ?? '',
        updateCommand: DOCKER_UPDATE_COMMAND,
        updateMode: 'docker',
      },
      { headers }
    )
  } catch {
    return NextResponse.json(
      { installed, latest: null, updateAvailable: false, updateMode: 'docker' },
      { headers }
    )
  }
}
