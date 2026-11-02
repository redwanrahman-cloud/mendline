import { describe, it, expect } from 'vitest';
import { proposeCandidates, previewEffect, type Example } from '../../src/rules/index';

describe('bounded proposal API', () => {
  it('keeps competing trim and prefix/literal candidates without choosing', () => {
    const result = proposeCandidates('sku', [{ input: ' 001', output: '001' }, { input: ' 002', output: '002' }]);
    expect(result.status).toBe('ABSTAIN');
    expect(result.candidates.map(c => c.operation.kind)).toEqual(expect.arrayContaining(['trim', 'removePrefix', 'literalReplace']));
    expect(result.selectedCandidate).toBeNull();
  });
  it.each([
    ['trim', [{ input: ' 001 ', output: '001' }, { input: '\t002\n', output: '002' }]],
    ['lower', [{ input: 'Ab', output: 'ab' }, { input: 'CD', output: 'cd' }]],
    ['upper', [{ input: 'ab', output: 'AB' }, { input: 'Cd', output: 'CD' }]],
    ['literalReplace', [{ input: 'A-01-02', output: 'A/01/02' }, { input: 'B-03', output: 'B/03' }]],
    ['addPrefix', [{ input: '001', output: 'ID:001' }, { input: '002', output: 'ID:002' }]],
    ['removePrefix', [{ input: 'ID:001', output: '001' }, { input: 'ID:002', output: '002' }]],
  ] as [string, Example[]][])('finds %s with exact previews', (kind, examples) => {
    const result = proposeCandidates('sku', examples);
    expect(result.candidates.some(c => c.operation.kind === kind)).toBe(true);
    for (const c of result.candidates) {
      expect(c.preview).toEqual(examples);
      expect(c.requiresConfirmation).toBe(true);
      expect(previewEffect(c, 'sku', examples[0].input)).toEqual(examples[0]);
      expect(previewEffect(c, 'sku', 'unmatched')).toBeNull();
      expect(previewEffect(c, 'another column', examples[0].input)).toBeNull();
    }
  });
  it('rejects conflicting, missing, duplicate-only and unchanged evidence', () => {
    for (const examples of [[], [{ input: 'x', output: 'y' }],
      [{ input: 'x', output: 'y' }, { input: 'x', output: 'z' }],
      [{ input: 'x', output: 'y' }, { input: 'x', output: 'y' }],
      [{ input: '001', output: '001' }, { input: '01', output: '01' }]]) {
      expect(proposeCandidates('sku', examples).candidates).toEqual([]);
    }
    expect(proposeCandidates(' ', [{ input: 'a', output: 'A' }, { input: 'b', output: 'B' }]).status).toBe('ABSTAIN');
  });
  it('abstains for unsupported conflicting operations', () => {
    expect(proposeCandidates('sku', [{ input: ' a ', output: 'a' }, { input: 'b', output: 'B' }]).candidates).toEqual([]);
  });
  it('abstains on colliding outputs and proposes unique operations without selecting', () => {
    expect(proposeCandidates('sku', [{ input: 'A', output: 'a' }, { input: 'a', output: 'a' }]).candidates).toEqual([]);
    const result = proposeCandidates('sku', [{ input: 'Ab', output: 'ab' }, { input: 'CD', output: 'cd' }]);
    expect(result.status).toBe('PROPOSED');
    expect(result.selectedCandidate).toBeNull();
  });
  it('preserves exact whitespace, leading zeroes and empty cell data', () => {
    const examples = [{ input: '001', output: 'P001' }, { input: '', output: 'P' }];
    const c = proposeCandidates(' sku ', examples).candidates[0];
    expect(c.scope.column).toBe(' sku ');
    expect(previewEffect(c, ' sku ', '')).toEqual(examples[1]);
    expect(previewEffect(c, ' sku ', '01')).toBeNull();
    expect(previewEffect(c, ' sku ', '001 ')).toBeNull();
  });
  it('is deterministic, non-mutating and treats executable text as data', () => {
    const examples = Object.freeze([Object.freeze({ input: '001', output: 'globalThis.pwned=true001' }),
      Object.freeze({ input: '002', output: 'globalThis.pwned=true002' })]);
    const before = JSON.stringify(examples);
    expect(proposeCandidates('sku', examples)).toEqual(proposeCandidates('sku', examples));
    expect(JSON.stringify(examples)).toBe(before);
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
  });
  it('bounds work and rejects non-string runtime data', () => {
    expect(proposeCandidates('x', Array(33).fill({ input: 'a', output: 'b' })).candidates).toEqual([]);
    expect(proposeCandidates('x', [{ input: 'x'.repeat(257), output: 'b' }, { input: 'c', output: 'd' }]).candidates).toEqual([]);
    expect(proposeCandidates('x', [{ input: 1, output: 'b' }, { input: 'c', output: 'd' }] as unknown as Example[]).candidates).toEqual([]);
  });
});
