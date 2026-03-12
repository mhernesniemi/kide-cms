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
  },
  pages: {},
  authors: {},
});
