import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { recordAudit, type AuditActor } from "./audit";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

// `in_progress` is the default before any collaboration row exists.
export const REVIEW_STATES = ["in_progress", "ready_for_review", "changes_requested", "approved"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const DEFAULT_STATE: ReviewState = "in_progress";

// Approval is role-based (see isApprover), not per-document.
export type CollaborationState = { reviewState: ReviewState; editor: string | null };

export type CommentRecord = {
  _id: string;
  collection: string;
  documentId: string;
  field: string | null;
  body: string;
  authorId: string | null;
  authorEmail: string | null;
  resolved: boolean;
  createdAt: string;
};

export type ActivityRecord = {
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  timestamp: number;
};

export const isReviewState = (value: unknown): value is ReviewState => REVIEW_STATES.includes(value as ReviewState);

const rowToState = (row: any): CollaborationState => ({
  reviewState: isReviewState(row?.reviewState) ? row.reviewState : DEFAULT_STATE,
  editor: row?.editor ?? null,
});

const upsertState = async (collection: string, documentId: string, patch: Partial<CollaborationState>) => {
  const db = await getDb();
  const schema = getSchema();
  const current = await collaboration.getState(collection, documentId);
  const next: CollaborationState = {
    reviewState: patch.reviewState ?? current.reviewState,
    editor: patch.editor !== undefined ? patch.editor : current.editor,
  };
  const now = new Date().toISOString();
  await db
    .insert(schema.cmsCollaboration)
    .values({ collection, documentId, reviewState: next.reviewState, editor: next.editor, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.cmsCollaboration.collection, schema.cmsCollaboration.documentId],
      set: { reviewState: next.reviewState, editor: next.editor, updatedAt: now },
    });
  return next;
};

export const collaboration = {
  // --- Review state + assignee ---

  async getState(collection: string, documentId: string): Promise<CollaborationState> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db
      .select()
      .from(schema.cmsCollaboration)
      .where(
        and(eq(schema.cmsCollaboration.collection, collection), eq(schema.cmsCollaboration.documentId, documentId)),
      )
      .limit(1);
    return rowToState(rows[0]);
  },

  async getStatesForDocs(collection: string, documentIds: string[]): Promise<Record<string, CollaborationState>> {
    const result: Record<string, CollaborationState> = {};
    if (documentIds.length === 0) return result;
    const db = await getDb();
    const schema = getSchema();
    const rows = await db
      .select()
      .from(schema.cmsCollaboration)
      .where(
        and(
          eq(schema.cmsCollaboration.collection, collection),
          inArray(schema.cmsCollaboration.documentId, documentIds),
        ),
      );
    for (const row of rows as any[]) result[String(row.documentId)] = rowToState(row);
    return result;
  },

  // Docs this user is the editor of, across collections.
  async assignedTo(
    userId: string,
  ): Promise<Array<{ collection: string; documentId: string; reviewState: ReviewState }>> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsCollaboration).where(eq(schema.cmsCollaboration.editor, userId));
    return (rows as any[]).map((r) => ({
      collection: String(r.collection),
      documentId: String(r.documentId),
      reviewState: isReviewState(r.reviewState) ? r.reviewState : DEFAULT_STATE,
    }));
  },

  async setReviewState(
    collection: string,
    documentId: string,
    reviewState: ReviewState,
    actor: AuditActor,
  ): Promise<CollaborationState> {
    if (!isReviewState(reviewState)) throw new Error(`Invalid review state "${reviewState}".`);
    const next = await upsertState(collection, documentId, { reviewState });
    await recordAudit({
      action: `collab.review.${reviewState}`,
      resourceType: "content",
      resourceCollection: collection,
      resourceId: documentId,
      actor,
    });
    return next;
  },

  // Submit for review; claim editor if unset.
  async submitForReview(collection: string, documentId: string, actor: AuditActor): Promise<CollaborationState> {
    const current = await collaboration.getState(collection, documentId);
    const next = await upsertState(collection, documentId, {
      editor: current.editor ?? actor?.id ?? null,
      reviewState: "ready_for_review",
    });
    await recordAudit({
      action: "collab.review.ready_for_review",
      resourceType: "content",
      resourceCollection: collection,
      resourceId: documentId,
      actor,
    });
    return next;
  },

  async setEditor(
    collection: string,
    documentId: string,
    editor: string | null,
    actor: AuditActor,
  ): Promise<CollaborationState> {
    const next = await upsertState(collection, documentId, { editor: editor || null });
    await recordAudit({
      action: editor ? "collab.editor.set" : "collab.editor.clear",
      resourceType: "content",
      resourceCollection: collection,
      resourceId: documentId,
      actor,
    });
    return next;
  },

  // --- Comments ---

  async listComments(collection: string, documentId: string): Promise<CommentRecord[]> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db
      .select()
      .from(schema.cmsComments)
      .where(and(eq(schema.cmsComments.collection, collection), eq(schema.cmsComments.documentId, documentId)))
      .orderBy(desc(schema.cmsComments.createdAt));
    return rows as CommentRecord[];
  },

  async addComment(
    collection: string,
    documentId: string,
    input: { body: string; field?: string | null },
    actor: AuditActor,
  ): Promise<CommentRecord> {
    const body = input.body.trim();
    if (!body) throw new Error("Comment body is required.");
    const db = await getDb();
    const schema = getSchema();
    const record: CommentRecord = {
      _id: nanoid(),
      collection,
      documentId,
      field: input.field ?? null,
      body,
      authorId: actor?.id ?? null,
      authorEmail: actor?.email ?? null,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    await db.insert(schema.cmsComments).values(record);
    await recordAudit({
      action: "collab.comment",
      resourceType: "content",
      resourceCollection: collection,
      resourceId: documentId,
      actor,
    });
    return record;
  },

  async resolveComment(id: string, resolved: boolean, actor: AuditActor): Promise<void> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsComments).where(eq(schema.cmsComments._id, id)).limit(1);
    const row = rows[0] as any;
    if (!row) throw new Error("Comment not found.");
    await db.update(schema.cmsComments).set({ resolved }).where(eq(schema.cmsComments._id, id));
    await recordAudit({
      action: resolved ? "collab.comment.resolve" : "collab.comment.reopen",
      resourceType: "content",
      resourceCollection: row.collection,
      resourceId: row.documentId,
      actor,
    });
  },

  async deleteComment(id: string, actor: AuditActor): Promise<void> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsComments).where(eq(schema.cmsComments._id, id)).limit(1);
    const row = rows[0] as any;
    if (!row) return;
    await db.delete(schema.cmsComments).where(eq(schema.cmsComments._id, id));
    await recordAudit({
      action: "collab.comment.delete",
      resourceType: "content",
      resourceCollection: row.collection,
      resourceId: row.documentId,
      actor,
    });
  },

  // --- Activity (derived from the audit log for this document) ---

  async getActivity(collection: string, documentId: string, limit = 25): Promise<ActivityRecord[]> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db
      .select({
        action: schema.cmsAuditLog.action,
        actorId: schema.cmsAuditLog.actorId,
        actorEmail: schema.cmsAuditLog.actorEmail,
        timestamp: schema.cmsAuditLog.timestamp,
      })
      .from(schema.cmsAuditLog)
      .where(and(eq(schema.cmsAuditLog.resourceCollection, collection), eq(schema.cmsAuditLog.resourceId, documentId)))
      .orderBy(desc(schema.cmsAuditLog.timestamp))
      .limit(limit);
    return rows as ActivityRecord[];
  },
};
