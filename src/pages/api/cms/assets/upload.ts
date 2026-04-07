import type { APIRoute } from "astro";
import { assets } from "@/cms/runtime";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const alt = formData.get("alt");
  const folder = formData.get("folder");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }

  const asset = await assets.upload(file, {
    alt: alt ? String(alt) : undefined,
    folder: folder ? String(folder) : undefined,
  });

  const redirectTo = formData.get("redirectTo");

  if (redirectTo) {
    // Delay so Vite's dev server picks up the new file before the redirect
    await new Promise((r) => setTimeout(r, 1000));
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/assets/${asset._id}?_toast=success&_msg=Asset+uploaded` },
    });
  }

  return Response.json(asset, { status: 201 });
};
