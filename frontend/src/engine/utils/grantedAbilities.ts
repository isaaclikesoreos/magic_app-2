/**
 * Effective ability lookup — combines a creature's native abilities with any
 * abilities granted by attached equipment (and, in the future, auras / kindred
 * enchantments). Mirrors the lazy-lookup model already used by sourceHasKeyword.
 *
 * Granted entries are tagged with `_grantedBy` (the granter's instance_id) so
 * UI / logs can attribute the source if needed.
 */

import { Permanent, ActivatedAbility, TriggeredAbility } from '@/types';

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
 * Returns the effective activated abilities of a creature: native + granted by
 * attached equipment.
 */
export const getEffectiveActivatedAbilities = (
  creature: Permanent,
  allBattlefield: Permanent[]
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

  return [...native, ...granted];
};
