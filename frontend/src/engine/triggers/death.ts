import { createTriggerStackItem, matchesTriggerEvent, getTriggerSource } from './helpers';
import { calculateCMC } from '../utils/manaCost';
import { getEffectiveTriggeredAbilities } from '../utils/grantedAbilities';
import { GameState, StackItem, Permanent, PlayerKey, Player } from '@/types';

interface DeathEventData {
  creature: Permanent;
  owner: PlayerKey;
}

interface PermanentLeavesEventData {
  permanent: Permanent;
  owner: PlayerKey;
}

/**
 * Detect death triggers when a creature dies.
 * Checks the dying creature's own leaves_battlefield triggers and
 * other permanents' another_creature_dies triggers.
 */
export const detectDeathTriggers = (eventData: DeathEventData, gameState: GameState): StackItem[] => {
  const { creature: dyingCreature, owner } = eventData;
  const player = gameState.players.you;
  const triggersToAdd: StackItem[] = [];

  // Check the DYING creature's own triggers
  if (dyingCreature.triggered_abilities) {
    dyingCreature.triggered_abilities.forEach(ability => {
      // NOTE: leaves_battlefield triggers are handled by the _leavingPermanents loop
      // in PuzzleContext (which fires for ALL zone changes, not just death).
      // Do NOT fire them here — that causes double-triggering for cards like Oblivion Ring.

      // Self-death triggers:
      //   permanent_dies / dies — explicit self-death (Myr Retriever, Thragtusk via leaves)
      //   another_creature_dies w/ source 'any' — "Whenever ~ or another creature dies"
      //     (Blood Artist, Zulaport Cutthroat, Falkenrath Noble — should fire on own death too).
      const source = getTriggerSource(ability);
      const isDirectDeathEvent =
        matchesTriggerEvent(ability, 'permanent_dies') ||
        matchesTriggerEvent(ability, 'dies');
      // Only explicit source: 'any' fires on self for "another_creature_dies".
      // Legacy/unset source means literal "another" — don't fire on self.
      const isAnotherDeathSelfTrigger =
        matchesTriggerEvent(ability, 'another_creature_dies') &&
        source === 'any';

      const dyingCtx = {
        dyingPermanentCMC: calculateCMC(dyingCreature.mana_cost),
        dyingCounters: { ...(dyingCreature.counters || {}) },
      };
      if (isDirectDeathEvent && (source === 'self' || source === 'any' || !source)) {
        triggersToAdd.push(createTriggerStackItem('self-death', dyingCreature, ability, owner, {
          triggerContext: dyingCtx
        }));
      } else if (isAnotherDeathSelfTrigger) {
        triggersToAdd.push(createTriggerStackItem('self-death', dyingCreature, ability, owner, {
          triggerContext: dyingCtx
        }));
      }
    });
  }

  // Check all permanents we control for death triggers (native + equipment-granted)
  const allBattlefield = [...gameState.players.you.battlefield, ...gameState.players.opponent.battlefield];
  player.battlefield?.forEach(permanent => {
    const abilities = getEffectiveTriggeredAbilities(permanent, allBattlefield);
    if (abilities.length > 0) {
      abilities.forEach(ability => {
        if (matchesTriggerEvent(ability, 'another_creature_dies') || matchesTriggerEvent(ability, 'permanent_dies')) {
          // Skip self-only triggers — those are handled in Section A when the creature itself dies
          if (getTriggerSource(ability) === 'self') return;
          // Skip triggers gated on graveyard residency — the graveyard scan below handles those.
          if ((typeof ability.trigger === 'object' ? ability.trigger?.self_zone : undefined) === 'graveyard') return;
          if (permanent.instance_id !== dyingCreature.instance_id) {
            // has_card_type condition — type filter + optional controller filter.
            const trigger = ability.trigger;
            const condition = (typeof trigger === 'object' ? trigger?.condition : undefined) || ability.condition;
            if (condition?.type === 'has_card_type') {
              const requiredTypes: string[] = condition.types || condition.card_types || [];
              const dyingTypeLine = (dyingCreature.type_line || '').toLowerCase();
              if (requiredTypes.length > 0) {
                const matchesType = requiredTypes.some(t => dyingTypeLine.includes(t.toLowerCase()));
                if (!matchesType) return;
              }
              const reqController = condition.controller ?? 'any';
              if (reqController === 'you' && owner !== 'you') return;
              if (reqController === 'opponent' && owner === 'you') return;
              if (condition.not_token && isTokenCreature(dyingCreature)) return;
            }
            triggersToAdd.push(createTriggerStackItem('death-trigger', permanent, ability, 'you', {
              triggerContext: { dyingPermanentCMC: calculateCMC(dyingCreature.mana_cost) }
            }));
          }
        }
      });
    }
  });

  // Graveyard-resident death triggers (Bridge from Below). Triggers with
  // `trigger.self_zone === 'graveyard'` fire from the graveyard rather than
  // the battlefield. Controller of the trigger is the graveyard's owner;
  // `condition.controller` is relative to that.
  (['you', 'opponent'] as PlayerKey[]).forEach(gyOwner => {
    const gy = gameState.players[gyOwner].graveyard || [];
    gy.forEach(card => {
      const cardAny = card as any;
      const abilities = (cardAny.triggered_abilities || []) as any[];
      if (abilities.length === 0) return;
      abilities.forEach(ability => {
        const trigger = ability.trigger;
        const selfZone = (typeof trigger === 'object' ? trigger?.self_zone : undefined);
        if (selfZone !== 'graveyard') return;
        if (!(matchesTriggerEvent(ability, 'permanent_dies') || matchesTriggerEvent(ability, 'dies'))) return;

        const condition = (typeof trigger === 'object' ? trigger?.condition : undefined) || ability.condition;
        if (condition?.type === 'has_card_type') {
          const requiredTypes: string[] = condition.types || condition.card_types || [];
          const dyingTypeLine = (dyingCreature.type_line || '').toLowerCase();
          if (requiredTypes.length > 0) {
            const matchesType = requiredTypes.some(t => dyingTypeLine.includes(t.toLowerCase()));
            if (!matchesType) return;
          }
          const reqController = condition.controller ?? 'any';
          if (reqController === 'you' && owner !== gyOwner) return;
          if (reqController === 'opponent' && owner === gyOwner) return;
          if (condition.not_token && isTokenCreature(dyingCreature)) return;
        }
        triggersToAdd.push(createTriggerStackItem('gy-death-trigger', card as Permanent, ability, gyOwner, {
          triggerContext: { dyingPermanentCMC: calculateCMC(dyingCreature.mana_cost) }
        }));
      });
    });
  });

  return triggersToAdd;
};

// Token detection: applyCreateToken / applyCreateTokenCopy set isToken: true
// on every engine-created token and prefix the type_line with "Token ". We
// avoid the string-card_id heuristic here (test fixtures use string ids
// without being tokens).
const isTokenCreature = (c: Permanent): boolean => {
  return !!(c as any).isToken
    || !!(c as any).is_token
    || ((c.type_line || '').toLowerCase().startsWith('token '));
};

/**
 * Detect triggers when a permanent leaves the battlefield (Super Shredder, etc.).
 * Also handles `permanent_dies` ability events for non-creature permanents
 * (creature deaths flow through detectDeathTriggers via creature_died event).
 *
 * has_card_type condition supports an optional `controller` field
 * ('you' | 'opponent' | 'any', default 'any') to scope by who controlled the
 * leaving permanent — used by Marionette / Disciple / Cruel Celebrant.
 */
export const detectPermanentLeavesTriggers = (eventData: PermanentLeavesEventData, gameState: GameState): StackItem[] => {
  const { permanent: leavingPermanent, owner: leavingOwner } = eventData;
  const triggersToAdd: StackItem[] = [];
  const leavingTypeLine = (leavingPermanent.type_line || '').toLowerCase();
  const leavingIsCreature = leavingTypeLine.includes('creature');

  // The leaving permanent's OWN self-death triggers for non-creatures.
  // Creature self-death is handled in detectDeathTriggers Section A. Note:
  // permanent_leaves_battlefield is a "when ANOTHER permanent leaves" trigger
  // by definition; we do NOT fire it for self here.
  const ownAbilities = (leavingPermanent as any).triggered_abilities || [];
  ownAbilities.forEach((ability: any) => {
    const trigger = ability.trigger;
    const source = (typeof trigger === 'object' ? trigger?.source : undefined);
    if (source !== undefined && source !== 'self') return;
    const isDeathEvent =
      (matchesTriggerEvent(ability, 'permanent_dies') || matchesTriggerEvent(ability, 'dies'))
      && !leavingIsCreature;
    if (!isDeathEvent) return;
    triggersToAdd.push(createTriggerStackItem('self-leaves', leavingPermanent, ability, leavingOwner));
  });

  const checkPlayer = (playerObj: Player, playerKey: PlayerKey): void => {
    playerObj.battlefield?.forEach(permanent => {
      if (permanent.instance_id === leavingPermanent.instance_id) return;
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        const isLeavesEvent = matchesTriggerEvent(ability, 'permanent_leaves_battlefield');
        // Match permanent_dies / dies for NON-creature permanents only
        // (creature deaths are handled by detectDeathTriggers).
        const isDeathEvent =
          (matchesTriggerEvent(ability, 'permanent_dies') || matchesTriggerEvent(ability, 'dies'))
          && !leavingIsCreature;
        if (!isLeavesEvent && !isDeathEvent) return;

        // has_card_type filter — gate by leaving permanent's types and controller
        const trigger = ability.trigger;
        const condition = (typeof trigger === 'object' ? trigger?.condition : undefined) || (ability as any).condition;
        if (condition?.type === 'has_card_type') {
          const requiredTypes: string[] = condition.types || condition.card_types || [];
          if (requiredTypes.length > 0) {
            const matchesType = requiredTypes.some(t => leavingTypeLine.includes(t.toLowerCase()));
            if (!matchesType) return;
          }
          const reqController = condition.controller ?? 'any';
          if (reqController === 'you' && leavingOwner !== playerKey) return;
          if (reqController === 'opponent' && leavingOwner === playerKey) return;
        }

        // Remap add_counter with target=self to add_counter_to_source (searches both battlefields)
        const effect = ability.effect?.target === 'self'
          ? { ...ability.effect, type: 'add_counter_to_source' as const }
          : ability.effect;
        triggersToAdd.push(createTriggerStackItem('perm-leaves', permanent, { ...ability, effect }, playerKey));
      });
    });
  };

  checkPlayer(gameState.players.you, 'you');
  checkPlayer(gameState.players.opponent, 'opponent');

  return triggersToAdd;
};
