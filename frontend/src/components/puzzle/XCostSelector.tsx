import { FC, useState, useRef } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const XCostSelector: FC = () => {
  const { xCostState, confirmXCost, cancelXCostSelection } = usePuzzle();
  const [selectedX, setSelectedX] = useState(0);
  const prevMinX = useRef(0);

  // When xCostState changes (new spell), reset selectedX to minX
  if (xCostState && (xCostState.minX || 0) !== prevMinX.current) {
    prevMinX.current = xCostState.minX || 0;
    if (selectedX < (xCostState.minX || 0)) {
      setSelectedX(xCostState.minX || 0);
    }
  }

  if (!xCostState) return null;

  const { card, maxX, minX: rawMinX } = xCostState;
  const minX = rawMinX || 0;

  // Count X's in the mana cost to calculate total cost
  const manaCost = card.mana_cost || '';
  const xCount = (manaCost.match(/{X}/g) || []).length;
  const totalCostForX = selectedX * xCount;

  // Check if this is Walking Ballista (enters with X counters)
  const isBallista = card.name?.toLowerCase().includes('ballista');

  const handleConfirm = () => {
    confirmXCost(selectedX);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-2 text-center">
          Cast {card.name}
        </div>
        <div className="text-blue-400 text-sm text-center mb-4">
          Choose a value for X
        </div>

        {/* X value slider/selector */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setSelectedX(Math.max(minX, selectedX - 1))}
              disabled={selectedX <= minX}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              -
            </button>
            <div className="text-4xl font-bold text-white w-16 text-center">
              {selectedX}
            </div>
            <button
              onClick={() => setSelectedX(Math.min(maxX, selectedX + 1))}
              disabled={selectedX >= maxX}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              +
            </button>
          </div>

          {/* Quick select buttons */}
          <div className="flex justify-center gap-2 flex-wrap">
            {[0, 1, 2, 3, 4, 5].filter(x => x >= minX && x <= maxX).map(x => (
              <button
                key={x}
                onClick={() => setSelectedX(x)}
                className={`w-8 h-8 rounded font-bold text-sm transition ${
                  selectedX === x
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {x}
              </button>
            ))}
            {maxX > 5 && (
              <button
                onClick={() => setSelectedX(maxX)}
                className={`px-3 h-8 rounded font-bold text-sm transition ${
                  selectedX === maxX
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                Max ({maxX})
              </button>
            )}
          </div>

          {/* Cost display */}
          <div className="text-center space-y-1">
            <div className="text-gray-400 text-sm">
              Total mana cost: <span className="text-white font-semibold">{totalCostForX}</span>
            </div>
            {isBallista && (
              <div className="text-green-400 text-sm">
                Enters with <span className="font-semibold">{selectedX}</span> +1/+1 counter{selectedX !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={cancelXCostSelection}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium transition"
          >
            Cast (X={selectedX})
          </button>
        </div>
      </div>
    </div>
  );
};

export default XCostSelector;
