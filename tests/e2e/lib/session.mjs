// The one real login every E2E script here shares, and the one place the live stack's URL and seeded
// credentials are named.
//
// A minted session or an injected cookie is BANNED (SeniorQA directive, 2026-07-04): slices were
// reported working while the live stack was broken because acceptance had bypassed the login. If the
// form login fails, the run fails — there is no fallback.

export const BASE = process.env.REAL_BASE ?? "http://web.opzava.localhost:18088";
export const EMAIL = process.env.REAL_EMAIL ?? "owner@opzava.localhost";
export const PASSWORD = process.env.REAL_PASSWORD ?? "OpzavaLocalDev!2026";

/** Where a run drops its screenshots and report. Relative, so artifacts land under the repo root. */
export function artifactDir(prefix) {
  return `real-validate-artifacts/${prefix}-${new Date().toISOString().replaceAll(":", "-")}`;
}

/**
 * Logs in through the real form and returns the page.
 *
 * `what` only shapes the failure message — say what the caller was about to validate, so a failed
 * login reads as "cannot validate Connections" rather than a bare stack trace.
 */
export async function realLogin(context, { what = "this flow", timeoutMs = 15_000 } = {}) {
  if (process.env.PARITY_COOKIE) {
    console.warn("PARITY_COOKIE is ignored: these scripts require a real login.");
  }

  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: timeoutMs }).catch(() => {
    throw new Error(`REAL LOGIN FAILED - cannot validate ${what}.`);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  return page;
}
