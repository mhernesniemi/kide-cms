import { nanoid } from "nanoid";

import { hashPassword } from "./auth";
import { AUTH_USERS_COLLECTION, setCredentialPassword } from "./auth-engine";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

export const createAdminUser = async (input: { name: string; email: string; password: string }) => {
  const db = await getDb();
  const schema = getSchema();
  const tables = schema.cmsTables as Record<string, { main: any }>;
  const users = tables[AUTH_USERS_COLLECTION]?.main;

  if (!users) {
    throw new Error("No users collection found.");
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(input.password);

  await db.insert(users).values({
    _id: id,
    name: input.name,
    email: input.email.trim().toLowerCase(),
    role: "admin",
    _createdAt: now,
    _updatedAt: now,
    ...(users._authEmailVerified ? { _authEmailVerified: true } : {}),
  });
  await setCredentialPassword(id, hashedPassword);
};
