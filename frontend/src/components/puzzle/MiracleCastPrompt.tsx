import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const MiracleCastPrompt: FC = () => {
  const { miracleCastPending, acceptMiracleCast, declineMiracleCast } = usePuzzle();

  if (!miracleCastPending) return null;

  const { card, cost } = miracleCastPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-cyan-400 rounded-lg p-6 shadow-xl max-w-sm">
        <div className="text-white font-semibold mb-2 text-center">
          {card.name} — Miracle
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          Cast for its miracle cost <span className="text-yellow-400">{cost}</span>, or keep it in hand?
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptMiracleCast}
            className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 px-4 rounded font-semibold transition"
          >
            Cast {cost}
          </button>
          <button
            onClick={declineMiracleCast}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Keep
          </button>
        </div>
      </div>
    </div>
  );
};

export default MiracleCastPrompt;
