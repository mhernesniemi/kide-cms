"use client";

import { useRef, useState } from "react";
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
  editor: CollabUser | null;
  assignableUsers: CollabUser[];
  comments: CollabComment[];
  activity: CollabActivity[];
  currentUser: CollabUser | null;
  // Whether the current user can approve / request changes (role-based).
  canApprove: boolean;
};

function Avatar({ initials, color, size = "size-6" }: { initials: string; color: string; size?: string }) {
  return (
    <span
      className={cn(
        color,
        size,
        "inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white!",
      )}
    >
      {initials}
    </span>
  );
}

export default function CollaborationReviewBar(props: Props) {
  const { collection, documentId, assignableUsers, activity, currentUser, canApprove } = props;

  const [reviewState, setReviewState] = useState<ReviewState>(props.reviewState);
  const [editor, setEditor] = useState<CollabUser | null>(props.editor);
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

  const changeEditor = async (userId: string) => {
    const prev = editor;
    setEditor(assignableUsers.find((u) => u.id === userId) ?? null);
    try {
      await post({ action: "setEditor", editor: userId || null });
    } catch (err) {
      setEditor(prev);
      window.alert(err instanceof Error ? err.message : "Could not update assignee.");
    }
  };

  const commentInputRef = useRef<HTMLInputElement>(null);
  const openComments = (focus = false) => {
    setTab("comments");
    setOpen(true);
    if (focus) setTimeout(() => commentInputRef.current?.focus(), 60);
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
  const canEdit = reviewState === "in_progress" || reviewState === "changes_requested";

  return (
    <>
      <div className="bg-muted/30 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5">
        {/* Left — review status + the action for this stage */}
        <div className="flex flex-wrap items-center gap-2.5">
          {reviewState === "changes_requested" ? (
            <button
              type="button"
              onClick={() => openComments()}
              title="View the requested changes"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80",
                meta.badge,
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
              <MessageSquare className="size-3 opacity-70" />
            </button>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                meta.badge,
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          )}

          {currentUser && <div className="bg-border mx-0.5 h-5 w-px" />}

          {/* Editor submits for review — saves the draft AND flips the state
              (a submit on the document form, so unsaved edits are persisted). */}
          {currentUser && canEdit && (
            <button
              type="submit"
              form="document-form"
              name="_intent"
              value="submit-review"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Submit for review
            </button>
          )}

          {/* Ready for review → approvers decide, others can withdraw */}
          {reviewState === "ready_for_review" &&
            (canApprove ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    changeState("changes_requested");
                    openComments(true);
                  }}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
                >
                  Request changes
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeState("approved")}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Check className="size-4" />
                  Approve
                </button>
              </>
            ) : currentUser ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => changeState("in_progress")}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
              >
                Withdraw
              </button>
            ) : null)}

          {/* Approved → reopen for more work */}
          {currentUser && reviewState === "approved" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => changeState("in_progress")}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
            >
              Reopen
            </button>
          )}
        </div>

        {/* Right — assignee + comments */}
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy || !currentUser}
              className="hover:bg-foreground/5 flex items-center gap-1.5 rounded-md px-1.5 py-1 outline-none disabled:opacity-60"
            >
              <span className="text-muted-foreground text-xs">Assignee</span>
              {editor && <Avatar initials={editor.initials} color={editor.color} />}
              <span className={cn("text-sm", editor ? "font-medium" : "text-muted-foreground")}>
                {editor?.name ?? "none"}
              </span>
              <ChevronDown className="text-muted-foreground size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {currentUser && editor?.id !== currentUser.id && (
                <DropdownMenuItem onClick={() => changeEditor(currentUser.id)}>
                  <Avatar initials={currentUser.initials} color={currentUser.color} size="size-5" />
                  <span className="flex-1">Assign to me</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => changeEditor("")}>
                <span className="text-muted-foreground flex-1">Unassigned</span>
                {!editor && <Check className="text-muted-foreground size-3.5" />}
              </DropdownMenuItem>
              {assignableUsers.map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => changeEditor(u.id)}>
                  <Avatar initials={u.initials} color={u.color} size="size-5" />
                  <span className="flex-1">{u.name}</span>
                  {editor?.id === u.id && <Check className="text-muted-foreground size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => openComments()}
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
          <SheetTitle className="sr-only">Comments and activity</SheetTitle>

          <div className="flex border-b pr-12">
            {(["comments", "activity"] as const).map((id) => {
              const Icon = id === "comments" ? MessageSquare : Clock;
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium capitalize transition-colors",
                    isActive
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
                    <Avatar initials={c.author.initials} color={c.author.color} size="size-7" />
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
                  ref={commentInputRef}
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
                    <Avatar initials={a.actor.initials} color={a.actor.color} />
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
