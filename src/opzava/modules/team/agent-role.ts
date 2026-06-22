import { z } from 'zod';

export const AGENT_ROLE_SCHEMA_VERSION = 1 as const;

export const AGENT_STATUSES = ['active', 'planned', 'paused'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const agentRoleSchema = z
  .object({
    schemaVersion: z.literal(AGENT_ROLE_SCHEMA_VERSION),
    agentId: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(120),
    department: z.string().min(1).max(120),
    status: z.enum(AGENT_STATUSES),
    ownedStepIds: z.array(z.string().min(1).max(120)),
    responsibilities: z.string().min(1).max(500),
  })
  .strict()
  .superRefine((role, ctx) => {
    if (role.status === 'active' && role.ownedStepIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ownedStepIds'],
        message: 'active agents must own at least one workflow step',
      });
    }
    const seen = new Set<string>();
    role.ownedStepIds.forEach((id, i) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ownedStepIds', i],
          message: 'owned step ids must be unique',
        });
      }
      seen.add(id);
    });
  });

export type AgentRole = Readonly<z.infer<typeof agentRoleSchema>>;

export function parseAgentRole(input: unknown): AgentRole {
  return Object.freeze(agentRoleSchema.parse(input));
}

const SEED: ReadonlyArray<unknown> = [
  {
    schemaVersion: 1,
    agentId: 'content-strategist',
    name: 'Content Strategist',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['idea-intake'],
    responsibilities: 'Captures and frames content ideas into briefs the team can act on.',
  },
  {
    schemaVersion: 1,
    agentId: 'seo-specialist',
    name: 'SEO Specialist',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['keyword-research', 'seo-brief'],
    responsibilities: 'Researches keywords and produces the SEO brief that guides the draft.',
  },
  {
    schemaVersion: 1,
    agentId: 'researcher',
    name: 'Researcher',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['source-capture'],
    responsibilities: 'Gathers and verifies sources the article will cite.',
  },
  {
    schemaVersion: 1,
    agentId: 'copywriter',
    name: 'Copywriter',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['outline', 'article-draft'],
    responsibilities: 'Outlines and writes the article draft from the brief and sources.',
  },
  {
    schemaVersion: 1,
    agentId: 'fact-checker',
    name: 'Fact-Checker',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['fact-check'],
    responsibilities: 'Verifies every claim in the draft is supported by a cited source.',
  },
  {
    schemaVersion: 1,
    agentId: 'brand-editor',
    name: 'Brand Editor',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['brand-review', 'anti-slop-review'],
    responsibilities: 'Enforces brand voice and screens out low-quality AI slop.',
  },
  {
    schemaVersion: 1,
    agentId: 'managing-editor',
    name: 'Managing Editor',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['human-approval'],
    responsibilities: 'Holds the human approval gate before anything leaves the building.',
  },
  {
    schemaVersion: 1,
    agentId: 'publisher',
    name: 'Publisher',
    department: 'Content Marketing',
    status: 'active',
    ownedStepIds: ['wordpress-draft'],
    responsibilities: 'Creates the WordPress draft (draft-only; never auto-publishes).',
  },
  {
    schemaVersion: 1,
    agentId: 'email-specialist',
    name: 'Email Specialist',
    department: 'Email Marketing',
    status: 'active',
    ownedStepIds: ['campaign-send'],
    responsibilities: 'Runs approved email campaigns through the Resend sender, exactly once.',
  },
  {
    schemaVersion: 1,
    agentId: 'social-media-manager',
    name: 'Social Media Manager',
    department: 'Social Media',
    status: 'active',
    ownedStepIds: ['social-brief', 'social-post-draft', 'social-schedule-request'],
    responsibilities:
      'Briefs, drafts, and schedules social posts; owns the publishing pipeline (draft/scheduled only).',
  },
  {
    schemaVersion: 1,
    agentId: 'social-reviewer',
    name: 'Social Reviewer',
    department: 'Social Media',
    status: 'active',
    ownedStepIds: ['social-review'],
    responsibilities:
      'Reviews social drafts for brand voice and quality before they go to approval.',
  },
  {
    schemaVersion: 1,
    agentId: 'general-va',
    name: 'General VA',
    department: 'General VA',
    status: 'active',
    ownedStepIds: ['va-task-intake', 'va-task-draft', 'va-task-review'],
    responsibilities: 'Handles cross-cutting admin and ad-hoc tasks: intakes a request, drafts a plan, and reviews its own work.',
  },
];

export const DEFAULT_AGENT_ROLES: readonly AgentRole[] = SEED.map((raw) => parseAgentRole(raw));

export function groupAgentRolesByDepartment(
  roles: readonly AgentRole[],
): Record<string, AgentRole[]> {
  const grouped: Record<string, AgentRole[]> = {};
  for (const role of roles) {
    const list = grouped[role.department];
    if (list) {
      list.push(role);
    } else {
      grouped[role.department] = [role];
    }
  }
  return grouped;
}
