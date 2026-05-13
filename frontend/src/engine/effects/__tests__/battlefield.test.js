import { describe, it, expect } from 'vitest';
import { applyEnterBattlefield, applyEnterBattlefieldPermanent, applyCreateToken, applySacrificeSelf } from '../battlefield';
import { makeGameState, createCreature, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyEnterBattlefield', () => {
  it('adds creature to battlefield with summoning sickness', () => {
    const state = makeGameState();
    const creature = { card_id: 'bear-1', name: 'Grizzly Bears', type_line: 'Creature - Bear', power: '2', toughness: '2' };
    const item = createStackItem({
      effect: { type: 'enter_battlefield', creature, owner: 'you' }
    });
    const helpers = mockHelpers();
    const result = applyEnterBattlefield(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(1);
    expect(result.players.you.battlefield[0].name).toBe('Grizzly Bears');
    expect(result.players.you.battlefield[0].summoning_sick).toBe(true);
    expect(result.players.you.battlefield[0].tapped).toBe(false);
  });

  it('enters with +1/+1 counters when specified', () => {
    const state = makeGameState();
    const creature = { card_id: 'ballista-1', name: 'Walking Ballista', power: '0', toughness: '0' };
    const item = createStackItem({
      effect: { type: 'enter_battlefield', creature, owner: 'you', enteringCounters: 3 }
    });
    const helpers = mockHelpers();
    const result = applyEnterBattlefield(item, state, helpers);

    expect(result.players.you.battlefield[0].counters['+1/+1']).toBe(3);
  });

  it('adds creature to opponent battlefield', () => {
    const state = makeGameState();
    const creature = { card_id: 'goblin-1', name: 'Goblin' };
    const item = createStackItem({
      effect: { type: 'enter_battlefield', creature, owner: 'opponent' }
    });
    const helpers = mockHelpers();
    const result = applyEnterBattlefield(item, state, helpers);

    expect(result.players.opponent.battlefield.length).toBe(1);
    expect(result.players.you.battlefield.length).toBe(0);
  });
});

describe('applyEnterBattlefieldPermanent', () => {
  it('adds non-creature permanent to battlefield', () => {
    const state = makeGameState();
    const artifact = { card_id: 'egg-1', name: 'Dingus Egg', type_line: 'Artifact' };
    const item = createStackItem({
      effect: { type: 'enter_battlefield_permanent', permanent: artifact, owner: 'you' }
    });
    const helpers = mockHelpers();
    const result = applyEnterBattlefieldPermanent(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(1);
    expect(result.players.you.battlefield[0].name).toBe('Dingus Egg');
    expect(result.players.you.battlefield[0].tapped).toBe(false);
  });
});

describe('applyCreateToken', () => {
  it('creates specified number of tokens', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: {
        type: 'create_token',
        token: { name: 'Beast', power: 3, toughness: 3 },
        count: 2,
        owner: 'you'
      }
    });
    const helpers = mockHelpers();
    const result = applyCreateToken(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(2);
    result.players.you.battlefield.forEach(token => {
      expect(token.name).toBe('Beast');
      expect(token.power).toBe('3');
      expect(token.toughness).toBe('3');
      expect(token.isToken).toBe(true);
      expect(token.summoning_sick).toBe(true);
    });
  });

  it('defaults to 1 token', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: {
        type: 'create_token',
        token: { name: 'Soldier', power: 1, toughness: 1 }
      }
    });
    const helpers = mockHelpers();
    const result = applyCreateToken(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(1);
  });

  it('assigns unique card_ids to each token', () => {
    const state = makeGameState();
    const item = createStackItem({
      effect: {
        type: 'create_token',
        token: { name: 'Beast', power: 3, toughness: 3 },
        count: 3
      }
    });
    const helpers = mockHelpers();
    const result = applyCreateToken(item, state, helpers);

    const ids = result.players.you.battlefield.map(t => t.card_id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('applySacrificeSelf', () => {
  it('moves creature from battlefield to graveyard', () => {
    const creature = createCreature({ card_id: 'mulldrifter-1', instance_id: 'mulldrifter-1', name: 'Mulldrifter' });
    const state = makeGameState({ battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'mulldrifter-1', instance_id: 'mulldrifter-1', name: 'Mulldrifter', owner: 'you' },
      effect: { type: 'sacrifice_self', owner: 'you' }
    });
    const helpers = mockHelpers();
    const result = applySacrificeSelf(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(0);
    expect(result.players.you.graveyard.length).toBe(1);
    expect(result.players.you.graveyard[0].name).toBe('Mulldrifter');
  });

  it('does nothing when creature not found', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'missing-1', instance_id: 'missing-1', name: 'Missing', owner: 'you' },
      effect: { type: 'sacrifice_self', owner: 'you' }
    });
    const helpers = mockHelpers();
    const result = applySacrificeSelf(item, state, helpers);

    expect(result.players.you.battlefield.length).toBe(0);
    expect(result.players.you.graveyard.length).toBe(0);
  });
});
