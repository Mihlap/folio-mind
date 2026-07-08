import { useRef } from 'react';
import {
  useAttachSourceDocxMutation,
  useCompleteDocxUploadMutation,
} from '@folio-mind/store';
import { hasUserSourceDocx } from '../../lib/documents/sourceDocx.js';
import { uploadSourceDocx } from '@folio-mind/store';
import { useAppSelector } from '../../hooks/index.js';

type Props = {
  documentId: string;
  versionId: string;
  sourceDocxKey?: string | null;
  onAttached?: () => void;
};

export function DocumentSourceDocxBanner({ documentId, versionId, sourceDocxKey, onAttached }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useAppSelector((s) => s.auth.token);
  const [attachSourceDocx] = useAttachSourceDocxMutation();
  const [completeDocxUpload] = useCompleteDocxUploadMutation();

  if (hasUserSourceDocx(sourceDocxKey)) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) return;
    const { docxS3Key, uploadUrl } = await attachSourceDocx({
      documentId,
      versionId,
      fileName: file.name,
    }).unwrap();
    await uploadSourceDocx({
      documentId,
      versionId,
      file,
      uploadUrl,
      docxS3Key,
      token,
      completeDocxUpload: async (args) => completeDocxUpload(args).unwrap(),
    });
    onAttached?.();
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="font-medium">Для качественного «Применить правки» добавьте исходный DOCX</p>
      <p className="mt-1 text-amber-900/80">
        Word-файл не заменит PDF в просмотрщике, но улучшит автозамены в договоре.
      </p>
      <button
        type="button"
        className="mt-2 rounded-md bg-amber-800 px-3 py-1.5 text-white hover:bg-amber-900"
        onClick={() => inputRef.current?.click()}
      >
        Прикрепить DOCX
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
