import "dotenv/config";

import { pool } from "@opzava/adapters";
import { cleanupDoneConfirmations } from "@opzava/project-management";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

export async function cleanupDoneConfirmationsFromEnv(): Promise<void> {
  const result = await cleanupDoneConfirmations({
    orgId: requiredEnv("TASK_DONE_CONFIRMATION_ORG_ID"),
  });

  if (!result.ok) {
    throw result.error;
  }

  console.log(JSON.stringify({ deleted: result.value }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await cleanupDoneConfirmationsFromEnv();
  } finally {
    await pool.end();
  }
}
