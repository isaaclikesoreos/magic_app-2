/**
 * Ability Types
 * Based on ABILITY_SCHEMA.md
 */

// Trigger Events
export type TriggerEvent =
  | 'enters_battlefield'
  | 'etb'
  | 'leaves_battlefield'
  | 'dies'
  | 'creature_enters_battlefield'
  | 'creature_died'
  | 'another_creature_dies'
  | 'life_gained'
  | 'on_attack'
  | 'on_block'
  | 'deals_combat_damage'
  | 'attacks_or_blocks'
  | 'noncreature_spell_cast'
  | 'spell_cast'
  | 'spell_cast_cmc'
  | 'second_spell_this_turn'
  | 'creature_sacrificed'
  | 'sacrifice_creature'
  | 'permanent_sacrificed'
  | 'land_to_graveyard'
  | 'permanent_left'
  | 'permanent_leaves_battlefield'
  | 'upkeep'
  | 'end_step'
  | 'beginning_of_combat'
  | 'token_entered'
  | 'card_drawn'
  | 'draw_step';

// Effect Types
export type EffectType =
  | 'damage'
  | 'damage_divided'
  | 'deal_damage'
  | 'deal_damage_divided'
  | 'damage_per_nonbasic_lands'
  | 'deal_damage_to_controller'
  | 'damage_to_caster'
  | 'gain_life'
  | 'gain_life_equal_toughness'
  | 'drain_life'
  | 'gain_life_and_scry'
  | 'opponent_loses_life'
  | 'draw_cards'
  | 'each_player_draws'
  | 'scry'
  | 'buff_until_eot'
  | 'buff_creature'
  | 'buff_self'
  | 'prowess_trigger'
  | 'grant_keyword_until_eot'
  | 'grant_keyword'
  | 'grant_keywords_equipped'
  | 'add_counter'
  | 'add_counter_to_self'
  | 'add_counter_to_source'
  | 'add_counter_to_each_creature'
  | 'remove_counter'
  | 'add_mana'
  | 'add_mana_any_color'
  | 'channel_activate'
  | 'enter_battlefield'
  | 'enter_battlefield_permanent'
  | 'create_token'
  | 'destroy'
  | 'target_player_sacrifice'
  | 'target_player_loses_life'
  | 'sacrifice'
  | 'sacrifice_self'
  | 'return_to_hand'
  | 'destroy_land'
  | 'wildfire'
  | 'attach_role'
  | 'create_role'
  | 'modal_choice'
  | 'copy_spell'
  | 'draw_then_discard'
  | 'counter_spell'
  | 'counter_return_to_hand'
  | 'counter_unless_pay'
  | 'exile_all_graveyards'
  | 'reanimate_creature'
  | 'attach_aura'
  | 'buff_enchanted'
  | 'yawgmoths_will'
  | 'sacrifice_attached'
  | 'put_into_library'
  | 'coin_flip_damage'
  | 'pay_to_untap_self'
  | 'untap_self'
  | 'doesnt_untap'
  | 'targeted_discard'
  | 'random_discard'
  | 'player_choice_discard'
  | 'grant_flashback'
  | 'cast_from_graveyard_free'
  | 'library_multi_tutor_top'
  | 'create_token_copy'
  | 'look_at_top_of_library'
  | 'cast_from_top_of_library'
  | 'grant_activated_from_top_library'
  | 'exile_self_from_graveyard'
  | 'animate_artifact_as_creature'
  | 'wish_from_sideboard'
  | 'every_creature_type'
  | 'noncreature_spell_cost_more'
  | 'return_from_graveyard_to_hand'
  | 'modal_spell'
  | 'tutor'
  | 'equip'
  | 'destroy_all'
  | 'flicker'
  | 'exile_until_end_step'
  | 'surveil'
  | 'damage_and_self_damage'
  | 'endure'
  | 'mill'
  | 'ward_discard'
  | 'exile_until_leaves'
  | 'exile_under'
  | 'return_exiled_under'
  | 'impulse_draw'
  | 'exile_target_creature'
  | 'damage_all'
  | 'extort'
  | 'opus'
  | 'madness_trigger'
  | 'miracle_cast'
  | 'ninjutsu_enter'
  | 'grant_triggered_equipped'
  | 'grant_activated_equipped'
  | 'attach_self_to_triggering_creature'
  | 'limit_opponent_draws'
  | 'look_take_filtered_bottom';

// Condition Types
export interface Condition {
  type: string;
  [key: string]: any;  // Allow condition-specific fields
}

// Effect Definition
export interface Effect {
  type: EffectType;
  amount?: number;
  target?: string;
  valid_targets?: string[];
  counter_type?: string;
  counterType?: string;  // Legacy camelCase support
  [key: string]: any;  // Allow effect-specific fields
}

// Trigger Definition
export interface Trigger {
  event: TriggerEvent;
  source?: 'self' | 'other' | 'any' | 'controller' | 'opponent';
  condition?: Condition;
  // Zone the source of this trigger must reside in for the trigger to fire.
  // Default 'battlefield'. Use 'graveyard' for Bridge from Below-style triggers
  // that fire while the source is in the graveyard.
  self_zone?: 'battlefield' | 'graveyard';
}

// Triggered Ability
export interface TriggeredAbility {
  type?: 'triggered';
  trigger: Trigger | string;  // String for legacy format
  effect: Effect;
  requires_input?: boolean;
  optional?: boolean;
  condition?: Condition;
  excludeSelf?: boolean;  // For "other creatures" triggers
}

// Mana Cost
export interface ManaCost {
  generic?: number;
  colored?: {
    W?: number;
    U?: number;
    B?: number;
    R?: number;
    G?: number;
    C?: number;
  };
  X?: number;
  hybrid?: Array<{
    colors: string[];
    count: number;
  }>;
}

// Sacrifice Cost
export interface SacrificeCost {
  type: string;
  count: number;
  self?: boolean;
  condition?: Condition;
}

// Discard Cost
export interface DiscardCost {
  count: number;
  condition?: Condition;
}

// Activated Ability Cost
export interface Cost {
  mana?: ManaCost;
  tap?: boolean;
  untap?: boolean;
  sacrifice?: SacrificeCost;
  discard?: DiscardCost;
  pay_life?: number;
  remove_counters?: Record<string, number>;
  [key: string]: any;  // Allow other cost types
}

// Activated Ability
export interface ActivatedAbility {
  type?: 'activated';
  cost: Cost | string;  // String for legacy mana cost format
  effect: Effect;
  timing?: 'instant' | 'sorcery' | 'any';
  requires_target?: boolean;
  usable_while_tapped?: boolean;
  description?: string;
  requires_sacrifice?: boolean;
  requires_sacrifice_self?: boolean;
  condition?: { type: string; value: number };
}

// Static Ability
export interface StaticAbility {
  type?: 'static';
  effect: Effect;
  condition?: Condition;
  duration?: 'permanent' | 'until_end_of_turn' | 'while_on_battlefield';
  layer?: number;
}
