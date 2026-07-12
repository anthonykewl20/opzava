import { createPostgresPool } from "@opzava/adapters";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const defaultMigrationUrl =
  "postgresql://opzava_owner:opzava_owner_local_only@localhost:15432/opzava";

let adminPool: ReturnType<typeof createPostgresPool> | undefined;

function migrationDatabaseUrl(): string {
  return process.env["DATABASE_MIGRATION_URL"] ?? defaultMigrationUrl;
}

function pool() {
  if (adminPool === undefined) {
    throw new Error("Admin database pool was not initialized.");
  }

  return adminPool;
}

async function resetFirstRun(): Promise<void> {
  await pool().query(
    "truncate table public.first_owner_setup, public.organizations, public.workspaces, public.auth_users restart identity cascade"
  );
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  adminPool = createPostgresPool(migrationDatabaseUrl());
  await resetFirstRun();
});

test.afterAll(async () => {
  if (adminPool !== undefined) {
    await resetFirstRun();
    await adminPool.end();
  }
});

test("setup wizard: step 1 validates, step 2 creates the workspace and opens the dashboard", async ({
  page
}) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Set up Opzava" })).toBeVisible();

  // Step 1: client validation mirrors the Zod schema and blocks advancing.
  await page.getByLabel("Your name", { exact: true }).fill("Ada Lovelace");
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Set up Opzava" })).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 12 characters.")).toBeVisible();

  // Fix the inputs and advance to step 2.
  const ownerEmail = `owner-${randomUUID()}@example.test`;
  await page.getByLabel("Email", { exact: true }).fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill("CorrectHorseBatteryStaple1");
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 2: workspace name + timezone via the shadcn/Radix Select.
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name", { exact: true }).fill("Opzava Internal");
  await page.locator("#timezone-trigger").click();
  await page.getByRole("option", { name: "Asia/Manila" }).click();
  await page.getByRole("button", { name: "Create workspace" }).click();

  // Submitting signs the owner in and opens the dashboard overview directly -
  // no separate confirmation step.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
});
