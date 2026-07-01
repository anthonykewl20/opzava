# Opzava — build guide for AI agents

**Read `docs/plan/EXECUTION.md` FIRST.** It is the single **living control doc** for building Opzava: it holds the current
phase/slice, the exact next action, which **skills** to use, and the **acceptance signal**. Work **one slice at a time**, then
update it (tick deliverables, set slice status, append a dated worklog entry) and commit. It supports clean start/stop/resume —
use the `handoff` skill. Do not skip ahead; keep the doc in sync with reality.

## Doc map (reference — `EXECUTION.md` is the control surface)
- `ARCHITECTURE.md` — the whole system in ~5 minutes (bounded contexts, ports, invariants, deployment, ADR index).
- `docs/plan/roadmap.md` — the phased product roadmap (P1–P8) after the MVP.
- `docs/plan/grilling-decisions.md` — the canonical design record (Q1–Q14, every invariant).
- `docs/adr/` — 15 ADRs (architecture decisions). `docs/prd/` — 18 PRDs (product specs).
- `docs/plan/capability-parity.md` — every screen: OpenClaw-native vs Opzava-owned vs hybrid.
- `docs/openclaw/` — vendored OpenClaw docs. **Design to these; harness, don't reinvent.**

## Non-negotiables (full detail in `ARCHITECTURE.md` + the ADRs)
- **OpenClaw parity:** design to OpenClaw's real capabilities (`docs/openclaw`); stay on its grain.
- **Pure per-tenant Gateway**; **two-token** (hot-path `write`+`approvals` vs JIT `admin`); the **gateway-broker is the only ACL** to OpenClaw.
- **Postgres is the source of truth**; projections are a **rebuildable cache** (RPC snapshots are truth, WS events are hints).
- **Tool-policy-first** security ("SOUL can lie; tool policy cannot"); **RLS denial is a hard 403**, never a silent empty result.
- **Local docker-compose in parity with live Dokploy** (single compose, Traefik labels); **no routable orphan Gateway**.
- Scale-ready modular DDD (no MVP-then-rewrite); agnostic ports; sad-path-first; lean VPS ops.

## Gated workflow (MANDATORY — every issue, slice, and phase)
Every unit of work follows the same gates, in order — do not skip:
1. **Orient:** read this file + `docs/plan/EXECUTION.md`; load the `opzava-conventions` skill and the skills named on the issue/slice.
2. **Scope:** work ONLY the current slice/issue (`EXECUTION.md` → Current State). Never skip ahead.
3. **Build to spec:** implement strictly to the linked ADR/PRD; honor every invariant above; design to `docs/openclaw` (parity — harness, don't reinvent).
4. **Prove:** `tdd` (red→green) → `verify-deep` (tests + lint + typecheck) → `code-review`. Local↔Dokploy parity must stay intact.
5. **Record:** update `EXECUTION.md` (slice status + dated worklog) and the issue; commit via `commit-style` on a branch off `development`.

A slice/issue is **Done** only when all five gates pass. Missing a skill? Author it with `writing-great-skills` before proceeding.
Each GitHub issue restates this workflow + its exact skill set — follow it verbatim.
