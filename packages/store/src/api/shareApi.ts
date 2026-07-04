import { baseApi } from './baseApi.js';
import type { ShareLinkTtlPresetId } from '@folio-mind/pdf-contracts';

export type { ShareLinkTtlPresetId };
export {
  SHARE_LINK_TTL_PRESETS,
  SHARE_LINK_TTL_PRESET_IDS,
  DEFAULT_SHARE_LINK_TTL_PRESET,
  shareLinkTtlLabel,
} from '@folio-mind/pdf-contracts';

export type ShareLinkItem = {
  id: string;
  versionId: string;
  version: number;
  expiresAt: string;
  revokedAt: string | null;
  allowDownload: boolean;
  allowBookletZip: boolean;
  createdAt: string;
  active: boolean;
};

export type CreateShareLinkBody = {
  versionId?: string;
  ttl?: ShareLinkTtlPresetId;
  allowDownload?: boolean;
  allowBookletZip?: boolean;
  password?: string;
};

export type CreateShareLinkResponse = {
  id: string;
  url: string;
  expiresAt: string;
  versionId: string;
  version: number;
};

export const shareApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listShareLinks: build.query<{ items: ShareLinkItem[] }, string>({
      query: (documentId) => `/documents/${documentId}/share-links`,
      providesTags: (_r, _e, documentId) => [{ type: 'ShareLinks', id: documentId }],
    }),
    createShareLink: build.mutation<
      CreateShareLinkResponse,
      { documentId: string; body: CreateShareLinkBody }
    >({
      query: ({ documentId, body }) => ({
        url: `/documents/${documentId}/share-links`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { documentId }) => [{ type: 'ShareLinks', id: documentId }],
    }),
    revokeShareLink: build.mutation<{ ok: true }, { documentId: string; linkId: string }>({
      query: ({ documentId, linkId }) => ({
        url: `/documents/${documentId}/share-links/${linkId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { documentId }) => [{ type: 'ShareLinks', id: documentId }],
    }),
  }),
});

export const {
  useListShareLinksQuery,
  useCreateShareLinkMutation,
  useRevokeShareLinkMutation,
} = shareApi;

export type GuestShareMeta = {
  title: string;
  version: number;
  pageCount: number | null;
  expiresAt: string;
  allowDownload: boolean;
  allowBookletZip: boolean;
  bookletZipAvailable: boolean;
  previewStatus: 'processing' | 'ready' | 'partial' | 'unavailable';
};

export type GuestSharePreviews = {
  pageCount: number;
  pages: Array<{ page: number; url: string }>;
  status: 'processing' | 'ready' | 'partial' | 'unavailable';
  pendingPages?: number[];
};

export class GuestSharePasswordRequiredError extends Error {
  readonly requiresPassword = true;

  constructor(message: string) {
    super(message);
    this.name = 'GuestSharePasswordRequiredError';
  }
}

async function parseGuestShareError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; requiresPassword?: boolean };
  if (res.status === 401 && body.requiresPassword) {
    throw new GuestSharePasswordRequiredError(body.error ?? 'Требуется пароль');
  }
  throw new Error(body.error ?? `Ошибка ${res.status}`);
}

export async function fetchGuestShareMeta(
  token: string,
  sharePassword?: string | null,
): Promise<GuestShareMeta> {
  const res = await fetch(`${apiBaseUrl()}/public/share/${encodeURIComponent(token)}`, {
    headers: sharePassword ? { 'X-Folio-Share-Password': sharePassword } : {},
  });
  if (!res.ok) await parseGuestShareError(res);
  return res.json() as Promise<GuestShareMeta>;
}

export async function fetchGuestSharePreviews(
  token: string,
  from: number,
  to: number,
  sharePassword?: string | null,
): Promise<GuestSharePreviews> {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  const res = await fetch(
    `${apiBaseUrl()}/public/share/${encodeURIComponent(token)}/previews?${params}`,
    { headers: sharePassword ? { 'X-Folio-Share-Password': sharePassword } : {} },
  );
  if (!res.ok) await parseGuestShareError(res);
  return res.json() as Promise<GuestSharePreviews>;
}

export async function fetchGuestShareBookletDownload(
  token: string,
  sharePassword?: string | null,
): Promise<{ url: string; expiresInSeconds: number }> {
  const res = await fetch(
    `${apiBaseUrl()}/public/share/${encodeURIComponent(token)}/booklet-download`,
    { headers: sharePassword ? { 'X-Folio-Share-Password': sharePassword } : {} },
  );
  if (!res.ok) await parseGuestShareError(res);
  return res.json() as Promise<{ url: string; expiresInSeconds: number }>;
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
