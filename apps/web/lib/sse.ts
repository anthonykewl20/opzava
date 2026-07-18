/**
 * Dumb Server-Sent-Events byte-stream reader.
 *
 * This module knows nothing about Ask Admin, OpenClaw, or any domain event
 * shape — it only splits a `text/event-stream` byte stream into `{ event, data }`
 * frames. Every SSE consumer in the web app (the OpenClaw Gateway port adapter,
 * the Ask Admin stream drain, and the task-card activity feed) goes through it,
 * so the frame-parser is written once instead of three times (see #165).
 *
 * Frame semantics follow the SSE wire format our own servers emit
 * (`event: <name>\ndata: <json>\n\n`): a block is delimited by a blank line,
 * `event:` names the frame, and one or more `data:` lines carry the payload
 * (joined with `\n`, with a single leading space stripped per spec). A block
 * without a `data:` line carries no payload and is dropped.
 */
export interface SseFrame {
  readonly event: string | undefined;
  readonly data: string;
}

export interface SseBufferParseResult {
  readonly frames: readonly SseFrame[];
  readonly remainder: string;
}

function frameFromBlock(block: string): SseFrame | null {
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).replace(/^ /, "");
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export function parseSseBuffer(buffer: string): SseBufferParseResult {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const frames: SseFrame[] = [];

  for (const part of parts) {
    const frame = frameFromBlock(part);
    if (frame !== null) {
      frames.push(frame);
    }
  }

  return { frames, remainder };
}

/**
 * Drains a `text/event-stream` response body, yielding each complete frame as it
 * arrives. The final unterminated block (no trailing blank line) is emitted as a
 * last frame when the stream ends, matching the flush behaviour the React drain
 * loops previously reimplemented by hand.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.remainder;
    for (const frame of parsed.frames) {
      yield frame;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() !== "") {
    const frame = frameFromBlock(buffer);
    if (frame !== null) {
      yield frame;
    }
  }
}
