import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const SuspendCastPrompt: FC = () => {
  const { suspendCastPending, acceptSuspendCast, declineSuspendCast } = usePuzzle();

  if (!suspendCastPending) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 shadow-xl max-w-sm">
        <div className="text-white font-semibold mb-2 text-center">
          {suspendCastPending.card.name}
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          Suspend complete! Cast this spell without paying its mana cost?
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptSuspendCast}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-semibold transition"
          >
            Cast
          </button>
          <button
            onClick={declineSuspendCast}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuspendCastPrompt;
