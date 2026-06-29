import { describe, expect, it } from "vitest";
import {
  parseEnv,
  serializeEnv,
  redactValue,
  isVarBlocked,
  isPathLikeEnvVar,
  BLOCKED_VARS,
  BLOCKED_PREFIXES,
  createEnvReader,
} from "./env-read";

describe("parseEnv / serializeEnv — lossless .env round-trip", () => {
  it("classifies comment / blank / var lines", () => {
    const lines = parseEnv("# header\n\nKEY=value\n");
    expect(lines.map((l) => l.type)).toEqual([
      "comment",
      "blank",
      "var",
      "blank",
    ]);
    const v = lines.find((l) => l.type === "var")!;
    expect(v.key).toBe("KEY");
    expect(v.value).toBe("value");
  });

  it('preserves a malformed line (no "=") as a comment, raw kept', () => {
    const lines = parseEnv("NOEQUALSHERE");
    expect(lines[0].type).toBe("comment");
    expect(lines[0].raw).toBe("NOEQUALSHERE");
  });

  it("round-trips parse -> serialize -> parse preserving the var set", () => {
    const reparsed = parseEnv(
      serializeEnv(parseEnv("# comment\nKEY1=a\n\nKEY2=b\n")),
    );
    const vars = reparsed
      .filter((l) => l.type === "var")
      .map((l) => [l.key, l.value]);
    expect(vars).toEqual([
      ["KEY1", "a"],
      ["KEY2", "b"],
    ]);
  });
});

describe("redactValue — secret masking (SECURITY)", () => {
  it("fully masks values of length <= 4", () => {
    expect(redactValue("")).toBe("****");
    expect(redactValue("ab")).toBe("****");
    expect(redactValue("abcd")).toBe("****");
  });

  it("shows only the last 4 characters for longer values", () => {
    expect(redactValue("sk-abc-1234567890")).toBe("****7890");
    expect(redactValue("abcde")).toBe("****bcde");
  });

  it("never reveals more than the last 4 characters", () => {
    const secret = "sk-super-secret-api-key-XYZ";
    const redacted = redactValue(secret);
    expect(redacted).toBe("****" + secret.slice(-4));
    expect(redacted).not.toContain(secret.slice(0, -4));
  });
});

describe("isVarBlocked — write-blocked policy (SECURITY)", () => {
  it("blocks process-essential vars", () => {
    for (const k of [
      "PATH",
      "HOME",
      "USER",
      "SHELL",
      "LANG",
      "TERM",
      "PWD",
      "LOGNAME",
      "HOSTNAME",
    ]) {
      expect(isVarBlocked(k)).toBe(true);
    }
  });

  it("blocks dynamic-linker override prefixes", () => {
    expect(isVarBlocked("LD_LIBRARY_PATH")).toBe(true);
    expect(isVarBlocked("DYLD_INSERT_LIBRARIES")).toBe(true);
  });

  it("allows ordinary integration vars", () => {
    expect(isVarBlocked("ANTHROPIC_API_KEY")).toBe(false);
    expect(isVarBlocked("GITHUB_TOKEN")).toBe(false);
  });

  it("exposes the blocked set + prefixes for audit", () => {
    expect(BLOCKED_VARS.has("PATH")).toBe(true);
    expect(BLOCKED_PREFIXES).toContain("LD_");
  });
});

describe("isPathLikeEnvVar", () => {
  it("detects _PATH and _FILE suffixes", () => {
    expect(isPathLikeEnvVar("X_COOKIES_PATH")).toBe(true);
    expect(isPathLikeEnvVar("GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE")).toBe(
      true,
    );
    expect(isPathLikeEnvVar("ANTHROPIC_API_KEY")).toBe(false);
  });
});

describe("createEnvReader", () => {
  const reader = createEnvReader({
    processEnv: { PROC_TOKEN: "from-process", EMPTY: "" },
    exists: () => true,
  });

  describe("getEffectiveEnvValue — file-over-process precedence", () => {
    it("prefers a non-empty file value over process.env", () => {
      expect(
        reader.getEffectiveEnvValue(new Map([["K", "from-file"]]), "K"),
      ).toBe("from-file");
    });

    it("falls back to process.env when the file value is absent or empty", () => {
      expect(reader.getEffectiveEnvValue(new Map(), "PROC_TOKEN")).toBe(
        "from-process",
      );
      expect(
        reader.getEffectiveEnvValue(
          new Map([["PROC_TOKEN", ""]]),
          "PROC_TOKEN",
        ),
      ).toBe("from-process");
    });

    it("returns empty string when neither source has a value", () => {
      expect(reader.getEffectiveEnvValue(new Map(), "MISSING")).toBe("");
    });
  });

  describe("isConfiguredValue", () => {
    it("rejects empty values", () => {
      expect(reader.isConfiguredValue("ANY_KEY", "")).toBe(false);
    });

    it("treats non-path non-empty values as configured", () => {
      expect(reader.isConfiguredValue("ANTHROPIC_API_KEY", "sk-x")).toBe(true);
    });

    it("for path-like vars, requires the path to exist", () => {
      const present = createEnvReader({ processEnv: {}, exists: () => true });
      const absent = createEnvReader({ processEnv: {}, exists: () => false });
      expect(present.isConfiguredValue("X_COOKIES_PATH", "/etc/x")).toBe(true);
      expect(absent.isConfiguredValue("X_COOKIES_PATH", "/etc/x")).toBe(false);
    });

    it("swallows exists() throws as not-configured", () => {
      const throwing = createEnvReader({
        processEnv: {},
        exists: () => {
          throw new Error("perm");
        },
      });
      expect(throwing.isConfiguredValue("X_COOKIES_PATH", "/etc/x")).toBe(
        false,
      );
    });
  });
});
