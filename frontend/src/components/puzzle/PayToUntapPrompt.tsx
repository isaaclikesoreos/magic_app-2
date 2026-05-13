import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const PayToUntapPrompt: FC = () => {
  const { payToUntapState, acceptPayToUntap, declinePayToUntap } = usePuzzle();

  if (!payToUntapState) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-6 shadow-xl max-w-sm">
        <div className="text-white font-semibold mb-2 text-center">
          {payToUntapState.sourceCard?.name}
        </div>
        <div className="text-gray-300 text-sm mb-4 text-center">
          Pay {`{${payToUntapState.manaCost}}`} to untap?
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptPayToUntap}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded font-semibold transition"
          >
            Pay {`{${payToUntapState.manaCost}}`}
          </button>
          <button
            onClick={declinePayToUntap}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded font-semibold transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayToUntapPrompt;
