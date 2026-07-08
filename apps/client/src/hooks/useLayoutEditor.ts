import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyLayoutTemplateObjects,
  isLayoutImageObject,
  layoutStepFraction,
  mergeBlankInsertion,
  pdfPointsToMm,
  rotateLayoutPageObject,
  sourceAfterFromDisplayAfter,
  templatePageSpan,
  layoutGuidesForPreset,
  clampLayoutRect,
  normalizeLayoutCrop,
  captionFromFileName,
  type LayoutFill,
  type LayoutImageObject,
  type LayoutMarginPresetId,
  type LayoutPageObject,
  type LayoutRect,
  type LayoutTemplateStoredObject,
  type LayoutShapeObject,
  type LayoutBlankInsertion,
} from '@folio-mind/store';
import { filterImageFiles, isImageFile } from '../lib/layout/isImageFile.js';
import { compressLayoutImageSrcForDraft } from '../lib/layout/normalizeLayoutImage.js';

const STORAGE_PREFIX = 'folio-layout-draft:';

type StoredLayoutDraft = {
  objects: LayoutPageObject[];
  blankInsertions: LayoutBlankInsertion[];
};

function readStoredDraft(versionId: string): StoredLayoutDraft {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${versionId}`);
    if (!raw) return { objects: [], blankInsertions: [] };
    const parsed = JSON.parse(raw) as StoredLayoutDraft | LayoutPageObject[];
    if (Array.isArray(parsed)) {
      return { objects: parsed, blankInsertions: [] };
    }
    return {
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      blankInsertions: Array.isArray(parsed.blankInsertions) ? parsed.blankInsertions : [],
    };
  } catch {
    return { objects: [], blankInsertions: [] };
  }
}

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

function clampPage(page: number, maxPage: number): number {
  const normalized = Math.max(1, Math.floor(page));
  if (maxPage > 0) return Math.min(normalized, maxPage);
  return normalized;
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
  const [objects, setObjects] = useState<LayoutPageObject[]>([]);
  const [blankInsertions, setBlankInsertions] = useState<LayoutBlankInsertion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [gridStepMm, setGridStepMm] = useState(10);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [distributeAcrossPages, setDistributeAcrossPages] = useState(false);
  const [marginPresetId, setMarginPresetId] = useState<LayoutMarginPresetId>('a4-safe');
  const [showPageGuides, setShowPageGuides] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const skipSaveRef = useRef(true);

  const pageWidthMm = pdfPointsToMm(pageWidthPt);
  const pageHeightMm = pdfPointsToMm(pageHeightPt);
  const pageGuides = useMemo(
    () => layoutGuidesForPreset(pageWidthMm, pageHeightMm, marginPresetId),
    [marginPresetId, pageHeightMm, pageWidthMm],
  );
  const snapStep = snapEnabled ? layoutStepFraction(gridStepMm, pageWidthMm) : 0;

  useEffect(() => {
    if (!versionId) {
      setObjects([]);
      setBlankInsertions([]);
      setSelectedId(null);
      return;
    }
    skipSaveRef.current = true;
    const draft = readStoredDraft(versionId);
    setObjects(draft.objects);
    setBlankInsertions(draft.blankInsertions);
    setSelectedId(null);
  }, [versionId]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (!versionId) return;
    const saveTimer = window.setTimeout(() => {
      try {
        const payload: StoredLayoutDraft = { objects, blankInsertions };
        sessionStorage.setItem(`${STORAGE_PREFIX}${versionId}`, JSON.stringify(payload));
      } catch {
        // Session storage is best-effort; layout editing should keep working if it is unavailable.
      }
    }, 350);
    return () => window.clearTimeout(saveTimer);
  }, [versionId, objects, blankInsertions]);

  const addImageFromDataUrl = useCallback(
    async (
      dataUrl: string,
      page = viewerPage,
      stackIndex?: number,
      meta?: { sourceFileName?: string; caption?: string },
    ) => {
      const targetPage = clampPage(page, pageCount);
      const index =
        stackIndex ?? objects.filter((item) => Number(item.page) === targetPage).length;
      const compressed = await compressLayoutImageSrcForDraft(dataUrl);
      const aspect = await loadImageAspect(compressed);
      const created = buildLayoutImageFromDataUrl(
        compressed,
        aspect,
        targetPage,
        pageWidthPt,
        pageHeightPt,
        index,
        meta,
      );
      setObjects((prev) => [...prev, created]);
      setSelectedId(created.id);
      return created;
    },
    [objects, pageCount, pageHeightPt, pageWidthPt, viewerPage],
  );

  const addImageFromFile = useCallback(
    async (file: File, page = viewerPage, stackIndex?: number) => {
      const targetPage = clampPage(page, pageCount);
      const index =
        stackIndex ?? objects.filter((item) => Number(item.page) === targetPage).length;
      const created = await buildLayoutImageObject(
        file,
        targetPage,
        pageWidthPt,
        pageHeightPt,
        index,
      );
      setObjects((prev) => [...prev, created]);
      setSelectedId(created.id);
      return created;
    },
    [objects, pageCount, pageHeightPt, pageWidthPt, viewerPage],
  );

  const addShape = useCallback(
    (fill: LayoutFill, page = viewerPage) => {
      const targetPage = clampPage(page, pageCount);
      const width = 0.5;
      const height = 0.18;
      const created: LayoutShapeObject = {
        kind: 'shape',
        id: crypto.randomUUID(),
        page: targetPage,
        fill,
        rect: {
          x: (1 - width) / 2,
          y: (1 - height) / 2,
          width,
          height,
        },
      };
      setObjects((prev) => [...prev, created]);
      setSelectedId(created.id);
      return created;
    },
    [pageCount, viewerPage],
  );

  const updateShapeFill = useCallback((id: string, fill: LayoutFill) => {
    setObjects((prev) =>
      prev.map((item) => (item.id === id && item.kind === 'shape' ? { ...item, fill } : item)),
    );
  }, []);

  const applyTemplate = useCallback(
    (templateObjects: LayoutTemplateStoredObject[], targetPage = viewerPage) => {
      const created = applyLayoutTemplateObjects(templateObjects, targetPage, pageCount);
      if (created.length === 0) return [];
      setObjects((prev) => [...prev, ...created]);
      setSelectedId(created[0]!.id);
      return created;
    },
    [pageCount, viewerPage],
  );

  const applyTemplateOnBlankPage = useCallback(
    (
      templateObjects: LayoutTemplateStoredObject[],
      options: { insertAfterPage?: number } = {},
    ) => {
      const maxObjectPage = objects.reduce(
        (max, item) => Math.max(max, Number(item.page) || 0),
        0,
      );
      const displayPageCount = Math.max(pageCount, maxObjectPage, viewerPage);
      const displayInsertAfter = Math.min(
        Math.max(1, Math.floor(options.insertAfterPage ?? displayPageCount)),
        displayPageCount,
      );
      const templatePages = templatePageSpan(templateObjects);
      const targetPage = displayInsertAfter + 1;
      const sourceAfter = sourceAfterFromDisplayAfter(
        displayInsertAfter,
        pageCount,
        blankInsertions,
      );

      const created = applyLayoutTemplateObjects(templateObjects, targetPage, 0);
      if (created.length === 0) return { created, targetPage, displayInsertAfter };

      setObjects((prev) => {
        const shifted = prev.map((item) => {
          const itemPage = Number(item.page);
          if (itemPage > displayInsertAfter) {
            return { ...item, page: itemPage + templatePages };
          }
          return item;
        });
        return [...shifted, ...created];
      });
      setBlankInsertions((prev) => mergeBlankInsertion(prev, sourceAfter, templatePages));
      setSelectedId(created[0]!.id);
      return { created, targetPage, displayInsertAfter };
    },
    [blankInsertions, objects, pageCount, viewerPage],
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
      const maxPage = pageCount > 0 ? pageCount : 0;
      const startPage = clampPage(options.startPage ?? viewerPage, maxPage);
      const distribute = options.distributeAcrossPages ?? false;
      const created: LayoutImageObject[] = [];
      let page = startPage;
      const stackByPage = new Map<number, number>();
      for (const item of objects) {
        const itemPage = Number(item.page);
        stackByPage.set(itemPage, (stackByPage.get(itemPage) ?? 0) + 1);
      }
      let stackIndex = stackByPage.get(startPage) ?? 0;
      for (const file of list) {
        if (distribute && maxPage > 0 && page > maxPage) break;
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
        throw new Error(
          maxPage > 0 && startPage > maxPage
            ? `Текущая страница (${startPage}) выходит за пределы документа (${maxPage} стр.)`
            : 'Недостаточно страниц для всех выбранных изображений',
        );
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

  const updateObjectCrop = useCallback((id: string, crop: LayoutRect) => {
    setObjects((prev) =>
      prev.map((item) =>
        item.id === id && isLayoutImageObject(item)
          ? { ...item, crop: normalizeLayoutCrop(crop) }
          : item,
      ),
    );
  }, []);

  const resetSelectedCrop = useCallback(() => {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.map((item) =>
        item.id === selectedId && isLayoutImageObject(item) ? { ...item, crop: undefined } : item,
      ),
    );
  }, [selectedId]);

  const fitSelectedToSafeArea = useCallback(() => {
    if (!selectedId || !pageGuides) return;
    const safe = pageGuides.safe;
    setObjects((prev) =>
      prev.map((item) => (item.id === selectedId ? { ...item, rect: { ...safe } } : item)),
    );
  }, [pageGuides, selectedId]);

  const rotateSelected = useCallback(
    (deltaDeg: number) => {
      if (!selectedId) return;
      setObjects((prev) =>
        prev.map((item) =>
          item.id === selectedId ? rotateLayoutPageObject(item, deltaDeg) : item,
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

  const replaceSelectedImageSrc = useCallback(
    async (dataUrl: string, meta?: { sourceFileName?: string; caption?: string }) => {
      if (!selectedId) return;
      const compressed = await compressLayoutImageSrcForDraft(dataUrl);
      setObjects((prev) =>
        prev.map((item) =>
          item.id === selectedId && isLayoutImageObject(item)
            ? {
                ...item,
                imageSrc: compressed,
                crop: undefined,
                ...(meta?.sourceFileName ? { sourceFileName: meta.sourceFileName } : {}),
                ...(meta?.caption !== undefined ? { caption: meta.caption } : {}),
              }
            : item,
        ),
      );
    },
    [selectedId],
  );

  const updateSelectedCaption = useCallback(
    (caption: string) => {
      if (!selectedId) return;
      setObjects((prev) =>
        prev.map((item) =>
          item.id === selectedId && isLayoutImageObject(item) ? { ...item, caption } : item,
        ),
      );
    },
    [selectedId],
  );

  const autoCaptionSelected = useCallback(() => {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId || !isLayoutImageObject(item)) return item;
        const source = item.sourceFileName ?? item.caption ?? '';
        const caption = source ? captionFromFileName(source) : '';
        return caption ? { ...item, caption } : item;
      }),
    );
  }, [selectedId]);

  const autoFillCaptionsFromFilenames = useCallback(() => {
    setObjects((prev) =>
      prev.map((item) => {
        if (!isLayoutImageObject(item) || item.caption?.trim()) return item;
        const source = item.sourceFileName;
        if (!source) return item;
        const caption = captionFromFileName(source);
        return caption ? { ...item, caption } : item;
      }),
    );
  }, []);

  const alignSelected = useCallback(
    (mode: 'center' | 'left' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (!selectedId) return;
      const margin = pageGuides?.safe;
      setObjects((prev) =>
        prev.map((item) => {
          if (item.id !== selectedId) return item;
          const rect = { ...item.rect };
          const minX = margin?.x ?? 0;
          const minY = margin?.y ?? 0;
          const maxX = margin ? margin.x + margin.width : 1;
          const maxY = margin ? margin.y + margin.height : 1;
          switch (mode) {
            case 'left':
              rect.x = minX;
              break;
            case 'right':
              rect.x = Math.max(minX, maxX - rect.width);
              break;
            case 'center':
              rect.x = minX + (maxX - minX - rect.width) / 2;
              break;
            case 'top':
              rect.y = minY;
              break;
            case 'bottom':
              rect.y = Math.max(minY, maxY - rect.height);
              break;
            case 'middle':
              rect.y = minY + (maxY - minY - rect.height) / 2;
              break;
          }
          return { ...item, rect: clampLayoutRect(rect) };
        }),
      );
    },
    [pageGuides?.safe, selectedId],
  );

  const pageObjectCount = objects.filter((item) => Number(item.page) === viewerPage).length;
  const clearDraft = useCallback(() => {
    setObjects([]);
    setBlankInsertions([]);
    setSelectedId(null);
    setEnabled(false);
  }, []);
  const objectCountByPage = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of objects) {
      const page = Number(item.page);
      counts[page] = (counts[page] ?? 0) + 1;
    }
    return counts;
  }, [objects]);

  return {
    enabled,
    setEnabled,
    objects,
    blankInsertions,
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
    distributeAcrossPages,
    setDistributeAcrossPages,
    marginPresetId,
    setMarginPresetId,
    showPageGuides,
    setShowPageGuides,
    pageGuides,
    cropMode,
    setCropMode,
    snapStep,
    addImageFromDataUrl,
    addImageFromFile,
    addImagesFromFiles,
    addShape,
    updateShapeFill,
    applyTemplate,
    applyTemplateOnBlankPage,
    updateObjectRect,
    updateObjectCrop,
    resetSelectedCrop,
    fitSelectedToSafeArea,
    rotateSelected,
    removeSelected,
    replaceSelectedImageSrc,
    updateSelectedCaption,
    autoCaptionSelected,
    autoFillCaptionsFromFilenames,
    alignSelected,
    clearDraft,
    pageObjectCount,
    totalObjectCount: objects.length,
    objectCountByPage,
    pageWidthPt,
    pageHeightPt,
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
  const dataUrl = await compressLayoutImageSrcForDraft(rawDataUrl);
  const aspect = await loadImageAspect(dataUrl);
  const width = 0.4;
  const pageAspect = pageWidthPt / pageHeightPt;
  const height = Math.min(0.55, (width / aspect) * pageAspect);
  const shift = Math.min(0.12, stackIndex * 0.035);
  return buildLayoutImageObjectFromParts(dataUrl, page, width, height, shift, {
    sourceFileName: file.name,
    caption: captionFromFileName(file.name) || undefined,
  });
}

function buildLayoutImageFromDataUrl(
  dataUrl: string,
  aspect: number,
  page: number,
  pageWidthPt: number,
  pageHeightPt: number,
  stackIndex = 0,
  meta?: { sourceFileName?: string; caption?: string },
): LayoutImageObject {
  const width = 0.4;
  const pageAspect = pageWidthPt / pageHeightPt;
  const height = Math.min(0.55, (width / aspect) * pageAspect);
  const shift = Math.min(0.12, stackIndex * 0.035);
  const caption =
    meta?.caption ??
    (meta?.sourceFileName ? captionFromFileName(meta.sourceFileName) : undefined);
  return buildLayoutImageObjectFromParts(dataUrl, page, width, height, shift, {
    sourceFileName: meta?.sourceFileName,
    caption: caption || undefined,
  });
}

function buildLayoutImageObjectFromParts(
  dataUrl: string,
  page: number,
  width: number,
  height: number,
  shift: number,
  meta?: { sourceFileName?: string; caption?: string },
): LayoutImageObject {
  return {
    id: crypto.randomUUID(),
    kind: 'image',
    page,
    imageSrc: dataUrl,
    rotation: 0,
    sourceFileName: meta?.sourceFileName,
    caption: meta?.caption,
    rect: {
      x: Math.min(1 - width, (1 - width) / 2 + shift),
      y: Math.min(1 - height, (1 - height) / 2 + shift),
      width,
      height,
    },
  };
}
