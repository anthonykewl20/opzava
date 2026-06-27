'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

// Static visual port of mockups/orchestrator-chat.html ("Ask Opzava").
// Renders INSIDE the shared shell (rail + header live elsewhere); this is the
// chat panel only. No API calls — light interactivity via local React state.
// Styling comes entirely from the scoped `.opzava-ds` classes in opzava-ds.css.
export function OrchestratorChatPanel() {
  const [toolOpen, setToolOpen] = useState(false)
  const [approved, setApproved] = useState(false)
  const [chase, setChase] = useState<null | 'yes' | 'no'>(null)
  const [msg, setMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function toggleTool() {
    setToolOpen((open) => !open)
  }

  function handleToolKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleTool()
    }
  }

  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function send() {
    if (!msg.trim()) return
    // In the real app this would POST to /api/chat/messages with a coord: prefix.
    setMsg('')
    const el = textareaRef.current
    if (el) el.style.height = 'auto'
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    send()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-panel">
      {/* ── Page title strip (static, not inside the log) ── */}
      <div className="chat-titlebar">
        <div className="chat-titlebar-inner">
          <div className="u-row" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--fg)' }}>
              Ask Opzava
            </span>
            <span className="u-subtle" style={{ fontSize: 'var(--text-xs)' }}>·</span>
            <span className="u-subtle" style={{ fontSize: 'var(--text-xs)' }}>
              Cross-project oversight — not tied to any single project
            </span>
          </div>
        </div>
      </div>

      {/* ── Chat log ── */}
      <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation with Opzava">
        <div className="chat-log-inner">

          {/* ── MSG 1 · Opzava proactive digest (opens the thread) ── */}
          <div className="chat-row">
            <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">O</span>
            <div className="chat-stack" style={{ maxWidth: '80%' }}>
              <div className="chat-meta">
                <strong>Opzava</strong>
                <span className="sb-badge sb-badge--accent">✦ AI</span>
                <span className="chat-time">Today 8:00</span>
              </div>
              <div className="chat-bubble">
                <p style={{ margin: '0 0 var(--space-2)' }}>
                  Good morning. Here&apos;s where everything stands across your projects right now.
                </p>

                {/* Digest card: one row per project */}
                <div className="digest-card" role="table" aria-label="Project status digest">
                  <div
                    className="digest-row"
                    role="row"
                    style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                  >
                    <span
                      className="u-subtle"
                      role="columnheader"
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', flex: 'none', minWidth: '96px' }}
                    >
                      Status
                    </span>
                    <span
                      className="u-subtle"
                      role="columnheader"
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', flex: 1 }}
                    >
                      Project
                    </span>
                  </div>

                  {/* On track */}
                  <div className="digest-row" role="row">
                    <span className="digest-pill digest-pill--ok" role="cell">
                      <span aria-hidden="true">●</span> On track
                    </span>
                    <div className="digest-summary" role="cell">
                      <a href="#" style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)', textDecoration: 'none' }} aria-label="Open Q2 Content Push project assistant">Q2 Content Push</a>
                      <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>— 3 tasks running, Atlas drafted June newsletter.</span>
                    </div>
                    <div className="digest-actions" role="cell">
                      <a href="#" className="btn btn-sm btn-ghost">Review</a>
                    </div>
                  </div>

                  {/* Needs you */}
                  <div className="digest-row" role="row" style={{ background: 'var(--warning-soft)' }}>
                    <span className="digest-pill digest-pill--warn" role="cell">
                      <span aria-hidden="true">▲</span> Needs you
                    </span>
                    <div className="digest-summary" role="cell">
                      <a href="#" style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)', textDecoration: 'none' }} aria-label="Open Series B Outreach project assistant">Series B Outreach</a>
                      <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>— Cipher drafted the investor email. Your approval is required before it sends.</span>
                    </div>
                    <div className="digest-actions" role="cell">
                      <a href="#" className="btn btn-sm btn-ghost" aria-label="Review Series B approval">Review</a>
                    </div>
                  </div>

                  {/* On track */}
                  <div className="digest-row" role="row">
                    <span className="digest-pill digest-pill--ok" role="cell">
                      <span aria-hidden="true">●</span> On track
                    </span>
                    <div className="digest-summary" role="cell">
                      <a href="#" style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)', textDecoration: 'none' }}>Market Research</a>
                      <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>— Nexus completed competitor analysis, report ready for export.</span>
                    </div>
                    <div className="digest-actions" role="cell">
                      <a href="#" className="btn btn-sm btn-ghost">Review</a>
                    </div>
                  </div>

                  {/* On track */}
                  <div className="digest-row" role="row">
                    <span className="digest-pill digest-pill--ok" role="cell">
                      <span aria-hidden="true">●</span> On track
                    </span>
                    <div className="digest-summary" role="cell">
                      <a href="#" style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)', textDecoration: 'none' }}>Customer Support</a>
                      <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>— Echo handled 12 tickets today, 1 escalation awaiting Maria.</span>
                    </div>
                    <div className="digest-actions" role="cell">
                      <a href="#" className="btn btn-sm btn-ghost">Review</a>
                    </div>
                  </div>

                  {/* Blocked */}
                  <div className="digest-row" role="row" style={{ background: 'var(--danger-soft)' }}>
                    <span className="digest-pill digest-pill--err" role="cell">
                      <span aria-hidden="true">✕</span> Blocked
                    </span>
                    <div className="digest-summary" role="cell">
                      <a href="#" style={{ color: 'var(--fg)', fontWeight: 'var(--fw-medium)', textDecoration: 'none' }}>Weekly Ops</a>
                      <span className="u-muted" style={{ marginLeft: 'var(--space-2)' }}>— Standup report stalled: connection to Notion workspace timed out.</span>
                    </div>
                    <div className="digest-actions" role="cell">
                      <a href="#" className="btn btn-sm btn-ghost" aria-label="Fix Weekly Ops connection">Fix</a>
                    </div>
                  </div>
                </div>{/* /digest-card */}

                <div className="u-row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Want me to chase the blocker on Weekly Ops?</span>
                  <button className="btn btn-sm btn-primary" type="button" disabled={chase !== null} onClick={() => setChase('yes')}>
                    {chase === 'yes' ? '✓ On it' : 'Yes'}
                  </button>
                  <button className="btn btn-sm btn-ghost" type="button" disabled={chase !== null} onClick={() => setChase('no')}>
                    {chase === 'no' ? 'Got it' : 'No'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── MSG 2 · User message ── */}
          <div className="chat-row chat-row--user">
            <span className="sb-avatar" style={{ background: 'var(--chart-2)', flex: 'none' }} aria-label="You">AG</span>
            <div className="chat-stack">
              <div className="chat-meta">
                <strong>You</strong>
                <span className="chat-time">9:02</span>
              </div>
              <div className="chat-bubble chat-bubble--user">
                How&apos;s everything today?
              </div>
            </div>
          </div>

          {/* ── MSG 3 · Opzava reply with tool card + status pill ── */}
          <div className="chat-row">
            <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">O</span>
            <div className="chat-stack" style={{ maxWidth: '80%' }}>
              <div className="chat-meta">
                <strong>Opzava</strong>
                <span className="sb-badge sb-badge--accent">✦ AI</span>
                <span className="chat-time">9:02</span>
              </div>
              <div className="chat-bubble">
                4 projects active, 1 needs your attention. <strong>Series B Outreach</strong> is <span style={{ color: 'var(--danger)', fontWeight: 'var(--fw-semibold)' }}>BLOCKED on your approval</span> — Cipher&apos;s investor email has been ready for 47 minutes and won&apos;t go out until you sign off.
              </div>

              {/* Tool card: collapsible standup.report run */}
              <div className="chat-tool-card" role="group" aria-label="Tool call: standup.report">
                <div
                  className="chat-tool-head"
                  role="button"
                  tabIndex={0}
                  aria-expanded={toolOpen}
                  aria-controls="toolBody"
                  onClick={toggleTool}
                  onKeyDown={handleToolKey}
                >
                  <span aria-hidden="true" style={{ color: 'var(--fg-subtle)' }}>⚙</span>
                  <span className="tname">standup.report</span>
                  <span className="sb-badge sb-badge--success" style={{ marginLeft: 'auto' }}>✓ done</span>
                  <span aria-hidden="true" style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>{toolOpen ? '▾' : '▸'}</span>
                </div>
                <div className={`chat-tool-body${toolOpen ? ' is-open' : ''}`} id="toolBody" role="region" aria-label="standup.report output">
                  <div className="ln"><span className="tag t-cmd">$</span><span className="t-cmd">standup.report --scope=all-projects --user=AG</span></div>
                  <div className="ln"><span className="tag t-think">scan</span><span>Checking 5 active projects via /api/ops/tasks and /api/campaigns…</span></div>
                  <div className="ln"><span className="tag t-tool">data</span><span>Q2 Content Push: 3 tasks in-flight, 0 blocked</span></div>
                  <div className="ln"><span className="tag t-tool">data</span><span>Series B Outreach: approval pending 47m → status=<span style={{ color: 'var(--danger)' }}>BLOCKED</span></span></div>
                  <div className="ln"><span className="tag t-tool">data</span><span>Market Research: report ready, no pending approvals</span></div>
                  <div className="ln"><span className="tag t-tool">data</span><span>Customer Support: 12 tickets closed, 1 escalation → Maria</span></div>
                  <div className="ln"><span className="tag t-warn">warn</span><span>Weekly Ops: Notion connection timeout — run ID wr-8821 stalled since 07:41</span></div>
                  <div className="ln"><span className="tag t-ok">done</span><span className="t-ok">Report complete · 4 active · 1 needs-you · 1 blocked</span></div>
                </div>
              </div>

              {/* Status pill: downstream coordination in progress */}
              <div className="chat-status-pill" role="status">
                <span aria-hidden="true">◔</span>
                coordinating downstream agents…
              </div>
            </div>
          </div>

          {/* ── MSG 4 · Inline ACTION bubble (the ONE accent action) ── */}
          <div className="chat-row">
            <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">O</span>
            <div className="chat-stack" style={{ maxWidth: '80%' }}>
              <div className="chat-meta">
                <strong>Opzava</strong>
                <span className="sb-badge sb-badge--accent">✦ AI</span>
                <span className="chat-time">9:02</span>
              </div>
              <div className="action-bubble" role="group" aria-label="Action required: Series B approval">
                <div className="action-bubble-title">
                  <span aria-hidden="true">▲</span> Series B Outreach needs your approval
                </div>
                <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
                  Cipher drafted the investor follow-up email (220 words). It&apos;s addressed to 8 Series B leads from last week&apos;s intro call. Tone: professional, confident. No sensitive data detected.
                </p>
                <div className="action-row">
                  {/* ONE accent action: approve */}
                  <button
                    className="btn btn-primary"
                    type="button"
                    aria-label="Approve Series B email and send"
                    disabled={approved}
                    onClick={() => setApproved(true)}
                  >
                    {approved ? '✓ Sent' : <><span aria-hidden="true">✓</span> Approve &amp; send</>}
                  </button>
                  <button className="btn btn-ghost" type="button">Request changes</button>
                  <a href="#" className="btn btn-ghost btn-sm u-subtle" style={{ marginLeft: 'auto' }}>View full draft ↗</a>
                </div>
              </div>
            </div>
          </div>

          {/* ── Inline approval confirmation (shown only after approval) ── */}
          {approved && (
            <div className="chat-row">
              <span className="sb-avatar sb-avatar--ai" style={{ background: 'var(--chart-6)', flex: 'none' }} aria-label="Opzava AI">O</span>
              <div className="chat-stack" style={{ maxWidth: '80%' }}>
                <div className="chat-meta">
                  <strong>Opzava</strong>
                  <span className="sb-badge sb-badge--accent">✦ AI</span>
                  <span className="chat-time">9:03</span>
                </div>
                <div className="chat-bubble">
                  <span style={{ color: 'var(--success)' }}>✓</span> Approved. Cipher is sending the email now — you&apos;ll get a delivery confirmation in Activity.
                </div>
              </div>
            </div>
          )}

        </div>{/* /chat-log-inner */}
      </div>{/* /chat-log */}

      {/* ── Composer (pinned) ── */}
      <div className="composer-wrap">
        <form className="composer" role="search" aria-label="Message Opzava" onSubmit={handleSubmit}>
          <label htmlFor="msgInput" className="u-sr-only">Message Opzava</label>
          <textarea
            id="msgInput"
            ref={textareaRef}
            rows={1}
            placeholder="Message Opzava…"
            aria-label="Message Opzava"
            autoComplete="off"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onInput={resize}
            onKeyDown={handleKeyDown}
          />
          <span className="composer-hint" aria-hidden="true"><kbd className="kbd">↵</kbd> send</span>
          <button className="composer-send" type="submit" aria-label="Send message">↑</button>
        </form>
      </div>
    </div>
  )
}
