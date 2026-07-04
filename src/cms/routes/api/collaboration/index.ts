import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { collaboration } from "virtual:kide/runtime";
import { resolveCollaboration } from "@/cms/core";

export const prerender = false;

const isEnabled = (collection: string) => resolveCollaboration(config, collection).enabled;

const getActor = (locals: App.Locals) => {
  const user = locals.user;
  return user ? { id: user.id, email: user.email, role: user.role } : null;
};

const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

// GET /api/cms/collaboration?collection=<slug>&id=<docId>
// Returns the full collaboration snapshot for one document.
export const GET: APIRoute = async ({ url }) => {
  const collection = url.searchParams.get("collection");
  const id = url.searchParams.get("id");
  if (!collection || !id) return Response.json({ error: "collection and id are required." }, { status: 400 });
  if (!isEnabled(collection)) return notFound();

  const [state, comments, activity] = await Promise.all([
    collaboration.getState(collection, id),
    collaboration.listComments(collection, id),
    collaboration.getActivity(collection, id),
  ]);
  return Response.json({ state, comments, activity });
};

// POST /api/cms/collaboration  { collection, id, action, ...payload }
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = getActor(locals);
  if (!actor) return Response.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid body." }, { status: 400 });

  const { collection, id, action } = body as Record<string, unknown>;
  if (typeof collection !== "string" || typeof id !== "string" || typeof action !== "string") {
    return Response.json({ error: "collection, id and action are required." }, { status: 400 });
  }
  if (!isEnabled(collection)) return notFound();

  try {
    switch (action) {
      case "setReviewState": {
        const state = await collaboration.setReviewState(collection, id, (body as any).reviewState, actor);
        return Response.json({ state });
      }
      case "requestReview": {
        const reviewer = (body as any).reviewer;
        const state = await collaboration.requestReview(collection, id, reviewer ? String(reviewer) : null, actor);
        return Response.json({ state });
      }
      case "setAssignee": {
        const assignee = (body as any).assignee;
        const state = await collaboration.setAssignee(
          collection,
          id,
          assignee === null || assignee === "" ? null : String(assignee),
          actor,
        );
        return Response.json({ state });
      }
      case "addComment": {
        const comment = await collaboration.addComment(
          collection,
          id,
          { body: String((body as any).body ?? ""), field: (body as any).field ?? null },
          actor,
        );
        return Response.json({ comment });
      }
      case "resolveComment": {
        await collaboration.resolveComment(String((body as any).commentId), Boolean((body as any).resolved), actor);
        return Response.json({ ok: true });
      }
      case "deleteComment": {
        await collaboration.deleteComment(String((body as any).commentId), actor);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 400 });
  }
};
