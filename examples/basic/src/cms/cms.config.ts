import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import authors from "./collections/authors";
import posts from "./collections/posts";
import taxonomies from "./collections/taxonomies";
import menus from "./collections/menus";
import frontPage from "./collections/front-page";
import pages from "./collections/pages";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en", "de"],
  },
  collections: [users, authors, posts, taxonomies, menus, frontPage, pages],
});
