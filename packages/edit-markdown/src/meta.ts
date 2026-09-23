import type { AnnotationEditMeta, EditContentFormat } from './types.js';

export function readContentFormat(meta: unknown): EditContentFormat {
  if (!meta || typeof meta !== 'object') return 'plain';
  const format = (meta as AnnotationEditMeta).contentFormat;
  return format === 'markdown' ? 'markdown' : 'plain';
}

export function readAcceptedEditContentFormat(meta: unknown): EditContentFormat {
  if (!meta || typeof meta !== 'object') return 'markdown';
  const format = (meta as AnnotationEditMeta).contentFormat;
  return format === 'plain' ? 'plain' : 'markdown';
}

export function mergeAnnotationMeta(
  meta: unknown,
  patch: Partial<AnnotationEditMeta>,
): AnnotationEditMeta {
  const base =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as AnnotationEditMeta) }
      : {};
  return { ...base, ...patch };
}

export function annotationMetaWithContentFormat(
  meta: unknown,
  contentFormat: EditContentFormat | undefined,
): AnnotationEditMeta | undefined {
  if (contentFormat !== 'markdown') {
    if (!meta || typeof meta !== 'object') return undefined;
    const merged = { ...(meta as AnnotationEditMeta) };
    delete merged.contentFormat;
    return Object.keys(merged).length > 0 ? merged : undefined;
  }
  return mergeAnnotationMeta(meta, { contentFormat: 'markdown' });
}
