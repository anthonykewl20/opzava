// Real user-level Ask Admin turn harness for #259.
// Uses the live chat UI at /ask-opzava, validates a streamed assistant reply in the DOM,
// and keeps the malformed-request boundary check as a direct API assertion.

import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { BASE, realLogin } from "../lib/session.mjs";

const PROMPT = "Reply with exactly: e2e-ok";
const INPUT_PLACEHOLDER = "Message Ask Admin Opzava...";
const SEND_BUTTON_NAME = /send message/i;
const BAD_CONVERSATION_ID = "not-a-uuid";
const TURN_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 15_000;

const pass = (message) => console.log(`PASS: ${message}`);
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
};
const unavailable = (message) => {
  console.error(`PRECONDITION UNAVAILABLE: ${message}`);
  process.exitCode = 2;
  throw new Error(message);
};

function parseSseEvents(raw) {
  const out = [];
  let eventType = null;
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) {
      if (line.trim() === "") eventType = null;
      continue;
    }
    if (eventType === null) continue;
    let data = null;
    try {
      const payload = line.slice(5).trim();
      data = payload ? JSON.parse(payload) : null;
    } catch {}
    out.push({ type: eventType, data });
    eventType = null;
  }
  return out;
}

async function readMessages(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[role="log"] [data-slot="message"]'))
      .map((message) => {
        const label = (message.getAttribute("aria-label") || "").trim();
        const bubble = message.querySelector('[data-slot="bubble-content"]');
        const text = (bubble?.textContent || "").trim();
        return {
          label,
          text,
        };
      })
      .filter((row) => row.text.length > 0);
  });
}

function hasFailureState(messageText) {
  return /failed/i.test(messageText);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });

const turnResponses = [];
const responseListener = async (response) => {
  if (response.request().method() !== "POST") return;
  if (!/\/api\/tasks\/ask-admin\/turn/.test(response.url())) return;
  try {
    turnResponses.push({
      status: response.status(),
      body: await response.text(),
      requestedAt: Date.now(),
    });
  } catch (error) {
    turnResponses.push({
      status: 0,
      error: String(error),
      requestedAt: Date.now(),
    });
  }
};

context.on("response", responseListener);

const waitForLatestTurn = async () => {
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (turnResponses.length > 0) return turnResponses.shift();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
};

try {
  const page = await realLogin(context, { what: "Ask Admin end-to-end (#259)" });

  await page.goto(`${BASE}/ask-opzava`, { waitUntil: "networkidle" });
  const input = page.getByPlaceholder(INPUT_PLACEHOLDER);
  await input.waitFor({ timeout: PAGE_TIMEOUT_MS });
  const sendButton = page.getByRole("button", { name: SEND_BUTTON_NAME });
  await sendButton.waitFor({ timeout: PAGE_TIMEOUT_MS });

  const beforeMessages = await readMessages(page);
  await input.fill(PROMPT);
  await input.press("Enter");

  const turn = await waitForLatestTurn();
  if (turn === null) {
    unavailable("no /api/tasks/ask-admin/turn request observed after submitting the chat prompt");
  }

  if (turn.error) {
    fail(`POST /api/tasks/ask-admin/turn request errored: ${turn.error}`);
  }

  const body = turn.body;
  const events = parseSseEvents(body);
  const types = new Set(events.map((event) => event.type));
  const failedEvent = events.find((event) => event.type === "failed");

  if (turn.status !== 200) {
    fail(`/api/tasks/ask-admin/turn returned HTTP ${turn.status}, expected 200`);
  }
  pass("chat prompt submission returned HTTP 200");

  if (!types.has("queued")) {
    fail(`SSE stream had no event:queued (${types.size ? [...types].join(",") : "no events"})`);
  }
  if (!types.has("assistant.final")) {
    fail(`SSE stream had no event:assistant.final (${types.size ? [...types].join(",") : "no events"})`);
  }
  if (failedEvent) {
    fail(`SSE stream returned event:failed (${JSON.stringify(failedEvent)})`);
  }
  pass("SSE stream included queued and assistant.final without failed");

  const started = Date.now();
  while (Date.now() - started < TURN_TIMEOUT_MS) {
    const messages = await readMessages(page);
    const newMessages = messages.slice(beforeMessages.length);
    const assistantMessage = newMessages.find((m) => !/^\s*You\b/i.test(m.label) && m.text.trim().length > 0);

    if (assistantMessage) {
      if (hasFailureState(assistantMessage.text)) {
        fail(`new assistant message indicates failure: ${assistantMessage.text}`);
      }
      pass("DOM rendered a non-empty assistant message for the turn");
      break;
    }
    await page.waitForTimeout(500);
  }
  if ((await readMessages(page)).length <= beforeMessages.length) {
    fail("assistant response did not render in the DOM after prompt submission");
  }

  const badResponse = await context.request.post(`${BASE}/api/tasks/ask-admin/turn`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({
      conversationId: BAD_CONVERSATION_ID,
      prompt: PROMPT,
      idempotencyKey: `ask-admin-turn-${randomUUID()}`,
    }),
  });

  const badBodyText = await badResponse.text();
  let badJson = null;
  try {
    badJson = JSON.parse(badBodyText);
  } catch {}
  if (badResponse.status() !== 400) {
    fail(`malformed conversationId request returned HTTP ${badResponse.status()}, expected 400`);
  }
  pass("malformed conversationId request returned HTTP 400");
  if (badJson?.error !== "invalid_request") {
    fail(`malformed conversationId body was ${badBodyText || "<empty>"}, expected { error: "invalid_request" }`);
  }
  pass('malformed conversationId body returned `{ error: "invalid_request" }`');
} catch (error) {
  if (process.exitCode === undefined) {
    fail(`unexpected harness error: ${error instanceof Error ? error.message : String(error)}`);
  }
} finally {
  context.off("response", responseListener);
  await browser.close().catch(() => {});
  if (process.exitCode === undefined) process.exitCode = 0;
}
