import { cms } from "@/cms/.generated/api";

export type FormFieldConfig = {
  type: "text" | "email" | "tel" | "number" | "textarea" | "select" | "radio" | "checkbox";
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  rows?: number;
  options?: string[];
};

export type CmsFormData = {
  slug: string;
  found: boolean;
  fields: FormFieldConfig[];
  successMessage: string;
  context: Record<string, string | number | boolean>;
  submitted: boolean;
  formError: string | null;
};

/** Everything <CmsForm> renders: the form definition plus this request's submit result. */
export async function loadForm(
  slug: string,
  url: URL,
  context: Record<string, string | number | boolean> = {},
): Promise<CmsFormData> {
  const form = await cms.forms.findOne({ slug });
  return {
    slug,
    found: Boolean(form),
    fields: form && Array.isArray(form.fields) ? (form.fields as FormFieldConfig[]) : [],
    successMessage: String(form?.successMessage || "Thanks — we got your message."),
    context,
    submitted: url.searchParams.get("submitted") === "1",
    formError: url.searchParams.get("formError"),
  };
}
