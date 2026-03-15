import { defineAccess } from "./core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";
const isEditor = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin" || user?.role === "editor";
export default defineAccess({
  users: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  authors: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
  },
  taxonomies: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
  },
  menus: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
  },
  "front-page": {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
    publish: isEditor,
  },
  posts: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
    publish: isEditor,
  },
  pages: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
    publish: isEditor,
  },
});
