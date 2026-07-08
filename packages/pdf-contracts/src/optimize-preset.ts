export const OPTIMIZE_PRESETS = ['email', 'archive', 'print', 'none'] as const;

export type OptimizePreset = (typeof OPTIMIZE_PRESETS)[number];

export type OptimizePresetInfo = {
  id: OptimizePreset;
  label: string;
  description: string;
};

export const OPTIMIZE_PRESET_INFO: Record<OptimizePreset, OptimizePresetInfo> = {
  email: {
    id: 'email',
    label: 'Для почты и мессенджера',
    description: 'Самый маленький файл — удобно отправить в письме или чате. Текст остаётся чётким',
  },
  archive: {
    id: 'archive',
    label: 'Архив',
    description: 'Умеренное сжатие — баланс размера и качества картинок',
  },
  print: {
    id: 'print',
    label: 'Максимальное качество',
    description: 'Почти без изменений — как оригинал, размер уменьшится незначительно',
  },
  none: {
    id: 'none',
    label: 'Без сжатия',
    description: 'Точная копия файла как отдельная версия',
  },
};

export function isOptimizePreset(value: string): value is OptimizePreset {
  return (OPTIMIZE_PRESETS as readonly string[]).includes(value);
}
