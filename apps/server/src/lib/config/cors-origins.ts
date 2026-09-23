export function parseCorsOrigins(raw: string): string | string[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return raw.trim() || 'http://localhost:5173';
  if (parts.length === 1) return parts[0]!;
  return parts;
}
