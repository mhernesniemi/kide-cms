import { createInterface } from "node:readline";
import { closeDb, createAdminUser, MIN_PASSWORD_LENGTH } from "../core";
import { loadProjectRuntime } from "./project";

await loadProjectRuntime();

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
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  rl.close();

  await createAdminUser({ name, email, password });
  console.log(`Admin user "${name}" created.`);
  await closeDb();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
