import { describe, it, expect } from 'vitest';
import { matchesSacFilter, autoPickSacrifices } from '../sacFilter';

const perm = (overrides) => ({
  card_id: 1,
  instance_id: 'p1',
  name: 'Test',
  type_line: 'Creature — Goblin',
  mana_cost: '{R}',
  colors: ['R'],
  is_token: false,
  ...overrides,
});

describe('matchesSacFilter', () => {
  describe('type filter', () => {
    it('matches single type substring', () => {
      expect(matchesSacFilter(perm(), 'you', { types: ['creature'], controller: 'you' })).toBe(true);
    });

    it('rejects when type does not match', () => {
      expect(matchesSacFilter(perm({ type_line: 'Artifact' }), 'you', {
        types: ['creature'], controller: 'you'
      })).toBe(false);
    });

    it('matches any of multiple types (OR semantics)', () => {
      const artifact = perm({ type_line: 'Artifact' });
      const creature = perm({ type_line: 'Creature — Bear' });
      const filter = { types: ['artifact', 'creature'], controller: 'you' };
      expect(matchesSacFilter(artifact, 'you', filter)).toBe(true);
      expect(matchesSacFilter(creature, 'you', filter)).toBe(true);
    });

    it('matches artifact creature against either type', () => {
      const artifactCreature = perm({ type_line: 'Artifact Creature — Construct' });
      expect(matchesSacFilter(artifactCreature, 'you', {
        types: ['artifact'], controller: 'you'
      })).toBe(true);
      expect(matchesSacFilter(artifactCreature, 'you', {
        types: ['creature'], controller: 'you'
      })).toBe(true);
    });

    it('empty types array means any type', () => {
      const land = perm({ type_line: 'Land' });
      expect(matchesSacFilter(land, 'you', { types: [], controller: 'you' })).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matchesSacFilter(perm({ type_line: 'CREATURE' }), 'you', {
        types: ['creature'], controller: 'you'
      })).toBe(true);
      expect(matchesSacFilter(perm(), 'you', {
        types: ['CREATURE'], controller: 'you'
      })).toBe(true);
    });
  });

  describe('controller scope', () => {
    it('controller=you accepts your permanent only', () => {
      const filter = { types: ['creature'], controller: 'you' };
      expect(matchesSacFilter(perm(), 'you', filter)).toBe(true);
      expect(matchesSacFilter(perm(), 'opponent', filter)).toBe(false);
    });

    it('controller=opponent accepts opponent permanent only', () => {
      const filter = { types: ['creature'], controller: 'opponent' };
      expect(matchesSacFilter(perm(), 'you', filter)).toBe(false);
      expect(matchesSacFilter(perm(), 'opponent', filter)).toBe(true);
    });

    it('controller=any accepts both', () => {
      const filter = { types: ['creature'], controller: 'any' };
      expect(matchesSacFilter(perm(), 'you', filter)).toBe(true);
      expect(matchesSacFilter(perm(), 'opponent', filter)).toBe(true);
    });
  });

  describe('excludeInstanceId (sacrifice another)', () => {
    it('excludes the matching instance', () => {
      expect(matchesSacFilter(perm({ instance_id: 'feeder' }), 'you', {
        types: ['creature'], controller: 'you', excludeInstanceId: 'feeder'
      })).toBe(false);
    });

    it('does not exclude a different instance with the same name', () => {
      expect(matchesSacFilter(perm({ instance_id: 'feeder-2' }), 'you', {
        types: ['creature'], controller: 'you', excludeInstanceId: 'feeder-1'
      })).toBe(true);
    });
  });

  describe('combined filters', () => {
    it('all conditions must pass', () => {
      const filter = {
        types: ['creature'],
        controller: 'you',
        excludeInstanceId: 'self',
      };
      expect(matchesSacFilter(perm({ instance_id: 'other' }), 'you', filter)).toBe(true);
      expect(matchesSacFilter(perm({ instance_id: 'self' }), 'you', filter)).toBe(false);
      expect(matchesSacFilter(perm({ instance_id: 'other' }), 'opponent', filter)).toBe(false);
      expect(matchesSacFilter(perm({ instance_id: 'other', type_line: 'Land' }), 'you', filter)).toBe(false);
    });
  });
});

describe('autoPickSacrifices', () => {
  const make = (overrides) => ({
    card_id: 1, instance_id: 'p', name: 'X', type_line: 'Creature',
    mana_cost: '', power: '0', toughness: '0', colors: [], is_token: false,
    ...overrides,
  });

  it('returns empty when count is 0', () => {
    expect(autoPickSacrifices([make()], 0)).toEqual([]);
  });

  it('returns empty when no candidates', () => {
    expect(autoPickSacrifices([], 1)).toEqual([]);
  });

  it('picks highest CMC first', () => {
    const small = make({ name: 'Small', mana_cost: '{1}' });
    const big = make({ name: 'Big', mana_cost: '{4}{R}{R}' });
    const mid = make({ name: 'Mid', mana_cost: '{2}{B}' });
    expect(autoPickSacrifices([small, big, mid], 1)[0].name).toBe('Big');
  });

  it('breaks CMC ties by toughness', () => {
    const fragile = make({ name: 'Fragile', mana_cost: '{2}', toughness: '1', power: '5' });
    const stout = make({ name: 'Stout', mana_cost: '{2}', toughness: '5', power: '1' });
    expect(autoPickSacrifices([fragile, stout], 1)[0].name).toBe('Stout');
  });

  it('breaks CMC+toughness ties by power', () => {
    const meek = make({ name: 'Meek', mana_cost: '{2}', toughness: '2', power: '1' });
    const beefy = make({ name: 'Beefy', mana_cost: '{2}', toughness: '2', power: '4' });
    expect(autoPickSacrifices([meek, beefy], 1)[0].name).toBe('Beefy');
  });

  it('returns N picks for count=N', () => {
    const cands = [
      make({ name: 'A', mana_cost: '{3}' }),
      make({ name: 'B', mana_cost: '{4}' }),
      make({ name: 'C', mana_cost: '{1}' }),
    ];
    const picked = autoPickSacrifices(cands, 2);
    expect(picked.map(c => c.name)).toEqual(['B', 'A']);
  });

  it('handles undefined power/toughness gracefully', () => {
    const noBody = make({ mana_cost: '{2}', power: undefined, toughness: undefined });
    const result = autoPickSacrifices([noBody], 1);
    expect(result.length).toBe(1);
  });
});
