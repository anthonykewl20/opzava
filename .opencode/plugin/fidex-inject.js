// Fidex mandatory-skill injection for opencode. opencode's native skill selection collapses
// once the skill set is realistic (baseline experiment: 0/6 under 15 skills, vs Claude 6/6),
// so we force matching mandatory skills into context instead of relying on the model to elect
// the `skill` tool. Delegates all logic to the `fidex inject` engine. Place in `.opencode/plugins/`.
//
// Claude Code needs none of this — its native auto-invocation already activates skills (6/6).
const FIDEX = process.env.FIDEX_BIN || "/home/anthony/.local/bin/fidex"
// CONFIRMED edit-capable tool ids (opencode 1.17.4 tool registry; docs/discovery/0001).
// `apply_patch` carries a multi-file patch blob, not a single filePath — filePathOf returns ""
// for it, so the hook no-ops rather than misfiring. There is no `patch`/`multiedit` tool.
const EDIT_TOOLS = new Set(["edit", "write", "apply_patch"])
// A model can also edit files through the bash tool (live-discovered: gpt-5.5 ran `perl -i` after
// apply_patch was blocked — docs/discovery/0001 #8). Cheap write-hint pre-filter so read-only bash
// (the common case) never spawns the engine; the engine does the authoritative path extraction.
const BASH_TOOLS = new Set(["bash", "shell"])
const BASH_WRITE_HINT = /(?:^|[\s|;&])(?:tee|dd|cp|mv|install)\b|>>?|&>|sed\s+--?i|perl\s+-\S*i/

// CONFIRMED (docs/discovery/0001 #3): opencode's edit/write tools carry the target path under
// `filePath`. We still fall back across aliases then to any path-shaped string, so a future
// opencode rename degrades gracefully instead of breaking.
const filePathOf = (args) => {
  if (!args) return ""
  const direct = args.filePath || args.path || args.file || args.filename
  if (direct) return direct
  for (const v of Object.values(args)) {
    if (typeof v === "string" && !v.includes("\n") && /\.[A-Za-z0-9]{1,8}$/.test(v)) return v
  }
  return ""
}
const sessionIdOf = (x) =>
  (x && (x.sessionID || x.session_id || x.sessionId)) || ""

export const FidexInject = async ({ $ }) => ({
  // Force the mandatory skill into context the moment the agent edits a matching file.
  // `fidex inject` exits 2 with the skill body the first time per skill per session; we throw
  // it (the only at-edit-time AI-visible primitive opencode exposes) so the model reads it and
  // retries the edit. Subsequent edits don't re-throw — the system-prompt reminder carries it.
  "tool.execute.before": async (input, output) => {
    const args = (output && output.args) || {}
    let fields
    if (EDIT_TOOLS.has(input.tool)) {
      const path = filePathOf(args)
      // apply_patch (gpt-5.5's default edit tool) carries paths inside patchText, not filePath —
      // forward it so the engine can extract them (docs/discovery/0001 #7).
      const patchText = typeof args.patchText === "string" ? args.patchText : ""
      if (!path && !patchText) return
      fields = { path, patchText }
    } else if (BASH_TOOLS.has(input.tool)) {
      const command = typeof args.command === "string" ? args.command : (typeof args.cmd === "string" ? args.cmd : "")
      if (!command || !BASH_WRITE_HINT.test(command)) return  // read-only bash: skip the engine
      fields = { command }
    } else {
      return
    }
    const payload = JSON.stringify({ sessionId: sessionIdOf(input), tool: input.tool, ...fields })
    const res = await $`echo ${payload} | ${FIDEX} inject`.quiet().nothrow()
    if (res.exitCode === 2) {
      // CONFIRMED (docs/discovery/0001 #5,#6, live probe): throwing aborts the edit AND opencode
      // surfaces this message to the model, which reads it and retries. The per-turn
      // system.transform reminder is the backstop if a future model ignores it.
      throw new Error(
        res.stdout.toString().trim() ||
          "A mandatory skill applies to this file — load it, then retry the edit.",
      )
    }
  },

  // Durable reminder: keep active mandatory skills present in the system prompt every turn so
  // they survive context compaction. Experimental hook — optional; never break inference if it
  // (or the engine) is unavailable.
  "experimental.chat.system.transform": async (input, output) => {
    try {
      if (!output || !Array.isArray(output.system)) return
      const payload = JSON.stringify({ sessionId: sessionIdOf(input) })
      const res = await $`echo ${payload} | ${FIDEX} inject --remind`.quiet().nothrow()
      const text = res.stdout.toString().trim()
      if (text) output.system.push(text)
    } catch {
      /* reminder is best-effort */
    }
  },
})
