// The 1Password pull domain: the `op item get` invocation + secret parsing,
// extracted from src/app/api/integrations/route.ts behind injected ports.
//
// Engine-B purity: NO @/lib imports. The route supplies execFileSync and env.
// SECURITY: never log the pulled cleartext secret.

export interface OnePasswordDeps {
  execFile: (
    cmd: string,
    args: string[],
    opts: { timeout: number; stdio: string[]; env: NodeJS.ProcessEnv },
  ) => unknown;
  env: Record<string, string | undefined>;
}

export type PullSecretOutcome =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "op-error"; detail: string };

export function createOnePassword(deps: OnePasswordDeps): {
  pullSecret(vaultItem: string, opEnv: NodeJS.ProcessEnv): PullSecretOutcome;
} {
  function pullSecret(
    vaultItem: string,
    opEnv: NodeJS.ProcessEnv,
  ): PullSecretOutcome {
    try {
      const secret = String(
        deps.execFile(
          "op",
          [
            "item",
            "get",
            vaultItem,
            "--vault",
            deps.env.OP_VAULT_NAME || "default",
            "--fields",
            "password",
            "--format",
            "json",
          ],
          { timeout: 15000, stdio: ["pipe", "pipe", "pipe"], env: opEnv },
        ),
      ).trim();

      let value: string;
      try {
        const parsed = JSON.parse(secret);
        value = parsed.value || parsed;
      } catch {
        value = secret;
      }

      if (!value || value.length === 0) {
        return { ok: false, reason: "empty" };
      }

      return { ok: true, value };
    } catch (err) {
      return {
        ok: false,
        reason: "op-error",
        detail: err instanceof Error ? err.message : "Failed",
      };
    }
  }

  return { pullSecret };
}
