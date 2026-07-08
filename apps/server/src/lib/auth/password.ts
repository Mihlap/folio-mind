import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
const ROUNDS = 12;
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
export async function hashUnusablePassword(): Promise<string> {
  return hashPassword(randomBytes(32).toString('base64url'));
}
