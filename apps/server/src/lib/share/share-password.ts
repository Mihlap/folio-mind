import { verifyPassword, hashPassword } from '../auth/password.js';

export async function hashSharePassword(password: string): Promise<string> {
  return hashPassword(password.trim());
}

export async function verifySharePassword(
  password: string | undefined,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  if (!passwordHash) return true;
  if (!password?.trim()) return false;
  return verifyPassword(password.trim(), passwordHash);
}

export function readSharePasswordHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers['x-folio-share-password'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}
