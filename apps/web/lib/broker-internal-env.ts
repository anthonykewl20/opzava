import { z } from "zod";

export const brokerInternalEnvSchema = z.object({
  BROKER_INTERNAL_URL: z.string().url(),
  BROKER_INTERNAL_TOKEN: z.string().min(32)
});

export type BrokerInternalEnv = z.infer<typeof brokerInternalEnvSchema>;

function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function readBrokerInternalEnv(
  source: NodeJS.ProcessEnv = process.env
): BrokerInternalEnv {
  const parsed = brokerInternalEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid broker internal environment: ${formatEnvError(parsed.error)}`);
  }

  return parsed.data;
}
