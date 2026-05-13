import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const DiscardSelector: FC = () => {
  const {
    discardSelectionState,
    completeDiscard,
    additionalCostDiscardState,
    completeAdditionalCostDiscard,
    cancelAdditionalCostDiscard,
    gameState
  } = usePuzzle();

  if (!gameState) return null;

  // Additional cost discard mode (Thrill of Possibility)
  if (additionalCostDiscardState) {
    const { card: spellCard, count, discardedSoFar } = additionalCostDiscardState;
    const discardedIds = new Set(discardedSoFar.map((c: any) => c.instance_id));

    // Show hand cards except the spell being cast and already-discarded cards
    const selectableCards = gameState.players.you.hand.filter(
      (c: any) => c.instance_id !== (spellCard as any).instance_id && !discardedIds.has(c.instance_id)
    );

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-900 border-2 border-orange-500 rounded-lg p-6 shadow-xl max-w-2xl">
          <div className="text-white font-semibold mb-2 text-center text-lg">
            Additional Cost — {spellCard.name}
          </div>
          <div className="text-orange-400 text-sm text-center mb-4">
            Discard {count} card(s) to cast this spell
          </div>
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {selectableCards.map((card: any) => (
              <button
                key={card.instance_id || card.card_id}
                onClick={() => completeAdditionalCostDiscard(card)}
                className="bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 hover:border-orange-400 rounded-lg p-3 transition text-left"
              >
                <div className="text-white text-xs font-bold truncate">{card.name}</div>
                <div className="text-gray-400 text-xs truncate">{card.mana_cost || ''}</div>
                <div className="text-gray-500 text-xs truncate">
                  {card.type_line?.split(' - ')[0] || ''}
                </div>
              </button>
            ))}
          </div>
          {discardedSoFar.length === 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={cancelAdditionalCostDiscard}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Effect discard mode (existing behavior)
  if (!discardSelectionState) return null;

  const hand = gameState.players.you.hand;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-orange-500 rounded-lg p-6 shadow-xl max-w-2xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          Discard a Card
        </div>
        <div className="text-orange-400 text-sm text-center mb-4">
          {discardSelectionState.reason} — Choose {discardSelectionState.count} card(s) to discard
        </div>
        <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
          {hand.map((card: any) => (
            <button
              key={card.instance_id || card.card_id}
              onClick={() => completeDiscard(card)}
              className="bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 hover:border-orange-400 rounded-lg p-3 transition text-left"
            >
              <div className="text-white text-xs font-bold truncate">{card.name}</div>
              <div className="text-gray-400 text-xs truncate">{card.mana_cost || ''}</div>
              <div className="text-gray-500 text-xs truncate">
                {card.type_line?.split(' - ')[0] || ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiscardSelector;
