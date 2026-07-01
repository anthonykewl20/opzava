process.env["APP_URL"] ??= "http://web.opzava.localhost:18088";
// NODE_ENV is set to "test" by Vitest automatically; assigning it here fails
// typecheck because @types/node types process.env.NODE_ENV as read-only.
