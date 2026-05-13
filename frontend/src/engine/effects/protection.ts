import { GameState, StackItem, Permanent } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Grant protection from a color to a target creature.
 */
export const applyGrantProtection = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData as Permanent;
  const protectionColor = stackItem.effect.protection_color;

  if (!targetData || !protectionColor) {
    addLog('Failed to grant protection: missing target or color');
    return newState;
  }

  // Find the target creature and add protection
  const updateCreatureProtection = (creatures: Permanent[]): Permanent[] => {
    return creatures.map(creature => {
      if (creature.instance_id === targetData.instance_id) {
        const currentProtection = creature.protection || [];
        // Add the new protection color if not already present
        const newProtection = currentProtection.includes(protectionColor)
          ? currentProtection
          : [...currentProtection, protectionColor];

        return {
          ...creature,
          protection: newProtection,
          protection_until_end_of_turn: true // Flag to clear at end of turn
        };
      }
      return creature;
    });
  };

  // Update the creature on the battlefield
  newState.players.you.battlefield = updateCreatureProtection(newState.players.you.battlefield);
  newState.players.opponent.battlefield = updateCreatureProtection(newState.players.opponent.battlefield);

  const colorNames: Record<string, string> = {
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green'
  };

  addLog(`${targetData.name} gains protection from ${colorNames[protectionColor] || protectionColor} until end of turn.`);

  return newState;
};
