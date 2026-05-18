import { describe, it, expect } from 'vitest';
import { applyEnterBattlefield, applyEnterBattlefieldPermanent, applyCreateToken, applyCreateTokenCopy, applySacrificeSelf, applyAnimateArtifactAsCreature } from '../battlefield';
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

  describe('count_from: permanent_count (Krenko-style)', () => {
    const goblin = (name) => ({
      instance_id: `gob-${name}`, card_id: 1, name,
      type_line: 'Creature — Goblin', tapped: false, summoning_sick: false,
    });
    const human = (name) => ({
      instance_id: `hum-${name}`, card_id: 2, name,
      type_line: 'Creature — Human', tapped: false, summoning_sick: false,
    });

    it('produces 0 tokens when no matching permanents', () => {
      const state = makeGameState({ battlefield: [human('priest')] });
      const item = createStackItem({
        effect: {
          type: 'create_token',
          token: { name: 'Goblin Token', type_line: 'Token Creature — Goblin', power: 1, toughness: 1, colors: ['R'] },
          count_from: { type: 'permanent_count', filter: { types: ['goblin'], controller: 'you' } },
          owner: 'you',
        }
      });
      const result = applyCreateToken(item, state, mockHelpers());
      // 1 prior permanent (the human) + 0 new tokens = 1 total
      expect(result.players.you.battlefield.length).toBe(1);
    });

    it('produces X tokens equal to matching permanents controlled by you', () => {
      const state = makeGameState({
        battlefield: [goblin('skirk'), goblin('sharpshooter'), goblin('krenko'), human('priest')],
      });
      const item = createStackItem({
        effect: {
          type: 'create_token',
          token: { name: 'Goblin Token', type_line: 'Token Creature — Goblin', power: 1, toughness: 1, colors: ['R'] },
          count_from: { type: 'permanent_count', filter: { types: ['goblin'], controller: 'you' } },
          owner: 'you',
        }
      });
      const result = applyCreateToken(item, state, mockHelpers());
      // 4 prior permanents (3 goblins + 1 human) + 3 new goblin tokens = 7
      expect(result.players.you.battlefield.length).toBe(7);
      const newTokens = result.players.you.battlefield.filter(p => p.isToken);
      expect(newTokens.length).toBe(3);
    });

    it('does NOT count opponent permanents when controller is "you"', () => {
      const state = makeGameState(
        { battlefield: [goblin('mine')] },
        { battlefield: [goblin('theirs1'), goblin('theirs2')] },
      );
      const item = createStackItem({
        effect: {
          type: 'create_token',
          token: { name: 'Goblin Token', type_line: 'Token Creature — Goblin', power: 1, toughness: 1, colors: ['R'] },
          count_from: { type: 'permanent_count', filter: { types: ['goblin'], controller: 'you' } },
          owner: 'you',
        }
      });
      const result = applyCreateToken(item, state, mockHelpers());
      // 1 prior + 1 new token (only your goblin counts) = 2 total
      expect(result.players.you.battlefield.length).toBe(2);
    });

    it('matches Token Creature — Goblin (so tokens count themselves on later activations)', () => {
      const state = makeGameState({
        battlefield: [
          goblin('krenko'),
          { instance_id: 'tok-1', card_id: 'token-1', name: 'Goblin Token', type_line: 'Token Creature — Goblin', isToken: true, tapped: false, summoning_sick: false },
        ],
      });
      const item = createStackItem({
        effect: {
          type: 'create_token',
          token: { name: 'Goblin Token', type_line: 'Token Creature — Goblin', power: 1, toughness: 1, colors: ['R'] },
          count_from: { type: 'permanent_count', filter: { types: ['goblin'], controller: 'you' } },
          owner: 'you',
        }
      });
      const result = applyCreateToken(item, state, mockHelpers());
      // 2 prior (krenko + 1 token) + 2 new tokens = 4
      expect(result.players.you.battlefield.length).toBe(4);
    });
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

describe('applyCreateTokenCopy', () => {
  const skirkProspector = {
    instance_id: 'skirk-1',
    card_id: 205,
    name: 'Skirk Prospector',
    type_line: 'Creature — Goblin',
    mana_cost: '{R}',
    power: '1',
    toughness: '1',
    colors: ['R'],
    keywords: [],
    activated_abilities: [{
      type: 'activated',
      cost: { sacrifice: { type: 'goblin', count: 1 } },
      effect: { type: 'add_mana', mana: { R: 1 } },
    }],
    // Runtime state that should NOT be copied
    counters: { '+1/+1': 2 },
    damage: 1,
    buffPower: 3,
    buffToughness: 3,
    tapped: true,
    summoning_sick: false,
  };

  it('builds a token from target printed characteristics with extra keywords', () => {
    const state = makeGameState({ battlefield: [skirkProspector] });
    const item = createStackItem({
      source: { instance_id: 'kiki-1', card_id: 999, name: 'Kiki-Jiki, Mirror Breaker', owner: 'you' },
      effect: {
        type: 'create_token_copy',
        extra_keywords: ['haste'],
        sac_at_end_step: true,
      },
      targeting_data: { targetType: 'creature', targetData: skirkProspector },
    });
    const result = applyCreateTokenCopy(item, state, mockHelpers());

    expect(result.players.you.battlefield.length).toBe(2);
    const token = result.players.you.battlefield.find(p => p.isToken);
    expect(token).toBeDefined();
    expect(token.name).toBe('Skirk Prospector');
    expect(token.type_line).toBe('Token Creature — Goblin');
    expect(token.power).toBe('1');
    expect(token.toughness).toBe('1');
    expect(token.colors).toEqual(['R']);
    expect(token.keywords).toContain('haste');
    // Activated abilities copied
    expect(token.activated_abilities?.length).toBe(1);
    // End-step sac trigger baked in
    const hasEndStepSac = (token.triggered_abilities || []).some(
      ta => ta.trigger?.event === 'end_step' && ta.effect?.type === 'sacrifice_self'
    );
    expect(hasEndStepSac).toBe(true);
    // Haste bypasses summoning sickness
    expect(token.summoning_sick).toBe(false);
    // Runtime state NOT copied
    expect(token.counters).toEqual({});
    expect(token.damage).toBeUndefined();
    expect(token.buffPower).toBeUndefined();
    expect(token.tapped).toBe(false);
  });

  it('fizzles cleanly when target is missing', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { instance_id: 'kiki-1', name: 'Kiki-Jiki', owner: 'you' },
      effect: { type: 'create_token_copy', sac_at_end_step: true },
      targeting_data: { targetType: 'creature', targetData: null },
    });
    const result = applyCreateTokenCopy(item, state, mockHelpers());
    expect(result.players.you.battlefield.length).toBe(0);
  });

  it('without extra_keywords or sac flag, copy is a clean facsimile', () => {
    const state = makeGameState({ battlefield: [skirkProspector] });
    const item = createStackItem({
      source: { instance_id: 'kiki-1', name: 'Kiki', owner: 'you' },
      effect: { type: 'create_token_copy' },
      targeting_data: { targetType: 'creature', targetData: skirkProspector },
    });
    const result = applyCreateTokenCopy(item, state, mockHelpers());
    const token = result.players.you.battlefield.find(p => p.isToken);
    expect(token.keywords).toEqual([]);
    expect(token.triggered_abilities).toBeUndefined();
    expect(token.summoning_sick).toBe(true);
  });
});

describe('applyAnimateArtifactAsCreature (Karn the Great Creator +1)', () => {
  it('turns target noncreature artifact into a P/T=CMC artifact creature and tracks revert', () => {
    const boomKeg = {
      instance_id: 'keg-1', card_id: 999, name: 'Goblin Boom Keg',
      type_line: 'Artifact',
      mana_cost: '{4}',
      power: null, toughness: null,
      tapped: false, summoning_sick: false,
    };
    const state = makeGameState({ battlefield: [boomKeg] });
    state.turnNumber = 5;
    const item = createStackItem({
      source: { instance_id: 'karn-1', name: 'Karn, the Great Creator', owner: 'you' },
      effect: { type: 'animate_artifact_as_creature', duration: 'until_next_turn' },
      targeting_data: { targetType: 'artifact', targetData: { ...boomKeg, owner: 'you' } },
    });
    const result = applyAnimateArtifactAsCreature(item, state, mockHelpers());
    const animated = result.players.you.battlefield[0];
    expect(animated.type_line.toLowerCase()).toContain('creature');
    expect(animated.power).toBe('4');
    expect(animated.toughness).toBe('4');
    expect(animated.summoning_sick).toBe(true);
    expect(result._animatedArtifacts?.length).toBe(1);
    expect(result._animatedArtifacts[0].expiresAtTurn).toBe(6);
    expect(result._animatedArtifacts[0].originalTypeLine).toBe('Artifact');
  });

  it('fizzles cleanly when target is no longer on the battlefield', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { instance_id: 'karn-2', name: 'Karn', owner: 'you' },
      effect: { type: 'animate_artifact_as_creature' },
      targeting_data: { targetType: 'artifact', targetData: { instance_id: 'missing', owner: 'you' } },
    });
    const result = applyAnimateArtifactAsCreature(item, state, mockHelpers());
    expect(result._animatedArtifacts).toBeUndefined();
  });
});
