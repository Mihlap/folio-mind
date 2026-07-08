import { useLazyGetDownloadUrlQuery } from '@folio-mind/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCachedPdfBytes,
  loadDocumentPdfBytes,
} from '../lib/documents/documentPdf.js';

type UseDocumentPdfLoaderParams = {
  documentId: string | undefined;
  versionId: string | undefined;
  versionStatus: string | undefined;
  token: string | null;
};

type PdfViewMode = 'presigned-url' | 'bytes';

export type PdfLoadStage =
  | 'idle'
  | 'cache'
  | 'api-link'
  | 's3-direct'
  | 's3-proxy'
  | 'opening'
  | 'processing'
  | 'ready'
  | 'error';

export function pdfLoadStageLabel(stage: PdfLoadStage): string {
  switch (stage) {
    case 'cache':
      return 'Открываем сохранённую копию…';
    case 'api-link':
      return 'Подготовка к просмотру…';
    case 's3-direct':
    case 's3-proxy':
      return 'Загружаем документ…';
    case 'opening':
      return 'Открываем PDF…';
    case 'processing':
      return 'Собираем PDF с правками…';
    case 'ready':
      return 'Готово';
    case 'error':
      return 'Не удалось загрузить';
    default:
      return 'Загрузка PDF…';
  }
}

const PRESIGNED_TIMEOUT_MS = 10_000;
const BYTES_TIMEOUT_MS = 32_000;
const PROCESSING_RETRY_MS = 4_000;

function isVersionProcessing(status: string | undefined): boolean {
  return status === 'processing';
}

export function useDocumentPdfLoader({
  documentId,
  versionId,
  versionStatus,
  token,
}: UseDocumentPdfLoaderParams) {
  const [fetchDownloadUrl] = useLazyGetDownloadUrlQuery();
  const [pdfViewMode, setPdfViewMode] = useState<PdfViewMode>('presigned-url');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfSourceKey, setPdfSourceKey] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadStage, setPdfLoadStage] = useState<PdfLoadStage>('idle');
  const [pdfViewerKey, setPdfViewerKey] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const loadGenerationRef = useRef(0);
  const bytesAttemptRef = useRef(false);
  const presignedLoadedRef = useRef(false);

  const reloadPdf = useCallback(() => {
    bytesAttemptRef.current = false;
    setReloadToken((value) => value + 1);
  }, []);

  const markProcessingWait = useCallback(() => {
    setPdfLoadStage('processing');
    setPdfLoading(true);
    setPdfError(null);
  }, []);

  const loadPdfBytes = useCallback(
    async (generation: number, signal: AbortSignal) => {
      if (!documentId || !versionId) return;
      bytesAttemptRef.current = true;
      setPdfViewMode('bytes');
      setPdfUrl(null);
      setPdfLoading(true);
      setPdfLoadStage('s3-proxy');
      setPdfError(null);

      try {
        const bytes = await loadDocumentPdfBytes({
          documentId,
          versionId,
          token,
          signal,
          preferProxy: true,
          fetchPresignedUrl: async () => {
            const { url } = await fetchDownloadUrl({ documentId, versionId }).unwrap();
            return url;
          },
        });
        if (generation !== loadGenerationRef.current) return;
        setPdfData(bytes);
        setPdfViewerKey((key) => key + 1);
        setPdfLoadStage('opening');
        setPdfLoading(false);
      } catch {
        if (generation !== loadGenerationRef.current) return;
        if (isVersionProcessing(versionStatus)) {
          markProcessingWait();
          return;
        }
        setPdfLoadStage('error');
        setPdfError('Не удалось загрузить документ. Нажмите «Повторить» или обновите страницу.');
        setPdfLoading(false);
      }
    },
    [documentId, versionId, token, fetchDownloadUrl, versionStatus, markProcessingWait],
  );

  useEffect(() => {
    bytesAttemptRef.current = false;
    presignedLoadedRef.current = false;

    if (!documentId || !versionId || versionStatus === 'pending_upload') {
      setPdfUrl(null);
      setPdfData(null);
      setPdfSourceKey(null);
      setPdfError(null);
      setPdfLoadStage('idle');
      setPdfLoading(false);
      return;
    }

    if (versionStatus === 'failed') {
      setPdfUrl(null);
      setPdfData(null);
      setPdfSourceKey(null);
      setPdfError(
        'Версия не обработана — повторите «Применить правки» или удалите версию. Если ошибка повторяется, проверьте текстовый слой PDF и точность поля «было».',
      );
      setPdfLoadStage('error');
      setPdfLoading(false);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const abortController = new AbortController();
    let bytesTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (generation !== loadGenerationRef.current) return;
      if (isVersionProcessing(versionStatus)) {
        markProcessingWait();
        return;
      }
      setPdfUrl(null);
      setPdfData(null);
      setPdfLoadStage('error');
      setPdfError(message);
      setPdfLoading(false);
    };

    setPdfSourceKey(`${documentId}/${versionId}`);
    setPdfError(null);

    const cached = getCachedPdfBytes(documentId, versionId);
    if (cached) {
      setPdfViewMode('bytes');
      setPdfUrl(null);
      setPdfData(cached);
      setPdfLoadStage('cache');
      setPdfLoading(false);
      setPdfViewerKey((key) => key + 1);
      return () => abortController.abort();
    }

    setPdfUrl(null);
    setPdfData(null);
    setPdfLoading(true);
    setPdfLoadStage('api-link');
    setPdfViewMode('presigned-url');

    const presignedTimer = setTimeout(() => {
      if (presignedLoadedRef.current || bytesAttemptRef.current) return;
      bytesTimer = setTimeout(() => {
        abortController.abort();
        fail(
          'Документ долго загружается. Подождите немного или нажмите «Повторить».',
        );
      }, BYTES_TIMEOUT_MS);
      void loadPdfBytes(generation, abortController.signal);
    }, PRESIGNED_TIMEOUT_MS);

    void fetchDownloadUrl({ documentId, versionId })
      .unwrap()
      .then(({ url }) => {
        if (generation !== loadGenerationRef.current) return;
        setPdfUrl(url);
        setPdfLoadStage('s3-direct');
        setPdfViewerKey((key) => key + 1);
      })
      .catch(() => {
        clearTimeout(presignedTimer);
        if (bytesAttemptRef.current) return;
        if (isVersionProcessing(versionStatus)) {
          markProcessingWait();
          return;
        }
        bytesTimer = setTimeout(() => {
          abortController.abort();
          fail('Не удалось открыть документ. Проверьте подключение и попробуйте снова.');
        }, BYTES_TIMEOUT_MS);
        void loadPdfBytes(generation, abortController.signal);
      });

    return () => {
      abortController.abort();
      clearTimeout(presignedTimer);
      clearTimeout(bytesTimer);
    };
  }, [documentId, versionId, versionStatus, token, fetchDownloadUrl, reloadToken, loadPdfBytes, markProcessingWait]);

  const onPdfDocumentLoad = useCallback(() => {
    presignedLoadedRef.current = true;
    setPdfLoadStage('ready');
    setPdfLoading(false);
    setPdfError(null);
  }, []);

  const onPdfDocumentLoadError = useCallback(
    (message: string) => {
      if (!bytesAttemptRef.current) {
        void loadPdfBytes(loadGenerationRef.current, new AbortController().signal);
        return;
      }
      if (isVersionProcessing(versionStatus)) {
        markProcessingWait();
        return;
      }
      setPdfLoadStage('error');
      setPdfError(`Не удалось открыть PDF. ${message}. Нажмите «Повторить».`);
      setPdfLoading(false);
    },
    [loadPdfBytes, versionStatus, markProcessingWait],
  );

  const resetPdf = useCallback(() => {
    setPdfUrl(null);
    setPdfData(null);
    setPdfSourceKey(null);
    setPdfError(null);
    setPdfLoadStage('idle');
    setPdfLoading(false);
    reloadPdf();
  }, [reloadPdf]);

  const pdfReady = pdfViewMode === 'presigned-url' ? Boolean(pdfUrl) : Boolean(pdfData);
  const pdfProcessing = isVersionProcessing(versionStatus) && !pdfReady;

  useEffect(() => {
    if (!pdfProcessing) return;
    const timer = setInterval(() => {
      reloadPdf();
    }, PROCESSING_RETRY_MS);
    return () => clearInterval(timer);
  }, [pdfProcessing, reloadPdf]);

  return {
    pdfViewMode,
    pdfUrl,
    pdfData,
    pdfSourceKey,
    pdfError,
    pdfLoading,
    pdfLoadStage,
    pdfReady,
    pdfProcessing,
    pdfViewerKey,
    onPdfDocumentLoad,
    onPdfDocumentLoadError,
    resetPdf,
    reloadPdf,
  };
}
