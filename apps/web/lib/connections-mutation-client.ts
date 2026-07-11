// Browser-side mutation client for the Connections surface.
//
// Every model-provider mutation goes through plain fetch + JSON routes instead of React form
// actions: a fetch promise ALWAYS settles (timeout, network error, HTTP error, or success), so the
// UI can never wedge in a pending state waiting on an action response stream. Sad paths are the
// contract here, not an afterthought - every failure maps to a typed kind the dialogs render
// actionably, and polling tolerates bounded transient blips before surfacing an error.

export type MutationFailureKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "server";

export interface MutationFailure {
  readonly ok: false;
  readonly kind: MutationFailureKind;
  readonly message: string;
  readonly code: string | null;
  readonly status: number | null;
}

export type MutationResult<T> = { readonly ok: true; readonly data: T } | MutationFailure;

const defaultTimeoutMs = 25_000;

function failure(
  kind: MutationFailureKind,
  message: string,
  code: string | null = null,
  status: number | null = null,
): MutationFailure {
  return { ok: false, kind, message, code, status };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    ((error as { readonly name?: unknown }).name === "AbortError" ||
      (error as { readonly name?: unknown }).name === "TimeoutError")
  );
}

export async function postConnectionsMutation<T>(
  path: string,
  body: Readonly<Record<string, unknown>>,
  options?: { readonly timeoutMs?: number },
): Promise<MutationResult<T>> {
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      return failure(
        "timeout",
        "The gateway is taking longer than expected. The operation may still complete server-side.",
      );
    }
    return failure("network", "Network request failed. Check the connection and retry.");
  }

  const payload = (await response.json().catch(() => null)) as
    | { readonly message?: unknown; readonly code?: unknown }
    | T
    | null;
  if (response.ok) {
    if (payload === null) {
      return failure("server", "The server returned an unreadable response.", null, response.status);
    }
    return { ok: true, data: payload as T };
  }

  const message =
    payload !== null && typeof (payload as { readonly message?: unknown }).message === "string"
      ? ((payload as { readonly message: string }).message)
      : "The request failed.";
  const code =
    payload !== null && typeof (payload as { readonly code?: unknown }).code === "string"
      ? ((payload as { readonly code: string }).code)
      : null;
  if (response.status === 401) {
    return failure("unauthorized", "The session expired. Sign in again.", code, 401);
  }
  if (response.status === 403) {
    return failure("forbidden", message, code, 403);
  }
  if (response.status === 400) {
    return failure("invalid", message, code, 400);
  }
  return failure("server", message, code, response.status);
}

export interface PollDriverOptions<T> {
  readonly poll: () => Promise<MutationResult<T>>;
  readonly isTerminal: (data: T) => boolean;
  /** Called with each successful non-terminal sample (e.g. to surface progress). */
  readonly onPending?: (data: T) => void;
  readonly intervalMs?: number;
  readonly maxDurationMs?: number;
  /** Consecutive timeout/network failures tolerated before surfacing them. */
  readonly maxTransientFailures?: number;
  /** Return false to stop polling (component unmounted). */
  readonly shouldContinue: () => boolean;
}

export type PollDriverOutcome<T> =
  | { readonly ok: true; readonly data: T }
  | MutationFailure
  | { readonly ok: false; readonly kind: "expired-window"; readonly message: string; readonly code: null; readonly status: null }
  | { readonly ok: false; readonly kind: "cancelled"; readonly message: string; readonly code: null; readonly status: null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll a status endpoint until terminal. Transient blips (timeout/network) retry with a doubling
 * backoff up to maxTransientFailures in a row; hard failures (unauthorized/forbidden/invalid/
 * server) surface immediately. The whole window is bounded by maxDurationMs.
 */
export async function pollUntilTerminal<T>(options: PollDriverOptions<T>): Promise<PollDriverOutcome<T>> {
  const intervalMs = options.intervalMs ?? 1_750;
  const maxDurationMs = options.maxDurationMs ?? 150_000;
  const maxTransientFailures = options.maxTransientFailures ?? 3;
  const deadline = Date.now() + maxDurationMs;
  let transientFailures = 0;

  while (Date.now() < deadline) {
    if (!options.shouldContinue()) {
      return { ok: false, kind: "cancelled", message: "Polling stopped.", code: null, status: null };
    }

    const result = await options.poll();
    if (result.ok) {
      transientFailures = 0;
      if (options.isTerminal(result.data)) {
        return result;
      }
      options.onPending?.(result.data);
    } else if (result.kind === "timeout" || result.kind === "network") {
      transientFailures += 1;
      if (transientFailures > maxTransientFailures) {
        return result;
      }
    } else {
      return result;
    }

    await sleep(intervalMs * Math.min(2 ** Math.max(0, transientFailures - 1), 4));
  }

  return {
    ok: false,
    kind: "expired-window",
    message: "The operation did not finish in time. Refresh to see the current provider state.",
    code: null,
    status: null,
  };
}
