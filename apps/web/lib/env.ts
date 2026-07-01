import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  // DATABASE_MIGRATION_URL belongs to one-shot migration/test-admin jobs, not web runtime.
  DATABASE_MIGRATION_URL: z.preprocess(emptyToUndefined, z.string().url().optional())
});

export type AppEnv = z.infer<typeof appEnvSchema>;

function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseAppEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = appEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid app environment: ${formatEnvError(parsed.error)}`);
  }

  return parsed.data;
}

export const env = parseAppEnv(process.env);
