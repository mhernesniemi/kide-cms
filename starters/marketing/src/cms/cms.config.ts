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
  // Editorial review on the two collections editors actually work in. Approval is
  // not required to publish — the workflow is visible without gating anything.
  collaboration: {
    collections: ["pages", "posts"],
  },
});
