/**
 * RunContext — the inter-step data flow of a WorkflowRun (CONTEXT.md). A Map<stepId,
 * Map<varName, Segment>> + a `{{#stepId.varName#}}` template resolver + reserved scopes
 * (`sys`, `env`). StepRuns read prior outputs + write their own. Pure `core/`.
 *
 * Replaces the ad-hoc context-passing in `reconcileDeferredTaskCompletions` — each Step
 * declares what it reads (via templates) and writes (via outputs), and the per-key merge is
 * implicit (latest-wins per stepId+varName).
 */

export type Segment = unknown

const TEMPLATE_RE = /\{\{#([a-zA-Z0-9_.\-]+)\.([a-zA-Z0-9_.\-]+)#\}\}/g

export class RunContext {
  private readonly store = new Map<string, Map<string, Segment>>()
  private readonly envScope: Record<string, string>
  private readonly sysScope: Record<string, unknown>

  constructor(opts: { env?: Record<string, string>; sys?: Record<string, unknown> } = {}) {
    this.envScope = opts.env ?? {}
    this.sysScope = opts.sys ?? {}
  }

  /** Write a step's output variable (latest-wins per stepId+varName). */
  set(stepId: string, varName: string, value: Segment): void {
    let stepMap = this.store.get(stepId)
    if (!stepMap) {
      stepMap = new Map()
      this.store.set(stepId, stepMap)
    }
    stepMap.set(varName, value)
  }

  /** Read a step's output variable (or undefined). */
  get(stepId: string, varName: string): Segment | undefined {
    return this.store.get(stepId)?.get(varName)
  }

  /** Read all outputs of a step. */
  getStep(stepId: string): Record<string, Segment> {
    return Object.fromEntries(this.store.get(stepId) ?? [])
  }

  /** Resolve a [scope, name] selector: `sys`/`env` reserved scopes, else a step output. */
  resolve(scope: string, name: string): Segment | undefined {
    if (scope === 'sys') return this.sysScope[name]
    if (scope === 'env') return this.envScope[name]
    return this.get(scope, name)
  }

  /** Resolve all `{{#scope.name#}}` templates in a string against the context. */
  resolveTemplate(text: string): string {
    return text.replace(TEMPLATE_RE, (_match, scope: string, name: string) => {
      const val = this.resolve(scope, name)
      return val === undefined || val === null ? '' : String(val)
    })
  }
}
