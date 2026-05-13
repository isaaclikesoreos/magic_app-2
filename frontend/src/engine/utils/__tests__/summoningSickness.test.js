import { describe, it, expect } from 'vitest';
import { canActivateTapAbility, creatureHasHaste } from '../summoningSickness';

const creature = (overrides = {}) => ({
  instance_id: 'i-c',
  card_id: 'c',
  name: 'Bear',
  type_line: 'Creature — Bear',
  summoning_sick: false,
  ...overrides,
});

describe('canActivateTapAbility', () => {
  it('blocks summoning-sick creatures without haste', () => {
    const c = creature({ summoning_sick: true });
    expect(canActivateTapAbility(c, [c])).toBe(false);
  });

  it('allows creatures with haste keyword even when summoning sick', () => {
    const c = creature({ summoning_sick: true, keywords: ['haste'] });
    expect(canActivateTapAbility(c, [c])).toBe(true);
  });

  it('allows creatures that are not summoning sick', () => {
    const c = creature({ summoning_sick: false });
    expect(canActivateTapAbility(c, [c])).toBe(true);
  });

  it('allows non-creatures regardless of summoning sickness flag', () => {
    // Lands don't have summoning_sick anyway, but defensive: even with the flag set,
    // a land/artifact should never be blocked.
    const sol = { instance_id: 'i-sol', card_id: 'sol', name: 'Sol Ring', type_line: 'Artifact', summoning_sick: true };
    expect(canActivateTapAbility(sol, [sol])).toBe(true);
  });

  it('allows summoning-sick creature when equipped with haste-granting equipment', () => {
    const c = creature({ summoning_sick: true });
    const boots = {
      instance_id: 'i-boots', card_id: 'boots', name: 'Lightning Greaves',
      type_line: 'Artifact — Equipment',
      equippedTo: { instance_id: c.instance_id },
      static_abilities: [{
        effect: { type: 'grant_keywords_equipped', keywords: ['shroud', 'haste'] },
      }],
    };
    expect(canActivateTapAbility(c, [c, boots])).toBe(true);
  });

  it('blocks summoning-sick creature when equipment grants something other than haste', () => {
    const c = creature({ summoning_sick: true });
    const collar = {
      instance_id: 'i-coll', card_id: 'coll', name: 'Basilisk Collar',
      type_line: 'Artifact — Equipment',
      equippedTo: { instance_id: c.instance_id },
      static_abilities: [{
        effect: { type: 'grant_keywords_equipped', keywords: ['deathtouch', 'lifelink'] },
      }],
    };
    expect(canActivateTapAbility(c, [c, collar])).toBe(false);
  });

  it('respects _dashed flag (Dash grants haste this turn)', () => {
    const c = creature({ summoning_sick: true, _dashed: true });
    expect(canActivateTapAbility(c, [c])).toBe(true);
  });

  it('Thornbite scenario: equipped sick creature blocked from granted tap ability', () => {
    // Thornbite Staff grants {2},{T}: damage 1. Equipped Goblin Sharpshooter
    // entered this turn — should NOT be activatable yet.
    const sharpshooter = creature({
      instance_id: 'i-shoot', name: 'Goblin Sharpshooter',
      type_line: 'Creature — Goblin', summoning_sick: true,
    });
    const staff = {
      instance_id: 'i-staff', card_id: 'staff', name: 'Thornbite Staff',
      type_line: 'Kindred Artifact — Shaman Equipment',
      equippedTo: { instance_id: sharpshooter.instance_id },
      static_abilities: [{
        effect: {
          type: 'grant_activated_equipped',
          ability: { cost: { mana: { generic: 2 }, tap: true }, effect: { type: 'damage', amount: 1, target: 'any' } },
        },
      }],
    };
    expect(canActivateTapAbility(sharpshooter, [sharpshooter, staff])).toBe(false);
  });
});

describe('creatureHasHaste', () => {
  it('detects haste from keywords', () => {
    const c = creature({ keywords: ['haste', 'first_strike'] });
    expect(creatureHasHaste(c, [c])).toBe(true);
  });

  it('detects legacy hasHaste boolean', () => {
    const c = creature({ hasHaste: true });
    expect(creatureHasHaste(c, [c])).toBe(true);
  });

  it('detects haste in oracle text (with reminder text stripped)', () => {
    const c = creature({ oracle_text: 'Flying, haste\n{T}: Draw a card.' });
    expect(creatureHasHaste(c, [c])).toBe(true);
  });

  it('does not false-positive on reminder text mentioning haste', () => {
    // Dash {1}{R} - reminder text is "(...it gains haste...)" — should not count
    const c = creature({ oracle_text: 'Dash {1}{R} (You may cast this for its dash cost. If you do, return it to its owner\'s hand at the next end step. It also gains haste.)' });
    expect(creatureHasHaste(c, [c])).toBe(false);
  });

  it('returns false for vanilla creature', () => {
    const c = creature();
    expect(creatureHasHaste(c, [c])).toBe(false);
  });
});
