# 0097: Architecture Entropy Guard

## Problem

Opzava's layered architecture (`platform/` below, `modules/content/` above) is only as reliable as the discipline that keeps it layered. As the codebase grows toward ~105 source files, manual review cannot catch import cycles or upward dependencies before they entangle the system. Structural decay — a platform module importing a workflow, a cycle forming between contracts and steps — erodes the boundaries that keep secret resolution, cost accounting, and provider abstraction isolated from UI and campaign logic. We need an automated, dependency-free guard that fails CI the moment those invariants break.

## Approach

A single vitest test file walks every non-test `.ts` under `src/opzava`, extracts static (`import … from`) and dynamic (`import()`) specifiers via regex, resolves `@/` aliases and relative paths to in-tree files, and builds a directed module graph (~105 nodes, ~421 edges). Three DFS-based assertions run against that graph. No external tools — only `node:fs`, `node:path`, and vitest.

## Contract

| # | Invariant | Failure message |
|---|-----------|-----------------|
| 1 | **No import cycles** — DFS with on-stack detection; shared diamond dependencies do not false-positive. | Prints the offending cycle path. |
| 2 | **Platform never imports modules/content** — lower layers must not depend on higher ones. | Lists every violating edge. |
| 3 | **Content contracts imports no sibling content layers** (`workflow`, `campaign`, `steps`, `providers`) — contracts stays a leaf. | Lists every violating edge. |

Each test collects violations into an array and asserts `toEqual([])`.

## Validation

Three vitest cases exercise the full graph:

1. **Cycle freedom** — traverses all ~421 edges; any back-edge detected on the recursion stack is a failure.
2. **Upward dependency** — filters edges where source matches `platform/` and target matches `modules/content/`.
3. **Contracts isolation** — filters edges where source matches `content/contracts/` and target matches any sibling content layer.

The suite re-runs on every CI push. A future commit that introduces a cycle or an upward dependency fails immediately with the offending file path, giving the author a precise, actionable signal.

## Security & Audit

No secret values, private credentials, tokens are read by this guard — it inspects only import specifiers and file paths. Keeping layers acyclic and one-directional is itself a security property: it preserves the boundaries that keep secret resolution in the provider/admin layers and out of contracts, UI, and workflow code. The guard is deterministic, auditable, and produces no side effects beyond a pass/fail exit code.

## Next Case Study Thread

Extend the guard with **cognitive-complexity and max-depth ESLint rules** wired into the same vitest suite, catching not just structural decay but rising incidental complexity. Pair this with **Layer-9 operator panels** — content run status, approval queue, failure/dead-letter inspection, and cost breakdowns — so humans can observe what the architecture protects. Finally, split the oversized legacy UI files into cohesive modules before they become the next entropy hotspot.
