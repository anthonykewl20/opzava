import { auth } from "@opzava/identity-access/better-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = toNextJsHandler(auth);
