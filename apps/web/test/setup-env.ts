process.env["APP_URL"] ??= "http://web.opzava.localhost:18088";
process.env["BETTER_AUTH_URL"] ??= "http://web.opzava.localhost:18088";
process.env["BETTER_AUTH_SECRET"] ??= "local-test-better-auth-secret-32-chars";
// NODE_ENV is set to "test" by Vitest automatically; assigning it here fails
// typecheck because @types/node types process.env.NODE_ENV as read-only.
