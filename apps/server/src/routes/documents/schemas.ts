import { z } from 'zod';
import { UPLOAD_RATE_LIMIT } from '../../lib/auth/rate-limits.js';
import { OPTIMIZE_PRESETS } from '@folio-mind/pdf-contracts';
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const uploadRateLimit = { rateLimit: UPLOAD_RATE_LIMIT };
export const errorBody = z.object({ error: z.string() });
export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestVersion: z
    .object({
      id: z.string(),
      version: z.number(),
      status: z.string(),
      size: z.string(),
      mimeType: z.string(),
      sourceDocxKey: z.string().nullable(),
    })
    .nullable(),
});
export const splitPagesSchema = z.object({
  pages: z
    .array(z.number().int().min(1))
    .min(1)
    .max(500)
    .refine(
      (pages) => new Set(pages).size === pages.length,
      'Номера страниц должны быть уникальны',
    ),
});
export const mergeVersionsSchema = z.object({
  versionIds: z
    .array(z.string().min(1))
    .min(2)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'versionIds must be unique'),
});
export const optimizePdfSchema = z.object({
  preset: z.enum(OPTIMIZE_PRESETS),
});
const textDiffLineSchema = z.object({
  type: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
});
const pageTextDiffSchema = z.object({
  page: z.number(),
  status: z.enum(['unchanged', 'modified', 'added', 'removed']),
  baseText: z.string().optional(),
  compareText: z.string().optional(),
  lines: z.array(textDiffLineSchema).optional(),
});
const acceptedEditDiffItemSchema = z.object({
  page: z.number(),
  quote: z.string(),
  content: z.string(),
});
export const versionCompareResponseSchema = z.object({
  baseVersionId: z.string(),
  compareVersionId: z.string(),
  baseVersion: z.number(),
  compareVersion: z.number(),
  summary: z.object({
    unchangedPages: z.number(),
    modifiedPages: z.number(),
    addedPages: z.number(),
    removedPages: z.number(),
  }),
  pages: z.array(pageTextDiffSchema),
  acceptedEdits: z.object({
    baseCount: z.number(),
    compareCount: z.number(),
    onlyInCompare: z.array(acceptedEditDiffItemSchema),
    onlyInBase: z.array(acceptedEditDiffItemSchema),
    modified: z.array(
      z.object({
        page: z.number(),
        baseQuote: z.string(),
        compareQuote: z.string(),
        baseContent: z.string(),
        compareContent: z.string(),
      }),
    ),
  }),
  pageCount: z.object({
    base: z.number().nullable(),
    compare: z.number().nullable(),
  }),
});
const versionIntegritySignalSchema = z.object({
  id: z.string(),
  weight: z.enum(['high', 'medium', 'low']),
  message: z.string(),
});
export const versionIntegrityResponseSchema = z.object({
  versionId: z.string(),
  status: z.enum(['pending', 'intact', 'modified', 'cannot_verify', 'failed']).nullable(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  analyzedAt: z.string().nullable(),
  details: z
    .object({
      revisionCount: z.number(),
      hasPrevTrailer: z.boolean(),
      creator: z.string().nullable(),
      producer: z.string().nullable(),
      creationDate: z.string().nullable(),
      modDate: z.string().nullable(),
      hasDigitalSignature: z.boolean(),
      signals: z.array(versionIntegritySignalSchema),
      analyzedWith: z.enum(['qpdf', 'builtin']),
    })
    .nullable(),
});
export const versionListItemSchema = z.object({
  id: z.string(),
  version: z.number(),
  status: z.string(),
  size: z.string(),
  mimeType: z.string(),
  pageCount: z.number().nullable(),
  createdAt: z.string(),
  integrityStatus: z.string().nullable(),
  integritySummary: z.string().nullable(),
  confidenceLevel: z.enum(['green', 'yellow', 'red']).nullable(),
  confidenceScore: z.number().int().nullable(),
  confidenceSummary: z.string().nullable(),
  confidenceDetails: z.record(z.unknown()).nullable(),
  sourceVersionId: z.string().nullable(),
  sourceDocxKey: z.string().nullable(),
  hasAppliedDocx: z.boolean(),
});
