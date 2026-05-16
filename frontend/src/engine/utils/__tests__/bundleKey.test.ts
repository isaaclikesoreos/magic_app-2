import { describe, it, expect } from 'vitest';
import { bundleKey, groupByBundleKey } from '../bundleKey';
import type { Permanent } from '@/types';

function thopter(overrides: Partial<Permanent> = {}): Permanent {
  return {
    card_id: 1001,
    instance_id: 'token-' + Math.random().toString(36).slice(2, 8),
    name: 'Thopter Token',
    mana_cost: '',
    type_line: 'Token Artifact Creature — Thopter',
    colors: [],
    power: '1',
    toughness: '1',
    is_token: true,
    keywords: ['flying'],
    tapped: false,
    summoning_sick: false,
    ...overrides,
  } as Permanent;
}

describe('bundleKey', () => {
  it('returns the same key for two identical permanents', () => {
    expect(bundleKey(thopter())).toBe(bundleKey(thopter()));
  });

  it('separates tapped vs untapped', () => {
    expect(bundleKey(thopter({ tapped: false })))
      .not.toBe(bundleKey(thopter({ tapped: true })));
  });

  it('separates by +1/+1 counters', () => {
    expect(bundleKey(thopter({ counters: {} })))
      .not.toBe(bundleKey(thopter({ counters: { '+1/+1': 1 } })));
  });

  it('treats undefined counters and empty-object counters as equal', () => {
    expect(bundleKey(thopter({ counters: undefined })))
      .toBe(bundleKey(thopter({ counters: {} })));
  });

  it('separates damaged vs undamaged', () => {
    expect(bundleKey(thopter({ damage: 0 })))
      .not.toBe(bundleKey(thopter({ damage: 1 })));
  });

  it('separates equipped vs unequipped', () => {
    expect(bundleKey(thopter()))
      .not.toBe(bundleKey(thopter({ equippedTo: { instance_id: 'sword-1' } })));
  });

  it('separates summoning-sick vs not', () => {
    expect(bundleKey(thopter({ summoning_sick: false })))
      .not.toBe(bundleKey(thopter({ summoning_sick: true })));
  });

  it('separates by card_id for non-tokens', () => {
    const realCard = (id: number): Permanent => ({
      ...thopter({ is_token: false, card_id: id }),
    } as Permanent);
    expect(bundleKey(realCard(1001))).not.toBe(bundleKey(realCard(1002)));
  });

  it('groups tokens with different generated card_ids but matching printed stats', () => {
    const t1 = thopter({ card_id: 'token-Thopter-111-0-0.5' as any });
    const t2 = thopter({ card_id: 'token-Thopter-222-1-0.7' as any });
    expect(bundleKey(t1)).toBe(bundleKey(t2));
  });

  it('separates tokens with same name but different printed stats', () => {
    const flying = thopter({ card_id: 'token-a' as any, keywords: ['flying'] });
    const noFlying = thopter({ card_id: 'token-b' as any, keywords: [] });
    expect(bundleKey(flying)).not.toBe(bundleKey(noFlying));
  });

  it('separates attacking from idle', () => {
    expect(bundleKey(thopter()))
      .not.toBe(bundleKey(thopter({ attacking: true })));
  });

  it('separates attack targets (player vs planeswalker)', () => {
    expect(bundleKey(thopter({ attacking: true })))
      .not.toBe(bundleKey(thopter({ attacking: true, attackTarget: 'pw-1' })));
  });
});

describe('groupByBundleKey', () => {
  it('groups identical permanents', () => {
    const bundles = groupByBundleKey([thopter(), thopter(), thopter()]);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].permanents).toHaveLength(3);
  });

  it('splits divergent state into separate bundles', () => {
    const bundles = groupByBundleKey([
      thopter(),
      thopter(),
      thopter({ tapped: true }),
    ]);
    expect(bundles).toHaveLength(2);
    expect(bundles[0].permanents).toHaveLength(2);
    expect(bundles[1].permanents).toHaveLength(1);
  });

  it('preserves insertion order so the oldest permanent is index 0', () => {
    const a = thopter({ instance_id: 'a' });
    const b = thopter({ instance_id: 'b' });
    const c = thopter({ instance_id: 'c' });
    const bundles = groupByBundleKey([a, b, c]);
    expect(bundles[0].permanents.map(p => p.instance_id)).toEqual(['a', 'b', 'c']);
  });
});
