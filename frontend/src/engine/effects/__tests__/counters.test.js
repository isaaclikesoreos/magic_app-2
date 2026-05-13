import { describe, it, expect } from 'vitest';
import { applyAddCounterToSelf, applyAddCounterToSource } from '../counters';
import { makeGameState, createCreature, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyAddCounterToSelf', () => {
  it('adds +1/+1 counter to source on your battlefield', () => {
    const pridemate = createCreature({ card_id: 'pm-1', name: "Ajani's Pridemate", counters: {} });
    const state = makeGameState({ battlefield: [pridemate] });
    const item = createStackItem({
      source: { card_id: 'pm-1', name: "Ajani's Pridemate", owner: 'you' },
      effect: { type: 'add_counter_to_self', counterType: '+1/+1', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyAddCounterToSelf(item, state, helpers);

    expect(result.players.you.battlefield[0].counters['+1/+1']).toBe(1);
  });

  it('stacks counters on existing ones', () => {
    const pridemate = createCreature({ card_id: 'pm-2', name: "Ajani's Pridemate", counters: { '+1/+1': 3 } });
    const state = makeGameState({ battlefield: [pridemate] });
    const item = createStackItem({
      source: { card_id: 'pm-2', name: "Ajani's Pridemate", owner: 'you' },
      effect: { type: 'add_counter_to_self', counterType: '+1/+1', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyAddCounterToSelf(item, state, helpers);

    expect(result.players.you.battlefield[0].counters['+1/+1']).toBe(4);
  });

  it('creates counters object if missing', () => {
    const pridemate = createCreature({ card_id: 'pm-3', name: "Ajani's Pridemate" });
    delete pridemate.counters;
    const state = makeGameState({ battlefield: [pridemate] });
    const item = createStackItem({
      source: { card_id: 'pm-3', name: "Ajani's Pridemate", owner: 'you' },
      effect: { type: 'add_counter_to_self', counterType: '+1/+1', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyAddCounterToSelf(item, state, helpers);

    expect(result.players.you.battlefield[0].counters['+1/+1']).toBe(1);
  });
});

describe('applyAddCounterToSource', () => {
  it('adds counter to source on your battlefield', () => {
    const shredder = createCreature({ card_id: 'ss-1', name: 'Super Shredder', counters: {} });
    const state = makeGameState({ battlefield: [shredder] });
    const item = createStackItem({
      source: { card_id: 'ss-1', name: 'Super Shredder', owner: 'you' },
      effect: { type: 'add_counter_to_source', counterType: '+1/+1', count: 1 }
    });
    const helpers = mockHelpers();
    const result = applyAddCounterToSource(item, state, helpers);

    expect(result.players.you.battlefield[0].counters['+1/+1']).toBe(1);
  });

  it('finds source on opponent battlefield too', () => {
    const shredder = createCreature({ card_id: 'ss-2', name: 'Super Shredder', counters: {} });
    const state = makeGameState({}, { battlefield: [shredder] });
    const item = createStackItem({
      source: { card_id: 'ss-2', name: 'Super Shredder', owner: 'opponent' },
      effect: { type: 'add_counter_to_source', counterType: '+1/+1', count: 2 }
    });
    const helpers = mockHelpers();
    const result = applyAddCounterToSource(item, state, helpers);

    expect(result.players.opponent.battlefield[0].counters['+1/+1']).toBe(2);
  });
});
