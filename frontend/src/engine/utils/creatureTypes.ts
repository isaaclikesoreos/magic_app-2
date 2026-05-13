/**
 * Creature type / subtype filtering for triggered abilities.
 *
 * Used by triggers that care about race or role (Champion of the Parish,
 * Goblin Rabblemaster, Sliver Hivelord, etc.) — applied via a
 * `creature_type_filter` condition on the trigger.
 *
 * Subtype matching is case-insensitive substring match against `type_line`,
 * since type_line looks like "Creature — Human Soldier".
 */

import { Permanent, PlayerKey } from '@/types';

export interface CreatureTypeFilter {
  type: 'creature_type_filter';
  subtypes: string[];                 // any of these matches
  controller?: 'you' | 'opponent' | 'any';
}

export const creatureMatchesTypeFilter = (
  creature: Permanent,
  filter: CreatureTypeFilter,
  triggerSourceOwner: PlayerKey
): boolean => {
  const typeLine = (creature.type_line || '').toLowerCase();
  const matchesSubtype = filter.subtypes.some(s => typeLine.includes(s.toLowerCase()));
  if (!matchesSubtype) return false;

  const controllerFilter = filter.controller ?? 'any';
  if (controllerFilter === 'any') return true;

  const creatureOwner = (creature.cardOwner || (creature as any).owner) as PlayerKey | undefined;
  if (!creatureOwner) return controllerFilter === 'you';  // permissive default

  if (controllerFilter === 'you') return creatureOwner === triggerSourceOwner;
  if (controllerFilter === 'opponent') return creatureOwner !== triggerSourceOwner;
  return false;
};
