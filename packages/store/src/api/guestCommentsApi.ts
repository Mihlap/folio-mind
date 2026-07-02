import { baseApi } from './baseApi.js';

export type GuestShareComment = {
  id: string;
  page: number;
  content: string;
  authorName: string | null;
  x: number | null;
  y: number | null;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
};

export type CreateGuestShareCommentBody = {
  page: number;
  content: string;
  authorName?: string;
  x?: number;
  y?: number;
};

export const guestCommentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listGuestComments: build.query<
      { items: GuestShareComment[] },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) =>
        `/documents/${documentId}/versions/${versionId}/guest-comments`,
      providesTags: (_r, _e, { versionId }) => [{ type: 'GuestComments', id: versionId }],
    }),
    updateGuestCommentStatus: build.mutation<
      GuestShareComment,
      {
        documentId: string;
        versionId: string;
        commentId: string;
        status: 'open' | 'resolved';
      }
    >({
      query: ({ documentId, commentId, status }) => ({
        url: `/documents/${documentId}/guest-comments/${commentId}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'GuestComments', id: versionId }],
    }),
    deleteGuestComment: build.mutation<
      { ok: true },
      { documentId: string; versionId: string; commentId: string }
    >({
      query: ({ documentId, commentId }) => ({
        url: `/documents/${documentId}/guest-comments/${commentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'GuestComments', id: versionId }],
    }),
    clearGuestComments: build.mutation<
      { ok: true; deleted: number },
      { documentId: string; versionId: string }
    >({
      query: ({ documentId, versionId }) => ({
        url: `/documents/${documentId}/versions/${versionId}/guest-comments`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { versionId }) => [{ type: 'GuestComments', id: versionId }],
    }),
  }),
});

export const {
  useListGuestCommentsQuery,
  useUpdateGuestCommentStatusMutation,
  useDeleteGuestCommentMutation,
  useClearGuestCommentsMutation,
} = guestCommentsApi;

export async function fetchGuestShareComments(token: string): Promise<GuestShareComment[]> {
  const res = await fetch(`${apiBaseUrl()}/public/share/${encodeURIComponent(token)}/comments`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Ошибка ${res.status}`);
  }
  const data = (await res.json()) as { items: GuestShareComment[] };
  return data.items;
}

export async function createGuestShareComment(
  token: string,
  body: CreateGuestShareCommentBody,
): Promise<GuestShareComment> {
  const res = await fetch(`${apiBaseUrl()}/public/share/${encodeURIComponent(token)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Ошибка ${res.status}`);
  }
  return res.json() as Promise<GuestShareComment>;
}

function apiBaseUrl(): string {
  return (
    (typeof import.meta !== 'undefined' &&
      (
        import.meta as {
          env?: { VITE_API_URL?: string };
        }
      ).env?.VITE_API_URL) ||
    (typeof process !== 'undefined' && process.env.VITE_API_URL) ||
    'http://localhost:3001'
  );
}
