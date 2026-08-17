import { defineConfig } from "@kidecms/core";
import users from "./collections/users";
import frontPage from "./collections/front-page";
import pages from "./collections/pages";
import posts from "./collections/posts";
import taxonomies from "./collections/taxonomies";
import menus from "./collections/menus";
import forms from "./collections/forms";
import formSubmissions from "./collections/form-submissions";

export default defineConfig({
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [users, frontPage, pages, posts, taxonomies, menus, forms, formSubmissions],
});
