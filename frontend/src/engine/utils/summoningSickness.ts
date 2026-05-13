/**
 * Summoning sickness rule (MTG 302.1):
 * A creature's activated ability with tap or untap in its cost can't be
 * activated unless the creature has been under its controller's control
 * since the start of its controller's most recent turn. Haste exempts.
 *
 * Applies to native AND equipment-granted abilities. Does NOT apply to
 * non-creature permanents (lands, artifacts) — those tap freely on the
 * turn they enter.
 */

import { Permanent } from '@/types';

const isCreature = (p: Permanent): boolean =>
  (p.type_line || '').toLowerCase().includes('creature');

/**
 * Does this creature have haste? Checks (in order):
 *   1. _dashed flag (Dash grants haste this turn)
 *   2. Own keywords array
 *   3. Legacy hasHaste boolean
 *   4. Oracle text (reminder text stripped) — fallback for cards without
 *      structured keywords
 *   5. Equipment with grant_keywords_equipped including 'haste'
 *   6. Global static grant_keyword targeting creatures_you_control
 */
export const creatureHasHaste = (
  creature: Permanent,
  allBattlefield: Permanent[]
): boolean => {
  if ((creature as any)._dashed) return true;
  if (creature.keywords?.includes('haste')) return true;
  if (creature.hasHaste === true) return true;

  const oracleNoReminder = (creature.oracle_text || '').replace(/\([^)]*\)/g, '').toLowerCase();
  if (oracleNoReminder.includes('haste')) return true;

  for (const eq of allBattlefield) {
    if (eq.equippedTo?.instance_id !== creature.instance_id) continue;
    for (const sa of (eq.static_abilities || [])) {
      if (sa.effect?.type === 'grant_keywords_equipped'
          && (sa.effect as any).keywords?.includes('haste')) {
        return true;
      }
    }
  }

  // Global static grant (e.g. Fervor, Anthem-of-Rakdos, Ranger of Eos)
  for (const perm of allBattlefield) {
    for (const sa of (perm.static_abilities || [])) {
      if (sa.effect?.type === 'grant_keyword'
          && (sa.effect as any).keyword === 'haste'
          && (sa.effect as any).target === 'creatures_you_control') {
        return true;
      }
    }
  }

  return false;
};

/**
 * Can this permanent currently pay a tap cost on an activated ability?
 * Per MTG 302.1: blocks creatures that are summoning sick and lack haste.
 * Non-creatures and creatures with haste are unaffected.
 */
export const canActivateTapAbility = (
  permanent: Permanent,
  allBattlefield: Permanent[]
): boolean => {
  if (!isCreature(permanent)) return true;
  if (!permanent.summoning_sick) return true;
  return creatureHasHaste(permanent, allBattlefield);
};
