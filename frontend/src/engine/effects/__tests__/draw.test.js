import { describe, it, expect } from 'vitest';
import { applyDrawCards, applyEachPlayerDraws } from '../draw';
import { makeGameState, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyDrawCards', () => {
  it('moves cards from library to hand', () => {
    const card1 = { card_id: 'c1', name: 'Lightning Bolt' };
    const card2 = { card_id: 'c2', name: 'Mountain' };
    const card3 = { card_id: 'c3', name: 'Goblin Guide' };
    const state = makeGameState({ library: [card1, card2, card3] });
    const item = createStackItem({
      source: { card_id: 'recall-1', name: 'Ancestral Recall', owner: 'you' },
      effect: { type: 'draw_cards', amount: 2 },
    });
    const helpers = mockHelpers();
    const result = applyDrawCards(item, state, helpers);

    expect(result.players.you.hand.length).toBe(2);
    expect(result.players.you.hand[0].name).toBe('Lightning Bolt');
    expect(result.players.you.hand[1].name).toBe('Mountain');
    expect(result.players.you.library.length).toBe(1);
  });

  it('sets deckedOut when trying to draw from empty library', () => {
    const state = makeGameState({ library: [] });
    const item = createStackItem({
      source: { card_id: 'recall-2', name: 'Ancestral Recall', owner: 'you' },
      effect: { type: 'draw_cards', amount: 3 },
    });
    const helpers = mockHelpers();
    const result = applyDrawCards(item, state, helpers);

    expect(result.players.you.deckedOut).toBe(true);
  });

  it('draws for opponent when targeted', () => {
    const card1 = { card_id: 'c1', name: 'Forest' };
    const state = makeGameState({}, { library: [card1] });
    const item = createStackItem({
      source: { card_id: 'recall-3', name: 'Ancestral Recall', owner: 'you' },
      effect: { type: 'draw_cards', amount: 1 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDrawCards(item, state, helpers);

    expect(result.players.opponent.hand.length).toBe(1);
    expect(result.players.opponent.hand[0].name).toBe('Forest');
  });

  it('sets opponent deckedOut when they try to draw from empty library', () => {
    const state = makeGameState({}, { library: [] });
    const item = createStackItem({
      effect: { type: 'draw_cards', amount: 1 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDrawCards(item, state, helpers);

    expect(result.players.opponent.deckedOut).toBe(true);
  });
});

describe('limit_opponent_draws static (Narset, Parter of Veils)', () => {
  const narset = {
    instance_id: 'narset-1',
    card_id: 'narset',
    name: 'Narset, Parter of Veils',
    type_line: 'Legendary Planeswalker — Narset',
    loyalty: 5,
    static_abilities: [{
      effect: { type: 'limit_opponent_draws', max_per_turn: 1 },
    }],
  };

  it('caps opponent draw at 1 per turn when Narset is on your battlefield', () => {
    const state = makeGameState(
      { battlefield: [narset] },
      { library: [{ card_id: 'a', name: 'A' }, { card_id: 'b', name: 'B' }, { card_id: 'c', name: 'C' }] }
    );
    const item = createStackItem({
      source: { card_id: 'spell', name: 'Opponent Card Draw', owner: 'opponent' },
      effect: { type: 'draw_cards', amount: 3 },
      targeting_data: { targetType: 'player', targetData: 'opponent' },
    });
    const helpers = mockHelpers();
    const result = applyDrawCards(item, state, helpers);

    expect(result.players.opponent.hand.length).toBe(1);
    expect(result._opponentCardsDrawnThisTurn).toBe(1);
  });

  it('blocks the second draw across two events in the same turn', () => {
    let state = makeGameState(
      { battlefield: [narset] },
      { library: [{ card_id: 'a', name: 'A' }, { card_id: 'b', name: 'B' }] }
    );
    const item1 = createStackItem({
      source: { card_id: 'spell1', name: 'Spell 1', owner: 'opponent' },
      effect: { type: 'draw_cards', amount: 1 },
      targeting_data: { targetType: 'player', targetData: 'opponent' },
    });
    state = applyDrawCards(item1, state, mockHelpers());
    expect(state.players.opponent.hand.length).toBe(1);

    const item2 = createStackItem({
      source: { card_id: 'spell2', name: 'Spell 2', owner: 'opponent' },
      effect: { type: 'draw_cards', amount: 1 },
      targeting_data: { targetType: 'player', targetData: 'opponent' },
    });
    const result = applyDrawCards(item2, state, mockHelpers());
    expect(result.players.opponent.hand.length).toBe(1);  // still 1, second draw blocked
  });

  it('does not affect controller draws', () => {
    const state = makeGameState(
      {
        battlefield: [narset],
        library: [{ card_id: 'a', name: 'A' }, { card_id: 'b', name: 'B' }, { card_id: 'c', name: 'C' }],
      },
      {}
    );
    const item = createStackItem({
      source: { card_id: 'spell', name: 'Your Draw', owner: 'you' },
      effect: { type: 'draw_cards', amount: 3 },
    });
    const result = applyDrawCards(item, state, mockHelpers());

    expect(result.players.you.hand.length).toBe(3);
  });
});

describe('applyEachPlayerDraws', () => {
  it('both players draw cards', () => {
    const yourCard = { card_id: 'yc1', name: 'Plains' };
    const oppCard = { card_id: 'oc1', name: 'Island' };
    const state = makeGameState(
      { library: [yourCard] },
      { library: [oppCard] }
    );
    const item = createStackItem({
      source: { card_id: 'wheel-1', name: 'Howling Mine', owner: 'you' },
      effect: { type: 'each_player_draws', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyEachPlayerDraws(item, state, helpers);

    expect(result.players.you.hand.length).toBe(1);
    expect(result.players.opponent.hand.length).toBe(1);
  });
});
