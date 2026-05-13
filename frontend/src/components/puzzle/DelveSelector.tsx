import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const DelveSelector: FC = () => {
  const {
    delveState,
    toggleDelveCard,
    confirmDelve,
    cancelDelve,
    gameState
  } = usePuzzle();

  if (!delveState || !gameState) return null;

  const { card, maxDelve, selectedCards } = delveState;
  const graveyard = gameState.players.you.graveyard || [];
  const selectedIds = new Set(selectedCards.map(c => c.instance_id));
  const selectedCount = selectedCards.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-indigo-500 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Delve — {card.name}
        </div>
        <div className="text-indigo-400 text-sm text-center mb-1">
          Exile cards from your graveyard to reduce the generic mana cost
        </div>
        <div className={`text-center text-sm mb-4 font-bold ${selectedCount > 0 ? 'text-indigo-300' : 'text-gray-400'}`}>
          Exiling {selectedCount} / {maxDelve} (saves {selectedCount} generic mana)
        </div>

        {graveyard.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No cards in graveyard</div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {graveyard.map((gyCard: any) => {
              const isSelected = selectedIds.has(gyCard.instance_id);
              const canSelect = isSelected || selectedCount < maxDelve;
              return (
                <button
                  key={gyCard.instance_id || gyCard.card_id}
                  onClick={() => toggleDelveCard(gyCard)}
                  disabled={!canSelect}
                  className={`rounded-lg p-3 transition text-left border-2 ${
                    isSelected
                      ? 'bg-indigo-900/50 border-indigo-500'
                      : canSelect
                      ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-indigo-400'
                      : 'bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="text-white text-xs font-bold truncate">{gyCard.name}</div>
                  <div className="text-gray-400 text-xs truncate">{gyCard.mana_cost || ''}</div>
                  <div className="text-gray-500 text-xs truncate">
                    {(gyCard.type_line || '').split(' — ')[0]}
                  </div>
                  {isSelected && <div className="text-indigo-400 text-xs mt-1">✓ Exile</div>}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={confirmDelve}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cast {selectedCount > 0 ? `(delve ${selectedCount})` : '(no delve)'}
          </button>
          <button
            onClick={cancelDelve}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DelveSelector;
