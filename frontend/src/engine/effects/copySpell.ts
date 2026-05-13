import { GameState, StackItem } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * No-op handler for copy_spell effects.
 * The actual copy creation is handled by resolveStack in PuzzleContext,
 * because it needs access to the stack (which effect handlers don't have).
 */
export const applyCopySpell = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const targetName = stackItem.targeting_data?.targetData?.snapshot?.source?.name || 'spell';
  addLog(`${stackItem.source.name} copies ${targetName}`);
  return JSON.parse(JSON.stringify(gameState)) as GameState;
};
