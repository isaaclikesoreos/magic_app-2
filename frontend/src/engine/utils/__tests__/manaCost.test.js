import { describe, it, expect } from 'vitest';
import { parseManaCost, calculateCMC, getTotalColoredNeeded, canAffordCost, spendMana } from '../manaCost';

describe('parseManaCost', () => {
  it('parses a single colored mana', () => {
    const result = parseManaCost('{R}');
    expect(result.colored.R).toBe(1);
    expect(result.generic).toBe(0);
    expect(result.xCount).toBe(0);
  });

  it('parses multi-colored costs', () => {
    const result = parseManaCost('{2}{R}{R}');
    expect(result.colored.R).toBe(2);
    expect(result.generic).toBe(2);
  });

  it('parses X costs', () => {
    const result = parseManaCost('{X}{X}{G}');
    expect(result.xCount).toBe(2);
    expect(result.colored.G).toBe(1);
  });

  it('handles empty/null cost', () => {
    const result = parseManaCost('');
    expect(result.generic).toBe(0);
    expect(result.xCount).toBe(0);
    expect(Object.values(result.colored).every(v => v === 0)).toBe(true);
  });

  it('handles null input', () => {
    const result = parseManaCost(null);
    expect(result.generic).toBe(0);
  });

  it('parses all five colors', () => {
    const result = parseManaCost('{W}{U}{B}{R}{G}');
    expect(result.colored.W).toBe(1);
    expect(result.colored.U).toBe(1);
    expect(result.colored.B).toBe(1);
    expect(result.colored.R).toBe(1);
    expect(result.colored.G).toBe(1);
  });
});

describe('calculateCMC', () => {
  it('calculates CMC for colored-only cost', () => {
    expect(calculateCMC('{R}{R}')).toBe(2);
  });

  it('calculates CMC for generic + colored', () => {
    expect(calculateCMC('{3}{U}{U}')).toBe(5);
  });

  it('returns 0 for empty cost', () => {
    expect(calculateCMC('')).toBe(0);
  });

  it('excludes X from CMC (X=0 for CMC purposes)', () => {
    expect(calculateCMC('{X}{R}')).toBe(1);
  });
});

describe('getTotalColoredNeeded', () => {
  it('sums colored requirements', () => {
    const parsed = parseManaCost('{1}{R}{G}');
    expect(getTotalColoredNeeded(parsed)).toBe(2);
  });

  it('returns 0 for colorless cost', () => {
    const parsed = parseManaCost('{3}');
    expect(getTotalColoredNeeded(parsed)).toBe(0);
  });
});

describe('canAffordCost', () => {
  it('returns true when pool has exact mana', () => {
    const parsed = parseManaCost('{R}{R}');
    expect(canAffordCost(parsed, { R: 2 })).toBe(true);
  });

  it('returns false when missing colored mana', () => {
    const parsed = parseManaCost('{R}{G}');
    expect(canAffordCost(parsed, { R: 2 })).toBe(false);
  });

  it('returns false when total is insufficient', () => {
    const parsed = parseManaCost('{2}{R}');
    expect(canAffordCost(parsed, { R: 1 })).toBe(false);
  });

  it('handles X value', () => {
    const parsed = parseManaCost('{X}{R}');
    expect(canAffordCost(parsed, { R: 1, C: 3 }, 3)).toBe(true);
    expect(canAffordCost(parsed, { R: 1, C: 1 }, 3)).toBe(false);
  });

  it('handles cost reduction', () => {
    const parsed = parseManaCost('{3}{R}');
    // Need R:1 colored + generic 3, reduced by 2 => need R:1 + generic 1 = total 2
    expect(canAffordCost(parsed, { R: 1, C: 1 }, 0, 2)).toBe(true);
  });

  it('handles null mana pool', () => {
    const parsed = parseManaCost('{R}');
    expect(canAffordCost(parsed, null)).toBe(false);
  });
});

describe('spendMana', () => {
  it('spends colored mana first', () => {
    const parsed = parseManaCost('{R}');
    const result = spendMana({ R: 3 }, parsed);
    expect(result.R).toBe(2);
  });

  it('spends colorless for generic before colored', () => {
    const parsed = parseManaCost('{1}{R}');
    const result = spendMana({ R: 2, C: 1 }, parsed);
    expect(result.R).toBe(1); // Only 1 R spent for colored requirement
    expect(result.C).toBe(0); // C spent for generic
  });

  it('spends mana with X value', () => {
    const parsed = parseManaCost('{X}{G}');
    const result = spendMana({ G: 1, C: 3 }, parsed, 3);
    expect(result.G).toBe(0);
    expect(result.C).toBe(0);
  });

  it('applies cost reduction to generic', () => {
    const parsed = parseManaCost('{3}{R}');
    const result = spendMana({ R: 1, G: 2 }, parsed, 0, 2);
    expect(result.R).toBe(0); // Spent for colored
    // generic needed = max(0, 3 - 2) = 1, spent from G
    expect(result.G).toBe(1);
  });

  it('does not mutate the original pool', () => {
    const pool = { R: 3 };
    const parsed = parseManaCost('{R}');
    spendMana(pool, parsed);
    expect(pool.R).toBe(3);
  });
});
