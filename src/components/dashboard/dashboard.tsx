'use client'

import { useEffect, useState } from 'react'
import { useNavigateToPanel } from '@/lib/navigation'

/**
 * Overview — a faithful port of docs/architecture/ux-redesign/mockups/shell-overview.html
 * (the page body): KPI stat-grid · Agent-fleet table · Live-activity feed · 7-day Spend chart.
 *
 * Parity-first: the content below mirrors the mockup's demo data 1:1. Real data is wired in
 * a later pass — keep the markup/classes stable so wiring is a data swap, not a re-layout.
 */

type Tone = 'accent' | 'surface' | 'warning' | 'danger'
const AVATAR_BG: Record<Tone, string> = {
  accent: 'var(--accent-soft)', surface: 'var(--surface-3)', warning: 'var(--warning-soft)', danger: 'var(--danger-soft)',
}
const AVATAR_FG: Record<Tone, string> = {
  accent: 'var(--accent)', surface: 'var(--fg-muted)', warning: 'var(--warning)', danger: 'var(--danger)',
}

const FLEET: Array<{ name: string; init: string; tone: Tone; status: string; dot: string; tasks: string; cost: string }> = [
  { name: 'Atlas-7', init: 'A7', tone: 'accent', status: 'Running', dot: 'dot-success', tasks: '2', cost: '$1.42' },
  { name: 'Iris', init: 'IR', tone: 'surface', status: 'Idle', dot: '', tasks: '0', cost: '$0.18' },
  { name: 'Nexus-3', init: 'N3', tone: 'warning', status: 'Degraded', dot: 'dot-warning', tasks: '1', cost: '$3.07' },
  { name: 'Echo', init: 'EC', tone: 'danger', status: 'Offline', dot: 'dot-danger', tasks: '—', cost: '$0.64' },
  { name: 'Cipher', init: 'CP', tone: 'accent', status: 'Running', dot: 'dot-success', tasks: '1', cost: '$8.89' },
]

const SPEND_BARS = [
  { h: '42%', op: 0.55, title: 'Mon $8.40' },
  { h: '60%', op: 0.65, title: 'Tue $11.20' },
  { h: '52%', op: 0.6, title: 'Wed $9.80' },
  { h: '68%', op: 0.7, title: 'Thu $13.50' },
  { h: '55%', op: 0.63, title: 'Fri $10.90' },
  { h: '38%', op: 0.5, title: 'Sat $7.60' },
  { h: '72%', op: 1, title: 'Today $14.20', today: true },
]
const SPEND_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today']

const ArrowUp = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ArrowDown = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M5 2v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Dashboard() {
  const navigateToPanel = useNavigateToPanel()
  const [today, setToday] = useState('')

  // Client-only date (avoids SSR/client hydration mismatch on the dated subtitle).
  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  }, [])

  return (
    <div className="page">
      <div className="page-stack">

        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Overview</h1>
            <p className="page-sub">AI operations dashboard{today ? ` — ${today}` : ''}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigateToPanel('tasks')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New task
          </button>
        </div>

        {/* KPI stat grid */}
        <div className="stat-grid" aria-label="Key performance indicators">
          <div className="stat">
            <div className="stat-label">Active agents</div>
            <div className="stat-value u-tnum">6</div>
            <div className="stat-delta up" aria-label="Up 1 from yesterday"><ArrowUp /> +1 vs yesterday</div>
          </div>
          <div className="stat">
            <div className="stat-label">Tasks running</div>
            <div className="stat-value u-tnum">3</div>
            <div className="stat-delta u-subtle" aria-label="No change">— stable</div>
          </div>
          <div className="stat">
            <div className="stat-label">Spend today</div>
            <div className="stat-value u-tnum">$14.20</div>
            <div className="stat-delta down" aria-label="Down 8% versus daily average"><ArrowDown /> −8% vs avg</div>
          </div>
          <div className="stat">
            <div className="stat-label">Sessions today</div>
            <div className="stat-value u-tnum">24</div>
            <div className="stat-delta up" aria-label="Up 6 versus yesterday"><ArrowUp /> +6 vs yesterday</div>
          </div>
          <div className="stat">
            <div className="stat-label">Memory used</div>
            <div className="stat-value u-tnum">62%</div>
            <div className="stat-delta up" aria-label="Up 4 percentage points"><ArrowUp /> +4pp this week</div>
          </div>
        </div>

        {/* Two-column: Agent fleet + Live activity */}
        <div className="two-col-grid">

          {/* Agent fleet */}
          <section aria-labelledby="fleet-heading">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title" id="fleet-heading">Agent fleet</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigateToPanel('agents')}>View all</button>
              </div>
              <div className="fleet-table-wrap">
                <table className="table" aria-label="Agent fleet status">
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="num">Tasks</th>
                      <th scope="col" className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FLEET.map((a) => (
                      <tr key={a.name}>
                        <td>
                          <div className="u-row">
                            <span
                              aria-hidden="true"
                              style={{ width: 24, height: 24, borderRadius: 'var(--radius-full)', background: AVATAR_BG[a.tone], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', color: AVATAR_FG[a.tone], fontWeight: 'var(--fw-semibold)', flex: 'none' }}
                            >{a.init}</span>
                            <span>{a.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="u-row" aria-label={a.status}>
                            <span className={`dot ${a.dot}`} aria-hidden="true" />
                            {a.status}
                          </span>
                        </td>
                        <td className={`num${a.tasks === '—' ? ' u-subtle' : ''}`}>{a.tasks}</td>
                        <td className="num u-mono">{a.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Live activity */}
          <section aria-labelledby="activity-heading">
            <div className="card">
              <div className="card-header">
                <div className="activity-live-header">
                  <h2 className="card-title" id="activity-heading">Live activity</h2>
                  <span className="dot dot-success live" aria-hidden="true" style={{ marginLeft: 'var(--space-1)' }} />
                  <span className="live-indicator" style={{ marginLeft: 2 }}><span aria-label="Live feed active">Live</span></span>
                </div>
                <span className="badge badge-accent">Real-time</span>
              </div>

              <div role="log" aria-label="Live system activity feed" aria-live="polite">
                <div className="activity-row">
                  <span className="dot dot-success" aria-hidden="true" />
                  <span className="activity-time">10:42:07</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>Atlas-7</span>
                    <span className="u-muted"> — </span>
                    Task &quot;Summarize Q2 report&quot; completed
                  </span>
                </div>
                <div className="activity-row">
                  <span className="dot" aria-hidden="true" />
                  <span className="activity-time">10:41:55</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-xs)' }}>Iris</span>
                    <span className="u-muted"> — </span>
                    Heartbeat OK
                  </span>
                </div>
                <div className="activity-row">
                  <span className="dot dot-accent" aria-hidden="true" />
                  <span className="activity-time">10:41:50</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>Nexus-3</span>
                    <span className="u-muted"> — </span>
                    Tool call: <code style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>web_search(&quot;AI market 2026&quot;)</code>
                  </span>
                </div>
                <div className="activity-row">
                  <span className="dot dot-warning" aria-hidden="true" />
                  <span className="activity-time">10:41:44</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)' }}>System</span>
                    <span className="u-muted"> — </span>
                    SSE reconnected after 3s gap
                  </span>
                </div>
                <div className="activity-row">
                  <span className="dot dot-success" aria-hidden="true" />
                  <span className="activity-time">10:41:30</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>Cipher</span>
                    <span className="u-muted"> — </span>
                    Task &quot;Draft partner email&quot; assigned
                  </span>
                </div>
                <div className="activity-row" style={{ borderLeft: '2px solid var(--danger)' }}>
                  <span className="dot dot-danger" aria-hidden="true" />
                  <span className="activity-time">10:41:20</span>
                  <span className="activity-text">
                    <span className="u-mono" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>Echo</span>
                    <span className="u-muted"> — </span>
                    Went offline — gateway timeout
                  </span>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Spend — last 7 days */}
        <section aria-labelledby="spend-heading">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" id="spend-heading">Spend — last 7 days</h2>
              <div className="u-row">
                <span className="u-subtle u-mono" style={{ fontSize: 'var(--text-xs)' }}>Budget $50.00</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigateToPanel('costs')}>Details</button>
              </div>
            </div>
            <div className="card-body">
              <div className="spend-chart" role="img" aria-label="Spend bar chart: Mon $8.40, Tue $11.20, Wed $9.80, Thu $13.50, Fri $10.90, Sat $7.60, Sun $14.20">
                {SPEND_BARS.map((b) => (
                  <div
                    key={b.title}
                    className="spend-chart-bar"
                    style={{ height: b.h, background: b.today ? 'var(--accent)' : 'var(--chart-1)', opacity: b.op }}
                    title={b.title}
                  />
                ))}
              </div>
              <div className="spend-chart-labels">
                {SPEND_LABELS.map((l) => (
                  <span
                    key={l}
                    className={l === 'Today' ? 'u-accent' : 'u-subtle'}
                    style={{ fontSize: 'var(--text-xs)', fontWeight: l === 'Today' ? 'var(--fw-medium)' : undefined }}
                  >{l}</span>
                ))}
              </div>

              <hr />

              <div className="spend-row">
                <span>Total today: <strong className="u-mono">$14.20</strong></span>
                <span className="spend-row-sep" aria-hidden="true">·</span>
                <span className="u-muted">Budget: <span className="u-mono">$50.00</span></span>
                <span className="spend-row-sep" aria-hidden="true">·</span>
                <span className="u-muted">28.4% used</span>
                <div className="u-grow" />
                <div style={{ flex: 'none', width: 140 }}>
                  <div className="progress" role="progressbar" aria-valuenow={28} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used: 28.4%">
                    <i style={{ width: '28.4%' }} />
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigateToPanel('costs')}>View breakdown</button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
