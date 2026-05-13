import { describe, it, expect } from 'vitest';
import { detectETBTriggers, detectTokenETBTriggers } from '../etb';
import { makeGameState, createCreature } from '../../__tests__/fixtures';

describe('detectETBTriggers', () => {
  it('fires creature own ETB trigger', () => {
    const creature = createCreature({
      name: 'Mulldrifter',
      triggered_abilities: [
        { trigger: 'enters_the_battlefield', effect: { type: 'draw_cards', amount: 2 } }
      ]
    });
    const state = makeGameState({ battlefield: [creature] });
    const triggers = detectETBTriggers({ creature }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('draw_cards');
  });

  it('fires other permanents creature_enters_battlefield triggers', () => {
    const soulWarden = createCreature({
      name: 'Soul Warden',
      triggered_abilities: [
        { trigger: 'creature_enters_battlefield', effect: { type: 'gain_life', amount: 1 } }
      ]
    });
    const entering = createCreature({ name: 'Grizzly Bears' });
    const state = makeGameState({ battlefield: [soulWarden, entering] });
    const triggers = detectETBTriggers({ creature: entering }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].effect.type).toBe('gain_life');
    expect(triggers[0].source.name).toBe('Soul Warden');
  });

  it('excludeSelf prevents self-trigger', () => {
    const creature = createCreature({
      name: 'Soul Warden',
      triggered_abilities: [
        { trigger: 'creature_enters_battlefield', excludeSelf: true, effect: { type: 'gain_life', amount: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [creature] });
    // Soul Warden entering should not trigger its own "another creature enters" ability
    const triggers = detectETBTriggers({ creature }, state);

    // Only the creature_enters_battlefield check matters - creature's own ETB abilities aren't "creature_enters_battlefield"
    // The creature has no enters_the_battlefield trigger, only creature_enters_battlefield
    // The creature_enters_battlefield check skips self (permanent.card_id !== creature.card_id)
    expect(triggers.length).toBe(0);
  });

  it('returns no triggers when no abilities match', () => {
    const creature = createCreature({ name: 'Vanilla Bear' });
    const state = makeGameState({ battlefield: [creature] });
    const triggers = detectETBTriggers({ creature }, state);

    expect(triggers.length).toBe(0);
  });

  it('adds evoke sacrifice trigger when wasEvoked is true', () => {
    const creature = createCreature({
      name: 'Mulldrifter',
      triggered_abilities: [
        { trigger: 'enters_the_battlefield', effect: { type: 'draw_cards', amount: 2 } }
      ]
    });
    const state = makeGameState({ battlefield: [creature] });
    const triggers = detectETBTriggers({ creature, wasEvoked: true }, state);

    // Reversed: sacrifice is first in array (resolves first = bottom of stack)
    // ETB is second (resolves after = top of stack)
    // Wait - reversed means ETB resolves BEFORE sacrifice
    expect(triggers.length).toBe(2);
    const types = triggers.map(t => t.effect.type);
    expect(types).toContain('draw_cards');
    expect(types).toContain('sacrifice_self');
  });
});

describe('detectTokenETBTriggers', () => {
  it('fires creature_enters_battlefield for each token', () => {
    const soulWarden = createCreature({
      name: 'Soul Warden',
      triggered_abilities: [
        { trigger: 'creature_enters_battlefield', effect: { type: 'gain_life', amount: 1 } }
      ]
    });
    const state = makeGameState({ battlefield: [soulWarden] });
    const triggers = detectTokenETBTriggers({ token: { name: 'Beast' }, tokenCount: 3 }, state);

    expect(triggers.length).toBe(3);
    triggers.forEach(t => expect(t.effect.type).toBe('gain_life'));
  });
});

describe('creature_type_filter (Champion of the Parish)', () => {
  const champion = () => createCreature({
    instance_id: 'i-champ',
    name: 'Champion of the Parish',
    type_line: 'Creature — Human Soldier',
    owner: 'you',
    triggered_abilities: [{
      type: 'triggered',
      trigger: {
        event: 'creature_enters_battlefield',
        source: 'other',
        condition: { type: 'creature_type_filter', subtypes: ['Human'], controller: 'you' },
      },
      effect: { type: 'add_counter_to_self', counter_type: '+1/+1', amount: 1 },
    }],
  });

  it('fires when a Human you control enters', () => {
    const champ = champion();
    const human = createCreature({ instance_id: 'i-h', name: 'Doomed Traveler', type_line: 'Creature — Human Soldier', owner: 'you' });
    const state = makeGameState({ battlefield: [champ, human] });
    const triggers = detectETBTriggers({ creature: human }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Champion of the Parish');
    expect(triggers[0].effect.type).toBe('add_counter_to_self');
  });

  it('does not fire when a non-Human you control enters', () => {
    const champ = champion();
    const goblin = createCreature({ instance_id: 'i-g', name: 'Goblin Guide', type_line: 'Creature — Goblin Scout', owner: 'you' });
    const state = makeGameState({ battlefield: [champ, goblin] });
    const triggers = detectETBTriggers({ creature: goblin }, state);

    expect(triggers.length).toBe(0);
  });

  it("does not fire when an opponent's Human enters", () => {
    const champ = champion();
    const oppHuman = createCreature({ instance_id: 'i-oh', name: 'Thalia', type_line: 'Legendary Creature — Human Soldier', owner: 'opponent' });
    const state = makeGameState({ battlefield: [champ] }, { battlefield: [oppHuman] });
    const triggers = detectETBTriggers({ creature: oppHuman }, state);

    expect(triggers.length).toBe(0);
  });

  it('does not self-trigger when Champion enters (source: other)', () => {
    const champ = champion();
    const state = makeGameState({ battlefield: [champ] });
    const triggers = detectETBTriggers({ creature: champ }, state);

    expect(triggers.length).toBe(0);
  });

  it('controller=any fires for both sides', () => {
    const lord = createCreature({
      instance_id: 'i-lord',
      name: 'Tribal Lord',
      type_line: 'Creature — Elf',
      owner: 'you',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'creature_enters_battlefield',
          source: 'other',
          condition: { type: 'creature_type_filter', subtypes: ['Elf'], controller: 'any' },
        },
        effect: { type: 'gain_life', amount: 1 },
      }],
    });
    const oppElf = createCreature({ instance_id: 'i-oe', name: 'Llanowar Elf', type_line: 'Creature — Elf Druid', owner: 'opponent' });
    const state = makeGameState({ battlefield: [lord] }, { battlefield: [oppElf] });
    const triggers = detectETBTriggers({ creature: oppElf }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Tribal Lord');
  });

  it('matches multi-subtype filter (any-of)', () => {
    const tribal = createCreature({
      instance_id: 'i-trib',
      name: 'Multi Tribal',
      type_line: 'Creature — Human',
      owner: 'you',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'creature_enters_battlefield',
          source: 'other',
          condition: { type: 'creature_type_filter', subtypes: ['Goblin', 'Dwarf'], controller: 'you' },
        },
        effect: { type: 'gain_life', amount: 1 },
      }],
    });
    const dwarf = createCreature({ instance_id: 'i-d', name: 'Dwarven Miner', type_line: 'Creature — Dwarf', owner: 'you' });
    const state = makeGameState({ battlefield: [tribal, dwarf] });
    const triggers = detectETBTriggers({ creature: dwarf }, state);

    expect(triggers.length).toBe(1);
  });

  it('Thornbite Staff: Shaman ETB triggers attach with creature in triggerContext', () => {
    const staff = {
      instance_id: 'i-staff',
      card_id: 'thorn',
      name: 'Thornbite Staff',
      type_line: 'Kindred Artifact — Shaman Equipment',
      owner: 'you',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'creature_enters_battlefield',
          condition: { type: 'creature_type_filter', subtypes: ['Shaman'], controller: 'any' },
        },
        effect: { type: 'attach_self_to_triggering_creature' },
        optional: true,
      }],
    };
    const shaman = createCreature({
      instance_id: 'i-shaman', name: 'Mogg Fanatic',
      type_line: 'Creature — Goblin Shaman', owner: 'you',
    });
    const state = makeGameState({ battlefield: [staff, shaman] });
    const triggers = detectETBTriggers({ creature: shaman }, state);

    expect(triggers.length).toBe(1);
    expect(triggers[0].source.name).toBe('Thornbite Staff');
    expect(triggers[0].effect.type).toBe('attach_self_to_triggering_creature');
    expect(triggers[0].triggerContext.triggeringCreature.instance_id).toBe('i-shaman');
    expect(triggers[0].optional).toBe(true);
  });

  it('Thornbite Staff: non-Shaman ETB does NOT trigger', () => {
    const staff = {
      instance_id: 'i-staff', card_id: 'thorn', name: 'Thornbite Staff',
      type_line: 'Kindred Artifact — Shaman Equipment', owner: 'you',
      triggered_abilities: [{
        type: 'triggered',
        trigger: {
          event: 'creature_enters_battlefield',
          condition: { type: 'creature_type_filter', subtypes: ['Shaman'], controller: 'any' },
        },
        effect: { type: 'attach_self_to_triggering_creature' },
        optional: true,
      }],
    };
    const bear = createCreature({ instance_id: 'i-bear', name: 'Grizzly Bear', type_line: 'Creature — Bear', owner: 'you' });
    const state = makeGameState({ battlefield: [staff, bear] });
    const triggers = detectETBTriggers({ creature: bear }, state);

    expect(triggers.length).toBe(0);
  });

  it('preserves Soul Warden behavior (no condition = fires for any creature)', () => {
    const warden = createCreature({
      instance_id: 'i-warden',
      name: 'Soul Warden',
      type_line: 'Creature — Human Cleric',
      owner: 'you',
      triggered_abilities: [{
        trigger: { event: 'creature_enters_battlefield', source: 'other' },
        effect: { type: 'gain_life', amount: 1 },
      }],
    });
    const oppGoblin = createCreature({ instance_id: 'i-og', name: 'Goblin', type_line: 'Creature — Goblin', owner: 'opponent' });
    const state = makeGameState({ battlefield: [warden] }, { battlefield: [oppGoblin] });
    const triggers = detectETBTriggers({ creature: oppGoblin }, state);

    expect(triggers.length).toBe(1);
  });
});
