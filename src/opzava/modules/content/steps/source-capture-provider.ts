import type { IdeaIntake } from '../contracts/idea-intake'
import type { CapturedSource } from '../contracts/source-capture'

export type SourceCaptureDraft = Readonly<{
  sources: readonly CapturedSource[]
}>

export type SourceCaptureProvider = (idea: IdeaIntake) => SourceCaptureDraft

export function createMockSourceCaptureProvider(): SourceCaptureProvider {
  return (idea: IdeaIntake): SourceCaptureDraft => {
    const sources: readonly CapturedSource[] = Object.freeze([
      Object.freeze({
        sourceId: `src_${idea.ideaId}_1`,
        origin: `https://example.test/${idea.topic}`,
        capturedAt: '2026-06-17T00:00:00.000Z',
        extractionSummary: `Overview of ${idea.topic}`,
      }),
      Object.freeze({
        sourceId: `src_${idea.ideaId}_2`,
        origin: `https://example.test/${idea.topic}/deep`,
        capturedAt: '2026-06-17T00:00:00.000Z',
        extractionSummary: `Detailed analysis of ${idea.topic}`,
      }),
    ])
    return Object.freeze({ sources })
  }
}
