import { describe, expect, it } from 'vitest';
import { roleHasCapability } from './document-roles.js';

describe('document roles', () => {
  it('owner has manage_members', () => {
    expect(roleHasCapability('owner', 'manage_members')).toBe(true);
  });

  it('editor can edit but not manage members', () => {
    expect(roleHasCapability('editor', 'edit')).toBe(true);
    expect(roleHasCapability('editor', 'manage_members')).toBe(false);
  });

  it('commenter can comment only', () => {
    expect(roleHasCapability('commenter', 'comment')).toBe(true);
    expect(roleHasCapability('commenter', 'edit')).toBe(false);
  });

  it('viewer is read-only', () => {
    expect(roleHasCapability('viewer', 'view')).toBe(true);
    expect(roleHasCapability('viewer', 'comment')).toBe(false);
  });
});
