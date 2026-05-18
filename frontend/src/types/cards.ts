/**
 * Card and Permanent Types
 * Based on the card data structure from the Cards app
 */

import { TriggeredAbility, ActivatedAbility, StaticAbility, Effect } from './abilities';

export interface Role {
  type: 'Monster' | 'Royal' | 'Sorcerer' | 'Cursed' | 'Wicked' | 'Young Hero';
  id: string;
  power?: number;
  toughness?: number;
  keywords?: string[];
}

export interface Card {
  // Database fields
  card_id: number;
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors: string[];
  image_url?: string;
  images?: { image_url: string; image_type?: string; is_primary?: boolean }[];
  is_token: boolean;
  isBasic?: boolean;  // For basic lands
  isLand?: boolean;   // For land permanents

  // Instance identity (for cards in game)
  instance_id: string;

  // Runtime state (when on battlefield)
  tapped?: boolean;
  summoning_sick?: boolean;
  counters?: Record<string, number>;
  attacking?: boolean;
  attackTarget?: string;  // Empty/undefined = opponent (player). Otherwise = planeswalker instance_id.
  blocking?: boolean;
  buffPower?: number;
  buffToughness?: number;
  prowessBonus?: number;
  attachedRoles?: Role[];
  equippedTo?: { instance_id: string; name?: string };  // Set on equipment when attached to a creature
  isAura?: boolean;
  attachedTo?: { instance_id: string; name?: string };  // Set on auras when attached
  damage?: number;  // Damage marked on creature (cleared at end of turn)
  damaged_by_deathtouch?: boolean;  // Flag for SBA: any deathtouch damage kills next SBA
  loyalty?: number;  // Planeswalker loyalty (also read from card_data.loyalty at cast)
  _loyaltyActivatedThisTurn?: boolean;  // PW once-per-turn gate
  protection?: string[];  // Array of protection colors/types (e.g., ['R', 'W'])
  protection_until_end_of_turn?: boolean;  // Flag to clear at end of turn
  _grantedKeywordsEOT?: string[];  // Keywords granted by an effect, cleared EOT
  cardOwner?: 'you' | 'opponent';  // Original owner (for zone routing)

  // Abilities (can be nested or flat)
  keywords?: string[];
  triggered_abilities?: TriggeredAbility[];
  activated_abilities?: ActivatedAbility[];
  static_abilities?: StaticAbility[];
  spell_effect?: Effect;

  // Legacy format support
  hasHaste?: boolean;
  hasProwess?: boolean;
  hasFlying?: boolean;
  hasTrample?: boolean;
  hasVigilance?: boolean;
  hasStorm?: boolean;
}

// Permanent is just a card on the battlefield
export type Permanent = Card;

export interface Token {
  id: number;
  name: string;
  type_line: string;
  power: string;
  toughness: string;
  colors: string[];
  oracle_text?: string;
  image_url?: string;

  // Instance identity
  instance_id?: string;
  is_token: boolean;

  // Abilities
  keywords?: string[];
  triggered_abilities?: TriggeredAbility[];
  activated_abilities?: ActivatedAbility[];
  static_abilities?: StaticAbility[];

  // Runtime state
  tapped?: boolean;
  counters?: Record<string, number>;
  damage?: number;
}
