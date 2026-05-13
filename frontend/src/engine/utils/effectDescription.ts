import { Effect } from '@/types';

/**
 * Get a human-readable description of an effect.
 * Used by StackDisplay and TriggerOrderSelector.
 */
export const getEffectDescription = (effect: Effect | null): string => {
  if (!effect) {
    return 'Unknown effect';
  }

  switch (effect.type) {
    case 'damage':
    case 'deal_damage':
      if ((effect as any).target === 'each_opponent') return `Each opponent loses ${effect.amount} life`;
      return `Deal ${effect.amount} damage`;
    case 'damage_divided':
    case 'deal_damage_divided':
      return `Deal ${effect.amount} damage divided as you choose among any number of targets`;
    case 'prowess_trigger':
      return '+1/+1 until end of turn';
    case 'draw_cards':
      return `Draw ${effect.amount} card${effect.amount !== 1 ? 's' : ''}`;
    case 'add_mana': {
      const manaStr = Object.entries((effect as any).mana || {}).map(([c, n]) => `${n}${c}`).join('');
      return `Add ${manaStr}`;
    }
    case 'drain_life':
      return `Drain ${effect.amount} life`;
    case 'enter_battlefield':
      return `Enter the battlefield`;
    case 'enter_battlefield_permanent':
      return `Enter the battlefield`;
    case 'sacrifice_self':
      return `Sacrifice (evoke)`;
    case 'damage_all':
      return `Deal ${effect.amount || 'X'} damage to each player and each other creature`;
    case 'each_player_draws':
      return `Each player draws ${effect.amount || 1} card`;
    case 'create_token':
      return `Create ${(effect as any).count || 1} ${(effect as any).token?.power || '1'}/${(effect as any).token?.toughness || '1'} ${(effect as any).token?.name || 'token'}`;
    case 'opponent_loses_life':
      return `Opponent loses ${effect.amount || 1} life${(effect as any).youGain ? ', you gain ' + effect.amount + ' life' : ''}`;
    case 'destroy_land':
      return 'Destroy target nonbasic land';
    case 'damage_per_nonbasic_lands':
      return `Deal damage equal to ${(effect as any).multiplier || 2}× nonbasic lands`;
    case 'wildfire':
      return `Each player sacrifices ${(effect as any).landSacrificeCount || 4} lands. Deal ${(effect as any).creatureDamage || 4} damage to each creature.`;
    case 'add_counter_to_source':
      return `Put a ${effect.counterType || '+1/+1'} counter on this`;
    case 'deal_damage_to_controller':
      return `Deal ${effect.amount || 2} damage to land's controller`;
    case 'damage_to_caster':
      return `Deal ${effect.amount || 2} damage to spell's caster`;
    case 'buff_creature': {
      let desc = `Target creature gets +${(effect as any).power || 0}/+${(effect as any).toughness || 0} until end of turn`;
      if ((effect as any).role) {
        desc += `. Create ${(effect as any).role} Role token`;
      }
      return desc;
    }
    case 'gain_life':
      return `You gain ${effect.amount || 1} life`;
    case 'add_counter_to_self':
      return `Put ${effect.amount || 1} ${effect.counterType || '+1/+1'} counter(s) on this`;
    case 'copy_spell':
      return 'Copy target instant or sorcery spell';
    case 'draw_then_discard':
      return `Draw ${effect.amount || 1}, then discard ${effect.amount || 1}`;
    case 'counter_spell':
      return 'Counter target spell';
    case 'counter_return_to_hand':
      return 'Counter target spell, return it to owner\'s hand. Draw a card.';
    case 'counter_unless_pay':
      return `Counter target spell unless its controller pays ${(effect as any).payCost || '{3}'}`;
    case 'ward_discard':
      return `Counter target spell unless its controller discards ${(effect as any).discardCount || 1} card(s)`;
    case 'add_mana_any_color':
      return effect.amount && effect.amount > 1
        ? `Add ${effect.amount} mana of any one color`
        : 'Add one mana of any color';
    case 'grant_flashback':
      return 'Target instant or sorcery in graveyard gains flashback';
    case 'modal_spell': {
      const modes = (effect as any).modes as Array<{ description: string }>;
      if (modes && modes.length > 0) {
        return modes.map(m => m.description).join('; ');
      }
      return 'Modal spell';
    }
    case 'return_from_graveyard_to_hand':
      return 'Return target creature from graveyard to hand';
    case 'tutor': {
      const dest = (effect as any).destination || 'hand';
      const destStr = dest === 'hand' ? 'hand' : dest === 'top_of_library' ? 'top of library' : 'graveyard';
      return `Search library, put a card into ${destStr}`;
    }
    case 'equip':
      return 'Equip to target creature you control';
    case 'destroy_all': {
      const filters = (effect as any).filter || ['creature'];
      return `Destroy all ${filters.join('s and ')}s`;
    }
    case 'flicker':
      return 'Exile target permanent, then return it to the battlefield';
    case 'exile_until_end_step':
      return 'Exile target permanent. Returns at beginning of next end step';
    case 'exile_until_leaves':
      return 'Exile target nonland permanent until this leaves the battlefield';
    case 'exile_under':
      return 'Exile another target nonland permanent';
    case 'return_exiled_under':
      return 'Return the exiled card to the battlefield under its owner\'s control';
    case 'scry':
      return `Scry ${effect.amount || 1}${(effect as any).then_draw ? `, then draw ${(effect as any).then_draw}` : ''}`;
    case 'surveil':
      return `Surveil ${effect.amount || 1}${(effect as any).then_draw ? `, then draw ${(effect as any).then_draw}` : ''}`;
    case 'endure': {
      const val = (effect as any).value || 1;
      return `May pay to endure ${val}`;
    }
    case 'mill':
      return `Mill ${effect.amount || 1} card${(effect.amount || 1) !== 1 ? 's' : ''}`;
    case 'impulse_draw':
      return `Exile top ${effect.amount || 2} cards of your library. You may play them`;
    case 'exile_target_creature':
      return 'Exile target creature' + ((effect as any).controllerGainsLife ? '. Its controller gains life equal to its power' : '');
    case 'extort':
      return 'You may pay {W/B}. Opponent loses 1 life, you gain 1 life';
    case 'opus': {
      const ms = (effect as any).manaSpent ?? 0;
      return `Draw a card${ms >= 5 ? '' : ', then discard a card'}`;
    }
    case 'madness_trigger': {
      const cost = (effect as any).manaCost;
      return cost
        ? `Cast for madness ${cost} or put into graveyard`
        : 'Cast for madness cost or put into graveyard';
    }
    case 'miracle_cast': {
      const cost = (effect as any).manaCost;
      return cost
        ? `You may cast for miracle ${cost}`
        : 'You may cast for miracle cost';
    }
    case 'ninjutsu_enter': {
      const name = (effect as any).card?.name || 'creature';
      return `Put ${name} onto the battlefield tapped and attacking`;
    }
    default:
      return 'Unknown effect';
  }
};
