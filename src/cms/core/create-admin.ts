import { nanoid } from "nanoid";

import { setUserCredential } from "./better-auth";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

export const createAdminUser = async (input: { name: string; email: string; password: string }) => {
  const db = await getDb();
  const schema = getSchema();
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    throw new Error("No users collection found.");
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const nowMs = new Date().getTime();

  await db.insert(tables.users.main).values({
    _id: id,
    name: input.name,
    email: input.email,
    role: "admin",
    emailVerified: true,
    createdAt: nowMs,
    updatedAt: nowMs,
    _createdAt: now,
    _updatedAt: now,
  });

  // Credentials live in the Better Auth cms_accounts table, hashed with Kide's pbkdf2 hasher.
  await setUserCredential(id, input.password);
};
