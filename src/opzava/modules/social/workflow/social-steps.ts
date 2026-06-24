/**
 * Canonical social workflow step ids — the declared contract that
 * `test/stepid-coupling.test.mjs` asserts team SOCIAL_PIPELINE_ORDER against. social has no
 * workflow-definition file (unlike content), so this declaration IS the single source of truth for
 * its step surface. See the social MODULE.md.
 *
 * social-approval is an approval gate (it emits an artifact-targeted approval), not a linear
 * pipeline step, so it is declared here but is not in SOCIAL_PIPELINE_ORDER.
 */
export const SOCIAL_STEP_IDS = [
  'social-brief',
  'social-post-draft',
  'social-review',
  'social-approval',
  'social-schedule-request',
] as const
