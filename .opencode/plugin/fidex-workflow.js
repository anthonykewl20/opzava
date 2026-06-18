// Fidex Workflow Governor for opencode — the NON-before-gate half of TDD enforcement (the red-first
// before-edit gate now lives in the consolidated fidex-gate.js / `fidex gate`). This plugin keeps the
// hooks fidex-gate.js can't host because they fire on different opencode events:
//   - record     : `tool.execute.after` feeds test-run output to the ledger (observes red/green +
//                  test counts), so the gates have state to decide on.
//   - done       : the `event` hook fires `fidex workflow --done` on `session.idle` (turn complete),
//                  checking green-at-done + no-suppress. opencode's event hook is OBSERVATIONAL — it
//                  can't hard-block an already-finished turn — so a violation is recorded and surfaced
//                  on the NEXT turn via `experimental.chat.system.transform` (`--remind`). Honest
//                  consequence: green-at-done on opencode is detect-at-completion + enforce-next-turn,
//                  not a hard block (a host limitation, not a design choice).
// NOTE: the mutation-score gate (P2) is not yet auto-run at idle — that needs workspace impl/test
// discovery to run mutation on the real files; tracked as a follow-up.
const FIDEX = process.env.FIDEX_BIN || "/home/anthony/.local/bin/fidex"
const BASH_TOOLS = new Set(["bash", "shell"])
const TEST_SIGNAL = /\b(passed|failed|PASS|FAIL)\b|pytest|jest|vitest|go test/i

const sessionIdOf = (x) => (x && (x.sessionID || x.session_id || x.sessionId)) || ""

export const FidexWorkflow = async ({ $ }) => ({
  // Observe test runs so the gates have state. Non-blocking; only test-ish output is recorded
  // (the engine no-ops on output with no test signal, but we pre-filter to avoid the round-trip).
  "tool.execute.after": async (input, output) => {
    if (!BASH_TOOLS.has(input.tool)) return
    const out = (output && output.output) || ""
    if (!out || !TEST_SIGNAL.test(out)) return
    const payload = JSON.stringify({ sessionId: sessionIdOf(input), output: String(out).slice(-4000) })
    await $`echo ${payload} | ${FIDEX} workflow --after`.quiet().nothrow()
  },

  // Turn complete: run the done gate (green-at-done + no-suppress). The event hook is observational,
  // so a violation is recorded as a note (the engine writes it) — surfaced on the next turn below.
  "event": async ({ event }) => {
    if (!event || event.type !== "session.idle") return
    const sid = (event.properties && event.properties.sessionID) || ""
    if (!sid) return
    await $`echo ${JSON.stringify({ sessionId: sid })} | ${FIDEX} workflow --done`.quiet().nothrow()
  },

  // Surface a pending done-violation into the system prompt on the next turn (taken once, then cleared).
  "experimental.chat.system.transform": async (input, output) => {
    try {
      if (!output || !Array.isArray(output.system)) return
      const res = await $`echo ${JSON.stringify({ sessionId: sessionIdOf(input) })} | ${FIDEX} workflow --remind`
        .quiet().nothrow()
      const text = res.stdout.toString().trim()
      if (text) output.system.push(text)
    } catch {
      /* reminder is best-effort */
    }
  },
})
