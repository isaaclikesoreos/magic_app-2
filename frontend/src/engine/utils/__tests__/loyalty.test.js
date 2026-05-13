import { describe, it, expect } from 'vitest';
import { isPlaneswalker, getLoyalty, addLoyalty, setLoyalty } from '../loyalty';

const pw = (overrides = {}) => ({
  instance_id: 'pw-1', card_id: 'narset', name: 'Narset, Parter of Veils',
  type_line: 'Legendary Planeswalker — Narset', loyalty: 5,
  ...overrides,
});

describe('loyalty helper', () => {
  it('isPlaneswalker matches by type_line', () => {
    expect(isPlaneswalker(pw())).toBe(true);
    expect(isPlaneswalker({ type_line: 'Creature — Bear' })).toBe(false);
    expect(isPlaneswalker({ type_line: '' })).toBe(false);
  });

  it('getLoyalty returns 0 when missing', () => {
    expect(getLoyalty({ type_line: 'Planeswalker' })).toBe(0);
    expect(getLoyalty(pw({ loyalty: 7 }))).toBe(7);
  });

  it('addLoyalty increments and decrements', () => {
    const p = pw({ loyalty: 5 });
    expect(addLoyalty(p, -2)).toBe(3);
    expect(p.loyalty).toBe(3);
    expect(addLoyalty(p, 1)).toBe(4);
  });

  it('setLoyalty replaces value', () => {
    const p = pw({ loyalty: 5 });
    setLoyalty(p, 0);
    expect(p.loyalty).toBe(0);
  });
});
