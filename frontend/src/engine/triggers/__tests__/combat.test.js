import { describe, it, expect } from 'vitest';
import { detectAttackTriggers } from '../combat';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectAttackTriggers', () => {
  it('fires on_attack trigger for attacking creature', () => {
    const titan = createCreature({
      card_id: 'titan-1',
      instance_id: 'titan-1',
      name: 'Inferno Titan',
      triggered_abilities: [
        { trigger: 'on_attack', requires_input: true, effect: { type: 'damage_divided', totalDamage: 3 } }
      ]
    });
    const state = makeGameState({ battlefield: [titan] });
    const triggers = detectAttackTriggers({ attackerIds: ['titan-1'] }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('damage_divided');
    expect(triggers[0].requires_input).toBe(true);
  });

  it('does not fire for non-attacking creatures', () => {
    const titan = createCreature({
      card_id: 'titan-2',
      name: 'Inferno Titan',
      triggered_abilities: [
        { trigger: 'on_attack', effect: { type: 'damage_divided', totalDamage: 3 } }
      ]
    });
    const state = makeGameState({ battlefield: [titan] });
    const triggers = detectAttackTriggers({ attackerIds: ['other-creature'] }, state);

    expect(triggers.length).toBe(0);
  });

  it('fires multiple triggers for multiple attackers', () => {
    const titan = createCreature({
      card_id: 'titan-3',
      instance_id: 'titan-3',
      name: 'Inferno Titan',
      triggered_abilities: [
        { trigger: 'on_attack', effect: { type: 'damage_divided', totalDamage: 3 } }
      ]
    });
    const hero = createCreature({
      card_id: 'hero-1',
      instance_id: 'hero-1',
      name: 'Hero of Bladehold',
      triggered_abilities: [
        { trigger: 'on_attack', effect: { type: 'create_token', token: { name: 'Soldier', power: 1, toughness: 1 } } }
      ]
    });
    const state = makeGameState({ battlefield: [titan, hero] });
    const triggers = detectAttackTriggers({ attackerIds: ['titan-3', 'hero-1'] }, state);

    expect(triggers.length).toBe(2);
  });
});
