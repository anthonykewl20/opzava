import { type AgentRole } from './agent-role';

export const CONTENT_PIPELINE_ORDER = [
  'idea-intake',
  'keyword-research',
  'source-capture',
  'seo-brief',
  'outline',
  'article-draft',
  'fact-check',
  'brand-review',
  'anti-slop-review',
  'human-approval',
  'wordpress-draft',
] as const;

export const EMAIL_PIPELINE_ORDER = ['campaign-send'] as const;

export const SOCIAL_PIPELINE_ORDER = ['social-brief', 'social-post-draft', 'social-review', 'social-schedule-request'] as const;

export const GENERAL_VA_PIPELINE_ORDER = ['va-task-intake', 'va-task-draft', 'va-task-review'] as const;

export const DEPARTMENT_PIPELINE_ORDER: Readonly<Record<string, readonly string[]>> = {
  'Content Marketing': CONTENT_PIPELINE_ORDER,
  'Email Marketing': EMAIL_PIPELINE_ORDER,
  'Social Media': SOCIAL_PIPELINE_ORDER,
  'General VA': GENERAL_VA_PIPELINE_ORDER,
};

export type PipelineStep = Readonly<{
  stepId: string;
  agentId: string | null;
  agentName: string | null;
}>;

export function buildDepartmentPipeline(
  roles: readonly AgentRole[],
  department: string,
): PipelineStep[] {
  const order = DEPARTMENT_PIPELINE_ORDER[department] ?? [];

  const ownerByStep = new Map<string, AgentRole>();
  for (const role of roles) {
    if (role.department !== department) continue;
    for (const stepId of role.ownedStepIds) {
      if (!ownerByStep.has(stepId)) {
        ownerByStep.set(stepId, role);
      }
    }
  }

  return order.map((stepId) => {
    const owner = ownerByStep.get(stepId);
    return {
      stepId,
      agentId: owner ? owner.agentId : null,
      agentName: owner ? owner.name : null,
    };
  });
}
