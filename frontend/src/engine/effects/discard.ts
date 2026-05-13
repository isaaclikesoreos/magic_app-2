import { pushToGraveyardOrExile } from '../replacement';
import { GameState, StackItem, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Random discard — target player discards N cards at random.
 */
export const applyRandomDiscard = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetOwner = (stackItem.targeting_data?.targetData?.owner || 'opponent') as PlayerKey;
  const targetPlayer = newState.players[targetOwner];
  const count = stackItem.effect.count || 1;
  const hand = targetPlayer.hand || [];

  if (hand.length === 0) {
    addLog(`${targetOwner === 'you' ? 'You have' : 'Opponent has'} no cards in hand to discard.`);
    return newState;
  }

  // Shuffle and pick N random cards
  const shuffled = [...hand].sort(() => Math.random() - 0.5);
  const discarded = shuffled.slice(0, Math.min(count, hand.length));

  for (const card of discarded) {
    targetPlayer.hand = targetPlayer.hand.filter(
      (c: any) => c.instance_id !== (card as any).instance_id
    );
    pushToGraveyardOrExile(newState, targetPlayer, card);
    addLog(`${targetOwner === 'you' ? 'You discard' : 'Opponent discards'} ${card.name} at random.`);
  }

  return newState;
};
