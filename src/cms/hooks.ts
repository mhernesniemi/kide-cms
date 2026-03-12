import { defineHooks } from "./core/define";

export default defineHooks({
  posts: {
    beforeCreate(data) {
      if (!data.excerpt && typeof data.body === "object" && data.body) {
        const firstParagraph = JSON.stringify(data.body).replace(/[\[\]{}"]/g, " ").trim();
        data.excerpt = firstParagraph.slice(0, 180);
      }
      return data;
    },
    afterPublish(_doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home"] });
    },
    afterUpdate(_doc, context) {
      context.cache?.invalidate({ tags: ["posts"] });
    },
    afterDelete(_doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home"] });
    },
  },
  pages: {
    afterPublish(_doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home"] });
    },
    afterUpdate(_doc, context) {
      context.cache?.invalidate({ tags: ["pages"] });
    },
    afterDelete(_doc, context) {
      context.cache?.invalidate({ tags: ["pages", "home"] });
    },
  },
  authors: {},
  users: {},
});
