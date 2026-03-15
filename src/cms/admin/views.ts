export default {
  theme: {
    accent: "#0f766e",
    canvas: "#f6f3ee",
    panel: "#fffdf8",
    ink: "#10211b",
  },
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
      columns: ["name", "role", "_updatedAt"],
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
        { fields: ["title", "excerpt", "body"], width: "2/3" },
        { fields: ["slug", "category", "author", "tags", "cover", "metadata"], width: "1/3" },
      ],
    },
  },
  pages: {
    list: {
      columns: ["title", "layout", "_status", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
};
