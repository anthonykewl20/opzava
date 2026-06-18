// Binds each content workflow step to the record/artifact/approval/external-action it emits;
// lets the runner verify a step produced its declared output type.
import type { ContentArtifactType } from '../artifacts/content-artifact'
import { getContentWorkflowDefinition } from './content-workflow'

export type ContentStepOutput =
  | Readonly<{ kind: 'intake-record'; recordType: 'idea-intake' }>
  | Readonly<{ kind: 'artifact'; artifactType: ContentArtifactType }>
  | Readonly<{ kind: 'approval' }>
  | Readonly<{ kind: 'external-action'; requestType: 'wordpress-draft-request' }>

export const CONTENT_STEP_OUTPUTS: Readonly<Record<string, ContentStepOutput>> = Object.freeze({
  'idea-intake': { kind: 'intake-record', recordType: 'idea-intake' },
  'keyword-research': { kind: 'artifact', artifactType: 'keyword-research' },
  'source-capture': { kind: 'artifact', artifactType: 'source-capture' },
  'seo-brief': { kind: 'artifact', artifactType: 'seo-brief' },
  'outline': { kind: 'artifact', artifactType: 'outline' },
  'article-draft': { kind: 'artifact', artifactType: 'article-draft' },
  'fact-check': { kind: 'artifact', artifactType: 'fact-check-report' },
  'brand-review': { kind: 'artifact', artifactType: 'brand-review' },
  'anti-slop-review': { kind: 'artifact', artifactType: 'anti-slop-review' },
  'human-approval': { kind: 'approval' },
  'wordpress-draft': { kind: 'external-action', requestType: 'wordpress-draft-request' },
})

export function getContentStepOutput(stepId: string): ContentStepOutput {
  const output = CONTENT_STEP_OUTPUTS[stepId]
  if (output === undefined) throw new Error(`no declared output for content step: ${stepId}`)
  return output
}
