# Triage Labels (GitHub interim)

The skills speak in terms of five canonical triage roles. Until Dev Board ships, this file maps
those roles to transitional GitHub labels. They are tracker interoperability labels, not the target
Dev Board workflow state machine.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Transitional GitHub readiness; remove from superseded/quarantined issues |
| `ready-for-human`          | `ready-for-human`    | Transitional GitHub readiness; remove from superseded/quarantined issues |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table only during the interim GitHub-first period.

## Dev Board managed-label target

The GitHub App mirrors structured DevTicket metadata using namespaced labels:

- `priority:p0` through `priority:p3`
- `type:feature`, `type:bug`, `type:improvement`, `type:technical-task`, `type:research-spike`,
  `type:maintenance`
- `risk:low`, `risk:medium`, `risk:high`, `risk:critical`
- `severity:s0` through `severity:s3` when applicable
- `area:<work-area>` (zero or more)
- `status:<managed-state>` (exactly one)

The namespace is mandatory. Existing bare `P0` through `P4` labels denote historical build/phase
tiers and MUST NOT be reused for Dev Board priority. The GitHub App manages only its namespaced
labels and does not delete or reinterpret repository labels it does not own.

## Superseded label

`superseded` quarantines an obsolete issue contract while preserving its history. Applying it
requires removing `ready-for-agent`/`ready-for-human` and adding a comment that links the current
PRD/ADR/migration manifest plus the approved replacement mapping when one exists. It is distinct
from `wontfix`, `closed as completed`, and a Dev Board `status:` label.
