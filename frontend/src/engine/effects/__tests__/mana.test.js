import { describe, it, expect } from 'vitest';
import { applyAddMana, applyChannelActivate } from '../mana';
import { makeGameState, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyAddMana', () => {
  it('adds mana to pool (Dark Ritual)', () => {
    const state = makeGameState({ mana_pool: { B: 0 } });
    const item = createStackItem({
      source: { card_id: 'rit-1', name: 'Dark Ritual', owner: 'you' },
      effect: { type: 'add_mana', mana: { B: 3 } }
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.B).toBe(3);
  });

  it('adds to existing mana in pool', () => {
    const state = makeGameState({ mana_pool: { R: 2 } });
    const item = createStackItem({
      source: { card_id: 'rit-2', name: 'Pyretic Ritual', owner: 'you' },
      effect: { type: 'add_mana', mana: { R: 3 } }
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(5);
  });

  it('adds multiple colors at once', () => {
    const state = makeGameState({ mana_pool: {} });
    const item = createStackItem({
      source: { card_id: 'lotus-1', name: 'Black Lotus', owner: 'you' },
      effect: { type: 'add_mana', mana: { R: 1, G: 1, B: 1 } }
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(1);
    expect(result.players.you.mana_pool.G).toBe(1);
    expect(result.players.you.mana_pool.B).toBe(1);
  });
});

describe('applyAddMana with mana_per_count (Rite of Flame)', () => {
  const riteEffect = {
    type: 'add_mana',
    mana: { R: 2 },
    mana_per_count: [
      {
        color: 'R',
        count: {
          type: 'cards_with_name',
          name: 'Rite of Flame',
          zones: ['graveyard'],
          controllers: 'all',
        },
      },
    ],
  };

  it('adds RR with no copies in any graveyard', () => {
    const state = makeGameState({ mana_pool: {} });
    const item = createStackItem({
      source: { card_id: 'rite-cast', name: 'Rite of Flame', owner: 'you' },
      effect: riteEffect,
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(2);
  });

  it('adds RRR with one copy in your graveyard', () => {
    const state = makeGameState(
      { mana_pool: {}, graveyard: [{ card_id: 'rite-1', instance_id: 'i-rite-1', name: 'Rite of Flame' }] },
      {}
    );
    const item = createStackItem({
      source: { card_id: 'rite-cast', name: 'Rite of Flame', owner: 'you' },
      effect: riteEffect,
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(3);
  });

  it('adds RRRR with one copy in each graveyard (controllers: all)', () => {
    const state = makeGameState(
      { mana_pool: {}, graveyard: [{ card_id: 'rite-1', instance_id: 'i-rite-1', name: 'Rite of Flame' }] },
      { graveyard: [{ card_id: 'rite-2', instance_id: 'i-rite-2', name: 'Rite of Flame' }] }
    );
    const item = createStackItem({
      source: { card_id: 'rite-cast', name: 'Rite of Flame', owner: 'you' },
      effect: riteEffect,
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(4);
  });

  it('does not count differently-named cards in graveyards', () => {
    const state = makeGameState(
      { mana_pool: {}, graveyard: [
        { card_id: 'bolt', instance_id: 'i-bolt', name: 'Lightning Bolt' },
        { card_id: 'shock', instance_id: 'i-shock', name: 'Shock' },
      ] },
      { graveyard: [{ card_id: 'pyretic', instance_id: 'i-pyr', name: 'Pyretic Ritual' }] }
    );
    const item = createStackItem({
      source: { card_id: 'rite-cast', name: 'Rite of Flame', owner: 'you' },
      effect: riteEffect,
    });
    const helpers = mockHelpers();
    const result = applyAddMana(item, state, helpers);

    expect(result.players.you.mana_pool.R).toBe(2);
  });

  it('logs the dynamic component separately', () => {
    const state = makeGameState(
      { mana_pool: {}, graveyard: [
        { card_id: 'r1', instance_id: 'i-r1', name: 'Rite of Flame' },
        { card_id: 'r2', instance_id: 'i-r2', name: 'Rite of Flame' },
      ] },
      {}
    );
    const item = createStackItem({
      source: { card_id: 'rite-cast', name: 'Rite of Flame', owner: 'you' },
      effect: riteEffect,
    });
    const helpers = mockHelpers();
    applyAddMana(item, state, helpers);

    const log = helpers.logs.join(' | ');
    expect(log).toContain('{R}{R}{R}{R}');  // total 4
    expect(log).toContain('from count');
  });
});

describe('applyChannelActivate', () => {
  it('adds the channel mana to the pool', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'ch-1', name: 'Channel', owner: 'you' },
      effect: { type: 'channel_activate', manaToAdd: { G: 2 } }
    });
    const helpers = mockHelpers();
    const result = applyChannelActivate(item, state, helpers);

    expect(result.players.you.mana_pool.G).toBe(2);
  });
});
