-- Выполнить один раз после миграции, чтобы старые пользователи могли войти без повторной верификации:
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;
