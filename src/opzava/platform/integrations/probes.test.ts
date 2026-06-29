import { describe, expect, it } from "vitest";
import {
  createProbes,
  resolveOllamaBaseUrl,
  type ProbeDeps,
} from "./probes";

/**
 * Characterization of the integration probe domain — the command/daemon/CLI
 * presence + Ollama-reachability logic extracted verbatim from
 * src/app/api/integrations/route.ts. These probes shell out (which / op whoami)
 * and read the filesystem (~/.xint) + network (ollama /api/tags), so every port
 * is injected (createProbes) and driven here with fakes. The focus is sad paths:
 * every probe must degrade to a safe boolean (installed=false / reachable=false)
 * when the underlying exec/fs/fetch fails — never throw, never 500.
 */

// --- fake-ports harness -----------------------------------------------------

interface FakeRecorder {
  /** Every execFile invocation (cmd, args, opts) in call order. */
  execCalls: { cmd: string; args: string[]; opts: Record<string, unknown> }[];
  /** cmds that execFile should FAIL (throw) on, simulating not-found/timeout. */
  failFor: Set<string>;
  fetchCalls: { url: string }[];
  fetchResult: { ok: boolean; status: number } | "throw";
  existsPaths: Set<string>;
  /** When true, the exists port throws (simulating EACCES) — exercises degrade-to-false. */
  existsThrows: boolean;
  /** Every exists() invocation (path) in call order. */
  existsCalls: string[];
  clock: number;
  /** ProbeDeps.env test input. */
  env?: Record<string, string | undefined>;
  /** ProbeDeps.homeDir test input. */
  homeDir?: string;
}

/**
 * NodeJS.ProcessEnv is augmented (Next) to require NODE_ENV; this builds a valid
 * minimal process env for the op-auth probes without NODE_ENV noise per call.
 */
const procEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  ...extra,
});

function makeDeps(over: Partial<FakeRecorder> = {}): {
  deps: ProbeDeps;
  rec: FakeRecorder;
} {
  const rec: FakeRecorder = {
    execCalls: [],
    failFor: over.failFor ?? new Set(),
    fetchCalls: [],
    fetchResult: over.fetchResult ?? { ok: true, status: 200 },
    existsPaths: over.existsPaths ?? new Set(),
    existsThrows: over.existsThrows ?? false,
    existsCalls: [],
    clock: over.clock ?? 1_000,
  };
  const deps: ProbeDeps = {
    execFile: (cmd, args, opts) => {
      rec.execCalls.push({ cmd, args: [...args], opts: { ...opts } });
      // failFor names an UNAVAILABLE binary: a `which <bin>` probe fails when its
      // target is unavailable; a direct `<bin> ...` call (e.g. `op whoami`) too.
      const target = cmd === "which" ? args[0] : cmd;
      if (rec.failFor.has(target)) throw new Error(`${target} not found`);
    },
    fetch: async (url) => {
      rec.fetchCalls.push({ url: String(url) });
      if (rec.fetchResult === "throw") throw new Error("network down");
      const r = rec.fetchResult;
      return { ok: r.ok, status: r.status } as Response;
    },
    exists: (p) => {
      rec.existsCalls.push(p);
      if (rec.existsThrows) throw new Error("EACCES");
      return rec.existsPaths.has(p);
    },
    env: over.env ?? {},
    homeDir: () => over.homeDir ?? "/home/op",
    now: () => rec.clock,
  };
  return { deps, rec };
}

// --- resolveOllamaBaseUrl (pure) -------------------------------------------

describe("resolveOllamaBaseUrl — OLLAMA_HOST resolution", () => {
  it("defaults to the local daemon when OLLAMA_HOST is unset/blank", () => {
    expect(resolveOllamaBaseUrl({})).toBe("http://127.0.0.1:11434");
    expect(resolveOllamaBaseUrl({ OLLAMA_HOST: "   " })).toBe(
      "http://127.0.0.1:11434",
    );
  });

  it("prefixes http:// onto a bare host", () => {
    expect(resolveOllamaBaseUrl({ OLLAMA_HOST: "ollama.local:11434" })).toBe(
      "http://ollama.local:11434",
    );
  });

  it("keeps an explicit scheme unchanged", () => {
    expect(
      resolveOllamaBaseUrl({ OLLAMA_HOST: "https://ollama.example.com" }),
    ).toBe("https://ollama.example.com");
    expect(
      resolveOllamaBaseUrl({ OLLAMA_HOST: "http://host:1234/" }),
    ).toBe("http://host:1234/");
  });
});

// --- isCommandAvailable / isOpAvailable (exec port) ------------------------

describe("createProbes — isCommandAvailable / isOpAvailable", () => {
  it("returns true when `which <cmd>` exits 0", () => {
    const probes = createProbes(makeDeps().deps);
    expect(probes.isCommandAvailable("op")).toBe(true);
  });

  it("returns false (never throws) when execFile fails — not installed / timeout", () => {
    const { deps, rec } = makeDeps({ failFor: new Set(["op"]) });
    const probes = createProbes(deps);
    expect(probes.isCommandAvailable("op")).toBe(false);
    expect(probes.isOpAvailable()).toBe(false);
    // both probes shelled out (degradation is observed, not silent)
    expect(rec.execCalls.length).toBe(2);
    expect(rec.execCalls[0].args).toEqual(["op"]);
    expect(rec.execCalls[1].args).toEqual(["op"]);
  });

  it("invokes `which` with stdio pipe + a 3000ms timeout (invocation contract)", () => {
    const { deps, rec } = makeDeps();
    createProbes(deps).isCommandAvailable("gws");
    expect(rec.execCalls[0]).toMatchObject({
      cmd: "which",
      args: ["gws"],
      opts: { stdio: "pipe", timeout: 3000 },
    });
  });
});

// --- isOpAuthenticated (op whoami + env port) ------------------------------

describe("createProbes — isOpAuthenticated", () => {
  it("returns true when `op whoami --format json` exits 0", () => {
    const probes = createProbes(makeDeps().deps);
    expect(probes.isOpAuthenticated(procEnv({ OP_SERVICE_ACCOUNT_TOKEN: "t" }))).toBe(
      true,
    );
  });

  it("returns false (never throws) when op is unauthenticated / missing", () => {
    const { deps } = makeDeps({ failFor: new Set(["op"]) });
    expect(createProbes(deps).isOpAuthenticated()).toBe(false);
  });

  it("invokes op whoami with a 3000ms timeout + the explicit opEnv", () => {
    const { deps, rec } = makeDeps();
    const opEnv = procEnv({ OP_SERVICE_ACCOUNT_TOKEN: "secret" });
    createProbes(deps).isOpAuthenticated(opEnv);
    expect(rec.execCalls[0]).toMatchObject({
      cmd: "op",
      args: ["whoami", "--format", "json"],
      opts: { stdio: "pipe", timeout: 3000, env: opEnv },
    });
  });

  it("falls back to deps.env when no opEnv is supplied", () => {
    const { deps, rec } = makeDeps({ env: { OP_SERVICE_ACCOUNT_TOKEN: "p" } });
    createProbes(deps).isOpAuthenticated();
    expect(rec.execCalls[0].opts.env).toEqual({ OP_SERVICE_ACCOUNT_TOKEN: "p" });
  });
});

// --- snapshot shape + xint / ollama wiring ----------------------------------

describe("createProbes — snapshot shape + wiring", () => {
  it("probes all five fields on a cold call and returns the full shape", async () => {
    const { deps } = makeDeps({
      existsPaths: new Set([
        "/home/op/.xint/data/oauth-tokens.json",
        "/home/op/.xint/.env",
      ]),
    });
    const snap = await createProbes(deps).snapshot();
    expect(snap).toEqual({
      opAvailable: true,
      xint: { installed: true, oauthConfigured: true, envConfigured: true },
      ollamaInstalled: true,
      ollamaReachable: true,
      gwsInstalled: true,
    });
  });

  it("xint.installed tracks `which xint`; oauth/env track the ~/.xint files", async () => {
    // xint NOT installed, no files present
    const absent = await createProbes(
      makeDeps({ failFor: new Set(["xint"]) }).deps,
    ).snapshot();
    expect(absent.xint).toEqual({
      installed: false,
      oauthConfigured: false,
      envConfigured: false,
    });

    // xint installed but only the env file present
    const partial = await createProbes(
      makeDeps({
        existsPaths: new Set(["/home/op/.xint/.env"]),
      }).deps,
    ).snapshot();
    expect(partial.xint).toEqual({
      installed: true,
      oauthConfigured: false,
      envConfigured: true,
    });
  });

  it("exists() throwing degrades xint to false — never propagates (sad path)", async () => {
    // exists throws for both xint files (e.g. EACCES) -> degrade-to-false; the
    // defensive checkExists swallows it so the snapshot never 500s.
    const { deps } = makeDeps({
      existsThrows: true,
      existsPaths: new Set(["/home/op/.xint/data/oauth-tokens.json"]),
    });
    const snap = await createProbes(deps).snapshot();
    expect(snap.xint).toEqual({
      installed: true,
      oauthConfigured: false,
      envConfigured: false,
    });
  });

  it("ollamaReachable is true only when fetch resolves ok", async () => {
    const ok = await createProbes(
      makeDeps({ fetchResult: { ok: true, status: 200 } }).deps,
    ).snapshot();
    expect(ok.ollamaReachable).toBe(true);

    const httpErr = await createProbes(
      makeDeps({ fetchResult: { ok: false, status: 503 } }).deps,
    ).snapshot();
    expect(httpErr.ollamaReachable).toBe(false);
  });

  it("ollamaReachable degrades to false (never throws) on a network error", async () => {
    const snap = await createProbes(
      makeDeps({ fetchResult: "throw" }).deps,
    ).snapshot();
    expect(snap.ollamaReachable).toBe(false);
  });

  it("probes the resolved OLLAMA_HOST base url (trailing slash stripped)", async () => {
    const { deps, rec } = makeDeps({ env: { OLLAMA_HOST: "http://host:1234/" } });
    await createProbes(deps).snapshot();
    expect(rec.fetchCalls[0].url).toBe("http://host:1234/api/tags");
  });

  it("reflects absence across the board (nothing installed / reachable)", async () => {
    const { deps } = makeDeps({
      failFor: new Set(["which", "op", "xint", "ollama", "gws"]),
      fetchResult: "throw",
    });
    const snap = await createProbes(deps).snapshot();
    expect(snap).toEqual({
      opAvailable: false,
      xint: { installed: false, oauthConfigured: false, envConfigured: false },
      ollamaInstalled: false,
      ollamaReachable: false,
      gwsInstalled: false,
    });
  });
});

// --- snapshot cache (the load-bearing 5000ms TTL) --------------------------

describe("createProbes — snapshot 5000ms cache", () => {
  it("probes once on a cold call (4 `which` + 1 fetch + 2 exists)", async () => {
    const { deps, rec } = makeDeps({
      existsPaths: new Set([
        "/home/op/.xint/data/oauth-tokens.json",
        "/home/op/.xint/.env",
      ]),
    });
    await createProbes(deps).snapshot();
    const whichCalls = rec.execCalls.filter((c) => c.cmd === "which");
    expect(whichCalls.map((c) => c.args[0])).toEqual([
      "op",
      "xint",
      "ollama",
      "gws",
    ]);
    expect(rec.fetchCalls.length).toBe(1);
    expect(rec.existsCalls).toEqual([
      "/home/op/.xint/data/oauth-tokens.json",
      "/home/op/.xint/.env",
    ]);
  });

  it("serves a cached value within the TTL WITHOUT re-probing", async () => {
    const { deps, rec } = makeDeps(); // clock starts at 1000
    const probes = createProbes(deps);
    const first = await probes.snapshot();
    const firstCount = rec.execCalls.length;
    const firstFetch = rec.fetchCalls.length;

    rec.clock = 4_500; // +3500ms, still inside the 5000ms TTL
    const second = await probes.snapshot();

    expect(second).toEqual(first);
    expect(rec.execCalls.length).toBe(firstCount); // no re-probe
    expect(rec.fetchCalls.length).toBe(firstFetch);
  });

  it("re-probes after the TTL elapses", async () => {
    const { deps, rec } = makeDeps(); // clock starts at 1000
    const probes = createProbes(deps);
    await probes.snapshot();
    const before = rec.execCalls.length;

    rec.clock = 6_500; // +5500ms > TTL
    await probes.snapshot();

    expect(rec.execCalls.length).toBe(before + 4); // 4 fresh `which` probes
    expect(rec.fetchCalls.length).toBe(2);
  });

  it("re-probes at exactly the TTL boundary (elapsed == 5000 is a miss)", async () => {
    const { deps, rec } = makeDeps(); // clock starts at 1000
    const probes = createProbes(deps);
    await probes.snapshot();

    rec.clock = 6_000; // exactly +5000ms → `now - ts < 5000` is false → miss
    await probes.snapshot();

    expect(rec.fetchCalls.length).toBe(2); // re-probed
  });

  it("cache is per createProbes instance (fresh instance = fresh probe)", async () => {
    const a = makeDeps();
    const b = makeDeps();
    await createProbes(a.deps).snapshot();
    await createProbes(b.deps).snapshot(); // separate cache → b probes too
    expect(a.rec.fetchCalls.length).toBe(1);
    expect(b.rec.fetchCalls.length).toBe(1);
  });
});
