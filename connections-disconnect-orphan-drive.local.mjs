// GH #174 regression drive: a disconnect must never leave a live credential behind.
//
// OpenClaw's onboarding writes a SET of auth profiles per auth method, deriving each profile's
// provider from the profile-id prefix. OpenCode declares a shared set on purpose
// (mainframe/src/plugin-sdk/opencode.ts), so ONE connect to `opencode-go` creates TWO profiles:
//   opencode-go:default (provider opencode-go)  +  opencode:default (provider opencode)
// Opzava matched profiles by provider-id equality, so disconnect removed only the first, reported
// SUCCESS, and left `opencode:default` holding the live key.
//
// This drive runs the REAL worker disconnect against the REAL gateway with a THROWAWAY key and
// fails if ANY profile created by the connect survives.
//
// Usage: node connections-disconnect-orphan-drive.local.mjs

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const GATEWAY = process.env.OPZAVA_GATEWAY_CONTAINER ?? "opzava-openclaw-platform-gateway-1";
const WORKER = process.env.OPZAVA_WORKER_CONTAINER ?? "opzava-provisioning-worker-1";
const POSTGRES = process.env.OPZAVA_POSTGRES_CONTAINER ?? "opzava-postgres-1";

// A syntactically valid but worthless key. Never a real credential.
const THROWAWAY_KEY = "sk-opzava-test-DUMMY-not-a-real-key-0123456789";
// The catalog provider the operator clicks Connect/Disconnect on.
const CATALOG_PROVIDER = "opencode-go";

async function gateway(script) {
  const { stdout } = await run("docker", ["exec", GATEWAY, "sh", "-lc", script], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function authProfiles() {
  return JSON.parse((await gateway("openclaw config get auth.profiles --json")) || "{}");
}

async function sql(query) {
  const { stdout } = await run("docker", [
    "exec",
    POSTGRES,
    "psql",
    "-U",
    "opzava",
    "-d",
    "opzava",
    "-t",
    "-A",
    "-c",
    query,
  ]);
  return stdout.trim();
}

// Drives the worker's REAL disconnect endpoint (the same one the browser hits) and polls to done.
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

async function main() {
  const principal = {
    orgId: await sql("select id from organizations limit 1;"),
    workspaceId: await sql("select id from workspaces limit 1;"),
    actorUserId: await sql("select id from auth_users limit 1;"),
    roleKeys: ["owner"],
  };

  console.log("1. Connecting %s with a throwaway key (exactly as the worker does)...", CATALOG_PROVIDER);
  await gateway(
    `node openclaw.mjs onboard --non-interactive --accept-risk --flow manual ` +
      `--auth-choice ${CATALOG_PROVIDER} --${CATALOG_PROVIDER}-api-key "${THROWAWAY_KEY}" --json`,
  );

  const created = await authProfiles();
  const createdIds = Object.keys(created);
  console.log("   connect created profiles: %s", JSON.stringify(createdIds));
  if (createdIds.length < 2) {
    console.error(
      "\nSETUP FAILED: expected the shared-profile connect to create >1 profile; got %s.\n" +
        "Without a shared profile set this drive cannot detect the bug.",
      JSON.stringify(createdIds),
    );
    process.exit(2);
  }

  console.log("2. Disconnecting %s through the REAL worker endpoint...", CATALOG_PROVIDER);
  const result = await workerDisconnect(principal, CATALOG_PROVIDER);
  console.log("   worker reported: %s", result.status);

  console.log("3. Checking the gateway for surviving credentials...");
  const surviving = await authProfiles();
  const survivingIds = Object.keys(surviving);

  const reportedSuccess = result.status === "disconnected";
  const leftCredential = survivingIds.length > 0;

  if (leftCredential) {
    console.error(
      "\nFAIL: disconnect reported %s but LEFT A LIVE CREDENTIAL in the gateway.\n" +
        "  surviving profiles: %s\n" +
        "  These hold the same key the operator just revoked, under a provider id the\n" +
        "  Connections UI does not list — invisible and unremovable from the UI.",
      reportedSuccess ? '"disconnected" (false success)' : `"${result.status}"`,
      JSON.stringify(surviving, null, 2),
    );
    process.exit(1);
  }

  if (!reportedSuccess) {
    console.error(
      '\nFAIL: no credential survived, but the disconnect reported "%s" instead of success.',
      result.status,
    );
    process.exit(1);
  }

  console.log("\nPASS: disconnect removed every profile the connect created (%s).", JSON.stringify(createdIds));
}

main().catch((error) => {
  console.error("\nDRIVE ERROR:", error.message);
  process.exit(2);
});
