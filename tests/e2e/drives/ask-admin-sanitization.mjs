// TEMP validation drive for #165 (unified stream drain) + #252 (broker error sanitization / CWE-200).
// Real login, real stack, no minted session. Sends prompts ONE AT A TIME like a human, waits for
// each turn to reach a terminal SSE event, and leak-checks the terminal event's `message` VALUE
// (the exact text #252 sanitizes and #165's drain module yields to the UI). The SSE JSON envelope
// itself is the client protocol and is expected; only the message value must be free of upstream
// URLs / cf-ray / request ids / raw vendor JSON.
// Usage: node tests/e2e/drives/_ask-admin-validate.mjs [outDir]

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, realLogin, artifactDir } from "../lib/session.mjs";

const OUT = process.argv[2] ?? artifactDir("ask-admin-validate");
mkdirSync(OUT, { recursive: true });

const PROMPTS = ["hi there", "what can you do?", "show connection status", "list open tasks", "give me a summary"];

// Infrastructure detail that must NEVER appear in a message value reaching the browser.
const LEAK_PATTERNS = [
  { name: "upstream URL", re: /https?:\/\/[^\s"']+/i },
  { name: "cf-ray", re: /cf[-_]?ray/i },
  { name: "request id (req_)", re: /\breq_[A-Za-z0-9]{6,}/i },
  { name: "labelled request id", re: /request id:/i },
  { name: "x-request-id", re: /x-request-id/i },
  { name: "bearer token", re: /bearer\s+[A-Za-z0-9._-]{8,}/i },
  { name: "sk- key", re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: "raw vendor JSON ({\"type\"/\"error\")", re: /\{\s*"(?:type|error|status|message)"\s*:/i },
];
function scanMessage(msg) {
  const hits = [];
  for (const p of LEAK_PATTERNS) if (p.re.test(msg)) hits.push(p.name);
  return hits;
}
function parseFailed(sse) {
  const out = [];
  for (const m of sse.matchAll(/data: (\{.*?\})\r?\n/g)) {
    try {
      const ev = JSON.parse(m[1]);
      if (ev.type === "failed" || ev.type === "final" || ev.type === "assistant.final") out.push(ev);
    } catch {}
  }
  return out;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const sseBodies = [];
context.on("response", async (resp) => {
  if (resp.request().method() === "POST" && /ask-admin\/turn|ask-opzava\/turn/i.test(resp.url())) {
    try { sseBodies.push(await resp.text()); } catch { sseBodies.push("<unreadable>"); }
  }
});

const page = await realLogin(context, { what: "Ask Admin sanitization (#165/#252)" });
await page.goto(`${BASE}/ask-opzava`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // let any pre-existing stuck turn clear
const input = page.getByPlaceholder("Message Ask Admin Opzava...");
await input.waitFor({ timeout: 15_000 });
await page.screenshot({ path: `${OUT}/00-loaded.png`, fullPage: true });

const results = [];
for (let i = 0; i < PROMPTS.length; i++) {
  const prompt = PROMPTS[i];
  const before = sseBodies.length;
  await input.fill(prompt);
  await input.press("Enter");

  // Wait (one at a time) for this turn's terminal event.
  let terminal = null;
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline && !terminal) {
    const fresh = sseBodies.slice(before).join("\n");
    const evs = parseFailed(fresh);
    if (evs.length) terminal = evs[evs.length - 1];
    else await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/turn-${i}.png`, fullPage: true });

  const msg = terminal?.message ?? "";
  const hits = scanMessage(msg);
  const r = { i, prompt, got: !!terminal, type: terminal?.type, state: terminal?.state, code: terminal?.code, message: msg, leaks: hits };
  results.push(r);
  console.log(`turn ${i} "${prompt}": type=${r.type} state=${r.state} code=${r.code}`);
  console.log(`   message=${JSON.stringify(msg)}`);
  console.log(`   LEAK=${hits.length ? "❌ " + hits.join(",") : "NONE ✅"}`);
}

const leaked = results.filter((r) => r.leaks.length);
const states = [...new Set(results.map((r) => `${r.state}/${r.code}`))];
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, sseBodies }, null, 2));
console.log(`\n==== ${results.length} turns; states seen: ${states.join(", ")} ====`);
console.log(`==== message-field leaks: ${leaked.length ? "YES ❌ " + leaked.map((r) => r.i) : "NONE across all turns ✅"} ====`);
await browser.close().catch(() => {});
process.exit(leaked.length ? 1 : 0);
