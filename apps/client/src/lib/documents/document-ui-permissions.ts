import {
  DOCUMENT_MEMBER_ROLES,
  roleHasCapability,
  type DocumentAccessRole,
} from '@folio-mind/store';
import type { ToolSectionId } from '../../components/ui/ToolAccordionSection.ids.js';

export const ROLE_RESTRICTION_HINT: Record<DocumentAccessRole, string> = {
  owner: '',
  editor: 'Доступно только владельцу документа',
  commenter: 'Роль «Комментатор» позволяет только просматривать текущую версию и оставлять комментарии',
  viewer: 'Роль «Наблюдатель» позволяет только просматривать текущую версию',
};

export function normalizeDocumentRole(role: string | null | undefined): DocumentAccessRole {
  if (
    role === 'owner' ||
    (role && (DOCUMENT_MEMBER_ROLES as readonly string[]).includes(role))
  ) {
    return role as DocumentAccessRole;
  }
  return 'viewer';
}

export function resolveEffectiveDocumentRole(
  myRole: string | null | undefined,
  ownerId: string | null | undefined,
  currentUserId: string | null | undefined,
): DocumentAccessRole {
  if (ownerId && currentUserId && ownerId === currentUserId) {
    return 'owner';
  }
  return normalizeDocumentRole(myRole);
}

export function readUserIdFromAuthToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1]!)) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function canUseDocumentToolSection(
  role: DocumentAccessRole,
  sectionId: ToolSectionId,
): boolean {
  if (sectionId === 'team-access' || sectionId === 'share') {
    return roleHasCapability(role, 'manage_share');
  }
  if (sectionId === 'annotations') {
    return roleHasCapability(role, 'comment');
  }
  return roleHasCapability(role, 'edit');
}

export function canDownloadDocument(role: DocumentAccessRole): boolean {
  return roleHasCapability(role, 'download');
}

export function canViewDocumentHistory(role: DocumentAccessRole): boolean {
  return roleHasCapability(role, 'view_history');
}

