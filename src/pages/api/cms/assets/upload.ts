import type { APIRoute } from "astro";
import { assets } from "@/cms/core/assets";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const alt = formData.get("alt");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }

  const asset = await assets.upload(file, alt ? String(alt) : undefined);
  return Response.json(asset, { status: 201 });
};
