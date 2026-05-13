import { describe, it, expect } from 'vitest';
import { detectSacrificeTriggers, detectPermanentSacrificeTriggers } from '../sacrifice';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectSacrificeTriggers', () => {
  it('fires sacrifice_creature trigger for other permanents', () => {
    const sacrificed = createCreature({ instance_id: 'i-sac', name: 'Doomed Traveler' });
    const fleshtaker = createCreature({
      instance_id: 'i-flesh',
      name: 'Fleshtaker',
      triggered_abilities: [
        { trigger: 'sacrifice_creature', effect: { type: 'buff_self', power: 1, toughness: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [fleshtaker] });
    const triggers = detectSacrificeTriggers({ creature: sacrificed, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('buff_self');
    expect(triggers[0].source.name).toBe('Fleshtaker');
  });

  it('does not trigger for the sacrificed creature itself', () => {
    const sacrificed = createCreature({
      instance_id: 'i-flesh',
      name: 'Fleshtaker',
      triggered_abilities: [
        { trigger: 'sacrifice_creature', effect: { type: 'buff_self', power: 1, toughness: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [sacrificed] });
    const triggers = detectSacrificeTriggers({ creature: sacrificed, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });

  it('returns empty when no matching abilities', () => {
    const sacrificed = createCreature({ instance_id: 'i-tok', name: 'Token' });
    const bear = createCreature({ instance_id: 'i-bear', name: 'Bear' });
    const state = makeGameState({ battlefield: [bear] });
    const triggers = detectSacrificeTriggers({ creature: sacrificed, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });

  it('Mayhem Devil: fires on permanent_sacrificed event', () => {
    const sacrificed = createCreature({ instance_id: 'i-tok', name: 'Treasure Token' });
    const mayhem = createCreature({
      instance_id: 'i-mayhem',
      name: 'Mayhem Devil',
      triggered_abilities: [{
        type: 'triggered',
        trigger: { event: 'permanent_sacrificed', source: 'other' },
        effect: { type: 'damage', amount: 1, target: 'any' },
      }],
    });
    const state = makeGameState({ battlefield: [mayhem] });
    const triggers = detectPermanentSacrificeTriggers({ permanent: sacrificed, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Mayhem Devil');
    expect(triggers[0].effect.type).toBe('damage');
  });

  it('Mayhem Devil: only fires for its controller (you sac → your devil triggers)', () => {
    const sacrificed = createCreature({ instance_id: 'i-yours', name: 'Your Token', cardOwner: 'you' });
    const yourDevil = createCreature({
      instance_id: 'i-mayhem-you', name: 'Mayhem Devil',
      triggered_abilities: [{
        type: 'triggered',
        trigger: { event: 'permanent_sacrificed', source: 'other' },
        effect: { type: 'damage', amount: 1, target: 'any' },
      }],
    });
    const oppDevil = createCreature({
      instance_id: 'i-mayhem-opp', name: 'Opponent Mayhem Devil',
      triggered_abilities: [{
        type: 'triggered',
        trigger: { event: 'permanent_sacrificed', source: 'other' },
        effect: { type: 'damage', amount: 1, target: 'any' },
      }],
    });
    const state = makeGameState(
      { battlefield: [yourDevil] },
      { battlefield: [oppDevil] }
    );
    const triggers = detectPermanentSacrificeTriggers({ permanent: sacrificed, owner: 'you' }, state);

    // Only your devil fires when you sac
    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Mayhem Devil');
  });
});

describe('detectPermanentSacrificeTriggers (has_card_type filter)', () => {
  it('Disciple of the Vault: fires when artifact you control is sacrificed', () => {
    const treasure = { instance_id: 'i-treas', card_id: 'treas', name: 'Treasure', type_line: 'Token Artifact — Treasure' };
    const disciple = createCreature({
      instance_id: 'i-disciple', name: 'Disciple of the Vault',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'permanent_sacrificed', source: 'other',
          condition: { type: 'has_card_type', types: ['artifact'], controller: 'you' },
        },
        effect: { type: 'opponent_loses_life', amount: 1 },
      }],
    });
    const state = makeGameState({ battlefield: [disciple] });
    const triggers = detectPermanentSacrificeTriggers({ permanent: treasure, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Disciple of the Vault');
  });

  it('Disciple of the Vault: does NOT fire when non-artifact creature is sacrificed', () => {
    const goblin = createCreature({ instance_id: 'i-gob', name: 'Goblin', type_line: 'Creature — Goblin' });
    const disciple = createCreature({
      instance_id: 'i-disciple', name: 'Disciple of the Vault',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'permanent_sacrificed', source: 'other',
          condition: { type: 'has_card_type', types: ['artifact'], controller: 'you' },
        },
        effect: { type: 'opponent_loses_life', amount: 1 },
      }],
    });
    const state = makeGameState({ battlefield: [disciple] });
    const triggers = detectPermanentSacrificeTriggers({ permanent: goblin, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });

  it('Marionette: fires when creature OR artifact you control is sacrificed', () => {
    const treasure = { instance_id: 'i-treas', card_id: 'treas', name: 'Treasure', type_line: 'Token Artifact — Treasure' };
    const marionette = createCreature({
      instance_id: 'i-marionette', name: 'Marionette Apprentice',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'permanent_sacrificed', source: 'other',
          condition: { type: 'has_card_type', types: ['creature', 'artifact'], controller: 'you' },
        },
        effect: { type: 'opponent_loses_life', amount: 1 },
      }],
    });
    const state = makeGameState({ battlefield: [marionette] });
    const triggers = detectPermanentSacrificeTriggers({ permanent: treasure, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
  });
});
