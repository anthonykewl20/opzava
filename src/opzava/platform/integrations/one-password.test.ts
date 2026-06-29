import { describe, expect, it } from "vitest";
import {
  createOnePassword,
  type OnePasswordDeps,
  type PullSecretOutcome,
} from "./one-password";

/**
 * NodeJS.ProcessEnv is augmented (Next) to require NODE_ENV; this builds a valid
 * minimal process env for the op-pull probes without NODE_ENV noise per call.
 */
const procEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  ...extra,
});

/**
 * Characterization of the 1Password pull domain — the `op item get` invocation +
 * secret parsing extracted from src/app/api/integrations/route.ts (handlePull +
 * handlePullAll, which previously duplicated this logic verbatim). Behind injected
 * execFile/env ports so the sad paths (issue #61 #10-14) have a direct test surface.
 *
 * SECURITY: the pulled cleartext value must never be logged here or in the module;
 * it flows only to envStore.setEnvVars (write) + redactValue (display). The outcome
 * carries the value on success; the route redacts before responding.
 */

interface FakeRec {
  /** What execFile returns (a Buffer/string-like). When undefined, execFile throws. */
  output: unknown;
  /** Throw this from execFile instead of returning (simulates op failure / timeout). */
  throws: unknown;
  /** Captured execFile invocation. */
  lastCall: { cmd: string; args: string[]; opts: Record<string, unknown> } | null;
  /** Captured opEnv passed to pullSecret (asserted in the invocation contract). */
  opEnv: NodeJS.ProcessEnv;
  env: Record<string, string | undefined>;
}

function makeDeps(over: Partial<FakeRec> = {}): {
  deps: OnePasswordDeps;
  rec: FakeRec;
} {
  const rec: FakeRec = {
    output: over.output ?? '{"value":"secret123"}',
    throws: over.throws ?? null,
    lastCall: null,
    opEnv: over.opEnv ?? procEnv({ OP_SERVICE_ACCOUNT_TOKEN: "tok" }),
    env: over.env ?? {},
  };
  const deps: OnePasswordDeps = {
    execFile: (cmd, args, opts) => {
      rec.lastCall = { cmd, args: [...args], opts: { ...opts } };
      if (rec.throws) throw rec.throws;
      return rec.output;
    },
    env: rec.env,
  };
  return { deps, rec };
}

const pull = (deps: OnePasswordDeps, vaultItem = "openclaw-anthropic-api-key") =>
  createOnePassword(deps).pullSecret(vaultItem, procEnv({ OP_SERVICE_ACCOUNT_TOKEN: "t" }));

// --- happy path -------------------------------------------------------------

describe("createOnePassword — pullSecret (happy)", () => {
  it("parses a JSON object with a value field", () => {
    const { deps } = makeDeps({ output: '{"value":"secret123"}' });
    expect(pull(deps)).toEqual({ ok: true, value: "secret123" });
  });

  it("parses a scalar JSON string (no value field → uses the scalar)", () => {
    // issue #13: scalar JSON. `"abc".value` is undefined → `undefined || "abc"` → "abc".
    const { deps } = makeDeps({ output: '"plaintext-secret"' });
    expect(pull(deps)).toEqual({ ok: true, value: "plaintext-secret" });
  });

  it("falls back to the raw string when op returns non-JSON", () => {
    // issue #13: invalid JSON → use the raw (trimmed) secret.
    const { deps } = makeDeps({ output: "not-json-at-all" });
    expect(pull(deps)).toEqual({ ok: true, value: "not-json-at-all" });
  });

  it("trims surrounding whitespace before parsing", () => {
    const { deps } = makeDeps({ output: '  {"value":"x"}  \n' });
    expect(pull(deps)).toEqual({ ok: true, value: "x" });
  });

  it("coerces a Buffer-like output via toString()", () => {
    // execFileSync returns a Buffer; .toString() must be applied before trim/parse.
    const { deps } = makeDeps({ output: { toString: () => '{"value":"buf"}' } } as {
      output: unknown;
    });
    expect(pull(deps)).toEqual({ ok: true, value: "buf" });
  });
});

// --- sad paths (issue #61 #10-14) -------------------------------------------

describe("createOnePassword — pullSecret (sad)", () => {
  it("rejects an empty secret with reason:empty (issue: empty value)", () => {
    const { deps } = makeDeps({ output: "" });
    expect(pull(deps)).toEqual<PullSecretOutcome>({ ok: false, reason: "empty" });
  });

  it("rejects whitespace-only as empty (it is trimmed first)", () => {
    const { deps } = makeDeps({ output: "   \n\t " });
    expect(pull(deps)).toEqual<PullSecretOutcome>({ ok: false, reason: "empty" });
  });

  it("treats an empty JSON string scalar as empty", () => {
    // `"x".trim()` then JSON.parse(`""`) → "" → empty.
    const { deps } = makeDeps({ output: '""' });
    expect(pull(deps)).toEqual<PullSecretOutcome>({ ok: false, reason: "empty" });
  });

  it("returns op-error + the message when execFile throws an Error (#11 unauth)", () => {
    const { deps } = makeDeps({ throws: new Error("not authenticated") });
    expect(pull(deps)).toEqual({
      ok: false,
      reason: "op-error",
      detail: "not authenticated",
    });
  });

  it("returns detail 'Failed' when execFile throws a non-Error value", () => {
    const { deps } = makeDeps({ throws: "string-throw" });
    expect(pull(deps)).toEqual({
      ok: false,
      reason: "op-error",
      detail: "Failed",
    });
  });

  it("returns the empty message verbatim when the Error has no message", () => {
    const { deps } = makeDeps({ throws: new Error() });
    const out = pull(deps);
    expect(out.ok).toBe(false);
    if (!out.ok && out.reason === "op-error") expect(out.detail).toBe("");
  });

  it("never throws — op failure is an outcome, not an exception (no 500 leak)", () => {
    const { deps } = makeDeps({ throws: new Error("boom") });
    expect(() => pull(deps)).not.toThrow();
  });
});

// --- vault resolution + invocation contract (#13/#14) -----------------------

describe("createOnePassword — pullSecret (invocation contract)", () => {
  it("uses OP_VAULT_NAME when set", () => {
    const { deps, rec } = makeDeps({ env: { OP_VAULT_NAME: "prod-vault" } });
    pull(deps);
    expect(rec.lastCall!.args).toContain("--vault");
    expect(rec.lastCall!.args).toContain("prod-vault");
  });

  it("falls back to the 'default' vault when OP_VAULT_NAME is unset (#14)", () => {
    const { deps, rec } = makeDeps({ env: {} });
    pull(deps);
    const vaultIdx = rec.lastCall!.args.indexOf("--vault");
    expect(rec.lastCall!.args[vaultIdx + 1]).toBe("default");
  });

  it("invokes op with the exact arg array + 15000ms timeout + piped stdio (#13 no-shell)", () => {
    const { deps, rec } = makeDeps({});
    pull(deps, "openclaw-github-token");
    expect(rec.lastCall).toEqual({
      cmd: "op",
      args: [
        "item",
        "get",
        "openclaw-github-token",
        "--vault",
        "default",
        "--fields",
        "password",
        "--format",
        "json",
      ],
      opts: {
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
        env: { NODE_ENV: "test", OP_SERVICE_ACCOUNT_TOKEN: "t" },
      },
    });
  });

  it("passes the opEnv through to the op process (token reaches op)", () => {
    const opEnv = procEnv({ OP_SERVICE_ACCOUNT_TOKEN: "svc-token" });
    const { deps, rec } = makeDeps({ opEnv });
    createOnePassword(deps).pullSecret("vault-item", opEnv);
    expect(rec.lastCall!.opts.env).toBe(opEnv);
  });
});
