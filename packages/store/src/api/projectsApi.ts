import type { DocumentMemberRole } from '@folio-mind/pdf-contracts';
import { baseApi } from './baseApi.js';
import type { DocumentMemberItem, DocumentOwnerItem } from './documentMembersApi.js';

export type ProjectItem = {
  id: string;
  name: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAccessItem = {
  projectId: string;
  myRole: DocumentMemberRole | null;
  canManage: boolean;
  owner: DocumentOwnerItem | null;
  members: DocumentMemberItem[];
};

export const projectsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listProjects: build.query<{ items: ProjectItem[] }, void>({
      query: () => '/projects',
      providesTags: [{ type: 'Projects', id: 'LIST' }],
    }),
    getProject: build.query<
      { project: ProjectItem; documents: import('./documentsApi.js').DocumentListItem[] },
      string
    >({
      query: (projectId) => `/projects/${projectId}`,
      providesTags: (_r, _e, id) => [{ type: 'Projects', id }],
    }),
    createProject: build.mutation<ProjectItem, { name: string }>({
      query: (body) => ({ url: '/projects', method: 'POST', body }),
      invalidatesTags: [{ type: 'Projects', id: 'LIST' }],
    }),
    updateProject: build.mutation<ProjectItem, { projectId: string; name: string }>({
      query: ({ projectId, name }) => ({
        url: `/projects/${projectId}`,
        method: 'PATCH',
        body: { name },
      }),
      invalidatesTags: (_r, _e, { projectId }) => [
        { type: 'Projects', id: 'LIST' },
        { type: 'Projects', id: projectId },
      ],
    }),
    deleteProject: build.mutation<void, string>({
      query: (projectId) => ({ url: `/projects/${projectId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Projects', id: 'LIST' }, { type: 'Documents', id: 'LIST' }],
    }),
    updateDocumentProject: build.mutation<
      { id: string; projectId: string | null; projectName: string | null },
      { documentId: string; projectId: string | null }
    >({
      query: ({ documentId, projectId }) => ({
        url: `/documents/${documentId}/project`,
        method: 'PATCH',
        body: { projectId },
      }),
      invalidatesTags: (_r, _e, { documentId }) => [
        { type: 'Documents', id: documentId },
        { type: 'Documents', id: 'LIST' },
        { type: 'Projects', id: 'LIST' },
        { type: 'Projects' },
      ],
    }),
    listProjectMembers: build.query<ProjectAccessItem, string>({
      query: (projectId) => `/projects/${projectId}/members`,
      providesTags: (_r, _e, projectId) => [{ type: 'ProjectMembers', id: projectId }],
    }),
    addProjectMember: build.mutation<
      DocumentMemberItem,
      { projectId: string; email: string; role: DocumentMemberRole }
    >({
      query: ({ projectId, ...body }) => ({
        url: `/projects/${projectId}/members`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { projectId }) => [
        { type: 'ProjectMembers', id: projectId },
      ],
    }),
    updateProjectMember: build.mutation<
      DocumentMemberItem,
      { projectId: string; userId: string; role: DocumentMemberRole }
    >({
      query: ({ projectId, userId, role }) => ({
        url: `/projects/${projectId}/members/${userId}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: (_r, _e, { projectId }) => [
        { type: 'ProjectMembers', id: projectId },
      ],
    }),
    removeProjectMember: build.mutation<void, { projectId: string; userId: string }>({
      query: ({ projectId, userId }) => ({
        url: `/projects/${projectId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { projectId }) => [
        { type: 'ProjectMembers', id: projectId },
      ],
    }),
  }),
});

export const {
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useUpdateDocumentProjectMutation,
  useListProjectMembersQuery,
  useAddProjectMemberMutation,
  useUpdateProjectMemberMutation,
  useRemoveProjectMemberMutation,
} = projectsApi;
