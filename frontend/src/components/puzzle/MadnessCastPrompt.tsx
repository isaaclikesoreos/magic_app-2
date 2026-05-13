import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const MadnessCastPrompt: FC = () => {
  const { madnessCastPending, acceptMadnessCast, declineMadnessCast } = usePuzzle();

  if (!madnessCastPending) return null;

  const cost = (madnessCastPending as any)._madnessCost as string | undefined;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-orange-500 rounded-lg p-6 shadow-xl max-w-sm">
        <div className="text-white font-semibold mb-2 text-center">
          {madnessCastPending.name} — Madness
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          Cast for its madness cost {cost ? <span className="text-yellow-400">{cost}</span> : null}, or put it into your graveyard?
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptMadnessCast}
            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded font-semibold transition"
          >
            Cast {cost || ''}
          </button>
          <button
            onClick={declineMadnessCast}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Graveyard
          </button>
        </div>
      </div>
    </div>
  );
};

export default MadnessCastPrompt;
