import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const ChannelControl: FC = () => {
  const { channelActive, useChannel, deactivateChannel, gameState } = usePuzzle();

  if (!channelActive) return null;

  const playerLife = gameState?.players?.you?.life || 0;
  const canUse = playerLife >= 1;

  return (
    <div className="fixed bottom-4 right-4 bg-green-900 border-2 border-green-500 rounded-lg p-4 shadow-xl z-50">
      <div className="flex items-center gap-3">
        <div className="text-green-300 font-semibold">Channel Active</div>
        <button
          onClick={useChannel}
          disabled={!canUse}
          className={`px-4 py-2 rounded font-bold transition ${
            canUse
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          Pay 1 Life → Add {'{C}'}
        </button>
        <button
          onClick={deactivateChannel}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
        >
          Close
        </button>
      </div>
      <div className="text-xs text-green-400 mt-2">
        Life: {playerLife} | You may pay life to add colorless mana this turn
      </div>
    </div>
  );
};

export default ChannelControl;
