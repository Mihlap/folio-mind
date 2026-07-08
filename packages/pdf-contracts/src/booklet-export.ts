/** Минимальный DPI для печати A4/A3 (ориентир для бюро). */
export const PRINT_MIN_DPI = 150;

/** Рекомендуемый DPI для JPG в пакете заказчику. */
export const BOOKLET_EXPORT_DEFAULT_JPEG_DPI = 150;

/** Максимум страниц в одном экспорте (лимит worker). */
export const BOOKLET_EXPORT_MAX_PAGES = 200;

export type BookletExportImageFormat = 'jpeg' | 'png';

export type PrintReadinessLevel = 'ok' | 'warning' | 'issue';

export type PrintReadinessImageFinding = {
  index: number;
  widthPx: number;
  heightPx: number;
  estimatedDpi: number | null;
  level: PrintReadinessLevel;
  note: string;
};

export type PrintReadinessPageFinding = {
  page: number;
  imageCount: number;
  minEstimatedDpi: number | null;
  level: PrintReadinessLevel;
  images: PrintReadinessImageFinding[];
};

export type PrintReadinessReport = {
  pageCount: number;
  overallLevel: PrintReadinessLevel;
  fonts: {
    embeddedFontObjects: number;
    level: PrintReadinessLevel;
    note: string;
  };
  pages: PrintReadinessPageFinding[];
  warnings: string[];
  checkedAt: string;
};

export type BookletExportJobResult = {
  zipS3Key: string;
  pageCount: number;
  jpegDpi: number;
  pdfA: boolean;
  pdfAApplied: boolean;
  printReadiness: PrintReadinessReport;
  message: string;
};

export type PagesExportJobResult = {
  zipS3Key: string;
  pages: number[];
  format: BookletExportImageFormat;
  dpi: number;
  message: string;
};
