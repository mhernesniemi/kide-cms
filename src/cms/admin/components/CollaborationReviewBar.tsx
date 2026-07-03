"use client";

import { useState } from "react";
import { Check, ChevronDown, Clock, GitCommitVertical, MessageSquare, MessageSquarePlus } from "lucide-react";

import { cn } from "../lib/utils";
import { buttonVariants } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { REVIEW_STATE_META, type CollabActivity, type CollabComment, type CollabUser } from "../lib/collaboration";
import type { ReviewState } from "@/cms/core";

type Props = {
  collection: string;
  documentId: string;
  reviewState: ReviewState;
  assignee: CollabUser | null;
  assignableUsers: CollabUser[];
  comments: CollabComment[];
  activity: CollabActivity[];
  collaborators: CollabUser[];
  currentUser: CollabUser | null;
  // Admins can review any document; otherwise the reviewer is the assignee.
  isAdmin: boolean;
};

function Avatar({
  initials,
  color,
  size = "size-7",
  ring = false,
  title,
}: {
  initials: string;
  color: string;
  size?: string;
  ring?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        color,
        size,
        ring && "ring-background ring-2",
        "inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white!",
      )}
    >
      {initials}
    </span>
  );
}

export default function CollaborationReviewBar(props: Props) {
  const { collection, documentId, assignableUsers, activity, currentUser, isAdmin } = props;

  const [reviewState, setReviewState] = useState<ReviewState>(props.reviewState);
  const [assignee, setAssignee] = useState<CollabUser | null>(props.assignee);
  const [comments, setComments] = useState<CollabComment[]>(props.comments);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/cms/collaboration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, id: documentId, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed.");
      }
      return await res.json();
    } finally {
      setBusy(false);
    }
  };

  const changeState = async (next: ReviewState) => {
    const prev = reviewState;
    setReviewState(next);
    try {
      await post({ action: "setReviewState", reviewState: next });
    } catch (err) {
      setReviewState(prev);
      window.alert(err instanceof Error ? err.message : "Could not update review state.");
    }
  };

  const changeAssignee = async (userId: string) => {
    const prev = assignee;
    const next = assignableUsers.find((u) => u.id === userId) ?? null;
    setAssignee(next);
    try {
      await post({ action: "setAssignee", assignee: userId || null });
    } catch (err) {
      setAssignee(prev);
      window.alert(err instanceof Error ? err.message : "Could not update assignee.");
    }
  };

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    try {
      const { comment } = await post({ action: "addComment", body });
      setComments((prev) => [
        ...prev,
        {
          id: String(comment._id),
          author: currentUser ?? { id: "", name: "You", initials: "?", color: "bg-muted-foreground" },
          time: "just now",
          field: null,
          body,
          resolved: false,
        },
      ]);
      setDraft("");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not add comment.");
    }
  };

  const toggleResolve = async (comment: CollabComment) => {
    const next = !comment.resolved;
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, resolved: next } : c)));
    try {
      await post({ action: "resolveComment", commentId: comment.id, resolved: next });
    } catch (err) {
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, resolved: !next } : c)));
      window.alert(err instanceof Error ? err.message : "Could not update comment.");
    }
  };

  const meta = REVIEW_STATE_META[reviewState];
  const openComments = () => {
    setTab("comments");
    setOpen(true);
  };

  // The assignee owns the content work; reviewing is an admin capability for now.
  const isReviewer = isAdmin;

  type WorkflowAction = { label: string; next: ReviewState; variant: "outline" | "ghost"; approve?: boolean };
  const actions: WorkflowAction[] = (() => {
    if (!currentUser) return [];
    switch (reviewState) {
      case "in_progress":
        return [{ label: "Request review", next: "ready_for_review", variant: "outline" }];
      case "changes_requested":
        return [{ label: "Resume editing", next: "in_progress", variant: "outline" }];
      case "ready_for_review":
        return isReviewer
          ? [
              { label: "Request changes", next: "changes_requested", variant: "ghost" },
              { label: "Approve", next: "approved", variant: "outline", approve: true },
            ]
          : [{ label: "Withdraw", next: "in_progress", variant: "ghost" }];
      case "approved":
        return [{ label: "Reopen", next: "in_progress", variant: "ghost" }];
      default:
        return [];
    }
  })();

  return (
    <>
      {/* Full-width review strip */}
      <div className="bg-muted/30 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5">
        {/* Zone 1 — Review workflow: status → whose turn → the action you own */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              meta.badge,
            )}
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          {actions.length > 0 && <div className="bg-border mx-0.5 h-5 w-px" />}
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              onClick={() => changeState(action.next)}
              className={cn(
                buttonVariants({ variant: action.variant, size: "sm" }),
                action.variant === "ghost" && "text-muted-foreground",
              )}
            >
              {action.approve && <Check className="size-4" />}
              {action.label}
            </button>
          ))}
        </div>

        {/* Zone 2 — People & discussion: who owns the page + comments */}
        <div className="flex flex-wrap items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy || !currentUser}
              className="hover:bg-foreground/5 flex items-center gap-2 rounded-md px-1.5 py-1 outline-none disabled:opacity-60"
            >
              {assignee ? (
                <>
                  <span className="text-muted-foreground text-xs">Assigned to</span>
                  <Avatar initials={assignee.initials} color={assignee.color} size="size-6" />
                  <span className="text-sm font-medium">{assignee.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Unassigned</span>
              )}
              <ChevronDown className="text-muted-foreground size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => assignee && changeAssignee("")}>
                <span className="text-muted-foreground flex-1">Unassigned</span>
                {!assignee && <Check className="text-muted-foreground size-3.5" />}
              </DropdownMenuItem>
              {assignableUsers.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => u.id !== assignee?.id && changeAssignee(u.id)}>
                  <Avatar initials={u.initials} color={u.color} size="size-5" />
                  <span className="flex-1">{u.name}</span>
                  {assignee?.id === u.id && <Check className="text-muted-foreground size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={openComments}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground gap-1.5")}
          >
            <MessageSquare className="size-4" />
            {comments.length}
          </button>
        </div>
      </div>

      {/* Comments / Activity drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Review, comments and activity</SheetTitle>

          <div className="flex border-b pr-12">
            {(["comments", "activity"] as const).map((id) => {
              const Icon = id === "comments" ? MessageSquare : Clock;
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium capitalize transition-colors",
                    active
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Icon className="size-3.5" />
                  {id}
                  {id === "comments" && comments.length > 0 ? (
                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px]">
                      {comments.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === "comments" && (
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y">
                {comments.length === 0 && (
                  <li className="text-muted-foreground px-4 py-8 text-center text-sm">No comments yet.</li>
                )}
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3 px-4 py-3">
                    <Avatar initials={c.author.initials} color={c.author.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{c.author.name}</span>
                        <span className="text-muted-foreground text-xs">{c.time}</span>
                        {c.field && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                            on {c.field}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleResolve(c)}
                          className="text-muted-foreground hover:text-foreground ml-auto text-[10px] font-medium"
                        >
                          {c.resolved ? "Reopen" : "Resolve"}
                        </button>
                      </div>
                      <p className={cn("mt-1 text-sm", c.resolved && "text-muted-foreground line-through")}>{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="bg-background sticky bottom-0 flex items-center gap-2 border-t px-4 py-3">
                <MessageSquarePlus className="text-muted-foreground size-4 shrink-0" />
                <input
                  type="text"
                  value={draft}
                  disabled={busy || !currentUser}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitComment();
                  }}
                  placeholder={currentUser ? "Write a comment…" : "Sign in to comment"}
                  className="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm outline-none"
                />
              </div>
            </div>
          )}

          {tab === "activity" && (
            <ul className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {activity.length === 0 && <li className="text-muted-foreground text-center text-sm">No activity yet.</li>}
              {activity.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <Avatar initials={a.actor.initials} color={a.actor.color} size="size-6" />
                    {i < activity.length - 1 && <GitCommitVertical className="text-border mt-1 size-4" />}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm">
                      <span className="font-medium">{a.actor.name}</span>{" "}
                      <span className="text-muted-foreground">{a.text}</span>
                    </p>
                    <span className="text-muted-foreground text-xs">{a.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
