// Fidex unified pre-edit gate for opencode — ONE plugin that runs the whole pre-tool pipeline (guard +
// workflow red-first + complexity + slop + architecture) via a single `fidex gate` call, instead of
// five plugins each shelling out separately. The engine reads the payload once, resolves the edited
// paths and their POST-edit content once, and logs every verdict (audit trail). Place in
// `.opencode/plugins/`.
//
//   - block : `tool.execute.before` → exit 2 throws the offending gate's message; the model retries.
//   - fail semantics live in the engine: guard + workflow FAIL CLOSED (an error blocks); complexity +
//     slop + architecture FAIL OPEN (an error is logged, never blocks a clean edit).
const FIDEX = process.env.FIDEX_BIN || "/home/anthony/.local/bin/fidex"
const EDIT_TOOLS = new Set(["edit", "write", "apply_patch"])
const BASH_TOOLS = new Set(["bash", "shell"])

const sessionIdOf = (x) => (x && (x.sessionID || x.session_id || x.sessionId)) || ""
const str = (v) => (typeof v === "string" ? v : "")

export const FidexGate = async ({ $ }) => ({
  "tool.execute.before": async (input, output) => {
    const a = (output && output.args) || {}
    let payload
    if (EDIT_TOOLS.has(input.tool)) {
      const path = a.filePath || a.path || a.file || a.filename || a.file_path || ""
      const patchText = str(a.patchText)
      const content = str(a.content) // full new file (write) → exact gate; edits reconstructed from disk
      if (!path && !patchText && !content) return
      payload = {
        sessionId: sessionIdOf(input), tool: input.tool, path, patchText, content,
        // forward edit fragments so the engine can judge the POST-edit result, not stale disk
        old_string: str(a.oldString || a.old_string), new_string: str(a.newString || a.new_string),
        edits: Array.isArray(a.edits) ? a.edits : undefined, replace_all: !!(a.replaceAll || a.replace_all),
      }
    } else if (BASH_TOOLS.has(input.tool)) {
      // bash can WRITE files (`printf > x.py`, `tee`, `sed -i`, `cp`/`mv`) — the engine extracts the
      // written paths and applies guard + red-first there too, closing the shell bypass.
      const command = a.command || a.cmd || ""
      if (!command) return
      payload = { sessionId: sessionIdOf(input), tool: "bash", command: String(command) }
    } else {
      return
    }
    const res = await $`echo ${JSON.stringify(payload)} | ${FIDEX} gate`.quiet().nothrow()
    if (res.exitCode === 2) {
      throw new Error(
        res.stderr.toString().trim() ||
          "Blocked by a Fidex governance gate (guard / TDD / complexity / slop / architecture).",
      )
    }
  },
})
