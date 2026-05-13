import { describe, it, expect } from 'vitest';
import { detectLifeGainTriggers } from '../lifegain';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectLifeGainTriggers', () => {
  it('detects life_gained trigger on your battlefield', () => {
    const pridemate = createCreature({
      name: "Ajani's Pridemate",
      triggered_abilities: [
        { trigger: 'life_gained', effect: { type: 'add_counter_to_self', counterType: '+1/+1', amount: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [pridemate] });
    const triggers = detectLifeGainTriggers({ player: 'you', amount: 1 }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('add_counter_to_self');
    expect(triggers[0].source.name).toBe("Ajani's Pridemate");
  });

  it('returns no triggers when no matching abilities', () => {
    const bear = createCreature({ name: 'Grizzly Bears' });
    const state = makeGameState({ battlefield: [bear] });
    const triggers = detectLifeGainTriggers({ player: 'you', amount: 3 }, state);

    expect(triggers.length).toBe(0);
  });

  it('returns empty array for empty battlefield', () => {
    const state = makeGameState();
    const triggers = detectLifeGainTriggers({ player: 'you', amount: 1 }, state);

    expect(triggers.length).toBe(0);
  });
});
