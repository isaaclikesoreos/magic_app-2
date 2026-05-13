import { GameState, StackItem, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Add counter to the source permanent (Ajani's Pridemate life gain triggers).
 */
export const applyAddCounterToSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const counterType = stackItem.effect.counter_type || stackItem.effect.counterType || '+1/+1';
  const counterAmount = stackItem.effect.amount || 1;
  const sourceInstanceId = stackItem.source.instance_id;

  const sourcePermanent = player.battlefield?.find(c => c.instance_id === sourceInstanceId);

  if (sourcePermanent) {
    sourcePermanent.counters = sourcePermanent.counters || {};
    sourcePermanent.counters[counterType] = (sourcePermanent.counters[counterType] || 0) + counterAmount;
    addLog(`${sourcePermanent.name} gets ${counterAmount} ${counterType} counter(s).`);
  }

  return newState;
};

/**
 * Add counter to the source permanent (e.g., Super Shredder).
 * Unlike addCounterToSelf, this checks both players' battlefields.
 */
export const applyAddCounterToSource = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  const sourceInstanceId = stackItem.source.instance_id;
  const counterType = stackItem.effect.counter_type || stackItem.effect.counterType || '+1/+1';
  const counterCount = stackItem.effect.count || stackItem.effect.amount || 1;

  const sourcePermanent = player.battlefield?.find(c => c.instance_id === sourceInstanceId) ||
                           opponent.battlefield?.find(c => c.instance_id === sourceInstanceId);

  if (sourcePermanent) {
    sourcePermanent.counters = sourcePermanent.counters || {};
    sourcePermanent.counters[counterType] = (sourcePermanent.counters[counterType] || 0) + counterCount;
    addLog(`${sourcePermanent.name} gets a ${counterType} counter.`);
  }

  return newState;
};

/**
 * Add counter to each creature a player controls.
 * Used by Cosmogrand Zenith's "+1/+1 counter on each creature you control."
 */
export const applyAddCounterToEachCreature = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const owner = (stackItem.source?.owner || 'you') as PlayerKey;
  const player = newState.players[owner];

  const counterType = stackItem.effect.counter_type || stackItem.effect.counterType || '+1/+1';
  const counterAmount = stackItem.effect.amount || 1;

  let count = 0;
  player.battlefield?.forEach(permanent => {
    if (permanent.type_line?.toLowerCase().includes('creature')) {
      permanent.counters = permanent.counters || {};
      permanent.counters[counterType] = (permanent.counters[counterType] || 0) + counterAmount;
      count++;
    }
  });

  addLog(count > 0
    ? `Put a ${counterType} counter on ${count} creature${count !== 1 ? 's' : ''}.`
    : `No creatures to put counters on.`);

  return newState;
};
