import { FC, useState } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';
import { parseManaCost, canAffordCost } from '../../engine/utils/manaCost';

const CounterUnlessPayPrompt: FC = () => {
  const { counterUnlessPayState, payToPreventCounter, declineToPayCounter, wardDiscardComplete, gameState } = usePuzzle();
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);

  if (!counterUnlessPayState) return null;

  const { counterSourceName, targetedSpellName, manaCost, wardType, discardCount } = counterUnlessPayState;
  const isDiscard = wardType === 'discard';

  // Mana ward
  const parsedCost = isDiscard ? null : parseManaCost(manaCost);
  const canPayMana = !isDiscard && gameState ? canAffordCost(parsedCost!, gameState.players.you.mana_pool) : false;

  // Discard ward
  const hand = gameState?.players.you.hand || [];
  const canDiscard = isDiscard && hand.length >= (discardCount || 1);

  const handleDiscard = () => {
    if (selectedCardIdx === null || !hand[selectedCardIdx]) return;
    wardDiscardComplete(hand[selectedCardIdx]);
    setSelectedCardIdx(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-2 text-center">
          {counterSourceName}
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          {isDiscard
            ? <>Discard {discardCount || 1} card{(discardCount || 1) > 1 ? 's' : ''} or <span className="text-yellow-400">{targetedSpellName}</span> is countered.</>
            : <>Pay {manaCost} or <span className="text-yellow-400">{targetedSpellName}</span> is countered.</>
          }
        </div>

        {isDiscard ? (
          <>
            {/* Card selection for discard */}
            {canDiscard && (
              <div className="mb-3">
                <div className="text-gray-400 text-xs mb-2">Select a card to discard:</div>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {hand.map((card: any, idx: number) => (
                    <button
                      key={card.instance_id || idx}
                      onClick={() => setSelectedCardIdx(idx)}
                      className={`px-3 py-2 rounded text-xs font-medium transition border ${
                        selectedCardIdx === idx
                          ? 'bg-yellow-600 border-yellow-400 text-white'
                          : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {card.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                disabled={!canDiscard || selectedCardIdx === null}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  canDiscard && selectedCardIdx !== null
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Discard{selectedCardIdx !== null ? ` ${hand[selectedCardIdx]?.name}` : ''}
              </button>
              <button
                onClick={declineToPayCounter}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 px-4 rounded font-semibold transition"
              >
                Let it be countered
              </button>
            </div>
            {!canDiscard && (
              <div className="text-red-400 text-xs mt-2 text-center">
                Not enough cards in hand to discard
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-3">
              <button
                onClick={payToPreventCounter}
                disabled={!canPayMana}
                className={`flex-1 py-2 px-4 rounded font-semibold transition ${
                  canPayMana
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Pay {manaCost}
              </button>
              <button
                onClick={declineToPayCounter}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 px-4 rounded font-semibold transition"
              >
                Let it be countered
              </button>
            </div>
            {!canPayMana && (
              <div className="text-red-400 text-xs mt-2 text-center">
                Not enough mana to pay
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CounterUnlessPayPrompt;
