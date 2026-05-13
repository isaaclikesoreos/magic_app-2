import { FC } from 'react';
import { usePuzzle } from '../../context/PuzzleContext';

const OptionalTriggerPrompt: FC = () => {
  const { optionalTriggerPromptState, acceptOptionalTrigger, declineOptionalTrigger } = usePuzzle();

  if (!optionalTriggerPromptState) return null;

  const { sourceName, description } = optionalTriggerPromptState;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-6 shadow-xl max-w-md">
        <div className="text-white font-semibold mb-2 text-center text-lg">
          {sourceName}
        </div>
        <div className="text-amber-200 text-sm mb-4 text-center">
          {description || 'Optional trigger — apply effect?'}
        </div>
        <div className="flex gap-3">
          <button
            onClick={acceptOptionalTrigger}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded"
          >
            Yes
          </button>
          <button
            onClick={declineOptionalTrigger}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default OptionalTriggerPrompt;
