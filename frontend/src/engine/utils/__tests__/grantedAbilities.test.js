import { describe, it, expect } from 'vitest';
import { getEffectiveTriggeredAbilities, getEffectiveActivatedAbilities } from '../grantedAbilities';

const creature = (overrides = {}) => ({
  instance_id: 'i-c',
  card_id: 'c',
  name: 'Bear',
  type_line: 'Creature — Bear',
  ...overrides,
});

const equipment = (overrides = {}) => ({
  instance_id: 'i-e',
  card_id: 'e',
  name: 'Some Equipment',
  type_line: 'Artifact — Equipment',
  ...overrides,
});

describe('getEffectiveTriggeredAbilities', () => {
  it('returns native abilities when no equipment attached', () => {
    const c = creature({
      triggered_abilities: [{ trigger: { event: 'enters_battlefield' }, effect: { type: 'gain_life', amount: 2 } }],
    });
    const result = getEffectiveTriggeredAbilities(c, [c]);
    expect(result.length).toBe(1);
    expect(result[0]._grantedBy).toBeUndefined();
  });

  it('appends granted triggers from attached equipment', () => {
    const c = creature();
    const staff = equipment({
      equippedTo: { instance_id: c.instance_id },
      static_abilities: [{
        effect: {
          type: 'grant_triggered_equipped',
          ability: { trigger: { event: 'another_creature_dies' }, effect: { type: 'untap_self' } },
        },
      }],
    });
    const result = getEffectiveTriggeredAbilities(c, [c, staff]);
    expect(result.length).toBe(1);
    expect(result[0].effect.type).toBe('untap_self');
    expect(result[0]._grantedBy).toBe(staff.instance_id);
  });

  it('does not add granted abilities when equipment is attached to someone else', () => {
    const c = creature();
    const other = creature({ instance_id: 'i-other', name: 'Other Bear' });
    const staff = equipment({
      equippedTo: { instance_id: other.instance_id },
      static_abilities: [{
        effect: {
          type: 'grant_triggered_equipped',
          ability: { trigger: { event: 'another_creature_dies' }, effect: { type: 'untap_self' } },
        },
      }],
    });
    const result = getEffectiveTriggeredAbilities(c, [c, other, staff]);
    expect(result.length).toBe(0);
  });
});

describe('getEffectiveActivatedAbilities', () => {
  it('returns native + granted activated abilities', () => {
    const c = creature({
      activated_abilities: [{ cost: { tap: true }, effect: { type: 'add_mana', mana: { G: 1 } } }],
    });
    const staff = equipment({
      equippedTo: { instance_id: c.instance_id },
      static_abilities: [{
        effect: {
          type: 'grant_activated_equipped',
          ability: {
            cost: { mana: { generic: 2 }, tap: true },
            effect: { type: 'damage', amount: 1, target: 'any' },
          },
        },
      }],
    });
    const result = getEffectiveActivatedAbilities(c, [c, staff]);
    expect(result.length).toBe(2);
    expect(result[0].effect.type).toBe('add_mana');           // native first
    expect(result[1].effect.type).toBe('damage');             // granted second
    expect(result[1]._grantedBy).toBe(staff.instance_id);
  });

  it('returns empty list for vanilla creature with no abilities', () => {
    const c = creature();
    const result = getEffectiveActivatedAbilities(c, [c]);
    expect(result.length).toBe(0);
  });

  describe('grant_activated_from_top_library (Conspicuous Snoop)', () => {
    const snoop = () => creature({
      name: 'Conspicuous Snoop',
      type_line: 'Creature — Goblin Rogue',
      static_abilities: [{
        type: 'static',
        effect: {
          type: 'grant_activated_from_top_library',
          filter: { types: ['goblin'] },
        },
      }],
    });

    it('grants activated abilities from a Goblin on top of library', () => {
      const s = snoop();
      const topCard = {
        instance_id: 'top-1',
        card_id: 208,
        name: 'Goblin Sharpshooter',
        type_line: 'Creature — Goblin',
        activated_abilities: [{
          type: 'activated',
          cost: { tap: true },
          effect: { type: 'damage', amount: 1, target: 'creature_or_player' },
          description: '{T}: Deal 1 damage to any target.',
        }],
      };
      const result = getEffectiveActivatedAbilities(s, [s], topCard);
      expect(result.length).toBe(1);
      expect(result[0].effect.type).toBe('damage');
      expect(result[0]._grantedBy).toBe('top-of-library');
    });

    it('does not grant abilities when top card is not a Goblin', () => {
      const s = snoop();
      const topCard = {
        instance_id: 'top-2',
        card_id: 1,
        name: 'Lightning Bolt',
        type_line: 'Instant',
        activated_abilities: [{ cost: { tap: true }, effect: { type: 'damage' } }],
      };
      const result = getEffectiveActivatedAbilities(s, [s], topCard);
      expect(result.length).toBe(0);
    });

    it('returns empty when topOfYourLibrary omitted', () => {
      const s = snoop();
      const result = getEffectiveActivatedAbilities(s, [s]);
      expect(result.length).toBe(0);
    });

    it('returns empty when top Goblin has no activated abilities', () => {
      const s = snoop();
      const topCard = {
        instance_id: 'top-3',
        card_id: 99,
        name: 'Vanilla Goblin Token',
        type_line: 'Token Creature — Goblin',
        activated_abilities: [],
      };
      const result = getEffectiveActivatedAbilities(s, [s], topCard);
      expect(result.length).toBe(0);
    });
  });
});
