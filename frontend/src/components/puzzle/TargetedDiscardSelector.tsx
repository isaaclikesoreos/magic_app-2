import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const TargetedDiscardSelector: FC = () => {
  const { targetedDiscardState, completeTargetedDiscard } = usePuzzle();

  if (!targetedDiscardState) return null;

  const { cards, filter, reason, targetPlayer } = targetedDiscardState;

  const isValidChoice = (card: any): boolean => {
    if (!filter) return true;
    if (filter === 'nonland') {
      return !(card.type_line || '').toLowerCase().includes('land');
    }
    return true;
  };

  const hasValidChoices = cards.some(isValidChoice);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-lg p-6 shadow-xl max-w-3xl">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          {reason}
        </div>
        <div className="text-purple-400 text-sm text-center mb-4">
          {targetPlayer === 'you' ? 'Your' : "Opponent's"} hand revealed — {hasValidChoices
            ? `choose a${filter === 'nonland' ? ' nonland' : ''} card to discard`
            : `no valid ${filter === 'nonland' ? 'nonland ' : ''}cards to choose`}
        </div>
        <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto">
          {cards.map((card: any) => {
            const valid = isValidChoice(card);
            return (
              <button
                key={card.instance_id || card.card_id}
                onClick={() => valid && completeTargetedDiscard(card)}
                disabled={!valid}
                className={`rounded-lg p-3 transition text-left border-2 ${
                  valid
                    ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-purple-400 cursor-pointer'
                    : 'bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className={`text-xs font-bold truncate ${valid ? 'text-white' : 'text-gray-500'}`}>
                  {card.name}
                </div>
                <div className="text-gray-400 text-xs truncate">{card.mana_cost || ''}</div>
                <div className="text-gray-500 text-xs truncate">
                  {card.type_line?.split(' - ')[0] || ''}
                </div>
                {!valid && filter === 'nonland' && (
                  <div className="text-gray-600 text-xs mt-1">Land — can't choose</div>
                )}
              </button>
            );
          })}
        </div>
        {!hasValidChoices && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => completeTargetedDiscard(null as any)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold transition"
            >
              No valid targets — continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TargetedDiscardSelector;
