import { calculateToughness } from '../utils/powerToughness';
import { GameState, StackItem, Permanent } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Gain life (from ETB triggers, etc.).
 */
export const applyGainLife = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const lifeAmount = stackItem.effect.amount || 1;
  player.life += lifeAmount;
  addLog(`${stackItem.source.name} triggers: You gain ${lifeAmount} life. (Now at ${player.life})`);
  newState._lifeGained = (newState._lifeGained || 0) + lifeAmount;

  return newState;
};

/**
 * Gain life equal to a sacrificed creature's toughness (Disciple of Griselbrand).
 */
export const applyGainLifeEqualToughness = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const sacrificedCreature = stackItem.effect.sacrificedCreature as Permanent;
  if (sacrificedCreature) {
    const totalToughness = calculateToughness(sacrificedCreature);
    player.life += totalToughness;
    addLog(`${stackItem.source.name}: You gain ${totalToughness} life from sacrificing ${sacrificedCreature.name}. (Now at ${player.life})`);
    newState._lifeGained = (newState._lifeGained || 0) + totalToughness;
  }

  return newState;
};

/**
 * Gain life and scry (Fleshtaker trigger).
 */
export const applyGainLifeAndScry = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const lifeAmount = stackItem.effect.lifeAmount || 1;
  player.life += lifeAmount;
  addLog(`${stackItem.source.name}: You gain ${lifeAmount} life. (Now at ${player.life})`);
  newState._lifeGained = (newState._lifeGained || 0) + lifeAmount;

  if (stackItem.effect.scryAmount) {
    addLog(`Scry ${stackItem.effect.scryAmount} (look at top card of library).`);
  }

  return newState;
};

/**
 * Drain life from target (damage + heal).
 */
export const applyDrainLife = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  const drainAmount = stackItem.effect.amount ?? 0;
  const targetType = stackItem.targeting_data?.targetType;
  const targetData = stackItem.targeting_data?.targetData;

  const isOpponentTarget = targetType === 'player' && targetData === 'opponent';
  if (isOpponentTarget) {
    opponent.life -= drainAmount;
    player.life += drainAmount;
    addLog(`${stackItem.source.name} drains ${drainAmount} life from opponent. Opponent at ${opponent.life}, you at ${player.life}.`);
    newState._lifeGained = (newState._lifeGained || 0) + drainAmount;
  } else {
    addLog(`${stackItem.source.name} drains ${drainAmount} life from you (net zero).`);
  }

  return newState;
};

/**
 * Extort — opponent loses 1 life, you gain 1 life.
 * Called after the player has already paid {W/B}.
 */
export const applyExtort = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  opponent.life -= 1;
  player.life += 1;
  addLog(`${stackItem.source.name} extorts: Opponent loses 1 life (${opponent.life}), you gain 1 life (${player.life}).`);
  newState._lifeGained = (newState._lifeGained || 0) + 1;

  return newState;
};

/**
 * Opponent loses life (and optionally you gain life).
 */
export const applyOpponentLosesLife = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  const amount = stackItem.effect.amount || 1;
  opponent.life -= amount;
  addLog(`Opponent loses ${amount} life. Opponent is now at ${opponent.life} life.`);

  if (stackItem.effect.youGain) {
    player.life += amount;
    addLog(`You gain ${amount} life. You are now at ${player.life} life.`);
    newState._lifeGained = (newState._lifeGained || 0) + amount;
  }

  return newState;
};

/**
 * Targeted player loses life (Geth's Verdict's "and loses 1 life" clause).
 * Reads the targeted player from targeting_data so it pairs with
 * target_player_sacrifice in the same spell's additional_effects chain.
 */
export const applyTargetPlayerLosesLife = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetPlayer = (stackItem.targeting_data?.targetData as any) || 'opponent';
  const target = newState.players[targetPlayer as 'you' | 'opponent'];
  const amount = stackItem.effect.amount || 1;
  target.life -= amount;
  const label = targetPlayer === 'opponent' ? 'Opponent loses' : 'You lose';
  addLog(`${label} ${amount} life. ${targetPlayer === 'opponent' ? 'Opponent' : 'You'} ${targetPlayer === 'opponent' ? 'is' : 'are'} now at ${target.life} life.`);
  return newState;
};
