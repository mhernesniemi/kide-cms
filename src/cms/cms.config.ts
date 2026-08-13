import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import examples from "./collections/example";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, examples],
});
