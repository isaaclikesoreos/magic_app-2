import { createTriggerStackItem, matchesTriggerEvent, getTriggerSource } from './helpers';
import { getEffectiveTriggeredAbilities } from '../utils/grantedAbilities';
import { GameState, StackItem, Permanent, PlayerKey } from '@/types';

interface SacrificeEventData {
  creature: Permanent;
  owner: PlayerKey;
}

/**
 * Detect creature-sacrifice triggers — fires only for creature-specific
 * sacrifice abilities (Fleshtaker, etc.). Permanent-scope sacrifice abilities
 * (Mayhem Devil's permanent_sacrificed event) are handled by
 * detectPermanentSacrificeTriggers below.
 */
export const detectSacrificeTriggers = (eventData: SacrificeEventData, gameState: GameState): StackItem[] => {
  const { creature: sacrificedCreature, owner: sacOwner } = eventData;
  const triggersToAdd: StackItem[] = [];

  const allBattlefield = [
    ...(gameState?.players?.you?.battlefield || []),
    ...(gameState?.players?.opponent?.battlefield || []),
  ];

  for (const ownerKey of ['you', 'opponent'] as PlayerKey[]) {
    const bf = gameState?.players?.[ownerKey]?.battlefield || [];
    for (const permanent of bf) {
      const abilities = getEffectiveTriggeredAbilities(permanent, allBattlefield);
      for (const ability of abilities) {
        const matches = matchesTriggerEvent(ability, 'sacrifice_creature')
          || matchesTriggerEvent(ability, 'creature_sacrificed');
        if (!matches) continue;

        if (getTriggerSource(ability) === 'self') continue;
        if (permanent.instance_id === sacrificedCreature.instance_id) continue;
        if (ownerKey !== sacOwner) continue;

        triggersToAdd.push(createTriggerStackItem('sacrifice-trigger', permanent, ability, ownerKey));
      }
    }
  }

  return triggersToAdd;
};

interface PermanentSacrificeEventData {
  permanent: Permanent;
  owner: PlayerKey;
}

/**
 * Detect permanent-sacrifice triggers — fires when ANY permanent (creature,
 * artifact, etc.) is sacrificed. Supports has_card_type filter (types and
 * controller) so cards like Mayhem Devil (no filter — any permanent),
 * Marionette (creature/artifact you control), and Disciple (artifact you
 * control) all work via the same event.
 */
export const detectPermanentSacrificeTriggers = (eventData: PermanentSacrificeEventData, gameState: GameState): StackItem[] => {
  const { permanent: sacrificed, owner: sacOwner } = eventData;
  const triggersToAdd: StackItem[] = [];
  const sacTypeLine = (sacrificed.type_line || '').toLowerCase();

  const allBattlefield = [
    ...(gameState?.players?.you?.battlefield || []),
    ...(gameState?.players?.opponent?.battlefield || []),
  ];

  for (const ownerKey of ['you', 'opponent'] as PlayerKey[]) {
    const bf = gameState?.players?.[ownerKey]?.battlefield || [];
    for (const permanent of bf) {
      const abilities = getEffectiveTriggeredAbilities(permanent, allBattlefield);
      for (const ability of abilities) {
        if (!matchesTriggerEvent(ability, 'permanent_sacrificed')) continue;

        if (getTriggerSource(ability) === 'self') continue;
        if (permanent.instance_id === sacrificed.instance_id) continue;

        // has_card_type condition — type + optional controller filter.
        const trigger = (ability as any).trigger;
        const condition = (typeof trigger === 'object' ? trigger?.condition : undefined) || (ability as any).condition;
        if (condition?.type === 'has_card_type') {
          const requiredTypes: string[] = condition.types || condition.card_types || [];
          if (requiredTypes.length > 0) {
            const matchesType = requiredTypes.some((t: string) => sacTypeLine.includes(t.toLowerCase()));
            if (!matchesType) continue;
          }
          const reqController = condition.controller ?? 'any';
          if (reqController === 'you' && sacOwner !== ownerKey) continue;
          if (reqController === 'opponent' && sacOwner === ownerKey) continue;
        } else {
          // No type filter — Mayhem Devil-style. Default controller scope: source's controller
          // is the sacrificer (matches "Whenever YOU sacrifice" semantics).
          if (sacOwner !== ownerKey) continue;
        }

        triggersToAdd.push(createTriggerStackItem('perm-sac-trigger', permanent, ability, ownerKey));
      }
    }
  }

  return triggersToAdd;
};
