import { GameState, StackItem, Player, PlayerKey } from '@/types';
import { pushToGraveyardOrExile } from '../replacement';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Draw cards for a player.
 */
export const applyDrawCards = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  let drawCount = stackItem.effect.amount ?? stackItem.effect.xValue ?? 0;
  // City's Blessing upgrade (Secrets of the Golden City)
  if (stackItem.effect.amount_if_citys_blessing && (newState.players.you as any).hasCitysBlessing) {
    drawCount = stackItem.effect.amount_if_citys_blessing;
  }
  const targetType = stackItem.targeting_data?.targetType;
  const targetData = stackItem.targeting_data?.targetData;

  const isOpponentDrawing = targetType === 'player' && targetData === 'opponent';
  const drawingPlayer = isOpponentDrawing ? opponent : player;
  const playerName = isOpponentDrawing ? 'Opponent' : 'You';

  // Apply limit_opponent_draws statics (Narset, Parter of Veils).
  // A static on player A's battlefield caps how many cards opponents may draw per turn.
  const drawingOwner: PlayerKey = isOpponentDrawing ? 'opponent' : 'you';
  const limiterOwner: PlayerKey = drawingOwner === 'you' ? 'opponent' : 'you';
  let perTurnLimit: number | null = null;
  for (const perm of (newState.players[limiterOwner].battlefield || [])) {
    for (const sa of (perm.static_abilities || [])) {
      if (sa.effect?.type === 'limit_opponent_draws') {
        const max = (sa.effect as any).max_per_turn ?? 1;
        perTurnLimit = perTurnLimit === null ? max : Math.min(perTurnLimit, max);
      }
    }
  }
  if (perTurnLimit !== null) {
    const alreadyDrawn = drawingOwner === 'you'
      ? (newState._youCardsDrawnThisTurn || 0)
      : (newState._opponentCardsDrawnThisTurn || 0);
    const remaining = Math.max(0, perTurnLimit - alreadyDrawn);
    if (drawCount > remaining) {
      const skipped = drawCount - remaining;
      drawCount = remaining;
      addLog(`${playerName === 'You' ? 'Your' : "Opponent's"} draw is limited to ${perTurnLimit} per turn — ${skipped} card(s) skipped.`);
    }
  }
  if (drawCount <= 0) {
    return newState;
  }

  drawingPlayer.library = drawingPlayer.library || [];
  drawingPlayer.hand = drawingPlayer.hand || [];

  let actualDrawn = 0;
  if (drawingPlayer.library.length < drawCount) {
    actualDrawn = drawingPlayer.library.length;
    if (actualDrawn > 0) {
      const drawnCards = drawingPlayer.library.splice(0, actualDrawn);
      drawingPlayer.hand.push(...drawnCards);
      addLog(`${playerName} drew ${actualDrawn} card(s).`);
    }
    if (isOpponentDrawing) {
      addLog(`Opponent tried to draw from an empty library. VICTORY! Opponent decked out!`);
      opponent.deckedOut = true;
    } else {
      addLog(`You tried to draw from an empty library. DEFEAT! You decked out!`);
      player.deckedOut = true;
    }
  } else {
    actualDrawn = drawCount;
    const drawnCards = drawingPlayer.library.splice(0, drawCount);
    drawingPlayer.hand.push(...drawnCards);
    const cardNames = drawnCards.map(c => c.name).join(', ');
    addLog(`${playerName} drew ${drawCount} card(s): ${cardNames}`);
  }

  drawingPlayer.library_count = drawingPlayer.library.length;

  // Set transient draw tracking fields
  if (isOpponentDrawing) {
    newState._opponentCardsDrawn = actualDrawn;
    newState._youCardsDrawn = 0;
    newState._opponentCardsDrawnThisTurn = (newState._opponentCardsDrawnThisTurn || 0) + actualDrawn;
  } else {
    newState._youCardsDrawn = actualDrawn;
    newState._opponentCardsDrawn = 0;
    newState._youCardsDrawnThisTurn = (newState._youCardsDrawnThisTurn || 0) + actualDrawn;
  }

  return newState;
};

/**
 * Both players draw cards.
 */
export const applyEachPlayerDraws = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;
  const drawCount = stackItem.effect.amount ?? stackItem.effect.xValue ?? 1;

  let youActualDrawn = 0;
  let oppActualDrawn = 0;

  const drawForPlayer = (targetPlayer: Player, playerName: string, isOpponent: boolean): number => {
    targetPlayer.library = targetPlayer.library || [];
    targetPlayer.hand = targetPlayer.hand || [];

    let drawn = 0;
    if (targetPlayer.library.length < drawCount) {
      drawn = targetPlayer.library.length;
      if (drawn > 0) {
        const drawnCards = targetPlayer.library.splice(0, drawn);
        targetPlayer.hand.push(...drawnCards);
        addLog(`${playerName} drew ${drawn} card(s).`);
      }
      if (isOpponent) {
        addLog(`Opponent tried to draw from an empty library. VICTORY! Opponent decked out!`);
        opponent.deckedOut = true;
      } else {
        addLog(`You tried to draw from an empty library. DEFEAT! You decked out!`);
        player.deckedOut = true;
      }
    } else {
      drawn = drawCount;
      const drawnCards = targetPlayer.library.splice(0, drawCount);
      targetPlayer.hand.push(...drawnCards);
      const cardNames = drawnCards.map(c => c.name).join(', ');
      addLog(`${playerName} drew ${drawCount} card(s): ${cardNames}`);
    }
    targetPlayer.library_count = targetPlayer.library.length;
    return drawn;
  };

  youActualDrawn = drawForPlayer(player, 'You', false);
  oppActualDrawn = drawForPlayer(opponent, 'Opponent', true);

  // Set transient draw tracking fields
  newState._youCardsDrawn = youActualDrawn;
  newState._opponentCardsDrawn = oppActualDrawn;

  return newState;
};

/**
 * Mill cards — move top N cards from library to graveyard.
 */
export const applyMill = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const millCount = stackItem.effect.amount || 1;
  const owner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[owner];

  targetPlayer.library = targetPlayer.library || [];
  targetPlayer.graveyard = targetPlayer.graveyard || [];

  const actualMill = Math.min(millCount, targetPlayer.library.length);
  if (actualMill > 0) {
    const milledCards = targetPlayer.library.splice(0, actualMill);
    for (const card of milledCards) {
      pushToGraveyardOrExile(newState, targetPlayer, card);
    }
    const cardNames = milledCards.map(c => c.name).join(', ');
    addLog(`Milled ${actualMill} card${actualMill !== 1 ? 's' : ''}: ${cardNames}`);
  } else {
    addLog('Library is empty — nothing to mill.');
  }

  targetPlayer.library_count = targetPlayer.library.length;
  return newState;
};
