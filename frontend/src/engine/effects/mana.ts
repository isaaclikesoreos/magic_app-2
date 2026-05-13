import { GameState, StackItem, PlayerKey } from '@/types';
import { resolveCount, CountSelector } from '../utils/counts';

interface EffectHelpers {
  addLog: (message: string) => void;
}

interface ManaPerCountEntry {
  color: string;
  count: CountSelector;
}

const formatMana = (mana: Record<string, number>): string =>
  Object.entries(mana)
    .map(([color, amt]) => `{${color}}`.repeat(amt))
    .join('');

export const applyAddMana = (stackItem: StackItem, gameState: GameState, helpers: EffectHelpers): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const effect = stackItem.effect;
  const sourceOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;
  const manaPool = newState.players[sourceOwner].mana_pool;

  // Static portion: { color: amount, ... }
  const manaToAdd: Record<string, number> = effect.mana || effect.manaToAdd || {};

  // Dynamic portion: [{ color, count: <selector> }, ...]
  const perCount: ManaPerCountEntry[] = (effect as any).mana_per_count || [];
  const dynamicAdded: Record<string, number> = {};
  for (const entry of perCount) {
    const n = resolveCount(entry.count, newState, sourceOwner);
    if (n > 0) {
      dynamicAdded[entry.color] = (dynamicAdded[entry.color] || 0) + n;
    }
  }

  // Merge static + dynamic and apply
  const total: Record<string, number> = { ...manaToAdd };
  for (const [color, amt] of Object.entries(dynamicAdded)) {
    total[color] = (total[color] || 0) + amt;
  }

  if (Object.keys(total).length === 0) return newState;

  for (const [color, amt] of Object.entries(total)) {
    manaPool[color] = (manaPool[color] || 0) + amt;
  }

  const dynamicTag = Object.keys(dynamicAdded).length > 0
    ? ` (includes ${formatMana(dynamicAdded)} from count)`
    : '';
  helpers.addLog(`Added ${formatMana(total)} to mana pool${dynamicTag}`);
  return newState;
};

export const applyChannelActivate = (stackItem: StackItem, gameState: GameState, helpers: EffectHelpers): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const effect = stackItem.effect;

  // Channel typically adds mana
  if (effect.manaToAdd) {
    const manaPool = newState.players.you.mana_pool;
    Object.entries(effect.manaToAdd).forEach(([color, amount]) => {
      manaPool[color] = (manaPool[color] || 0) + (amount as number);
    });
  }

  helpers.addLog(`Channeled ${stackItem.source.name}`);
  return newState;
};
