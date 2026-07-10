import type { MediaQuotaInfo } from '@folio-mind/pdf-contracts';
import type { RootState } from '../store.js';
import { UPLOAD_NETWORK_ERROR_MESSAGE } from '../lib/formatUploadError.js';
import { uploadMediaAssetFile } from '../lib/uploadMediaAsset.js';
import { apiBaseUrl, baseApi } from './baseApi.js';

export type MediaAssetItem = {
  id: string;
  title: string;
  tags: string[];
  fileName: string;
  mimeType: string;
  size: string;
  width: number | null;
  height: number | null;
  documentId: string | null;
  status: string;
  previewUrl: string | null;
  thumbUrl: string | null;
  createdAt: string;
};

export const mediaApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMediaQuota: build.query<MediaQuotaInfo, void>({
      query: () => '/media-assets/quota',
      providesTags: [{ type: 'MediaAssets', id: 'QUOTA' }],
    }),
    listMediaAssets: build.query<
      { items: MediaAssetItem[] },
      { documentId?: string; q?: string; tag?: string } | void
    >({
      query: (params) => {
        if (!params) return '/media-assets';
        const search = new URLSearchParams();
        if ('documentId' in params && params.documentId) {
          search.set('documentId', params.documentId);
        }
        if ('q' in params && params.q) search.set('q', params.q);
        if ('tag' in params && params.tag) search.set('tag', params.tag);
        const query = search.toString();
        return query ? `/media-assets?${query}` : '/media-assets';
      },
      providesTags: [{ type: 'MediaAssets', id: 'LIST' }],
    }),
    createMediaAsset: build.mutation<
      { id: string; uploadUrl: string; s3Key: string },
      {
        fileName: string;
        mimeType: string;
        size: number;
        title?: string;
        documentId?: string;
        width?: number;
        height?: number;
      }
    >({
      query: (body) => ({
        url: '/media-assets',
        method: 'POST',
        body,
      }),
    }),
    uploadMediaAsset: build.mutation<
      MediaAssetItem,
      {
        file: File;
        documentId?: string;
        title?: string;
        width?: number;
        height?: number;
      }
    >({
      async queryFn(args, { getState }) {
        const token = (getState() as RootState).auth.token;
        try {
          const data = await uploadMediaAssetFile(args.file, {
            token,
            documentId: args.documentId,
            title: args.title,
            width: args.width,
            height: args.height,
          });
          return { data };
        } catch (err) {
          const message = err instanceof Error ? err.message : UPLOAD_NETWORK_ERROR_MESSAGE;
          return {
            error: {
              status: 'CUSTOM_ERROR' as const,
              error: message,
              data: message,
            },
          };
        }
      },
      invalidatesTags: [
        { type: 'MediaAssets', id: 'LIST' },
        { type: 'MediaAssets', id: 'QUOTA' },
      ],
    }),
    completeMediaAsset: build.mutation<MediaAssetItem, { assetId: string }>({
      query: ({ assetId }) => ({
        url: `/media-assets/${assetId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'MediaAssets', id: 'LIST' },
        { type: 'MediaAssets', id: 'QUOTA' },
      ],
    }),
    deleteMediaAsset: build.mutation<void, { assetId: string }>({
      query: ({ assetId }) => ({
        url: `/media-assets/${assetId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [
        { type: 'MediaAssets', id: 'LIST' },
        { type: 'MediaAssets', id: 'QUOTA' },
      ],
    }),
  }),
});

export const {
  useGetMediaQuotaQuery,
  useListMediaAssetsQuery,
  useCreateMediaAssetMutation,
  useUploadMediaAssetMutation,
  useCompleteMediaAssetMutation,
  useDeleteMediaAssetMutation,
} = mediaApi;

export { uploadMediaAssetFile } from '../lib/uploadMediaAsset.js';

export async function fetchMediaAssetDataUrl(
  assetId: string,
  token: string | null,
): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl}/media-assets/${encodeURIComponent(assetId)}/content`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (!response.ok) {
    throw new Error('Не удалось загрузить изображение из медиатеки');
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.readAsDataURL(blob);
  });
}
