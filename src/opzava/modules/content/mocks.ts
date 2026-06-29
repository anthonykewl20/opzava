// Mock surface for the content module — the Mock providers used to run the content
// workflow without real providers (draft-only: the mock human-approval gate and mock
// WordPress provider never perform a real publish). Kept OUT of the public barrel
// (./index) so the module's public interface advertises only production capabilities.
//
// Consumers: the ops/runs dev endpoint (mock workflow runs) + tests. Import from
// '@/opzava/modules/content/mocks'.

export { createMockContentWorkflowProviderAdapters } from './workflow/content-workflow-recording-executor'
export { createMockAntiSlopReviewProvider } from './steps/anti-slop-review-provider'
export { createMockBrandReviewProvider } from './steps/brand-review-provider'
export { createMockHumanApprovalProvider } from './steps/human-approval-provider'
export { createMockOutlineProvider } from './steps/outline-provider'
export { createMockSeoBriefProvider } from './steps/seo-brief-provider'
export { createMockWordpressDraftProvider } from './steps/wordpress-draft-provider'
