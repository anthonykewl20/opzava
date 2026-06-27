<!-- agent-context: read this before editing the module -->

# modules/conversations

## Purpose

The **Ask-Opzava** orchestrator chat surface (`orchestrator-chat.html`) — the admin operator talks to the lead orchestrator, reads a cross-project Digest, and confirms proposed actions. Built to doc 95 §D1/D1.1, ARD 0028/0029, doc 100 T3. (S1 = the conversational pipe; S2 adds the `PostApprovalDispatcher`, S3 adds `launch_work`.)

## Public surface (`index.ts` barrel — truth)

- **Contracts** (`contracts.ts`): `Conversation`/`ConversationTurn` (+ `parse*`, `*Schema`, `ConversationType`/`TurnRole`/`TurnRefType`).
- **Persistence** (`conversation-repository.ts`): `ConversationRepository`/`createConversationRepository` over `opzava_conversation` + `opzava_conversation_turn` (migration 060).
- **Thread read** (`read-conversation-thread.ts`): `readConversationThread(repo, id, viewer)` → `{conversation, timeline}` | null.

## Invariants (do not regress)

- **Ask-Opzava is SELF-CONTAINED** in `opzava_conversation` + `opzava_conversation_turn`. The human's prompt is a `role='human'` **turn**, never a row in the inherited `messages` table. `messages` is the SEPARATE human↔human "Messages" surface (`messages-slack.html`, doc 09 conversation c) — **never read or merge it here**. `messageAnchor` stays null for orchestrator turns (it exists only for future dm/team overlays).
- **Schema is owned by migration 060** (the 059/CardDecomposition precedent) — the repo is CRUD only, no `ensureSchema` duplication.
- **Action-block turns are the one source of truth** for proposed actions (`status='pending'` + the action vocabulary in `record`); no parallel table.
- **Facts in context, never invented** — the Concierge model narrates; the Digest numbers are server-composed deterministically (see `composeDigest`).

## Editor guardrails

- **Engine boundary:** never `import` from `src/lib`. Cross-engine reads (tasks/messages) go through injected ports / `platform/composition`. Cross-module use is via this barrel only.
- New product code stays under this module; routes/panels stay thin and call the barrel.
