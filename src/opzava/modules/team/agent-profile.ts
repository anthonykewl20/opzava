import { z } from 'zod';
import { DEFAULT_AGENT_ROLES } from './agent-role';

export const AGENT_PROFILE_SCHEMA_VERSION = 1 as const;

export const AGENT_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export const agentProfileSchema = z
  .object({
    schemaVersion: z.literal(AGENT_PROFILE_SCHEMA_VERSION),
    agentId: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(120),
    avatarEmoji: z.string().min(1).max(8),
    charter: z.string().min(1).max(280),
    preferredModel: z.enum(AGENT_MODELS),
  })
  .strict();

export type AgentProfile = Readonly<z.infer<typeof agentProfileSchema>>;

export function parseAgentProfile(input: unknown): AgentProfile {
  return Object.freeze(agentProfileSchema.parse(input)) as AgentProfile;
}

const RAW_DEFAULT_AGENT_PROFILES: ReadonlyArray<{
  agentId: string;
  displayName: string;
  avatarEmoji: string;
  charter: string;
  preferredModel: AgentModel;
}> = [
  {
    agentId: 'content-strategist',
    displayName: 'Ivy Brooks',
    avatarEmoji: '📝',
    charter: 'Frames raw ideas into briefs the content team can run with.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'seo-specialist',
    displayName: 'Marcus Reed',
    avatarEmoji: '🔍',
    charter: 'Finds the keywords and shapes the SEO brief that guides every draft.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'researcher',
    displayName: 'Priya Nair',
    avatarEmoji: '📚',
    charter: 'Gathers and verifies the sources our articles cite.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'copywriter',
    displayName: 'Leo Hart',
    avatarEmoji: '✍️',
    charter: 'Outlines and writes article drafts grounded in the brief and sources.',
    preferredModel: 'opus',
  },
  {
    agentId: 'fact-checker',
    displayName: 'Dana Cole',
    avatarEmoji: '✅',
    charter: 'Verifies every claim is supported by a cited source before it ships.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'brand-editor',
    displayName: 'Nora Vance',
    avatarEmoji: '🎨',
    charter: 'Guards brand voice and screens out low-quality AI slop.',
    preferredModel: 'opus',
  },
  {
    agentId: 'managing-editor',
    displayName: 'Sam Okafor',
    avatarEmoji: '🗂️',
    charter: 'Holds the human approval gate before anything leaves the building.',
    preferredModel: 'opus',
  },
  {
    agentId: 'publisher',
    displayName: 'Quinn Ellis',
    avatarEmoji: '🚀',
    charter: 'Creates the WordPress draft — draft only, never auto-publishes.',
    preferredModel: 'haiku',
  },
  {
    agentId: 'email-specialist',
    displayName: 'Ada Moreno',
    avatarEmoji: '✉️',
    charter: 'Runs approved email campaigns through Resend, exactly once.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'social-media-manager',
    displayName: 'Rhea Kapoor',
    avatarEmoji: '📣',
    charter: 'Briefs, drafts, and schedules social posts (draft/scheduled only).',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'social-reviewer',
    displayName: 'Theo Lang',
    avatarEmoji: '👀',
    charter: 'Reviews social drafts for brand voice and quality before approval.',
    preferredModel: 'sonnet',
  },
  {
    agentId: 'general-va',
    displayName: 'Robin Diaz',
    avatarEmoji: '🧰',
    charter: 'Handles cross-cutting admin and ad-hoc tasks across departments.',
    preferredModel: 'haiku',
  },
];

export const DEFAULT_AGENT_PROFILES: ReadonlyArray<AgentProfile> =
  RAW_DEFAULT_AGENT_PROFILES.map((raw) =>
    parseAgentProfile({
      schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
      ...raw,
    }),
  );

// Touch DEFAULT_AGENT_ROLES to keep an explicit import-time contract: every
// default role's agentId must be covered by a default profile.
const _coveredAgentIds: ReadonlySet<string> = new Set(
  DEFAULT_AGENT_ROLES.map((r) => r.agentId),
);
for (const profile of DEFAULT_AGENT_PROFILES) {
  if (!_coveredAgentIds.has(profile.agentId)) {
    throw new Error(
      `DEFAULT_AGENT_PROFILES contains unknown agentId: ${profile.agentId}`,
    );
  }
}

export function getAgentProfile(agentId: string): AgentProfile | null {
  return DEFAULT_AGENT_PROFILES.find((p) => p.agentId === agentId) ?? null;
}
