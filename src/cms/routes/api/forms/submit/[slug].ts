import type { APIRoute } from "astro";
import { cms } from "virtual:kide/api";
import { sendFormSubmissionEmail, isEmailConfigured } from "virtual:kide/email";
import { hitRateLimit, PayloadTooLargeError, readLimitedFormData, safeUrl } from "../../../../core";

export const prerender = false;

// Abuse bounds for this public endpoint (beyond the honeypot).
const MAX_BODY_BYTES = 100 * 1024;
const MAX_FIELDS = 100;
const MAX_VALUE_LENGTH = 10_000;
const RATE_MAX = 10; // submissions per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;

type FormFieldConfig = {
  type: "text" | "email" | "textarea" | "select" | "checkbox";
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  options?: string[];
};

export const POST: APIRoute = async ({ request, params, redirect, clientAddress }) => {
  const slug = String(params.slug ?? "");
  if (!slug) return new Response("Not found", { status: 404 });

  // Durable per-IP throttle (keyed on Astro's trusted clientAddress, not a spoofable header).
  const limit = await hitRateLimit("forms:ip", clientAddress, {
    max: RATE_MAX,
    windowMs: RATE_WINDOW_MS,
    failClosed: true,
  });
  if (!limit.ok) {
    return new Response("Too many submissions. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  // Enforce the body cap on the raw byte stream — Content-Length is optional (absent on
  // chunked requests), so a header-only check can't stop an unbounded body.
  let formData: FormData;
  try {
    formData = await readLimitedFormData(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return new Response("Payload too large", { status: 413 });
    throw error;
  }

  // Bound the number of submitted fields.
  if ([...formData.keys()].length > MAX_FIELDS) {
    return new Response("Too many fields", { status: 413 });
  }

  // Honeypot — silently accept bot submissions without storing
  if (String(formData.get("_hp") ?? "").trim()) {
    return redirect(buildRedirectUrl(request, null, true), 303);
  }

  const form = await cms.forms.findOne({ slug }, { _system: true });
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

    if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
      errors.push(`${field.label} is too long`);
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

  const submitRedirect = form.submitRedirect ? safeUrl(String(form.submitRedirect)) : null;
  if (submitRedirect) {
    return redirect(submitRedirect, 303);
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
