import { matchesTriggerEvent } from './helpers';
import { GameState, StackItem, Permanent, PlayerKey, Player } from '@/types';

interface LandGraveyardEventData {
  land: Permanent;
  owner: PlayerKey;
}

/**
 * Detect triggers when a land goes to the graveyard (Dingus Egg).
 */
export const detectLandGraveyardTriggers = (eventData: LandGraveyardEventData, gameState: GameState): StackItem[] => {
  const { owner } = eventData;
  const triggersToAdd: StackItem[] = [];

  const checkPlayer = (playerObj: Player, playerKey: PlayerKey): void => {
    playerObj.battlefield?.forEach(permanent => {
      if (permanent.triggered_abilities) {
        permanent.triggered_abilities.forEach(ability => {
          if (matchesTriggerEvent(ability, 'land_enters_graveyard')) {
            // Remap deal_damage to deal_damage_to_controller for controller-targeting effects
            const effectType = ability.effect?.target === 'controller_of_destroyed_land'
              ? 'deal_damage_to_controller'
              : ability.effect?.type;
            triggersToAdd.push({
              id: `land-graveyard-${permanent.card_id}-${Date.now()}-${Math.random()}`,
              type: 'triggered_ability',
              source: {
                card_id: permanent.card_id,
                name: permanent.name,
                owner: playerKey
              },
              effect: {
                ...ability.effect,
                type: effectType,
                owner: owner
              },
              requires_input: false,
              targeting_data: null,
              resolved: false,
              timestamp: Date.now()
            } as StackItem);
          }
        });
      }
    });
  };

  checkPlayer(gameState.players.you, 'you');
  checkPlayer(gameState.players.opponent, 'opponent');

  return triggersToAdd;
};
