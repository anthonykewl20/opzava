'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'

type Tab = 'status' | 'health' | 'models' | 'apicall'

const PRE_STYLE: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-muted)',
  overflowX: 'auto',
  maxHeight: '24rem',
  margin: 0,
}

const KV_TH_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-muted)',
  fontWeight: 500,
  padding: 'var(--space-2) var(--space-4) var(--space-2) 0',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
  width: 160,
}

const KV_TD_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg)',
  padding: 'var(--space-2) 0',
  verticalAlign: 'top',
}

const ROW_BORDER: React.CSSProperties = { borderBottom: '1px solid var(--border)' }

export function DebugPanel() {
  const t = useTranslations('debug')
  const [activeTab, setActiveTab] = useState<Tab>('status')

  const tabLabels: Record<Tab, string> = {
    status: t('tabStatus'),
    health: t('tabHealth'),
    models: t('tabModels'),
    apicall: t('tabApiCall'),
  }

  return (
    <div className="opzava-ds m-4" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* Advanced warning banner */}
      <div className="banner banner-warning mb-4" role="note" aria-label="Advanced debugging surface">
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          aria-hidden="true"
          style={{ flex: 'none', color: 'var(--warning)' }}
        >
          <path d="M8 2 1.5 13.5h13L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>
          <strong>Advanced</strong> — internal state for debugging. Changes here can affect the running system.
        </span>
      </div>

      {/* Tab bar */}
      <div className="tabs mb-4" role="tablist" aria-label={t('tabStatus') + ' sections'}>
        {(['status', 'health', 'models', 'apicall'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'status' && <StatusTab />}
      {activeTab === 'health' && <HealthTab />}
      {activeTab === 'models' && <ModelsTab />}
      {activeTab === 'apicall' && <ApiCallTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status Tab
// ---------------------------------------------------------------------------

function StatusTab() {
  const t = useTranslations('debug')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/debug?action=status')
      setData(await res.json())
    } catch {
      setData({ error: 'Failed to fetch status' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const reachable = data && !data.gatewayReachable === false && data.gatewayReachable !== false

  return (
    <div className="card">
      {/* Card header: gateway status + refresh */}
      <div className="card-header">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{t('gateway')}</span>
          {loading ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('checking')}</span>
          ) : (
            <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
              <span
                className={`dot ${reachable ? 'dot-success' : 'dot-danger'}`}
                aria-hidden="true"
              />
              {reachable ? t('reachable') : t('unreachable')}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={fetchStatus}
          disabled={loading}
        >
          {t('refresh')}
        </button>
      </div>

      {/* Card body: raw JSON */}
      <div className="card-body">
        <pre style={PRE_STYLE}>
          {loading ? t('loading') : JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Health Tab
// ---------------------------------------------------------------------------

function HealthTab() {
  const t = useTranslations('debug')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [heartbeat, setHeartbeat] = useState<{ ok: boolean; latencyMs: number; timestamp: number } | null>(null)
  const [hbLoading, setHbLoading] = useState(false)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/debug?action=health')
      setData(await res.json())
    } catch {
      setData({ healthy: false, error: 'Failed to fetch' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  const pingHeartbeat = async () => {
    setHbLoading(true)
    try {
      const res = await fetch('/api/debug?action=heartbeat')
      setHeartbeat(await res.json())
    } catch {
      setHeartbeat({ ok: false, latencyMs: -1, timestamp: Date.now() })
    } finally {
      setHbLoading(false)
    }
  }

  const healthy = data?.healthy === true || (data && !data.error && data.healthy !== false)

  return (
    <div className="card">
      {/* Card header: health status + actions */}
      <div className="card-header" style={{ flexWrap: 'wrap', rowGap: 'var(--space-2)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap" style={{ rowGap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{t('health')}</span>
          {loading ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('checking')}</span>
          ) : (
            <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
              <span
                className={`dot ${healthy ? 'dot-success' : 'dot-danger'}`}
                aria-hidden="true"
              />
              {healthy ? t('healthy') : t('unhealthy')}
            </span>
          )}
          {heartbeat && (
            <span
              className="flex items-center gap-1.5"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}
            >
              <span className={`dot ${heartbeat.ok ? 'dot-success' : 'dot-danger'}`} aria-hidden="true" />
              {heartbeat.ok ? t('ok') : t('failed')}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)' }}>
                {heartbeat.latencyMs}ms
              </span>
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-none">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fetchHealth}
            disabled={loading}
          >
            {t('refresh')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={pingHeartbeat}
            disabled={hbLoading}
          >
            {hbLoading ? t('pinging') : t('heartbeat')}
          </button>
        </div>
      </div>

      {/* Card body: KV table */}
      {data && !loading && (
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(data).map(([key, value]) => (
                <tr key={key} style={ROW_BORDER}>
                  <th scope="row" style={KV_TH_STYLE}>{key}</th>
                  <td style={KV_TD_STYLE}>
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Models Tab
// ---------------------------------------------------------------------------

interface ModelEntry {
  name?: string
  id?: string
  provider?: string
  context_length?: number
  [key: string]: any
}

function ModelsTab() {
  const t = useTranslations('debug')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/debug?action=models')
      setData(await res.json())
    } catch {
      setData({ models: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchModels() }, [fetchModels])

  const models: ModelEntry[] = Array.isArray(data?.models) ? data.models : (Array.isArray(data?.data) ? data.data : [])

  return (
    <div className="card">
      {/* Card header: label + refresh */}
      <div className="card-header">
        <span className="card-title">{t('models')}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={fetchModels}
          disabled={loading}
        >
          {t('refresh')}
        </button>
      </div>

      {/* Card body: loading / empty / table */}
      {loading ? (
        <div className="card-body">
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{t('loading')}</p>
        </div>
      ) : models.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden>⊞</div>
          <div className="empty-title">{t('noModels')}</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={ROW_BORDER}>
                <th
                  scope="col"
                  style={{ ...KV_TH_STYLE, padding: 'var(--space-2) var(--space-5)', width: 'auto', fontWeight: 600 }}
                >
                  {t('colName')}
                </th>
                <th
                  scope="col"
                  style={{ ...KV_TH_STYLE, padding: 'var(--space-2) var(--space-5)', width: 'auto', fontWeight: 600 }}
                >
                  {t('colProvider')}
                </th>
                <th
                  scope="col"
                  style={{ ...KV_TH_STYLE, padding: 'var(--space-2) var(--space-5)', width: 'auto', fontWeight: 600 }}
                >
                  {t('colContextLength')}
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.id || m.name || i} style={ROW_BORDER}>
                  <td
                    style={{ ...KV_TD_STYLE, padding: 'var(--space-2) var(--space-5)' }}
                  >
                    {m.name || m.id || '?'}
                  </td>
                  <td
                    style={{ ...KV_TD_STYLE, padding: 'var(--space-2) var(--space-5)', color: 'var(--fg-muted)', fontFamily: 'inherit' }}
                  >
                    {m.provider || '-'}
                  </td>
                  <td
                    style={{ ...KV_TD_STYLE, padding: 'var(--space-2) var(--space-5)', color: 'var(--fg-muted)', fontFamily: 'inherit' }}
                  >
                    {m.context_length ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// API Call Tab
// ---------------------------------------------------------------------------

function ApiCallTab() {
  const t = useTranslations('debug')
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [path, setPath] = useState('/api/')
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const send = async () => {
    setLoading(true)
    setResponse(null)
    try {
      let parsedBody: any = undefined
      if (method === 'POST' && body.trim()) {
        try {
          parsedBody = JSON.parse(body)
        } catch {
          setResponse({ error: 'Invalid JSON in body' })
          setLoading(false)
          return
        }
      }

      const res = await fetch('/api/debug?action=call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, path, body: parsedBody }),
      })
      setResponse(await res.json())
    } catch {
      setResponse({ error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  // Map HTTP status to a neutral dot class + text label (no traffic-light hues)
  const httpStatusDot = (status: number) => {
    if (status >= 200 && status < 300) return 'dot-success'
    if (status >= 400) return 'dot-danger'
    return 'dot-warning'
  }

  return (
    <div className="card">
      {/* Request form */}
      <div className="card-body flex flex-col gap-4">

        {/* Method + path + send */}
        <div className="flex items-end gap-2 flex-wrap" style={{ rowGap: 'var(--space-3)' }}>
          <div style={{ flex: 'none' }}>
            <label
              htmlFor="dbg-method"
              style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}
            >
              {t('method')}
            </label>
            <select
              id="dbg-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'GET' | 'POST')}
              className="select"
              style={{ width: 100 }}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 180 }}>
            <label
              htmlFor="dbg-path"
              style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}
            >
              {t('path')}
            </label>
            <input
              id="dbg-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api/"
              className="input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={send}
            disabled={loading}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading ? t('sending') : t('send')}
          </button>
        </div>

        {/* POST body */}
        {method === 'POST' && (
          <div>
            <label
              htmlFor="dbg-body"
              style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 'var(--space-1)' }}
            >
              {t('bodyJson')}
            </label>
            <textarea
              id="dbg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder='{"key": "value"}'
              className="textarea"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            />
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="flex flex-col gap-2">
            {response.status && (
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{t('statusLabel')}:</span>
                <span className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--fg)' }}>
                  <span className={`dot ${httpStatusDot(response.status)}`} aria-hidden="true" />
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {response.status}{response.statusText ? ` ${response.statusText}` : ''}
                  </span>
                </span>
                {response.contentType && (
                  <span
                    className="badge"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {response.contentType}
                  </span>
                )}
              </div>
            )}
            <pre style={PRE_STYLE}>
              {typeof response.body !== 'undefined'
                ? (typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2))
                : JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
