import { defineConfig } from "@kide/core";
import users from "./collections/users";

export default defineConfig({
  database: { dialect: "sqlite" },
  collections: [users],
});
