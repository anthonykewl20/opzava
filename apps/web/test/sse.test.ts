import { describe, expect, it } from "vitest";

import { parseSseBuffer, readSseFrames } from "../lib/sse";

function textStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("shared SSE reader", () => {
  it("parses complete frames and keeps the trailing partial block as remainder", () => {
    const result = parseSseBuffer("event: delta\ndata: {\"a\":1}\n\nevent: final\ndata: {\"b\":2}");
    expect(result.frames.map((frame) => frame.event)).toEqual(["delta"]);
    expect(result.frames[0]?.data).toBe('{"a":1}');
    expect(result.remainder).toBe("event: final\ndata: {\"b\":2}");
  });

  it("drops blocks without a data line", () => {
    const result = parseSseBuffer("event: noop\n\ndata: {\"ok\":true}\n\n");
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.data).toBe('{"ok":true}');
  });

  it("drains a chunked byte stream into ordered frames including the unterminated tail", async () => {
    const frames: string[] = [];
    for await (const frame of readSseFrames(
      textStream([
        "event: queued\ndata: {\"t\":\"queued\"}\n\neve",
        "nt: delta\ndata: {\"t\":\"delta\"}\n\n",
        "data: {\"t\":\"final\"}",
      ]),
    )) {
      frames.push(frame.data);
    }

    expect(frames).toEqual(['{"t":"queued"}', '{"t":"delta"}', '{"t":"final"}']);
  });
});
