import type Database from 'better-sqlite3'
import {
  composeCompletionCommentBody,
  normalizeAuthorType,
  sanitizeSource,
  type AuthorType,
  type CompletionCommentInput,
} from '@/lib/task-attribution'

/**
 * Insert an attributed comment on a task. Thin DB wrapper around the comments
 * table — the `author` (account) is decided by the caller; `author_type`/`source`
 * record the kind of actor and the originating client. Exercised end-to-end by
 * the task/MCP e2e specs.
 */
export function appendAttributedComment(
  db: Database.Database,
  args: Readonly<{
    taskId: number
    workspaceId: number
    author: string
    authorType?: AuthorType
    source?: string | null
    content: string
  }>,
): number {
  const now = Math.floor(Date.now() / 1000)
  const res = db
    .prepare(
      `INSERT INTO comments (task_id, author, author_type, source, content, created_at, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.taskId,
      args.author,
      normalizeAuthorType(args.authorType),
      sanitizeSource(args.source),
      args.content,
      now,
      args.workspaceId,
    )
  return res.lastInsertRowid as number
}

/**
 * Auto-post the completion/failure comment when a task is finished, composing
 * the body from the agent's summary (preferred) or the task's resolution/error.
 */
export function appendTaskCompletionComment(
  db: Database.Database,
  args: Readonly<
    {
      taskId: number
      workspaceId: number
      author: string
      authorType?: AuthorType
      source?: string | null
    } & CompletionCommentInput
  >,
): number {
  return appendAttributedComment(db, {
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    author: args.author,
    authorType: args.authorType,
    source: args.source,
    content: composeCompletionCommentBody({
      status: args.status,
      summary: args.summary,
      resolution: args.resolution,
      errorMessage: args.errorMessage,
    }),
  })
}
