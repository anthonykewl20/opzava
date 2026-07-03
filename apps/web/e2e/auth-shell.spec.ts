import { createPostgresPool } from "@opzava/adapters";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const defaultMigrationUrl =
  "postgresql://opzava_owner:opzava_owner_local_only@localhost:15432/opzava";
const ownerEmail = `owner-${randomUUID()}@example.test`;
const ownerPassword = "CorrectHorseBatteryStaple1";
const ownerName = "Ada Lovelace";
const workspaceName = "Opzava Internal";

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

async function resetIdentityData(): Promise<void> {
  await pool().query("delete from public.assistant_tool_outcomes");
  await pool().query("delete from public.assistant_turns");
  await pool().query("delete from public.assistant_conversations");
  await pool().query("delete from public.tasks");
  await pool().query("delete from public.first_owner_setup");
  await pool().query("delete from public.role_grants");
  await pool().query("delete from public.memberships");
  await pool().query("delete from public.workspaces");
  await pool().query("delete from public.organizations");
  await pool().query("delete from public.auth_sessions");
  await pool().query("delete from public.auth_accounts");
  await pool().query("delete from public.auth_users");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  adminPool = createPostgresPool(migrationDatabaseUrl());
  await resetIdentityData();
});

test.afterAll(async () => {
  if (adminPool !== undefined) {
    await resetIdentityData();
    await adminPool.end();
  }
});

test("first owner setup signs in, shell resolves tenant context, signout revokes, and login restores access", async ({
  page
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Set up Opzava" })).toBeVisible();

  await page.getByLabel("Your name", { exact: true }).fill(ownerName);
  await page.getByLabel("Email", { exact: true }).fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Workspace name", { exact: true }).fill(workspaceName);
  await page.getByLabel("Timezone", { exact: true }).selectOption("Asia/Manila");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
  await expect(page.locator('[aria-label="Active organization and workspace"]')).toContainText(
    workspaceName
  );
  await expect(page.getByText(ownerName)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signout$/);
  await expect(page.getByRole("heading", { name: "You have signed out" })).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
  await expect(page.locator('[aria-label="Active organization and workspace"]')).toContainText(
    workspaceName
  );

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  const taskTitle = `Persisted task ${randomUUID()}`;
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title", { exact: true }).fill(taskTitle);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Created by the slice 1e board e2e.");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByLabel("Assignee", { exact: true }).selectOption("me");
  await page.getByLabel("Labels", { exact: true }).fill("e2e, slice1e");
  await page.getByRole("button", { name: "Create task" }).click();

  await expect(page.getByRole("article", { name: `Task: ${taskTitle}` })).toBeVisible();
  await page.getByRole("button", { name: `Move ${taskTitle} to Done` }).click();
  await expect(page.locator('section[aria-labelledby="tasks-col-done"]')).toContainText(taskTitle);

  await page.reload();
  await expect(page.locator('section[aria-labelledby="tasks-col-done"]')).toContainText(taskTitle);
});
