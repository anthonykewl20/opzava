import type { TaskCardActivityEvent } from "@/lib/task-card-activity";
import { encodeTaskCardActivitySse } from "@/lib/task-card-activity";
import {
  defaultTaskCardActivitySourceDependencies,
  pollTaskCardActivityEvents,
} from "@/lib/task-card-activity-source";
import { getAppSessionContext, type AppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface TaskCardActivityRouteContext {
  readonly params: Promise<{
    readonly cardId: string;
  }>;
}

export interface TaskCardActivityRouteDependencies {
  readonly getSessionContext: (headers: Headers) => Promise<AppSessionContext | null>;
  readonly createActivityEventStream: (
    context: AppSessionContext,
    cardId: string,
    signal: AbortSignal,
  ) => AsyncIterable<TaskCardActivityEvent>;
}

function defaultDependencies(): TaskCardActivityRouteDependencies {
  return {
    getSessionContext: getAppSessionContext,
    createActivityEventStream: (context, cardId, signal) =>
      pollTaskCardActivityEvents(
        context,
        cardId,
        signal,
        defaultTaskCardActivitySourceDependencies,
      ),
  };
}

export function createTaskCardActivityGetHandler(
  overrides: Partial<TaskCardActivityRouteDependencies> = {},
) {
  return async function GET(
    request: Request,
    routeContext: TaskCardActivityRouteContext,
  ): Promise<Response> {
    const deps = { ...defaultDependencies(), ...overrides };
    const context = await deps.getSessionContext(new Headers(request.headers));

    if (context === null) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { cardId } = await routeContext.params;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of deps.createActivityEventStream(
            context,
            cardId,
            request.signal,
          )) {
            controller.enqueue(encodeTaskCardActivitySse(event));
            if (request.signal.aborted) {
              break;
            }
          }
        } catch {
          controller.enqueue(
            encodeTaskCardActivitySse({
              type: "assistant-state",
              state: "failed",
              runs: [],
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-store, no-transform",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  };
}

export const GET = createTaskCardActivityGetHandler();
