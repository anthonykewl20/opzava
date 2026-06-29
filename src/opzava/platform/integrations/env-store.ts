// The .env store: file IO + the SECURITY-SENSITIVE write-mutation domain,
// extracted from src/app/api/integrations/route.ts (PUT/DELETE/handlePull/handlePullAll).
// Owns readEnv + the blocked-var / var-name enforcement (the single write gate) +
// an in-process mutex that serializes every read-modify-write so concurrent writers
// cannot lose updates (issue #61 edge #8 — two admins editing different keys no longer
// clobber each other).
//
// Engine-B purity: NO @/lib imports. The state dir, the fs read, and the atomic-write
// enter as injected ports via createEnvStore; the route constructs the store with the
// real config.openclawStateDir / readFile / writeFileAtomic. Enforced (caveat: only by
// code review today — see MODULE.md) by the platform layering contract.

import { join } from "path";
import {
  parseEnv,
  serializeEnv,
  isVarBlocked,
  type EnvLine,
} from "./env-read";

export interface EnvSnapshot {
  lines: EnvLine[];
  raw: string;
}

/**
 * The result of a write operation. The route maps each non-ok reason to its HTTP
 * status: blocked → 403, invalid-name → 400, not-configured → 404. `affected` is
 * the set of keys actually changed (set: appended/updated; delete: removed).
 */
export type EnvWriteOutcome =
  | { ok: true; affected: string[] }
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "blocked"; key: string }
  | { ok: false; reason: "invalid-name"; key: string };

export interface EnvStoreDeps {
  /** config.openclawStateDir — null when the OpenClaw state dir is unset. */
  stateDir: string | null;
  /** fs/promises readFile (utf-8) — injected so the read is testable. */
  readFile: (path: string) => Promise<string>;
  /** @/lib/atomic-write writeFileAtomic (atomic rename) — injected so the write is testable. */
  writeFileAtomic: (path: string, content: string) => Promise<void>;
}

/** The var-name rule enforced on SET (DELETE only enforces the blocked policy). */
const VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/i;

/** Resolve the .env path — null when the state dir is unset (route maps to 404). */
function resolveEnvPath(stateDir: string | null): string | null {
  return stateDir ? join(stateDir, ".env") : null;
}

export function createEnvStore(deps: EnvStoreDeps) {
  // In-process mutex: a promise chain that serializes the read-modify-write so two
  // concurrent writers cannot interleave a stale read with a later atomic rename.
  // Process-lifetime — matches the single-instance standalone deployment. A failed
  // write is swallowed IN THE CHAIN (not to the caller — the caller still sees the
  // rejection) so one bad operation cannot deadlock the next.
  let chain: Promise<unknown> = Promise.resolve();
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const envPath = (): string | null => resolveEnvPath(deps.stateDir);

  const readEnv = async (): Promise<EnvSnapshot | null> => {
    // Consistency with in-flight writers relies on writeFileAtomic's POSIX-rename
    // atomicity — a reader never observes a partial .env. Do NOT swap writeFileAtomic
    // for a non-atomic write (e.g. bare fs.writeFile) without revisiting this.
    const p = resolveEnvPath(deps.stateDir);
    if (!p) return null;
    try {
      const raw = await deps.readFile(p);
      return { lines: parseEnv(raw), raw };
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        return { lines: [], raw: "" };
      }
      throw err;
    }
  };

  /** Validate vars for SET: first blocked/invalid-name outcome, or null if all valid. */
  const validateVars = (
    vars: Record<string, unknown>,
  ): Extract<EnvWriteOutcome, { ok: false }> | null => {
    for (const key of Object.keys(vars)) {
      if (isVarBlocked(key)) return { ok: false, reason: "blocked", key };
      if (!VAR_NAME_RE.test(key))
        return { ok: false, reason: "invalid-name", key };
    }
    return null;
  };

  const setEnvVars = (
    vars: Record<string, unknown>,
  ): Promise<EnvWriteOutcome> =>
    serialized(async () => {
      // Validate BEFORE any IO: blocked/invalid names are rejected without reading
      // or writing the file (matches the original PUT, which validated up front).
      const invalid = validateVars(vars);
      if (invalid) return invalid;

      const snap = await readEnv();
      if (!snap) return { ok: false, reason: "not-configured" };

      const lines = snap.lines;
      const affected: string[] = [];
      for (const [key, value] of Object.entries(vars)) {
        const strValue = String(value);
        const existing = lines.find((l) => l.type === "var" && l.key === key);
        if (existing) {
          existing.value = strValue;
        } else {
          // Keep a blank separator before an appended var when the file doesn't
          // already end in one (matches the original append formatting).
          if (lines.length > 0 && lines[lines.length - 1].type !== "blank") {
            lines.push({ type: "blank", raw: "" });
          }
          lines.push({
            type: "var",
            raw: `${key}=${strValue}`,
            key,
            value: strValue,
          });
        }
        affected.push(key);
      }

      const p = resolveEnvPath(deps.stateDir)!; // non-null: snap non-null ⇒ stateDir set
      await deps.writeFileAtomic(p, serializeEnv(lines));
      return { ok: true, affected };
    });

  const deleteEnvVars = (keys: string[]): Promise<EnvWriteOutcome> =>
    serialized(async () => {
      for (const key of keys) {
        if (isVarBlocked(key)) return { ok: false, reason: "blocked", key };
      }

      const snap = await readEnv();
      if (!snap) return { ok: false, reason: "not-configured" };

      const removeSet = new Set(keys);
      const affected: string[] = [];
      const newLines = snap.lines.filter((l) => {
        if (l.type === "var" && l.key && removeSet.has(l.key)) {
          affected.push(l.key);
          return false;
        }
        return true;
      });

      // No write when nothing matched (matches the original DELETE no-op).
      if (affected.length > 0) {
        const p = resolveEnvPath(deps.stateDir)!;
        await deps.writeFileAtomic(p, serializeEnv(newLines));
      }
      return { ok: true, affected };
    });

  return { envPath, readEnv, setEnvVars, deleteEnvVars };
}
