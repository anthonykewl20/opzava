'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('LogViewer')

const MAX_LOG_BUFFER = 1000

interface LogFilters {
  level?: string
  source?: string
  search?: string
  session?: string
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const LEVELS = ['', 'info', 'warn', 'error', 'debug'] as const
type Level = (typeof LEVELS)[number]
const LEVEL_LABELS: Record<Level, string> = {
  '': 'All',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
  debug: 'Debug',
}

function levelDotClass(level: string): string {
  switch (level.toLowerCase()) {
    case 'error':
      return 'dot dot-danger'
    case 'warn':
      return 'dot dot-warning'
    default:
      return 'dot'
  }
}

const TIME_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
  minWidth: 72,
  flex: 'none',
}

const LEVEL_CELL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flex: 'none',
  minWidth: 78,
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-muted)',
}

const ROW_STYLE: React.CSSProperties = {
  borderBottom: '1px solid var(--border)',
}

const ROW_MAIN_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 40,
  padding: '0 var(--space-5)',
}

export function LogViewerPanel() {
  const t = useTranslations('logViewer')
  const { logs, logFilters, setLogFilters, clearLogs, addLog } = useMissionControl()
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const [availableSources, setAvailableSources] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [logFilePath, setLogFilePath] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef<boolean>(true)
  const logsRef = useRef(logs)
  const logFiltersRef = useRef(logFilters)

  const isBufferFull = logs.length >= MAX_LOG_BUFFER

  // Update ref when autoScroll state changes
  useEffect(() => {
    autoScrollRef.current = isAutoScroll
  }, [isAutoScroll])

  // Keep refs in sync so callbacks don't need `logs` / `logFilters` deps.
  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  useEffect(() => {
    logFiltersRef.current = logFilters
  }, [logFilters])

  const loadLogs = useCallback(async (tail = false) => {
    log.debug(`Loading logs (tail=${tail})`)
    setIsLoading(!tail) // Only show loading for initial load, not for tailing

    try {
      const currentFilters = logFiltersRef.current
      const currentLogs = logsRef.current

      const params = new URLSearchParams({
        action: tail ? 'tail' : 'recent',
        limit: '200',
        ...(currentFilters.level && { level: currentFilters.level }),
        ...(currentFilters.source && { source: currentFilters.source }),
        ...(currentFilters.search && { search: currentFilters.search }),
        ...(currentFilters.session && { session: currentFilters.session }),
        ...(tail && currentLogs.length > 0 && { since: currentLogs[0]?.timestamp.toString() })
      })

      log.debug(`Fetching /api/logs?${params}`)
      const response = await fetch(`/api/logs?${params}`)
      const data = await response.json()

      log.debug(`Received ${data.logs?.length || 0} logs from API`)

      if (data.logs && data.logs.length > 0) {
        if (tail) {
          // Add new logs for tail mode - prepend to existing logs
          let newLogsAdded = 0
          const existingIds = new Set((currentLogs || []).map((l: any) => l?.id).filter(Boolean))
          data.logs.reverse().forEach((entry: any) => {
            if (existingIds.has(entry?.id)) return
            addLog(entry)
            newLogsAdded++
          })
          log.debug(`Added ${newLogsAdded} new logs (tail mode)`)
        } else {
          // Replace logs for initial load or refresh
          log.debug(`Clearing existing logs and loading ${data.logs.length} logs`)
          clearLogs() // Clear existing logs
          data.logs.reverse().forEach((entry: any) => {
            addLog(entry)
          })
          log.debug(`Successfully added ${data.logs.length} logs to store`)
        }
      } else {
        log.debug('No logs received from API')
      }
    } catch (error) {
      log.error('Failed to load logs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [addLog, clearLogs])

  const loadSources = useCallback(async () => {
    try {
      const response = await fetch('/api/logs?action=sources')
      const data = await response.json()
      setAvailableSources(data.sources || [])
    } catch (error) {
      log.error('Failed to load log sources:', error)
    }
  }, [])

  // Try to fetch log file path from gateway status
  const loadLogFilePath = useCallback(async () => {
    try {
      const response = await fetch('/api/status')
      const data = await response.json()
      const path = data?.config?.logFile || data?.logFile || null
      setLogFilePath(path)
    } catch {
      // Gateway may not expose this — silently ignore
    }
  }, [])

  // Load initial logs and sources
  useEffect(() => {
    log.debug('Initial load started')
    loadLogs()
    loadSources()
    loadLogFilePath()
  }, [loadLogs, loadSources, loadLogFilePath])

  // Smart polling for log tailing (10s, visibility-aware, logs mostly come via WS)
  const pollLogs = useCallback(() => {
    if (autoScrollRef.current && !isLoading) {
      loadLogs(true) // tail mode
    }
  }, [isLoading, loadLogs])

  useSmartPoll(pollLogs, 30000, { pauseWhenConnected: true })

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, isAutoScroll])

  const handleFilterChange = (newFilters: Partial<LogFilters>) => {
    setLogFilters(newFilters)
    // Reload logs with new filters
    setTimeout(() => loadLogs(), 100)
  }

  const handleScrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }

  const filteredLogs = logs.filter(entry => {
    if (logFilters.level && entry.level !== logFilters.level) return false
    if (logFilters.source && entry.source !== logFilters.source) return false
    if (logFilters.search && !entry.message.toLowerCase().includes(logFilters.search.toLowerCase())) return false
    if (logFilters.session && (!entry.session || !entry.session.includes(logFilters.session))) return false
    return true
  })

  const handleExportText = useCallback(() => {
    const lines = filteredLogs.map(entry => {
      const ts = new Date(entry.timestamp).toISOString()
      return `[${ts}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`
    })
    const filename = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`
    downloadFile(lines.join('\n'), filename, 'text/plain')
  }, [filteredLogs])

  const handleExportJson = useCallback(() => {
    const filename = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    downloadFile(JSON.stringify(filteredLogs, null, 2), filename, 'application/json')
  }, [filteredLogs])

  // Debug logging
  log.debug(`Store has ${logs.length} logs, filtered to ${filteredLogs.length}`)

  return (
    <div className="opzava-ds h-full flex flex-col" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* ── Panel header ── */}
      <div
        className="flex justify-between items-start p-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)' }}>{t('title')}</h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 2 }}>
            {t('description')}
            {logFilePath && (
              <span
                style={{
                  marginLeft: 'var(--space-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--fg-subtle)',
                }}
              >
                {logFilePath}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleExportText}
            disabled={filteredLogs.length === 0}
            className="btn btn-sm btn-ghost"
          >
            {t('exportLog')}
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredLogs.length === 0}
            className="btn btn-sm btn-ghost"
          >
            {t('exportJson')}
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="btn btn-sm btn-danger"
          >
            {t('clear')}
          </button>
        </div>
      </div>

      {/* ── Log stream card ── */}
      <section className="flex-1 min-h-0 flex flex-col p-4" aria-label={t('title')}>
        <div className="card flex flex-col flex-1 min-h-0">

          {/* Filter toolbar */}
          <div
            className="card-header flex-shrink-0"
            style={{ flexWrap: 'wrap', rowGap: 'var(--space-3)', justifyContent: 'flex-start' }}
          >
            {/* Search input with "/" shortcut hint */}
            <div style={{ position: 'relative', flex: '0 1 260px', minWidth: 180 }}>
              <input
                type="text"
                value={logFilters.search || ''}
                onChange={(e) => handleFilterChange({ search: e.target.value || undefined })}
                placeholder={t('searchPlaceholder')}
                className="input"
                aria-label={t('filterSearch')}
                style={{ paddingRight: 30 }}
              />
              <kbd
                className="kbd"
                aria-hidden
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                /
              </kbd>
            </div>

            {/* Level filter as tab strip */}
            <div
              className="tabs"
              role="tablist"
              aria-label={t('filterLevel')}
              style={{ flex: 'none', borderBottom: 'none' }}
            >
              {LEVELS.map((lvl) => {
                const selected = lvl === '' ? !logFilters.level : logFilters.level === lvl
                return (
                  <button
                    key={lvl || 'all'}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`tab${selected ? ' active' : ''}`}
                    onClick={() => handleFilterChange({ level: lvl || undefined })}
                  >
                    {LEVEL_LABELS[lvl]}
                  </button>
                )
              })}
            </div>

            {/* Source select */}
            <select
              value={logFilters.source || ''}
              onChange={(e) => handleFilterChange({ source: e.target.value || undefined })}
              className="select"
              aria-label={t('filterSource')}
              style={{ width: 'auto', minWidth: 168, flex: 'none' }}
            >
              <option value="">{t('allSources')}</option>
              {availableSources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>

            {/* Session filter */}
            <input
              type="text"
              value={logFilters.session || ''}
              onChange={(e) => handleFilterChange({ session: e.target.value || undefined })}
              placeholder={t('sessionPlaceholder')}
              className="input"
              aria-label={t('filterSession')}
              style={{ flex: '0 1 140px', minWidth: 100 }}
            />

            {/* Spacer pushes live control to the right */}
            <div style={{ flex: 1 }} />

            {/* Scroll-to-bottom + live tailing toggle */}
            <div className="flex items-center gap-2" style={{ flex: 'none' }}>
              <button
                type="button"
                onClick={handleScrollToBottom}
                className="btn btn-sm btn-ghost"
              >
                {t('bottom')}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={isAutoScroll}
                onClick={() => setIsAutoScroll(!isAutoScroll)}
                className="btn btn-sm"
                style={
                  isAutoScroll
                    ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }
                    : {}
                }
              >
                <span className={`dot dot-success${isAutoScroll ? ' live' : ''}`} aria-hidden />
                {isAutoScroll ? t('auto') : t('manual')}
              </button>
            </div>
          </div>

          {/* Buffer-full warning */}
          {isBufferFull && (
            <div
              className="banner banner-warning"
              style={{ margin: 'var(--space-3) var(--space-5) 0', flex: 'none' }}
            >
              {t('bufferFull', { max: MAX_LOG_BUFFER })}
            </div>
          )}

          {/* Dense log stream */}
          <div
            ref={logContainerRef}
            className="flex-1 min-h-0 overflow-auto"
            role="log"
            aria-live="polite"
            aria-label={`${t('title')} stream`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader variant="inline" label="Loading logs" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="empty">
                <div className="empty-icon" aria-hidden>≡</div>
                <div className="empty-title">{t('noLogs')}</div>
                <div className="empty-desc">{t('description')}</div>
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <div key={entry.id} style={ROW_STYLE}>
                  {/* Main row: time | level (dot+label) | source badge | session? | message */}
                  <div style={ROW_MAIN_STYLE}>
                    <time style={TIME_STYLE}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </time>
                    <span style={LEVEL_CELL_STYLE}>
                      <span className={levelDotClass(entry.level)} aria-hidden />
                      {entry.level.charAt(0).toUpperCase() + entry.level.slice(1)}
                    </span>
                    <span style={{ flex: 'none', width: 96 }}>
                      <span className="badge">{entry.source}</span>
                    </span>
                    {entry.session && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-subtle)',
                          flex: 'none',
                          maxWidth: 80,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={entry.session}
                      >
                        {entry.session.slice(0, 8)}
                      </span>
                    )}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--fg)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={entry.message}
                    >
                      {entry.message}
                    </span>
                  </div>
                  {/* Optional data expansion — below the row, not inline */}
                  {entry.data && (
                    <details style={{ padding: '0 var(--space-5) var(--space-2)' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-subtle)',
                        }}
                      >
                        {t('additionalData')}
                      </summary>
                      <pre
                        style={{
                          marginTop: 'var(--space-1)',
                          padding: 'var(--space-2)',
                          overflow: 'auto',
                          maxHeight: 128,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-muted)',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="card-footer flex-shrink-0" style={{ background: 'var(--surface)' }}>
            <div className="flex justify-between items-center">
              <span className="hint">
                {t('showing', { filtered: filteredLogs.length, total: logs.length })}
              </span>
              <span className="hint">
                {t('autoScroll')}: {isAutoScroll ? t('on') : t('off')} ·{' '}
                {t('lastUpdated')}:{' '}
                {logs.length > 0 ? new Date(logs[0]?.timestamp).toLocaleTimeString() : t('never')}
              </span>
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
