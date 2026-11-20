import { defineConfig, presets } from "@kidecms/core";
import users from "./collections/users";
import frontPage from "./collections/front-page";
import pages from "./collections/pages";
import sharedSections from "./collections/shared-sections";
import posts from "./collections/posts";

export default defineConfig({
  locales: {
    default: "en",
    supported: ["en"],
  },
  collections: [
    users,
    frontPage,
    pages,
    posts,
    presets.taxonomies,
    presets.menus,
    sharedSections,
    presets.forms,
    presets.formSubmissions,
  ],
});
