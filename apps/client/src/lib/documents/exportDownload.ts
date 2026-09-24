import { toUserErrorMessage } from '@folio-mind/store';

export function openDownloadUrl(url: string): void {
  const popup = window.open(url, '_blank');
  if (popup) {
    popup.opener = null;
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function formatConvertFailure(detail?: string): string {
  const headline = 'Не удалось сконвертировать файл в DOCX.';
  const friendly = toUserErrorMessage(detail, '').trim();
  if (!friendly) return `${headline} Попробуйте ещё раз или загрузите исходный DOCX Word.`;
  const short = friendly.length > 160 ? `${friendly.slice(0, 157)}…` : friendly;
  return `${headline} ${short}`;
}
