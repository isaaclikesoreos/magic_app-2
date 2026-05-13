import { matchesTriggerEvent, getTriggerCondition } from './helpers';
import { creatureMatchesTypeFilter, CreatureTypeFilter } from '../utils/creatureTypes';
import { getEffectiveTriggeredAbilities } from '../utils/grantedAbilities';
import { GameState, StackItem, Permanent, PlayerKey } from '@/types';

interface ETBEventData {
  creature: Permanent;
  wasEvoked?: boolean;
  wasDashed?: boolean;
  wasKicked?: boolean;
  wasEvidenceCollected?: boolean;
}

interface TokenETBEventData {
  token: any;
  tokenCount: number;
}

/**
 * Returns true if this permanent should be skipped because the entering creature
 * is the permanent itself. Supports both formats:
 *   Old: ability.excludeSelf === true
 *   New: ability.trigger.source === 'other'
 */
function isExcludedSelf(ability: any, permanent: Permanent, creature: Permanent): boolean {
  if (permanent.instance_id !== creature.instance_id) return false;
  if (ability.excludeSelf) return true;
  if (ability.trigger?.source === 'other') return true;
  return false;
}

/**
 * Returns false if the ability has a creature_type_filter condition that
 * the entering creature does not satisfy. Returns true if no filter or filter passes.
 */
function passesTypeFilter(ability: any, entering: Permanent, sourceOwner: PlayerKey): boolean {
  const condition = getTriggerCondition(ability);
  if (condition?.type !== 'creature_type_filter') return true;
  return creatureMatchesTypeFilter(entering, condition as CreatureTypeFilter, sourceOwner);
}

const EFFECTS_REQUIRING_INPUT = new Set(['damage_divided', 'deal_damage_divided', 'modal_choice', 'exile_until_leaves', 'exile_under']);

export const detectETBTriggers = (eventData: ETBEventData, gameState: GameState): StackItem[] => {
  const triggers: StackItem[] = [];
  const { creature, wasEvoked, wasKicked, wasEvidenceCollected } = eventData;

  // Evoke sacrifice goes on stack FIRST so it resolves LAST (after the ETB ability).
  // MTG rules: ETB ability resolves first, then evoke sacrifice resolves.
  if (wasEvoked) {
    triggers.push({
      id: `evoke-sacrifice-${creature.card_id}-${Date.now()}`,
      type: 'triggered_ability',
      source: {
        instance_id: creature.instance_id,
        card_id: creature.card_id,
        name: creature.name,
        owner: 'you'
      },
      effect: { type: 'sacrifice_self' },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    });
  }

  // Offspring: if creature was cast with offspring, create a 1/1 token copy ETB trigger
  if ((creature as any)._offspringPaid) {
    // Build a 1/1 token with all the parent's abilities and types
    const token: any = {
      name: creature.name,
      type_line: creature.type_line || 'Creature Token',
      power: 1,
      toughness: 1,
      keywords: [...(creature.keywords || [])],
    };
    // Copy triggered abilities (e.g., death triggers)
    if (creature.triggered_abilities && creature.triggered_abilities.length > 0) {
      token.triggered_abilities = creature.triggered_abilities;
    }
    // Copy activated abilities
    if ((creature as any).activated_abilities && (creature as any).activated_abilities.length > 0) {
      token.activated_abilities = (creature as any).activated_abilities;
    }

    triggers.push({
      id: `offspring-token-${creature.card_id}-${Date.now()}-${Math.random()}`,
      type: 'triggered_ability',
      source: {
        instance_id: creature.instance_id,
        card_id: creature.card_id,
        name: creature.name,
        owner: 'you'
      },
      effect: {
        type: 'create_token',
        token,
        count: 1,
        owner: 'you'
      },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    });
  }

  // Squad: if creature has _squadCount, create that many token copies of itself
  const squadCount = (creature as any)._squadCount as number | undefined;
  if (squadCount && squadCount > 0) {
    const token: any = {
      name: creature.name,
      type_line: creature.type_line || 'Creature Token',
      power: parseInt(String(creature.power)) || 0,
      toughness: parseInt(String(creature.toughness)) || 0,
      keywords: [...(creature.keywords || [])],
    };
    if (creature.triggered_abilities && creature.triggered_abilities.length > 0) {
      token.triggered_abilities = creature.triggered_abilities;
    }
    if ((creature as any).activated_abilities && (creature as any).activated_abilities.length > 0) {
      token.activated_abilities = (creature as any).activated_abilities;
    }
    if ((creature as any).static_abilities && (creature as any).static_abilities.length > 0) {
      token.static_abilities = (creature as any).static_abilities;
    }

    triggers.push({
      id: `squad-token-${creature.card_id}-${Date.now()}-${Math.random()}`,
      type: 'triggered_ability',
      source: {
        instance_id: creature.instance_id,
        card_id: creature.card_id,
        name: creature.name,
        owner: 'you'
      },
      effect: {
        type: 'create_token',
        token,
        count: squadCount,
        owner: 'you'
      },
      requires_input: false,
      targeting_data: null,
      resolved: false,
      timestamp: Date.now()
    });
  }

  // Multikicker: if creature has _multikickCount and a multikicker ETB trigger, fire it with count
  const multikickCount = (creature as any)._multikickCount as number | undefined;
  if (multikickCount && multikickCount > 0 && creature.triggered_abilities) {
    creature.triggered_abilities.forEach(ability => {
      const isSelfETB =
        matchesTriggerEvent(ability, 'enters_the_battlefield') ||
        matchesTriggerEvent(ability, 'enters_battlefield');
      if (!isSelfETB) return;

      // Check for multikicker condition
      const condition = (ability as any).condition || (typeof ability.trigger === 'object' ? ability.trigger?.condition : undefined);
      if (condition?.type !== 'was_multikicked') return;

      // Build the effect with count from multikickCount
      const effect = { ...ability.effect };
      if (effect.type === 'create_token') {
        effect.count = multikickCount;
      }

      triggers.push({
        id: `multikick-trigger-${creature.card_id}-${Date.now()}-${Math.random()}`,
        type: 'triggered_ability',
        source: {
          instance_id: creature.instance_id,
          card_id: creature.card_id,
          name: creature.name,
          owner: 'you'
        },
        effect,
        requires_input: ability.requires_input || EFFECTS_REQUIRING_INPUT.has(effect.type) || false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now()
      });
    });
  }

  // Check the creature's own ETB triggers (source: "self").
  // These go on the stack after evoke (so they resolve first / are on top).
  // Supports: ability.trigger string, ability.trigger.event object, ability.event (new DB format)
  if (creature.triggered_abilities) {
    creature.triggered_abilities.forEach(ability => {
      const isSelfETB =
        matchesTriggerEvent(ability, 'enters_the_battlefield') ||
        matchesTriggerEvent(ability, 'enters_battlefield');
      if (!isSelfETB) return;

      // Check for conditional ETB triggers — skip if condition not met
      const condition = (ability as any).condition || (typeof ability.trigger === 'object' ? ability.trigger?.condition : undefined);
      if (condition?.type === 'was_kicked' && !wasKicked) return;
      if (condition?.type === 'evidence_collected' && !wasEvidenceCollected) return;
      // Multikicker triggers are handled separately above — skip them here
      if (condition?.type === 'was_multikicked') return;

      // If creature has _xValue, pass it to the effect (for ravenous/X-cost ETB triggers)
      // Only set amount if the effect's amount_from is 'x' or if the effect doesn't have a fixed amount
      const creatureXValue = (creature as any)._xValue as number | undefined;
      let effectWithX = ability.effect;
      if (creatureXValue !== undefined && ability.effect) {
        effectWithX = { ...ability.effect, xValue: creatureXValue };
        if ((ability.effect as any).amount_from === 'x' || (ability.effect as any).amount === 'x') {
          effectWithX = { ...effectWithX, amount: creatureXValue };
        }
      }

      triggers.push({
        id: `trigger-${creature.card_id}-${Date.now()}-${Math.random()}`,
        type: 'triggered_ability',
        source: {
          instance_id: creature.instance_id,
          card_id: creature.card_id,
          name: creature.name,
          owner: 'you'
        },
        effect: effectWithX,
        requires_input: ability.requires_input || EFFECTS_REQUIRING_INPUT.has(ability.effect?.type) || false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now()
      });
    });
  }

  // Check all permanents for creature_enters_battlefield triggers
  // Only fire if the entering permanent is actually a creature
  const enteringTypeLine = (creature.type_line || '').toLowerCase();
  const enteringIsCreature = enteringTypeLine.includes('creature');
  if (!enteringIsCreature) return triggers;

  const youPermanents = gameState.players.you.battlefield;
  const opponentPermanents = gameState.players.opponent.battlefield;

  const allBattlefield = [...youPermanents, ...opponentPermanents];

  const pushFor = (permanent: Permanent, owner: PlayerKey) => {
    const abilities = getEffectiveTriggeredAbilities(permanent, allBattlefield);
    abilities.forEach(ability => {
      if (!matchesTriggerEvent(ability, 'creature_enters_battlefield')) return;
      if (isExcludedSelf(ability, permanent, creature)) return;
      if (!passesTypeFilter(ability, creature, owner)) return;

      triggers.push({
        id: `trigger-${permanent.card_id}-${Date.now()}-${Math.random()}`,
        type: 'triggered_ability',
        source: {
          instance_id: permanent.instance_id,
          card_id: permanent.card_id,
          name: permanent.name,
          owner,
        },
        effect: ability.effect,
        requires_input: ability.requires_input || false,
        targeting_data: null,
        resolved: false,
        timestamp: Date.now(),
        triggerContext: { triggeringCreature: creature, triggeringCreatureOwner: (creature.cardOwner || (creature as any).owner || owner) as PlayerKey },
        optional: ability.optional === true,
      } as StackItem);
    });
  };

  youPermanents.forEach(p => pushFor(p, 'you'));
  opponentPermanents.forEach(p => pushFor(p, 'opponent'));

  return triggers;
};

export const detectTokenETBTriggers = (eventData: TokenETBEventData, gameState: GameState): StackItem[] => {
  const triggers: StackItem[] = [];
  const { token, tokenCount } = eventData;

  const youPermanents = gameState.players.you.battlefield;
  const opponentPermanents = gameState.players.opponent.battlefield;

  // Fire trigger for each token entering
  for (let i = 0; i < tokenCount; i++) {
    youPermanents.forEach(permanent => {
      if (permanent.triggered_abilities) {
        permanent.triggered_abilities.forEach(ability => {
          if (matchesTriggerEvent(ability, 'creature_enters_battlefield')) {
            if (token && !passesTypeFilter(ability, token as Permanent, 'you')) return;
            triggers.push({
              id: `token-trigger-${permanent.card_id}-${Date.now()}-${i}-${Math.random()}`,
              type: 'triggered_ability',
              source: {
                instance_id: permanent.instance_id,
                card_id: permanent.card_id,
                name: permanent.name,
                owner: 'you'
              },
              effect: ability.effect,
              requires_input: ability.requires_input || false,
              targeting_data: null,
              resolved: false,
              timestamp: Date.now()
            });
          }
        });
      }
    });

    opponentPermanents.forEach(permanent => {
      if (permanent.triggered_abilities) {
        permanent.triggered_abilities.forEach(ability => {
          if (matchesTriggerEvent(ability, 'creature_enters_battlefield')) {
            if (token && !passesTypeFilter(ability, token as Permanent, 'opponent')) return;
            triggers.push({
              id: `token-trigger-${permanent.card_id}-${Date.now()}-${i}-${Math.random()}`,
              type: 'triggered_ability',
              source: {
                instance_id: permanent.instance_id,
                card_id: permanent.card_id,
                name: permanent.name,
                owner: 'opponent'
              },
              effect: ability.effect,
              requires_input: ability.requires_input || false,
              targeting_data: null,
              resolved: false,
              timestamp: Date.now()
            });
          }
        });
      }
    });
  }

  return triggers;
};
