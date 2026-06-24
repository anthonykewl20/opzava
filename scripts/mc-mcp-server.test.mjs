/*
 Hermetic test for the Opzava MCP server (scripts/mc-mcp-server.cjs).
 Asserts the Engine B (canonical opzava workflow engine, /api/ops/*) MCP tools
 exist with the correct shape, without touching a live server.

 Run: node --test scripts/mc-mcp-server.test.mjs
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The server module guards main() behind require.main === module, so requiring
// it here does NOT start the stdio loop — it only exposes the TOOLS export.
const mod = require('./mc-mcp-server.cjs');
const TOOLS = mod.TOOLS;

const byName = new Map(TOOLS.map((t) => [t.name, t]));

test('Engine B ops tools are registered and target /api/ops/*', () => {
  // mc_ops_list_runs -> GET /api/ops/runs
  const listRuns = byName.get('mc_ops_list_runs');
  assert.ok(listRuns, 'mc_ops_list_runs must exist');
  assert.equal(typeof listRuns.handler, 'function');
  assert.equal(listRuns.inputSchema.type, 'object');

  // mc_ops_list_artifacts -> GET /api/ops/artifacts
  const listArtifacts = byName.get('mc_ops_list_artifacts');
  assert.ok(listArtifacts, 'mc_ops_list_artifacts must exist');
  assert.equal(typeof listArtifacts.handler, 'function');

  // mc_ops_list_approvals -> GET /api/ops/approvals
  const listApprovals = byName.get('mc_ops_list_approvals');
  assert.ok(listApprovals, 'mc_ops_list_approvals must exist');
  assert.equal(typeof listApprovals.handler, 'function');

  // mc_ops_get_run -> GET /api/ops/runs/:id
  const getRun = byName.get('mc_ops_get_run');
  assert.ok(getRun, 'mc_ops_get_run must exist');
  assert.equal(typeof getRun.handler, 'function');
  assert.deepEqual(getRun.inputSchema.required, ['id']);

  // mc_ops_decide_approval -> POST /api/ops/approvals/:id/decide
  const decideApproval = byName.get('mc_ops_decide_approval');
  assert.ok(decideApproval, 'mc_ops_decide_approval must exist');
  assert.equal(typeof decideApproval.handler, 'function');
  assert.deepEqual(decideApproval.inputSchema.required, ['id', 'decision']);
});

test('mc_ops_decide_approval handler resolves to a POST against /api/ops/approvals/:id/decide', async () => {
  const decideApproval = byName.get('mc_ops_decide_approval');
  // Intercept the module's api() by stubbing global fetch — the handler must
  // issue a POST to the Engine B decide route with the decision body.
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method, body: opts?.body });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  // loadConfig() reads env/profile; point it away from real profile I/O.
  process.env.MC_URL = 'http://127.0.0.1:3000';
  process.env.MC_API_KEY = '';
  process.env.MC_COOKIE = '';
  try {
    await decideApproval.handler({ id: 'apv_123', decision: 'approved', decisionReason: 'ok' });
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(calls.length, 1, 'handler must call fetch exactly once');
  assert.match(calls[0].url, /\/api\/ops\/approvals\/apv_123\/decide$/);
  assert.equal(calls[0].method, 'POST');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.decision, 'approved');
  assert.equal(body.decisionReason, 'ok');
});

test('mc_ops_get_run handler resolves to a GET against /api/ops/runs/:id', async () => {
  const getRun = byName.get('mc_ops_get_run');
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return new Response(JSON.stringify({ run: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  process.env.MC_URL = 'http://127.0.0.1:3000';
  process.env.MC_API_KEY = '';
  process.env.MC_COOKIE = '';
  try {
    await getRun.handler({ id: 'wf_abc 1' });
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(calls.length, 1, 'handler must call fetch exactly once');
  assert.match(calls[0].url, /\/api\/ops\/runs\/wf_abc%201$/);
  assert.equal(calls[0].method, 'GET');
});

test('Engine A v1 run tools are preserved (additive change, no regression)', () => {
  // Existing tools that proxy to /api/v1/runs must remain untouched.
  assert.ok(byName.get('mc_list_runs'), 'mc_list_runs (Engine A) must remain');
  assert.ok(byName.get('mc_get_run'), 'mc_get_run (Engine A) must remain');
  assert.ok(byName.get('mc_create_run'), 'mc_create_run (Engine A) must remain');
});

test('serverInfo.name stays opzava (brand)', () => {
  const src = fs.readFileSync(new URL('./mc-mcp-server.cjs', import.meta.url), 'utf8');
  assert.ok(/name:\s*'opzava'/.test(src), "serverInfo.name must be 'opzava'");
});
