import { DOCUMENT_MEMBER_ROLES, type DocumentAccessRole, type DocumentMemberRole } from '@folio-mind/pdf-contracts';
import { baseApi } from './baseApi.js';

export type DocumentMemberItem = {
  userId: string;
  email: string;
  name: string | null;
  role: DocumentMemberRole;
  createdAt: string;
};

export type DocumentOwnerItem = {
  userId: string;
  email: string;
  name: string | null;
};

export type PendingMemberInviteItem = {
  id: string;
  email: string | null;
  role: DocumentMemberRole;
  expiresAt: string;
  createdAt: string;
  inviteUrl: string | null;
  active: boolean;
};

export type TenantUserItem = {
  id: string;
  email: string;
  name: string | null;
};

export const documentMembersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDocumentMembers: build.query<
      { myRole: DocumentAccessRole; owner: DocumentOwnerItem; members: DocumentMemberItem[] },
      string
    >({
      query: (documentId) => `/documents/${documentId}/members`,
      providesTags: (_r, _e, documentId) => [{ type: 'DocumentMembers', id: documentId }],
    }),
    listPendingMemberInvites: build.query<{ items: PendingMemberInviteItem[] }, string>({
      query: (documentId) => `/documents/${documentId}/members/pending-invites`,
      providesTags: (_r, _e, documentId) => [{ type: 'DocumentMemberInvites', id: documentId }],
    }),
    listTenantUsers: build.query<{ items: TenantUserItem[] }, { q?: string } | void>({
      query: (params) => ({
        url: '/tenant/users',
        params: params?.q ? { q: params.q } : undefined,
      }),
    }),
    addDocumentMember: build.mutation<
      DocumentMemberItem,
      { documentId: string; email: string; role: DocumentMemberRole }
    >({
      query: ({ documentId, ...body }) => ({
        url: `/documents/${documentId}/members`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMembers', id: documentId },
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
    updateDocumentMember: build.mutation<
      DocumentMemberItem,
      { documentId: string; userId: string; role: DocumentMemberRole }
    >({
      query: ({ documentId, userId, role }) => ({
        url: `/documents/${documentId}/members/${userId}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMembers', id: documentId },
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
    removeDocumentMember: build.mutation<void, { documentId: string; userId: string }>({
      query: ({ documentId, userId }) => ({
        url: `/documents/${documentId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMembers', id: documentId },
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
    createMemberInviteLink: build.mutation<
      { id: string; inviteUrl: string; expiresAt: string },
      { documentId: string; email: string; role: DocumentMemberRole }
    >({
      query: ({ documentId, ...body }) => ({
        url: `/documents/${documentId}/members/invite-link`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
    updatePendingMemberInvite: build.mutation<
      PendingMemberInviteItem,
      { documentId: string; inviteId: string; role: DocumentMemberRole }
    >({
      query: ({ documentId, inviteId, role }) => ({
        url: `/documents/${documentId}/members/pending-invites/${inviteId}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
    revokePendingMemberInvite: build.mutation<void, { documentId: string; inviteId: string }>({
      query: ({ documentId, inviteId }) => ({
        url: `/documents/${documentId}/members/pending-invites/${inviteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'DocumentMemberInvites', id: documentId },
      ],
    }),
  }),
});

export const {
  useListDocumentMembersQuery,
  useListPendingMemberInvitesQuery,
  useListTenantUsersQuery,
  useAddDocumentMemberMutation,
  useUpdateDocumentMemberMutation,
  useRemoveDocumentMemberMutation,
  useCreateMemberInviteLinkMutation,
  useUpdatePendingMemberInviteMutation,
  useRevokePendingMemberInviteMutation,
} = documentMembersApi;

export { DOCUMENT_MEMBER_ROLES };
