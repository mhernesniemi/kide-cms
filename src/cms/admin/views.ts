export default {
  taxonomies: {
    list: {
      columns: ["name", "slug", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
  menus: {
    list: {
      columns: ["name", "slug", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
  users: {
    list: {
      columns: ["name", "email", "role", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
  authors: {
    list: {
      columns: ["name", "title", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
  posts: {
    list: {
      columns: ["title", "category", "_status", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
    edit: {
      layout: [
        { fields: ["title", "excerpt", "image", "body"], position: "content" },
        {
          fields: ["slug", "category", "author", "seoDescription"],
          position: "sidebar",
        },
      ],
    },
  },
  pages: {
    list: {
      columns: ["title", "layout", "_status", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
    edit: {
      layout: [
        { fields: ["title", "summary", "image", "blocks"], position: "content" },
        { fields: ["slug", "layout", "relatedPosts", "seoDescription"], position: "sidebar" },
      ],
    },
  },
};
