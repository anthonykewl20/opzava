import { S3ObjectStoreAdapter } from "@opzava/adapters";
import type { ObjectStorePort } from "@opzava/ports";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const objectStoreEnvSchema = z.object({
  OBJECT_STORE_BUCKET: z.string().trim().min(1),
  OBJECT_STORE_REGION: z.string().trim().min(1).default("us-east-1"),
  OBJECT_STORE_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OBJECT_STORE_ACCESS_KEY_ID: z.string().trim().min(1),
  OBJECT_STORE_SECRET_ACCESS_KEY: z.string().trim().min(1),
});

export type ObjectStoreEnv = z.infer<typeof objectStoreEnvSchema>;

let objectStorePort: ObjectStorePort | null = null;

function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function readObjectStoreEnv(source: NodeJS.ProcessEnv = process.env): ObjectStoreEnv {
  const parsed = objectStoreEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid object store environment: ${formatEnvError(parsed.error)}`);
  }

  return parsed.data;
}

export function createObjectStorePort(env: ObjectStoreEnv): ObjectStorePort {
  return new S3ObjectStoreAdapter({
    bucket: env.OBJECT_STORE_BUCKET,
    region: env.OBJECT_STORE_REGION,
    ...(env.OBJECT_STORE_ENDPOINT === undefined ? {} : { endpoint: env.OBJECT_STORE_ENDPOINT }),
    accessKeyId: env.OBJECT_STORE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORE_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  });
}

export function getObjectStorePort(): ObjectStorePort {
  objectStorePort ??= createObjectStorePort(readObjectStoreEnv());
  return objectStorePort;
}
