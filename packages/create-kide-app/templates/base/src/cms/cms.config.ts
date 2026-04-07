import { defineConfig } from "@kide/core";
import users from "./collections/users";
import posts from "./collections/posts";

export default defineConfig({
  database: { dialect: "sqlite" },
  collections: [users, posts],
});
