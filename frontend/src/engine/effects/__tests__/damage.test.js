import { describe, it, expect } from 'vitest';
import { applyDamage, applyDamageDivided, applyDamagePerNonbasicLands, applyDealDamageToController, applyDamageToCaster, applyDamageAll } from '../damage';
import { makeGameState, createCreature, createStackItem, createLand, mockHelpers } from '../../__tests__/fixtures';

describe('applyDamage', () => {
  it('deals damage to opponent player', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'bolt-1', name: 'Lightning Bolt', owner: 'you' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDamage(item, state, helpers);

    expect(result.players.opponent.life).toBe(17);
    expect(helpers.logs[0]).toContain('3 damage to opponent');
  });

  it('deals damage to you when targeted', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'bolt-2', name: 'Lightning Bolt', owner: 'opponent' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'you' }
    });
    const helpers = mockHelpers();
    const result = applyDamage(item, state, helpers);

    expect(result.players.you.life).toBe(17);
  });

  it('destroys creature when damage >= toughness', () => {
    const creature = createCreature({ card_id: 'goblin-1', name: 'Goblin Guide', power: '2', toughness: '2', owner: 'opponent' });
    const state = makeGameState({}, { battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'bolt-3', name: 'Lightning Bolt', owner: 'you' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'creature', targetData: { ...creature, owner: 'opponent' } }
    });
    const helpers = mockHelpers();
    const result = applyDamage(item, state, helpers);

    expect(result.players.opponent.battlefield.length).toBe(0);
    expect(result.players.opponent.graveyard.length).toBe(1);
    expect(result.players.opponent.graveyard[0].name).toBe('Goblin Guide');
    expect(result._dyingCreatures.length).toBe(1);
  });

  it('does not destroy creature when damage < toughness', () => {
    const creature = createCreature({ card_id: 'rhino-1', name: 'Siege Rhino', power: '4', toughness: '5', owner: 'opponent' });
    const state = makeGameState({}, { battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'shock-1', name: 'Shock', owner: 'you' },
      effect: { type: 'damage', amount: 2 },
      targeting_data: { targetType: 'creature', targetData: { ...creature, owner: 'opponent' } }
    });
    const helpers = mockHelpers();
    const result = applyDamage(item, state, helpers);

    expect(result.players.opponent.battlefield.length).toBe(1);
    expect(result.players.opponent.graveyard.length).toBe(0);
  });

  it('does not mutate original state', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: { type: 'damage', amount: 5 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    applyDamage(item, state, helpers);

    expect(state.players.opponent.life).toBe(20);
  });
});

describe('applyDamageDivided', () => {
  it('divides damage across multiple targets', () => {
    const state = makeGameState();
    const creature = createCreature({ card_id: 'elf-1', name: 'Llanowar Elves', power: '1', toughness: '1' });
    state.players.opponent.battlefield = [creature];

    const item = createStackItem({
      source: { card_id: 'titan-1', name: 'Inferno Titan', owner: 'you' },
      effect: { type: 'damage_divided', totalDamage: 3 },
      targeting_data: {
        assignments: [
          { damage: 1, target: { type: 'creature', data: creature, owner: 'opponent' } },
          { damage: 2, target: { type: 'player', data: 'opponent' } }
        ]
      }
    });
    const helpers = mockHelpers();
    const result = applyDamageDivided(item, state, helpers);

    expect(result.players.opponent.life).toBe(18);
    expect(result.players.opponent.battlefield.length).toBe(0);
  });

  it('skips zero damage assignments', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'titan-2', name: 'Inferno Titan', owner: 'you' },
      effect: { type: 'damage_divided' },
      targeting_data: {
        assignments: [
          { damage: 0, target: { type: 'player', data: 'opponent' } },
          { damage: 3, target: { type: 'player', data: 'opponent' } }
        ]
      }
    });
    const helpers = mockHelpers();
    const result = applyDamageDivided(item, state, helpers);

    expect(result.players.opponent.life).toBe(17);
    expect(helpers.logs.length).toBe(1);
  });
});

describe('applyDamagePerNonbasicLands', () => {
  it('deals damage based on nonbasic land count', () => {
    const state = makeGameState(
      { battlefield: [createLand({ name: 'Wasteland', type_line: 'Land' })] },
      { battlefield: [
        createLand({ name: 'Steam Vents', type_line: 'Land - Island Mountain' }),
        createLand({ name: 'Blood Crypt', type_line: 'Land - Swamp Mountain' }),
        createLand({ name: 'Forest', type_line: 'Basic Land - Forest', isBasic: true })
      ]}
    );
    const item = createStackItem({
      source: { card_id: 'pop-1', name: 'Price of Progress', owner: 'you' },
      effect: { type: 'damage_per_nonbasic_lands', multiplier: 2 }
    });
    const helpers = mockHelpers();
    const result = applyDamagePerNonbasicLands(item, state, helpers);

    // You: 1 nonbasic (Wasteland) * 2 = 2 damage
    expect(result.players.you.life).toBe(18);
    // Opponent: 2 nonbasic (Steam Vents, Blood Crypt) * 2 = 4 damage
    expect(result.players.opponent.life).toBe(16);
  });
});

describe('applyDealDamageToController', () => {
  it('deals damage to specified owner', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: { type: 'deal_damage_to_controller', amount: 2, owner: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDealDamageToController(item, state, helpers);

    expect(result.players.opponent.life).toBe(18);
  });

  it('defaults to you when no owner specified', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: { type: 'deal_damage_to_controller', amount: 2 }
    });
    const helpers = mockHelpers();
    const result = applyDealDamageToController(item, state, helpers);

    expect(result.players.you.life).toBe(18);
  });
});

describe('applyDamageToCaster', () => {
  it('deals damage to the caster (Eidolon)', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'eid-1', name: 'Eidolon of the Great Revel', owner: 'you' },
      effect: { type: 'damage_to_caster', amount: 2, targetOwner: 'you' }
    });
    const helpers = mockHelpers();
    const result = applyDamageToCaster(item, state, helpers);

    expect(result.players.you.life).toBe(18);
  });

  it('deals damage to opponent when they cast', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'eid-2', name: 'Eidolon of the Great Revel', owner: 'you' },
      effect: { type: 'damage_to_caster', amount: 2, targetOwner: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDamageToCaster(item, state, helpers);

    expect(result.players.opponent.life).toBe(18);
  });
});

describe('applyDamageAll (End the Festivities style)', () => {
  it('hits only opponent and their creatures and planeswalkers', () => {
    const yourCreature = createCreature({ instance_id: 'i-y1', card_id: 'y1', name: 'Your Bear', power: '2', toughness: '2', owner: 'you' });
    const oppCreature1 = createCreature({ instance_id: 'i-o1', card_id: 'o1', name: 'Goblin', power: '1', toughness: '1', owner: 'opponent' });
    const oppCreature2 = createCreature({ instance_id: 'i-o2', card_id: 'o2', name: 'Rhino', power: '4', toughness: '4', owner: 'opponent' });
    const oppPW = { instance_id: 'pw-1', card_id: 'chandra-1', name: 'Chandra', type_line: 'Legendary Planeswalker — Chandra', loyalty: 4, owner: 'opponent' };

    const state = makeGameState(
      { battlefield: [yourCreature] },
      { battlefield: [oppCreature1, oppCreature2, oppPW] }
    );

    const item = createStackItem({
      source: { card_id: 'etf-1', name: 'End the Festivities', owner: 'you' },
      effect: {
        type: 'damage_all',
        amount: 1,
        targets: {
          players: 'each_opponent',
          permanents: { controller: 'opponents', types: ['creature', 'planeswalker'] },
        },
      },
    });

    const helpers = mockHelpers();
    const result = applyDamageAll(item, state, helpers);

    // Opponent life -1, your life untouched
    expect(result.players.opponent.life).toBe(19);
    expect(result.players.you.life).toBe(20);

    // 1/1 goblin died, 4/4 rhino survived
    const oppBF = result.players.opponent.battlefield;
    expect(oppBF.find(c => c.name === 'Goblin')).toBeUndefined();
    expect(oppBF.find(c => c.name === 'Rhino')).toBeDefined();

    // PW lost 1 loyalty, still alive at 3
    const pw = oppBF.find(c => c.name === 'Chandra');
    expect(pw).toBeDefined();
    expect(pw.loyalty).toBe(3);

    // Your creature was not hit
    expect(result.players.you.battlefield.length).toBe(1);
    expect(result.players.you.battlefield[0].name).toBe('Your Bear');
  });

  it('kills planeswalker when loyalty reaches 0', () => {
    const pw = { instance_id: 'pw-2', card_id: 'jace-1', name: 'Jace', type_line: 'Legendary Planeswalker — Jace', loyalty: 1, owner: 'opponent' };
    const state = makeGameState({}, { battlefield: [pw] });

    const item = createStackItem({
      source: { card_id: 'etf-2', name: 'End the Festivities', owner: 'you' },
      effect: {
        type: 'damage_all',
        amount: 1,
        targets: {
          players: 'each_opponent',
          permanents: { controller: 'opponents', types: ['creature', 'planeswalker'] },
        },
      },
    });

    const helpers = mockHelpers();
    const result = applyDamageAll(item, state, helpers);

    expect(result.players.opponent.battlefield.length).toBe(0);
    expect(result.players.opponent.graveyard.length).toBe(1);
    expect(result.players.opponent.graveyard[0].name).toBe('Jace');
    expect(result._dyingCreatures.length).toBe(1);
  });

  it('accumulates damage across two AoE events and kills on second hit', () => {
    const oppCreature = createCreature({ instance_id: 'i-o', card_id: 'o', name: 'Bear', power: '2', toughness: '2', owner: 'opponent' });
    const state = makeGameState({}, { battlefield: [oppCreature] });

    const makeSpell = (name) => createStackItem({
      source: { card_id: 'etf-x', name, owner: 'you' },
      effect: {
        type: 'damage_all',
        amount: 1,
        targets: {
          players: 'each_opponent',
          permanents: { controller: 'opponents', types: ['creature', 'planeswalker'] },
        },
      },
    });

    const h1 = mockHelpers();
    const afterFirst = applyDamageAll(makeSpell('End the Festivities'), state, h1);
    // Survived but marked with 1 damage
    expect(afterFirst.players.opponent.battlefield.length).toBe(1);
    expect(afterFirst.players.opponent.battlefield[0].damage).toBe(1);

    const h2 = mockHelpers();
    const afterSecond = applyDamageAll(makeSpell('End the Festivities'), afterFirst, h2);
    // Marked damage 1 + 1 = 2 >= toughness 2 → dies
    expect(afterSecond.players.opponent.battlefield.length).toBe(0);
    expect(afterSecond.players.opponent.graveyard.length).toBe(1);
    expect(afterSecond._dyingCreatures.length).toBe(1);
  });

  it('marks damaged_by_deathtouch and kills regardless of toughness', () => {
    // Deathtouch source on own battlefield with instance_id matching source id
    const dtSource = createCreature({
      instance_id: 'i-dt', card_id: 'dt', name: 'Deathtouch Demon',
      power: '1', toughness: '1', owner: 'you', keywords: ['deathtouch'],
    });
    const bigOpp = createCreature({
      instance_id: 'i-big', card_id: 'big', name: 'Worldspine Wurm',
      power: '15', toughness: '15', owner: 'opponent',
    });
    const state = makeGameState({ battlefield: [dtSource] }, { battlefield: [bigOpp] });

    const item = createStackItem({
      source: { instance_id: 'i-dt', card_id: 'dt', name: 'Deathtouch Demon', owner: 'you' },
      effect: {
        type: 'damage_all',
        amount: 1,
        targets: {
          players: 'none',
          permanents: { controller: 'opponents', types: ['creature'] },
        },
      },
    });

    const helpers = mockHelpers();
    const result = applyDamageAll(item, state, helpers);

    // 1 damage < 15 toughness, but deathtouch → dies
    expect(result.players.opponent.battlefield.length).toBe(0);
    expect(result.players.opponent.graveyard.length).toBe(1);
  });

  it('preserves legacy Exocrine behavior when targets absent', () => {
    // Source on battlefield — should be excluded from "each other creature"
    const source = createCreature({ instance_id: 'i-exo', card_id: 'exo-1', name: 'Exocrine', power: '3', toughness: '3', owner: 'you' });
    const yourCreature = createCreature({ instance_id: 'i-ally', card_id: 'y1', name: 'Ally', power: '1', toughness: '1', owner: 'you' });
    const oppCreature = createCreature({ instance_id: 'i-gob', card_id: 'o1', name: 'Goblin', power: '1', toughness: '1', owner: 'opponent' });
    const state = makeGameState(
      { battlefield: [source, yourCreature] },
      { battlefield: [oppCreature] }
    );

    const item = createStackItem({
      source: { instance_id: source.instance_id, card_id: 'exo-1', name: 'Exocrine', owner: 'you' },
      effect: { type: 'damage_all', amount: 2 },  // no targets → legacy
    });

    const helpers = mockHelpers();
    const result = applyDamageAll(item, state, helpers);

    // Each player took 2 damage
    expect(result.players.you.life).toBe(18);
    expect(result.players.opponent.life).toBe(18);

    // Both 1/1s died
    expect(result.players.you.battlefield.find(c => c.name === 'Ally')).toBeUndefined();
    expect(result.players.opponent.battlefield.length).toBe(0);

    // Source survived (excluded + 2 damage < 3 toughness)
    expect(result.players.you.battlefield.find(c => c.name === 'Exocrine')).toBeDefined();
  });
});
