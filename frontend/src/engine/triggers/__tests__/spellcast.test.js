import { describe, it, expect } from 'vitest';
import { detectSpellCastCMCTriggers, detectSecondSpellTriggers } from '../spellcast';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectSpellCastCMCTriggers', () => {
  it('triggers Eidolon for CMC 3 or less spells', () => {
    const eidolon = createCreature({
      name: 'Eidolon of the Great Revel',
      triggered_abilities: [
        { trigger: 'spell_cast_cmc_3_or_less', effect: { type: 'damage_to_caster', amount: 2 } }
      ]
    });
    const state = makeGameState(
      { battlefield: [eidolon] },
      { battlefield: [] }
    );
    const spell = { mana_cost: '{R}' }; // CMC = 1
    const triggers = detectSpellCastCMCTriggers({ spellCard: spell, casterIsYou: true }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('damage_to_caster');
    expect(triggers[0].effect.targetOwner).toBe('you');
  });

  it('does not trigger Eidolon for CMC 4+', () => {
    const eidolon = createCreature({
      name: 'Eidolon of the Great Revel',
      triggered_abilities: [
        { trigger: 'spell_cast_cmc_3_or_less', effect: { type: 'damage_to_caster', amount: 2 } }
      ]
    });
    const state = makeGameState({ battlefield: [eidolon] });
    const spell = { mana_cost: '{2}{R}{R}' }; // CMC = 4
    const triggers = detectSpellCastCMCTriggers({ spellCard: spell, casterIsYou: true }, state);

    expect(triggers.length).toBe(0);
  });

  it('checks both players battlefields', () => {
    const eidolon = createCreature({
      name: 'Eidolon of the Great Revel',
      triggered_abilities: [
        { trigger: 'spell_cast_cmc_3_or_less', effect: { type: 'damage_to_caster', amount: 2 } }
      ]
    });
    const state = makeGameState(
      { battlefield: [] },
      { battlefield: [eidolon] }
    );
    const spell = { mana_cost: '{1}{R}' }; // CMC = 2
    const triggers = detectSpellCastCMCTriggers({ spellCard: spell, casterIsYou: true }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.owner).toBe('opponent');
  });

  it('sets targetOwner based on caster', () => {
    const eidolon = createCreature({
      name: 'Eidolon of the Great Revel',
      triggered_abilities: [
        { trigger: 'spell_cast_cmc_3_or_less', effect: { type: 'damage_to_caster', amount: 2 } }
      ]
    });
    const state = makeGameState({ battlefield: [eidolon] });
    const spell = { mana_cost: '{R}' };

    const triggersYou = detectSpellCastCMCTriggers({ spellCard: spell, casterIsYou: true }, state);
    expect(triggersYou[0].effect.targetOwner).toBe('you');

    const triggersOpp = detectSpellCastCMCTriggers({ spellCard: spell, casterIsYou: false }, state);
    expect(triggersOpp[0].effect.targetOwner).toBe('opponent');
  });
});

describe('detectSecondSpellTriggers', () => {
  it('fires second_spell_each_turn trigger when spellsCastThisTurn hits the threshold', () => {
    const permanent = createCreature({
      name: 'Eidolon of Rhetoric Variant',
      triggered_abilities: [
        { trigger: 'second_spell_each_turn', effect: { type: 'add_counter_to_self', amount: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [permanent] });
    const triggers = detectSecondSpellTriggers({ castingPlayer: 'you', spellsCastThisTurn: 2 }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('add_counter_to_self');
  });

  it('returns empty when no matching abilities', () => {
    const bear = createCreature({ name: 'Bear' });
    const state = makeGameState({ battlefield: [bear] });
    const triggers = detectSecondSpellTriggers({ castingPlayer: 'you' }, state);

    expect(triggers.length).toBe(0);
  });
});
