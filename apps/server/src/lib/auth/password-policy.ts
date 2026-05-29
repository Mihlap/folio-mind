import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .refine((p) => /[a-zа-яё]/.test(p), 'Нужна хотя бы одна строчная буква')
  .refine((p) => /[A-ZА-ЯЁ]/.test(p), 'Нужна хотя бы одна заглавная буква')
  .refine((p) => /\d/.test(p), 'Нужна хотя бы одна цифра');
