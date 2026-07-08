import { baseApi } from './baseApi.js';
import type { LayoutTemplateCategory, LayoutTemplateStoredObject } from '@folio-mind/pdf-contracts';

export type LayoutTemplateItem = {
  id: string;
  name: string;
  description: string | null;
  category: LayoutTemplateCategory;
  objects: LayoutTemplateStoredObject[];
  builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const layoutTemplatesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listLayoutTemplates: build.query<{ items: LayoutTemplateItem[] }, void>({
      query: () => '/layout-templates',
      providesTags: [{ type: 'LayoutTemplates', id: 'LIST' }],
    }),
    createLayoutTemplate: build.mutation<
      LayoutTemplateItem,
      {
        name: string;
        description?: string;
        category?: LayoutTemplateCategory;
        objects: LayoutTemplateStoredObject[];
      }
    >({
      query: (body) => ({ url: '/layout-templates', method: 'POST', body }),
      invalidatesTags: [{ type: 'LayoutTemplates', id: 'LIST' }],
    }),
    updateLayoutTemplate: build.mutation<
      LayoutTemplateItem,
      {
        templateId: string;
        name?: string;
        description?: string | null;
        category?: LayoutTemplateCategory;
        objects?: LayoutTemplateStoredObject[];
      }
    >({
      query: ({ templateId, ...body }) => ({
        url: `/layout-templates/${templateId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'LayoutTemplates', id: 'LIST' }],
    }),
    deleteLayoutTemplate: build.mutation<void, string>({
      query: (templateId) => ({ url: `/layout-templates/${templateId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'LayoutTemplates', id: 'LIST' }],
    }),
  }),
});

export const {
  useListLayoutTemplatesQuery,
  useCreateLayoutTemplateMutation,
  useUpdateLayoutTemplateMutation,
  useDeleteLayoutTemplateMutation,
} = layoutTemplatesApi;
