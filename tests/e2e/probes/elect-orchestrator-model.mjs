// Live proof for #195: elect gpt-5.6-sol as the orchestrator model through the REAL UI/API path.
import { chromium } from "@playwright/test";
import { BASE, realLogin } from "../lib/session.mjs";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await realLogin(context, { what: "electing the orchestrator model" });

// Drive the real authenticated API the UI calls (same session cookie, same route, same worker path).
const res = await page.evaluate(async () => {
  const r = await fetch("/api/connections/orchestrator/set-main", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: "openai", model: "gpt-5.6-sol" }),
  });
  return { status: r.status, body: await r.text() };
});
console.log("set-main status:", res.status);
console.log("body:", res.body.slice(0, 300));
await browser.close();
