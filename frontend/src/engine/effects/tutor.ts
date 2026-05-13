import { GameState, StackItem, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Tutor — search library for a card, put it in hand / top of library / graveyard.
 * The selected card is passed via targeting_data (set by the TutorSelector UI).
 */
export const applyTutor = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData;

  if (!targetData) {
    addLog('Tutor fizzled — no card selected.');
    return newState;
  }

  const owner = ((stackItem.source as any).owner || 'you') as PlayerKey;
  const player = newState.players[owner];
  const matchId = (targetData as any).instance_id || targetData.card_id;

  // Remove card from library
  player.library = player.library || [];
  const cardIdx = player.library.findIndex(
    (c: any) => ((c as any).instance_id || c.card_id) === matchId
  );

  if (cardIdx < 0) {
    addLog('Card no longer in library.');
    return newState;
  }

  const [card] = player.library.splice(cardIdx, 1);
  player.library_count = player.library.length;

  // Put card in destination
  const destination = stackItem.effect.destination || 'hand';
  switch (destination) {
    case 'hand':
      player.hand = player.hand || [];
      player.hand.push(card);
      addLog(`${card.name} added to hand.`);
      break;
    case 'top_of_library':
      player.library.unshift(card);
      player.library_count = player.library.length;
      addLog('Card placed on top of library.');
      break;
    case 'graveyard':
      player.graveyard = player.graveyard || [];
      player.graveyard.push(card);
      addLog(`${card.name} put into graveyard.`);
      break;
  }

  // Life loss (Vampiric Tutor)
  if (stackItem.effect.life_loss) {
    player.life -= stackItem.effect.life_loss;
    addLog(`You lose ${stackItem.effect.life_loss} life. (Life: ${player.life})`);
  }

  addLog('Library shuffled.');
  return newState;
};
