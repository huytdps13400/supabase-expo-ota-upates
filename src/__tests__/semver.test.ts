import {
  parseVersion,
  compareVersions,
  satisfies,
  isValidRange,
} from '../utils/semver';

describe('parseVersion', () => {
  it('parses full and partial versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
    expect(parseVersion('1')).toEqual([1, 0, 0]);
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3]);
  });

  it('rejects invalid input', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders correctly', () => {
    expect(compareVersions([1, 0, 0], [1, 0, 0])).toBe(0);
    expect(compareVersions([1, 2, 0], [1, 1, 9])).toBe(1);
    expect(compareVersions([1, 0, 0], [2, 0, 0])).toBe(-1);
  });
});

describe('satisfies', () => {
  it('matches anything for empty/star ranges', () => {
    expect(satisfies('1.2.3', '')).toBe(true);
    expect(satisfies('1.2.3', '*')).toBe(true);
    expect(satisfies('1.2.3', null)).toBe(true);
  });

  it('exact match', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  it('comparators', () => {
    expect(satisfies('1.5.0', '>=1.2.0')).toBe(true);
    expect(satisfies('1.1.0', '>=1.2.0')).toBe(false);
    expect(satisfies('1.5.0', '>1.5.0')).toBe(false);
    expect(satisfies('2.0.0', '<=2.0.0')).toBe(true);
    expect(satisfies('2.0.1', '<2.0.1')).toBe(false);
  });

  it('AND ranges (space)', () => {
    expect(satisfies('1.5.0', '>=1.2.0 <2.0.0')).toBe(true);
    expect(satisfies('2.0.0', '>=1.2.0 <2.0.0')).toBe(false);
  });

  it('OR ranges (||)', () => {
    expect(satisfies('1.4.0', '1.x || >=2.0.0')).toBe(true);
    expect(satisfies('2.3.0', '1.x || >=2.0.0')).toBe(true);
    expect(satisfies('0.9.0', '1.x || >=2.0.0')).toBe(false);
  });

  it('caret ranges', () => {
    expect(satisfies('1.4.0', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfies('0.2.5', '^0.2.0')).toBe(true);
    expect(satisfies('0.3.0', '^0.2.0')).toBe(false);
  });

  it('tilde ranges', () => {
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
  });

  it('wildcards', () => {
    expect(satisfies('1.4.0', '1.x')).toBe(true);
    expect(satisfies('2.0.0', '1.x')).toBe(false);
    expect(satisfies('1.2.7', '1.2.x')).toBe(true);
    expect(satisfies('1.3.0', '1.2.x')).toBe(false);
  });

  it('unparseable version never matches a concrete range', () => {
    expect(satisfies('not-a-version', '>=1.0.0')).toBe(false);
  });
});

describe('isValidRange', () => {
  it('accepts valid ranges', () => {
    expect(isValidRange('*')).toBe(true);
    expect(isValidRange('>=1.2.0 <2.0.0')).toBe(true);
    expect(isValidRange('^1.0.0 || ~2.1.0')).toBe(true);
    expect(isValidRange('1.x')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidRange('>=abc')).toBe(false);
    expect(isValidRange('not version')).toBe(false);
  });
});
