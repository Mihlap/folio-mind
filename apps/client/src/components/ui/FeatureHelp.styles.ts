export const reportActionBtnBase =
  'inline-flex min-h-8 min-w-0 max-w-full cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium leading-snug transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[14rem]';
export const reportActionBtnPrimary = `${reportActionBtnBase} bg-folio-600 text-white hover:bg-folio-700`;
/** Как primary, но без ограничения ширины — для парных кнопок в колонке. */
export const reportActionBtnPrimaryStretch = reportActionBtnPrimary.replace(
  ' sm:max-w-[14rem]',
  '',
);
export const reportActionBtnSecondary = `${reportActionBtnBase} border border-slate-200 bg-white text-slate-700 hover:border-folio-300 hover:bg-slate-50`;
export const reportActionBtnHighlight = `${reportActionBtnBase} border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`;
export const reportActionBtnSoft = `${reportActionBtnBase} border border-folio-200 bg-folio-50 text-folio-800 hover:bg-folio-100`;
export const reportIconCircleBase =
  'inline-flex h-8 w-8 max-w-none shrink-0 cursor-pointer items-center justify-center rounded-full border text-[10px] font-bold uppercase leading-none tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const reportIconCirclePdf = `${reportIconCircleBase} border-sky-200/90 bg-sky-50 text-sky-800 hover:bg-sky-100`;
export const reportIconCircleWord = `${reportIconCircleBase} border-violet-200/90 bg-violet-50 text-violet-800 hover:bg-violet-100`;
export const reportActionsColumnClass = 'flex w-full min-w-0 flex-col items-stretch gap-1.5';
export const reportToolbarRowClass = 'flex w-full min-w-0 flex-wrap items-center gap-2';
