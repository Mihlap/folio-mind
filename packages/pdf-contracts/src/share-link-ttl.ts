export const SHARE_LINK_TTL_PRESETS = [
  { id: '12h', label: '12 часов', ms: 12 * 60 * 60 * 1000 },
  { id: '1d', label: '1 день', ms: 24 * 60 * 60 * 1000 },
  { id: '3d', label: '3 дня', ms: 3 * 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 дней', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '14d', label: '14 дней', ms: 14 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 дней', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type ShareLinkTtlPresetId = (typeof SHARE_LINK_TTL_PRESETS)[number]['id'];

export const SHARE_LINK_TTL_PRESET_IDS: ShareLinkTtlPresetId[] = SHARE_LINK_TTL_PRESETS.map(
  (preset) => preset.id,
);

export const DEFAULT_SHARE_LINK_TTL_PRESET: ShareLinkTtlPresetId = '7d';

export function shareLinkTtlMs(presetId: ShareLinkTtlPresetId): number {
  const preset = SHARE_LINK_TTL_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`Unknown share link TTL preset: ${presetId}`);
  }
  return preset.ms;
}

export function shareLinkTtlLabel(presetId: ShareLinkTtlPresetId): string {
  const preset = SHARE_LINK_TTL_PRESETS.find((item) => item.id === presetId);
  return preset?.label ?? presetId;
}

export function isShareLinkTtlPresetId(value: string): value is ShareLinkTtlPresetId {
  return (SHARE_LINK_TTL_PRESET_IDS as readonly string[]).includes(value);
}
