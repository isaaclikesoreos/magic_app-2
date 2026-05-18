/**
 * Effective ability lookup — combines a creature's native abilities with any
 * abilities granted by attached equipment (and, in the future, auras / kindred
 * enchantments). Mirrors the lazy-lookup model already used by sourceHasKeyword.
 *
 * Granted entries are tagged with `_grantedBy` (the granter's instance_id) so
 * UI / logs can attribute the source if needed.
 */

import { Card, Permanent, ActivatedAbility, TriggeredAbility } from '@/types';

export interface GrantedActivated extends ActivatedAbility {
  _grantedBy?: string;
}

export interface GrantedTriggered extends TriggeredAbility {
  _grantedBy?: string;
}

/**
 * Returns the effective triggered abilities of a creature: native + granted by
 * attached equipment. Order: native first, then granted in equipment order.
 */
export const getEffectiveTriggeredAbilities = (
  creature: Permanent,
  allBattlefield: Permanent[]
): GrantedTriggered[] => {
  const native: GrantedTriggered[] = (creature.triggered_abilities || []).map(a => ({ ...a }));
  const granted: GrantedTriggered[] = [];

  for (const equip of allBattlefield) {
    if (equip.equippedTo?.instance_id !== creature.instance_id) continue;
    for (const sa of (equip.static_abilities || [])) {
      if (sa.effect?.type === 'grant_triggered_equipped') {
        const ability = (sa.effect as any).ability as TriggeredAbility | undefined;
        if (ability) {
          granted.push({ ...ability, _grantedBy: equip.instance_id });
        }
      }
    }
  }

  return [...native, ...granted];
};

/**
 * Returns the effective activated abilities of a creature: native + granted
 * by attached equipment + (optionally) granted by the top card of its
 * controller's library when this creature has a
 * `grant_activated_from_top_library` static ability (Conspicuous Snoop).
 *
 * `topOfYourLibrary` should be the top card of the creature's controller's
 * library (or null if empty / not applicable). When omitted, no top-library
 * grants are computed — preserves existing behavior for non-Snoop callers.
 */
export const getEffectiveActivatedAbilities = (
  creature: Permanent,
  allBattlefield: Permanent[],
  topOfYourLibrary?: Card | null
): GrantedActivated[] => {
  const native: GrantedActivated[] = (creature.activated_abilities || []).map(a => ({ ...a }));
  const granted: GrantedActivated[] = [];

  for (const equip of allBattlefield) {
    if (equip.equippedTo?.instance_id !== creature.instance_id) continue;
    for (const sa of (equip.static_abilities || [])) {
      if (sa.effect?.type === 'grant_activated_equipped') {
        const ability = (sa.effect as any).ability as ActivatedAbility | undefined;
        if (ability) {
          granted.push({ ...ability, _grantedBy: equip.instance_id });
        }
      }
    }
  }

  // Snoop-style "has all activated abilities of the top card of your library"
  // when the top card matches the filter (substring-OR on type_line).
  if (topOfYourLibrary) {
    const topTL = (topOfYourLibrary.type_line || '').toLowerCase();
    for (const sa of (creature.static_abilities || [])) {
      if (sa.effect?.type !== 'grant_activated_from_top_library') continue;
      const types: string[] = (sa.effect as any).filter?.types || [];
      const filterMatches = types.length === 0
        || types.some(t => topTL.includes(String(t).toLowerCase()));
      if (!filterMatches) continue;
      const topAbilities = (topOfYourLibrary.activated_abilities || []) as ActivatedAbility[];
      for (const ability of topAbilities) {
        granted.push({ ...ability, _grantedBy: 'top-of-library' });
      }
    }
  }

  return [...native, ...granted];
};
