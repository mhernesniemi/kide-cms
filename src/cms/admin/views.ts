export default {
  theme: {
    accent: "#0f766e",
    canvas: "#f6f3ee",
    panel: "#fffdf8",
    ink: "#10211b",
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
        { fields: ["slug", "category", "author", "tags", "cover", "metadata", "sortOrder"], width: "1/3" },
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
