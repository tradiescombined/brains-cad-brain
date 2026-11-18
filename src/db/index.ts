import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/bcb.db";

const globalForDb = globalThis as unknown as { __bcbClient?: ReturnType<typeof createClient> };
const client = globalForDb.__bcbClient ?? createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
if (process.env.NODE_ENV !== "production") globalForDb.__bcbClient = client;

export const db = drizzle(client, { schema });
export { schema };
