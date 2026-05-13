import { describe, it, expect } from 'vitest';
import { applyEffect, effectHandlers } from '../index';
import { makeGameState, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('effectHandlers registry', () => {
  it('has handlers for all expected effect types', () => {
    const expectedTypes = [
      'damage', 'damage_divided', 'damage_per_nonbasic_lands', 'deal_damage_to_controller', 'damage_to_caster',
      'gain_life', 'gain_life_equal_toughness', 'gain_life_and_scry', 'drain_life', 'opponent_loses_life',
      'draw_cards', 'each_player_draws',
      'buff_creature', 'buff_self', 'prowess_trigger',
      'add_counter_to_self', 'add_counter_to_source',
      'add_mana', 'channel_activate',
      'enter_battlefield', 'enter_battlefield_permanent', 'create_token', 'sacrifice_self',
      'destroy_land', 'wildfire',
    ];
    expectedTypes.forEach(type => {
      expect(effectHandlers[type]).toBeDefined();
      expect(typeof effectHandlers[type]).toBe('function');
    });
  });
});

describe('applyEffect', () => {
  it('dispatches to correct handler', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'bolt-1', name: 'Lightning Bolt', owner: 'you' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyEffect(item, state, helpers);

    expect(result.players.opponent.life).toBe(17);
  });

  it('returns unchanged state for unknown effect type', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: { type: 'nonexistent_effect' }
    });
    const helpers = mockHelpers();
    const result = applyEffect(item, state, helpers);

    expect(result.players.you.life).toBe(20);
    expect(result.players.opponent.life).toBe(20);
    expect(helpers.logs.some(l => l.includes('Unknown effect type'))).toBe(true);
  });

  it('logs victory when opponent life <= 0', () => {
    const state = makeGameState({}, { life: 3 });
    const item = createStackItem({
      source: { card_id: 'bolt-2', name: 'Lightning Bolt', owner: 'you' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    applyEffect(item, state, helpers);

    expect(helpers.logs.some(l => l.includes('VICTORY'))).toBe(true);
  });

  it('logs defeat when your life <= 0', () => {
    const state = makeGameState({ life: 2 });
    const item = createStackItem({
      source: { card_id: 'bolt-3', name: 'Lightning Bolt', owner: 'opponent' },
      effect: { type: 'damage', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'you' }
    });
    const helpers = mockHelpers();
    applyEffect(item, state, helpers);

    expect(helpers.logs.some(l => l.includes('DEFEAT'))).toBe(true);
  });
});
