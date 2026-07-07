import { z } from 'zod';

export const guestShareCommentSchema = z.object({
  id: z.string(),
  page: z.number(),
  content: z.string(),
  authorName: z.string().nullable(),
  authorReply: z.string().nullable(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  status: z.enum(['open', 'resolved']),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const createGuestShareCommentSchema = z.object({
  page: z.number().int().min(1),
  content: z.string().min(1).max(4000),
  authorName: z.string().min(1).max(120).optional(),
  authorEmail: z.string().email().max(320).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
});

export const updateGuestShareCommentStatusSchema = z.object({
  status: z.enum(['open', 'resolved']),
  authorReply: z.string().max(2000).optional().nullable(),
});

export type GuestShareCommentDto = z.infer<typeof guestShareCommentSchema>;

export function serializeGuestShareComment(comment: {
  id: string;
  page: number;
  content: string;
  authorName: string | null;
  authorReply?: string | null;
  x: number | null;
  y: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
}): GuestShareCommentDto {
  return {
    id: comment.id,
    page: comment.page,
    content: comment.content,
    authorName: comment.authorName,
    authorReply: comment.authorReply?.trim() ? comment.authorReply.trim() : null,
    x: comment.x,
    y: comment.y,
    status: comment.status === 'resolved' ? 'resolved' : 'open',
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    resolvedAt: comment.resolvedAt ? comment.resolvedAt.toISOString() : null,
  };
}
