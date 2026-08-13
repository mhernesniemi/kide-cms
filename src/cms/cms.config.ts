import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import pages from "./collections/pages";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, pages],
});
