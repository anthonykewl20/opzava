import { describe, expect, it } from "vitest";
import { createEnvStore, type EnvStoreDeps } from "./env-store";

/**
 * Characterization of the .env store — the file IO + write-mutation domain
 * extracted from src/app/api/integrations/route.ts (PUT/DELETE/handlePull/handlePullAll).
 * The store owns readEnv + the security-sensitive write policy (blocked-var
 * enforcement + var-name validation) + an in-process mutex that serializes every
 * read-modify-write so concurrent writers cannot lose updates (issue #61 edge #8).
 *
 * Every port is injected (stateDir / readFile / writeFileAtomic) and driven here
 * with an in-memory file. The focus is sad paths: blocked vars are rejected
 * authoritatively (defense in depth), malformed names rejected, not-configured
 * detected, atomic-write failure leaves the prior file intact — and the load-bearing
 * concurrency tests prove two concurrent writers for different keys BOTH persist.
 */

interface StoreRec {
  stateDir: string | null;
  fileContent: string;
  readFileThrows: { code?: string } | null;
  writeFailingCount: number;
  /** When set, writeFileAtomic awaits this promise before resolving — used to keep
   *  a write in-flight so a second op can be queued behind it (concurrency tests). */
  writeBlocking: Promise<void> | null;
  reads: string[];
  writes: { path: string; content: string }[];
}

function makeStore(over: Partial<StoreRec> = {}) {
  const rec: StoreRec = {
    stateDir: over.stateDir === undefined ? "/state" : over.stateDir,
    fileContent: over.fileContent ?? "",
    readFileThrows: over.readFileThrows ?? null,
    writeFailingCount: over.writeFailingCount ?? 0,
    writeBlocking: over.writeBlocking ?? null,
    reads: [],
    writes: [],
  };
  const deps: EnvStoreDeps = {
    stateDir: rec.stateDir,
    readFile: async (p) => {
      rec.reads.push(p);
      if (rec.readFileThrows) {
        const e = new Error("read fail") as Error & { code?: string };
        if (rec.readFileThrows.code) e.code = rec.readFileThrows.code;
        throw e;
      }
      return rec.fileContent;
    },
    writeFileAtomic: async (p, c) => {
      rec.writes.push({ path: p, content: c });
      if (rec.writeBlocking) await rec.writeBlocking; // gate for concurrency tests
      if (rec.writeFailingCount > 0) {
        rec.writeFailingCount--; // fail only the next N writes, then succeed
        throw new Error("atomic write failed");
      }
      rec.fileContent = c; // the atomic rename commits to the in-memory file
    },
  };
  return { store: createEnvStore(deps), rec };
}

// --- envPath ----------------------------------------------------------------

describe("createEnvStore — envPath", () => {
  it("is null when the state dir is not configured", () => {
    expect(makeStore({ stateDir: null }).store.envPath()).toBeNull();
  });

  it("joins the state dir + .env when configured", () => {
    expect(makeStore({ stateDir: "/var/openclaw" }).store.envPath()).toBe(
      "/var/openclaw/.env",
    );
  });
});

// --- readEnv ----------------------------------------------------------------

describe("createEnvStore — readEnv", () => {
  it("returns null when the state dir is not configured", async () => {
    expect(await makeStore({ stateDir: null }).store.readEnv()).toBeNull();
  });

  it("treats a missing file (ENOENT) as empty, not an error", async () => {
    const { store } = makeStore({
      stateDir: "/s",
      readFileThrows: { code: "ENOENT" },
    });
    await expect(store.readEnv()).resolves.toEqual({ lines: [], raw: "" });
  });

  it("parses content losslessly (comments + blanks + vars preserved)", async () => {
    const { store } = makeStore({
      stateDir: "/s",
      fileContent: "# header\n\nKEY=value\n",
    });
    const snap = await store.readEnv();
    expect(snap).not.toBeNull();
    expect(snap!.lines.map((l) => l.type)).toEqual([
      "comment",
      "blank",
      "var",
      "blank",
    ]);
  });

  it("rethrows non-ENOENT read errors (perm / IO) — never silently empty", async () => {
    const { store } = makeStore({ stateDir: "/s", readFileThrows: {} });
    await expect(store.readEnv()).rejects.toThrow("read fail");
  });
});

// --- setEnvVars (happy) -----------------------------------------------------

describe("createEnvStore — setEnvVars (happy)", () => {
  it("appends a new var to a MISSING file (ENOENT) with no leading newline", async () => {
    // a brand-new .env (file absent → readEnv returns []) writes the first var
    // cleanly. This is the common new-install path.
    const { store, rec } = makeStore({ readFileThrows: { code: "ENOENT" } });
    const out = await store.setEnvVars({ KEY: "val" });
    expect(out).toEqual({ ok: true, affected: ["KEY"] });
    expect(rec.fileContent).toBe("KEY=val");
  });

  it("appends a new var to an existing empty file (the lone blank line is preserved)", async () => {
    // parseEnv("") → [{blank}]; that blank round-trips losslessly, so the appended
    // var follows a leading newline. Behavior-preserving vs the original route.
    const { store, rec } = makeStore({ fileContent: "" });
    const out = await store.setEnvVars({ KEY: "val" });
    expect(out).toEqual({ ok: true, affected: ["KEY"] });
    expect(rec.fileContent).toBe("\nKEY=val");
  });

  it("inserts a blank separator when the last line is not blank", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1" });
    await store.setEnvVars({ B: "2" });
    expect(rec.fileContent).toBe("A=1\n\nB=2");
  });

  it("does not double the separator when the file already ends in a blank", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1\n" });
    await store.setEnvVars({ B: "2" });
    expect(rec.fileContent).toBe("A=1\n\nB=2");
  });

  it("updates an existing var in place (no duplicate, no append)", async () => {
    const { store, rec } = makeStore({ fileContent: "KEY=old\nOTHER=x" });
    const out = await store.setEnvVars({ KEY: "new" });
    expect(out).toEqual({ ok: true, affected: ["KEY"] });
    expect(rec.fileContent).toBe("KEY=new\nOTHER=x");
  });

  it("sets multiple vars in one atomic write", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1" });
    const out = await store.setEnvVars({ B: "2", C: "3" });
    expect(out).toEqual({ ok: true, affected: ["B", "C"] });
    expect(rec.writes.length).toBe(1); // one read-modify-write
    expect(rec.fileContent).toContain("A=1");
    expect(rec.fileContent).toContain("B=2");
    expect(rec.fileContent).toContain("C=3");
  });

  it("coerces values with String() (number -> string) and preserves empty", async () => {
    const { store, rec } = makeStore();
    await store.setEnvVars({ N: 5 as unknown as string, E: "" });
    expect(rec.fileContent).toContain("N=5");
    expect(rec.fileContent).toContain("E=");
  });
});

// --- setEnvVars (sad) -------------------------------------------------------

describe("createEnvStore — setEnvVars (sad / security)", () => {
  it("rejects a blocked var (process-essential) with NO read or write", async () => {
    const { store, rec } = makeStore();
    const out = await store.setEnvVars({ PATH: "/evil" });
    expect(out).toEqual({ ok: false, reason: "blocked", key: "PATH" });
    expect(rec.reads.length).toBe(0); // validated before any IO
    expect(rec.writes.length).toBe(0);
  });

  it("rejects a dynamic-linker prefix var (LD_*)", async () => {
    const { store, rec } = makeStore();
    const out = await store.setEnvVars({ LD_LIBRARY_PATH: "x" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("blocked");
    expect(rec.writes.length).toBe(0);
  });

  it("rejects an invalid var name (does not match ^[A-Z_][A-Z0-9_]*$)", async () => {
    const { store, rec } = makeStore();
    const out = await store.setEnvVars({ "bad-name": "x" } as Record<
      string,
      unknown
    >);
    expect(out).toEqual({ ok: false, reason: "invalid-name", key: "bad-name" });
    expect(rec.writes.length).toBe(0);
  });

  it("reports not-configured when the state dir is unset (validation passes first)", async () => {
    const { store } = makeStore({ stateDir: null });
    const out = await store.setEnvVars({ KEY: "v" });
    expect(out).toEqual({ ok: false, reason: "not-configured" });
  });

  it("blocked-var rejection takes precedence over not-configured", async () => {
    // validation runs before the read, so a blocked var is reported even when the
    // state dir is unset (matches the original PUT, which validated before IO).
    const { store, rec } = makeStore({ stateDir: null });
    const out = await store.setEnvVars({ PATH: "x" });
    expect(out).toEqual({ ok: false, reason: "blocked", key: "PATH" });
    expect(rec.reads.length).toBe(0);
  });

  it("rejects the batch if ANY var is blocked (no partial write)", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1" });
    const out = await store.setEnvVars({ B: "2", PATH: "x" });
    expect(out.ok).toBe(false);
    expect(rec.writes.length).toBe(0);
    expect(rec.fileContent).toBe("A=1"); // untouched
  });
});

// --- deleteEnvVars ----------------------------------------------------------

describe("createEnvStore — deleteEnvVars", () => {
  it("removes matching vars and preserves the rest", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1\nB=2\nC=3" });
    const out = await store.deleteEnvVars(["B"]);
    expect(out).toEqual({ ok: true, affected: ["B"] });
    expect(rec.fileContent).toBe("A=1\nC=3");
  });

  it("removes multiple vars in one write", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1\nB=2\nC=3" });
    const out = await store.deleteEnvVars(["A", "C"]);
    expect(out).toEqual({ ok: true, affected: ["A", "C"] });
    expect(rec.fileContent).toBe("B=2");
  });

  it("is a no-op (no write) when none of the keys are present", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1" });
    const out = await store.deleteEnvVars(["MISSING"]);
    expect(out).toEqual({ ok: true, affected: [] });
    expect(rec.writes.length).toBe(0);
  });

  it("rejects a blocked var with no write", async () => {
    const { store, rec } = makeStore({ fileContent: "PATH=/x" });
    const out = await store.deleteEnvVars(["PATH"]);
    expect(out).toEqual({ ok: false, reason: "blocked", key: "PATH" });
    expect(rec.writes.length).toBe(0);
  });

  it("reports not-configured when the state dir is unset", async () => {
    const { store } = makeStore({ stateDir: null });
    expect(await store.deleteEnvVars(["A"])).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });
});

// --- write serialization (the mutex — load-bearing) -------------------------

describe("createEnvStore — write mutex (concurrency, issue #61 edge #8)", () => {
  it("concurrent setEnvVars for DIFFERENT keys both persist (no lost update)", async () => {
    // Without serialization, both read the empty file, each writes only its own
    // key, and the second atomic-rename clobbers the first → one key is LOST.
    // The mutex serializes the read-modify-writes so both survive.
    const { store, rec } = makeStore({ fileContent: "" });
    await Promise.all([
      store.setEnvVars({ A: "1" }),
      store.setEnvVars({ B: "2" }),
    ]);
    expect(rec.fileContent).toContain("A=1");
    expect(rec.fileContent).toContain("B=2");
  });

  it("serializes: the second writer reads the first writer's result", async () => {
    const { store, rec } = makeStore({ fileContent: "" });
    await Promise.all([
      store.setEnvVars({ A: "1" }),
      store.setEnvVars({ B: "2" }),
    ]);
    // two writes, in order; the SECOND write's content includes the first's key
    // (proof it read AFTER the first committed, not interleaved).
    expect(rec.writes.length).toBe(2);
    expect(rec.writes[0].content).toContain("A=1");
    expect(rec.writes[0].content).not.toContain("B=2");
    expect(rec.writes[1].content).toContain("A=1");
    expect(rec.writes[1].content).toContain("B=2");
  });

  it("concurrent setEnvVars for the SAME key is deterministic last-writer-wins", async () => {
    const { store, rec } = makeStore({ fileContent: "" });
    await Promise.all([
      store.setEnvVars({ K: "first" }),
      store.setEnvVars({ K: "second" }),
    ]);
    // serialized → exactly one KEY line, holding the second writer's value
    const keyLines = rec.fileContent.split("\n").filter((l) => l.startsWith("K="));
    expect(keyLines.length).toBe(1);
    expect(keyLines[0]).toBe("K=second");
  });

  it("a failed write does not break the mutex — a later write still succeeds", async () => {
    const { store, rec } = makeStore({ fileContent: "X=0", writeFailingCount: 1 });
    // first write fails (atomic-write error) → setEnvVars rejects, file untouched
    await expect(store.setEnvVars({ A: "1" })).rejects.toThrow("atomic write");
    expect(rec.fileContent).toBe("X=0");
    // the mutex chain survives that rejection so the next op is not deadlocked;
    // writeFailingCount is now 0, so the second write commits.
    const out = await store.setEnvVars({ B: "2" });
    expect(out).toEqual({ ok: true, affected: ["B"] });
    expect(rec.fileContent).toContain("X=0"); // prior content intact
    expect(rec.fileContent).toContain("B=2"); // second write landed
  });

  it("a failed write does not deadlock a CONCURRENT writer (the real mutex hazard)", async () => {
    // The sequential test above cannot catch a regression in how the chain survives
    // a rejection under contention. This queues op2 WHILE op1's failing write is still
    // in-flight (the actual deadlock window), then releases op1 to reject.
    const { store, rec } = makeStore({ fileContent: "X=0", writeFailingCount: 1 });
    let release!: () => void;
    rec.writeBlocking = new Promise<void>((r) => {
      release = r;
    });

    const op1 = store.setEnvVars({ A: "1" }); // acquires the mutex; blocks on the write
    const op2 = store.setEnvVars({ B: "2" }); // queued behind op1 (must not run yet)

    release(); // op1's write resolves → rejects (writeFailingCount was 1) → frees the mutex
    await expect(op1).rejects.toThrow("atomic write");

    const out = await op2; // op2 runs now — the chain survived op1's rejection
    expect(out).toEqual({ ok: true, affected: ["B"] });
    expect(rec.fileContent).toContain("B=2");
  });

  it("an atomic-write failure leaves the prior file intact", async () => {
    const { store, rec } = makeStore({ fileContent: "A=1", writeFailingCount: 1 });
    await expect(store.setEnvVars({ B: "2" })).rejects.toThrow("atomic write");
    expect(rec.fileContent).toBe("A=1"); // B was never committed
  });
});
