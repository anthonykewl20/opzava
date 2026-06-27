import { z } from 'zod'

// Conversation contracts (doc 95 §D1; CONTEXT.md "Conversation").
//
// IMPORTANT: Ask-Opzava (type 'orchestrator') is SELF-CONTAINED in these Engine-B tables — the
// human's prompt is a role='human' turn, never a row in the inherited `messages` table. The
// inherited `messages` system is the separate human↔human "Messages" surface (messages-slack.html,
// doc 09 conversation c). Do not merge `messages` into an orchestrator thread.

export const CONVERSATION_SCHEMA_VERSION = 1 as const

export const conversationTypeSchema = z.enum(['orchestrator', 'assistant', 'team', 'dm'])
export type ConversationType = z.infer<typeof conversationTypeSchema>

export const conversationSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
    type: conversationTypeSchema,
    projectId: z.number().int().nullable(),
    participants: z.array(z.string().min(1)).default([]),
    title: z.string().max(200).nullable(),
    record: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.string().min(1),
    lastMessageAt: z.string().min(1).nullable(),
  })
  .strict()
export type Conversation = Readonly<z.infer<typeof conversationSchema>>

export const turnRoleSchema = z.enum(['human', 'ai', 'system'])
export type TurnRole = z.infer<typeof turnRoleSchema>

export const turnRefTypeSchema = z.enum(['run', 'artifact', 'approval'])
export type TurnRefType = z.infer<typeof turnRefTypeSchema>

export const conversationTurnSchema = z
  .object({
    turnId: z.string().min(1).max(200),
    conversationId: z.string().min(1).max(200),
    parentTurnId: z.string().min(1).max(200).nullable(),
    author: z.string().min(1).max(200),
    role: turnRoleSchema,
    body: z.string().default(''),
    refType: turnRefTypeSchema.nullable(),
    refId: z.string().min(1).max(200).nullable(),
    // Soft pointer into inherited `messages` for dm/team overlays only; ALWAYS null for orchestrator.
    messageAnchor: z.number().int().nullable(),
    status: z.string().max(40).nullable(),
    record: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.string().min(1),
  })
  .strict()
export type ConversationTurn = Readonly<z.infer<typeof conversationTurnSchema>>

export function parseConversation(input: unknown): Conversation {
  return Object.freeze(conversationSchema.parse(input))
}

export function parseConversationTurn(input: unknown): ConversationTurn {
  return Object.freeze(conversationTurnSchema.parse(input))
}
