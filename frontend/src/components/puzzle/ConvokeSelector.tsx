import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { parseManaCost } from '../../engine/utils/manaCost';

const COLOR_NAMES: Record<string, string> = {
  W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green'
};

const ConvokeSelector: FC = () => {
  const {
    convokeState,
    toggleConvokeCreature,
    confirmConvoke,
    cancelConvoke,
    gameState
  } = usePuzzle();

  if (!convokeState || !gameState) return null;

  const { card, tappedCreatures } = convokeState;
  const battlefield = gameState.players.you.battlefield || [];
  const untappedCreatures = battlefield.filter(
    (c: any) => (c.type_line || '').toLowerCase().includes('creature') && !c.tapped
  );
  const tappedIds = new Set(tappedCreatures.map(c => c.instance_id));

  // Calculate what the tapped creatures pay
  const baseCost = parseManaCost(card.mana_cost || '');
  const remainingColored: Record<string, number> = { ...(baseCost.colored || {}) };
  let remainingGeneric = baseCost.generic || 0;
  let colorPaid = 0;
  let genericPaid = 0;

  for (const creature of tappedCreatures) {
    const creatureColors: string[] = (creature as any).colors || [];
    let matched = false;
    for (const color of creatureColors) {
      if (remainingColored[color] && remainingColored[color] > 0) {
        remainingColored[color]--;
        colorPaid++;
        matched = true;
        break;
      }
    }
    if (!matched && remainingGeneric > 0) {
      remainingGeneric--;
      genericPaid++;
    }
  }

  const totalPaid = colorPaid + genericPaid;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Convoke — {card.name}
        </div>
        <div className="text-amber-400 text-sm text-center mb-1">
          Tap creatures to help pay the mana cost ({card.mana_cost})
        </div>
        <div className={`text-center text-sm mb-4 font-bold ${totalPaid > 0 ? 'text-amber-300' : 'text-gray-400'}`}>
          {totalPaid > 0 ? (
            <>Tapping {totalPaid} creature{totalPaid !== 1 ? 's' : ''} ({colorPaid > 0 ? `${colorPaid} colored` : ''}{colorPaid > 0 && genericPaid > 0 ? ', ' : ''}{genericPaid > 0 ? `${genericPaid} generic` : ''})</>
          ) : (
            'No creatures tapped'
          )}
        </div>

        {untappedCreatures.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No untapped creatures</div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {untappedCreatures.map((creature: any) => {
              const isSelected = tappedIds.has(creature.instance_id);
              const creatureColors: string[] = creature.colors || [];
              const colorLabel = creatureColors.length > 0
                ? creatureColors.map((c: string) => COLOR_NAMES[c] || c).join('/')
                : 'Colorless';
              return (
                <button
                  key={creature.instance_id}
                  onClick={() => toggleConvokeCreature(creature)}
                  className={`rounded-lg p-3 transition text-left border-2 ${
                    isSelected
                      ? 'bg-amber-900/50 border-amber-500'
                      : 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-amber-400'
                  }`}
                >
                  <div className="text-white text-xs font-bold truncate">{creature.name}</div>
                  <div className="text-gray-400 text-xs">{creature.power}/{creature.toughness}</div>
                  <div className="text-gray-500 text-xs">{colorLabel}</div>
                  {isSelected && <div className="text-amber-400 text-xs mt-1">✓ Tapping</div>}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={confirmConvoke}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cast{totalPaid > 0 ? ` (convoke ${totalPaid})` : ''}
          </button>
          <button
            onClick={cancelConvoke}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConvokeSelector;
