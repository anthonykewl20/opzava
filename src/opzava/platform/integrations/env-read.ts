// Pure .env parsing + the SECURITY-SENSITIVE redaction / blocked-var /
// effective-value / configured-check logic. Extracted VERBATIM from
// src/app/api/integrations/route.ts so the rules that prevent secret leakage in
// API responses (and the blocked-var write policy) have a direct test surface and
// a single owner, instead of living untested inside a 1017-line HTTP boundary.
//
// Engine-B purity: NO @/lib imports. `process.env` and the filesystem
// (`existsSync`) enter as injected ports via createEnvReader, so the logic is
// deterministic and testable with fakes.

export interface EnvLine {
  type: "comment" | "blank" | "var";
  raw: string;
  key?: string;
  value?: string;
}

// Vars that must never be written via the integrations API (security: these are
// process/runtime-essential and must not be clobbered by an operator edit).
export const BLOCKED_VARS = new Set<string>([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "PWD",
  "LOGNAME",
  "HOSTNAME",
]);
export const BLOCKED_PREFIXES = ["LD_", "DYLD_"];

/**
 * Parse .env content into ordered lines, preserving comments, blanks, and
 * ordering (so a round-trip parse -> serialize is lossless for the file shape).
 * A malformed non-blank/non-comment line with no `=` is preserved as a comment
 * (raw kept) so it is never silently dropped.
 */
export function parseEnv(content: string): EnvLine[] {
  const lines: EnvLine[] = [];
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      lines.push({ type: "blank", raw });
    } else if (trimmed.startsWith("#")) {
      lines.push({ type: "comment", raw });
    } else {
      const eqIdx = raw.indexOf("=");
      if (eqIdx > 0) {
        const key = raw.slice(0, eqIdx).trim();
        const value = raw.slice(eqIdx + 1).trim();
        lines.push({ type: "var", raw, key, value });
      } else {
        lines.push({ type: "comment", raw }); // malformed line preserved as-is
      }
    }
  }
  return lines;
}

/** Serialize parsed lines back to .env text (inverse of parseEnv). */
export function serializeEnv(lines: EnvLine[]): string {
  return lines
    .map((l) => {
      if (l.type === "var") return `${l.key}=${l.value}`;
      return l.raw;
    })
    .join("\n");
}

/**
 * Redact a secret value for API display: values of length <= 4 are fully masked;
 * longer values show only the last 4 characters. SECURITY: never weaken this
 * (e.g. showing more characters) without a deliberate decision — API responses
 * surface redacted values to the operator UI.
 */
export function redactValue(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

/** A var is blocked from being written via this API if it is process-essential
 *  or a dynamic-linker override (the LD_ and DYLD_ prefixes). */
export function isVarBlocked(key: string): boolean {
  if (BLOCKED_VARS.has(key)) return true;
  return BLOCKED_PREFIXES.some((p) => key.startsWith(p));
}

/** Path-like env vars (file-backed credentials). */
export function isPathLikeEnvVar(key: string): boolean {
  return key.endsWith("_PATH") || key.endsWith("_FILE");
}

export interface EnvReaderDeps {
  /** The live process environment (injected so logic is testable). Typed as a
   *  string-keyed map so both `process.env` and test fakes are acceptable. */
  processEnv: Record<string, string | undefined>;
  /** existsSync (injected so the path-presence check is testable). */
  exists: (path: string) => boolean;
}

/**
 * The effective-value + configured-check logic, closed over the injected
 * `processEnv` and `exists` ports. `getEffectiveEnvValue` resolves a var's
 * effective value (file overrides process; empty/absent => ''); the route calls
 * this with the parsed .env map + the live process.env.
 */
export function createEnvReader(deps: EnvReaderDeps) {
  const getEffectiveEnvValue = (
    envMap: Map<string, string>,
    key: string,
  ): string => {
    const fromFile = envMap.get(key);
    if (typeof fromFile === "string" && fromFile.length > 0) return fromFile;
    const fromProcess = deps.processEnv[key];
    if (typeof fromProcess === "string" && fromProcess.length > 0)
      return fromProcess;
    return "";
  };

  const isConfiguredValue = (key: string, value: string): boolean => {
    if (!value || value.length === 0) return false;
    if (isPathLikeEnvVar(key)) {
      try {
        return deps.exists(value);
      } catch {
        return false;
      }
    }
    return true;
  };

  return { getEffectiveEnvValue, isConfiguredValue };
}
