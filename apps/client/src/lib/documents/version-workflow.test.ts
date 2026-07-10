import { describe, expect, it } from 'vitest';
import {
  buildScenarioSteps,
  buildSharePreChecklist,
  buildVersionWorkflowContext,
  findActiveShareLinkOnOtherVersion,
  inferDefaultToolScenario,
  isToolGroupVisible,
} from './version-workflow.js';

const baseVersion = {
  id: 'v3',
  version: 3,
  versionLabel: 'draft' as const,
  status: 'ready',
  size: String(4.2 * 1024 * 1024),
  mimeType: 'application/pdf',
  pageCount: 12,
  createdAt: '2026-07-10T00:00:00.000Z',
};

describe('findActiveShareLinkOnOtherVersion', () => {
  it('returns mismatch when active link targets another version', () => {
    const result = findActiveShareLinkOnOtherVersion(
      [
        {
          id: 'l1',
          versionId: 'v2',
          version: 2,
          expiresAt: '',
          revokedAt: null,
          allowDownload: false,
          allowBookletZip: false,
          createdAt: '',
          active: true,
          url: 'https://example.com',
        },
      ],
      'v3',
    );
    expect(result).toEqual({ activeLinkVersionId: 'v2', activeLinkVersionNumber: 2 });
  });

  it('returns null when link matches current version', () => {
    const result = findActiveShareLinkOnOtherVersion(
      [
        {
          id: 'l1',
          versionId: 'v3',
          version: 3,
          expiresAt: '',
          revokedAt: null,
          allowDownload: false,
          allowBookletZip: false,
          createdAt: '',
          active: true,
          url: 'https://example.com',
        },
      ],
      'v3',
    );
    expect(result).toBeNull();
  });
});

describe('buildVersionWorkflowContext', () => {
  it('builds summary for active version', () => {
    const ctx = buildVersionWorkflowContext({
      activeVersion: baseVersion,
      versionReady: true,
      reviewStatus: 'in_review',
      shareLinks: [],
      openGuestCommentsCount: 2,
      needsFixMarksCount: 1,
      acceptedEditsCount: 0,
    });
    expect(ctx).toMatchObject({
      versionNumber: 3,
      versionLabel: 'Черновик',
      openGuestCommentsCount: 2,
      needsFixMarksCount: 1,
      documentReviewStatusLabel: 'На согласовании',
    });
    expect(ctx?.sizeMb).toBe('4.2 МБ');
  });
});

describe('inferDefaultToolScenario', () => {
  it('prefers contract when docx source exists', () => {
    expect(
      inferDefaultToolScenario({
        activeVersion: { ...baseVersion, sourceDocxKey: 'docx-key' },
        acceptedEditsCount: 0,
        layoutObjectCount: 5,
        projectId: 'p1',
      }),
    ).toBe('contract');
  });

  it('prefers booklet for project without docx', () => {
    expect(
      inferDefaultToolScenario({
        activeVersion: baseVersion,
        acceptedEditsCount: 0,
        layoutObjectCount: 0,
        projectId: 'p1',
      }),
    ).toBe('booklet');
  });
});

describe('isToolGroupVisible', () => {
  it('hides edits in booklet scenario', () => {
    expect(isToolGroupVisible('edits', 'booklet')).toBe(false);
    expect(isToolGroupVisible('layout', 'booklet')).toBe(true);
  });

  it('hides layout in contract scenario', () => {
    expect(isToolGroupVisible('layout', 'contract')).toBe(false);
    expect(isToolGroupVisible('edits', 'contract')).toBe(true);
  });
});

describe('buildScenarioSteps', () => {
  it('marks booklet share step active when layout exists but no link', () => {
    const steps = buildScenarioSteps('booklet', {
      layoutObjectCount: 2,
      hasShareLinkOnCurrentVersion: false,
      openGuestCommentsCount: 0,
      acceptedEditsCount: 0,
      versionReady: true,
    });
    expect(steps.find((s) => s.id === 'layout')?.done).toBe(true);
    expect(steps.find((s) => s.id === 'share')?.active).toBe(true);
  });
});

describe('buildSharePreChecklist', () => {
  it('flags needs-fix marks as incomplete', () => {
    const items = buildSharePreChecklist({
      versionReady: true,
      needsFixMarksCount: 2,
      reviewStatus: 'draft',
      allowBookletZip: false,
    });
    expect(items.find((i) => i.id === 'marks')?.done).toBe(false);
    expect(items.find((i) => i.id === 'ready')?.done).toBe(true);
  });
});
