import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import pages from "./collections/pages";

export default defineConfig({
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, pages],
});
