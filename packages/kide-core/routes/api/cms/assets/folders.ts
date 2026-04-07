import type { APIRoute } from "astro";
import { folders } from "virtual:kide/runtime";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const parent = url.searchParams.get("parent");
  if (parent !== null) {
    const items = await folders.findByParent(parent || null);
    return Response.json(items);
  }
  const items = await folders.findAll();
  return Response.json(items);
};

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const { action, id, name, parent } = body;

    if (action === "create" && name) {
      const folder = await folders.create(String(name), parent ?? null);
      return Response.json(folder, { status: 201 });
    }

    if (action === "rename" && id && name) {
      const folder = await folders.rename(String(id), String(name));
      if (!folder) return Response.json({ error: "Not found." }, { status: 404 });
      return Response.json(folder);
    }

    if (action === "delete" && id) {
      await folders.delete(String(id));
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  // Form submission (for non-JS fallback / redirect flows)
  const formData = new URLSearchParams(await request.text());
  const action = formData.get("_action");
  const redirectTo = formData.get("redirectTo") || "/admin/assets";

  if (action === "create") {
    const name = formData.get("name");
    const parent = formData.get("parent");
    if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
    const folder = await folders.create(name, parent || null);
    const folderParam = encodeURIComponent(folder._id);
    return new Response(null, {
      status: 303,
      headers: { Location: `${redirectTo}?folder=${folderParam}&_toast=success&_msg=Folder+created` },
    });
  }

  if (action === "rename") {
    const id = formData.get("id");
    const name = formData.get("name");
    if (!id || !name) return Response.json({ error: "ID and name required." }, { status: 400 });
    await folders.rename(id, name);
    return new Response(null, {
      status: 303,
      headers: { Location: `${redirectTo}?_toast=success&_msg=Folder+renamed` },
    });
  }

  if (action === "delete") {
    const id = formData.get("id");
    if (!id) return Response.json({ error: "ID required." }, { status: 400 });
    await folders.delete(id);
    return new Response(null, {
      status: 303,
      headers: { Location: `${redirectTo}?_toast=success&_msg=Folder+deleted` },
    });
  }

  return Response.json({ error: "Invalid action." }, { status: 400 });
};
