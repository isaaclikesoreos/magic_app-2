import { describe, it, expect } from 'vitest';
import { creatureMatchesTypeFilter } from '../typeMatching';
import type { Card, GameState, Permanent } from '@/types';

const player = (overrides: any = {}) => ({
  life: 20, mana_pool: {}, library_count: 0, library: [], hand: [],
  battlefield: [], graveyard: [], exile: [],
  ...overrides,
});

const state = (you: any = {}, opp: any = {}): GameState => ({
  players: { you: player(you), opponent: player(opp) },
  turn_phase: 'main1', active_player: 'you',
} as GameState);

const goblin = (overrides: Partial<Card> = {}): Card => ({
  card_id: 1, name: 'A Goblin',
  type_line: 'Creature — Goblin',
  mana_cost: '{R}', power: '1', toughness: '1',
  colors: ['R'], is_token: false, instance_id: 'g-1',
  ...overrides,
} as Card);

const human = (overrides: Partial<Card> = {}): Card => ({
  card_id: 2, name: 'A Human',
  type_line: 'Creature — Human',
  mana_cost: '{1}{W}', power: '2', toughness: '1',
  colors: ['W'], is_token: false, instance_id: 'h-1',
  ...overrides,
} as Card);

const maskwood = (): Permanent => ({
  card_id: 99, name: 'Maskwood Nexus',
  instance_id: 'mw-1',
  type_line: 'Artifact',
  mana_cost: '{4}', colors: [], is_token: false,
  static_abilities: [{
    type: 'static',
    effect: { type: 'every_creature_type' },
  } as any],
} as Permanent);

describe('creatureMatchesTypeFilter', () => {
  it('direct type_line substring matches', () => {
    expect(creatureMatchesTypeFilter(goblin(), ['goblin'], 'you', state())).toBe(true);
  });

  it('returns true for empty filter (no restriction)', () => {
    expect(creatureMatchesTypeFilter(goblin(), [], 'you', state())).toBe(true);
    expect(creatureMatchesTypeFilter(goblin(), undefined, 'you', state())).toBe(true);
  });

  it('returns false when type_line does not include any filter type', () => {
    expect(creatureMatchesTypeFilter(human(), ['goblin'], 'you', state())).toBe(false);
  });

  it('changeling matches every creature type', () => {
    const token = { ...human(), keywords: ['changeling'] } as Card;
    expect(creatureMatchesTypeFilter(token, ['goblin'], 'you', state())).toBe(true);
    expect(creatureMatchesTypeFilter(token, ['elf'], 'you', state())).toBe(true);
  });

  it('Maskwood Nexus extends matching to every creature controlled', () => {
    const s = state({ battlefield: [maskwood()] });
    expect(creatureMatchesTypeFilter(human(), ['goblin'], 'you', s)).toBe(true);
  });

  it('Maskwood does NOT help non-creature cards', () => {
    const s = state({ battlefield: [maskwood()] });
    const lightning = { ...goblin(), type_line: 'Instant' } as Card;
    expect(creatureMatchesTypeFilter(lightning, ['goblin'], 'you', s)).toBe(false);
  });

  it('Maskwood on opp battlefield does NOT help your filter', () => {
    const s = state({}, { battlefield: [maskwood()] });
    expect(creatureMatchesTypeFilter(human(), ['goblin'], 'you', s)).toBe(false);
  });

  it('falls back to literal match when gameState omitted', () => {
    expect(creatureMatchesTypeFilter(goblin(), ['goblin'], 'you', undefined as any)).toBe(true);
    expect(creatureMatchesTypeFilter(human(), ['goblin'], 'you', undefined as any)).toBe(false);
  });
});
