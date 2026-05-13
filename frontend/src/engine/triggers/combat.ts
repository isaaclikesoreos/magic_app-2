import { createTriggerStackItem, matchesTriggerEvent } from './helpers';
import { GameState, StackItem } from '@/types';

interface AttackEventData {
  attackerIds: string[];
}

/**
 * Detect attack triggers when creatures are declared as attackers.
 */
export const detectAttackTriggers = (eventData: AttackEventData, gameState: GameState): StackItem[] => {
  const { attackerIds } = eventData;
  const triggersToAdd: StackItem[] = [];

  gameState.players.you.battlefield?.forEach(creature => {
    if (attackerIds.includes(creature.instance_id || '') && creature.triggered_abilities) {
      creature.triggered_abilities.forEach(ability => {
        if (matchesTriggerEvent(ability, 'on_attack')) {
          triggersToAdd.push(createTriggerStackItem('attack-trigger', creature, ability, 'you', {
            requires_input: ability.requires_input || false,
          }));
        }
      });
    }
  });

  return triggersToAdd;
};
