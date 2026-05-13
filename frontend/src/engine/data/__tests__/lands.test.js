import { describe, it, expect } from 'vitest';
import { getLandManaAbilities } from '../lands';

describe('getLandManaAbilities', () => {
  it('returns correct color for basic lands', () => {
    const forest = getLandManaAbilities({ name: 'Forest', type_line: 'Basic Land - Forest' });
    expect(forest).toEqual([{ mana: 'G', label: '{G}' }]);

    const mountain = getLandManaAbilities({ name: 'Mountain', type_line: 'Basic Land - Mountain' });
    expect(mountain).toEqual([{ mana: 'R', label: '{R}' }]);

    const island = getLandManaAbilities({ name: 'Island', type_line: 'Basic Land - Island' });
    expect(island).toEqual([{ mana: 'U', label: '{U}' }]);

    const swamp = getLandManaAbilities({ name: 'Swamp', type_line: 'Basic Land - Swamp' });
    expect(swamp).toEqual([{ mana: 'B', label: '{B}' }]);

    const plains = getLandManaAbilities({ name: 'Plains', type_line: 'Basic Land - Plains' });
    expect(plains).toEqual([{ mana: 'W', label: '{W}' }]);
  });

  it('returns both colors for named dual lands', () => {
    const badlands = getLandManaAbilities({ name: 'Badlands', type_line: 'Land - Swamp Mountain' });
    const colors = badlands.map(a => a.mana).sort();
    expect(colors).toEqual(['B', 'R']);
  });

  it('returns both colors for shock lands', () => {
    const vents = getLandManaAbilities({ name: 'Steam Vents', type_line: 'Land - Island Mountain' });
    const colors = vents.map(a => a.mana).sort();
    expect(colors).toEqual(['R', 'U']);
  });

  it('returns colorless for Wasteland', () => {
    const wasteland = getLandManaAbilities({ name: 'Wasteland', type_line: 'Land' });
    expect(wasteland).toEqual([{ mana: 'C', label: '{C}' }]);
  });

  it('parses oracle text for add {X} patterns', () => {
    const land = getLandManaAbilities({
      name: 'Custom Land',
      type_line: 'Land',
      oracle_text: '{T}: Add {R}. {T}: Add {G}.'
    });
    const colors = land.map(a => a.mana).sort();
    expect(colors).toEqual(['G', 'R']);
  });

  it('returns colorless fallback for unknown land with no oracle text', () => {
    const land = getLandManaAbilities({ name: 'Unknown Land', type_line: 'Land' });
    expect(land).toEqual([{ mana: 'C', label: '{C}' }]);
  });

  it('does not duplicate colors from type line and name registry', () => {
    // Badlands is in registry AND has Swamp Mountain in type line
    const badlands = getLandManaAbilities({ name: 'Badlands', type_line: 'Land - Swamp Mountain' });
    const colors = badlands.map(a => a.mana);
    // Should have exactly 2 entries, no duplicates
    expect(colors.length).toBe(2);
    expect(new Set(colors).size).toBe(2);
  });
});
