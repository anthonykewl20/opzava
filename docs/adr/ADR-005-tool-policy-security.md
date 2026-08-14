# ADR-005: Tool-policy-first security, approval gates, and sandbox posture

Status: Accepted

> **As-built note (2026-08-14):** The live standard agent is Ask Admin. Its deny list adds `group:fs` beyond this ADR's JSON5 (code is stricter than the ADR); the intended A2 coding profile and exact 25-name allow surface are pending (open question — see issue #92).

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

Opzava will make OpenClaw tool policy and Opzava approval rows the primary enforcement controls for AI agent authority. Standard agents run without a sandbox and without runtime or filesystem-mutation tools; sandboxing is reserved for the rare code-executing agent. This keeps the security model on OpenClaw's grain while preserving lean VPS operations and avoiding per-project container sprawl.

## Context

ADR-001 establishes lean VPS operations, vendor-neutral ports, and OpenClaw capability parity as foundational constraints. ADR-002 establishes one OpenClaw Gateway per tenant, and ADR-003 makes the `gateway-broker` the only production ACL to OpenClaw runtime capabilities. ADR-004 keeps OpenClaw-owned runtime data behind that ACL and treats Gateway events and snapshots as inputs to Opzava projections, not as Opzava domain truth.

OpenClaw exposes three different controls that are easy to conflate. Sandbox controls where tools run. Tool policy controls which tools exist and are callable. Elevated mode is an exec-only escape hatch when a session is sandboxed, but it does not grant a denied tool. The load-bearing rule is that `deny` wins: tool policy is the hard stop, and `/exec` or elevated mode cannot reintroduce a denied `exec`, `process`, or `code_execution` surface.

Q4c locks the efficiency posture: no per-project Docker sandbox. Opzava already pays for one Gateway per tenant, skills are admin-only and curated, and most employees need chat, memory/wiki, web, messaging, and session operations rather than arbitrary code execution. A container per project would multiply idle state, image churn, bind policy, Docker daemon exposure, and VPS memory/IO cost while adding little protection for the standard lane.

Q8 and Q11 lock the governance posture. AI employees are delegate agents with personas, standing orders, channel bindings, and autonomy tiers, but governance must be enforced by Gateway tool policy and Opzava approval rows, not by persona files. The principle is: SOUL can lie; tool policy cannot. Opzava `Approval` is the system of record for business approvals such as content, finance, and send-on-behalf actions, while OpenClaw `operator.approvals` remains the runtime truth for exec/plugin gates. Money, PII, credentials, legal actions, tenant-admin actions, and publishing gates require durable approval rows and audit.

The hardest residual risk is not "agent escaped its container." It is data flow. Allowed tools can still move, poison, or disclose data: SSRF through `web_fetch`, prompt-injection and context-poisoning through RAG content, hostile wiki/web/doc input that changes model behavior, or secret exfiltration through messaging and web tools. Neither a per-project sandbox nor persona text solves that class of failure.

## Decision

Use tool policy as the primary control for standard agents. Standard agents include orchestrators, project assistants, department employees, marketing/support assistants, Ask Opzava, and other non-code-executing agents. They run with `sandbox.mode: off`, and their effective tool policy denies runtime execution and filesystem mutation.

Standard agents may be allowed only the product capabilities they need:

- chat and internal collaboration surfaces
- `group:memory` for memory/wiki search and retrieval
- `group:web` only through egress-allowlisted broker/tool wrappers
- `group:messaging` for approved messaging surfaces
- `group:sessions` for OpenClaw session coordination where admitted by the broker
- specific curated plugin tools when the tenant, agent, and workflow policy allow them

The deny side is the authority. A standard agent must not receive `exec`, `process`, `code_execution`, write, edit, or patch capability through global defaults, provider overrides, per-agent overrides, sandbox tool policy, `/exec`, elevated mode, plugins, or workflow provisioning. `deny` rules must be emitted into auditable Gateway/tool-policy logs and mirrored into Opzava tool-invocation audit where a tenant-visible or admin-visible action is involved.

Use Opzava approval rows as the primary business gate. Business approvals are represented by the Q11 `Approval` aggregate with `Pending`, `Approved`, `Rejected`, and `Expired` states, and are surfaced through the chat/inbox path from ADR-009. Runtime exec/plugin approvals remain OpenClaw `operator.approvals`, reached through ADR-003 with the hot-path broker token. Where a business approval and runtime approval both exist, they are reconciled by mirrored refs; business conflict resolves in favor of Opzava.

Enforce governance at policy rows and tool invocation, not at persona text. `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, standing orders, and prompt instructions describe employee behavior and delegation, but they do not authorize side effects. The authoritative checks are:

- Gateway tool policy for which tools are callable.
- Opzava `AuthorizationPort` and tenant/project RBAC for who may ask.
- Opzava `Approval` rows for business approval gates.
- OpenClaw `operator.approvals` for runtime exec/plugin gates.
- Per-agent domain allowlists and channel bindings for where data may be sent.
- Immutable audit rows for sends, mutations, approvals, tool calls, and policy decisions.

Do not create a per-project Docker sandbox. Runtime cost must stay O(tenants), not O(tenants x projects). The default production topology remains one Gateway per tenant from ADR-002, with no extra container per project, per employee, or per session for ordinary work.

Reserve sandboxing for the rare code-executing agent. A code-capable agent is an explicit exception with a different policy profile, approval posture, and audit expectation. Its sandbox is either:

- `scope: shared` per tenant when kept local to the tenant Gateway host, idle-pruned and reused across code-capable work; or
- offloaded to an `ssh` or `openshell` worker, preferably on a cheap separate box, when keeping Docker daemon load and code execution off the main Gateway VPS is the better operational trade-off.

Code-capable agents must still pass tool policy and approval gates. Sandbox only changes where tools run; it does not replace deny rules, egress policy, RBAC, business approvals, runtime approvals, or audit.

Mitigate the real residual risk as data-flow security:

- `web_fetch` and outbound HTTP use egress/domain allowlists, URL normalization, private-IP/link-local denial, redirect checks, and per-agent policy.
- Ingested web/wiki/document/channel content is sanitized before it reaches model context, memory, or project corpora.
- Tool wrappers redact secrets and high-risk payloads at the boundary before storage or tool result injection.
- RAG ingestion records source, content hash, tenant, project/corpus scope, sanitizer version, and promotion/review status.
- Tool invocation audit records actor, agent, tenant, project, tool, policyRef, approvalRef, target domain/channel, payload classification, decision, and result metadata.
- Spend, rate, and fan-out limits from ADR-008 and ADR-012 apply before workflow publication and at runtime through the broker and run limiter.

## Standard-Agent Denylist

The standard-agent policy denies runtime execution and filesystem mutation:

```json5
{
  "sandbox": {
    "mode": "off"
  },
  "tools": {
    "deny": [
      "group:runtime",
      "write",
      "edit",
      "apply_patch"
    ]
  }
}
```

`group:runtime` covers `exec`, `process`, and `code_execution`. Denying `write`, `edit`, and `apply_patch` blocks the first-class filesystem mutation tools. If any profile ever allows raw `exec`, this denylist is not enough to make shell commands read-only, so `group:runtime` remains mandatory for standard agents.

Allowlists should be narrow and capability-specific. A typical standard agent starts from chat, memory/wiki search, egress-allowlisted web, messaging, sessions, and curated plugin tools, then removes anything the agent's department, autonomy tier, project assignment, or channel binding does not need.

## Consequences

The cheapest control becomes the strongest default. Standard agents do not start containers, mount workspaces, pull images, keep idle Docker state, or consume per-project sandbox resources. VPS density remains governed by tenant Gateways and live runtime demand instead of project count.

The policy model is easier to audit than persona promises. Future reviewers can inspect tool policy, approval rows, broker admission, and audit logs to understand why an agent could or could not act. Persona files remain important for behavior and delegation, but they are not trusted enforcement boundaries.

The `gateway-broker` and Runtime-Control context become responsible for coherent admission. A user request, standing order, workflow run, or proactive agent action must be checked against tenant lifecycle, RBAC, agent policy, allowlists, approval requirements, spend/rate caps, and OpenClaw scope before a runtime tool is invoked.

The main sad paths move to data-flow defenses. Opzava must invest in egress allowlists, sanitizer pipelines, secret redaction, content provenance, RAG promotion/review, tool-invocation audit, and anomaly detection. A sandbox cannot be used as evidence that `web_fetch`, memory retrieval, channel messages, or generated content are safe.

Code execution becomes an explicit exception path. This reduces accidental blast radius but means product work that truly needs code execution must declare a code-capable agent profile, provision the shared/offloaded sandbox path, define approval gates, and accept lower density for that capability.

Some OpenClaw plugin and skill capabilities remain admin-only. Curated skills are installed through the audited provisioning path, not by tenant self-install, because skills are executable code and can become abusive after upgrade or through hostile inputs.

## Alternatives

Use a per-project Docker sandbox for every project or employee. Rejected because it turns runtime cost into O(tenants x projects), creates idle container and image churn, increases Docker daemon and bind-mount policy surface area, and provides little marginal protection when standard agents have no runtime execution or filesystem-mutation tools. OpenClaw sandboxing is useful, but it is not the hostile multi-tenant boundary for Opzava's normal lane.

Use per-session Docker sandboxes for ordinary agent turns. Rejected because session-level churn is even worse operationally: cold starts, image pulls, state cleanup, and debugging complexity would hit the common chat/workflow path. Standard agents need policy-denied runtime tools, not short-lived containers.

Rely on persona files, SOUL hard-blocks, or prompt instructions for governance. Rejected because prompt text is context, not enforcement. Prompt-injection, hostile retrieved content, truncation, and model error can all bypass intent. The enforceable controls are tool policy, approval rows, broker admission, egress policy, and audit.

Disable all web, memory, wiki, and messaging tools for safety. Rejected because those tools are the product surface for AI employees: customer support, marketing, CRM, internal collaboration, and project work require data access and communication. The correct control is narrow allowlists, content sanitization, redaction, approvals, and audit, not removing the capabilities Opzava exists to provide.

Use one broad sandbox/elevated exception for all agents. Rejected because elevated is exec-only and cannot grant denied tools, while broad code capability would erase the least-privilege posture. Code execution is a named exception with its own policy profile and runtime placement.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, and provisioning saga.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
- ADR-012: Department workflow engine, approvals, content pipeline, reports.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).
