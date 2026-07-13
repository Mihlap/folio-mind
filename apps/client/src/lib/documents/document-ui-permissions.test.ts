import { describe, expect, it } from 'vitest';
import {
  canDownloadDocument,
  canUseDocumentToolSection,
  canViewDocumentHistory,
  normalizeDocumentRole,
  resolveEffectiveDocumentRole,
} from './document-ui-permissions.js';

describe('document UI permissions', () => {
  it('owner can use every document section', () => {
    expect(canUseDocumentToolSection('owner', 'team-access')).toBe(true);
    expect(canUseDocumentToolSection('owner', 'share')).toBe(true);
    expect(canUseDocumentToolSection('owner', 'edits')).toBe(true);
  });

  it('editor can edit document but cannot manage team or guest links', () => {
    expect(canUseDocumentToolSection('editor', 'optimize')).toBe(true);
    expect(canUseDocumentToolSection('editor', 'layout')).toBe(true);
    expect(canUseDocumentToolSection('editor', 'booklet')).toBe(true);
    expect(canUseDocumentToolSection('editor', 'edits')).toBe(true);
    expect(canUseDocumentToolSection('editor', 'team-access')).toBe(false);
    expect(canUseDocumentToolSection('editor', 'share')).toBe(false);
  });

  it('commenter can only use comments on the current version', () => {
    expect(canUseDocumentToolSection('commenter', 'annotations')).toBe(true);
    expect(canUseDocumentToolSection('commenter', 'diff')).toBe(false);
    expect(canUseDocumentToolSection('commenter', 'edits')).toBe(false);
    expect(canUseDocumentToolSection('commenter', 'layout')).toBe(false);
    expect(canViewDocumentHistory('commenter')).toBe(false);
    expect(canDownloadDocument('commenter')).toBe(false);
  });

  it('viewer can only view the current version', () => {
    expect(canUseDocumentToolSection('viewer', 'annotations')).toBe(false);
    expect(canUseDocumentToolSection('viewer', 'optimize')).toBe(false);
    expect(canViewDocumentHistory('viewer')).toBe(false);
    expect(canDownloadDocument('viewer')).toBe(false);
  });

  it('falls back to viewer for missing or invalid role', () => {
    expect(normalizeDocumentRole(undefined)).toBe('viewer');
    expect(normalizeDocumentRole('unexpected')).toBe('viewer');
  });

  it('keeps owner role even when cached myRole belongs to another member', () => {
    expect(resolveEffectiveDocumentRole('commenter', 'owner-1', 'owner-1')).toBe('owner');
    expect(resolveEffectiveDocumentRole('editor', 'owner-1', 'member-1')).toBe('editor');
  });
});

