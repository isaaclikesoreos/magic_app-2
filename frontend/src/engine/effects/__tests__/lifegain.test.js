import { describe, it, expect } from 'vitest';
import { applyGainLife, applyGainLifeEqualToughness, applyGainLifeAndScry, applyDrainLife, applyOpponentLosesLife } from '../lifegain';
import { makeGameState, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyGainLife', () => {
  it('adds life to player', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'sw-1', name: 'Soul Warden', owner: 'you' },
      effect: { type: 'gain_life', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyGainLife(item, state, helpers);

    expect(result.players.you.life).toBe(21);
    expect(result._lifeGained).toBe(1);
  });

  it('defaults to 1 life when amount not specified', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'sw-2', name: 'Soul Warden', owner: 'you' },
      effect: { type: 'gain_life' }
    });
    const helpers = mockHelpers();
    const result = applyGainLife(item, state, helpers);

    expect(result.players.you.life).toBe(21);
  });
});

describe('applyGainLifeEqualToughness', () => {
  it('gains life equal to sacrificed creature toughness', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'disc-1', name: 'Disciple of Griselbrand', owner: 'you' },
      effect: {
        type: 'gain_life_equal_toughness',
        sacrificedCreature: { name: 'Thragtusk', toughness: '4', counters: { '+1/+1': 2 } }
      }
    });
    const helpers = mockHelpers();
    const result = applyGainLifeEqualToughness(item, state, helpers);

    // Toughness = 4 base + 2 counters = 6
    expect(result.players.you.life).toBe(26);
    expect(result._lifeGained).toBe(6);
  });

  it('handles missing sacrificedCreature gracefully', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'disc-2', name: 'Disciple of Griselbrand', owner: 'you' },
      effect: { type: 'gain_life_equal_toughness' }
    });
    const helpers = mockHelpers();
    const result = applyGainLifeEqualToughness(item, state, helpers);

    expect(result.players.you.life).toBe(20);
  });
});

describe('applyGainLifeAndScry', () => {
  it('gains life and logs scry', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'ft-1', name: 'Fleshtaker', owner: 'you' },
      effect: { type: 'gain_life_and_scry', lifeAmount: 1, scryAmount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyGainLifeAndScry(item, state, helpers);

    expect(result.players.you.life).toBe(21);
    expect(result._lifeGained).toBe(1);
    expect(helpers.logs.some(l => l.includes('Scry'))).toBe(true);
  });
});

describe('applyDrainLife', () => {
  it('drains life from opponent (opponent loses, you gain)', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'ten-1', name: 'Tendrils of Agony', owner: 'you' },
      effect: { type: 'drain_life', amount: 2 },
      targeting_data: { targetType: 'player', targetData: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyDrainLife(item, state, helpers);

    expect(result.players.opponent.life).toBe(18);
    expect(result.players.you.life).toBe(22);
  });

  it('nets zero when draining yourself', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'ten-2', name: 'Tendrils of Agony', owner: 'you' },
      effect: { type: 'drain_life', amount: 2 },
      targeting_data: { targetType: 'player', targetData: 'you' }
    });
    const helpers = mockHelpers();
    const result = applyDrainLife(item, state, helpers);

    expect(result.players.you.life).toBe(20);
  });
});

describe('applyOpponentLosesLife', () => {
  it('reduces opponent life', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'wicked-1', name: 'Wicked Role', owner: 'you' },
      effect: { type: 'opponent_loses_life', amount: 1 }
    });
    const helpers = mockHelpers();
    const result = applyOpponentLosesLife(item, state, helpers);

    expect(result.players.opponent.life).toBe(19);
  });

  it('also gains life when youGain flag is set', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'wicked-2', name: 'Wicked Role', owner: 'you' },
      effect: { type: 'opponent_loses_life', amount: 2, youGain: true }
    });
    const helpers = mockHelpers();
    const result = applyOpponentLosesLife(item, state, helpers);

    expect(result.players.opponent.life).toBe(18);
    expect(result.players.you.life).toBe(22);
  });
});
