# Issue tracker: GitHub interim → Dev Board target

**Current as-built/interim:** engineering issues and PRDs for this repo live in GitHub Issues and
use the `gh` CLI. Continue using this path until the Dev Board migration explicitly cuts the
tracker over.

**Target:** Opzava Dev Board is the primary workflow and its DevTicket aggregate owns contracts,
lanes/gates, dependencies, Sprints, assignments, approvals, execution, review, and conflicts. Each
accepted DevTicket has a durable synchronized GitHub Issue mirror. GitHub remains authoritative for
its native issue number/URL and PR/commit/check/merge facts; GitHub edits request synchronized
changes but cannot bypass Opzava workflow gates. See PRD-019, ADR-017, and
`docs/plan/dev-board-migration-manifest.md`.

The old Q17 implementation issues #147–#157 are quarantined: add `superseded`, remove
`ready-for-agent`, and link the Dev Board migration. Do not claim, rewrite, or close them as
completed work. Replacement tickets require explicit human approval and reciprocal old↔new
mappings.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Until the Dev Board cutover, create a GitHub issue. After cutover, create an Opzava DevTicket; the
GitHub Issue mirror is created by synchronization, not as an independent second ticket. Never
publish a #147–#157 replacement without the required human approval.

## When a skill says "fetch the relevant ticket"

Until cutover, run `gh issue view <number> --comments`. After cutover, read the DevTicket through
Dev Board and use its GitHub mirror for native GitHub facts/history.

## Superseded work

`superseded` means the issue's plan or contract has been replaced; it does not mean the historical
record was erroneous or the work was completed. When applying it:

1. Remove executable readiness labels such as `ready-for-agent` or `ready-for-human`.
2. Comment with the superseding PRD/ADR/manifest and, once approved, the exact replacement issue(s).
3. Preserve the old body and comments as history; do not silently rewrite them into the new design.
4. Close only when the migration manifest authorizes closure and the reciprocal mapping is present.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
