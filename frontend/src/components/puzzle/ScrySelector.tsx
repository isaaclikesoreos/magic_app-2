import { FC, useState } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ScrySelector: FC = () => {
  const { scrySelectionState, completeScrySelection } = usePuzzle();
  const [bottomIndices, setBottomIndices] = useState<number[]>([]);
  const [phase, setPhase] = useState<'selecting' | 'ordering'>('selecting');
  const [topOrder, setTopOrder] = useState<number[]>([]);

  if (!scrySelectionState) return null;

  const { cards, reason, mode } = scrySelectionState;
  const isSurveil = mode === 'surveil';
  const mechName = isSurveil ? 'Surveil' : 'Scry';
  const destLabel = isSurveil ? 'GRAVEYARD' : 'BOTTOM';
  const destAction = isSurveil ? 'put them into your graveyard' : 'put them on the bottom of your library';
  const allDestLabel = isSurveil ? 'All Graveyard' : 'All Bottom';

  const topIndices = cards
    .map((_, i) => i)
    .filter(i => !bottomIndices.includes(i));

  const toggleBottom = (index: number) => {
    if (bottomIndices.includes(index)) {
      setBottomIndices(prev => prev.filter(i => i !== index));
    } else {
      setBottomIndices(prev => [...prev, index]);
    }
  };

  const putAllOnBottom = () => {
    setBottomIndices(cards.map((_, i) => i));
  };

  const keepAllOnTop = () => {
    setBottomIndices([]);
  };

  const handleConfirmSelection = () => {
    if (topIndices.length <= 1) {
      completeScrySelection(bottomIndices, topIndices);
    } else {
      setPhase('ordering');
      setTopOrder([]);
    }
  };

  const handleClickOrder = (index: number) => {
    if (topOrder.includes(index)) {
      setTopOrder(prev => prev.slice(0, prev.indexOf(index)));
    } else {
      setTopOrder(prev => [...prev, index]);
    }
  };

  const handleConfirmOrder = () => {
    completeScrySelection(bottomIndices, topOrder);
  };

  const handleBackToSelection = () => {
    setPhase('selecting');
    setTopOrder([]);
  };

  if (phase === 'ordering') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 shadow-xl max-w-3xl w-full mx-4">
          <div className="text-white font-semibold mb-2 text-center text-lg">
            {reason} — Order Top Cards
          </div>
          <div className="text-blue-400 text-sm text-center mb-4">
            Click cards in the order you want them on top (first click = topmost)
          </div>

          <div className="flex gap-3 justify-center mb-4">
            {topIndices.map(cardIndex => {
              const card = cards[cardIndex];
              const orderPos = topOrder.indexOf(cardIndex);
              const isOrdered = orderPos !== -1;

              return (
                <button
                  key={cardIndex}
                  onClick={() => handleClickOrder(cardIndex)}
                  className={`rounded-lg p-3 transition text-left border-2 min-w-[140px] relative ${
                    isOrdered
                      ? 'bg-green-900/30 border-green-500 hover:bg-green-900/40'
                      : 'bg-gray-800 border-gray-600 hover:border-blue-400 hover:bg-gray-700'
                  } cursor-pointer`}
                >
                  {isOrdered && (
                    <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                      {orderPos + 1}
                    </div>
                  )}
                  <div className="text-white text-xs font-bold truncate">{card.name}</div>
                  <div className="text-gray-400 text-xs truncate">{(card as any).mana_cost || ''}</div>
                  <div className="text-gray-500 text-xs truncate">
                    {(card as any).type_line?.split(' - ')[0] || ''}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleBackToSelection}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded text-sm font-medium transition"
            >
              Back
            </button>
            <button
              onClick={handleConfirmOrder}
              disabled={topOrder.length !== topIndices.length}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded text-sm font-medium transition"
            >
              Confirm Order ({topOrder.length}/{topIndices.length})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Phase: selecting
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`bg-gray-900 border-2 ${isSurveil ? 'border-purple-500' : 'border-blue-500'} rounded-lg p-6 shadow-xl max-w-3xl w-full mx-4`}>
        <div className="text-white font-semibold mb-2 text-center text-lg">
          {reason} — {mechName} {cards.length}
        </div>
        <div className={`${isSurveil ? 'text-purple-400' : 'text-blue-400'} text-sm text-center mb-4`}>
          Click cards to {destAction}
        </div>

        <div className="flex gap-3 justify-center mb-4">
          {cards.map((card, index) => {
            const isRemoved = bottomIndices.includes(index);
            const removedPos = bottomIndices.indexOf(index);

            return (
              <button
                key={index}
                onClick={() => toggleBottom(index)}
                className={`rounded-lg p-3 transition text-left border-2 min-w-[140px] relative ${
                  isRemoved
                    ? isSurveil
                      ? 'bg-purple-900/30 border-purple-500 hover:bg-purple-900/40'
                      : 'bg-red-900/30 border-red-500 hover:bg-red-900/40'
                    : 'bg-green-900/20 border-green-600 hover:bg-green-900/30'
                } cursor-pointer`}
              >
                {isRemoved && (
                  <div className={`absolute -top-2 -right-2 ${isSurveil ? 'bg-purple-500' : 'bg-red-500'} text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center`}>
                    {removedPos + 1}
                  </div>
                )}
                <div className="text-white text-xs font-bold truncate">{card.name}</div>
                <div className="text-gray-400 text-xs truncate">{(card as any).mana_cost || ''}</div>
                <div className="text-gray-500 text-xs truncate">
                  {(card as any).type_line?.split(' - ')[0] || ''}
                </div>
                <div className={`text-xs mt-1 font-medium ${
                  isRemoved
                    ? isSurveil ? 'text-purple-400' : 'text-red-400'
                    : 'text-green-400'
                }`}>
                  {isRemoved ? destLabel : 'TOP'}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={putAllOnBottom}
            className={`${isSurveil ? 'bg-purple-800/50 hover:bg-purple-800/70 text-purple-300 border-purple-700' : 'bg-red-800/50 hover:bg-red-800/70 text-red-300 border-red-700'} px-3 py-2 rounded text-sm font-medium transition border`}
          >
            {allDestLabel}
          </button>
          <button
            onClick={keepAllOnTop}
            className="bg-green-800/50 hover:bg-green-800/70 text-green-300 px-3 py-2 rounded text-sm font-medium transition border border-green-700"
          >
            All Top
          </button>
          <button
            onClick={handleConfirmSelection}
            className={`${isSurveil ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-6 py-2 rounded text-sm font-medium transition`}
          >
            {topIndices.length > 1 ? 'Next — Order Top Cards' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScrySelector;
