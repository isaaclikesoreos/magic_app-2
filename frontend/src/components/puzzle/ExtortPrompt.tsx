import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ExtortPrompt: FC = () => {
  const { extortState, payExtort, declineExtort } = usePuzzle();

  if (!extortState) return null;

  const { sourceName, canPayWhite, canPayBlack } = extortState;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-2 text-center">
          {sourceName} — Extort
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          You may pay <span className="text-yellow-400">{'{W/B}'}</span> to drain 1 life from your opponent.
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => payExtort('W')}
            disabled={!canPayWhite}
            className={`flex-1 py-2 px-4 rounded font-semibold transition ${
              canPayWhite
                ? 'bg-yellow-100 hover:bg-yellow-200 text-gray-900'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Pay {'{W}'}
          </button>
          <button
            onClick={() => payExtort('B')}
            disabled={!canPayBlack}
            className={`flex-1 py-2 px-4 rounded font-semibold transition ${
              canPayBlack
                ? 'bg-gray-800 hover:bg-gray-700 text-purple-300 border border-purple-500'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Pay {'{B}'}
          </button>
          <button
            onClick={declineExtort}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtortPrompt;
