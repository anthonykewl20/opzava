# 0134: Department Pipeline View

## Problem
The Team Dashboard grouped agents by department but gave no visibility into *how work flows* through each group. Stakeholders couldn't see step ordering, hand-off points, or which steps lacked an owner — all critical for spotting bottlenecks.

## Approach
A `DepartmentPipeline` subcomponent renders inside each existing `DepartmentSection`. It consumes the `pipelines` field now returned by the `/api/team/agents` route (already admin-gated). Each pipeline is an ordered list of step chips:

- **Step chip** — displays `stepId` and owning agent name.
- **Unassigned steps** — rendered dimmed to flag gaps.
- **Connection lines** — simple CSS border connectors between chips.

No new dependencies. State is threaded from the top-level fetch down through props; the subcomponent is purely presentational.

## Contract
| Field | Type | Source |
|---|---|---|
| `pipelines` | `Record<deptId, PipelineStep[]>` | `/api/team/agents` response |
| `PipelineStep.stepId` | `string` | server |
| `PipelineStep.agentName` | `string \| null` | `null` → unassigned |

The component accepts `steps: PipelineStep[]` and renders nothing when the array is empty.

## Validation
- TypeScript strict — zero errors.
- ESLint — zero warnings/errors.
- Production build compiles cleanly.
- Check-plan assertion: `expect(screen.getByTestId('dept-pipeline')).toBeTruthy()` confirms the panel renders a `DepartmentPipeline` for a department with steps.
- All read-only; no mutations triggered.

## Security & Audit
No secret values, private credentials, tokens are shown by the pipeline view — only public step ids and the owning agent names from an admin-gated read route. It visualizes the department's flow; it grants no authority and the system still owns every gate.

## Next Case Study Thread
**0135: Complexity Guardrails & R&D Queue** — introduce optional ESLint complexity rules (Layer 10) to cap cyclomatic complexity per file, and wire the Layer-13 R&D queue with a scout-first policy so new experimental slices enter through a triage step before hitting the main pipeline.
