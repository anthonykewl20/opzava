// Live #256 audit-ledger harness drive. Real form login, then reads the owned admin BFF route in
// the same authenticated browser context and proves the harness against the gateway's real ledger:
// real agent.run.* records surface, forbidden OpenClaw fields (sessionKey/sessionId/actor/pseudonyms)
// are stripped, pagination is newest-first, and a browser-injected routeId/tenantId is rejected.
// It first tries to create a FRESH Ask Admin run to find; if that run cannot be created/audited
// (e.g. an unrelated Ask Admin outage), it falls back to the ledger's existing agent_run records so
// the harness is still proven — but it never passes vacuously (an empty ledger exits 2).
// Usage: node tests/e2e/drives/openclaw-audit.mjs

import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { BASE, realLogin } from "../lib/session.mjs";

const FORBIDDEN =
  /sessionKey|sessionId|"actor"|schemaVersion|redaction|pseudonym|accountRef|conversationRef|messageRef|targetRef/i;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
await realLogin(context, { what: "the OpenClaw audit ledger harness (#256)" });

const unavailable = async (message) => {
  console.error(`PRECONDITION UNAVAILABLE: ${message}`);
  await browser.close().catch(() => {});
  process.exit(2);
};
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

const readAudit = async (data) => {
  const result = await context.request.post(`${BASE}/api/admin/audit/activity`, {
    data,
    headers: { "content-type": "application/json" },
  });
  return { status: result.status(), body: result.ok() ? await result.json() : null };
};

// Best-effort: create a fresh run to look for. An unrelated Ask Admin failure must not fail the
// harness verification below — it just means we assert against the pre-existing ledger instead.
const startedAt = Date.now() - 1_000;
let freshRunSought = false;
try {
  const turn = await context.request.post(`${BASE}/api/tasks/ask-admin/turn`, {
    data: {
      conversationId: `audit-e2e-${randomUUID()}`,
      prompt: "Reply with exactly: audit harness ready",
      idempotencyKey: `audit-e2e-${randomUUID()}`,
    },
    headers: { "content-type": "application/json" },
  });
  const text = await turn.text();
  freshRunSought = turn.ok() && !/"type":"failed"/.test(text);
  if (!freshRunSought) console.warn("NOTE: fresh Ask Admin run unavailable; verifying against the existing ledger.");
} catch (error) {
  console.warn(`NOTE: fresh Ask Admin run threw (${String(error)}); verifying against the existing ledger.`);
}

// 1. Real agent_run records surface through the ACL.
const runPage = await readAudit({ agent: "ask-admin-opzava", kind: "agent_run", limit: 50 });
if (runPage.status !== 200) await unavailable(`audit BFF returned HTTP ${runPage.status} for agent_run`);
const events = runPage.body?.events ?? [];
if (events.length === 0) await unavailable("the gateway audit ledger has no agent_run records to verify");
if (!events.some((e) => e.action === "agent.run.started" || e.action === "agent.run.finished"))
  fail("returned agent_run records carry no agent.run action");

// 2. If a fresh run was created, it must be present with start + finish.
if (freshRunSought) {
  const actionsByRun = new Map();
  for (const e of events.filter((e) => e.occurredAt >= startedAt)) {
    actionsByRun.set(e.runId, (actionsByRun.get(e.runId) ?? new Set()).add(e.action));
  }
  const runId = [...actionsByRun].find(
    ([, a]) => a.has("agent.run.started") && a.has("agent.run.finished"),
  )?.[0];
  if (runId) console.log(`PASS: fresh run ${runId} surfaced with start+finish projections`);
  else fail("the created run produced no matching start/finish audit projection");
}

// 3. Forbidden OpenClaw fields are stripped (the raw ledger records DO carry them).
if (FORBIDDEN.test(JSON.stringify(runPage.body)))
  fail("audit BFF leaked a forbidden OpenClaw correlation/actor field");
else console.log("PASS: no forbidden fields; event keys:", Object.keys(events[0]).join(","));

// 4. Newest-first cursor pagination.
const first = await readAudit({ limit: 1 });
if (first.body?.events?.[0] && first.body.nextCursor) {
  const second = await readAudit({ limit: 1, cursor: first.body.nextCursor });
  if (!second.body?.events?.[0]) fail("the next audit cursor returned no row");
  else if (first.body.events[0].eventId === second.body.events[0].eventId)
    fail("audit cursor repeated the newest event");
  else if (first.body.events[0].sequence <= second.body.events[0].sequence)
    fail("audit pages are not newest-first by ledger sequence");
  else console.log("PASS: newest-first cursor paging verified");
} else {
  console.warn("NOTE: fewer than two pageable rows retained; paging not exercised");
}

// 5. A browser-injected server-owned binding is rejected (400), never honored.
const injected = await readAudit({ kind: "agent_run", routeId: "platform-openclaw", tenantId: "evil" });
if (injected.status !== 400) fail(`browser-supplied routeId/tenantId not rejected (got ${injected.status})`);
else console.log("PASS: browser-supplied routeId/tenantId rejected (400)");

console.log(`DONE. exitCode=${process.exitCode ?? 0}`);
await browser.close();
