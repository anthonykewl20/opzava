import { describe, expect, it } from "vitest";

import {
  drainAskAdminStream,
  emptyAskAdminDraft,
  type AskAdminClientStreamEvent,
} from "../lib/ask-admin-stream";

function sseBody(events: readonly AskAdminClientStreamEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

function chunkedBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
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

async function drain(body: ReadableStream<Uint8Array>): Promise<readonly AskAdminClientStreamEvent[]> {
  const received: AskAdminClientStreamEvent[] = [];
  await drainAskAdminStream(body, { onEvent: (event) => received.push(event) });
  return received;
}

describe("drainAskAdminStream", () => {
  it("forwards every parsed event in order", async () => {
    const events = await drain(
      sseBody([
        { type: "queued", turnId: "t1", userTurnId: "u1", state: "queued" },
        { type: "delta", turnId: "t1", deltaText: "Hi", text: "Hi", state: "working" },
        {
          type: "assistant.final",
          turnId: "t1",
          text: "Hi there",
          state: "completed",
        },
      ]),
    );

    expect(events.map((event) => event.type)).toEqual(["queued", "delta", "assistant.final"]);
  });

  it("synthesizes the interrupt failure when the body ends without a terminal event", async () => {
    const events = await drain(
      sseBody([
        { type: "queued", turnId: "t1", userTurnId: "u1", state: "queued" },
        { type: "delta", turnId: "t1", deltaText: "Partial", text: "Partial", state: "working" },
      ]),
    );

    expect(events.at(-1)).toMatchObject({
      type: "failed",
      code: "webGateway.streamInterrupted",
      state: "gateway_unavailable",
    });
  });

  it("synthesizes the interrupt even when no events arrived at all", async () => {
    const events = await drain(sseBody([]));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "failed",
      code: "webGateway.streamInterrupted",
      state: "gateway_unavailable",
    });
  });

  it("does not synthesize an interrupt after an explicit failure", async () => {
    const events = await drain(
      sseBody([
        { type: "queued", turnId: "t1", userTurnId: "u1", state: "queued" },
        {
          type: "failed",
          turnId: "t1",
          code: "gatewayBroker.connectionClosed",
          message: "OpenClaw connection closed.",
          state: "gateway_unavailable",
        },
      ]),
    );

    expect(events.map((event) => event.type)).toEqual(["queued", "failed"]);
  });

  it("parses events split across arbitrary byte chunks", async () => {
    const events = await drain(
      chunkedBody([
        'event: queued\ndata: {"type":"queued","turnId":"t1","userTurnId":"u1","state":"queued"}\n\nevent: delt',
        'a\ndata: {"type":"delta","turnId":"t1","deltaText":"Hi","text":"Hi","state":"working"}\n\n',
        'event: assistant.final\ndata: {"type":"assistant.final","turnId":"t1","text":"Hi there","state":"completed"}',
      ]),
    );

    expect(events.map((event) => event.type)).toEqual(["queued", "delta", "assistant.final"]);
    expect(emptyAskAdminDraft().status).toBe("idle");
  });
});
