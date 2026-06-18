import { runContentWorkflowWithRecording, type ContentWorkflowRecordingDeps } from './content-workflow-recording-executor'
import { type ContentWorkflowRunResult } from './content-workflow-executor'
import { recordContentWorkflowArtifacts } from './record-workflow-artifacts'
import { type ArtifactRepository } from '../artifacts/artifact-repository'

export type RunAndRecordContentWorkflowDeps = ContentWorkflowRecordingDeps &
  Readonly<{ repository: ArtifactRepository }>

export type RunAndRecordContentWorkflowResult = Readonly<{
  result: ContentWorkflowRunResult
  recordedArtifactIds: readonly string[]
}>

export async function runAndRecordContentWorkflow(
  deps: RunAndRecordContentWorkflowDeps,
  rawIdea: unknown,
): Promise<RunAndRecordContentWorkflowResult> {
  const result = await runContentWorkflowWithRecording(deps, rawIdea)
  deps.repository.ensureSchema()
  const ideaId = (result.ideaIntake as { ideaId: string }).ideaId
  const workflowRunId = `content-workflow:${ideaId}`
  const createdAt = deps.now()
  const recordedArtifactIds = recordContentWorkflowArtifacts(
    result,
    (artifact, ctx) => deps.repository.saveArtifact(artifact, ctx),
    { workflowRunId, createdAt },
  )
  return Object.freeze({ result, recordedArtifactIds })
}
