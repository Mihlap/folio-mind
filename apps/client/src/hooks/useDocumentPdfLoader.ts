import { useCallback, useEffect, useRef, useState } from 'react';
import {
  documentPdfAuthHeaders,
  getDocumentPdfFileUrl,
} from '../lib/documents/documentPdf.js';

type UseDocumentPdfLoaderParams = {
  documentId: string | undefined;
  versionId: string | undefined;
  versionStatus: string | undefined;
  token: string | null;
};

function isRetryablePdfError(message: string): boolean {
  return /HTTP (404|500|502|503|504)|Failed to fetch|aborted|timeout|network|Missing PDF|Unexpected/i.test(
    message,
  );
}

export function useDocumentPdfLoader({
  documentId,
  versionId,
  versionStatus,
  token,
}: UseDocumentPdfLoaderParams) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfHttpHeaders, setPdfHttpHeaders] = useState<Record<string, string>>({});
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfViewerKey, setPdfViewerKey] = useState(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const maxRetries = versionStatus === 'processing' ? 20 : 8;

  useEffect(() => {
    if (!documentId || !versionId || versionStatus === 'pending_upload') {
      setPdfUrl(null);
      setPdfHttpHeaders({});
      setPdfError(null);
      setPdfLoading(false);
      return;
    }

    if (versionStatus === 'failed') {
      setPdfUrl(null);
      setPdfHttpHeaders({});
      setPdfError(
        'Версия не обработана — повторите «Применить правки» или удалите версию. Если ошибка повторяется, проверьте текстовый слой PDF и точность поля «было».',
      );
      setPdfLoading(false);
      return;
    }

    retryAttemptRef.current = 0;
    setPdfUrl(getDocumentPdfFileUrl(documentId, versionId));
    setPdfHttpHeaders(documentPdfAuthHeaders(token));
    setPdfError(null);
    setPdfLoading(true);
    setPdfViewerKey((key) => key + 1);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [documentId, versionId, versionStatus, token]);

  const onPdfDocumentLoad = useCallback(() => {
    retryAttemptRef.current = 0;
    setPdfLoading(false);
    setPdfError(null);
  }, []);

  const onPdfDocumentLoadError = useCallback(
    (message: string) => {
      const attempt = retryAttemptRef.current + 1;
      if (isRetryablePdfError(message) && attempt < maxRetries) {
        retryAttemptRef.current = attempt;
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 8000);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          setPdfViewerKey((key) => key + 1);
        }, delay);
        return;
      }
      setPdfError(
        versionStatus === 'processing'
          ? 'PDF ещё не готов — подождите завершения обработки или обновите страницу.'
          : 'Не удалось загрузить PDF. Сервер не может прочитать файл из S3 (Timeweb) — проверьте сеть/VPN или используйте локальный MinIO.',
      );
      setPdfLoading(false);
    },
    [maxRetries, versionStatus],
  );

  const resetPdf = useCallback(() => {
    retryAttemptRef.current = 0;
    setPdfUrl(null);
    setPdfHttpHeaders({});
    setPdfError(null);
    setPdfLoading(false);
    setPdfViewerKey((key) => key + 1);
  }, []);

  return {
    pdfUrl,
    pdfHttpHeaders,
    pdfError,
    pdfLoading,
    pdfViewerKey,
    onPdfDocumentLoad,
    onPdfDocumentLoadError,
    resetPdf,
  };
}
