import { describe, expect, it } from "vitest";
import { defineCollection, defineConfig, fields, hasRole } from "../../core";
import { canDelete, canUpdate, canWrite } from "../lib/access";

const erp = defineCollection({
  slug: "orders",
  labels: { singular: "Order", plural: "Orders" },
  access: { read: hasRole("admin"), create: () => false, update: () => false, delete: () => false },
  fields: { orderNo: fields.text() },
});
const pages = defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  access: { delete: hasRole("admin") },
  fields: { title: fields.text() },
});
const users = defineCollection({
  slug: "users",
  labels: { singular: "User", plural: "Users" },
  auth: true,
  fields: { email: fields.email(), role: fields.select({ options: ["admin", "editor"] }) },
});
const config = defineConfig({ collections: [erp, pages, users] });

const admin = { id: "a", role: "admin" };
const editor = { id: "e", role: "editor" };

describe("admin action access", () => {
  it("follows explicit collection rules", () => {
    expect(canUpdate(config, admin, "orders")).toBe(false);
    expect(canDelete(config, admin, "orders")).toBe(false);
    expect(canWrite(config, admin, "orders")).toBe(false);
    expect(canDelete(config, editor, "pages")).toBe(false);
    expect(canDelete(config, admin, "pages")).toBe(true);
    expect(canUpdate(config, editor, "pages")).toBe(true);
  });

  it("mirrors the auth collection defaults", () => {
    expect(canUpdate(config, editor, "users", { _id: "e" })).toBe(true);
    expect(canUpdate(config, editor, "users", { _id: "other" })).toBe(false);
    expect(canDelete(config, editor, "users", { _id: "e" })).toBe(false);
    expect(canDelete(config, admin, "users", { _id: "e" })).toBe(true);
  });
});
