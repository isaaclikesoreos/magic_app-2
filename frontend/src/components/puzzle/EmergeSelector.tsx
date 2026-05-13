import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { parseManaCost, calculateCMC } from '../../engine/utils/manaCost';

const EmergeSelector: FC = () => {
  const {
    emergeState,
    completeEmerge,
    cancelEmerge,
    gameState
  } = usePuzzle();

  if (!emergeState || !gameState) return null;

  const { card } = emergeState;
  const creatures = (gameState.players.you.battlefield || []).filter(
    (c: any) => (c.type_line || '').toLowerCase().includes('creature')
  );

  // Parse emerge cost for display
  const emergeMatch = card.oracle_text?.match(/Emerge\s*(\{[^}]+\}(?:\{[^}]+\})*)/i);
  const emergeCostStr = emergeMatch ? emergeMatch[1] : '?';
  const emergeCost = emergeMatch ? parseManaCost(emergeCostStr) : null;

  // Calculate what the cost would be for each creature
  const getReducedCostLabel = (creature: any): string => {
    if (!emergeCost) return '?';
    const cmc = calculateCMC(creature.mana_cost);
    const colors: string[] = creature.colors || [];
    const remaining: Record<string, number> = { ...(emergeCost.colored || {}) };
    let generic = Math.max(0, (emergeCost.generic || 0) - cmc);

    for (const color of colors) {
      if (remaining[color] && remaining[color] > 0) {
        remaining[color]--;
      }
    }

    const parts: string[] = [];
    if (generic > 0) parts.push(`{${generic}}`);
    for (const [color, count] of Object.entries(remaining)) {
      for (let i = 0; i < count; i++) parts.push(`{${color}}`);
    }
    return parts.length > 0 ? parts.join('') : '{0}';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-purple-600 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Emerge — {card.name}
        </div>
        <div className="text-purple-400 text-sm text-center mb-1">
          Sacrifice a creature to reduce the emerge cost ({emergeCostStr})
        </div>
        <div className="text-gray-400 text-sm text-center mb-4">
          Cost is reduced by the sacrificed creature's mana value
        </div>

        {creatures.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No creatures to sacrifice</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {creatures.map((creature: any) => {
              const cmc = calculateCMC(creature.mana_cost);
              const reducedCost = getReducedCostLabel(creature);
              return (
                <button
                  key={creature.instance_id}
                  onClick={() => completeEmerge(creature)}
                  className="bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 hover:border-purple-400 rounded-lg p-3 transition text-left"
                >
                  <div className="text-white text-xs font-bold truncate">{creature.name}</div>
                  <div className="text-gray-400 text-xs">{creature.mana_cost || ''} (MV: {cmc})</div>
                  <div className="text-gray-500 text-xs">{creature.power}/{creature.toughness}</div>
                  <div className="text-purple-400 text-xs mt-1">Cost: {reducedCost}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <button
            onClick={cancelEmerge}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergeSelector;
