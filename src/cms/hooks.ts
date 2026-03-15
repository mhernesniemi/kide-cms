import { defineHooks } from "./core/define";

export default defineHooks({
  posts: {
    beforeCreate(data) {
      if (!data.excerpt && typeof data.body === "object" && data.body) {
        const firstParagraph = JSON.stringify(data.body)
          .replace(/[\[\]{}"]/g, " ")
          .trim();
        data.excerpt = firstParagraph.slice(0, 180);
      }
      return data;
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
  },
  pages: {
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home", `page:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home", `page:${doc._id}`] });
    },
  },
  taxonomies: {},
  menus: {},
  "front-page": {},
  authors: {},
  users: {},
});
