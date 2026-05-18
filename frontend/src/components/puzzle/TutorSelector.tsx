import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const TutorSelector: FC = () => {
  const { tutorSelectionState, completeTutorSelection } = usePuzzle();

  if (!tutorSelectionState) return null;

  const { cards, allCards, filter, reason, destination, source } = tutorSelectionState;
  const isWish = source === 'sideboard';

  const validIds = new Set(cards.map((c: any) => c.instance_id || c.card_id));

  const destLabel = destination === 'hand'
    ? 'hand'
    : destination === 'top_of_library'
      ? 'top of library'
      : 'graveyard';

  let filterLabel = '';
  if (filter) {
    const parts: string[] = [];
    if (filter.type === 'instant_or_sorcery') parts.push('instant or sorcery');
    if (filter.type === 'typed_cycling') {
      const searchType = (filter as any).typedCyclingType || '';
      parts.push(`${searchType} card`);
    }
    if (filter.maxCmc !== undefined) parts.push(`CMC ${filter.maxCmc} or less`);
    if (filter.exactCmc !== undefined) parts.push(`mana value exactly ${filter.exactCmc}`);
    filterLabel = parts.join(', ');
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 shadow-xl max-w-4xl w-full mx-4">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          {reason}
        </div>
        <div className="text-blue-400 text-sm text-center mb-1">
          {isWish
            ? `Reveal a card from outside the game — choose one to put into your ${destLabel}`
            : `Search your library — choose a card to put into ${destLabel}`}
        </div>
        {filterLabel && (
          <div className="text-blue-300 text-xs text-center mb-3">
            ({filterLabel})
          </div>
        )}
        {!filterLabel && <div className="mb-3" />}
        <div className="grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
          {allCards.map((card: any) => {
            const valid = validIds.has(card.instance_id || card.card_id);
            return (
              <button
                key={card.instance_id || card.card_id}
                onClick={() => valid && completeTutorSelection(card)}
                disabled={!valid}
                className={`rounded-lg p-3 transition text-left border-2 ${
                  valid
                    ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 hover:border-blue-400 cursor-pointer'
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TutorSelector;
