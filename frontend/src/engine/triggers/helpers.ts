import { StackItem, StackItemSource, Effect, PlayerKey } from '@/types';

/**
 * Matches a trigger against an event name, supporting all three formats:
 *   Old inline: ability.trigger === 'event_name'  (string)
 *   Old object: ability.trigger.event === 'event_name'  (nested object)
 *   New DB:     ability.event === 'event_name'  (top-level event field)
 */
export function matchesTriggerEvent(ability: any, eventName: string): boolean {
  const trigger = ability.trigger;
  if (typeof trigger === 'string') return trigger === eventName;
  if (trigger && typeof trigger === 'object') return trigger.event === eventName;
  if (typeof ability.event === 'string') return ability.event === eventName;
  return false;
}

export function getTriggerSource(ability: any): string | undefined {
  if (ability.trigger && typeof ability.trigger === 'object') return ability.trigger.source;
  return undefined;
}

export function getTriggerCondition(ability: any): any | undefined {
  if (ability.trigger && typeof ability.trigger === 'object') return ability.trigger.condition;
  return ability.condition;
}

/**
 * Helper to create consistent trigger stack items.
 */
export const createTriggerStackItem = (
  idPrefix: string,
  source: any,
  ability: { effect: Effect; requires_input?: boolean },
  owner: PlayerKey,
  overrides: Partial<StackItem> = {}
): StackItem => ({
  id: `${idPrefix}-${source.card_id}-${Date.now()}-${Math.random()}`,
  type: 'triggered_ability',
  source: {
    instance_id: source.instance_id,
    card_id: source.card_id,
    name: source.name,
    owner: owner
  } as StackItemSource,
  effect: ability.effect,
  requires_input: ability.requires_input || ability.effect?.type === 'damage_divided' || ability.effect?.type === 'deal_damage_divided' || false,
  targeting_data: null,
  resolved: false,
  timestamp: Date.now(),
  ...overrides,
});
