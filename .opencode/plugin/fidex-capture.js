// Fidex learning-capture for opencode — parity with Claude Code's UserPromptSubmit capture hook.
// Feeds each user message to the `fidex capture` engine so the learning flywheel works on opencode
// too: a correction that arrives while a mandatory skill is active is auto-classified as DRIFT and
// tagged with the violated skill (docs/adr/0003). Without this, auto-drift detection was Claude-only.
// Place in `.opencode/plugins/`. Best-effort: never breaks inference.
const FIDEX = process.env.FIDEX_BIN || "/home/anthony/.local/bin/fidex"

const sessionIdOf = (x) => (x && (x.sessionID || x.session_id || x.sessionId)) || ""

const userText = (output) => {
  const parts = (output && output.parts) || []
  return parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join(" ")
    .trim()
}

export const FidexCapture = async ({ $ }) => ({
  // Fired when a new (user) message is received. We normalize opencode's event to the same shape
  // Claude Code emits (hook_event_name=UserPromptSubmit) so the shared `capture` engine — which does
  // the correction/drift classification + active-skill lookup — works unchanged across hosts.
  "chat.message": async (input, output) => {
    try {
      const text = userText(output)
      if (!text) return
      const payload = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: text,
        sessionId: sessionIdOf(input),
      })
      await $`echo ${payload} | ${FIDEX} capture`.quiet().nothrow()
    } catch {
      /* capture is best-effort — never break the chat */
    }
  },
})
