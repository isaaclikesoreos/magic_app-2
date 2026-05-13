import { describe, it, expect } from 'vitest';
import { detectLandGraveyardTriggers } from '../zones';
import { makeGameState, createCreature, createLand } from '../../__tests__/fixtures';

describe('detectLandGraveyardTriggers', () => {
  it('fires land_enters_graveyard triggers (Dingus Egg)', () => {
    const dingusEgg = createCreature({
      name: 'Dingus Egg',
      type_line: 'Artifact',
      triggered_abilities: [
        { trigger: 'land_enters_graveyard', effect: { type: 'deal_damage_to_controller', amount: 2 } }
      ]
    });
    const land = createLand({ name: 'Wasteland' });
    const state = makeGameState({ battlefield: [dingusEgg] });
    const triggers = detectLandGraveyardTriggers({ land, owner: 'opponent' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('deal_damage_to_controller');
    expect(triggers[0].effect.owner).toBe('opponent');
  });

  it('checks both players battlefields', () => {
    const dingusEgg = createCreature({
      name: 'Dingus Egg',
      type_line: 'Artifact',
      triggered_abilities: [
        { trigger: 'land_enters_graveyard', effect: { type: 'deal_damage_to_controller', amount: 2 } }
      ]
    });
    const land = createLand({ name: 'Forest' });
    const state = makeGameState(
      { battlefield: [] },
      { battlefield: [dingusEgg] }
    );
    const triggers = detectLandGraveyardTriggers({ land, owner: 'you' }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.owner).toBe('opponent');
  });

  it('returns empty when no matching abilities', () => {
    const bear = createCreature({ name: 'Bear' });
    const land = createLand({ name: 'Forest' });
    const state = makeGameState({ battlefield: [bear] });
    const triggers = detectLandGraveyardTriggers({ land, owner: 'you' }, state);

    expect(triggers.length).toBe(0);
  });
});
