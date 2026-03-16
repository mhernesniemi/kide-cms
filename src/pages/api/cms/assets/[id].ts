import type { APIRoute } from "astro";
import { assets } from "@/cms/core/assets";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "Asset ID is required." }, { status: 400 });

  const asset = await assets.findById(id);
  if (!asset) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(asset);
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "Asset ID is required." }, { status: 400 });

  const body = await request.json();
  const data: {
    alt?: string;
    filename?: string;
    folder?: string | null;
    focalX?: number | null;
    focalY?: number | null;
  } = {};
  if (typeof body.alt === "string") data.alt = body.alt;
  if (typeof body.filename === "string") data.filename = body.filename;
  if (body.folder === null || typeof body.folder === "string") data.folder = body.folder;
  if (body.focalX === null || typeof body.focalX === "number") data.focalX = body.focalX;
  if (body.focalY === null || typeof body.focalY === "number") data.focalY = body.focalY;

  const result = await assets.update(id, data);
  if (!result) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(result);
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return new Response(null, { status: 400 });

  await assets.delete(id);
  return new Response(null, { status: 204 });
};

export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return new Response(null, { status: 400 });

  const formData = new URLSearchParams(await request.text());
  const method = formData.get("_method");

  if (method === "DELETE") {
    await assets.delete(id);
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/assets?_toast=success&_msg=Asset+deleted" },
    });
  }

  const action = formData.get("_action");
  if (action === "update") {
    const alt = formData.get("alt");
    const folder = formData.get("folder");
    const focalX = formData.get("focalX");
    const focalY = formData.get("focalY");
    await assets.update(id, {
      alt: alt !== null ? alt : undefined,
      folder: folder !== null ? (folder === "" ? null : folder) : undefined,
      focalX: focalX !== null ? (focalX === "" ? null : Number(focalX)) : undefined,
      focalY: focalY !== null ? (focalY === "" ? null : Number(focalY)) : undefined,
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/assets/${id}?_toast=success&_msg=Asset+updated` },
    });
  }

  return new Response(null, { status: 400 });
};
