import { describe, expect, it } from 'vitest';
import { extractRagSearchTerms } from './rag-search-terms.js';

describe('extractRagSearchTerms', () => {
  it('keeps distinctive contract terms and drops noise', () => {
    const terms = extractRagSearchTerms(
      'What is the late-payment penalty rate in Article 17? Mention ALPHA-MARKER if present.',
    );
    expect(terms).toEqual(expect.arrayContaining(['late-payment', 'penalty', 'article', 'alpha-marker']));
    expect(terms).not.toContain('page');
    expect(terms).not.toContain('what');
    expect(terms).not.toContain('mention');
  });
});
