import type { ReviewState } from "@/cms/core";

// Shared display helpers for the collaboration UI (edit strip + list columns).
// Turns raw collaboration records into render-ready data: avatars, labels, times.

export type CollabUser = { id: string; name: string; initials: string; color: string };
export type CollabComment = {
  id: string;
  author: CollabUser;
  time: string;
  field: string | null;
  body: string;
  resolved: boolean;
};
export type CollabActivity = { actor: CollabUser; text: string; time: string };

export type CollaborationData = {
  reviewState: ReviewState;
  editor: CollabUser | null;
  assignableUsers: CollabUser[];
  comments: CollabComment[];
  activity: CollabActivity[];
  currentUser: CollabUser | null;
};

const PALETTE = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-orange-500",
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

const colorFor = (seed: string): string => PALETTE[hashString(seed || "seed") % PALETTE.length]!;

const initialsFrom = (name: string, email: string): string => {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export const REVIEW_STATE_META: Record<ReviewState, { label: string; badge: string; dot: string }> = {
  in_progress: {
    label: "In progress",
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  ready_for_review: {
    label: "Ready for review",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  changes_requested: {
    label: "Changes requested",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  approved: {
    label: "Approved",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

// Map an audit-log action to a human sentence fragment for the activity feed.
const ACTION_LABELS: Record<string, string> = {
  "collab.review.in_progress": "moved this to In progress",
  "collab.review.ready_for_review": "submitted for review",
  "collab.review.changes_requested": "requested changes",
  "collab.review.approved": "approved this",
  "collab.editor.set": "changed the assignee",
  "collab.editor.clear": "cleared the assignee",
  "collab.comment": "commented",
  "collab.comment.resolve": "resolved a comment",
  "collab.comment.reopen": "reopened a comment",
  "collab.comment.delete": "deleted a comment",
  "content.create": "created this document",
  "content.update": "saved changes",
  "content.publish": "published this",
  "content.unpublish": "unpublished this",
  "content.schedule": "scheduled this",
};

const actionLabel = (action: string): string =>
  ACTION_LABELS[action] ?? action.replace(/^[a-z]+\./, "").replace(/[._]/g, " ");

const relativeTime = (input: string | number): string => {
  const t = typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
};

type CollabModule = {
  getState: (collection: string, id: string) => Promise<{ reviewState: ReviewState; editor: string | null }>;
  listComments: (collection: string, id: string) => Promise<any[]>;
  getActivity: (collection: string, id: string) => Promise<any[]>;
};

type CurrentUser = { id: string; email?: string; role?: string; name?: string } | null | undefined;

// Load and fully resolve collaboration data for one document.
export async function loadCollaborationData(opts: {
  collaboration: CollabModule;
  cmsRuntime: Record<string, any>;
  runtimeContext: unknown;
  collection: string;
  documentId: string;
  currentUser: CurrentUser;
}): Promise<CollaborationData> {
  const { collaboration, cmsRuntime, runtimeContext, collection, documentId, currentUser } = opts;

  const users: any[] = await cmsRuntime.users?.find({ status: "any", limit: 100 }, runtimeContext).catch(() => []);
  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of users ?? []) {
    userMap.set(String(u._id), { name: String(u.name ?? u.email ?? "User"), email: String(u.email ?? "") });
  }

  const toUser = (id: string | null | undefined, emailFallback?: string | null): CollabUser => {
    const record = id ? userMap.get(String(id)) : null;
    const email = record?.email || emailFallback || "";
    const name = record?.name || (email ? email.split("@")[0]! : "Unknown");
    const seed = String(id || email || name);
    return { id: String(id ?? ""), name, initials: initialsFrom(name, email), color: colorFor(seed) };
  };

  const [state, comments, activity] = await Promise.all([
    collaboration.getState(collection, documentId),
    collaboration.listComments(collection, documentId),
    collaboration.getActivity(collection, documentId),
  ]);

  const resolvedComments: CollabComment[] = comments
    .map((c) => ({
      id: String(c._id),
      author: toUser(c.authorId, c.authorEmail),
      time: relativeTime(c.createdAt),
      field: c.field ?? null,
      body: String(c.body),
      resolved: Boolean(c.resolved),
    }))
    // listComments is newest-first; show comments oldest-first like a thread.
    .reverse();

  const resolvedActivity: CollabActivity[] = activity.map((a) => ({
    actor: toUser(a.actorId, a.actorEmail),
    text: actionLabel(String(a.action)),
    time: relativeTime(a.timestamp),
  }));

  return {
    reviewState: state.reviewState,
    editor: state.editor ? toUser(state.editor) : null,
    assignableUsers: (users ?? []).map((u) => toUser(String(u._id), String(u.email ?? ""))),
    comments: resolvedComments,
    activity: resolvedActivity,
    currentUser: currentUser ? toUser(currentUser.id, currentUser.email) : null,
  };
}
