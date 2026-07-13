import { describe, expect, it } from 'vitest';
import { roleHasCapability } from './document-roles.js';

describe('document roles', () => {
  it('owner has manage_members', () => {
    expect(roleHasCapability('owner', 'manage_members')).toBe(true);
    expect(roleHasCapability('owner', 'manage_share')).toBe(true);
  });

  it('editor can edit but not manage members', () => {
    expect(roleHasCapability('editor', 'edit')).toBe(true);
    expect(roleHasCapability('editor', 'view_history')).toBe(true);
    expect(roleHasCapability('editor', 'download')).toBe(true);
    expect(roleHasCapability('editor', 'manage_share')).toBe(false);
    expect(roleHasCapability('editor', 'manage_members')).toBe(false);
  });

  it('commenter can comment on the current version only', () => {
    expect(roleHasCapability('commenter', 'comment')).toBe(true);
    expect(roleHasCapability('commenter', 'edit')).toBe(false);
    expect(roleHasCapability('commenter', 'view_history')).toBe(false);
    expect(roleHasCapability('commenter', 'download')).toBe(false);
  });

  it('viewer can only view the current version', () => {
    expect(roleHasCapability('viewer', 'view')).toBe(true);
    expect(roleHasCapability('viewer', 'comment')).toBe(false);
    expect(roleHasCapability('viewer', 'view_history')).toBe(false);
    expect(roleHasCapability('viewer', 'download')).toBe(false);
  });
});
