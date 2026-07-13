# Findings

Use this model exactly:

```json
{
  "id": "probe-001",
  "lens": "functional|usability|output",
  "surface": "/tasks",
  "objective": "create a task",
  "repro": ["Navigate to /tasks", "Submit an empty title"],
  "expected": "The UI rejects the invalid input with clear feedback.",
  "actual": "The UI accepted the invalid input.",
  "evidence": {
    "screenshot": "real-validate-artifacts/.../probe-001.png",
    "responseSlice": "HTTP 200 POST /...",
    "logSlice": "web-1 ..."
  },
  "severity": "blocker|major|minor|nit"
}
```

Field notes:
- `repro` is an ARRAY of steps (a bare string is silently dropped).
- `evidence` is an OBJECT with `screenshot` / `responseSlice` / `logSlice` (a JSON string is silently dropped).
- `lens` is closed: `functional` | `usability` | `output`.

## Routing

- Write artifacts and a JSON report under the output directory; print concise findings for humans; never silently drop a finding.
- **Gate findings block Done.**
- **Probe findings** become GitHub issues or Task cards after adversarial verification, but do not change the gate verdict.
