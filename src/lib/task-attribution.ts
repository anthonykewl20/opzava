/**
 * Pure helpers for attributing task comments to a client/agent and for composing
 * the auto-comment posted when a task reaches a terminal status. No DB, no I/O —
 * the API routes do the persistence and pass plain data in.
 *
 * "Who vs where": a comment's `author` stays the authenticated account (set
 * server-side, never spoofable); `author_type` + `source` are additive
 * attribution — the kind of actor and the originating tool/client label.
 */

export type AuthorType = 'human' | 'agent' | 'system'

const AUTHOR_TYPES: readonly AuthorType[] = ['human', 'agent', 'system']

const SOURCE_MAX = 80

/** Coerce an arbitrary value to a valid author type, defaulting when unknown. */
export function normalizeAuthorType(value: unknown, fallback: AuthorType = 'human'): AuthorType {
  return AUTHOR_TYPES.includes(value as AuthorType) ? (value as AuthorType) : fallback
}

/** Trim + cap a free-text client/source label; null when empty. */
export function sanitizeSource(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > SOURCE_MAX ? trimmed.slice(0, SOURCE_MAX) : trimmed
}

export type CompletionCommentInput = Readonly<{
  status: 'done' | 'failed'
  summary?: string
  resolution?: string
  errorMessage?: string
}>

/**
 * Body of the comment auto-posted when a task is completed/failed. The agent's
 * own write-up (`summary`, via mc_complete_task) wins; otherwise we fall back to
 * the task's resolution / error_message, then a generic line.
 */
export function composeCompletionCommentBody(input: CompletionCommentInput): string {
  const detail = (input.summary ?? '').trim() || (input.resolution ?? '').trim()

  if (input.status === 'failed') {
    const err = (input.errorMessage ?? '').trim() || detail
    return err ? `❌ Task failed.\n\n${err}` : '❌ Task failed.'
  }

  return detail ? `✅ Task completed.\n\n${detail}` : '✅ Task completed.'
}
