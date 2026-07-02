import "dotenv/config";

import { assertCurrentUser, db, pool, sql, withTenant } from "@opzava/adapters";
import { FirstOwnerSetupService, type FirstOwnerSetupInput } from "@opzava/identity-access";
import {
  createTask,
  listTasks,
  type TaskApplicationContext,
  type TaskDto,
  type TaskPriority
} from "@opzava/project-management";
import { DomainError, type Result } from "@opzava/shared-kernel";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface RoadmapTaskDefinition {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly labels: readonly string[];
}

interface RoadmapOwnerContext {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly ownerUserId: string;
  readonly ownerRoleKeys: readonly string[];
}

export interface SeedRoadmapTasksReceipt extends RoadmapOwnerContext {
  readonly totalCount: number;
  readonly createdCount: number;
  readonly skippedCount: number;
  readonly createdTitles: readonly string[];
  readonly skippedTitles: readonly string[];
  readonly roadmapTitles: readonly string[];
}

export interface SeedRoadmapTasksLogger {
  log(message: string): void;
}

export interface SeedRoadmapTasksOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: SeedRoadmapTasksLogger | null;
}

const localDevDefaults = {
  ownerEmail: "owner@opzava.localhost",
  ownerPassword: "OpzavaLocalDev!2026",
  ownerName: "Opzava Owner",
  organizationName: "Opzava Internal",
  workspaceName: "Admin",
  timezone: "Asia/Manila"
} as const;

// These defaults are for an ephemeral local-dev bootstrap only. Shared and live
// environments must set SEED_* values, especially SEED_OWNER_PASSWORD.
function readSeedValue(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string
): string {
  const value = env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

const roadmapTasks = [
  {
    title: "Slice 2 - Ask Admin Opzava on Tasks",
    description:
      "Add the first admin assistant loop so Ask Admin Opzava can read, create, and update Tasks through streaming chat.",
    priority: "high",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P1 - AI Workforce",
    description:
      "Turn Ask Opzava into an operable AI workforce with departments, assignments, policy, automation entry points, and run evidence.",
    priority: "high",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P2 - Realtime + PWA",
    description:
      "Make collaboration durable and live, then installable, while keeping push and Redis outside auth and durability boundaries.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P3 - Knowledge",
    description:
      "Give people and AI employees governed project and organization knowledge with derived OpenClaw indexes.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P4 - CRM",
    description:
      "Own customer truth in Opzava while projecting external channel observations through the Gateway ACL.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P5 - Dept-Workflows + Marketing",
    description:
      "Define department work in Opzava while OpenClaw executes standing orders, cron, TaskFlow, sessions, and channels.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P6 - Finance + Billing",
    description:
      "Add money visibility, money-risk approvals, usage metering, plan limits, and dunning behind ports.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P7 - Notifications + Admin + Error Pipeline",
    description:
      "Make operational truth visible and repairable with redaction, one-tenant blast radius, and governed remediation.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "P8 - External Channels + Guest + Polish",
    description:
      "Finish customer-facing and integration edges: channels, guest portal, tool links, and production polish.",
    priority: "normal",
    labels: ["roadmap", "phase"]
  },
  {
    title: "Real OpenClaw operator WS handshake",
    description:
      "Implement connect.challenge nonce signing, device-token pairing, protocol v4, and operator.write/operator.approvals scopes.",
    priority: "high",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Wildcard TLS issuance and DNS lifecycle",
    description:
      "Handle wildcard TLS issuance and renewal plus *.localhost and *.opzava.app DNS/SNI lifecycle.",
    priority: "high",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Readiness and reconnect hardening",
    description:
      "Add readiness/health gating plus reconnect, backoff, and circuit-breaker behavior for sustained load and idle WS death.",
    priority: "high",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Gateway reaper leases and fencing",
    description:
      "Harden reaper concurrency with leases and fencing to avoid double-kill and orphan Gateway containers.",
    priority: "high",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Lazy-start and idle-stop cost model",
    description:
      "Measure lazy-start/idle-stop cold-start latency against idle Gateway cost before choosing the runtime policy.",
    priority: "normal",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Secrets lifecycle for Gateway credentials",
    description:
      "Define lifecycle, rotation, and per-tenant scoping for device tokens, TLS certs, Gateway keys, and related secrets.",
    priority: "high",
    labels: ["roadmap", "de-risk"]
  },
  {
    title: "Dokploy Compose deployer mapping",
    description:
      "Map dynamic Gateway containers onto Dokploy's Compose deployer while attaching to Dokploy's existing Traefik.",
    priority: "normal",
    labels: ["roadmap", "de-risk"]
  }
] as const satisfies readonly RoadmapTaskDefinition[];

function seedError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause })
  });
}

function rowsFromExecuteResult(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as ReadonlyArray<Record<string, unknown>>;
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as ReadonlyArray<Record<string, unknown>>) : [];
}

function unwrapResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function readFirstOwnerSetupInput(env: NodeJS.ProcessEnv): FirstOwnerSetupInput {
  return {
    ownerName: readSeedValue(env, "SEED_OWNER_NAME", localDevDefaults.ownerName),
    ownerEmail: readSeedValue(env, "SEED_OWNER_EMAIL", localDevDefaults.ownerEmail),
    ownerPassword: readSeedValue(env, "SEED_OWNER_PASSWORD", localDevDefaults.ownerPassword),
    organizationName: readSeedValue(env, "SEED_ORG_NAME", localDevDefaults.organizationName),
    workspaceName: readSeedValue(env, "SEED_WORKSPACE_NAME", localDevDefaults.workspaceName),
    timezone: readSeedValue(
      env,
      "SEED_TIMEZONE",
      readSeedValue(env, "TZ", localDevDefaults.timezone)
    )
  };
}

async function ensureFirstOwnerExists(env: NodeJS.ProcessEnv): Promise<void> {
  const setup = await new FirstOwnerSetupService().setup(readFirstOwnerSetupInput(env));

  if (!setup.ok) {
    throw setup.error;
  }
}

async function resolveRoadmapOwnerContext(): Promise<RoadmapOwnerContext> {
  const setupResult = await db.execute(sql`
    select organization_id, owner_user_id
    from public.first_owner_setup
    order by completed_at asc
    limit 1
  `);
  const setupRow = rowsFromExecuteResult(setupResult)[0];

  if (setupRow === undefined) {
    throw seedError(
      "workers.roadmapSeedOwnerMissing",
      "First-owner setup did not produce an owner context."
    );
  }

  const organizationId = String(setupRow["organization_id"]);
  const ownerUserId = String(setupRow["owner_user_id"]);

  return withTenant(organizationId, async (tx) => {
    await tx.execute(sql`select set_config('app.current_user', ${ownerUserId}, true)`);
    await assertCurrentUser(tx, ownerUserId);

    const workspaceResult = await tx.execute(sql`
      select id
      from public.workspaces
      where organization_id = ${organizationId}
      order by
        case when slug = 'admin' then 0 else 1 end,
        created_at asc,
        id asc
      limit 1
    `);
    const workspaceRow = rowsFromExecuteResult(workspaceResult)[0];

    if (workspaceRow === undefined) {
      throw seedError(
        "workers.roadmapSeedWorkspaceMissing",
        "First-owner setup did not produce an admin workspace."
      );
    }

    const roleResult = await tx.execute(sql`
      select coalesce(
        array_agg(rg.role_key order by rg.role_key)
          filter (where rg.role_key is not null),
        array[]::text[]
      ) as role_keys
      from public.memberships m
      left join public.role_grants rg
        on rg.organization_id = m.organization_id
       and rg.subject_type = 'user'
       and rg.subject_id = m.user_id
       and rg.scope_type = 'organization'
       and rg.scope_id = m.organization_id
      where m.organization_id = ${organizationId}
        and m.user_id = ${ownerUserId}
        and m.status = 'active'
      group by m.organization_id, m.user_id
      limit 1
    `);
    const roleRow = rowsFromExecuteResult(roleResult)[0];
    const roleKeys = roleRow?.["role_keys"];
    const ownerRoleKeys = Array.isArray(roleKeys) ? roleKeys.map(String) : [];

    if (ownerRoleKeys.length === 0) {
      throw seedError(
        "workers.roadmapSeedOwnerRolesMissing",
        "First owner does not have any active role grants."
      );
    }

    return {
      organizationId,
      workspaceId: String(workspaceRow["id"]),
      ownerUserId,
      ownerRoleKeys
    };
  });
}

function taskContext(owner: RoadmapOwnerContext): TaskApplicationContext {
  return {
    orgId: owner.organizationId,
    workspaceId: owner.workspaceId,
    actor: {
      userId: owner.ownerUserId,
      roleKeys: owner.ownerRoleKeys
    }
  };
}

async function listExistingRoadmapTasks(owner: RoadmapOwnerContext): Promise<readonly TaskDto[]> {
  return unwrapResult(await listTasks(taskContext(owner)));
}

function roadmapTitleSet(tasks: readonly TaskDto[]): Set<string> {
  return new Set(tasks.map((task) => task.title));
}

export async function seedRoadmapTasks(
  options: SeedRoadmapTasksOptions = {}
): Promise<SeedRoadmapTasksReceipt> {
  const env = options.env ?? process.env;
  const logger = options.logger === undefined ? console : options.logger;

  await ensureFirstOwnerExists(env);
  const owner = await resolveRoadmapOwnerContext();
  const existingTitles = roadmapTitleSet(await listExistingRoadmapTasks(owner));
  const createdTitles: string[] = [];
  const skippedTitles: string[] = [];
  const context = taskContext(owner);

  for (const task of roadmapTasks) {
    if (existingTitles.has(task.title)) {
      skippedTitles.push(task.title);
      continue;
    }

    const created = unwrapResult(
      await createTask({
        ...context,
        title: task.title,
        description: task.description,
        priority: task.priority,
        labels: task.labels
      })
    );

    existingTitles.add(created.title);
    createdTitles.push(created.title);
  }

  const receipt: SeedRoadmapTasksReceipt = {
    ...owner,
    totalCount: roadmapTasks.length,
    createdCount: createdTitles.length,
    skippedCount: skippedTitles.length,
    createdTitles,
    skippedTitles,
    roadmapTitles: roadmapTasks.map((task) => task.title)
  };

  logger?.log(
    `Roadmap task seed complete: created=${receipt.createdCount} skipped=${receipt.skippedCount} total=${receipt.totalCount} workspace=${receipt.workspaceId}`
  );

  return receipt;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  void seedRoadmapTasks()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Roadmap task seed failed.";
      console.error(message);
      process.exitCode = 1;
    })
    .finally(() => pool.end().catch(() => undefined));
}
