// GH #196 regression drive: a provider with no credential must have no routable models.
//
// `agents.defaults.models` keys ARE the gateway's routable allow-list. Disconnect used to remove
// only the credential, so a disconnected — or connect-rolled-back — provider kept routable models
// with nothing to authenticate them. It failed at call time instead of being refused up front, and
// OpenClaw never flagged it (`missingProvidersInUse: []`) because the orphans were not primary.
//
// This drive targets a provider that is ALREADY credential-less (an orphan left by an earlier
// disconnect or a rolled-back canary connect). That is the exact case the fix is about — no
// profiles and no auth.order entries meant the disconnect issued NO config.patch at all — and it is
// non-destructive: there is no credential to lose. It never touches a connected provider.
//
// Usage: node tests/e2e/drives/connections-disconnect-routable-models.mjs [providerId]

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const GATEWAY = process.env.OPZAVA_GATEWAY_CONTAINER ?? "opzava-openclaw-platform-gateway-1";
const WORKER = process.env.OPZAVA_WORKER_CONTAINER ?? "opzava-provisioning-worker-1";
const POSTGRES = process.env.OPZAVA_POSTGRES_CONTAINER ?? "opzava-postgres-1";

const TARGET = process.argv[2] ?? "moonshot";

async function gateway(script) {
  const { stdout } = await run("docker", ["exec", GATEWAY, "sh", "-lc", script], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function routableModels() {
  return Object.keys(JSON.parse((await gateway("node openclaw.mjs config get agents.defaults.models --json")) || "{}"));
}

// A provider is credentialled if it holds an api-key profile OR an OAuth/token credential in the
// agent auth store. Checking only `auth.profiles` would miss the OAuth store entirely.
async function credentialledProviders() {
  const profiles = JSON.parse((await gateway("node openclaw.mjs config get auth.profiles --json")) || "{}");
  const status = JSON.parse(await gateway("node openclaw.mjs models status --json"));
  return new Set([
    ...Object.keys(profiles).map((id) => id.split(":")[0]),
    ...(status?.auth?.providers ?? []).map((entry) => entry.provider),
  ]);
}

async function sql(query) {
  const { stdout } = await run("docker", [
    "exec", POSTGRES, "psql", "-U", "opzava", "-d", "opzava", "-t", "-A", "-c", query,
  ]);
  return stdout.trim();
}

// Drives the worker's REAL disconnect endpoint — the same one the browser hits — and polls to done.
async function workerDisconnect(principal, providerId) {
  const script = `
    const token = process.env.PROVISIONING_WORKER_TOKEN;
    const port = process.env.PORT || "19188";
    const body = { ...${JSON.stringify(principal)}, providerId: ${JSON.stringify(providerId)} };
    const call = async (path, extra) => {
      const res = await fetch("http://127.0.0.1:" + port + path, {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      });
      return { status: res.status, json: await res.json() };
    };
    (async () => {
      const started = await call("/internal/connections/model/disconnect", {});
      const opId = started.json.opId;
      if (!opId) { console.log(JSON.stringify(started.json)); return; }
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const polled = await call("/internal/connections/model/disconnect/poll", { opId });
        const status = polled.json.status;
        if (status && status !== "pending" && status !== "running") {
          console.log(JSON.stringify(polled.json));
          return;
        }
      }
      console.log(JSON.stringify({ status: "timeout" }));
    })();
  `;
  const { stdout } = await run("docker", ["exec", WORKER, "node", "-e", script], {
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim().split("\n").at(-1));
}

function fail(message) {
  console.error("\nFAIL: %s", message);
  process.exit(1);
}

async function main() {
  const principal = {
    orgId: await sql("select id from organizations limit 1;"),
    workspaceId: await sql("select id from workspaces limit 1;"),
    actorUserId: await sql("select id from auth_users limit 1;"),
    roleKeys: ["owner"],
  };

  const before = await routableModels();
  const credentialled = await credentialledProviders();
  const targetRoutes = before.filter((key) => key.split("/")[0].toLowerCase() === TARGET);
  const othersBefore = before.filter((key) => key.split("/")[0].toLowerCase() !== TARGET);

  console.log("BEFORE routable: %s", JSON.stringify(before));
  console.log("BEFORE credentialled providers: %s", JSON.stringify([...credentialled]));
  console.log("target=%s routes=%s", TARGET, JSON.stringify(targetRoutes));

  if (targetRoutes.length === 0) {
    fail(`${TARGET} has no routable models — nothing to prove. Pick a provider present in agents.defaults.models.`);
  }
  // Refuse to touch a provider that actually holds a credential: this drive must stay non-destructive.
  if (credentialled.has(TARGET)) {
    fail(`${TARGET} holds a real credential; this drive only disconnects credential-less orphans.`);
  }

  console.log("\nDisconnecting %s via the real worker endpoint...", TARGET);
  const outcome = await workerDisconnect(principal, TARGET);
  console.log("disconnect outcome: %s", JSON.stringify(outcome));

  const after = await routableModels();
  const survivors = after.filter((key) => key.split("/")[0].toLowerCase() === TARGET);
  const othersAfter = after.filter((key) => key.split("/")[0].toLowerCase() !== TARGET);

  console.log("\nAFTER routable: %s", JSON.stringify(after));

  if (survivors.length > 0) {
    fail(`${TARGET} still routable with no credential: ${JSON.stringify(survivors)} (this is #196).`);
  }
  // Collateral check: pruning the requested provider must not touch anyone else's routes.
  const lost = othersBefore.filter((key) => !othersAfter.includes(key));
  if (lost.length > 0) {
    fail(`disconnect pruned routes belonging to other providers: ${JSON.stringify(lost)}`);
  }

  console.log("\nPASS: %s pruned %s; other providers' routes intact (%d unchanged).",
    TARGET, JSON.stringify(targetRoutes), othersAfter.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
