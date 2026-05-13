import { describe, it, expect } from 'vitest';
import { createTriggerStackItem } from '../helpers';

describe('createTriggerStackItem', () => {
  it('creates a well-formed stack item with correct fields', () => {
    const source = { card_id: 'card-1', name: 'Soul Warden' };
    const ability = { effect: { type: 'gain_life', amount: 1 } };
    const item = createTriggerStackItem('etb', source, ability, 'you');

    expect(item.id).toContain('etb-card-1');
    expect(item.type).toBe('triggered_ability');
    expect(item.source.card_id).toBe('card-1');
    expect(item.source.name).toBe('Soul Warden');
    expect(item.source.owner).toBe('you');
    expect(item.effect).toEqual({ type: 'gain_life', amount: 1 });
    expect(item.resolved).toBe(false);
    expect(item.targeting_data).toBeNull();
  });

  it('applies overrides', () => {
    const source = { card_id: 'card-2', name: 'Titan' };
    const ability = { effect: { type: 'damage_divided', totalDamage: 3 } };
    const item = createTriggerStackItem('attack', source, ability, 'you', {
      requires_input: true,
    });

    expect(item.requires_input).toBe(true);
  });

  it('sets requires_input for damage_divided effect', () => {
    const source = { card_id: 'card-3', name: 'Inferno Titan' };
    const ability = { effect: { type: 'damage_divided', totalDamage: 3 } };
    const item = createTriggerStackItem('attack', source, ability, 'you');

    expect(item.requires_input).toBe(true);
  });

  it('defaults requires_input to false for non-damage_divided effects', () => {
    const source = { card_id: 'card-4', name: 'Soul Warden' };
    const ability = { effect: { type: 'gain_life', amount: 1 } };
    const item = createTriggerStackItem('etb', source, ability, 'you');

    expect(item.requires_input).toBe(false);
  });
});
