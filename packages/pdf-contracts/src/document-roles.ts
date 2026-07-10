export const DOCUMENT_MEMBER_ROLES = ['editor', 'commenter', 'viewer'] as const;

export type DocumentMemberRole = (typeof DOCUMENT_MEMBER_ROLES)[number];

export type DocumentAccessRole = 'owner' | DocumentMemberRole;

export type DocumentCapability = 'view' | 'comment' | 'edit' | 'manage' | 'manage_members';

const CAPABILITY_RANK: Record<DocumentCapability, number> = {
  view: 1,
  comment: 2,
  edit: 3,
  manage: 4,
  manage_members: 5,
};

const ROLE_CAPABILITIES: Record<DocumentAccessRole, DocumentCapability[]> = {
  owner: ['view', 'comment', 'edit', 'manage', 'manage_members'],
  editor: ['view', 'comment', 'edit'],
  commenter: ['view', 'comment'],
  viewer: ['view'],
};

export function isDocumentMemberRole(value: string): value is DocumentMemberRole {
  return (DOCUMENT_MEMBER_ROLES as readonly string[]).includes(value);
}

export function roleHasCapability(role: DocumentAccessRole, capability: DocumentCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function minCapabilityForRole(role: DocumentAccessRole): DocumentCapability {
  const caps = ROLE_CAPABILITIES[role];
  return caps.reduce((min, cap) => (CAPABILITY_RANK[cap] < CAPABILITY_RANK[min] ? cap : min), caps[0]!);
}

export const DOCUMENT_ROLE_LABELS: Record<DocumentAccessRole, string> = {
  owner: 'Владелец',
  editor: 'Редактор',
  commenter: 'Комментатор',
  viewer: 'Наблюдатель',
};
