import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const EndurePrompt: FC = () => {
  const { endurePromptState, acceptEndure, declineEndure } = usePuzzle();

  if (!endurePromptState) return null;

  const { sourceCard, manaCost, value } = endurePromptState;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-6 shadow-xl max-w-sm">
        <div className="text-white font-semibold mb-2 text-center">
          {sourceCard?.name}
        </div>
        <div className="text-gray-300 text-sm mb-2 text-center">
          Pay {manaCost} to endure {value}?
        </div>
        <div className="text-gray-500 text-xs mb-4 text-center">
          (Put {value} +1/+1 counter{value !== 1 ? 's' : ''} on it or create a {value}/{value} Spirit token)
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptEndure}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded font-semibold transition"
          >
            Pay {manaCost}
          </button>
          <button
            onClick={declineEndure}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

export default EndurePrompt;
