import { defineAccess } from "./core/define";

export default defineAccess({
  authors: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  posts: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
    publish: () => true,
  },
  pages: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
    publish: () => true,
  },
});
