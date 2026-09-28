export const QUALITY_LEVELS = [
  { id: 'low', label: '省电', ratio: 1, anisotropy: 2 },
  { id: 'standard', label: '标准', ratio: 1.5, anisotropy: 4 },
  { id: 'high', label: '高清', ratio: 2, anisotropy: 8 },
  { id: 'ultra', label: '超清', ratio: 3, anisotropy: 16 },
  { id: 'extreme', label: '极致', ratio: 4, anisotropy: 16 },
] as const;
export type TableQuality = typeof QUALITY_LEVELS[number]['id'];
export const DEFAULT_QUALITY: TableQuality = 'ultra';
export const QUALITY_STORAGE_KEY = 'musou.virtual.quality';
export function isTableQuality(value: unknown): value is TableQuality { return QUALITY_LEVELS.some(level => level.id === value); }
export function qualitySettings(quality: TableQuality) { return QUALITY_LEVELS.find(level => level.id === quality)!; }
/** Supersampling may exceed device DPR; cap total pixels and GPU renderbuffer dimensions. */
export function qualityPixelRatio(quality: TableQuality, width: number, height: number, maxSize: number) {
  return Math.min(qualitySettings(quality).ratio, Math.sqrt(8_000_000 / Math.max(1, width * height)), maxSize / Math.max(1, width, height));
}
