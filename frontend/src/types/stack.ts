/**
 * Stack and Stack Item Types
 */

import { Effect } from './abilities';

// Stack Item Types
export type StackItemType =
  | 'spell'
  | 'triggered_ability'
  | 'activated_ability'
  | 'creature_spell'
  | 'permanent_spell'
  | 'spell_copy';

// Stack Item Source (the card/permanent that created this item)
export interface StackItemSource {
  instance_id?: string;
  card_id?: number;
  name: string;
  owner: 'you' | 'opponent';
}

// Targeting Data
export interface TargetingData {
  targetType: 'player' | 'creature' | 'planeswalker' | 'permanent' | 'land' | 'any';
  targetData: any;  // Can be player key, card instance_id, etc.
  targets?: any[];  // For damage_divided (multiple targets)
  targetOwner?: 'you' | 'opponent';  // Owner of the targeted permanent
  assignments?: any[];  // For damage_divided (damage assignment to multiple targets)
}

// Stack Item (spell or ability on the stack)
export interface StackItem {
  id: string;
  type: StackItemType;
  source: StackItemSource;
  effect: Effect;
  requires_input: boolean;
  targeting_data: TargetingData | null;
  resolved: boolean;
  timestamp: number;

  // Optional fields
  wasEvoked?: boolean;
  wasDashed?: boolean;
  [key: string]: any;  // Allow other optional fields
}
