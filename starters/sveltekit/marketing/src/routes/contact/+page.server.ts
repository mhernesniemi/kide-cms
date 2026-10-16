import { loadForm } from "@/lib/server/forms";

export const load = async ({ url }: { url: URL }) => ({
  form: await loadForm("contact", url, { page: "/contact" }),
});
