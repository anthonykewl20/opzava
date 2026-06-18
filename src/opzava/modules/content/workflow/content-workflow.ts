// The content workflow graph. The approval-gate (human-approval) structurally
// precedes the external-action (wordpress-draft): in this step graph you cannot
// reach the WordPress draft request without passing through human approval.
// Validated by parseWorkflowDefinition (acyclic, all edges resolve, unique ids).
import {
  WORKFLOW_CONTRACT_SCHEMA_VERSION,
  parseWorkflowDefinition,
  type WorkflowDefinition,
} from '../../../core/workflows/contracts'

export const CONTENT_WORKFLOW_ID = 'content-workflow'

const definition = {
  schemaVersion: WORKFLOW_CONTRACT_SCHEMA_VERSION,
  workflowId: CONTENT_WORKFLOW_ID,
  version: 1,
  displayName: 'Content Workflow',
  entryStepId: 'idea-intake',
  allowedInputArtifactTypes: ['idea-intake'],
  steps: [
    { stepId: 'idea-intake', displayName: 'Idea Intake', kind: 'manual-input', nextStepIds: ['keyword-research'] },
    { stepId: 'keyword-research', displayName: 'Keyword Research', kind: 'provider-call', nextStepIds: ['source-capture'] },
    { stepId: 'source-capture', displayName: 'Source Capture', kind: 'provider-call', nextStepIds: ['seo-brief'] },
    { stepId: 'seo-brief', displayName: 'SEO Brief', kind: 'artifact-transform', nextStepIds: ['outline'] },
    { stepId: 'outline', displayName: 'Outline', kind: 'artifact-transform', nextStepIds: ['article-draft'] },
    { stepId: 'article-draft', displayName: 'Article Draft', kind: 'provider-call', nextStepIds: ['fact-check'] },
    { stepId: 'fact-check', displayName: 'Fact Check', kind: 'provider-call', nextStepIds: ['brand-review'] },
    { stepId: 'brand-review', displayName: 'Brand Review', kind: 'artifact-transform', nextStepIds: ['anti-slop-review'] },
    { stepId: 'anti-slop-review', displayName: 'Anti-Slop Review', kind: 'artifact-transform', nextStepIds: ['human-approval'] },
    { stepId: 'human-approval', displayName: 'Human Approval', kind: 'approval-gate', nextStepIds: ['wordpress-draft'] },
    { stepId: 'wordpress-draft', displayName: 'WordPress Draft', kind: 'external-action', nextStepIds: [] },
  ],
}

export function getContentWorkflowDefinition(): WorkflowDefinition {
  return parseWorkflowDefinition(definition)
}
