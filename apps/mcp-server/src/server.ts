import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  verifyLinkToken,
  type LinkTokenPrincipal,
  type VerifyLinkTokenInput,
} from "@opzava/identity-access";
import { DomainError } from "@opzava/shared-kernel";

import {
  addCommentSchema,
  addCommentToolHandler,
  addQualityCheckSchema,
  addQualityCheckToolHandler,
  createStepSchema,
  createStepToolHandler,
  createTaskSchema,
  createToolHandler,
  defaultTaskServices,
  descriptionForTool,
  getTaskSchema,
  getToolHandler,
  listTasksSchema,
  listToolHandler,
  markCommentsReadSchema,
  markCommentsReadToolHandler,
  readToolNames,
  reorderStepsSchema,
  reorderStepsToolHandler,
  setDueSchema,
  setDueToolHandler,
  setWatchersSchema,
  setWatchersToolHandler,
  toggleStepSchema,
  toggleStepToolHandler,
  updateTaskSchema,
  updateToolHandler,
  writeToolNames,
  type OpzavaMcpTaskServices,
  type OpzavaMcpToolName,
} from "./tools.js";

export interface OpzavaMcpServerOptions {
  readonly linkToken?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly verifyToken?: (input: VerifyLinkTokenInput) => ReturnType<typeof verifyLinkToken>;
  readonly taskServices?: OpzavaMcpTaskServices;
}

export interface OpzavaMcpRuntime {
  readonly server: McpServer;
  readonly principal: LinkTokenPrincipal;
  readonly toolNames: readonly OpzavaMcpToolName[];
}

function readLinkToken(options: OpzavaMcpServerOptions): string {
  const token =
    options.linkToken ?? options.env?.["OPZAVA_LINK_TOKEN"] ?? process.env["OPZAVA_LINK_TOKEN"];
  if (token === undefined || token.trim() === "") {
    throw new DomainError({
      code: "mcp.linkTokenMissing",
      message: "OPZAVA_LINK_TOKEN is required for the Opzava MCP server.",
    });
  }

  return token.trim();
}

function hasScope(principal: LinkTokenPrincipal, scope: "tasks:read" | "tasks:write"): boolean {
  return principal.scopes.includes(scope);
}

export async function createOpzavaMcpServer(
  options: OpzavaMcpServerOptions = {},
): Promise<OpzavaMcpRuntime> {
  const token = readLinkToken(options);
  const verify = options.verifyToken ?? verifyLinkToken;
  const verified = await verify({ token });
  if (!verified.ok) {
    throw verified.error;
  }

  const principal = verified.value;
  const taskServices = options.taskServices ?? defaultTaskServices;
  const server = new McpServer({
    name: "opzava",
    version: "2026-07-03.slice2.5b",
  });
  const toolNames: OpzavaMcpToolName[] = [];

  if (hasScope(principal, "tasks:read")) {
    server.registerTool(
      "opzava_tasks_list",
      {
        title: "List Opzava Tasks",
        description: descriptionForTool("opzava_tasks_list"),
        inputSchema: listTasksSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      listToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_get",
      {
        title: "Get Opzava Task Card",
        description: descriptionForTool("opzava_tasks_get"),
        inputSchema: getTaskSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      getToolHandler(principal, taskServices),
    );
    toolNames.push(...readToolNames);
  }

  if (hasScope(principal, "tasks:write")) {
    server.registerTool(
      "opzava_tasks_create",
      {
        title: "Create Opzava Task",
        description: descriptionForTool("opzava_tasks_create"),
        inputSchema: createTaskSchema,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      createToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_update",
      {
        title: "Update Opzava Task",
        description: descriptionForTool("opzava_tasks_update"),
        inputSchema: updateTaskSchema,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      updateToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_steps_create",
      {
        title: "Create Opzava Task Step",
        description: descriptionForTool("opzava_tasks_steps_create"),
        inputSchema: createStepSchema,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      createStepToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_steps_toggle",
      {
        title: "Toggle Opzava Task Step",
        description: descriptionForTool("opzava_tasks_steps_toggle"),
        inputSchema: toggleStepSchema,
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      toggleStepToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_steps_reorder",
      {
        title: "Reorder Opzava Task Steps",
        description: descriptionForTool("opzava_tasks_steps_reorder"),
        inputSchema: reorderStepsSchema,
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      reorderStepsToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_comments_add",
      {
        title: "Add Opzava Task Comment",
        description: descriptionForTool("opzava_tasks_comments_add"),
        inputSchema: addCommentSchema,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      addCommentToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_comments_mark_read",
      {
        title: "Mark Opzava Task Comments Read",
        description: descriptionForTool("opzava_tasks_comments_mark_read"),
        inputSchema: markCommentsReadSchema,
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      markCommentsReadToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_quality_checks_add",
      {
        title: "Add Opzava Task Quality Check",
        description: descriptionForTool("opzava_tasks_quality_checks_add"),
        inputSchema: addQualityCheckSchema,
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      addQualityCheckToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_due_set",
      {
        title: "Set Opzava Task Due Date",
        description: descriptionForTool("opzava_tasks_due_set"),
        inputSchema: setDueSchema,
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      setDueToolHandler(principal, taskServices),
    );
    server.registerTool(
      "opzava_tasks_watchers_set",
      {
        title: "Set Opzava Task Watchers",
        description: descriptionForTool("opzava_tasks_watchers_set"),
        inputSchema: setWatchersSchema,
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      setWatchersToolHandler(principal, taskServices),
    );
    toolNames.push(...writeToolNames);
  }

  return { server, principal, toolNames };
}
