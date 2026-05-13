import { describe, it, expect } from 'vitest';
import { applyDestroyLand, applyWildfire } from '../destruction';
import { makeGameState, createCreature, createLand, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyDestroyLand', () => {
  it('removes targeted land from battlefield to graveyard', () => {
    const land = createLand({ card_id: 'vents-1', name: 'Steam Vents', type_line: 'Land - Island Mountain' });
    const state = makeGameState({}, { battlefield: [land] });
    const item = createStackItem({
      source: { card_id: 'waste-1', name: 'Wasteland', owner: 'you' },
      effect: { type: 'destroy_land' },
      targeting_data: { targetData: { card_id: 'vents-1' }, targetOwner: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDestroyLand(item, state, helpers);

    expect(result.players.opponent.battlefield.length).toBe(0);
    expect(result.players.opponent.graveyard.length).toBe(1);
    expect(result.players.opponent.graveyard[0].name).toBe('Steam Vents');
    expect(result._destroyedLand.land.name).toBe('Steam Vents');
    expect(result._destroyedLand.owner).toBe('opponent');
  });

  it('does nothing when land not found', () => {
    const state = makeGameState({}, { battlefield: [] });
    const item = createStackItem({
      effect: { type: 'destroy_land' },
      targeting_data: { targetData: { card_id: 'missing-1' }, targetOwner: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDestroyLand(item, state, helpers);

    expect(result._destroyedLand).toBeUndefined();
  });
});

describe('applyWildfire', () => {
  it('sacrifices lands from both players and damages creatures', () => {
    const yourLands = [
      createLand({ card_id: 'yl1', name: 'Mountain', type_line: 'Basic Land - Mountain' }),
      createLand({ card_id: 'yl2', name: 'Mountain', type_line: 'Basic Land - Mountain' }),
    ];
    const oppLands = [
      createLand({ card_id: 'ol1', name: 'Forest', type_line: 'Basic Land - Forest' }),
      createLand({ card_id: 'ol2', name: 'Forest', type_line: 'Basic Land - Forest' }),
      createLand({ card_id: 'ol3', name: 'Forest', type_line: 'Basic Land - Forest' }),
    ];
    const smallCreature = createCreature({ card_id: 'sc1', name: 'Goblin', type_line: 'Creature - Goblin', power: '1', toughness: '1' });
    const bigCreature = createCreature({ card_id: 'bc1', name: 'Wurm', type_line: 'Creature - Wurm', power: '6', toughness: '6' });

    const state = makeGameState(
      { battlefield: [...yourLands, bigCreature] },
      { battlefield: [...oppLands, smallCreature] }
    );

    const item = createStackItem({
      source: { card_id: 'wf-1', name: 'Wildfire', owner: 'you' },
      effect: { type: 'wildfire', landSacrificeCount: 4, creatureDamage: 4 }
    });
    const helpers = mockHelpers();
    const result = applyWildfire(item, state, helpers);

    // You had 2 lands, both sacrificed (less than 4)
    expect(result.players.you.battlefield.filter(c => c.type_line?.includes('Land')).length).toBe(0);
    expect(result.players.you.graveyard.filter(c => c.type_line?.includes('Land')).length).toBe(2);

    // Opponent had 3 lands, all sacrificed (less than 4)
    expect(result.players.opponent.battlefield.filter(c => c.type_line?.includes('Land')).length).toBe(0);

    // Small creature (1 toughness) dies from 4 damage
    expect(result.players.opponent.battlefield.find(c => c.name === 'Goblin')).toBeUndefined();

    // Big creature (6 toughness) survives 4 damage
    expect(result.players.you.battlefield.find(c => c.name === 'Wurm')).toBeDefined();

    expect(result._sacrificedLands.length).toBe(5); // 2 + 3
    expect(result._deadCreatures.length).toBe(1); // just the goblin
  });

  it('uses default values when not specified', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'wf-2', name: 'Wildfire', owner: 'you' },
      effect: { type: 'wildfire' }
    });
    const helpers = mockHelpers();
    const result = applyWildfire(item, state, helpers);

    // Should not crash with empty battlefields
    expect(result._sacrificedLands).toEqual([]);
    expect(result._deadCreatures).toEqual([]);
  });
});
