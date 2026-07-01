**1) AgentEmployee aggregate (DDD)**
```
AgentEmployee { id, tenantId, name, personaId, departmentId, autonomyTier,
  openclawAgentId, agentDirRef, soulRef, identityRef, standingOrderIds[],
  channelBindings[ChannelBinding], toolPolicyRef, status }
Persona { id, soulMd, agentsMd, identityMd, hardBlocks[] }
Department { id, name, roleMandate, defaultTier }
AutonomyTier { TIER1_DRAFT | TIER2_SEND_SELF | TIER3_PROACTIVE }
StandingOrder { id, scope, trigger, actions[], approvalRequired, auditLevel }
ChannelBinding { channel, accountId, direction, scopeFilter }
Assignment { taskId, employeeId, projectId?, startedAt, reportRef }
Project { id, name, sharedCorpusRef, memberIds[] }
```

**2) Knowledge-scoping resolution: DECISIVE**
**`employee = workspace`, `project = shared corpus`, `org = corpus`.** Workspace identity is *per employee*, not per project. An employee carries persona + memory-lancedb + skills across all work. A Project owns a read-only `corpusRef` (wiki + vector) injected at session start **on top** of the employee's personal memory (personal first, project overlay, org overlay last). Memory writes always land in the employee's own workspace, never the project corpus. This survives project churn and matches OpenClaw's agentDir model. *"Project = workspace" is REJECTED.*

**3) Delegation / 'Ask Opzava'**
Main orchestrator delegate owns SOUL: *"never answer directly if a specialist exists; route via multi-agent."* User PM card → orchestrator parses intent → resolves Department → picks lowest-loaded AgentEmployee → spawns subagent session (employee's own gateway, agentDir, bindings) → employee works → reports back as a chat message attributed to its persona → orchestrator threads into the parent card. Escalates to human if `tier == DRAFT` or block fires.

**4) Per-department default tier**
- **T1 (Draft):** Finance, Customer Management (PII/contracts) — approval gate.
- **T2 (Send-self):** Marketing (posts under company handle), Customer Support (replies under agent identity).
- **T3 (Proactive):** Monitoring/ops only; finance-event triggered standing-orders stay T1 + approval.

**5) Biggest sad path + invariant**
**Prompt-injection via customer channel → rogue Tier-2 support agent exfiltrates contact PII to a webhook.** *Invariants (enforced at Gateway TOOL POLICY, not SOUL):* (a) outbound HTTP only to allowlisted domains per agent; (b) tool policy denies any PII field read unless `customer.management` channel binding; (c) standing-orders are the **only** trigger for autonomous sends — never an inbound message; (d) every send emits an immutable audit row; (e) per-agent spend/rate cap. SOUL can lie. Tool policy cannot.

**Parity + lean-ops:** one OpenClaw Gateway per tenant, many delegates, multi-agent routing — single lean VPS per tenant, project corpus = PG wiki rows + pgvector, employee memory = per-agent LanceDB volume.
