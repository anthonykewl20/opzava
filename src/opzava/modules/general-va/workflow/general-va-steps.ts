/**
 * Canonical general-VA workflow step ids — the declared contract that
 * `test/stepid-coupling.test.mjs` asserts team GENERAL_VA_PIPELINE_ORDER against. general-va has no
 * workflow-definition file (unlike content), so this declaration IS the single source of truth for
 * its step surface. See the general-va MODULE.md.
 *
 * va-approval is an approval gate (it emits an artifact-targeted approval), not a linear pipeline
 * step, so it is declared here but is not in GENERAL_VA_PIPELINE_ORDER. va-task-intake is a
 * manual-input entry step (no step service).
 */
export const GENERAL_VA_STEP_IDS = [
  'va-task-intake',
  'va-task-draft',
  'va-task-review',
  'va-approval',
] as const
