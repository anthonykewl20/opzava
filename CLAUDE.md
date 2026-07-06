# Opzava - build guide for AI agents

**Read `docs/plan/EXECUTION.md` FIRST.** It is the living control doc - current phase/slice, the exact next action, which **skills** to use, the **acceptance signal**. Work **one slice at a time**, then update it (tick deliverables, set slice status, append a dated worklog entry) and commit. Use the `handoff` skill for clean start/stop/resume. Keep the doc in sync with reality.

## Doc map (reference)
- `ARCHITECTURE.md` - the whole system in ~5 minutes (bounded contexts, ports, invariants, deployment, ADR index).
- `docs/plan/roadmap.md` - the phased product roadmap (P1-P8) after the MVP.
- `docs/plan/grilling-decisions.md` - the canonical design record (Q1-Q16, every invariant).
- `docs/plan/official-docs.md` - official documentation registry.
- `docs/adr/` - 15 ADRs (architecture decisions). `docs/prd/` - 18 PRDs (product specs).
- `docs/plan/capability-parity.md` - every screen: OpenClaw-native vs Opzava-owned vs hybrid.
- `docs/plan/backlog.md` - initial ADR/PRD dependency backlog (planning input; `EXECUTION.md` controls order).
- `docs/plan/consensus/` + `docs/plan/research/` - frozen evidence memos behind the decisions (see each dir's README; never current truth).
- `docs/plan/audits/` - dated docs-audit reports. `docs/runbooks/` - ops runbooks (gateway, pairing, model auth).
- `docs/ux-law/` - curated UX reference library; use for frontend/design work (PRD-017).
- `ux-redesign/mockups/` - the canonical screen mockups every PRD/UI slice designs to (tokens from `style-guide.html`; PRD-017 is the contract).
- `docs/openclaw/` - vendored OpenClaw docs.

## Non-negotiables (full detail in `ARCHITECTURE.md` + the ADRs)
- **OpenClaw parity:** design to OpenClaw's real capabilities (`docs/openclaw`); harness, don't reinvent.
- **Official-docs rule:** validate every API against `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs before coding.
- **Pure per-tenant Gateway**; **two-token** (hot-path `write`+`approvals` vs JIT `admin`); the **gateway-broker is the only ACL** to OpenClaw.
- **Postgres is the source of truth**; projections are a **rebuildable cache** (RPC snapshots are truth, WS events are hints).
- **Tool-policy-first** security ("SOUL can lie; tool policy cannot"); **RLS denial is a hard 403**, never a silent empty result.
- **Local docker-compose in parity with live Dokploy** (single compose, Traefik labels); **no routable orphan Gateway**.
- Scale-ready modular DDD (no MVP-then-rewrite); agnostic ports; sad-path-first; lean VPS ops.
- **Mockup parity (functional + visual):** every visible element on a mockup screen a slice implements must FUNCTION LIVE - real data, real interactions, no dead chrome, no fake data - AND match the mockup 100%: same DOM structure/classes driven by live data, styled by `tokens.css`/`app.css`/`shadcn.css`, side-by-side screenshot-verified. "Looks close" is a bug. Descope only explicitly in `EXECUTION.md` (user directive 2026-07-03).

## Gated workflow (MANDATORY - every issue, slice, and phase)
Every unit of work follows the same gates, in order - do not skip:
1. **Orient:** read this file + `docs/plan/EXECUTION.md`; load the `opzava-conventions` skill and the skills named on the issue/slice.
2. **Scope:** work ONLY the current slice/issue (`EXECUTION.md` → Current State). Never skip ahead.
3. **Validate official docs:** apply the Official-docs rule before coding any API.
4. **Build to spec:** implement strictly to the linked ADR/PRD.
5. **Prove:** `tdd` (red→green) → `no-mistakes` → `code-review`. Local↔Dokploy parity must stay intact.
6. **Record:** update `EXECUTION.md` (slice status + dated worklog) and the issue; commit on a branch off `development`.

A slice/issue is **Done** only when all six gates pass. Each GitHub issue restates this workflow and its exact skill set - follow it verbatim. Missing a skill? Author it with `writing-great-skills` before proceeding.
