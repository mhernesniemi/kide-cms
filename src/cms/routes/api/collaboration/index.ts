import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { collaboration } from "virtual:kide/runtime";
import { isApprover, resolveCollaboration } from "@/cms/core";

export const prerender = false;

const isEnabled = (collection: string) => resolveCollaboration(config, collection).enabled;

// Reviewer verdicts — only these gate publishing, so only approvers may set them.
// Requesting review (ready_for_review) and returning to draft (in_progress) stay open.
const APPROVER_ONLY_STATES = new Set(["approved", "changes_requested"]);

const getActor = (locals: App.Locals) => {
  const user = locals.user;
  return user ? { id: user.id, email: user.email, role: user.role } : null;
};

const notFound = () => Response.json({ error: "Not found." }, { status: 404 });
const forbidden = () => Response.json({ error: "Forbidden." }, { status: 403 });

// A comment id alone is attacker-controlled, so resolve/delete must confirm the comment
// lives in a collab-enabled collection and the actor authored it or is an approver —
// otherwise any signed-in user could act on any comment in any collection.
const authorizeComment = async (commentId: string, actor: { id: string; role?: string }) => {
  const comment = await collaboration.getComment(commentId);
  if (!comment || !isEnabled(comment.collection)) return null;
  if (comment.authorId === actor.id || isApprover(config, actor.role)) return comment;
  return null;
};

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
        const reviewState = String((body as any).reviewState);
        // The approval gate is server-side: without this any signed-in user could set
        // their own draft to "approved" and publish it, bypassing review entirely.
        if (APPROVER_ONLY_STATES.has(reviewState) && !isApprover(config, actor.role)) {
          return forbidden();
        }
        const state = await collaboration.setReviewState(collection, id, reviewState as any, actor);
        return Response.json({ state });
      }
      case "setEditor": {
        const editor = (body as any).editor;
        const state = await collaboration.setEditor(collection, id, editor ? String(editor) : null, actor);
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
        const comment = await authorizeComment(String((body as any).commentId), actor);
        if (!comment) return forbidden();
        await collaboration.resolveComment(comment._id, Boolean((body as any).resolved), actor);
        return Response.json({ ok: true });
      }
      case "deleteComment": {
        const comment = await authorizeComment(String((body as any).commentId), actor);
        if (!comment) return forbidden();
        await collaboration.deleteComment(comment._id, actor);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 400 });
  }
};
