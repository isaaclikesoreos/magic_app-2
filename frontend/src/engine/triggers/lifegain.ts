import { createTriggerStackItem, matchesTriggerEvent } from './helpers';
import { GameState, StackItem, PlayerKey } from '@/types';

interface LifeGainEventData {
  player: PlayerKey;
  amount: number;
}

/**
 * Detect life gain triggers (Ajani's Pridemate, etc.).
 */
export const detectLifeGainTriggers = (eventData: LifeGainEventData, gameState: GameState): StackItem[] => {
  const { player } = eventData;
  const triggersToAdd: StackItem[] = [];

  // Only check triggers for the player who gained life
  const playerObj = gameState?.players?.[player];
  if (!playerObj?.battlefield) {
    return [];
  }

  playerObj.battlefield.forEach(permanent => {
    if (permanent.triggered_abilities) {
      permanent.triggered_abilities.forEach(ability => {
        if (matchesTriggerEvent(ability, 'life_gained')) {
          triggersToAdd.push(createTriggerStackItem('life-gain-trigger', permanent, ability, player));
        }
      });
    }
  });

  return triggersToAdd;
};
