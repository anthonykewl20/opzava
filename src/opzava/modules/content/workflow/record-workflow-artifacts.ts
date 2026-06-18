import { type Artifact } from '@/opzava/core/artifacts/contracts'
import { type ContentWorkflowRunResult } from './content-workflow-executor'

export type ArtifactRecordContext = Readonly<{ workflowRunId: string; createdAt: string }>

export type ContentArtifactSink = (artifact: Artifact, context: ArtifactRecordContext) => void

export const CONTENT_WORKFLOW_ARTIFACT_FIELDS = [
  'keywordResearch',
  'sourceCapture',
  'seoBrief',
  'outline',
  'articleDraft',
  'factCheckReport',
  'brandReview',
  'antiSlopReview',
] as const

export function recordContentWorkflowArtifacts(
  result: ContentWorkflowRunResult,
  sink: ContentArtifactSink,
  context: ArtifactRecordContext,
): readonly string[] {
  const recorded: string[] = []
  for (const field of CONTENT_WORKFLOW_ARTIFACT_FIELDS) {
    const artifact = (result as Record<string, unknown>)[field] as Artifact | undefined
    if (artifact && typeof artifact === 'object' && typeof (artifact as Artifact).artifactId === 'string') {
      sink(artifact, context)
      recorded.push(artifact.artifactId)
    }
  }
  return recorded
}
