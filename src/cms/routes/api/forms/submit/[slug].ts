import type { APIRoute } from "astro";
import { cms } from "virtual:kide/api";
import { sendFormSubmissionEmail, isEmailConfigured } from "virtual:kide/email";

export const prerender = false;

type FormFieldConfig = {
  type: "text" | "email" | "textarea" | "select" | "checkbox";
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  options?: string[];
};

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const slug = String(params.slug ?? "");
  if (!slug) return new Response("Not found", { status: 404 });

  const formData = await request.formData();

  // Honeypot — silently accept bot submissions without storing
  if (String(formData.get("_hp") ?? "").trim()) {
    return redirect(buildRedirectUrl(request, null, true), 303);
  }

  const form = await cms.forms.findOne({ where: { slug } }, { _system: true });
  if (!form) return new Response("Form not found", { status: 404 });

  const fieldConfigs = Array.isArray(form.fields) ? (form.fields as FormFieldConfig[]) : [];
  const errors: string[] = [];
  const data: Record<string, unknown> = {};

  for (const field of fieldConfigs) {
    const raw = formData.get(field.name);
    const value = field.type === "checkbox" ? raw === "on" || raw === "true" : String(raw ?? "").trim();

    if (field.required && (field.type === "checkbox" ? value === false : value === "")) {
      errors.push(`${field.label} is required`);
      continue;
    }

    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors.push(`${field.label} must be a valid email`);
      continue;
    }

    if (field.type === "text" && field.maxLength && typeof value === "string" && value.length > field.maxLength) {
      errors.push(`${field.label} must be ${field.maxLength} characters or fewer`);
      continue;
    }

    if (field.type === "select" && value && Array.isArray(field.options) && !field.options.includes(String(value))) {
      errors.push(`${field.label} has an invalid value`);
      continue;
    }

    data[field.name] = value;
  }

  if (errors.length > 0) {
    return redirect(buildRedirectUrl(request, errors.join(", "), false), 303);
  }

  // Collect context fields set by the host page via <CmsForm context={{...}} />.
  const context: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("_ctx_")) context[key.slice(5)] = String(value);
  }

  try {
    await cms["form-submissions"].create(
      {
        form: form._id,
        status: "new",
        data: Object.keys(context).length > 0 ? { ...data, _context: context } : data,
      },
      { _system: true },
    );
  } catch (err) {
    console.error("[forms] Failed to save submission:", err);
    return redirect(buildRedirectUrl(request, "Could not save submission", false), 303);
  }

  if (form.notificationEmail && isEmailConfigured()) {
    await sendFormSubmissionEmail(String(form.notificationEmail), String(form.title), data);
  }

  if (form.submitRedirect) {
    return redirect(String(form.submitRedirect), 303);
  }

  return redirect(buildRedirectUrl(request, null, true), 303);
};

function buildRedirectUrl(request: Request, errorMessage: string | null, success: boolean): string {
  const referer = request.headers.get("referer");
  const url = new URL(referer ?? "/", new URL(request.url).origin);
  url.searchParams.delete("submitted");
  url.searchParams.delete("formError");
  if (success) url.searchParams.set("submitted", "1");
  if (errorMessage) url.searchParams.set("formError", errorMessage);
  return url.pathname + url.search;
}
