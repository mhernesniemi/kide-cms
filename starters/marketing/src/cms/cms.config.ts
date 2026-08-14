import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import pages from "./collections/pages";
import posts from "./collections/posts";
import taxonomies from "./collections/taxonomies";
import menus from "./collections/menus";
import forms from "./collections/forms";
import formSubmissions from "./collections/form-submissions";

export default defineConfig({
  database: { dialect: "sqlite" },
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, pages, posts, taxonomies, menus, forms, formSubmissions],
});
