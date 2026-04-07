import { createInterface } from "node:readline";
import { createAdminUser } from "@kide/core";

import "./runtime";
import { closeDb } from "./adapters/db";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (question: string): Promise<string> =>
  new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

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

  await createAdminUser({ name, email, password });
  console.log(`Admin user "${name}" created.`);
  closeDb();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
