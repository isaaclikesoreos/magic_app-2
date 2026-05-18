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

describe('Bridge from Below graveyard-resident triggers', () => {
  const bridgeFirstAbility = {
    type: 'triggered',
    trigger: {
      event: 'permanent_dies', source: 'any', self_zone: 'graveyard',
      condition: { type: 'has_card_type', types: ['creature'], controller: 'you', not_token: true },
    },
    effect: {
      type: 'create_token', count: 1,
      token: { name: 'Zombie Token', type_line: 'Token Creature — Zombie', power: 2, toughness: 2, colors: ['B'] },
    },
  };
  const bridgeSecondAbility = {
    type: 'triggered',
    trigger: {
      event: 'permanent_dies', source: 'any', self_zone: 'graveyard',
      condition: { type: 'has_card_type', types: ['creature'], controller: 'opponent' },
    },
    effect: { type: 'exile_self_from_graveyard' },
  };
  const makeBridge = (instance_id) => ({
    instance_id, card_id: 999, name: 'Bridge from Below',
    type_line: 'Enchantment',
    triggered_abilities: [bridgeFirstAbility, bridgeSecondAbility],
  });

  it('fires the zombie token trigger when your nontoken creature dies (bridge in your graveyard)', () => {
    const bridge = makeBridge('bridge-1');
    const dying = createCreature({ instance_id: 'd-1', name: 'Plaguecrafter', type_line: 'Creature — Human Shaman' });
    const state = makeGameState({ graveyard: [bridge] });
    const triggers = detectDeathTriggers({ creature: dying, owner: 'you' }, state);
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    expect(tokenTriggers.length).toBe(1);
  });

  it('does NOT fire zombie token trigger for token deaths', () => {
    const bridge = makeBridge('bridge-2');
    const dyingToken = { instance_id: 'tok-1', card_id: 'token-zombie-x', name: 'Zombie Token',
      type_line: 'Token Creature — Zombie', isToken: true };
    const state = makeGameState({ graveyard: [bridge] });
    const triggers = detectDeathTriggers({ creature: dyingToken, owner: 'you' }, state);
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    expect(tokenTriggers.length).toBe(0);
  });

  it('fires the exile-self trigger when opponent creature dies', () => {
    const bridge = makeBridge('bridge-3');
    const dying = createCreature({ instance_id: 'd-2', name: 'Baneslayer', type_line: 'Creature — Angel' });
    const state = makeGameState({ graveyard: [bridge] });
    const triggers = detectDeathTriggers({ creature: dying, owner: 'opponent' }, state);
    const exileTriggers = triggers.filter(t => t.effect?.type === 'exile_self_from_graveyard');
    expect(exileTriggers.length).toBe(1);
    // Also: zombie token trigger should NOT fire (creature was opponent's)
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    expect(tokenTriggers.length).toBe(0);
  });

  it('exile-self trigger fires even when opponent token dies (no not_token filter on that one)', () => {
    const bridge = makeBridge('bridge-4');
    const dyingToken = { instance_id: 'tok-2', card_id: 'token-x', name: 'Saproling',
      type_line: 'Token Creature — Saproling', isToken: true };
    const state = makeGameState({ graveyard: [bridge] });
    const triggers = detectDeathTriggers({ creature: dyingToken, owner: 'opponent' }, state);
    const exileTriggers = triggers.filter(t => t.effect?.type === 'exile_self_from_graveyard');
    expect(exileTriggers.length).toBe(1);
  });

  it('does not fire when Bridge is on the battlefield (no self_zone match)', () => {
    const bridgeOnBF = { ...makeBridge('bridge-5') };
    const dying = createCreature({ instance_id: 'd-3', name: 'Whatever' });
    const state = makeGameState({ battlefield: [bridgeOnBF] });
    const triggers = detectDeathTriggers({ creature: dying, owner: 'you' }, state);
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    const exileTriggers = triggers.filter(t => t.effect?.type === 'exile_self_from_graveyard');
    expect(tokenTriggers.length).toBe(0);
    expect(exileTriggers.length).toBe(0);
  });

  it('fires twice when two Bridges are in graveyard and a nontoken creature dies', () => {
    const b1 = makeBridge('bridge-6a');
    const b2 = makeBridge('bridge-6b');
    const dying = createCreature({ instance_id: 'd-4', name: 'Plaguecrafter' });
    const state = makeGameState({ graveyard: [b1, b2] });
    const triggers = detectDeathTriggers({ creature: dying, owner: 'you' }, state);
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    expect(tokenTriggers.length).toBe(2);
  });
});

describe('Self-death trigger on non-creature artifact (Goblin Boom Keg)', () => {
  const makeBoomKeg = (instance_id) => ({
    instance_id, card_id: 888, name: 'Goblin Boom Keg',
    type_line: 'Artifact',
    triggered_abilities: [{
      type: 'triggered',
      trigger: { event: 'permanent_dies', source: 'self' },
      effect: { type: 'damage', amount: 3, target: 'any', valid_targets: ['creature', 'player', 'planeswalker'] },
      requires_input: true,
    }],
  });

  it('fires the artifact self-death damage trigger from permanent_left event', () => {
    const keg = makeBoomKeg('keg-1');
    const state = makeGameState();
    const triggers = detectPermanentLeavesTriggers({ permanent: keg, owner: 'you' }, state);
    const damageTriggers = triggers.filter(t => t.effect?.type === 'damage');
    expect(damageTriggers.length).toBe(1);
    expect(damageTriggers[0].effect.amount).toBe(3);
  });

  it('does NOT double-fire creature self-death from permanent_left (gated to non-creature)', () => {
    // A creature with a permanent_dies + source: self trigger — like Hangarback.
    // detectDeathTriggers Section A handles this; detectPermanentLeavesTriggers
    // must NOT also fire it.
    const hangarback = createCreature({
      instance_id: 'hb-1', name: 'Hangarback Walker',
      type_line: 'Artifact Creature — Construct',
      triggered_abilities: [{
        trigger: { event: 'dies', source: 'self' },
        effect: { type: 'create_token', count: 2 },
      }],
    });
    const state = makeGameState();
    const triggers = detectPermanentLeavesTriggers({ permanent: hangarback, owner: 'you' }, state);
    const tokenTriggers = triggers.filter(t => t.effect?.type === 'create_token');
    expect(tokenTriggers.length).toBe(0);
  });
});
