import { defineConfig } from "@/cms/core";
import users from "./collections/users";
import authors from "./collections/authors";
import posts from "./collections/posts";
import taxonomies from "./collections/taxonomies";
import menus from "./collections/menus";
import frontPage from "./collections/front-page";
import pages from "./collections/pages";
import forms from "./collections/forms";
import formSubmissions from "./collections/form-submissions";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, authors, posts, taxonomies, menus, frontPage, pages, forms, formSubmissions],
});
