import { describe, expect, it } from 'vitest';
import { isDocumentVersionAccessible, resolveUserDocumentRole } from './document-permissions.js';

const versions = [
  { id: 'v3', status: 'ready' },
  { id: 'v2', status: 'ready' },
  { id: 'v1', status: 'failed' },
];

describe('document permissions', () => {
  it('allows owner and editor to access version history', () => {
    expect(isDocumentVersionAccessible('owner', versions, 'v2')).toBe(true);
    expect(isDocumentVersionAccessible('editor', versions, 'v2')).toBe(true);
  });

  it('limits commenter and viewer to current ready version', () => {
    expect(isDocumentVersionAccessible('commenter', versions, 'v3')).toBe(true);
    expect(isDocumentVersionAccessible('commenter', versions, 'v2')).toBe(false);
    expect(isDocumentVersionAccessible('viewer', versions, 'v3')).toBe(true);
    expect(isDocumentVersionAccessible('viewer', versions, 'v2')).toBe(false);
  });

  it('resolves explicit member roles', () => {
    const document = {
      ownerId: 'owner',
      members: [
        { userId: 'editor', role: 'editor' },
        { userId: 'commenter', role: 'commenter' },
      ],
    };
    expect(resolveUserDocumentRole(document, 'owner')).toBe('owner');
    expect(resolveUserDocumentRole(document, 'editor')).toBe('editor');
    expect(resolveUserDocumentRole(document, 'commenter')).toBe('commenter');
  });

  it('falls back to project member role when not a document member', () => {
    const document = {
      ownerId: 'owner',
      members: [],
      project: {
        members: [
          { userId: 'p-editor', role: 'editor' },
          { userId: 'p-viewer', role: 'viewer' },
        ],
      },
    };
    expect(resolveUserDocumentRole(document, 'p-editor')).toBe('editor');
    expect(resolveUserDocumentRole(document, 'p-viewer')).toBe('viewer');
    expect(resolveUserDocumentRole(document, 'owner')).toBe('owner');
  });

  it('prefers document member role over project member role', () => {
    const document = {
      ownerId: 'owner',
      members: [{ userId: 'both', role: 'commenter' }],
      project: { members: [{ userId: 'both', role: 'editor' }] },
    };
    expect(resolveUserDocumentRole(document, 'both')).toBe('commenter');
  });

  it('ignores invalid project member roles', () => {
    const document = {
      ownerId: 'owner',
      members: [],
      project: { members: [{ userId: 'bad', role: 'administrator' }] },
    };
    expect(resolveUserDocumentRole(document, 'bad')).toBe('viewer');
  });
});

