import { describe, it, expect } from 'vitest';
import { getNoncreatureCostTax } from '../costModifier';
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

const lightningBolt = (): Card => ({
  card_id: 1, name: 'Lightning Bolt',
  type_line: 'Instant', mana_cost: '{R}',
  colors: ['R'], is_token: false, instance_id: 'lb-1',
} as Card);

const grizzlyBears = (): Card => ({
  card_id: 2, name: 'Grizzly Bears',
  type_line: 'Creature — Bear', mana_cost: '{1}{G}',
  colors: ['G'], power: '2', toughness: '2', is_token: false, instance_id: 'gb-1',
} as Card);

const thalia = (id: string): Permanent => ({
  card_id: 99, name: 'Thalia, Guardian of Thraben',
  instance_id: id,
  type_line: 'Legendary Creature — Human Soldier',
  mana_cost: '{1}{W}', colors: ['W'], is_token: false,
  power: '2', toughness: '1',
  static_abilities: [{
    type: 'static',
    effect: { type: 'noncreature_spell_cost_more', amount: 1 },
  } as any],
} as Permanent);

describe('getNoncreatureCostTax', () => {
  it('returns 0 with no Thalia on opp battlefield', () => {
    expect(getNoncreatureCostTax(lightningBolt(), state())).toBe(0);
  });

  it('returns 1 with one Thalia opp BF on a noncreature spell', () => {
    const s = state({}, { battlefield: [thalia('t1')] });
    expect(getNoncreatureCostTax(lightningBolt(), s)).toBe(1);
  });

  it('stacks: 4 Thalias → tax 4 on a noncreature spell', () => {
    const s = state({}, { battlefield: [thalia('t1'), thalia('t2'), thalia('t3'), thalia('t4')] });
    expect(getNoncreatureCostTax(lightningBolt(), s)).toBe(4);
  });

  it('returns 0 for creature spells regardless of Thalia count', () => {
    const s = state({}, { battlefield: [thalia('t1'), thalia('t2')] });
    expect(getNoncreatureCostTax(grizzlyBears(), s)).toBe(0);
  });

  it('honors the amount field on the static (e.g. amount: 2)', () => {
    const t2 = thalia('t1');
    (t2 as any).static_abilities[0].effect.amount = 2;
    const s = state({}, { battlefield: [t2] });
    expect(getNoncreatureCostTax(lightningBolt(), s)).toBe(2);
  });
});
