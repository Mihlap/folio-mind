import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  layoutStepFraction,
  pdfPointsToMm,
  rotateLayoutObject,
  type LayoutImageObject,
  type LayoutRect,
} from '@folio-mind/store';
import { filterImageFiles, isImageFile } from '../lib/layout/isImageFile.js';
import { normalizeLayoutImageSrcForPdf } from '../lib/layout/normalizeLayoutImage.js';

const STORAGE_PREFIX = 'folio-layout-draft:';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function loadImageAspect(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalHeight <= 0) reject(new Error('Некорректное изображение'));
      else resolve(img.naturalWidth / img.naturalHeight);
    };
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = dataUrl;
  });
}

type Options = {
  versionId: string | undefined;
  viewerPage: number;
  pageCount?: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
};

export function useLayoutEditor({
  versionId,
  viewerPage,
  pageCount = 0,
  pageWidthPt = 595,
  pageHeightPt = 842,
}: Options) {
  const [enabled, setEnabled] = useState(false);
  const [objects, setObjects] = useState<LayoutImageObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [gridStepMm, setGridStepMm] = useState(10);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const pageWidthMm = pdfPointsToMm(pageWidthPt);
  const snapStep = snapEnabled ? layoutStepFraction(gridStepMm, pageWidthMm) : 0;

  useEffect(() => {
    if (!versionId) {
      setObjects([]);
      setSelectedId(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${versionId}`);
      setObjects(raw ? (JSON.parse(raw) as LayoutImageObject[]) : []);
    } catch {
      setObjects([]);
    }
    setSelectedId(null);
  }, [versionId]);

  useEffect(() => {
    if (!versionId) return;
    try {
      sessionStorage.setItem(`${STORAGE_PREFIX}${versionId}`, JSON.stringify(objects));
    } catch {
      // Черновик с крупными data URL может превысить квоту — объекты остаются в памяти.
    }
  }, [versionId, objects]);

  const addImageFromFile = useCallback(
    async (file: File, page = viewerPage, stackIndex?: number) => {
      const index =
        stackIndex ?? objects.filter((item) => item.page === page).length;
      const created = await buildLayoutImageObject(
        file,
        page,
        pageWidthPt,
        pageHeightPt,
        index,
      );
      setObjects((prev) => [...prev, created]);
      setSelectedId(created.id);
      return created;
    },
    [objects, pageHeightPt, pageWidthPt, viewerPage],
  );

  const addImagesFromFiles = useCallback(
    async (
      files: FileList | File[],
      options: { startPage?: number; distributeAcrossPages?: boolean } = {},
    ) => {
      const list = filterImageFiles(files);
      if (list.length === 0) {
        throw new Error('Выберите один или несколько файлов изображений (PNG, JPG, WebP)');
      }
      const startPage = options.startPage ?? viewerPage;
      const distribute = options.distributeAcrossPages ?? false;
      const created: LayoutImageObject[] = [];
      let page = startPage;
      let stackIndex = objects.filter((item) => item.page === startPage).length;
      for (const file of list) {
        if (distribute && pageCount > 0 && page > pageCount) break;
        const targetPage = distribute ? page : startPage;
        const index = distribute ? 0 : stackIndex;
        created.push(
          await buildLayoutImageObject(file, targetPage, pageWidthPt, pageHeightPt, index),
        );
        if (distribute) {
          page += 1;
        } else {
          stackIndex += 1;
        }
      }
      if (created.length === 0) {
        throw new Error('Недостаточно страниц для всех выбранных изображений');
      }
      setObjects((prev) => [...prev, ...created]);
      const last = created[created.length - 1]!;
      setSelectedId(last.id);
      return created;
    },
    [objects, pageCount, pageHeightPt, pageWidthPt, viewerPage],
  );

  const updateObjectRect = useCallback((id: string, rect: LayoutRect) => {
    setObjects((prev) => prev.map((item) => (item.id === id ? { ...item, rect } : item)));
  }, []);

  const rotateSelected = useCallback(
    (deltaDeg: number) => {
      if (!selectedId) return;
      setObjects((prev) =>
        prev.map((item) =>
          item.id === selectedId ? rotateLayoutObject(item, deltaDeg) : item,
        ),
      );
    },
    [selectedId],
  );

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const pageObjectCount = objects.filter((item) => item.page === viewerPage).length;
  const objectCountByPage = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of objects) {
      counts[item.page] = (counts[item.page] ?? 0) + 1;
    }
    return counts;
  }, [objects]);

  return {
    enabled,
    setEnabled,
    objects,
    selectedId,
    setSelectedId,
    showGrid,
    setShowGrid,
    showRulers,
    setShowRulers,
    gridStepMm,
    setGridStepMm,
    snapEnabled,
    setSnapEnabled,
    snapStep,
    addImageFromFile,
    addImagesFromFiles,
    updateObjectRect,
    rotateSelected,
    removeSelected,
    pageObjectCount,
    totalObjectCount: objects.length,
    objectCountByPage,
  };
}

export type LayoutEditorState = ReturnType<typeof useLayoutEditor>;

async function buildLayoutImageObject(
  file: File,
  page: number,
  pageWidthPt: number,
  pageHeightPt: number,
  stackIndex = 0,
): Promise<LayoutImageObject> {
  if (!isImageFile(file)) {
    throw new Error('Поддерживаются только файлы изображений (PNG, JPG, WebP)');
  }
  const rawDataUrl = await readFileAsDataUrl(file);
  const dataUrl = await normalizeLayoutImageSrcForPdf(rawDataUrl);
  const aspect = await loadImageAspect(dataUrl);
  const width = 0.4;
  const pageAspect = pageWidthPt / pageHeightPt;
  const height = Math.min(0.55, (width / aspect) * pageAspect);
  const shift = Math.min(0.12, stackIndex * 0.035);
  return {
    id: crypto.randomUUID(),
    page,
    imageSrc: dataUrl,
    rotation: 0,
    rect: {
      x: Math.min(1 - width, (1 - width) / 2 + shift),
      y: Math.min(1 - height, (1 - height) / 2 + shift),
      width,
      height,
    },
  };
}
