# Delivery workflow — the order every change follows

**Read this before touching anything.** There is no long-tenured engineer here: every task starts with
someone new. This file is the process so a newcomer knows exactly what to do, in what order, and what
they are not allowed to skip.

The rule is simple: **you never start at the code.** You start at an approved ticket, and you finish
at a merged PR with real evidence. Everything below is the path between those two points.

---

## The gates (in order)

Each gate must pass before the next. If a gate fails, stop and report — do not proceed.

### 0. Find the work — where the next task comes from
You should not need to be told what to do. Work it out in this order and stop at the first hit:

```bash
# 1. Already in flight? Finish it before starting anything new.
gh issue list --repo anthonykewl20/opzava --label status:in-progress

# 2. Approved and ready for a newcomer to pick up:
gh issue list --repo anthonykewl20/opzava --label status:ready
```

3. **Nothing ready?** Then the work is *specced but unfiled*. Read the delivery graphs
   (`docs/plan/research/wf246-admin-control-center-delivery-graph.md` §4,
   `wf237-devboard-implementation-graph.md`), pick the next slice whose blockers are all merged, and
   take it through the **Readiness gate** (author → consensus review → owner approval → file).
4. **Never invent work.** If it is not in a delivery graph or an issue, it is not the next task — ask.

`status:ready` is the contract: it means *"approved, unblocked, a newcomer may start this."*
`status:in-progress` means someone is on it. **GitHub labels are the queue — there is no separate
status file to go stale.**

### 1. Orient
- Read `CLAUDE.md`, then the **current approved GitHub issue** (from gate 0).
- If a skill is named (`opzava-conventions`, `better-auth`, `openclaw-broker`, …), read it.
- Verify current official docs before coding an API (`docs/plan/official-docs.md`, `mainframe/docs/**`).

### 2. Readiness gate — is there an approved ticket?
- **Work one approved issue at a time.** Never build from a PRD/ADR/wayfinder memo directly — those
  are *authority*, not a brief.
- If the work is specced in a delivery-graph doc but **has no issue**, you must author one first:
  outcome, bounded scope, sad paths, edge cases, acceptance criteria, user-level E2E expectations,
  dependencies, and a final behavioural contract.
- Run a **readiness review with another provider** (DeepSeek via `ocask`) — never rely on your own
  judgement alone. Fold in the edits.
- **Get the owner's approval, then file it.** Label `status:in-progress` when you start.

### 3. Design gate — UI work only
- A screen may not be built without an **approved mockup**. Only a mockup linked by the current PRD +
  approved issue is a design contract.
- Mockup-first: build it as an **Artifact**, show the owner, iterate until they approve. Use
  `/ui-ux-pro-max` for design intelligence and the central tokens (`apps/web/app/styles/tokens.css`).
- Reuse what exists (shadcn primitives, `provider-brand-icon`, the landed leaf template) before
  inventing.

### 4. Isolate
- **`EnterWorktree` before creating/editing/deleting any file.** Never edit the main checkout —
  parallel sessions share it.

### 5. Brief + delegate
- The host writes a **precise, seam-grounded brief**: exact files, exact data seams (file:line), the
  settled decisions, honest-state requirements, non-goals, and the validation commands.
- Codex writes substantial/crucial code (`gpt-5.6-sol`, `high` for crucial). Read
  `~/.claude/skills/model-flow` for routing.
- **Every brief must forbid landing:** *"commit on the current worktree branch only — do NOT merge,
  push, rebase, or touch `development`."* (This is not theoretical; see Hard rules.)

### 6. Host gates — verify yourself, never trust the claim
- Re-run **typecheck, tests, lint, build** yourself. A writer's "passed" is a claim, not proof.
- Check **scope** (`git diff --name-only`) — anything outside the brief's owned paths is a finding.
- **Read the full diff** and vouch for every hunk.
- **Verify the guardrail:** `git -C <main-checkout> log -1 development` — it must not have moved.

### 7. Review gate
- **DeepSeek review is required** (`ocask`, `deepseek-v4-pro`). Security-focused for anything touching
  auth/capability/secrets; consolidated review otherwise.
- Must come back **APPROVED**. Verify its findings against the code — its verdicts are unreliable in
  both directions.

### 8. Real-stack verification — the one that catches what tests don't
- **Rebuild the image** and drive the live stack like a human: real login at
  `http://web.opzava.localhost:18088`, real seeded data.
  `COMPOSE_PROJECT_NAME=opzava docker compose --env-file <main-checkout>/.env up -d --no-deps --build web`
- Prove the **exact behaviour that changed**, capture **screenshots**, and **regression-check the
  neighbours** (the pages you didn't intend to touch).
- **Check the logs** for errors (`docker logs` on web + broker + worker + gateway). A green page with a
  500 in the logs is not done.
- **Promote the drive** into `tests/e2e/drives/` so the next person inherits it.

### 9. Land
- Commit on the worktree branch → `git push origin HEAD:slice/<name>` → open a **PR referencing the
  issue** (`Closes #N`) with the evidence in the body.
- Wait for **CI green**, then merge (`--rebase --delete-branch`), sync `development`, confirm the issue
  auto-closed.

### 10. Close out
- `ExitWorktree` (remove) and run the **clean audit**: one worktree, clean tree, local == origin, zero
  unpushed, issues closed, no stale branches.
- Record what was learned in memory. File follow-ups as their **own issues** — never leave them only in
  chat.

---

## Hard rules (do not negotiate these)

1. **No code without an approved issue.** Docs and specs are authority, not a brief.
2. **No screen without an approved mockup.**
3. **Never edit the main checkout.** Worktree always.
4. **Writers never land.** Only the host merges, and only after CI is green. *(A writer once
   fast-forwarded `development` unprompted — always re-check after a run that commits.)*
5. **Never fabricate state.** `unknown`, `stale`, `unavailable`, and `not-configured` must never be
   rendered as healthy, connected, or zero. An absent catalog is "unknown", not "0".
6. **Never display a secret.** Tokens, keys, raw provider/Gateway DTOs, prompts, and transcripts do not
   cross into a browser contract. Only credential *type* and health.
7. **Never present an inference as a finding.** Back every claim with a probe, a file:line, or
   authoritative docs — otherwise label it an open question.
8. **Diagnose differentially.** Find a working control, change one variable, run the cheapest probe
   before theorising. Runtime probe > doc inference > guess.
9. **Report faithfully.** If a test failed, a step was skipped, or a check was a false negative, say so
   with the output.

---

## The checklist (copy into the issue)

```
- [ ] 0  Work found via the queue (status:in-progress → status:ready → delivery graph)
- [ ] 1  Oriented: CLAUDE.md + approved issue + named skills read
- [ ] 2  Readiness: issue exists, consensus-reviewed, owner-approved, status:in-progress
- [ ] 3  Design: mockup approved (UI only)
- [ ] 4  Worktree entered
- [ ] 5  Brief written (seams, non-goals, validation, no-merge clause)
- [ ] 6  Host gates: typecheck/test/lint/build re-run BY ME; scope clean; diff read; development untouched
- [ ] 7  DeepSeek review APPROVED (findings verified)
- [ ] 8  Real stack: rebuilt, driven with real login, screenshots, neighbours regression-checked, logs clean, drive promoted to tests/e2e/drives/
- [ ] 9  PR opened (Closes #N), CI green, merged, development synced, issue closed
- [ ] 10 Worktree removed, clean audit passed, memory updated, follow-ups filed as issues
```

---

## Sizing

Not everything needs the full ceremony — but **gates 1, 2, 4, 6, 9, 10 are always required**.

| Work | Design gate (3) | Delegate (5) | DeepSeek (7) | Real stack (8) |
|---|---|---|---|---|
| New screen / UI leaf | **required** | Codex | required | required + screenshots |
| Feature, 2+ files, ~15+ lines | n/a | Codex | required | required |
| Auth / secrets / money / migration / concurrency | n/a | Codex (`high`) | **security-focused, required** | required |
| Docs only | n/a | host | optional | n/a |
| One-line typo / comment | n/a | host | no | proportionate |

---

## Worked example

The Admin Control Center Wave-2 leaves are the reference implementation of this workflow:
delivery-graph doc → authored + consensus-reviewed issue → owner-approved Artifact mockup → worktree →
Codex brief → host gates → DeepSeek APPROVED → rebuilt stack + real-login drive + screenshots +
regression check → PR → CI → merge → clean audit. See #266 (Health), #269 (Gateway), #271 (Models &
Providers) and their PRs for what "done" looks like.
