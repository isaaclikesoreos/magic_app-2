import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { calculateCMC } from '../../engine/utils/manaCost';

const CollectEvidenceSelector: FC = () => {
  const {
    collectEvidenceState,
    toggleEvidenceCard,
    confirmEvidence,
    cancelEvidence,
    gameState
  } = usePuzzle();

  if (!collectEvidenceState || !gameState) return null;

  const { card, evidenceValue, selectedCards } = collectEvidenceState;
  const graveyard = gameState.players.you.graveyard || [];
  const selectedIds = new Set(selectedCards.map(c => c.instance_id));

  const totalSelectedCMC = selectedCards.reduce(
    (sum, c) => sum + calculateCMC(c.mana_cost), 0
  );
  const thresholdMet = totalSelectedCMC >= evidenceValue;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-green-500 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Collect Evidence — {card.name}
        </div>
        <div className="text-green-400 text-sm text-center mb-1">
          Exile cards from your graveyard with total mana value ≥ {evidenceValue}
        </div>
        <div className={`text-center text-sm mb-4 font-bold ${thresholdMet ? 'text-green-300' : 'text-gray-400'}`}>
          Selected: {totalSelectedCMC} / {evidenceValue} mana value
        </div>

        {graveyard.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No cards in graveyard</div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {graveyard.map((gyCard: any) => {
              const isSelected = selectedIds.has(gyCard.instance_id);
              const cardCMC = calculateCMC(gyCard.mana_cost);
              return (
                <button
                  key={gyCard.instance_id || gyCard.card_id}
                  onClick={() => toggleEvidenceCard(gyCard)}
                  className={`rounded-lg p-3 transition text-left border-2 ${
                    isSelected
                      ? 'bg-green-900/50 border-green-500'
                      : 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-green-400'
                  }`}
                >
                  <div className="text-white text-xs font-bold truncate">{gyCard.name}</div>
                  <div className="text-gray-400 text-xs truncate">{gyCard.mana_cost || ''}</div>
                  <div className="text-gray-500 text-xs">MV: {cardCMC}</div>
                  {isSelected && <div className="text-green-400 text-xs mt-1">✓ Selected</div>}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={confirmEvidence}
            disabled={!thresholdMet}
            className={`px-4 py-2 rounded font-semibold transition ${
              thresholdMet
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm ({totalSelectedCMC}/{evidenceValue})
          </button>
          <button
            onClick={cancelEvidence}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollectEvidenceSelector;
