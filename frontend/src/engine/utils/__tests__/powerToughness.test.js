import { describe, it, expect } from 'vitest';
import { calculatePower, calculateToughness, isLethalDamage } from '../powerToughness';

describe('calculatePower', () => {
  it('returns base power from card stats', () => {
    expect(calculatePower({ power: '3' })).toBe(3);
  });

  it('defaults to 0 when power is missing', () => {
    expect(calculatePower({})).toBe(0);
  });

  it('adds +1/+1 counters', () => {
    expect(calculatePower({ power: '2', counters: { '+1/+1': 3 } })).toBe(5);
  });

  it('adds buffPower modifier', () => {
    expect(calculatePower({ power: '1', buffPower: 2 })).toBe(3);
  });

  it('adds prowessBonus modifier', () => {
    expect(calculatePower({ power: '1', prowessBonus: 2 })).toBe(3);
  });

  it('adds attachedRoles bonuses', () => {
    expect(calculatePower({
      power: '2',
      attachedRoles: [{ power: 1, toughness: 1 }]
    })).toBe(3);
  });

  it('stacks all modifiers together', () => {
    expect(calculatePower({
      power: '1',
      counters: { '+1/+1': 2 },
      buffPower: 1,
      prowessBonus: 1,
      attachedRoles: [{ power: 1 }]
    })).toBe(6);
  });
});

describe('calculateToughness', () => {
  it('returns base toughness from card stats', () => {
    expect(calculateToughness({ toughness: '4' })).toBe(4);
  });

  it('defaults to 0 when toughness is missing', () => {
    expect(calculateToughness({})).toBe(0);
  });

  it('adds +1/+1 counters', () => {
    expect(calculateToughness({ toughness: '2', counters: { '+1/+1': 2 } })).toBe(4);
  });

  it('adds buffToughness modifier', () => {
    expect(calculateToughness({ toughness: '3', buffToughness: 2 })).toBe(5);
  });

  it('adds prowessBonus modifier', () => {
    expect(calculateToughness({ toughness: '1', prowessBonus: 3 })).toBe(4);
  });

  it('adds attachedRoles bonuses', () => {
    expect(calculateToughness({
      toughness: '2',
      attachedRoles: [{ toughness: 2 }]
    })).toBe(4);
  });

  it('stacks all modifiers together', () => {
    expect(calculateToughness({
      toughness: '1',
      counters: { '+1/+1': 1 },
      buffToughness: 1,
      prowessBonus: 1,
      attachedRoles: [{ toughness: 1 }]
    })).toBe(5);
  });
});

describe('isLethalDamage', () => {
  it('returns true when damage equals toughness', () => {
    expect(isLethalDamage({ toughness: '3' }, 3)).toBe(true);
  });

  it('returns true when damage exceeds toughness', () => {
    expect(isLethalDamage({ toughness: '2' }, 5)).toBe(true);
  });

  it('returns false when damage is less than toughness', () => {
    expect(isLethalDamage({ toughness: '4' }, 3)).toBe(false);
  });

  it('accounts for +1/+1 counters in toughness', () => {
    expect(isLethalDamage({ toughness: '2', counters: { '+1/+1': 2 } }, 3)).toBe(false);
    expect(isLethalDamage({ toughness: '2', counters: { '+1/+1': 2 } }, 4)).toBe(true);
  });
});
