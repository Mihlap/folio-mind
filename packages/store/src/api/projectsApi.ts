import { baseApi } from './baseApi.js';

export type ProjectItem = {
  id: string;
  name: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
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
  }),
});

export const {
  useListProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useUpdateDocumentProjectMutation,
} = projectsApi;
