import { describe, it, expect } from 'vitest';
import { detectDeathTriggers, detectPermanentLeavesTriggers } from '../death';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectDeathTriggers', () => {
  it('fires another_creature_dies triggers for other creatures', () => {
    const dyingCreature = createCreature({ instance_id: 'i-dying', name: 'Doomed Traveler' });
    const fleshtaker = createCreature({
      instance_id: 'i-fleshtaker',
      name: 'Fleshtaker',
      triggered_abilities: [
        { trigger: 'another_creature_dies', effect: { type: 'gain_life_and_scry', lifeAmount: 1, scryAmount: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [fleshtaker] });
    const triggers = detectDeathTriggers({ creature: dyingCreature, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('gain_life_and_scry');
    expect(triggers[0].source.name).toBe('Fleshtaker');
  });

  it('does NOT fire leaves_battlefield from the dying creature here (those flow through detectPermanentLeavesTriggers / PuzzleContext\'s leaving loop to avoid double-firing)', () => {
    const thragtusk = createCreature({
      instance_id: 'i-thrag',
      name: 'Thragtusk',
      triggered_abilities: [
        { trigger: 'leaves_battlefield', effect: { type: 'create_token', token: { name: 'Beast', power: 3, toughness: 3 } } }
      ]
    });
    const state = makeGameState({ battlefield: [] });
    const triggers = detectDeathTriggers({ creature: thragtusk, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });

  it('does not fire another_creature_dies for itself', () => {
    const selfDying = createCreature({
      name: 'Fleshtaker',
      triggered_abilities: [
        { trigger: 'another_creature_dies', effect: { type: 'gain_life_and_scry', lifeAmount: 1 } }
      ]
    });
    // Fleshtaker is on the battlefield AND dying - should not trigger for itself
    const state = makeGameState({ battlefield: [selfDying] });
    const triggers = detectDeathTriggers({ creature: selfDying, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });

  it('Blood Artist: fires on its OWN death when source is "any"', () => {
    const bloodArtist = createCreature({
      instance_id: 'i-blood',
      name: 'Blood Artist',
      triggered_abilities: [{
        type: 'triggered',
        trigger: { event: 'another_creature_dies', source: 'any' },
        effect: { type: 'drain_life', amount: 1 },
      }],
    });
    // Blood Artist is the dying creature itself — "any" source means it fires on self too.
    const state = makeGameState({ battlefield: [] });  // already removed when dying
    const triggers = detectDeathTriggers({ creature: bloodArtist, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Blood Artist');
    expect(triggers[0].effect.type).toBe('drain_life');
  });

  it('fires another_creature_dies for opponent creatures dying (MTG rules)', () => {
    const fleshtaker = createCreature({
      instance_id: 'i-flesh',
      name: 'Fleshtaker',
      triggered_abilities: [
        { trigger: 'another_creature_dies', effect: { type: 'gain_life_and_scry', lifeAmount: 1 } }
      ]
    });
    const opponentCreature = createCreature({ instance_id: 'i-opp-goblin', name: 'Enemy Goblin' });
    const state = makeGameState({ battlefield: [fleshtaker] });
    const triggers = detectDeathTriggers({ creature: opponentCreature, owner: 'opponent' }, state);

    // "Whenever another creature dies" fires regardless of who controlled it
    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Fleshtaker');
  });

  it('fires equipment-granted death triggers on the equipped creature (Thornbite Staff)', () => {
    const equipped = createCreature({
      instance_id: 'i-shooter',
      name: 'Goblin Sharpshooter',
    });
    const staff = {
      instance_id: 'i-staff',
      card_id: 'staff',
      name: 'Thornbite Staff',
      type_line: 'Artifact — Equipment',
      equippedTo: { instance_id: 'i-shooter' },
      static_abilities: [{
        effect: {
          type: 'grant_triggered_equipped',
          ability: {
            type: 'triggered',
            trigger: { event: 'another_creature_dies' },
            effect: { type: 'untap_self' },
          },
        },
      }],
    };
    const dyingCreature = createCreature({ instance_id: 'i-dead', name: 'Doomed Traveler' });
    const state = makeGameState({ battlefield: [equipped, staff] });
    const triggers = detectDeathTriggers({ creature: dyingCreature, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('untap_self');
    expect(triggers[0].source.name).toBe('Goblin Sharpshooter');  // source is the equipped creature, not the staff
  });
});

describe('detectPermanentLeavesTriggers', () => {
  it('detects permanent_leaves_battlefield triggers on both sides', () => {
    const leavingPermanent = createCreature({ instance_id: 'i-token', name: 'Some Token' });
    const shredder = createCreature({
      instance_id: 'i-shredder',
      name: 'Super Shredder',
      triggered_abilities: [
        { trigger: 'permanent_leaves_battlefield', effect: { type: 'add_counter_to_source', counterType: '+1/+1' } }
      ]
    });
    const state = makeGameState(
      { battlefield: [shredder] },
      { battlefield: [] }
    );
    const triggers = detectPermanentLeavesTriggers({ permanent: leavingPermanent, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('add_counter_to_source');
  });

  it('does not trigger for the leaving permanent itself', () => {
    const leaving = createCreature({
      name: 'Super Shredder',
      triggered_abilities: [
        { trigger: 'permanent_leaves_battlefield', effect: { type: 'add_counter_to_source' } }
      ]
    });
    const state = makeGameState({ battlefield: [leaving] });
    const triggers = detectPermanentLeavesTriggers({ permanent: leaving, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });
});
