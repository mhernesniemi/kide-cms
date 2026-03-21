import { createInterface } from "node:readline";
import { nanoid } from "nanoid";
import { getDb, closeDb } from "./db";
import { hashPassword } from "./auth";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

async function main() {
  const name = await ask("Name: ");
  if (!name) {
    console.error("Name is required.");
    process.exit(1);
  }

  const email = await ask("Email: ");
  if (!email) {
    console.error("Email is required.");
    process.exit(1);
  }

  const password = await ask("Password: ");
  if (!password || password.length < 4) {
    console.error("Password must be at least 4 characters.");
    process.exit(1);
  }

  rl.close();

  const db = await getDb();
  const schema = await import("../.generated/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;

  if (!tables.users) {
    console.error("No users collection found.");
    process.exit(1);
  }

  const hashed = await hashPassword(password);
  const now = new Date().toISOString();

  await db.insert(tables.users.main).values({
    _id: nanoid(),
    name,
    email,
    password: hashed,
    role: "admin",
    _createdAt: now,
    _updatedAt: now,
  });

  console.log(`Admin user "${name}" created.`);
  closeDb();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
