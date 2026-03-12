import { defineAccess } from "./core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";
const isEditor = ({ user }: { user?: { role?: string } | null }) =>
  user?.role === "admin" || user?.role === "editor";
const isAuthenticated = ({ user }: { user?: { role?: string } | null }) => !!user;

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
