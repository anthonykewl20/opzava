import { describe, it, expect } from 'vitest'
import {
  normalizeAuthorType,
  sanitizeSource,
  composeCompletionCommentBody,
} from '@/lib/task-attribution'

describe('normalizeAuthorType', () => {
  it('passes through the three valid kinds', () => {
    expect(normalizeAuthorType('human')).toBe('human')
    expect(normalizeAuthorType('agent')).toBe('agent')
    expect(normalizeAuthorType('system')).toBe('system')
  })

  it('defaults unknown/empty/undefined to human', () => {
    expect(normalizeAuthorType(undefined)).toBe('human')
    expect(normalizeAuthorType('')).toBe('human')
    expect(normalizeAuthorType('robot')).toBe('human')
  })

  it('supports overriding the fallback', () => {
    expect(normalizeAuthorType(undefined, 'system')).toBe('system')
  })
})

describe('sanitizeSource', () => {
  it('trims and returns the label', () => {
    expect(sanitizeSource('  Claude Code  ')).toBe('Claude Code')
  })

  it('returns null for empty/whitespace/undefined', () => {
    expect(sanitizeSource(undefined)).toBeNull()
    expect(sanitizeSource('')).toBeNull()
    expect(sanitizeSource('   ')).toBeNull()
  })

  it('caps overly long labels', () => {
    const long = 'x'.repeat(200)
    const out = sanitizeSource(long)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(80)
  })
})

describe('composeCompletionCommentBody', () => {
  it('uses the agent summary for a completed task', () => {
    const body = composeCompletionCommentBody({ status: 'done', summary: 'Shipped the fix and verified.' })
    expect(body).toMatch(/completed/i)
    expect(body).toContain('Shipped the fix and verified.')
  })

  it('falls back to resolution when no summary is given', () => {
    const body = composeCompletionCommentBody({ status: 'done', resolution: 'Merged PR #42.' })
    expect(body).toContain('Merged PR #42.')
  })

  it('leads with the error for a failed task', () => {
    const body = composeCompletionCommentBody({ status: 'failed', errorMessage: 'Build broke on step 3.' })
    expect(body).toMatch(/failed/i)
    expect(body).toContain('Build broke on step 3.')
  })

  it('still produces a generic line when nothing extra is provided', () => {
    const done = composeCompletionCommentBody({ status: 'done' })
    expect(done).toMatch(/completed/i)
    expect(done.length).toBeGreaterThan(0)
    const failed = composeCompletionCommentBody({ status: 'failed' })
    expect(failed).toMatch(/failed/i)
  })

  it('prefers summary over resolution when both are present', () => {
    const body = composeCompletionCommentBody({
      status: 'done',
      summary: 'SUMMARY-WINS',
      resolution: 'resolution-text',
    })
    expect(body).toContain('SUMMARY-WINS')
    expect(body).not.toContain('resolution-text')
  })
})
