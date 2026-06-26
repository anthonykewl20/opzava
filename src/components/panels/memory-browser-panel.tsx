'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { apiFetch } from '@/lib/api-client'
import { createClientLogger } from '@/lib/client-logger'
import { MemoryGraph } from './memory-graph'

const log = createClientLogger('MemoryBrowser')

interface MemoryFile {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: MemoryFile[]
}

function mergeDirectoryChildren(files: MemoryFile[], targetPath: string, children: MemoryFile[]): MemoryFile[] {
  return files.map((file) => {
    if (file.path === targetPath && file.type === 'directory') {
      return { ...file, children }
    }
    if (!file.children?.length) return file
    return { ...file, children: mergeDirectoryChildren(file.children, targetPath, children) }
  })
}

interface HealthCategory {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  score: number
  issues: string[]
  suggestions: string[]
}

interface HealthReport {
  overall: 'healthy' | 'warning' | 'critical'
  overallScore: number
  categories: HealthCategory[]
  generatedAt: number
}

interface MOCGroup {
  directory: string
  entries: { title: string; path: string; linkCount: number }[]
}

interface ProcessingResult {
  action: string
  filesProcessed: number
  changes: string[]
  suggestions: string[]
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function countFiles(files: MemoryFile[]): number {
  return files.reduce((acc, f) => {
    if (f.type === 'file') return acc + 1
    return acc + countFiles(f.children || [])
  }, 0)
}

function totalSize(files: MemoryFile[]): number {
  return files.reduce((acc, f) => {
    if (f.type === 'file' && f.size) return acc + f.size
    return acc + totalSize(f.children || [])
  }, 0)
}

function fileIcon(name: string): string {
  if (name.endsWith('.md')) return '#'
  if (name.endsWith('.json') || name.endsWith('.jsonl')) return '{}'
  if (name.endsWith('.txt') || name.endsWith('.log')) return '|'
  return '~'
}

// DS-aligned: status as dot class + label — never a colour hue for the text.
function healthStatusInfo(status: 'healthy' | 'warning' | 'critical'): { dotClass: string; label: string } {
  if (status === 'healthy') return { dotClass: 'dot dot-success', label: 'Healthy' }
  if (status === 'warning') return { dotClass: 'dot dot-warning', label: 'Warning' }
  return { dotClass: 'dot dot-danger', label: 'Critical' }
}

// Shared inline style constants
const MONO_SUBTLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--fg-subtle)',
}

const BORDER_BOTTOM: React.CSSProperties = { borderBottom: '1px solid var(--border)' }

export function MemoryBrowserPanel() {
  const t = useTranslations('memoryBrowser')
  const {
    memoryFiles,
    selectedMemoryFile,
    memoryContent,
    memoryFileLinks,
    memoryHealth,
    dashboardMode,
    setMemoryFiles,
    setSelectedMemoryFile,
    setMemoryContent,
    setMemoryFileLinks,
    setMemoryHealth
  } = useMissionControl()
  const isLocal = dashboardMode === 'local'

  const [isLoading, setIsLoading] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [searchResults, setSearchResults] = useState<{ path: string; name: string; matches: number }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeView, setActiveView] = useState<'files' | 'graph' | 'health' | 'pipeline' | 'hermes'>(!isLocal ? 'graph' : 'files')
  const [hermesMemory, setHermesMemory] = useState<{ agentMemory: string | null; userMemory: string | null; agentMemorySize: number; userMemorySize: number; agentMemoryEntries: number; userMemoryEntries: number } | null>(null)
  const [hermesInstalled, setHermesInstalled] = useState<boolean | null>(null)
  const [isLoadingHermes, setIsLoadingHermes] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [fileFilter, setFileFilter] = useState<'all' | 'daily' | 'knowledge'>('all')
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([])
  const [linksOpen, setLinksOpen] = useState(false)
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)
  const [pipelineResult, setPipelineResult] = useState<ProcessingResult | null>(null)
  const [mocGroups, setMocGroups] = useState<MOCGroup[]>([])
  const [isRunningPipeline, setIsRunningPipeline] = useState(false)
  const [isHydratingTree, setIsHydratingTree] = useState(false)
  // Visual-only state for file tree hover (no DS hover class for custom tree rows)
  const [hoveredTreePath, setHoveredTreePath] = useState<string | null>(null)
  const memoryFilesRef = useRef(memoryFiles)

  useEffect(() => {
    memoryFilesRef.current = memoryFiles
  }, [memoryFiles])

  const fetchTree = useCallback(async (options?: { path?: string; depth?: number }) => {
    const params = new URLSearchParams({ action: 'tree' })
    if (typeof options?.depth === 'number') params.set('depth', String(options.depth))
    if (options?.path) params.set('path', options.path)
    return apiFetch<{ tree?: MemoryFile[] }>(`/api/memory?${params.toString()}`)
  }, [])

  const loadFileTree = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await fetchTree({ depth: 1 })
      setMemoryFiles(data.tree || [])
      setExpandedFolders(new Set(['daily', 'knowledge', 'memory', 'knowledge-base']))
      setIsHydratingTree(true)
      void fetchTree()
        .then((fullData) => {
          setMemoryFiles(fullData.tree || [])
        })
        .catch((error) => {
          log.error('Failed to hydrate full file tree:', error)
        })
        .finally(() => {
          setIsHydratingTree(false)
        })
    } catch (error) {
      log.error('Failed to load file tree:', error)
    } finally {
      setIsLoading(false)
    }
  }, [fetchTree, setMemoryFiles])

  useEffect(() => {
    loadFileTree()
  }, [loadFileTree])

  const filteredFiles = useMemo(() => {
    if (fileFilter === 'all') return memoryFiles
    const prefixes = fileFilter === 'daily'
      ? ['daily/', 'memory/']
      : ['knowledge/', 'knowledge-base/']
    return memoryFiles.filter((file) => {
      const p = `${file.path.replace(/\\/g, '/')}/`
      return prefixes.some((prefix) => p.startsWith(prefix))
    })
  }, [memoryFiles, fileFilter])

  const loadFileContent = async (filePath: string) => {
    setIsLoading(true)
    try {
      const data = await apiFetch<{ content?: string; wikiLinks?: unknown[] }>(`/api/memory?action=content&path=${encodeURIComponent(filePath)}`)
      if (data.content !== undefined) {
        setSelectedMemoryFile(filePath)
        setMemoryContent(data.content)
        setIsEditing(false)
        setEditedContent('')
        setSchemaWarnings([])
        if (data.wikiLinks) {
          setMemoryFileLinks({
            wikiLinks: data.wikiLinks,
            incoming: [],
            outgoing: [],
          })
          apiFetch<{ wikiLinks?: unknown[]; incoming?: string[]; outgoing?: string[] }>(`/api/memory/links?file=${encodeURIComponent(filePath)}`)
            .then((linkData) => {
              setMemoryFileLinks({
                wikiLinks: linkData.wikiLinks || data.wikiLinks || [],
                incoming: linkData.incoming || [],
                outgoing: linkData.outgoing || [],
              })
            })
            .catch(() => {})
        }
        if (activeView === 'graph' || activeView === 'health' || activeView === 'pipeline') {
          setActiveView('files')
        }
      }
    } catch (error) {
      log.error('Failed to load file content:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const searchFiles = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      const data = await apiFetch<{ results?: { path: string; name: string; matches: number }[] }>(`/api/memory?action=search&query=${encodeURIComponent(searchQuery)}`)
      setSearchResults(data.results || [])
    } catch (error) {
      log.error('Search failed:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const toggleFolder = async (folderPath: string, needsChildren: boolean) => {
    if (!expandedFolders.has(folderPath) && needsChildren) {
      try {
        const data = await fetchTree({ path: folderPath, depth: 1 })
        setMemoryFiles(mergeDirectoryChildren(memoryFilesRef.current, folderPath, data.tree || []))
      } catch (error) {
        log.error('Failed to load folder children:', error)
      }
    }
    const next = new Set(expandedFolders)
    if (next.has(folderPath)) next.delete(folderPath)
    else next.add(folderPath)
    setExpandedFolders(next)
  }

  const saveFile = async () => {
    if (!selectedMemoryFile) return
    setIsSaving(true)
    try {
      const data = await apiFetch<{ success?: boolean; schemaWarnings?: string[] }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', path: selectedMemoryFile, content: editedContent })
      })
      if (data.success) {
        setMemoryContent(editedContent)
        setIsEditing(false)
        setEditedContent('')
        setSchemaWarnings(data.schemaWarnings || [])
        loadFileTree()
      }
    } catch (error) {
      log.error('Failed to save file:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const createNewFile = async (filePath: string, content: string = '') => {
    try {
      const data = await apiFetch<{ success?: boolean }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', path: filePath, content })
      })
      if (data.success) {
        loadFileTree()
        loadFileContent(filePath)
      }
    } catch (error) {
      log.error('Failed to create file:', error)
    }
  }

  const deleteFile = async () => {
    if (!selectedMemoryFile) return
    try {
      const data = await apiFetch<{ success?: boolean }>('/api/memory', {
        method: 'DELETE',
        body: JSON.stringify({ action: 'delete', path: selectedMemoryFile })
      })
      if (data.success) {
        setSelectedMemoryFile('')
        setMemoryContent('')
        setMemoryFileLinks(null)
        setShowDeleteConfirm(false)
        loadFileTree()
      }
    } catch (error) {
      log.error('Failed to delete file:', error)
    }
  }

  const loadHealth = useCallback(async () => {
    setIsLoadingHealth(true)
    try {
      const data = await apiFetch<HealthReport>('/api/memory/health')
      if (data.categories) {
        setHealthReport(data)
        setMemoryHealth(data)
      }
    } catch (error) {
      log.error('Failed to load health:', error)
    } finally {
      setIsLoadingHealth(false)
    }
  }, [setMemoryHealth])

  useEffect(() => {
    if (activeView === 'health' && !healthReport) {
      loadHealth()
    }
  }, [activeView, healthReport, loadHealth])

  useEffect(() => {
    if (hermesInstalled === null) {
      apiFetch<{ installed?: boolean }>('/api/hermes').then(d => setHermesInstalled(d.installed === true)).catch(() => setHermesInstalled(false))
    }
  }, [hermesInstalled])

  useEffect(() => {
    if (activeView === 'hermes' && !hermesMemory && !isLoadingHermes) {
      setIsLoadingHermes(true)
      apiFetch<{ agentMemory: string | null; userMemory: string | null; agentMemorySize: number; userMemorySize: number; agentMemoryEntries: number; userMemoryEntries: number }>('/api/hermes/memory')
        .then(d => setHermesMemory(d))
        .catch(() => {})
        .finally(() => setIsLoadingHermes(false))
    }
  }, [activeView, hermesMemory, isLoadingHermes])

  const runPipelineAction = async (action: string) => {
    setIsRunningPipeline(true)
    setPipelineResult(null)
    setMocGroups([])
    try {
      const data = await apiFetch<ProcessingResult & { groups?: MOCGroup[] }>('/api/memory/process', {
        method: 'POST',
        body: JSON.stringify({ action })
      })
      if (action === 'generate-moc') {
        setMocGroups(data.groups || [])
      } else {
        setPipelineResult(data)
      }
    } catch (error) {
      log.error('Pipeline action failed:', error)
    } finally {
      setIsRunningPipeline(false)
    }
  }

  const fileCount = useMemo(() => countFiles(memoryFiles), [memoryFiles])
  const sizeTotal = useMemo(() => totalSize(memoryFiles), [memoryFiles])

  const navigateToWikiLink = (target: string) => {
    const findFile = (files: MemoryFile[]): string | null => {
      for (const f of files) {
        if (f.type === 'file') {
          const stem = f.name.replace(/\.[^.]+$/, '')
          if (stem === target || f.name === target || f.name === `${target}.md`) {
            return f.path
          }
        }
        if (f.children) {
          const found = findFile(f.children)
          if (found) return found
        }
      }
      return null
    }
    const found = findFile(memoryFiles)
    if (found) {
      loadFileContent(found)
    }
  }

  const renderTree = (files: MemoryFile[], depth = 0): React.ReactElement[] => {
    return files.map((file) => {
      const isDir = file.type === 'directory'
      const isExpanded = expandedFolders.has(file.path)
      const isSelected = selectedMemoryFile === file.path
      const isHovered = hoveredTreePath === file.path
      return (
        <div key={file.path}>
          <div
            className="flex items-center gap-1 pr-2 cursor-pointer rounded-sm"
            style={{
              paddingTop: 3,
              paddingBottom: 3,
              paddingLeft: 8 + depth * 14,
              background: isSelected || isHovered ? 'var(--surface-2)' : 'transparent',
              color: isSelected ? 'var(--fg)' : 'var(--fg-muted)',
              transition: 'background 75ms',
            }}
            onMouseEnter={() => setHoveredTreePath(file.path)}
            onMouseLeave={() => setHoveredTreePath(null)}
            onClick={() => void (isDir ? toggleFolder(file.path, file.children === undefined) : loadFileContent(file.path))}
          >
            {isDir ? (
              <span
                aria-hidden
                style={{
                  fontSize: 10,
                  width: 12,
                  textAlign: 'center',
                  flexShrink: 0,
                  display: 'block',
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform 100ms',
                  color: 'var(--fg-subtle)',
                }}
              >&#9656;</span>
            ) : (
              <span style={{ width: 12, display: 'block', flexShrink: 0 }} />
            )}
            <span
              aria-hidden
              style={{
                fontSize: 11,
                width: 16,
                textAlign: 'center',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg-subtle)',
                opacity: isDir ? 0.6 : 0.4,
              }}
            >{isDir ? '/' : fileIcon(file.name)}</span>
            <span
              className="truncate flex-1"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
            >{file.name}</span>
            {!isDir && file.size != null && (
              <span style={{ ...MONO_SUBTLE, fontSize: 10, flexShrink: 0, fontVariantNumeric: 'tabular-nums', opacity: 0.4 }}>
                {formatFileSize(file.size)}
              </span>
            )}
          </div>
          {isDir && isExpanded && file.children && <div>{renderTree(file.children, depth + 1)}</div>}
        </div>
      )
    })
  }

  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\])/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = 0
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
      const m = match[0]
      if (m.startsWith('[[') && m.endsWith(']]')) {
        const target = match[2]?.trim() || ''
        const display = (match[3] || match[2] || '').trim()
        parts.push(
          <button
            key={key++}
            onClick={() => navigateToWikiLink(target)}
            style={{
              color: 'var(--accent)',
              opacity: 0.8,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
            }}
            title={`Navigate to [[${target}]]`}
          >
            {display}
          </button>
        )
      } else if (m.startsWith('`') && m.endsWith('`')) {
        parts.push(
          <code
            key={key++}
            style={{
              background: 'var(--surface-2)',
              padding: '0 4px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent)',
              opacity: 0.8,
            }}
          >{m.slice(1, -1)}</code>
        )
      } else if (m.startsWith('**') && m.endsWith('**')) {
        parts.push(<strong key={key++} className="font-semibold" style={{ color: 'var(--fg)' }}>{m.slice(2, -2)}</strong>)
      } else if (m.startsWith('*') && m.endsWith('*')) {
        parts.push(<em key={key++}>{m.slice(1, -1)}</em>)
      }
      lastIndex = pattern.lastIndex
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }

  const renderMarkdown = (content: string) => {
    const lines = content.split('\n')
    const elements: React.ReactElement[] = []
    const seenHeaders = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (trimmed.startsWith('# ')) {
        const text = trimmed.slice(2)
        const id = `h1-${text.toLowerCase().replace(/\s+/g, '-')}`
        if (seenHeaders.has(id)) continue
        seenHeaders.add(id)
        elements.push(
          <h1 key={i} className="font-bold mt-6 mb-2" style={{ fontSize: 'var(--text-xl)', color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
            {renderInline(text)}
          </h1>
        )
      } else if (trimmed.startsWith('## ')) {
        const text = trimmed.slice(3)
        const id = `h2-${text.toLowerCase().replace(/\s+/g, '-')}`
        if (seenHeaders.has(id)) continue
        seenHeaders.add(id)
        elements.push(
          <h2 key={i} className="font-semibold mt-5 mb-2" style={{ fontSize: 'var(--text-lg)', color: 'var(--fg)', fontFamily: 'var(--font-mono)', opacity: 0.9 }}>
            {renderInline(text)}
          </h2>
        )
      } else if (trimmed.startsWith('### ')) {
        const text = trimmed.slice(4)
        const id = `h3-${text.toLowerCase().replace(/\s+/g, '-')}`
        if (seenHeaders.has(id)) continue
        seenHeaders.add(id)
        elements.push(
          <h3 key={i} className="font-semibold mt-4 mb-1.5" style={{ fontSize: 'var(--text-base)', color: 'var(--fg)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
            {renderInline(text)}
          </h3>
        )
      } else if (trimmed.startsWith('- ')) {
        elements.push(
          <li key={i} className="ml-5 mb-0.5 list-disc leading-relaxed" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
            {renderInline(trimmed.slice(2))}
          </li>
        )
      } else if (trimmed === '') {
        elements.push(<div key={i} style={{ height: 8 }} />)
      } else if (trimmed.startsWith('```')) {
        const codeLang = trimmed.slice(3)
        const codeLines: string[] = []
        let j = i + 1
        while (j < lines.length && !lines[j].trim().startsWith('```')) {
          codeLines.push(lines[j])
          j++
        }
        elements.push(
          <pre
            key={i}
            className="my-2 overflow-x-auto"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {codeLang && (
              <span style={{ color: 'var(--fg-subtle)', fontSize: 10, display: 'block', marginBottom: 4 }}>{codeLang}</span>
            )}
            <code style={{ color: 'var(--fg-muted)' }}>{codeLines.join('\n')}</code>
          </pre>
        )
        i = j
      } else {
        elements.push(
          <p key={i} className="mb-1.5 leading-relaxed" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
            {renderInline(trimmed)}
          </p>
        )
      }
    }
    return elements
  }

  const viewTabs = ['files', ...(!isLocal ? ['graph'] : []), 'health', 'pipeline', ...(hermesInstalled ? ['hermes'] : [])] as const

  return (
    <div
      className="opzava-ds h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--fg)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-1 px-3 flex-shrink-0"
        style={{ height: 44, ...BORDER_BOTTOM, background: 'var(--surface)' }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn btn-ghost btn-icon btn-sm"
          title={sidebarOpen ? t('hideSidebar') : t('showSidebar')}
          aria-label={sidebarOpen ? t('hideSidebar') : t('showSidebar')}
          style={{ fontFamily: 'var(--font-mono)' }}
        >|||</button>

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {viewTabs.map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view as typeof activeView)}
            className={`btn btn-sm ${activeView === view ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}
          >{view}</button>
        ))}

        <div className="flex-1" />

        {healthReport && (
          <div
            className="health-pill"
            aria-label={`Memory health: ${healthStatusInfo(healthReport.overall).label}`}
          >
            <span className={healthStatusInfo(healthReport.overall).dotClass} aria-hidden />
            <span style={{ ...MONO_SUBTLE }}>{healthReport.overallScore}%</span>
          </div>
        )}

        <span className="hint" style={{ fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
          {t('fileCountSize', { count: fileCount, size: formatFileSize(sizeTotal) })}
        </span>

        {isHydratingTree && (
          <span className="hint" style={{ fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{t('indexing')}</span>
        )}

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="btn btn-sm btn-primary"
        >{t('newFile')}</button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <div
            className="flex flex-col min-h-0 flex-shrink-0"
            style={{ width: 240, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
          >
            <div className="p-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchFiles()}
                placeholder={t('searchPlaceholder')}
                className="input"
                style={{ height: 32, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div className="flex gap-1 px-2 pb-2">
              {(['all', 'daily', 'knowledge'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFileFilter(f)}
                  className={`btn btn-sm ${fileFilter === f ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ height: 24, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                >{f}</button>
              ))}
            </div>

            {searchResults.length > 0 && (
              <div className="px-2 pb-2" style={BORDER_BOTTOM}>
                <div
                  className="section-label"
                  style={{ paddingTop: 0, paddingLeft: 4, paddingBottom: 4 }}
                >
                  {t('searchResults', { count: searchResults.length })}
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 112 }}>
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex items-center gap-2 w-full text-left rounded"
                      style={{
                        padding: '4px 6px',
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--fg-muted)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      onClick={() => { void loadFileContent(r.path); setSearchResults([]) }}
                    >
                      <span className="truncate flex-1">{r.name}</span>
                      <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{r.matches}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isSearching && (
              <div className="flex items-center justify-center" style={{ height: 40 }}>
                <Loader variant="inline" />
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-1">
              {isLoading ? (
                <div className="flex items-center justify-center" style={{ height: 80 }}>
                  <Loader variant="inline" />
                </div>
              ) : filteredFiles.length === 0 ? (
                <div
                  className="text-center py-8"
                  style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                >
                  {t('noFiles')}
                </div>
              ) : renderTree(filteredFiles)}
            </div>

            <div className="p-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => loadFileTree()}
                disabled={isLoading}
                className="btn btn-ghost btn-sm w-full"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
              >{t('refresh')}</button>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--bg)' }}>
          {activeView === 'graph' && !isLocal ? (
            <div className="flex-1 p-4 overflow-hidden flex flex-col"><MemoryGraph /></div>
          ) : activeView === 'health' ? (
            <div className="flex-1 overflow-auto p-6">
              <HealthView report={healthReport} isLoading={isLoadingHealth} onRefresh={loadHealth} />
            </div>
          ) : activeView === 'pipeline' ? (
            <div className="flex-1 overflow-auto p-6">
              <PipelineView result={pipelineResult} mocGroups={mocGroups} isRunning={isRunningPipeline} onRunAction={runPipelineAction} onNavigate={loadFileContent} />
            </div>
          ) : activeView === 'hermes' ? (
            <div className="flex-1 overflow-auto p-6">
              <HermesMemoryView
                data={hermesMemory}
                isLoading={isLoadingHermes}
                onRefresh={() => { setHermesMemory(null); setIsLoadingHermes(false) }}
              />
            </div>
          ) : (
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 flex flex-col min-h-0">

                {/* File path bar */}
                {selectedMemoryFile && (
                  <div
                    className="flex items-center gap-2 px-4 flex-shrink-0"
                    style={{ height: 40, ...BORDER_BOTTOM, background: 'var(--surface)' }}
                  >
                    <span
                      className="truncate flex-1"
                      style={{ ...MONO_SUBTLE }}
                    >{selectedMemoryFile}</span>

                    {memoryContent != null && (
                      <span
                        className="flex-shrink-0"
                        style={{ ...MONO_SUBTLE, fontVariantNumeric: 'tabular-nums' }}
                      >{memoryContent.length} chars</span>
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setLinksOpen(!linksOpen)}
                        className="btn btn-sm btn-ghost"
                        style={linksOpen
                          ? { height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' }
                          : { height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }
                        }
                        title={t('toggleBacklinks')}
                      >{t('links')}</button>

                      {!isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => { setIsEditing(true); setEditedContent(memoryContent ?? '') }}
                            className="btn btn-sm btn-ghost"
                            style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                          >{t('edit')}</button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="btn btn-sm btn-danger"
                            style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                          >{t('delete')}</button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveFile()}
                            disabled={isSaving}
                            className="btn btn-sm btn-primary"
                            style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                          >{isSaving ? t('saving') : t('save')}</button>
                          <button
                            type="button"
                            onClick={() => { setIsEditing(false); setEditedContent('') }}
                            className="btn btn-sm btn-ghost"
                            style={{ height: 26, padding: '0 8px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                          >{t('cancel')}</button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMemoryFile('')
                          setMemoryContent('')
                          setMemoryFileLinks(null)
                          setIsEditing(false)
                          setEditedContent('')
                          setSchemaWarnings([])
                          setLinksOpen(false)
                        }}
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ height: 26, width: 26 }}
                        aria-label="Close file"
                      >×</button>
                    </div>
                  </div>
                )}

                {/* Schema warnings */}
                {schemaWarnings.length > 0 && (
                  <div className="banner banner-warning mx-4 mt-3">
                    <span className="flex-1">
                      <span className="font-semibold block" style={{ fontSize: 'var(--text-sm)', marginBottom: 2 }}>
                        {t('schemaWarnings')}
                      </span>
                      {schemaWarnings.map((w, i) => (
                        <span
                          key={i}
                          className="block"
                          style={{ ...MONO_SUBTLE, marginLeft: 8 }}
                        >- {w}</span>
                      ))}
                    </span>
                  </div>
                )}

                {/* File content */}
                <div className="flex-1 overflow-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader variant="inline" />
                    </div>
                  ) : memoryContent != null && selectedMemoryFile ? (
                    <div className="p-6 max-w-3xl">
                      {isEditing ? (
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="textarea"
                          style={{ minHeight: 500, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}
                          placeholder={t('editPlaceholder')}
                        />
                      ) : selectedMemoryFile.endsWith('.md') ? (
                        <div>{renderMarkdown(memoryContent)}</div>
                      ) : selectedMemoryFile.endsWith('.json') ? (
                        <pre style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                          <code>{(() => { try { return JSON.stringify(JSON.parse(memoryContent), null, 2) } catch { return memoryContent } })()}</code>
                        </pre>
                      ) : (
                        <pre style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                          {memoryContent}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="empty h-full" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="empty-icon" aria-hidden>/</div>
                      <div className="empty-title">{t('selectFilePrompt')}</div>
                      <div className="empty-desc">{t('orSwitchView')}</div>
                    </div>
                  )}
                </div>
              </div>

              {linksOpen && selectedMemoryFile && memoryFileLinks && (
                <LinksSidebar fileLinks={memoryFileLinks} onNavigate={loadFileContent} />
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateFileModal onClose={() => setShowCreateModal(false)} onCreate={createNewFile} />
      )}
      {showDeleteConfirm && selectedMemoryFile && (
        <DeleteConfirmModal fileName={selectedMemoryFile} onClose={() => setShowDeleteConfirm(false)} onConfirm={deleteFile} />
      )}
    </div>
  )
}

// ── HermesMemoryView ────────────────────────────────────────────────────────
function HermesMemoryView({
  data,
  isLoading,
  onRefresh,
}: {
  data: { agentMemory: string | null; userMemory: string | null; agentMemorySize: number; userMemorySize: number; agentMemoryEntries: number; userMemoryEntries: number } | null
  isLoading: boolean
  onRefresh: () => void
}) {
  const t = useTranslations('memoryBrowser')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader variant="inline" label={t('loadingHermes')} />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden>⚙</div>
        <div className="empty-title">{t('noHermesData')}</div>
        <div className="empty-cta">
          <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
        </div>
      </div>
    )
  }

  const AGENT_CAP = 2200
  const USER_CAP = 1375
  const agentPct = Math.min(100, Math.round((data.agentMemorySize / AGENT_CAP) * 100))
  const userPct = Math.min(100, Math.round((data.userMemorySize / USER_CAP) * 100))

  return (
    <div style={{ maxWidth: 720 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)', marginBottom: 4 }}>
            {t('hermesMemoryTitle')}
          </h2>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {t('hermesMemoryDesc')}
          </p>
        </div>
        <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
      </div>

      {/* MEMORY.md */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontFamily: 'var(--font-mono)' }}>MEMORY.md</h3>
          <div className="flex items-center gap-3">
            <span className="badge">{data.agentMemoryEntries} entries</span>
            {agentPct > 80 && (
              <span className="dot dot-warning" aria-label="Near capacity" />
            )}
            <span style={{ ...{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums' } }}>
              {data.agentMemorySize}/{AGENT_CAP}
            </span>
          </div>
        </div>
        <div className="card-body space-y-3">
          <div className="progress" role="progressbar" aria-valuenow={agentPct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${agentPct}%` }} />
          </div>
          {data.agentMemory ? (
            <pre
              className="overflow-y-auto"
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--fg-muted)',
                lineHeight: 1.6,
                maxHeight: 320,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
              }}
            >{data.agentMemory}</pre>
          ) : (
            <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)', textAlign: 'center', padding: '16px 0' }}>
              {t('noAgentMemory')}
            </p>
          )}
        </div>
      </div>

      {/* USER.md */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontFamily: 'var(--font-mono)' }}>USER.md</h3>
          <div className="flex items-center gap-3">
            <span className="badge">{data.userMemoryEntries} entries</span>
            {userPct > 80 && (
              <span className="dot dot-warning" aria-label="Near capacity" />
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums' }}>
              {data.userMemorySize}/{USER_CAP}
            </span>
          </div>
        </div>
        <div className="card-body space-y-3">
          <div className="progress" role="progressbar" aria-valuenow={userPct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${userPct}%` }} />
          </div>
          {data.userMemory ? (
            <pre
              className="overflow-y-auto"
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--fg-muted)',
                lineHeight: 1.6,
                maxHeight: 320,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
              }}
            >{data.userMemory}</pre>
          ) : (
            <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)', textAlign: 'center', padding: '16px 0' }}>
              {t('noUserMemory')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── LinksSidebar ────────────────────────────────────────────────────────────
function LinksSidebar({
  fileLinks,
  onNavigate,
}: {
  fileLinks: { wikiLinks: unknown[]; incoming: string[]; outgoing: string[] }
  onNavigate: (path: string) => void
}) {
  const t = useTranslations('memoryBrowser')
  const links = fileLinks.wikiLinks as { target: string; display: string; line: number }[]

  return (
    <div
      className="flex flex-col min-h-0 overflow-y-auto flex-shrink-0"
      style={{ width: 224, borderLeft: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      <div className="p-3" style={BORDER_BOTTOM}>
        <div className="section-label" style={{ paddingTop: 0, paddingLeft: 0 }}>
          {t('outgoing', { count: fileLinks.outgoing.length })}
        </div>
        {fileLinks.outgoing.length === 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)' }}>none</p>
        ) : (
          <div className="space-y-0.5">
            {fileLinks.outgoing.map((path, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onNavigate(path)}
                className="block w-full text-left rounded truncate"
                style={{
                  padding: '4px 6px',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                  opacity: 0.7,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'transparent' }}
              >
                {path.split('/').pop()?.replace(/\.[^.]+$/, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3" style={BORDER_BOTTOM}>
        <div className="section-label" style={{ paddingTop: 0, paddingLeft: 0 }}>
          {t('backlinks', { count: fileLinks.incoming.length })}
        </div>
        {fileLinks.incoming.length === 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)' }}>none</p>
        ) : (
          <div className="space-y-0.5">
            {fileLinks.incoming.map((path, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onNavigate(path)}
                className="block w-full text-left rounded truncate"
                style={{
                  padding: '4px 6px',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                  opacity: 0.7,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'transparent' }}
              >
                {path.split('/').pop()?.replace(/\.[^.]+$/, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="section-label" style={{ paddingTop: 0, paddingLeft: 0 }}>
          {t('wikiLinks', { count: links.length })}
        </div>
        {links.length === 0 ? (
          <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-subtle)' }}>none</p>
        ) : (
          <div className="space-y-0.5">
            {links.map((link, i) => (
              <div key={i} className="flex items-center gap-1" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                <span style={{ color: 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>L{link.line}</span>
                <span className="truncate" style={{ color: 'var(--accent)', opacity: 0.6 }}>[[{link.target}]]</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── HealthView ──────────────────────────────────────────────────────────────
function HealthView({
  report,
  isLoading,
  onRefresh,
}: {
  report: HealthReport | null
  isLoading: boolean
  onRefresh: () => void
}) {
  const t = useTranslations('memoryBrowser')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader variant="inline" label={t('runningDiagnostics')} />
      </div>
    )
  }
  if (!report) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden>◎</div>
        <div className="empty-title">{t('noHealthData')}</div>
        <div className="empty-cta">
          <button type="button" onClick={onRefresh} className="btn btn-sm btn-primary">{t('runDiagnostics')}</button>
        </div>
      </div>
    )
  }

  const overall = healthStatusInfo(report.overall)

  return (
    <div style={{ maxWidth: 680 }} className="space-y-6">
      <div className="flex items-center gap-4">
        {/* Score: large tabular number, neutral colour — status conveyed by dot */}
        <div>
          <span
            className="font-semibold"
            style={{ fontSize: 'var(--text-3xl)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}
          >{report.overallScore}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={overall.dotClass} aria-hidden />
          <div>
            <div className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{overall.label}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>
              {t('healthCategories', { time: new Date(report.generatedAt).toLocaleTimeString() })}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onRefresh} className="btn btn-sm">{t('refresh')}</button>
      </div>

      <div className="space-y-3">
        {report.categories.map((cat) => {
          const catInfo = healthStatusInfo(cat.status)
          return (
            <div key={cat.name} className="card">
              <div className="card-header">
                <div className="flex items-center gap-2">
                  <span className={catInfo.dotClass} aria-hidden />
                  <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{cat.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="badge">{catInfo.label}</span>
                  <span style={{ ...{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' } }}>
                    {cat.score}
                  </span>
                </div>
              </div>
              <div className="card-body space-y-2">
                <div className="progress" role="progressbar" aria-valuenow={cat.score} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${cat.score}%` }} />
                </div>
                {cat.issues.length > 0 && (
                  <ul className="space-y-0.5">
                    {cat.issues.map((issue, i) => (
                      <li key={i} style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                        – {issue}
                      </li>
                    ))}
                  </ul>
                )}
                {cat.suggestions.length > 0 && (
                  <ul className="space-y-0.5">
                    {cat.suggestions.map((sug, i) => (
                      <li key={i} style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.7 }}>
                        {sug}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PipelineView ────────────────────────────────────────────────────────────
function PipelineView({
  result,
  mocGroups,
  isRunning,
  onRunAction,
  onNavigate,
}: {
  result: ProcessingResult | null
  mocGroups: MOCGroup[]
  isRunning: boolean
  onRunAction: (action: string) => void
  onNavigate: (path: string) => void
}) {
  const t = useTranslations('memoryBrowser')
  return (
    <div style={{ maxWidth: 680 }} className="space-y-6">
      <div>
        <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)', color: 'var(--fg)', marginBottom: 4 }}>
          {t('pipelineTitle')}
        </h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
          {t('pipelineDesc')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { action: 'reflect', label: t('pipelineReflect'), desc: t('pipelineReflectDesc') },
          { action: 'reweave', label: t('pipelineReweave'), desc: t('pipelineReweaveDesc') },
          { action: 'generate-moc', label: t('pipelineGenerateMoc'), desc: t('pipelineGenerateMocDesc') },
        ].map(({ action, label, desc }) => (
          <button
            key={action}
            type="button"
            onClick={() => onRunAction(action)}
            disabled={isRunning}
            className="card text-left"
            style={{
              padding: 'var(--space-4)',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.45 : 1,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              transition: 'border-color var(--dur-fast)',
            }}
            onMouseEnter={(e) => { if (!isRunning) e.currentTarget.style.borderColor = 'var(--accent-border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{desc}</div>
          </button>
        ))}
      </div>

      {isRunning && (
        <Loader variant="inline" label={t('processing')} />
      )}

      {result && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)', textTransform: 'capitalize' }}>
              {result.action}
            </span>
            <span className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('filesProcessed', { count: result.filesProcessed })}
            </span>
          </div>
          <div className="card-body">
            {result.suggestions.length === 0 ? (
              <p style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                {t('noSuggestions')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {result.suggestions.map((sug, i) => (
                  <li key={i} style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', lineHeight: 1.6 }}>{sug}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {mocGroups.length > 0 && (
        <div className="space-y-3">
          <div className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
            {t('mapsOfContent', { count: mocGroups.length })}
          </div>
          {mocGroups.map((group) => (
            <div key={group.directory} className="card">
              <div className="card-header">
                <span className="font-medium" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                  {group.directory}
                </span>
              </div>
              <div className="card-body space-y-0.5">
                {group.entries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(entry.path)}
                      className="flex-1 text-left truncate"
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent)',
                        opacity: 0.7,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
                    >{entry.title}</button>
                    {entry.linkCount > 0 && (
                      <span style={{ ...{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' } }}>
                        {entry.linkCount} links
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CreateFileModal ─────────────────────────────────────────────────────────
function CreateFileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (path: string, content: string) => void
}) {
  const t = useTranslations('memoryBrowser')
  const [fileName, setFileName] = useState('')
  const [filePath, setFilePath] = useState('knowledge/')
  const [initialContent, setInitialContent] = useState('')
  const [fileType, setFileType] = useState('md')
  const templates: Record<string, string> = { md: '# New Document\n\n', json: '{\n  \n}', txt: '', log: '' }

  const handleCreate = () => {
    if (!fileName.trim()) return
    onCreate(filePath + fileName + '.' + fileType, initialContent)
    onClose()
  }

  return (
    <div className="scrim" role="dialog" aria-modal aria-label={t('newFileTitle')}>
      <div className="modal" style={{ margin: 'auto', padding: 'var(--space-5)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 className="font-semibold" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
            {t('newFileTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Close"
          >×</button>
        </div>

        <div className="space-y-3">
          <div className="field">
            <label className="hint">{t('directory')}</label>
            <select
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="select"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            >
              <option value="knowledge-base/">knowledge-base/</option>
              <option value="memory/">memory/</option>
              <option value="knowledge/">knowledge/</option>
              <option value="daily/">daily/</option>
              <option value="logs/">logs/</option>
              <option value="">root/</option>
            </select>
          </div>

          <div className="field">
            <label className="hint">{t('fileName')}</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-file"
              className="input"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="hint">{t('fileType')}</label>
            <select
              value={fileType}
              onChange={(e) => {
                setFileType(e.target.value)
                setInitialContent(templates[e.target.value] || '')
              }}
              className="select"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            >
              <option value="md">.md</option>
              <option value="json">.json</option>
              <option value="txt">.txt</option>
              <option value="log">.log</option>
            </select>
          </div>

          <div className="field">
            <label className="hint">{t('content')}</label>
            <textarea
              value={initialContent}
              onChange={(e) => setInitialContent(e.target.value)}
              className="textarea"
              style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
              placeholder={t('contentOptional')}
            />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--fg-subtle)',
              background: 'var(--surface-2)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >{filePath}{fileName || '…'}.{fileType}</div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!fileName.trim()}
              className="btn btn-primary flex-1"
            >{t('create')}</button>
            <button type="button" onClick={onClose} className="btn btn-ghost">{t('cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DeleteConfirmModal ──────────────────────────────────────────────────────
function DeleteConfirmModal({
  fileName,
  onClose,
  onConfirm,
}: {
  fileName: string
  onClose: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('memoryBrowser')
  return (
    <div className="scrim" role="dialog" aria-modal aria-label={t('deleteFileTitle')}>
      <div className="modal" style={{ margin: 'auto', padding: 'var(--space-5)' }}>
        <h3 className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: 'var(--space-3)' }}>
          {t('deleteFileTitle')}
        </h3>

        <div className="banner banner-danger" style={{ marginBottom: 'var(--space-4)', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>{t('permanentlyDelete')}</p>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--fg)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
            {fileName}
          </code>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onConfirm} className="btn btn-danger flex-1">{t('delete')}</button>
          <button type="button" onClick={onClose} className="btn btn-ghost">{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
