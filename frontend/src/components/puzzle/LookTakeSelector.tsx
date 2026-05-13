import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const LookTakeSelector: FC = () => {
  const { lookTakeState, completeLookTake } = usePuzzle();

  if (!lookTakeState) return null;

  const { cards, filter, reason } = lookTakeState;
  const excludeTypes = (filter?.exclude_types || []).map(t => t.toLowerCase());

  const matchesFilter = (card: any): boolean => {
    const types = (card.type_line || '').toLowerCase();
    return !excludeTypes.some(t => types.includes(t));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-lg p-6 shadow-xl max-w-3xl w-full mx-4">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          {reason} — Top {cards.length}
        </div>
        <div className="text-purple-300 text-sm text-center mb-4">
          You may reveal a {excludeTypes.length > 0 ? `non-${excludeTypes.join(', non-')}` : ''} card to put into your hand. The rest go to the bottom of your library in random order.
        </div>

        <div className="flex gap-3 justify-center mb-4 flex-wrap">
          {cards.map((card, index) => {
            const eligible = matchesFilter(card);
            return (
              <button
                key={index}
                onClick={() => eligible && completeLookTake(index)}
                disabled={!eligible}
                className={`rounded-lg p-3 transition text-left border-2 min-w-[140px] ${
                  eligible
                    ? 'bg-purple-900/30 border-purple-500 hover:bg-purple-900/50 cursor-pointer'
                    : 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="text-white text-xs font-bold truncate">{card.name}</div>
                <div className="text-gray-400 text-xs truncate">{(card as any).mana_cost || ''}</div>
                <div className="text-gray-500 text-xs truncate">
                  {(card as any).type_line || ''}
                </div>
                {!eligible && (
                  <div className="text-red-400 text-[10px] mt-1">filtered out</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => completeLookTake(null)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded text-sm font-medium"
          >
            Take none
          </button>
        </div>
      </div>
    </div>
  );
};

export default LookTakeSelector;
