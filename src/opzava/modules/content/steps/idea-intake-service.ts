import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import { getContentStepOutput } from '../workflow/content-step-outputs'
import type { ContentStepService } from './step-service'

export const ideaIntakeStepService: ContentStepService<unknown, IdeaIntake> = Object.freeze({
  stepId: 'idea-intake',
  run: (input) => Object.freeze({
    stepId: 'idea-intake',
    output: getContentStepOutput('idea-intake'),
    record: parseIdeaIntake(input)
  })
})
