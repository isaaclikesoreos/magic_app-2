import { createTriggerStackItem, matchesTriggerEvent, getTriggerSource, getTriggerCondition } from './helpers';
import { GameState, StackItem, PlayerKey } from '@/types';

interface CardDrawnEventData {
  player: PlayerKey;           // who drew
  amountDrawn: number;         // cards drawn this effect
  totalDrawnThisTurn: number;  // cumulative total this turn
}

/**
 * Detect card_drawn triggers (Faerie Mastermind, etc.).
 * Fires when a player draws a card — checks draw_count condition
 * to support "when opponent draws their Nth card each turn" patterns.
 */
export const detectCardDrawnTriggers = (
  eventData: CardDrawnEventData,
  gameState: GameState
): StackItem[] => {
  const { player, totalDrawnThisTurn } = eventData;
  const triggers: StackItem[] = [];

  (['you', 'opponent'] as PlayerKey[]).forEach(controllerKey => {
    const controller = gameState.players[controllerKey];
    controller.battlefield?.forEach(permanent => {
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        if (!matchesTriggerEvent(ability, 'card_drawn')) return;

        // Check source: does this trigger care about who drew?
        const source = getTriggerSource(ability);
        const drawingPlayerIsOpponentOfController =
          (controllerKey === 'you' && player === 'opponent') ||
          (controllerKey === 'opponent' && player === 'you');

        if (source === 'opponent' && !drawingPlayerIsOpponentOfController) return;
        if (source === 'self' && player !== controllerKey) return;

        // Check draw_count condition threshold
        const condition = getTriggerCondition(ability);
        const requiredCount = condition?.draw_count;
        if (requiredCount && totalDrawnThisTurn !== requiredCount) return;

        triggers.push(createTriggerStackItem('card-drawn', permanent, ability, controllerKey));
      });
    });
  });

  return triggers;
};
