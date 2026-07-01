# Q4c Sandbox Efficiency

**Recommendation: no per-project Docker sandbox; use tool-policy-first and sandbox only code-capable exceptions.**

**(a) Per-project Docker sandbox: no.** In Opzava's pure per-tenant topology, the hard isolation boundary is already one Gateway per tenant. Skills are admin-only, curated, and vetted, and most agents need chat, memory/wiki, web, and messaging rather than runtime execution. A persistent `scope: "agent"` container per project would create idle container state, image/setup churn, Docker daemon exposure, bind/path policy to operate, and higher VPS RAM/IO for little marginal protection. It is over-engineering for the default lane.

**(b) Default posture.** Make tool policy the primary control. Standard agents run with sandbox off and no runtime surface, so there is no untrusted code path to containerize. Reserve sandboxing for the few agents that truly need code execution or filesystem mutation; for those, prefer `backend: "openshell"`/`"ssh"` on a worker when VPS load matters, or `scope: "shared"` per tenant if kept local. Do not use per-project or per-session Docker unless a tenant explicitly buys that isolation/cost profile.

**Standard-agent denylist.**

```json5
{
  "tools": {
    "deny": ["group:runtime", "write", "edit", "apply_patch"]
  }
}
```

Keep the allow side narrow to the product surface actually needed, typically `group:memory`, `group:web`, `group:messaging`, and specific curated plugin tools. `deny` remains the hard stop; `/exec` and elevated mode must not be able to reintroduce denied runtime tools.

**(c) Biggest sad path.** Allowed data-moving tools can still exfiltrate or poison context: `web_fetch` SSRF/prompt injection, wiki/memory recall of hostile tenant content, or messaging tools sending secrets/channel-derived data. The cheap mitigation is broker/tool wrappers with URL/IP allow/deny rules, per-tool secret redaction, least-privilege channel credentials, and audit logs for memory/web/message calls.

**Scale + ops.** No containers for standard agents keeps VPS density high; one shared/offloaded sandbox for rare code agents makes sandbox cost O(code tenants), not O(tenants x projects).
