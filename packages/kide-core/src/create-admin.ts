import { nanoid } from "nanoid";

import { hashPassword } from "./auth";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

export const createAdminUser = async (input: { name: string; email: string; password: string }) => {
  const db = await getDb();
  const schema = getSchema();
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    throw new Error("No users collection found.");
  }

  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(input.password);

  await db.insert(tables.users.main).values({
    _id: nanoid(),
    name: input.name,
    email: input.email,
    password: hashedPassword,
    role: "admin",
    _createdAt: now,
    _updatedAt: now,
  });
};
