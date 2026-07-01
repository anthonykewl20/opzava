import { db } from "@opzava/adapters";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { betterAuthSchema } from "../postgres/schema/auth.js";
import { hashPassword, verifyPassword } from "./password-hasher.js";

type RootDatabase = typeof db;

export interface BetterAuthConfigOptions {
  readonly database?: RootDatabase;
  readonly baseURL?: string;
  readonly secret?: string;
}

export function createBetterAuth(options: BetterAuthConfigOptions = {}) {
  const database = options.database ?? db;
  const baseURL = options.baseURL ?? process.env["BETTER_AUTH_URL"] ?? process.env["APP_URL"];
  const secret = options.secret ?? process.env["BETTER_AUTH_SECRET"];
  const trustedOrigins = baseURL === undefined ? [] : [baseURL];

  const authOptions = {
    appName: "Opzava",
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(secret === undefined ? {} : { secret }),
    trustedOrigins,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: betterAuthSchema
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: verifyPassword
      }
    },
    session: {
      modelName: "auth_sessions",
      storeSessionInDatabase: true,
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },
    advanced: {
      useSecureCookies: true,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/"
      },
      database: { generateId: "uuid" }
    },
    user: { modelName: "auth_users" },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" }
  };

  return betterAuth(authOptions as unknown as Parameters<typeof betterAuth>[0]);
}

export const auth = createBetterAuth();
