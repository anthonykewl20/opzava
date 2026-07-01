(a) **No.** Per-project Docker sandbox (scope:agent) is over-engineering for per-tenant isolation + curated skills. The cost — N persistent containers per tenant, idle-prune bookkeeping, image pulls, Docker daemon attack surface — buys nothing when Tool Policy already eliminates untrusted code paths.

(b) **Yes, exactly that posture:**
- **Default agents (orchestrator, assistants, marketing/support):** SANDBOX=off. TOOL POLICY denies `group:runtime` (exec/process/code_execution) and filesystem-mutating tools. Zero containers, zero isolation overhead. Cheapest density.
- **Code-capable agents (rare):** SANDBOX=on, scope=**shared** per tenant (not per-project, not per-session) — single reused container/VM per tenant, idle-pruned at 24h. Better backends for VPS-light ops: **openshell/ssh worker** (dedicated micro-VPS), not Docker daemon on the gateway. Cuts daemon attack surface and container count to O(tenants), not O(tenants×projects).

**(c) Sad path you're missing:** A **vetted skill upgrade that later becomes abusive** (prompt-injection via a tool's input, not the tool itself). Tool Policy restricts *which tools fire*, not *what data flows into context*. Mitigation: egress allowlist + per-skill output sanitization + audit log of tool invocations on the cheap path. Secondary sad path: tenant admin compromising their own skill via a malicious wiki/doc pulled into RAG → tool invocation. Tool Policy alone won't catch this; needs input filtering on web/wiki fetches before they reach the model.

**Scale + ops:** One OpenClaw per tenant already caps concurrency per tenant; share-state container + no sandbox for chat-agents means you can pack ~3–5x more tenants per VPS. Lean default wins.
