import { FC, useState } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const MultikickerSelector: FC = () => {
  const { multikickerState, confirmMultikicker, cancelMultikicker } = usePuzzle();
  const [kickCount, setKickCount] = useState(0);

  if (!multikickerState) return null;

  const { card, kickCostStr, maxKicks, mode } = multikickerState;
  const isReplicate = mode === 'replicate';
  const isSquad = mode === 'squad';
  const label = isSquad ? 'Squad' : isReplicate ? 'Replicate' : 'Multikicker';
  const borderClass = isSquad ? 'border-sky-500' : isReplicate ? 'border-violet-500' : 'border-yellow-500';
  const textClass = isSquad ? 'text-sky-400' : isReplicate ? 'text-violet-400' : 'text-yellow-400';
  const btnClass = isSquad ? 'bg-sky-600 hover:bg-sky-700' : isReplicate ? 'bg-violet-600 hover:bg-violet-700' : 'bg-yellow-600 hover:bg-yellow-700';
  const selectedClass = isSquad ? 'bg-sky-600' : isReplicate ? 'bg-violet-600' : 'bg-yellow-600';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`bg-gray-900 border-2 ${borderClass} rounded-lg p-6 shadow-xl max-w-md`}>
        <div className="text-white font-semibold mb-2 text-center">
          Cast {card.name}
        </div>
        <div className={`${textClass} text-sm text-center mb-4`}>
          {label} {kickCostStr} — choose how many {isSquad ? 'tokens to create' : isReplicate ? 'times to replicate' : 'times to kick'}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setKickCount(Math.max(0, kickCount - 1))}
              disabled={kickCount <= 0}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              -
            </button>
            <div className="text-4xl font-bold text-white w-16 text-center">
              {kickCount}
            </div>
            <button
              onClick={() => setKickCount(Math.min(maxKicks, kickCount + 1))}
              disabled={kickCount >= maxKicks}
              className="w-10 h-10 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg font-bold text-xl transition"
            >
              +
            </button>
          </div>

          {/* Quick select buttons */}
          <div className="flex justify-center gap-2 flex-wrap">
            {[0, 1, 2, 3, 4, 5].filter(x => x <= maxKicks).map(x => (
              <button
                key={x}
                onClick={() => setKickCount(x)}
                className={`w-8 h-8 rounded font-bold text-sm transition ${
                  kickCount === x
                    ? selectedClass + ' text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                {x}
              </button>
            ))}
            {maxKicks > 5 && (
              <button
                onClick={() => setKickCount(maxKicks)}
                className={`px-3 h-8 rounded font-bold text-sm transition ${
                  kickCount === maxKicks
                    ? selectedClass + ' text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                Max ({maxKicks})
              </button>
            )}
          </div>

          <div className="text-center text-gray-400 text-sm">
            Extra mana: <span className="text-white font-semibold">{kickCostStr} × {kickCount}</span>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={cancelMultikicker}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={() => confirmMultikicker(kickCount)}
            className={`flex-1 ${btnClass} text-white py-2 rounded font-medium transition`}
          >
            Cast {kickCount > 0 ? `(${isSquad ? 'squad' : isReplicate ? 'replicated' : 'kicked'} ×${kickCount})` : `(no ${isSquad ? 'tokens' : isReplicate ? 'copies' : 'kicks'})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultikickerSelector;
