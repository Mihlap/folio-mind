export const FILES_ROOT = 'folioFiles';

export const S3_PREFIX = {
  originals: `${FILES_ROOT}/originals`,
  previews: `${FILES_ROOT}/previews`,
  processing: `${FILES_ROOT}/processing`,
  exports: `${FILES_ROOT}/exports`,
  ragSources: `${FILES_ROOT}/rag-sources`,
  media: `${FILES_ROOT}/media`,
} as const;

export type S3PrefixKey = keyof typeof S3_PREFIX;
