/**
 * Minimal, dependency-free semver range matching.
 *
 * Supports the subset commonly used to target app versions:
 *   - '*' / '' (any)
 *   - exact: '1.2.3'
 *   - comparators: '>=1.2.0', '>1.2.0', '<=2.0.0', '<2.0.0', '=1.2.3'
 *   - caret: '^1.2.3'  (>=1.2.3 <2.0.0)
 *   - tilde: '~1.2.3'  (>=1.2.3 <1.3.0)
 *   - wildcard: '1.2.x', '1.x'
 *   - AND (space): '>=1.2.0 <2.0.0'
 *   - OR ('||'):   '1.x || >=2.0.0'
 *
 * Pre-release/build metadata is ignored (compared on major.minor.patch only).
 * This mirrors the implementation embedded in the manifest edge function.
 */

export type SemverTuple = [number, number, number];

export function parseVersion(input: string): SemverTuple | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/^v/i, '').split(/[-+]/)[0];
  const parts = cleaned.split('.');
  if (parts.length === 0 || parts.length > 3) return null;
  const nums: number[] = [];
  for (let i = 0; i < 3; i++) {
    const raw = parts[i] ?? '0';
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return null;
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2]];
}

export function compareVersions(a: SemverTuple, b: SemverTuple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function satisfiesComparator(
  version: SemverTuple,
  comparator: string
): boolean {
  const token = comparator.trim();
  if (!token || token === '*' || token === 'x' || token === 'X') return true;

  // Wildcard: 1.2.x / 1.x  -> range on the defined prefix
  if (/^\d+(\.\d+)?\.[xX*]$/.test(token) || /^\d+\.[xX*]$/.test(token)) {
    const segs = token.split('.');
    const major = Number(segs[0]);
    if (
      segs.length === 2 ||
      segs[1] === 'x' ||
      segs[1] === 'X' ||
      segs[1] === '*'
    ) {
      // 1.x  -> >=1.0.0 <2.0.0   (when minor is wildcard)
      if (segs.length === 2) {
        return version[0] === major;
      }
    }
    // 1.2.x -> major+minor must match
    const minor = Number(segs[1]);
    return version[0] === major && version[1] === minor;
  }

  const opMatch = token.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/);
  if (!opMatch) return false;
  const op = opMatch[1] ?? '=';
  const target = parseVersion(opMatch[2]);
  if (!target) return false;

  const cmp = compareVersions(version, target);
  switch (op) {
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '=':
      return cmp === 0;
    case '^': {
      // >=target and < next significant (major, or minor when major===0)
      if (cmp < 0) return false;
      if (target[0] > 0) return version[0] === target[0];
      if (target[1] > 0) return version[0] === 0 && version[1] === target[1];
      return version[0] === 0 && version[1] === 0 && version[2] === target[2];
    }
    case '~': {
      // >=target and < next minor
      if (cmp < 0) return false;
      return version[0] === target[0] && version[1] === target[1];
    }
    default:
      return false;
  }
}

/**
 * Whether `version` satisfies `range`. Unknown/empty range = matches anything.
 * An unparseable version never matches a concrete range.
 */
export function satisfies(
  version: string,
  range: string | null | undefined
): boolean {
  if (!range || range.trim() === '' || range.trim() === '*') return true;

  const parsed = parseVersion(version);
  if (!parsed) return false;

  const orGroups = range.split('||');
  return orGroups.some((group) => {
    const comparators = group.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) return true;
    return comparators.every((c) => satisfiesComparator(parsed, c));
  });
}

/** True when the string is a usable range expression. */
export function isValidRange(range: string): boolean {
  if (!range || range.trim() === '' || range.trim() === '*') return true;
  return range.split('||').every((group) => {
    const comparators = group.trim().split(/\s+/).filter(Boolean);
    return (
      comparators.length > 0 &&
      comparators.every((c) => {
        if (c === '*' || /[xX*]/.test(c)) return true;
        const m = c.match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/);
        return !!m && parseVersion(m[2]) !== null;
      })
    );
  });
}
