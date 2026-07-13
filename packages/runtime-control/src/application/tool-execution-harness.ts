import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  recordStartedToolOutcome,
  recordToolOutcome,
  type RuntimeControlApplicationContext,
  type RuntimeControlDependencies,
  type StartedToolOutcomeReceipt,
  type ToolExecutionContext,
} from "./assistant-conversations.js";
import type { AssistantToolOutcome } from "../domain/assistant.js";

export interface ToolFailure {
  readonly code: string;
  readonly message: string;
}

export interface ParsedToolArgsWithSummary {
  readonly requestSummary: Readonly<Record<string, unknown>>;
}

export type ToolExecution<ToolName extends string, Output> =
  | {
      readonly status: "succeeded";
      readonly toolName: ToolName;
      readonly toolCallId: string;
      readonly output: Output;
      readonly outcome: AssistantToolOutcome;
    }
  | {
      readonly status: "failed";
      readonly toolName: ToolName;
      readonly toolCallId: string;
      readonly code: string;
      readonly message: string;
      readonly outcome: AssistantToolOutcome;
    };

export interface RunToolExecutionOptions<
  ToolName extends string,
  ParsedToolArgs extends ParsedToolArgsWithSummary,
  Output,
  Dependencies extends RuntimeControlDependencies,
> {
  readonly input: {
    readonly context: ToolExecutionContext;
    readonly toolName: string;
    readonly toolCallId: string;
    readonly args: unknown;
  };
  readonly dependencies: Dependencies;
  readonly parseToolName: (value: string) => Result<ToolName>;
  readonly parseArgs: (toolName: ToolName, value: unknown) => Result<ParsedToolArgs>;
  readonly malformedRequestSummary: (
    toolName: ToolName,
    args: unknown,
    error: DomainError,
  ) => Readonly<Record<string, unknown>>;
  readonly contextForOutcome: (context: ToolExecutionContext) => RuntimeControlApplicationContext;
  readonly completedExecutionFromOutcome: (
    toolName: ToolName,
    toolCallId: string,
    receipt: StartedToolOutcomeReceipt,
  ) => Result<ToolExecution<ToolName, Output>>;
  readonly performTool: (
    parsed: ParsedToolArgs,
    context: ToolExecutionContext,
    dependencies: Dependencies,
  ) => Promise<Result<Output>>;
  readonly failureFromMalformedArgs: (error: DomainError) => ToolFailure;
  readonly failureFromError: (error: DomainError) => ToolFailure;
  readonly resultSummary: (output: Output) => Readonly<Record<string, unknown>>;
  readonly targetRef: (output: Output) => string | null;
}

function toolError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  return Object.keys(value)
    .sort()
    .slice(0, 20)
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sanitizeValue(value[key], depth + 1);
      return accumulator;
    }, {});
}

export function malformedRequestSummary<ToolName extends string>(
  toolName: ToolName,
  args: unknown,
  error: DomainError,
): Readonly<Record<string, unknown>> {
  return {
    toolName,
    malformedArgs: sanitizeValue(args),
    errorCode: error.code,
  };
}

export function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

export function failureFromMalformedArgs(error: DomainError): ToolFailure {
  return {
    code: "malformed_args",
    message: error.message,
  };
}

function failureSummary(failure: ToolFailure): Readonly<Record<string, unknown>> {
  return { ok: false, code: failure.code, message: failure.message };
}

async function finishFailure<
  ToolName extends string,
  Output,
  Dependencies extends RuntimeControlDependencies,
>(
  input: {
    readonly context: ToolExecutionContext;
    readonly contextForOutcome: (context: ToolExecutionContext) => RuntimeControlApplicationContext;
    readonly toolName: ToolName;
    readonly toolCallId: string;
    readonly requestSummary: Readonly<Record<string, unknown>>;
    readonly failure: ToolFailure;
  },
  dependencies: Dependencies,
): Promise<Result<ToolExecution<ToolName, Output>>> {
  const outcome = await recordToolOutcome(
    {
      ...input.contextForOutcome(input.context),
      turnId: input.context.assistantTurnId,
      toolName: input.toolName,
      toolCallId: input.toolCallId,
      idempotencyKey: input.context.commandIdempotencyKey,
      status: "failed",
      requestSummary: input.requestSummary,
      resultSummary: failureSummary(input.failure),
    },
    dependencies,
  );
  if (!outcome.ok) {
    return err(outcome.error);
  }

  return ok({
    status: "failed",
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    code: input.failure.code,
    message: input.failure.message,
    outcome: outcome.value,
  });
}

export async function runToolExecution<
  ToolName extends string,
  ParsedToolArgs extends ParsedToolArgsWithSummary,
  Output,
  Dependencies extends RuntimeControlDependencies,
>(
  options: RunToolExecutionOptions<ToolName, ParsedToolArgs, Output, Dependencies>,
): Promise<Result<ToolExecution<ToolName, Output>>> {
  const toolName = options.parseToolName(options.input.toolName);
  if (!toolName.ok) {
    return err(toolName.error);
  }

  const toolCallId =
    typeof options.input.toolCallId === "string" && options.input.toolCallId.trim() !== ""
      ? options.input.toolCallId.trim()
      : null;
  if (toolCallId === null) {
    return err(toolError("runtimeControl.invalidToolCallId", "Tool call id is required."));
  }

  const parsed = options.parseArgs(toolName.value, options.input.args);
  const requestSummary = parsed.ok
    ? parsed.value.requestSummary
    : options.malformedRequestSummary(toolName.value, options.input.args, parsed.error);

  const started = await recordStartedToolOutcome(
    {
      ...options.contextForOutcome(options.input.context),
      turnId: options.input.context.assistantTurnId,
      toolName: toolName.value,
      toolCallId,
      idempotencyKey: options.input.context.commandIdempotencyKey,
      status: "started",
      requestSummary,
    },
    options.dependencies,
  );
  if (!started.ok) {
    return err(started.error);
  }

  if (!started.value.inserted) {
    return options.completedExecutionFromOutcome(toolName.value, toolCallId, started.value);
  }

  if (!parsed.ok) {
    return finishFailure(
      {
        context: options.input.context,
        contextForOutcome: options.contextForOutcome,
        toolName: toolName.value,
        toolCallId,
        requestSummary,
        failure: options.failureFromMalformedArgs(parsed.error),
      },
      options.dependencies,
    );
  }

  const performed = await options.performTool(
    parsed.value,
    options.input.context,
    options.dependencies,
  );
  if (!performed.ok) {
    return finishFailure(
      {
        context: options.input.context,
        contextForOutcome: options.contextForOutcome,
        toolName: toolName.value,
        toolCallId,
        requestSummary,
        failure: options.failureFromError(performed.error),
      },
      options.dependencies,
    );
  }

  const output = performed.value;
  const outcome = await recordToolOutcome(
    {
      ...options.contextForOutcome(options.input.context),
      turnId: options.input.context.assistantTurnId,
      toolName: toolName.value,
      toolCallId,
      idempotencyKey: options.input.context.commandIdempotencyKey,
      status: "succeeded",
      requestSummary,
      resultSummary: options.resultSummary(output),
      targetRef: options.targetRef(output),
    },
    options.dependencies,
  );
  if (!outcome.ok) {
    return err(outcome.error);
  }

  return ok({
    status: "succeeded",
    toolName: toolName.value,
    toolCallId,
    output,
    outcome: outcome.value,
  });
}
